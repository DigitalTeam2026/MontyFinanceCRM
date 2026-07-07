/*
  # Fix custom-entity creation: RLS policy role `authenticated` → `public`

  ## Problem
  Creating a new entity in Admin Studio failed at the "Creating physical
  database table" step with:

      role "authenticated" does not exist

  The DDL helper public._crm_entity_create_table_ddl builds each custom
  table's three RLS policies with `CREATE POLICY ... TO authenticated`. Those
  statements live inside `EXECUTE format(...)` strings, so the role name is
  only resolved at runtime — when an entity is actually created — not when the
  function is defined. That is why every prior migration that re-authored this
  helper applied cleanly, yet entity creation still fails.

  This deployment is a plain PostgreSQL install (local Node + PG auth), not
  Supabase: the Supabase-managed roles `authenticated` / `anon` /
  `service_role` do not exist. Confirmed against the live database:
    - pg_roles has none of those three roles.
    - The app connects as `postgres` (superuser), which bypasses RLS, so the
      policies are inert but must still be *creatable*.
    - Every other policy in the database targets `public` — zero target
      `authenticated`.

  Migration 20260706130000 even notes this is "a plain Postgres install that
  lacks the Supabase `anon` role" for the GRANT/REVOKE lines, but left the
  CREATE POLICY role as `authenticated`, which is the remaining break.

  ## Fix
  Redefine _crm_entity_create_table_ddl so all three RLS policies target
  `public` instead of `authenticated`. Body is otherwise identical to
  20260706130000 (numeric state_code default '1', security-qualified policies,
  auth.uid() checks, indexes, and the modified-at trigger are preserved
  verbatim). This aligns new custom tables with every existing table.

  Privileges are intentionally NOT re-declared: CREATE OR REPLACE FUNCTION
  preserves the existing ACL, and re-issuing REVOKE ... FROM authenticated
  would itself fail for the same missing-role reason.
*/

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
    'CREATE POLICY %I ON public.%I FOR SELECT TO public
     USING (is_deleted = false
       AND security.crm_user_has_access(%L, %I, owner_type, owner_id))',
    'rls_' || p_physical_table_name || '_sel',
    p_physical_table_name,
    p_physical_table_name,
    p_pk_col
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT TO public
     WITH CHECK (created_by = auth.uid())',
    'rls_' || p_physical_table_name || '_ins',
    p_physical_table_name
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO public
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
