/*
  # Drop unused leftover columns — lead.lead_source, account.industry

  Both columns are dead weight left behind by earlier field reshuffles:

    • account.industry  (text)  — 100% NULL. No field_definition points at it, no
      view / index / FK references it. The live "Industry" field is the lookup
      `industry` → industry_id. Pure orphan.
    • lead.lead_source  (uuid)  — 100% NULL. Superseded by the active `leadsource`
      → leadsource lookup. The only field_definitions on this column are two
      already SOFT-DELETED rows (`leadsourcecode` system + `lead_source` custom);
      neither is referenced by any view_column / form_control / dashboard_filter /
      process_stage_step / relationship_definition (verified), so they are removed
      here too so the metadata matches the schema.

  Verified before writing: no FK constraints, no indexes, no views, no active
  field defs, and no inbound references to the two field_definition rows.

  Reversible by re-adding the (all-NULL) columns; no data is lost.
  Idempotent: IF EXISTS guards + id-scoped deletes make re-runs a no-op.
*/

BEGIN;

-- 1) Remove the stale metadata rows that map to lead.lead_source (both soft-deleted).
DELETE FROM public.field_definition
 WHERE field_definition_id IN (
   'b2da10e3-1308-4fa0-9ebc-5be7278075a7',  -- leadsourcecode (system, soft-deleted)
   '12eba102-6f6a-48bc-b0f7-17a8c35c0c3a'   -- lead_source   (custom, soft-deleted)
 )
   AND physical_column_name = 'lead_source'
   AND deleted_at IS NOT NULL;

-- 2) Drop the dead physical columns.
ALTER TABLE public.lead    DROP COLUMN IF EXISTS lead_source;
ALTER TABLE public.account DROP COLUMN IF EXISTS industry;

COMMIT;
