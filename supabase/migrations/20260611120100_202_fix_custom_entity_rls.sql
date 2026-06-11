/*
  # 202 — Re-scope RLS on existing custom-entity tables

  The DDL helper `_crm_entity_create_table_ddl` was hardened in an earlier
  migration so that NEW custom entities get ownership-scoped policies
  (SELECT/UPDATE gated by crm_user_has_access, INSERT gated by created_by =
  auth.uid()). However, custom-entity tables created BEFORE that fix kept the
  original permissive policies (`USING (true)` / `WITH CHECK (true)`), which let
  any authenticated user read and write every row. `crm_partners` is the known
  straggler.

  This migration self-heals: for every custom-entity physical table it drops the
  three standard policies and recreates them with the scoped definitions that the
  live helper now emits. It is idempotent — tables already on the scoped policies
  are simply rebuilt identically.

  Note: crm_user_has_access() returns true for a record's own owner even when no
  role_privilege rows exist, so record owners and admins retain access; only
  cross-owner read/write (the vulnerability) is removed.
*/

DO $$
DECLARE
  r   record;
  v_pk text;
BEGIN
  FOR r IN
    SELECT physical_table_name AS t
    FROM entity_definition
    WHERE is_custom = true
      AND physical_table_name IS NOT NULL
  LOOP
    -- Skip entities whose physical table is missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = r.t
    ) THEN
      CONTINUE;
    END IF;

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

    -- Drop the three standard policies (named by convention)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_' || r.t || '_sel', r.t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_' || r.t || '_ins', r.t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_' || r.t || '_upd', r.t);

    -- Recreate scoped policies (identical to the live DDL helper output)
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (is_deleted = false AND crm_user_has_access(%L, %I, owner_type, owner_id))',
      'rls_' || r.t || '_sel', r.t, r.t, v_pk);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (created_by = auth.uid())',
      'rls_' || r.t || '_ins', r.t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (crm_user_has_access(%L, %I, owner_type, owner_id))
         WITH CHECK (modified_by = auth.uid())',
      'rls_' || r.t || '_upd', r.t, r.t, v_pk);

    RAISE NOTICE 'Re-scoped RLS on % (pk=%)', r.t, v_pk;
  END LOOP;
END $$;
