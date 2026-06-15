-- ============================================================================
-- Entity privilege enforcement (platform-wide, generic)
-- ----------------------------------------------------------------------------
-- Fixes:
--   1. Logical-vs-physical entity name mismatch in RLS  (crm_prospect -> prospect)
--   2. Ownership/sharing bypassing the absence of an entity-level Read privilege
--   3. INSERT policies with no can_create check (permissive create)
--   4. Missing can_delete / can_assign / can_share enforcement
--
-- Rule enforced everywhere: a user with NO role_privilege row for an entity, or
-- with the relevant flag false, is DENIED. Missing privilege never means access.
-- Only is_system_admin = true bypasses. No role grants are added or changed.
-- This migration creates/replaces functions, triggers and policies only.
-- It does not insert, update or delete any business records or role assignments.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Generic logical-name resolver: accepts a logical OR physical table name
--    and always returns the logical entity name used in role_privilege.
--    Prefers an exact logical match so 'account' stays 'account'.
--    Unknown names are returned unchanged (safe default).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION security.resolve_entity_logical_name(p_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT ed.logical_name
       FROM public.entity_definition ed
      WHERE (ed.logical_name = p_name OR ed.physical_table_name = p_name)
        AND ed.deleted_at IS NULL
      ORDER BY (ed.logical_name = p_name) DESC
      LIMIT 1),
    p_name
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. Entity-level privilege check (default-deny + logical-name resolution).
--    Both schema copies kept in sync. Admin bypasses. No matching row => false.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION security.crm_user_has_privilege(p_entity_name text, p_privilege text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.crm_user cu
      WHERE cu.user_id = auth.uid() AND cu.is_system_admin = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_security_role usr
      JOIN public.role_privilege rp
        ON rp.role_id = usr.role_id
       AND rp.entity_name = security.resolve_entity_logical_name(p_entity_name)
      WHERE usr.user_id = auth.uid()
        AND CASE p_privilege
          WHEN 'can_create' THEN rp.can_create
          WHEN 'can_read'   THEN rp.can_read
          WHEN 'can_write'  THEN rp.can_write
          WHEN 'can_delete' THEN rp.can_delete
          WHEN 'can_assign' THEN rp.can_assign
          WHEN 'can_share'  THEN rp.can_share
          ELSE false
        END = true
    );
$$;

