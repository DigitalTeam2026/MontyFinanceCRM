/*
  # Repoint entity-table RLS policies to the security.* helper schema

  ## Problem
  `crm_prospect` (and every other entity table created via the custom-entity
  DDL helper) carries the convention-named policies `rls_<table>_sel/_ins/_upd`.
  Migration `202_fix_custom_entity_rls` (re)created the SELECT/UPDATE policies
  with an UNQUALIFIED call to `crm_user_has_access(...)`, which resolves to
  `public.crm_user_has_access`.

  Migration `227`/`232` revoked EXECUTE on the public.* RLS helpers from
  `authenticated` once every hand-written policy had moved to the `security.*`
  schema. But the convention-named entity policies were never migrated, so they
  still call the public function. Result: every authenticated read/update of
  such a table fails with:

      403  permission denied for function crm_user_has_access

  ## Fix
  For each table that has an `rls_<table>_sel` policy (i.e. tables produced by
  the custom-entity DDL helper — this deliberately excludes the system CRM
  entities, whose policies are hand-written under different names), drop and
  recreate the three convention policies with the SAME definitions migration
  202 emitted, except the helper calls are schema-qualified to `security.*`,
  which authenticated IS allowed to execute.

  Idempotent and behaviour-preserving: only the schema qualifier on the helper
  changes; the access logic is identical to 202.
*/

DO $$
DECLARE
  r    record;
  v_pk text;
BEGIN
  FOR r IN
    SELECT DISTINCT c.relname AS t
    FROM pg_policy p
    JOIN pg_class     c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND p.polname = 'rls_' || c.relname || '_sel'
  LOOP
    -- Resolve the primary-key column from the table itself
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
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_' || r.t || '_ins', r.t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_' || r.t || '_upd', r.t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (is_deleted = false AND security.crm_user_has_access(%L, %I, owner_type, owner_id))',
      'rls_' || r.t || '_sel', r.t, r.t, v_pk);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (created_by = auth.uid())',
      'rls_' || r.t || '_ins', r.t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (security.crm_user_has_access(%L, %I, owner_type, owner_id))
         WITH CHECK (modified_by = auth.uid())',
      'rls_' || r.t || '_upd', r.t, r.t, v_pk);

    RAISE NOTICE 'Repointed RLS on % to security.* (pk=%)', r.t, v_pk;
  END LOOP;
END $$;
