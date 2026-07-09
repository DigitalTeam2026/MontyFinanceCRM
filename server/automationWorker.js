// server/automationWorker.js
// Power Automation — durable queue worker.
//
// Polls automation_job, claims a batch atomically (FOR UPDATE SKIP LOCKED so
// multiple workers/instances never double-process), and runs each rule's ordered
// actions under a system identity. Retries with exponential backoff, then
// dead-letters. Already-succeeded actions are not re-run on retry, so a partial
// failure never re-sends an email (exactly-once side effects).
//
// Adding a new action type = one entry in the ACTIONS registry below. Nothing
// else in the worker changes.

const fs = require("fs");
const path = require("path");
const { sendEmail } = require("./emailTransport");
const { ruleMatches } = require("./ruleMatch");
const {
  resolveTokens, resolveValue, resolveEmailList, dedupeEmails, escapeHtml,
} = require("./tokenResolver");

const POLL_INTERVAL_MS = Number(process.env.AUTOMATION_POLL_MS || 1500);
const CLAIM_BATCH = Number(process.env.AUTOMATION_BATCH || 10);
const MAX_DEPTH = 3;
const BACKOFF_BASE_MS = 15_000;
const BACKOFF_CAP_MS = 10 * 60_000;
const LIST_ROWS_HARD_CAP = Number(process.env.AUTOMATION_LIST_ROWS_CAP || 1000);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveRecipients(pool, config, after) {
  const out = new Set();
  for (const addr of config.to_static || []) {
    if (typeof addr === "string" && addr.includes("@")) out.add(addr.trim());
  }
  for (const field of config.to_fields || []) {
    const val = after ? after[field] : undefined;
    if (typeof val === "string" && val.includes("@")) {
      out.add(val.trim());
    } else if (typeof val === "string" && UUID_RE.test(val)) {
      // A user lookup — resolve to the user's email.
      try {
        const r = await pool.query(
          "select email from crm_user where user_id = $1 limit 1",
          [val]
        );
        if (r.rows[0]?.email) out.add(r.rows[0].email);
      } catch {
        /* ignore lookup failures */
      }
    }
  }
  return [...out];
}

// ── metadata resolution (logical → physical), cached ─────────────────────────

const entityCache = new Map(); // logical_name -> entity_definition row
const fieldCache = new Map(); // entity_definition_id -> { byLogical, physToLogical }

async function getEntity(pool, logical) {
  if (entityCache.has(logical)) return entityCache.get(logical);
  const r = await pool.query(
    `select entity_definition_id, logical_name, physical_table_name, primary_key_column, primary_field_name
       from entity_definition where logical_name = $1 limit 1`,
    [logical]
  );
  const row = r.rows[0] || null;
  entityCache.set(logical, row);
  return row;
}

async function getFields(pool, entityDefId) {
  if (fieldCache.has(entityDefId)) return fieldCache.get(entityDefId);
  const r = await pool.query(
    `select fd.logical_name, fd.physical_column_name, fd.lookup_entity_id, ft.name as type
       from field_definition fd
       left join field_type ft on ft.field_type_id = fd.field_type_id
      where fd.entity_definition_id = $1 and fd.is_active = true and fd.deleted_at is null`,
    [entityDefId]
  );
  const byLogical = new Map();
  const physToLogical = new Map();
  for (const f of r.rows) {
    byLogical.set(f.logical_name, f);
    if (f.physical_column_name) physToLogical.set(f.physical_column_name, f.logical_name);
  }
  const val = { byLogical, physToLogical };
  fieldCache.set(entityDefId, val);
  return val;
}