CREATE OR REPLACE FUNCTION public.crm_user_has_privilege(p_entity_name text, p_privilege text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT security.crm_user_has_privilege(p_entity_name, p_privilege);
$$;

-- ----------------------------------------------------------------------------
-- 3. Record-scope access (READ) — now privilege-gated.
--    An entity-level Read privilege is REQUIRED before ownership, team,
--    business-unit scope or sharing can grant access. Owning a record no
--    longer bypasses the absence of Read privilege.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION security.crm_user_has_access(
  p_entity_name text,
  p_record_id   uuid,
  p_owner_type  text,
  p_owner_id    uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_logical     text := security.resolve_entity_logical_name(p_entity_name);
  v_is_admin    boolean;
  v_user_bu_id  uuid;
  v_owner_bu_id uuid;
  v_max_level   int;
BEGIN
  SELECT cu.is_system_admin, cu.business_unit_id
    INTO v_is_admin, v_user_bu_id
    FROM public.crm_user cu
   WHERE cu.user_id = auth.uid();

  IF v_is_admin THEN RETURN true; END IF;

  -- Highest Read access level the user holds on this entity (NULL if none).
  SELECT MAX(
    CASE rp.read_access_level
      WHEN 'organization'  THEN 4
      WHEN 'parent_bu'     THEN 3
      WHEN 'business_unit' THEN 2
      WHEN 'user'          THEN 1
      ELSE 0
    END
  ) INTO v_max_level
  FROM public.user_security_role usr
  JOIN public.role_privilege rp
    ON rp.role_id = usr.role_id
   AND rp.entity_name = v_logical
  WHERE usr.user_id = auth.uid()
    AND rp.can_read = true;

  -- GATE: no entity-level Read privilege => deny, regardless of ownership/share.
  IF COALESCE(v_max_level, 0) = 0 THEN RETURN false; END IF;

  -- Organization-wide read.
  IF v_max_level = 4 THEN RETURN true; END IF;

  -- Explicit record shares (only meaningful once the base Read privilege holds).
  IF p_record_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.record_share rs
      WHERE rs.entity_name IN (v_logical, p_entity_name)
        AND rs.record_id = p_record_id
        AND rs.can_read = true
        AND rs.principal_type = 'user'
        AND rs.principal_id = auth.uid()
    ) THEN RETURN true; END IF;

    IF EXISTS (
      SELECT 1 FROM public.record_share rs
      JOIN public.team_user tu ON tu.team_id = rs.principal_id
      WHERE rs.entity_name IN (v_logical, p_entity_name)
        AND rs.record_id = p_record_id
        AND rs.can_read = true
        AND rs.principal_type = 'team'
        AND tu.user_id = auth.uid()
    ) THEN RETURN true; END IF;
  END IF;

  IF p_owner_type = 'team' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.team_user tu
      WHERE tu.team_id = p_owner_id AND tu.user_id = auth.uid()
    );
  END IF;

  IF p_owner_type <> 'user' THEN RETURN false; END IF;
  IF p_owner_id = auth.uid() THEN RETURN true; END IF;

  IF v_max_level IN (2, 3) AND v_user_bu_id IS NOT NULL THEN
    SELECT cu.business_unit_id INTO v_owner_bu_id
      FROM public.crm_user cu WHERE cu.user_id = p_owner_id;

    IF v_max_level = 2 THEN
      RETURN v_owner_bu_id = v_user_bu_id;
    ELSE
      RETURN EXISTS (
        WITH RECURSIVE bu_tree AS (
          SELECT business_unit_id FROM public.business_unit
          WHERE business_unit_id = v_user_bu_id
          UNION ALL
          SELECT bu.business_unit_id FROM public.business_unit bu
          JOIN bu_tree t ON bu.parent_business_unit_id = t.business_unit_id
        )
        SELECT 1 FROM bu_tree WHERE business_unit_id = v_owner_bu_id
      );
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Assign enforcement: changing owner_id on an existing record requires the
--    can_assign privilege on that entity (admin bypass inside has_privilege).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION security.enforce_owner_reassign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_logical text := security.resolve_entity_logical_name(TG_TABLE_NAME);
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    IF NOT security.crm_user_has_privilege(v_logical, 'can_assign') THEN
      RAISE EXCEPTION 'Permission denied: assign privilege required for %', v_logical
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Rebuild policies for owner-bearing entity tables.
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  r       record;
  pol     text;
  v_trg   text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('crm_prospect',             'prospect',           'prospect_id'),
      ('crm_partners',             'partners',           'partners_id'),
      ('crm_reseller',             'reseller',           'reseller_id'),
      ('crm_opportunity_partner',  'opportunity_partner','opportunity_partner_id'),
      ('crm_continent',            'continent',          'continent_id'),
      ('campaign',                 'campaign',           'campaign_id'),
      ('event',                    'event',              'event_id'),
      ('journey',                  'journey',            'journey_id'),
      ('marketing_email',          'marketing_email',    'email_id'),
      ('segment',                  'segment',            'segment_id')
    ) AS t(tbl, logical, pk)
  LOOP
    -- Drop every existing policy on the table, then rebuild a clean set.
    FOR pol IN
      SELECT p.polname FROM pg_policy p
      WHERE p.polrelid = format('public.%I', r.tbl)::regclass
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, r.tbl);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tbl);

    -- SELECT: must have can_read, then record scope.
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ('
      || 'is_deleted = false '
      || 'AND security.crm_user_has_privilege(%L, ''can_read'') '
      || 'AND security.crm_user_has_access(%L, %I, owner_type, owner_id))',
      'rls_' || r.tbl || '_sel', r.tbl, r.logical, r.logical, r.pk);

    -- INSERT: must have can_create; cannot assign to another owner without can_assign.
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ('
      || 'created_by = auth.uid() '
      || 'AND security.crm_user_has_privilege(%L, ''can_create'') '
      || 'AND (owner_id = auth.uid() OR security.crm_user_has_privilege(%L, ''can_assign'')))',
      'rls_' || r.tbl || '_ins', r.tbl, r.logical, r.logical);

    -- UPDATE: must have can_write + write scope; soft-delete needs can_delete.
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ('
      || 'security.crm_user_has_privilege(%L, ''can_write'') '
      || 'AND security.crm_user_has_access(%L, %I, owner_type, owner_id)) '
      || 'WITH CHECK ('
      || 'security.crm_user_has_privilege(%L, ''can_write'') '
      || 'AND modified_by = auth.uid() '
      || 'AND (is_deleted = false OR security.crm_user_has_privilege(%L, ''can_delete'')))',
      'rls_' || r.tbl || '_upd', r.tbl, r.logical, r.logical, r.pk, r.logical, r.logical);

    -- DELETE (hard): must have can_delete + access.
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ('
      || 'security.crm_user_has_privilege(%L, ''can_delete'') '
      || 'AND security.crm_user_has_access(%L, %I, owner_type, owner_id))',
      'rls_' || r.tbl || '_del', r.tbl, r.logical, r.logical, r.pk);

    -- Assign trigger.
    v_trg := 'trg_' || r.tbl || '_enforce_assign';
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', v_trg, r.tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION security.enforce_owner_reassign()',
      v_trg, r.tbl);
  END LOOP;
