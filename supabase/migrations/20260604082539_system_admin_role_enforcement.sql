/*
  # System Administrator Role Enforcement

  ## Purpose
  Permanently lock the "System Administrator" security role so it always has:
  - Full org-level privileges on every entity (existing and future)
  - All action permissions allowed (is_denied = false)
  - No field/section restrictions

  ## Changes

  ### 1. Helper: get System Administrator role_id
  Creates `security.get_system_admin_role_id()` — cached lookup for the SA role.

  ### 2. Repair function: sync_system_admin_privileges()
  Sets full org-level privileges for every active entity_definition row.
  Removes all field_permission and section_permission rows for SA.
  Sets is_denied = false for all action_permission rows for SA.
  Called on-demand and by the entity creation trigger.

  ### 3. Trigger: after INSERT on entity_definition
  Automatically grants SA full org access whenever a new entity is created.

  ### 4. Trigger: block privilege downgrade
  Blocks any UPDATE or DELETE on role_privilege for the SA role that would
  reduce any access below full org.

  ### 5. Block SA role delete/rename
  Trigger on security_role prevents DELETE or name change for SA role.

  ### 6. Run initial repair
  Immediately syncs all existing entities to full org access.
*/

-- ── 1. Helper: resolve System Administrator role_id ──────────────────────────

CREATE OR REPLACE FUNCTION security.get_system_admin_role_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, security
AS $$
  SELECT role_id FROM public.security_role
  WHERE name = 'System Administrator'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION security.get_system_admin_role_id() TO authenticated;

-- ── 2. Full-org privilege row builder ────────────────────────────────────────

-- Returns a JSONB object representing a full-org privilege row for a given
-- role_id + entity_name (used by the trigger).
-- Not exposed externally; called by PL/pgSQL only.

-- ── 3. Repair / sync function ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION security.sync_system_admin_privileges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  v_role_id := security.get_system_admin_role_id();
  IF v_role_id IS NULL THEN
    RETURN; -- SA role doesn't exist yet (first-time setup)
  END IF;

  -- Upsert full org-level privileges for every active entity
  INSERT INTO public.role_privilege (
    role_id, entity_name,
    can_create, can_read, can_write, can_delete, can_assign, can_share,
    create_access_level, read_access_level, write_access_level,
    delete_access_level, assign_access_level, share_access_level
  )
  SELECT
    v_role_id,
    ed.logical_name,
    true, true, true, true, true, true,
    'organization', 'organization', 'organization',
    'organization', 'organization', 'organization'
  FROM public.entity_definition ed
  WHERE ed.is_active = true AND ed.deleted_at IS NULL
  ON CONFLICT (role_id, entity_name) DO UPDATE SET
    can_create = true, can_read = true, can_write = true,
    can_delete = true, can_assign = true, can_share = true,
    create_access_level = 'organization', read_access_level = 'organization',
    write_access_level = 'organization', delete_access_level = 'organization',
    assign_access_level = 'organization', share_access_level = 'organization',
    modified_at = now();

  -- Remove ALL field restrictions for SA (SA sees everything)
  DELETE FROM public.field_permission WHERE role_id = v_role_id;

  -- Remove ALL section restrictions for SA (SA sees all sections)
  DELETE FROM public.section_permission WHERE role_id = v_role_id;

  -- Ensure no action permissions are denied for SA
  DELETE FROM public.action_permission WHERE role_id = v_role_id AND is_denied = true;

END;
$$;

REVOKE ALL ON FUNCTION security.sync_system_admin_privileges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION security.sync_system_admin_privileges() TO authenticated;

-- Public alias for frontend calls
CREATE OR REPLACE FUNCTION public.sync_system_admin_privileges()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, security
AS $$
  SELECT security.sync_system_admin_privileges();
$$;

GRANT EXECUTE ON FUNCTION public.sync_system_admin_privileges() TO authenticated;

-- ── 4. Trigger: auto-grant SA access when new entity created ─────────────────

CREATE OR REPLACE FUNCTION security.trg_grant_sa_on_new_entity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  v_role_id := security.get_system_admin_role_id();
  IF v_role_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.role_privilege (
    role_id, entity_name,
    can_create, can_read, can_write, can_delete, can_assign, can_share,
    create_access_level, read_access_level, write_access_level,
    delete_access_level, assign_access_level, share_access_level
  ) VALUES (
    v_role_id, NEW.logical_name,
    true, true, true, true, true, true,
    'organization', 'organization', 'organization',
    'organization', 'organization', 'organization'
  )
  ON CONFLICT (role_id, entity_name) DO UPDATE SET
    can_create = true, can_read = true, can_write = true,
    can_delete = true, can_assign = true, can_share = true,
    create_access_level = 'organization', read_access_level = 'organization',
    write_access_level = 'organization', delete_access_level = 'organization',
    assign_access_level = 'organization', share_access_level = 'organization',
    modified_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_sa_on_new_entity ON public.entity_definition;