/** Read a record's current logical values (used to build before/after for chaining). */
async function readRecordLogical(pool, entity, recordId) {
  const { physToLogical } = await getFields(pool, entity.entity_definition_id);
  const r = await pool.query(
    `select * from ${quoteIdent(entity.physical_table_name)} where ${quoteIdent(entity.primary_key_column)} = $1 limit 1`,
    [recordId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const logical = {};
  for (const [phys, val] of Object.entries(row)) {
    logical[physToLogical.get(phys) || phys] = val;
  }
  return logical;
}

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function quoteIdent(name) {
  if (!IDENT_RE.test(String(name))) throw new Error(`unsafe identifier: ${name}`);
  return `"${name}"`;
}

let chainNonce = 0;
/**
 * Loop-protected chaining: after an update_field changes a record, re-evaluate
 * enabled rules for that table and enqueue matching follow-up jobs at depth+1.
 * The processJob depth guard hard-stops runaway loops at depth >= MAX_DEPTH.
 */
async function enqueueChainedJobs(pool, tableLogical, recordId, before, after, depth, createdBy) {
  if (depth + 1 >= MAX_DEPTH) return; // don't even enqueue past the limit
  const rules = (
    await pool.query(
      "select * from automation_rule where table_logical_name = $1 and enabled = true",
      [tableLogical]
    )
  ).rows;
  for (const rule of rules) {
    if (!ruleMatches(rule, "update", before, after)) continue;
    const idem = `${rule.automation_rule_id}:${recordId}:chain-${Date.now()}-${chainNonce++}`;
    await pool
      .query(
        `insert into automation_job
           (rule_id, record_table, record_id, trigger_event, change_snapshot, status, depth, idempotency_key, created_by)
         values ($1,$2,$3,'update',$4,'pending',$5,$6,$7)`,
        [
          rule.automation_rule_id,
          tableLogical,
          recordId,
          JSON.stringify({ before, after, changed_fields: Object.keys(after) }),
          depth + 1,
          idem,
          createdBy,
        ]
      )
      .catch(() => {});
  }
}

// ── action registry ──────────────────────────────────────────────────────────
// Each handler returns an `output` object recorded in the run history, or throws
// to fail the action (which triggers retry/dead-letter for the whole job).

function csvCell(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const ACTIONS = {
  async send_email(ctx) {
    const config = ctx.action.config || {};
    // Server-side config guard (enforcement point; the editor validates too).
    if (!config.subject || !String(config.subject).trim()) {
      throw new Error("send_email config invalid: subject is required");
    }
    // Recipients = legacy static/field list + token-resolved To string.
    const legacy = await resolveRecipients(ctx.pool, config, ctx.after);
    const to = dedupeEmails([...legacy, ...resolveEmailList(config.to, ctx)]);
    const cc = dedupeEmails(resolveEmailList(config.cc, ctx));

    // Zero valid recipients -> skip (not fail). Visible in run history.
    if (to.length === 0 && cc.length === 0) {
      return { __skipped: true, reason: "no recipients", to: [], cc: [] };
    }

    const subject = resolveTokens(config.subject, ctx, false);
    let html = resolveTokens(config.body, ctx, true);

    // Optionally link a document generated earlier in this same job.
    if (config.attach_document) {
      const doc = (
        await ctx.pool.query(
          `select output from automation_job_action_log
            where job_id = $1 and action_type = 'generate_document' and status = 'succeeded'
            order by finished_at desc limit 1`,
          [ctx.job.automation_job_id]
        )
      ).rows[0];
      const url = doc?.output?.document_path;
      if (url) {
        const base = process.env.APP_BASE_URL || "";
        html += `<p><a href="${escapeHtml(base + url)}">Attached document</a></p>`;
      }
    }

    const result = await sendEmail({ to, cc, subject, html });
    return { transport: result.transport, message_id: result.messageId, to, cc, subject };
  },

  async list_rows(ctx) {
    const c = ctx.action.config || {};
    const stepName = c.step_name;
    if (!stepName) throw new Error("list_rows config invalid: step name required");
    const entity = await getEntity(ctx.pool, c.source_table);
    if (!entity) throw new Error(`list_rows: unknown source table ${c.source_table}`);
    const fields = await getFields(ctx.pool, entity.entity_definition_id);

    // Columns (chosen logical names, else all active fields).
    const cols = (Array.isArray(c.columns) && c.columns.length
      ? c.columns.map((l) => ({ logical: l, physical: fields.byLogical.get(l)?.physical_column_name }))
      : [...fields.byLogical.values()].map((f) => ({ logical: f.logical_name, physical: f.physical_column_name }))
    ).filter((x) => x.physical);
    if (cols.length === 0) throw new Error("list_rows: no valid columns");

    // WHERE from AND filters. Values may be tokens — resolved then PARAMETERIZED.
    const where = [];
    const params = [];
    for (const f of c.filters || []) {
      const col = fields.byLogical.get(f.field)?.physical_column_name;
      if (!col) throw new Error(`list_rows: filter field "${f.field}" not found on ${c.source_table}`);
      const cq = quoteIdent(col);
      if (f.operator === "is_empty") { where.push(`(${cq} is null or ${cq}::text = '')`); continue; }
      if (f.operator === "is_not_empty") { where.push(`(${cq} is not null and ${cq}::text <> '')`); continue; }

      const raw = resolveValue(f.value, ctx);
      if (f.operator === "is_any_of") {
        const list = Array.isArray(raw)
          ? raw.map(String)
          : String(raw).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
        if (list.length === 0) { where.push("false"); continue; }
        params.push(list);
        where.push(`${cq}::text = any($${params.length}::text[])`);
      } else if (f.operator === "contains") {
        params.push("%" + String(raw) + "%");
        where.push(`${cq}::text ilike $${params.length}`);
      } else if (f.operator === "not_equals") {
        params.push(raw == null ? "" : String(raw));
        where.push(`${cq}::text <> $${params.length}::text`);
      } else { // equals (default)
        params.push(raw == null ? "" : String(raw));
        where.push(`${cq}::text = $${params.length}::text`);
      }
    }

    const limit = Math.min(Math.max(1, Number(c.limit) || 100), LIST_ROWS_HARD_CAP);
    let sql = `select ${cols.map((x) => quoteIdent(x.physical)).join(", ")} from ${quoteIdent(entity.physical_table_name)}`;
    if (where.length) sql += " where " + where.join(" and ");
    if (c.sort && c.sort.field) {
      const sc = fields.byLogical.get(c.sort.field)?.physical_column_name;
      if (sc) sql += ` order by ${quoteIdent(sc)} ${c.sort.dir === "desc" ? "desc" : "asc"}`;
    }
    params.push(limit);
    sql += ` limit $${params.length}`;

    const res = await ctx.pool.query(sql, params);
    const rows = res.rows.map((r) => {
      const o = {};
      for (const x of cols) o[x.logical] = r[x.physical];
      return o;
    });
    // __step tells processJob to publish this into ctx.steps for later actions.
    return { __step: stepName, step_name: stepName, count: rows.length, columns: cols.map((x) => x.logical), rows };
  },

  async update_field(ctx) {
    const c = ctx.action.config || {};
    if (!c.field) throw new Error("update_field config invalid: field is required");
    const value = resolveValue(c.value, ctx);
    const depth = ctx.job.depth || 0;

    if (c.target === "related") {
      if (!c.related_lookup_field) {
        throw new Error("update_field config invalid: related_lookup_field required");
      }
      const srcEntity = await getEntity(ctx.pool, ctx.job.record_table);
      if (!srcEntity) throw new Error(`unknown table ${ctx.job.record_table}`);
      const srcFields = await getFields(ctx.pool, srcEntity.entity_definition_id);
      const lookup = srcFields.byLogical.get(c.related_lookup_field);
      if (!lookup || !lookup.lookup_entity_id) {
        throw new Error(`${c.related_lookup_field} is not a lookup field`);
      }
      const relatedId = ctx.after ? ctx.after[c.related_lookup_field] : null;
      if (!relatedId) return { target: "related", skipped: "lookup empty", field: c.field };

      const relEnt = (
        await ctx.pool.query(
          `select entity_definition_id, logical_name, physical_table_name, primary_key_column
             from entity_definition where entity_definition_id = $1`,
          [lookup.lookup_entity_id]
        )
      ).rows[0];
      if (!relEnt) throw new Error("related entity not found");
      const relFields = await getFields(ctx.pool, relEnt.entity_definition_id);
      const targetCol = relFields.byLogical.get(c.field)?.physical_column_name;
      if (!targetCol) throw new Error(`field ${c.field} not found on ${relEnt.logical_name}`);

      const beforeLogical = (await readRecordLogical(ctx.pool, relEnt, relatedId)) || {};
      await ctx.pool.query(
        `update ${quoteIdent(relEnt.physical_table_name)} set ${quoteIdent(targetCol)} = $1
          where ${quoteIdent(relEnt.primary_key_column)} = $2`,
        [value, relatedId]
      );
      const afterLogical = { ...beforeLogical, [c.field]: value };
      await enqueueChainedJobs(ctx.pool, relEnt.logical_name, relatedId, beforeLogical, afterLogical, depth, ctx.job.created_by);
      return { target: "related", related_entity: relEnt.logical_name, related_id: relatedId, field: c.field, value };
    }

    // target === 'record'
    const entity = await getEntity(ctx.pool, ctx.job.record_table);
    if (!entity) throw new Error(`unknown table ${ctx.job.record_table}`);
    const fields = await getFields(ctx.pool, entity.entity_definition_id);
    const targetCol = fields.byLogical.get(c.field)?.physical_column_name;
    if (!targetCol) throw new Error(`field ${c.field} not found on ${ctx.job.record_table}`);

    await ctx.pool.query(
      `update ${quoteIdent(entity.physical_table_name)} set ${quoteIdent(targetCol)} = $1
        where ${quoteIdent(entity.primary_key_column)} = $2`,
      [value, ctx.job.record_id]
    );
    const base = ctx.after || {};
    await enqueueChainedJobs(ctx.pool, ctx.job.record_table, ctx.job.record_id, base, { ...base, [c.field]: value }, depth, ctx.job.created_by);
    return { target: "record", field: c.field, value };
  },

  async generate_document(ctx) {
    const c = ctx.action.config || {};
    const format = c.format === "xlsx" ? "xlsx" : "csv";
    const entity = await getEntity(ctx.pool, c.entity || ctx.job.record_table);
    if (!entity) throw new Error("unknown table for document");
    const fields = await getFields(ctx.pool, entity.entity_definition_id);

    // Columns: explicit config.columns (logical names), else all active fields.
    const cols = (Array.isArray(c.columns) && c.columns.length
      ? c.columns.map((l) => ({ logical: l, physical: fields.byLogical.get(l)?.physical_column_name }))
      : [...fields.byLogical.values()].map((f) => ({ logical: f.logical_name, physical: f.physical_column_name }))
    ).filter((x) => x.physical);
    if (cols.length === 0) throw new Error("no exportable columns");

    const scope = c.scope === "all" ? "all" : "record";
    const selectList = cols.map((x) => quoteIdent(x.physical)).join(", ");
    const rows = scope === "record"
      ? (await ctx.pool.query(
          `select ${selectList} from ${quoteIdent(entity.physical_table_name)} where ${quoteIdent(entity.primary_key_column)} = $1`,
          [ctx.job.record_id]
        )).rows
      : (await ctx.pool.query(`select ${selectList} from ${quoteIdent(entity.physical_table_name)} limit 5000`)).rows;

    const headers = cols.map((x) => x.logical);
    const rawName = resolveTokens(c.filename || "export", ctx, false) || "export";
    const safeBase = (String(rawName).replace(/[^\w.-]+/g, "_").slice(0, 80)) || "export";
    const dir = path.join(__dirname, "storage", "documents");
    fs.mkdirSync(dir, { recursive: true });
    const fname = `${safeBase}-${Date.now()}.${format}`;
    const full = path.join(dir, fname);

    if (format === "xlsx") {
      const XLSX = require("xlsx"); // resolves from repo-root node_modules (no new dep)
      const aoa = [headers, ...rows.map((r) => cols.map((x) => r[x.physical]))];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Export");
      XLSX.writeFile(wb, full);
    } else {
      const csv = [headers.map(csvCell).join(","), ...rows.map((r) => cols.map((x) => csvCell(r[x.physical])).join(","))].join("\r\n");
      fs.writeFileSync(full, csv, "utf8");
    }
    return { document_path: `/storage/documents/${fname}`, format, row_count: rows.length };
  },
};

// ── core ─────────────────────────────────────────────────────────────────────

async function claimJobs(pool) {
  const { rows } = await pool.query(
    `WITH claimable AS (
       SELECT automation_job_id
         FROM automation_job
        WHERE status IN ('pending','failed')
          AND next_attempt_at <= now()
        ORDER BY queued_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE automation_job j
        SET status = 'running', started_at = now(), attempts = attempts + 1
       FROM claimable c
      WHERE j.automation_job_id = c.automation_job_id
      RETURNING j.*`,
    [CLAIM_BATCH]
  );
  return rows;
}

function recordUrlFor(table, id) {
  const base = process.env.APP_BASE_URL || "";
  return `${base}/#/${table}/${id}`;
}

async function markJob(pool, id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await pool.query(
    `UPDATE automation_job SET ${sets} WHERE automation_job_id = $1`,
    [id, ...keys.map((k) => fields[k])]
  );
}

async function processJob(pool, job, opts = {}) {
  // Loop protection.
  if ((job.depth || 0) >= MAX_DEPTH) {
    await markJob(pool, job.automation_job_id, {
      status: "skipped",
      finished_at: new Date(),
      error: "possible automation loop (depth >= 3)",
    });
    return;
  }

  const rule = (
    await pool.query(
      "select * from automation_rule where automation_rule_id = $1",
      [job.rule_id]
    )
  ).rows[0];
  if (!rule) {
    await markJob(pool, job.automation_job_id, {
      status: "skipped",
      finished_at: new Date(),
      error: "rule no longer exists",
    });
    return;
  }

  const actions = (
    await pool.query(
      "select * from automation_rule_action where rule_id = $1 order by sort_order asc",
      [job.rule_id]
    )
  ).rows;

  // Actions already completed on a previous attempt — don't re-run them. Load
  // their outputs too so step outputs survive a retry (a list_rows that ran on
  // attempt 1 must still be referenceable by a send_email that failed).
  const doneRows = (
    await pool.query(
      "select action_id, action_type, output from automation_job_action_log where job_id = $1 and status = 'succeeded'",
      [job.automation_job_id]
    )
  ).rows;
  const done = new Set(doneRows.map((r) => r.action_id));

  const after = job.change_snapshot?.after || {};
  const ctx = {
    pool,
    job,
    rule,
    after,
    recordUrl: recordUrlFor(job.record_table, job.record_id),
    count: opts.batchCount || 1,
    steps: {}, // { <step_name>: { count, columns, rows } } — for {{steps.*}} tokens
  };
  // Rehydrate step outputs from already-succeeded list_rows logs.
  for (const d of doneRows) {
    if (d.action_type === "list_rows" && d.output && d.output.step_name) {
      ctx.steps[d.output.step_name] = {
        count: d.output.count,
        columns: d.output.columns,
        rows: d.output.rows || [],
      };
    }
  }

  try {
    for (const action of actions) {
      if (done.has(action.automation_rule_action_id)) continue;

      const handler = ACTIONS[action.action_type];
      const started = new Date();

      if (!handler) {
        await pool.query(
          `insert into automation_job_action_log
             (job_id, action_id, action_type, sort_order, status, error, started_at, finished_at)
           values ($1,$2,$3,$4,'skipped',$5,$6, now())`,
          [
            job.automation_job_id,
            action.automation_rule_action_id,
            action.action_type,
            action.sort_order,
            `action type "${action.action_type}" not implemented yet`,
            started,
          ]
        );
        continue;
      }

      try {
        const output = await handler({ ...ctx, action });

        // A handler may opt to SKIP (not fail) — e.g. send_email with no
        // recipients. Recorded as 'skipped'; the job continues + can succeed.
        if (output && output.__skipped) {
          await pool.query(
            `insert into automation_job_action_log
               (job_id, action_id, action_type, sort_order, status, error, output, started_at, finished_at)
             values ($1,$2,$3,$4,'skipped',$5,$6,$7, now())`,
            [
              job.automation_job_id,
              action.automation_rule_action_id,
              action.action_type,
              action.sort_order,
              output.reason || "skipped",
              output,
              started,
            ]
          );
          continue;
        }

        // Publish a list_rows step output for later actions in this rule.
        if (output && output.__step) {
          ctx.steps[output.__step] = { count: output.count, columns: output.columns, rows: output.rows };
        }

        await pool.query(
          `insert into automation_job_action_log
             (job_id, action_id, action_type, sort_order, status, output, started_at, finished_at)
           values ($1,$2,$3,$4,'succeeded',$5,$6, now())`,
          [
            job.automation_job_id,
            action.automation_rule_action_id,
            action.action_type,
            action.sort_order,
            output || {},
            started,
          ]
        );
      } catch (actErr) {
        await pool.query(
          `insert into automation_job_action_log
             (job_id, action_id, action_type, sort_order, status, error, started_at, finished_at)
           values ($1,$2,$3,$4,'failed',$5,$6, now())`,
          [
            job.automation_job_id,
            action.automation_rule_action_id,
            action.action_type,
            action.sort_order,
            String(actErr.message || actErr).slice(0, 1000),
            started,
          ]
        );
        throw actErr; // abort remaining actions; retry resumes here.
      }
    }

    // All actions done.
    await markJob(pool, job.automation_job_id, {
      status: "succeeded",
      finished_at: new Date(),
      error: null,
    });
    await pool.query(
      "update automation_rule set last_run_at = now() where automation_rule_id = $1",
      [job.rule_id]
    );
  } catch (err) {
    const attempts = job.attempts; // already incremented at claim time
    const max = job.max_attempts || 3;
    const msg = String(err.message || err).slice(0, 1000);

    if (attempts >= max) {
      await markJob(pool, job.automation_job_id, {
        status: "dead",
        finished_at: new Date(),
        error: msg,
      });
      await pool.query(
        "update automation_rule set error_count = error_count + 1, last_run_at = now() where automation_rule_id = $1",
        [job.rule_id]
      );
    } else {
      const backoff = Math.min(
        BACKOFF_BASE_MS * Math.pow(2, attempts - 1),
        BACKOFF_CAP_MS
      );
      await markJob(pool, job.automation_job_id, {
        status: "failed",
        error: msg,
        next_attempt_at: new Date(Date.now() + backoff),
      });
    }
  }
}

let running = false;
async function tick(pool) {
  if (running) return; // no overlapping ticks
  running = true;
  try {
    const jobs = await claimJobs(pool);
    if (jobs.length === 0) return;

    // Batching: for rules with a batch window, coalesce this tick's claimed jobs
    // (plus any still-pending siblings) into ONE run with {{count}} = total. This
    // is what stops a 10k-row import from sending 10k emails.
    const ruleIds = [...new Set(jobs.map((j) => j.rule_id).filter(Boolean))];
    const winRows = ruleIds.length
      ? (await pool.query(
          "select automation_rule_id, batch_window_seconds from automation_rule where automation_rule_id = any($1)",
          [ruleIds]
        )).rows
      : [];
    const batchWin = new Map(winRows.map((r) => [r.automation_rule_id, r.batch_window_seconds]));

    const groups = new Map();
    const singles = [];
    for (const j of jobs) {
      const w = batchWin.get(j.rule_id);
      if (w && w > 0) {
        const arr = groups.get(j.rule_id) || [];
        arr.push(j);
        groups.set(j.rule_id, arr);
      } else {
        singles.push(j);
      }
    }

    for (const job of singles) await processJob(pool, job);

    for (const [ruleId, gjobs] of groups) {
      const rep = gjobs[0];
      // Absorb the rest of this tick's claimed jobs + any pending siblings.
      const pend = (await pool.query(
        "update automation_job set status='skipped', finished_at=now(), error='batched' where rule_id=$1 and status='pending' returning automation_job_id",
        [ruleId]
      )).rows;
      for (const o of gjobs.slice(1)) {
        await markJob(pool, o.automation_job_id, { status: "skipped", finished_at: new Date(), error: "batched" });
      }
      await processJob(pool, rep, { batchCount: gjobs.length + pend.length });
    }
  } catch (e) {
    console.error("[automation.worker] tick error:", e.message);
  } finally {
    running = false;
  }
}

/**
 * Start the polling worker. Returns a stop() function.
 * @param {import('pg').Pool} pool
 */
function startAutomationWorker(pool) {
  console.log(
    `[automation.worker] started (poll ${POLL_INTERVAL_MS}ms, batch ${CLAIM_BATCH})`
  );
  const handle = setInterval(() => {
    void tick(pool);
  }, POLL_INTERVAL_MS);
  handle.unref?.(); // don't keep the process alive solely for the poller
  return () => clearInterval(handle);
}

module.exports = {
  startAutomationWorker,
  // exported for tests
  resolveTokens,
  escapeHtml,
  resolveRecipients,
  ACTIONS,
};
