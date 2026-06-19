/*
  # Fix custom-entity RLS to use the security-schema access helper

  ## Problem
  Every newly created custom entity got a 403 on first read:
    42501 permission denied for function crm_user_has_access

  Root cause: the DDL helper public._crm_entity_create_table_ddl emitted its
  SELECT/UPDATE policies with an UNQUALIFIED crm_user_has_access(...) call.
  The helper's search_path is ('public','security','pg_temp') — public first —
  so the reference bound to public.crm_user_has_access, whose EXECUTE was
  revoked from `authenticated` in migration 232. The usable copy lives in the
  security schema (security.crm_user_has_access), which authenticated may call.

  ## Fix
  1. Redefine _crm_entity_create_table_ddl so SELECT/UPDATE policies call the
     schema-qualified security.crm_user_has_access(...). All FUTURE custom
     entities are correct automatically — no manual repair needed.
  2. Self-heal: rebuild the _sel/_upd policies on every existing custom-entity
     physical table to use the security-qualified helper. Idempotent.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Redefine the live DDL helper (security-qualified access check)
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
      state_code       text        NOT NULL DEFAULT ''active'',
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

REVOKE ALL ON FUNCTION public._crm_entity_create_table_ddl(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._crm_entity_create_table_ddl(text, text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Self-heal existing custom-entity tables
--    Rebuild _sel/_upd policies to use security.crm_user_has_access.
-- ─────────────────────────────────────────────────────────────────────────────
DO $heal$
DECLARE
  r    record;
  v_pk text;
BEGIN
  FOR r IN
    SELECT physical_table_name AS t
    FROM entity_definition
    WHERE is_custom = true
      AND physical_table_name IS NOT NULL
  LOOP
    -- Table must exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = r.t
    ) THEN
      CONTINUE;
    END IF;

    -- Resolve primary-key column from the table itself
    SELECT a.attname INTO v_pk
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = ('public.' || quote_ident(r.t))::regclass
      AND i.indisprimary
    LIMIT 1;

    IF v_pk IS NULL THEN
      RAISE NOTICE 'Skipping % — no primary key found', r.t;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_' || r.t || '_sel', r.t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_' || r.t || '_upd', r.t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (is_deleted = false
           AND security.crm_user_has_access(%L, %I, owner_type, owner_id))',
      'rls_' || r.t || '_sel', r.t, r.t, v_pk);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (security.crm_user_has_access(%L, %I, owner_type, owner_id))
         WITH CHECK (modified_by = auth.uid())',
      'rls_' || r.t || '_upd', r.t, r.t, v_pk);

    RAISE NOTICE 'Healed RLS on % (pk=%)', r.t, v_pk;
  END LOOP;
END $heal$;