CREATE TRIGGER trg_grant_sa_on_new_entity
  AFTER INSERT ON public.entity_definition
  FOR EACH ROW EXECUTE FUNCTION security.trg_grant_sa_on_new_entity();

-- ── 5. Trigger: block privilege downgrade for SA ─────────────────────────────

CREATE OR REPLACE FUNCTION security.trg_protect_sa_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  v_role_id := security.get_system_admin_role_id();
  IF v_role_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.role_id = v_role_id THEN
      RAISE EXCEPTION 'System Administrator privileges cannot be removed.';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: silently restore full org access if someone tries to downgrade
  IF NEW.role_id = v_role_id THEN
    NEW.can_create := true;
    NEW.can_read := true;
    NEW.can_write := true;
    NEW.can_delete := true;
    NEW.can_assign := true;
    NEW.can_share := true;
    NEW.create_access_level := 'organization';
    NEW.read_access_level := 'organization';
    NEW.write_access_level := 'organization';
    NEW.delete_access_level := 'organization';
    NEW.assign_access_level := 'organization';
    NEW.share_access_level := 'organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_sa_privileges ON public.role_privilege;
CREATE TRIGGER trg_protect_sa_privileges
  BEFORE UPDATE OR DELETE ON public.role_privilege
  FOR EACH ROW EXECUTE FUNCTION security.trg_protect_sa_privileges();

-- ── 6. Trigger: block SA role delete / rename ─────────────────────────────────

CREATE OR REPLACE FUNCTION security.trg_protect_sa_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.name = 'System Administrator' THEN
      RAISE EXCEPTION 'The System Administrator role cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: prevent renaming SA
  IF OLD.name = 'System Administrator' AND NEW.name <> 'System Administrator' THEN
    RAISE EXCEPTION 'The System Administrator role cannot be renamed.';
  END IF;

  -- Prevent changing is_system flag for SA
  IF OLD.name = 'System Administrator' AND NEW.is_system = false THEN
    RAISE EXCEPTION 'The System Administrator role cannot be changed to a custom role.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_sa_role ON public.security_role;
CREATE TRIGGER trg_protect_sa_role
  BEFORE UPDATE OR DELETE ON public.security_role
  FOR EACH ROW EXECUTE FUNCTION security.trg_protect_sa_role();

-- ── 7. Trigger: block field/section restrictions being added for SA ──────────

CREATE OR REPLACE FUNCTION security.trg_protect_sa_field_perms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  v_role_id := security.get_system_admin_role_id();
  IF v_role_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.role_id = v_role_id THEN
    RAISE EXCEPTION 'Field permissions cannot be restricted for System Administrator.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_sa_field_perms ON public.field_permission;
CREATE TRIGGER trg_protect_sa_field_perms
  BEFORE INSERT OR UPDATE ON public.field_permission
  FOR EACH ROW EXECUTE FUNCTION security.trg_protect_sa_field_perms();

CREATE OR REPLACE FUNCTION security.trg_protect_sa_section_perms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  v_role_id := security.get_system_admin_role_id();
  IF v_role_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.role_id = v_role_id THEN
    RAISE EXCEPTION 'Section permissions cannot be hidden for System Administrator.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_sa_section_perms ON public.section_permission;
CREATE TRIGGER trg_protect_sa_section_perms
  BEFORE INSERT OR UPDATE ON public.section_permission
  FOR EACH ROW EXECUTE FUNCTION security.trg_protect_sa_section_perms();

CREATE OR REPLACE FUNCTION security.trg_protect_sa_action_perms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  v_role_id := security.get_system_admin_role_id();
  IF v_role_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.role_id = v_role_id AND NEW.is_denied = true THEN
    -- Silently reset to allowed
    NEW.is_denied := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_sa_action_perms ON public.action_permission;
CREATE TRIGGER trg_protect_sa_action_perms
  BEFORE INSERT OR UPDATE ON public.action_permission
  FOR EACH ROW EXECUTE FUNCTION security.trg_protect_sa_action_perms();

-- ── 8. Run initial repair ─────────────────────────────────────────────────────

SELECT security.sync_system_admin_privileges();
