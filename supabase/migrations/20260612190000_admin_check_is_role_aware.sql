/*
  # Make the system-admin check role-aware (not just the crm_user flag)

  ## Problem
  `security.is_system_admin()` -> get_current_user_is_admin()
    -> get_is_system_admin_bypass_rls() resolved ONLY to the
       crm_user.is_system_admin boolean column.

  The seed (28_security_system_flags_and_seed.sql) assigns the protected
  "System Administrator" SECURITY ROLE to admin@montyfinance.com but never
  sets crm_user.is_system_admin = true. So a genuine admin (holding the
  System Administrator role) fails every is_system_admin() RLS check — e.g.
  editing a dashboard created by another user returns 42501 / 403.

  ## Fix
  Treat a user as a system admin if EITHER:
    - crm_user.is_system_admin = true  (explicit flag, preserved), OR
    - they hold the active, non-deleted "System Administrator" role.

  This is the single source of truth for is_system_admin(), so the fix is
  consistent across all ~60 policies that call it — no per-policy or
  per-user (email) special-casing. The "System Administrator" role name is
  protected from rename/delete in securityService, so matching by name is
  stable.

  The function is SECURITY DEFINER with a fixed search_path, so reading the
  role tables bypasses RLS and cannot recurse.
*/

CREATE OR REPLACE FUNCTION security.get_is_system_admin_bypass_rls(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT is_system_admin FROM public.crm_user WHERE user_id = p_user_id),
    false
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_security_role usr
    JOIN public.security_role sr ON sr.role_id = usr.role_id
    WHERE usr.user_id = p_user_id
      AND sr.name = 'System Administrator'
      AND sr.is_active = true
      AND sr.deleted_at IS NULL
  );
$$;
