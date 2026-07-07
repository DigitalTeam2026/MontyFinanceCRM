/*
  # Fix custom-entity state_code default: 'active' → numeric '1'

  ## Problem
  Any grid view with a Status/statecode filter showed "No records found" for
  custom entities (e.g. Partners). The seeded "Active Records" view filters
  state_code = '1' (statecode_definition.state_value for Active), but custom
  entities stored the *text* 'active' instead:

    - The DDL helper public._crm_entity_create_table_ddl created the physical
      table with `state_code text NOT NULL DEFAULT 'active'`.
    - Migration 20260603073811 already reverted every SYSTEM entity from the
      'active'/'inactive' text scheme back to numeric '1'/'2' (matching
      statecode_definition.state_value), but the custom-entity DDL helper was
      re-authored afterward and kept the old text default — so custom rows got
      'active', which no numeric filter matches.

  ## Fix
  1. Redefine _crm_entity_create_table_ddl so state_code defaults to '1'.
     All FUTURE custom entities store the correct numeric code automatically.
     (Body is identical to migration 20260618180000 apart from that default —
     the security-qualified RLS policies are preserved verbatim.)
  2. Self-heal every existing custom-entity table: convert 'active' → '1',
     'inactive' → '2', backfill NULLs to '1', and reset the column default.
     Idempotent.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Redefine the live DDL helper (numeric state_code default)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._crm_entity_create_table_ddl(
  p_physical_table_name text,
  p_pk_col              text,
  p_primary_field_name  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security, pg_temp
AS $$
BEGIN
  -- Physical table
  EXECUTE format(
    'CREATE TABLE public.%I (
      %I               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      %I               text        NOT NULL DEFAULT '''',
      owner_type       text        NOT NULL DEFAULT ''user''
                                   CHECK (owner_type IN (''user'', ''team'')),
      owner_id         uuid        NOT NULL,
      business_unit_id uuid        REFERENCES public.business_unit(business_unit_id),
      state_code       text        NOT NULL DEFAULT ''1'',
      status_reason    text,
      custom_fields    jsonb,
      created_at       timestamptz NOT NULL DEFAULT now(),
      created_by       uuid        REFERENCES public.crm_user(user_id),
      modified_at      timestamptz NOT NULL DEFAULT now(),
      modified_by      uuid        REFERENCES public.crm_user(user_id),
      is_deleted       boolean     NOT NULL DEFAULT false,
      version_no       integer     NOT NULL DEFAULT 1
    )',
    p_physical_table_name,
    p_pk_col,
    p_primary_field_name
  );

  -- Indexes
  EXECUTE format('CREATE INDEX ON public.%I (owner_type, owner_id)',     p_physical_table_name);
  EXECUTE format('CREATE INDEX ON public.%I (business_unit_id)',         p_physical_table_name);
  EXECUTE format('CREATE INDEX ON public.%I (state_code)',               p_physical_table_name);
  EXECUTE format('CREATE INDEX ON public.%I (is_deleted)',               p_physical_table_name);
  EXECUTE format('CREATE INDEX ON public.%I (created_at)',               p_physical_table_name);
  EXECUTE format('CREATE INDEX ON public.%I (%I)', p_physical_table_name, p_primary_field_name);

  -- Row-level security
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_physical_table_name);

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
     USING (is_deleted = false
       AND security.crm_user_has_access(%L, %I, owner_type, owner_id))',
    'rls_' || p_physical_table_name || '_sel',
    p_physical_table_name,
    p_physical_table_name,
    p_pk_col
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
     WITH CHECK (created_by = auth.uid())',
    'rls_' || p_physical_table_name || '_ins',
    p_physical_table_name
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
     USING (security.crm_user_has_access(%L, %I, owner_type, owner_id))
     WITH CHECK (modified_by = auth.uid())',
    'rls_' || p_physical_table_name || '_upd',
    p_physical_table_name,
    p_physical_table_name,
    p_pk_col
  );

  -- Modified-at trigger
  EXECUTE format(
    'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
     FOR EACH ROW EXECUTE FUNCTION public.set_modified_at()',
    'trg_' || p_physical_table_name || '_modified_at',
    p_physical_table_name
  );
END;
$$;

-- Privileges are intentionally NOT re-declared here: CREATE OR REPLACE FUNCTION
-- preserves the ACL already set by migration 20260618180000 (REVOKE from
-- PUBLIC/anon/authenticated, GRANT to service_role). Re-issuing those REVOKEs
-- would fail on a plain Postgres install that lacks the Supabase `anon` role.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Self-heal existing custom-entity tables
--    'active' → '1', 'inactive' → '2', NULL → '1', and reset column default.
-- ─────────────────────────────────────────────────────────────────────────────
DO $heal$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT physical_table_name AS t
    FROM entity_definition
    WHERE is_custom = true
      AND physical_table_name IS NOT NULL
  LOOP
    -- Table must exist and actually have a state_code column
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = r.t
        AND column_name = 'state_code'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('UPDATE public.%I SET state_code = ''1'' WHERE state_code = ''active''',   r.t);
    EXECUTE format('UPDATE public.%I SET state_code = ''2'' WHERE state_code = ''inactive''', r.t);
    EXECUTE format('UPDATE public.%I SET state_code = ''1'' WHERE state_code IS NULL',        r.t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN state_code SET DEFAULT ''1''',         r.t);

    RAISE NOTICE 'Normalized state_code on custom entity table %', r.t;
  END LOOP;
END $heal$;
