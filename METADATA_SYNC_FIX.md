# Dynamic Metadata ↔ Database Sync Fix

Fixes the two reported platform bugs and the architectural gap behind them:

1. **New columns showed in the UI but saving/bulk-editing didn't write to the DB (no error).**
2. **New entities added to navigation errored when their page was opened.**

## Root cause (one gap, two symptoms)

The metadata layer and the physical DDL were already working: creating an entity
atomically creates its table + RLS + default forms/views/admin privileges, and
creating a field runs `ALTER TABLE ADD COLUMN`. The break was the **synchronization
layer between DDL and the runtime/API**, in two never-refreshed places:

- **PostgREST schema cache** — Supabase's Data API keeps an in-memory schema cache.
  Tables/columns created via SQL RPCs are invisible to `supabase.from(...)` until the
  cache reloads. Nothing ever called `NOTIFY pgrst, 'reload schema'`. → new entity
  page errored (`PGRST205`); new column writes were rejected/dropped.
- **Frontend runtime caches** — `getTableColumns` / `getFieldMapping` cached forever and
  were only cleared on *Publish*. After `ALTER TABLE`, the stale column set caused
  `filterToExistingColumns` to silently strip the new field → the UPDATE ran with only
  `modified_at` → "success" with no data written and no error.

## What changed

### Database (migration — must be applied, see below)
`supabase/migrations/20260619120000_schema_reload_and_metadata_health.sql`
- `public.reload_postgrest_schema()` — `NOTIFY pgrst, 'reload schema'`; idempotent,
  callable by any authenticated user so the runtime can self-heal after DDL.
- `public.metadata_health_report()` — admin-only JSON drift report (missing tables,
  missing columns, entities missing main form / active view / admin privilege).
- A one-time `NOTIFY` so already-created-but-invisible objects appear immediately.

### Frontend
- `src/services/schemaService.ts` *(new)* — `reloadPostgrestSchema()`,
  `fetchMetadataHealthReport()`, `isSchemaCacheError()`.
- `recordService.ts` — `getTableColumns`/`getFieldMapping` now have a 60s TTL +
  force-refresh; new shared `toWritablePhysicalPayload()` and `translateKeysToPhysical()`.
  `saveRecord` now **self-heals** (force-refreshes columns when a just-added column is
  missing) and **throws a clear error** instead of silently dropping a mapped field.
- `listService.ts` — `bulkUpdateRows` / `updateRowFields` translate logical→physical,
  self-heal, and surface dropped columns loudly. `fetchUniversal` reloads the schema
  cache and retries once on a stale-cache error (fixes new-entity page open).
- `fieldService.ts` / `entityService.ts` — call `reloadPostgrestSchema()` right after
  the DDL RPC so the API sees the new table/column immediately.
- `FieldManagementPage` / `EntityDesignerPage` — `invalidateAllMetadataCaches()` after
  create so saves/lists/bulk-edits pick up the change without a page reload.
- **System Health** page (Admin Studio → Diagnostics → System Health) — runs the drift
  report with one-click repairs: Reload schema cache, Create table, Create default
  forms/views, Grant admin privileges.

## Applying the database migration

The migration adds the schema-reload + health RPCs. **Until it is applied, the
frontend self-heal calls are harmless no-ops** (the missing RPC is swallowed), so the
app keeps working — but new tables/columns won't become API-visible automatically.

Apply it with the existing tooling (needs your Supabase PAT):

```bash
# PowerShell
$env:SUPABASE_ACCESS_TOKEN = "<your-personal-access-token>"
node scripts/apply_migration.mjs supabase/migrations/20260619120000_schema_reload_and_metadata_health.sql
```

(or `node scripts/run_sql.mjs "<paste file contents>"`). The token is **not** stored in
`.env` (it was scrubbed for security). After applying, open Admin Studio → System Health
and confirm "All entities are in sync".

## Acceptance checklist

**A. New field**
- [ ] Add a text field to Leads → add to form + view.
- [ ] Edit one Lead, set the field, Save → value persists in the DB.
- [ ] Bulk-edit several Leads on that field → DB values change.
- [ ] Inline-grid edit the field → persists.

**B. New entity**
- [ ] Create entity "Projects" → add to navigation → open it → list page loads (no error).
- [ ] Default views + create form present; create, edit, and bulk-edit a Project record.

**C. Field types** — repeat A for: text, number, decimal, currency, date, datetime,
boolean, choice, lookup, multiline text.

**D. Loud errors (no more silent drops)**
- [ ] If a field's column is genuinely missing, Save shows a clear error pointing to
      System Health → "Reload schema cache" (instead of fake success).

**E. System Health**
- [ ] Admin Studio → Diagnostics → System Health runs and reports 0 issues on a healthy
      system; repair buttons resolve injected drift.
