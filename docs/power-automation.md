# Power Automation — Automation Rules Engine

No-code, no-SQL automation configured from **Admin Studio → Power Automation**.

> **WHEN** a record in *[table]* is created/updated and *[field]* changes to *[value]*
> **THEN** run one or more ordered *[actions]*.

This replaces the removed Workflows feature. It is designed for **no lost events**
and **exactly-once side effects**.

## Architecture

```
Browser (CRM app)                      Node API (server/index.js)
  saveRecord()  ── before + after ──►  generic /api/:table proxy ──► Postgres
     │  detect + match (in-process)                                    ▲
     │  enqueue automation_job row  ─────────────────────────────────► │
     │                                                                 │
                                       Automation worker (poll loop) ──┘
                                         claim jobs (FOR UPDATE SKIP LOCKED)
                                         run ordered actions (send_email, …)
                                         retry w/ backoff → dead-letter
```

- **Detection** happens in `src/app/services/recordService.ts` (`saveRecord`), where a
  record's *before* and *after* values both exist. It calls
  `dispatchAutomationForEvent()` (`src/app/services/automation/dispatch.ts`), which
  matches enabled rules for the table **in memory** (30s cache, invalidated on edit)
  and enqueues a durable `automation_job` per match. It **never** runs actions inline
  and never throws into the save path.
- **Matching** is pure and unit-tested: `src/app/services/automation/ruleMatch.ts`.
  `changes_to` fires only on the **transition into** the value
  (`before ≠ v AND after = v`); a create is treated as `before = null`.
- **Execution** is server-side: `server/automationWorker.js` polls `automation_job`,
  claims a batch atomically with `FOR UPDATE SKIP LOCKED` (safe across multiple
  instances), and runs each rule's actions in order. Latency ≈ the poll interval
  (default 1.5s).

Why not DB triggers? The product owns its schema/migrations, and DB triggers would
bypass application logic, RLS context, and audit. Detection lives in the app layer.

## Data model

| Table | Purpose |
|---|---|
| `automation_rule` | trigger (table, field, operator, value), conditions, `enabled` |
| `automation_rule_action` | ordered actions (`send_email` \| `update_field` \| `generate_document`), `config` jsonb |
| `automation_job` | queue: status, attempts, `idempotency_key` (unique), `depth`, backoff |
| `automation_job_action_log` | per-action result → drives the Run history tab |

Migrations: `supabase/migrations/20260708130000_power_automation_engine.sql` (+ demo
rule `…140000…`). Apply to the **local** DB with
`node scripts/apply_local_migration.mjs <file.sql>` (the other `scripts/*.mjs`
helpers target the legacy Supabase cloud project and are **not** the live DB).

## Reliability

- **Exactly-once:** idempotency key = `rule_id:record_id:changeVersion` (a unique
  constraint drops duplicate enqueues of the same save). Already-succeeded actions
  are recorded in `automation_job_action_log` and **skipped on retry**, so a partial
  failure never re-sends an email.
- **Retries:** attempts increment at claim time; on failure the job is re-scheduled
  with exponential backoff (`15s · 2^(n-1)`, capped 10m) until `max_attempts` (3),
  then **dead-lettered** (`status = 'dead'`) with the error shown in Run history and
  an error badge in the rules list.
- **Loop protection:** jobs carry a `depth`; at `depth ≥ 3` the job is skipped with
  a "possible automation loop" error (relevant once `update_field` can re-trigger).

## Automation identity & permissions

- Actions run under a **system/service identity** (`rule.run_as = 'system'`), not as
  the user who saved the record. The worker connects with the server's Postgres role.
  Reads/writes it performs are whatever that role allows — document and scope this
  role in your deployment if you tighten DB permissions.
- Managing rules is gated by the capability privilege `__manage_automation_rules__`
  (helper `security.can_manage_automation_rules()`), seeded on the System
  Administrator role. Admin Studio does not yet gate modules in the UI (no module is
  gated today); the privilege exists for server-side enforcement.

## Email transport

`server/emailTransport.js` exposes a single `sendEmail({to, subject, html})`:

1. **edge-fn** — POSTs to the Microsoft Graph `send-email` function when
   `SEND_EMAIL_FN_URL` (and optional `SEND_EMAIL_FN_TOKEN`) is set.
2. **stub** (default) — logs the message and records it in Run history
   (`output.transport = 'stub'`). Nothing is silently dropped; the demo works
   end-to-end without mail config. Adding SMTP (nodemailer) is a one-file change.

Email bodies are **HTML-escaped by default** during token rendering.

## Actions

