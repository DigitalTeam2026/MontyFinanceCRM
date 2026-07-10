// server/deleteRules.js
// -----------------------------------------------------------------------------
// Local port of the `execute-delete-rules` Supabase Edge Function.
//
// Supabase cloud (and its Deno edge runtime) has been removed; the frontend used
// to POST to `${VITE_SUPABASE_URL}/functions/v1/execute-delete-rules`, which no
// longer exists in the local deployment. This module re-implements the same
// contract against local PostgreSQL via the shared pg Pool.
//
// Responsibilities (mirrors the edge function 1:1):
//   1. Authenticate the caller and enforce delete / bulk_delete privileges.
//   2. Evaluate active `before_delete` Digital Rules for the entity:
//        - block_delete            -> reject
//        - confirm_before_delete   -> require confirmation
//        - update_field / clear_lookup / reopen_related / delete_related /
//          cascade_delete          -> side-effect actions run before the delete
//   3. Soft-delete the primary records via the soft_delete_records RPC (which
//      auto-detects the real PK + soft-delete columns per table).
//   4. Write digital_rule_execution_log rows.
//
// Request  body: { entity, record_ids, confirmed?, dry_run? }
// Response body: same JSON shape the edge function returned, so deleteService.ts
//                needs no shape changes — only its URL/transport.
// -----------------------------------------------------------------------------

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function ident(name) {
  if (typeof name !== "string" || !IDENT_RE.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

const ENTITY_TABLE = {
  accounts: "account",
  contacts: "contact",
  leads: "lead",
  lead: "lead",
  opportunities: "opportunity",
  opportunity: "opportunity",
  tickets: "ticket",
  ticket: "ticket",
  product_family: "product_family",
  product: "product",
};

const ENTITY_PK = {
  accounts: "account_id",
  contacts: "contact_id",
  leads: "lead_id",
  lead: "lead_id",
  opportunities: "opportunity_id",
  opportunity: "opportunity_id",
  tickets: "ticket_id",
  ticket: "ticket_id",
  product_family: "family_id",
  product: "product_id",
};

const PLURAL_TO_LOGICAL = {
  accounts: "account",
  contacts: "contact",
  leads: "lead",
  opportunities: "opportunity",
  tickets: "ticket",
};

function toLogicalName(entity) {
  return PLURAL_TO_LOGICAL[entity] ?? entity;
}

// -----------------------------------------------------------------------------
// Metadata resolution
// -----------------------------------------------------------------------------

const metaCache = new Map(); // entityLogical -> { table, pk }
const colsCache = new Map(); // table -> Set<column_name>

async function resolveEntityMeta(pool, entity) {
  if (ENTITY_TABLE[entity] && ENTITY_PK[entity]) {
    return { table: ENTITY_TABLE[entity], pk: ENTITY_PK[entity] };
  }
  const cached = metaCache.get(entity);
  if (cached) return cached;

  const { rows } = await pool.query(
    `SELECT physical_table_name FROM public.entity_definition WHERE logical_name = $1 LIMIT 1`,
    [entity]
  );
  const table = rows[0]?.physical_table_name || entity;

  // Prefer the table's real single-column PK; fall back to the <table>_id guess.
  let pk = `${table}_id`;
  const { rows: pkRows } = await pool.query(
    `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
        AND kcu.table_schema   = tc.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema    = 'public'
        AND tc.table_name      = $1`,
    [table]
  );
  if (pkRows.length === 1) pk = pkRows[0].column_name;

  const meta = { table, pk };
  metaCache.set(entity, meta);
  return meta;
}

async function tableColumns(pool, table) {
  const cached = colsCache.get(table);
  if (cached) return cached;
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  const set = new Set(rows.map((r) => r.column_name));
  colsCache.set(table, set);
  return set;
}

// A "currently-live row" predicate for the table, tolerant of whichever
// soft-delete column it actually has (the schema standardised on deleted_at,
// but some tables still carry is_deleted / neither).
async function liveRowPredicate(pool, table) {
  const cols = await tableColumns(pool, table);
  if (cols.has("deleted_at")) return `${ident(table)}."deleted_at" IS NULL`;
  if (cols.has("is_deleted")) return `${ident(table)}."is_deleted" = false`;
  return "TRUE";
}

// -----------------------------------------------------------------------------
// Soft delete (delegates to the SECURITY DEFINER RPC)
// -----------------------------------------------------------------------------

async function softDelete(pool, table, recordIds, actorId, matchCol = null) {
  const { rows } = await pool.query(
    `SELECT public.soft_delete_records($1::text, $2::text[], $3::uuid, $4::text) AS n`,
    [table, recordIds, actorId, matchCol]
  );
  return rows[0]?.n ?? 0;
}

// -----------------------------------------------------------------------------
// Condition evaluation
// -----------------------------------------------------------------------------

async function evaluateConditions(pool, conditions, record, recordId) {
  for (const cond of conditions) {
    switch (cond.condition_type) {
      case "lookup_not_null": {
        const val = record[cond.source_field ?? ""];
        if (!val) return false;
        break;
      }
      case "related_record_exists": {
        if (!cond.target_entity || !cond.target_field || !cond.source_field) return false;
        const sourceVal = record[cond.source_field] ?? recordId;
        const targetMeta = await resolveEntityMeta(pool, cond.target_entity);
        const livePred = await liveRowPredicate(pool, targetMeta.table);
        const { rows } = await pool.query(
          `SELECT count(*)::int AS c FROM public.${ident(targetMeta.table)}
            WHERE ${ident(cond.target_field)} = $1 AND ${livePred}`,
          [sourceVal]
        );
        if (!rows[0] || rows[0].c === 0) return false;
        break;
      }
      case "field_equals": {
        const val = String(record[cond.source_field ?? ""] ?? "");
        if (val !== (cond.value ?? "")) return false;
        break;
      }
      case "status_equals": {
        const val = String(record[cond.source_field ?? "state_code"] ?? "");
        if (val !== (cond.value ?? "")) return false;
        break;
      }
      case "custom":
        break;
      default:
        return false;
    }
  }
  return true;
}

// -----------------------------------------------------------------------------
// Action execution
// -----------------------------------------------------------------------------

async function executeAction(pool, action, sourceTable, sourcePk, recordId, actorId) {
  const { rows: recRows } = await pool.query(
    `SELECT * FROM public.${ident(sourceTable)} WHERE ${ident(sourcePk)} = $1 LIMIT 1`,
    [recordId]
  );
  const record = recRows[0];
  if (!record) return;

  switch (action.action_type) {
    case "update_field": {
      if (!action.target_entity || !action.target_field) return;
      const meta = await resolveEntityMeta(pool, action.target_entity);
      const linkedId = record[action.source_field ?? ""];
      if (!linkedId) return;

      let parsed = action.field_value;
      if (parsed === "true") parsed = true;
      else if (parsed === "false") parsed = false;
      else if (parsed != null && parsed !== "" && !isNaN(Number(parsed))) parsed = Number(parsed);

      await pool.query(
        `UPDATE public.${ident(meta.table)} SET ${ident(action.target_field)} = $1 WHERE ${ident(meta.pk)} = $2`,
        [parsed, linkedId]
      );
      break;
    }

    case "clear_lookup": {
      if (!action.target_entity || !action.target_field) return;
      const meta = await resolveEntityMeta(pool, action.target_entity);
      const linkedId = record[action.source_field ?? ""];
      if (!linkedId) return;
      await pool.query(
        `UPDATE public.${ident(meta.table)} SET ${ident(action.target_field)} = NULL WHERE ${ident(meta.pk)} = $1`,
        [linkedId]
      );
      break;
    }

    case "reopen_related": {
      if (!action.target_entity) return;
      const meta = await resolveEntityMeta(pool, action.target_entity);
      const linkedId = record[action.source_field ?? ""];
      if (!linkedId) return;
      await pool.query(
        `UPDATE public.${ident(meta.table)} SET "state_code" = 1, "status_reason" = 1 WHERE ${ident(meta.pk)} = $1`,
        [linkedId]
      );
      break;
    }

    case "delete_related":
    case "cascade_delete": {
      if (!action.target_entity || !action.target_field) return;
      const meta = await resolveEntityMeta(pool, action.target_entity);
      const sourceVal = record[action.source_field ?? sourcePk] ?? recordId;
      await softDelete(pool, meta.table, [String(sourceVal)], actorId, action.target_field);
      break;
    }

    case "confirm_before_delete":
    case "block_delete":
      // Handled before execution.
      break;

    default:
      break;
  }
}

// -----------------------------------------------------------------------------
// Main entry point
// -----------------------------------------------------------------------------

// Returns { status, body }. Never throws for expected (4xx) conditions; unexpected
// failures throw and are turned into a 500 by the caller.
async function executeDeleteRules(pool, body, actorId) {
  const { entity, record_ids, confirmed = false, dry_run = false } = body || {};

  if (!actorId) {
    return { status: 401, body: { error: "Unauthorized" } };
  }
  if (!entity || !Array.isArray(record_ids) || record_ids.length === 0) {
    return { status: 400, body: { error: "entity and record_ids are required" } };
  }

  const entityLogical = toLogicalName(entity);

  // --- 1. Authenticate + enforce delete privilege -------------------------
  const { rows: crmRows } = await pool.query(
    `SELECT user_id, is_system_admin FROM public.crm_user
      WHERE user_id = $1 AND is_active = true LIMIT 1`,
    [actorId]
  );
  const crmUser = crmRows[0];
  if (!crmUser) {
    return { status: 403, body: { error: "CRM user not found" } };
  }

  if (!crmUser.is_system_admin) {
    const { rows: roleRows } = await pool.query(
      `SELECT role_id FROM public.user_security_role WHERE user_id = $1`,
      [crmUser.user_id]
    );
    const roleIds = roleRows.map((r) => r.role_id);
    if (roleIds.length === 0) {
      return { status: 403, body: { error: "No security roles assigned — delete denied" } };
    }

    const { rows: privRows } = await pool.query(
      `SELECT can_delete FROM public.role_privilege
        WHERE role_id = ANY($1) AND entity_name = $2`,
      [roleIds, entityLogical]
    );
    if (!privRows.some((p) => p.can_delete)) {
      return { status: 403, body: { error: "Delete is denied for your security role" } };
    }

    if (record_ids.length > 1) {
      const { rows: actionRows } = await pool.query(
        `SELECT is_denied FROM public.action_permission
          WHERE role_id = ANY($1) AND entity_name = $2 AND action_key = 'bulk_delete'`,
        [roleIds, entityLogical]
      );
      if (actionRows.some((p) => p.is_denied)) {
        return { status: 403, body: { error: "Bulk delete is denied for your security role" } };
      }
    }
  }

  const meta = await resolveEntityMeta(pool, entityLogical);
  const { table, pk } = meta;

  // --- 2. Fetch active before_delete rules --------------------------------
  const { rows: rules } = await pool.query(
    `SELECT digital_rule_id, name, entity_logical_name, trigger_event, priority
       FROM public.digital_rule
      WHERE entity_logical_name = $1 AND is_active = true AND deleted_at IS NULL
      ORDER BY priority ASC`,
    [entityLogical]
  );

  if (rules.length === 0) {
    // No rules -> plain soft delete.
    if (dry_run) {
      return { status: 200, body: { requires_confirmation: false, confirmation_messages: [], rules_matched: [] } };
    }
    const n = await softDelete(pool, table, record_ids, actorId);
    return { status: 200, body: { success: true, deleted: n || record_ids.length, errors: 0, actions_executed: [] } };
  }

  const ruleIds = rules.map((r) => r.digital_rule_id);
  const [condResult, actResult] = await Promise.all([
    pool.query(
      `SELECT * FROM public.digital_rule_condition WHERE digital_rule_id = ANY($1) ORDER BY display_order`,
      [ruleIds]
    ),
    pool.query(
      `SELECT * FROM public.digital_rule_action WHERE digital_rule_id = ANY($1) ORDER BY display_order`,
      [ruleIds]
    ),
  ]);

  const condsByRule = new Map();
  for (const c of condResult.rows) {
    const arr = condsByRule.get(c.digital_rule_id) ?? [];
    arr.push(c);
    condsByRule.set(c.digital_rule_id, arr);
  }
  const actsByRule = new Map();
  for (const a of actResult.rows) {
    const arr = actsByRule.get(a.digital_rule_id) ?? [];
    arr.push(a);
    actsByRule.set(a.digital_rule_id, arr);
  }

  const fullRules = rules.map((r) => ({
    ...r,
    conditions: condsByRule.get(r.digital_rule_id) ?? [],
    actions: actsByRule.get(r.digital_rule_id) ?? [],
  }));

  // --- 3. Evaluate rules per record ---------------------------------------
  const allConfirmMessages = [];
  const allBlockMessages = [];
  const pendingActions = [];

  for (const recordId of record_ids) {
    const { rows: recRows } = await pool.query(
      `SELECT * FROM public.${ident(table)} WHERE ${ident(pk)} = $1 LIMIT 1`,
      [recordId]
    );
    const record = recRows[0];
    if (!record) continue;

    for (const rule of fullRules) {
      if (rule.trigger_event !== "before_delete") continue;
      const condsMet = await evaluateConditions(pool, rule.conditions, record, recordId);
      if (!condsMet) continue;

      for (const action of rule.actions) {
        if (action.action_type === "confirm_before_delete") {
          if (action.message && !allConfirmMessages.includes(action.message)) {
            allConfirmMessages.push(action.message);
          }
        } else if (action.action_type === "block_delete") {
          if (action.message && !allBlockMessages.includes(action.message)) {
            allBlockMessages.push(action.message);
          }
        } else {
          pendingActions.push({ ruleId: rule.digital_rule_id, ruleName: rule.name, recordId, action });
        }
      }
    }
  }

  if (allBlockMessages.length > 0) {
    return { status: 200, body: { success: false, blocked: true, block_messages: allBlockMessages } };
  }

  if (allConfirmMessages.length > 0 && !confirmed) {
    return {
      status: 200,
      body: {
        requires_confirmation: true,
        confirmation_messages: allConfirmMessages,
        rules_matched: fullRules.map((r) => r.name),
      },
    };
  }

  if (dry_run) {
    return {
      status: 200,
      body: {
        requires_confirmation: allConfirmMessages.length > 0,
        confirmation_messages: allConfirmMessages,
        rules_matched: fullRules.map((r) => r.name),
        pending_actions: pendingActions.map((p) => ({
          rule: p.ruleName,
          action: p.action.action_type,
          target: p.action.target_entity,
        })),
      },
    };
  }

  // --- 4. Execute side-effect actions -------------------------------------
  const actionsExecuted = [];
  const logs = [];

  for (const pa of pendingActions) {
    const { ruleId, ruleName, recordId, action } = pa;
    try {
      await executeAction(pool, action, table, pk, recordId, actorId);
      const desc = `${action.action_type}: ${action.target_entity ?? entity} ${action.target_field ?? ""}`.trim();
      actionsExecuted.push(desc);
      logs.push({
        digital_rule_id: ruleId,
        rule_name: ruleName,
        entity_logical_name: entityLogical,
        record_id: recordId,
        user_id: actorId,
        action_taken: desc,
        success: true,
        error_message: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logs.push({
        digital_rule_id: ruleId,
        rule_name: ruleName,
        entity_logical_name: entityLogical,
        record_id: recordId,
        user_id: actorId,
        action_taken: `FAILED ${action.action_type}`,
        success: false,
        error_message: msg,
      });
      await writeLogs(pool, logs);
      return {
        status: 500,
        body: { success: false, error: `Rule action failed: ${msg}`, actions_executed: actionsExecuted },
      };
    }
  }

  // --- 5. Soft-delete the primary records ---------------------------------
  let deletedCount;
  try {
    deletedCount = await softDelete(pool, table, record_ids, actorId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push({
      digital_rule_id: "",
      rule_name: "Primary Delete",
      entity_logical_name: entityLogical,
      record_id: record_ids[0],
      user_id: actorId,
      action_taken: "FAILED soft_delete on primary entity",
      success: false,
      error_message: msg,
    });
    await writeLogs(pool, logs);
    throw new Error(`Primary delete failed: ${msg}`);
  }

  for (const rid of record_ids) {
    logs.push({
      digital_rule_id: "",
      rule_name: "Primary Delete",
      entity_logical_name: entityLogical,
      record_id: rid,
      user_id: actorId,
      action_taken: `soft_delete ${entityLogical}`,
      success: true,
      error_message: null,
    });
  }
  await writeLogs(pool, logs);

  return {
    status: 200,
    body: { success: true, deleted: deletedCount || record_ids.length, errors: 0, actions_executed: actionsExecuted },
  };
}

// Best-effort audit logging — never let a logging failure fail the delete.
async function writeLogs(pool, logs) {
  if (!logs.length) return;
  try {
    const cols = [
      "digital_rule_id", "rule_name", "entity_logical_name", "record_id",
      "user_id", "action_taken", "success", "error_message",
    ];
    const values = [];
    const tuples = logs.map((log, i) => {
      const base = i * cols.length;
      cols.forEach((c) => values.push(c === "digital_rule_id" && !log[c] ? null : log[c]));
      return `(${cols.map((_, j) => `$${base + j + 1}`).join(", ")})`;
    });
    await pool.query(
      `INSERT INTO public.digital_rule_execution_log (${cols.map((c) => `"${c}"`).join(", ")})
       VALUES ${tuples.join(", ")}`,
      values
    );
  } catch (err) {
    console.error("digital_rule_execution_log insert failed:", err.message);
  }
}

module.exports = { executeDeleteRules };