END;
$do$;

-- ----------------------------------------------------------------------------
-- 6. Rebuild policies for created_by-scoped tables (no owner columns).
--    These legacy tables have no ownership model, so scope stays created_by,
--    but the entity-level privilege is now required (admin bypass preserved).
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  r   record;
  pol text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('note',       'note'),
      ('attachment', 'attachment')
    ) AS t(tbl, logical)
  LOOP
    FOR pol IN
      SELECT p.polname FROM pg_policy p
      WHERE p.polrelid = format('public.%I', r.tbl)::regclass
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, r.tbl);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tbl);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ('
      || 'is_deleted = false AND (security.is_system_admin() OR ('
      || 'security.crm_user_has_privilege(%L, ''can_read'') AND created_by = auth.uid())))',
      'rls_' || r.tbl || '_sel', r.tbl, r.logical);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ('
      || 'created_by = auth.uid() AND security.crm_user_has_privilege(%L, ''can_create''))',
      'rls_' || r.tbl || '_ins', r.tbl, r.logical);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ('
      || 'security.is_system_admin() OR ('
      || 'security.crm_user_has_privilege(%L, ''can_write'') AND created_by = auth.uid())) '
      || 'WITH CHECK (security.is_system_admin() OR ('
      || 'security.crm_user_has_privilege(%L, ''can_write'') AND modified_by = auth.uid() '
      || 'AND (is_deleted = false OR security.crm_user_has_privilege(%L, ''can_delete''))))',
      'rls_' || r.tbl || '_upd', r.tbl, r.logical, r.logical, r.logical);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ('
      || 'security.is_system_admin() OR ('
      || 'security.crm_user_has_privilege(%L, ''can_delete'') AND created_by = auth.uid()))',
      'rls_' || r.tbl || '_del', r.tbl, r.logical);
  END LOOP;
END;
$do$;

-- ----------------------------------------------------------------------------
-- 7. Share enforcement: creating a record_share requires can_share on the
--    target entity (entity_name resolved logical/physical inside the function).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert record shares" ON public.record_share;
CREATE POLICY "Users can insert record shares"
  ON public.record_share FOR INSERT TO authenticated
  WITH CHECK (
    shared_by = auth.uid()
    AND (security.is_system_admin()
         OR security.crm_user_has_privilege(entity_name, 'can_share'))
  );
