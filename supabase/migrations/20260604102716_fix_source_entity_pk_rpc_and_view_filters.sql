/*
  # Fix source entity: PK RPC, view filters, status_reason defaults

  ## Problems Fixed

  1. `get_table_pk_column(p_table)` RPC — returns the actual PRIMARY KEY column
     name for any table. Solves the crm_source → source_id vs crm_source_id mismatch
     that caused every save/load/select to fail for dynamic entities whose table name
     has a prefix (e.g. crm_source, crm_country).

  2. Active Sources view filter — was empty (no filter), causing ALL records to show.
     Now filters state_code = '1' (Active only).

  3. Inactive Sources view filter — was empty, now filters state_code = '2'.

  4. Backfill status_reason = 1 on crm_source rows where it is NULL.
*/

-- ── 1. RPC: get_table_pk_column ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_table_pk_column(p_table text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT kcu.column_name::text
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
    AND kcu.table_schema   = tc.table_schema
    AND kcu.table_name     = tc.table_name
  WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema    = 'public'
    AND tc.table_name      = p_table
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_table_pk_column(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_table_pk_column(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_table_pk_column(text) TO authenticated;

-- ── 2. Fix Active Sources view filter ────────────────────────────────────────
UPDATE view_definition
SET filter_json = '{
  "id": "root",
  "operator": "AND",
  "conditions": [
    {
      "id": "cond_active",
      "field_logical_name": "statecode",
      "field_display_name": "Status",
      "operator": "eq",
      "value": "1"
    }
  ],
  "groups": []
}'::jsonb
WHERE view_id = 'd62bd1a8-c249-4cd9-82eb-0650cafbeb21';

-- ── 3. Fix Inactive Sources view filter ──────────────────────────────────────
UPDATE view_definition
SET filter_json = '{
  "id": "root",
  "operator": "AND",
  "conditions": [
    {
      "id": "cond_inactive",
      "field_logical_name": "statecode",
      "field_display_name": "Status",
      "operator": "eq",
      "value": "2"
    }
  ],
  "groups": []
}'::jsonb
WHERE view_id = 'f516cdf7-e3da-4f58-a583-f36559bcedce';

-- ── 4. Backfill status_reason on crm_source rows ──────────────────────────────
UPDATE crm_source
SET status_reason = '1'
WHERE status_reason IS NULL AND state_code = '1';

UPDATE crm_source
SET status_reason = '2'
WHERE status_reason IS NULL AND state_code = '2';