| Action | Config | Notes |
|---|---|---|
| `list_rows` | `step_name`, `source_table`, `filters[]`, `columns[]`, `sort?`, `limit` | Queries a table with an AND filter group (values may be tokens), fully parameterized. Runs under the service identity. Output published to `ctx.steps.<step_name>` for later actions; default limit 100, env hard-cap `AUTOMATION_LIST_ROWS_CAP` (1000). |
| `send_email` | `to`, `cc` (static+tokens), `to_static[]`/`to_fields[]` (legacy), `subject`, `body`, `attach_document?` | `to`/`cc` resolved → split on `; ,` → validated → deduped; **zero valid → action `skipped` (not failed)** with reason "no recipients". Body HTML-escaped; `{{steps.x.rows}}` renders an HTML table. |
| `update_field` | `target: 'record'\|'related'`, `related_lookup_field?`, `field`, `value` | Sets a field on the triggering record or on a related record reached via a lookup (e.g. parent Account). `value` may be static or a `{{token}}`. **Chains:** the worker re-evaluates rules on the changed record and enqueues follow-ups at `depth+1` (loop-guarded at depth 3). |
| `generate_document` | `format: 'xlsx'\|'csv'`, `filename`, `scope: 'record'\|'all'`, `columns[]?` | Exports the entity's columns (chosen or all) for the triggering record or all rows (≤5000) to `server/storage/documents/…`, served at `/storage/documents/…`. `xlsx` uses the repo's SheetJS (no new dep). Link it from an email with `attach_document`. |

## Step outputs & tokens

All action configs render through one shared service (`server/tokenResolver.js`).
Tokens:

| Token | Meaning |
|---|---|
| `{{record.<field>}}` / `{{<field>}}` | triggering-record field |
| `{{record.url}}` · `{{count}}` | record deep link · batch count |
| `{{steps.<name>.count}}` | rows returned by an earlier `list_rows` step |
| `{{steps.<name>.join(<col>, 'sep')}}` | one column joined into a string |
| `{{steps.<name>.rows}}` | the row collection (HTML table in email bodies) |

Escaping is per context: **HTML-escaped in email bodies**, **not escaped in address
fields** (which are instead split/validated/deduped as an email list). Compose a
rule as: `list_rows` (step `recipients`) → `send_email` with
To `{{steps.recipients.join(email, ';')}}`.

**Editor guards** (shared pure validator, `actionValidation.ts`): the token picker
in each action offers only trigger fields + *earlier* steps; on save it checks that
referenced steps exist and precede the reference, referenced join columns exist on
the step, and join separators are non-empty. **Retry-safe**: `list_rows` outputs are
stored in the run log and rehydrated into `ctx.steps` on a retry, so a resumed job
still resolves `{{steps.*}}`.

## Batching window

Set `batch_window_seconds` on a rule to coalesce a burst (e.g. a 10k-row import) into
**one** run. The client defers each job by the window; the worker's tick then
groups all claimed + still-pending jobs for that rule, marks the extras
`skipped` (`error = 'batched'`), and runs one job with `{{count}}` = the total.
Batched rules should be email-oriented (non-email actions run once, for the
representative record).

## Adding a new action type (small, isolated change)

1. Add the type to the `action_type` CHECK in a migration and to
   `AutomationActionType` in `src/types/automationRule.ts`.
2. Register a handler in the `ACTIONS` registry in `server/automationWorker.js`:
   ```js
   ACTIONS.my_action = async (ctx) => { /* … */ return { /* output */ }; };
   ```
   `ctx` = `{ pool, job, rule, action, after, recordUrl, count }`. Throw to fail
   (→ retry/dead-letter); return an `output` object to record success.
3. Add config validation in `src/app/services/automation/actionValidation.ts`.
4. Add an editor card in `src/admin/automationrules/RuleEditorPage.tsx`.

No other worker changes are needed — retries, idempotency, and logging are generic.

## Config / env

| Var | Default | Meaning |
|---|---|---|
| `AUTOMATION_POLL_MS` | `1500` | worker poll interval |
| `AUTOMATION_BATCH` | `10` | jobs claimed per tick |
| `APP_BASE_URL` | `""` | base for `{{record.url}}` (`<base>/#/<table>/<id>`) |
| `SEND_EMAIL_FN_URL` / `SEND_EMAIL_FN_TOKEN` | — | Graph email function endpoint |

## Reference rule (seeded, disabled)

*"Notify sales when approval starts"* — `opportunity.start_approval` **changes to Yes**
→ **send email** to the sales team. Enable it in Admin Studio to try it.

## Phasing — all shipped ✅

- **Phase 1:** data model, detection + enqueue, queue/worker, `send_email`,
  list/editor/run-history UI, demo rule.
- **Phase 2:** `update_field` (record + related-via-lookup), AND-conditions editor,
  loop-protected chaining (`depth+1`, hard-stop at 3).
- **Phase 3:** `generate_document` (xlsx/csv via the bundled SheetJS), batching
  window, full operator set, dead-letter surfacing (rule `error_count` badge + red
  status in Run history).

Server behaviors are covered by an integration harness (update_field + chaining,
depth guard, batching count, document generation); matching semantics + config
validation by 24 unit tests (`src/app/services/automation/__tests__`).
