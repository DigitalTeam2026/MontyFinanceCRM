/*
  # Harden SECURITY DEFINER RPCs

  ## Issues Fixed

  ### 1. public.sync_system_admin_privileges()
  - Accessible to `anon` (unauthenticated users) — CRITICAL
  - Accessible to any `authenticated` user, not just system admins
  Fix:
  - REVOKE EXECUTE from anon and PUBLIC
  - Add auth check inside the public wrapper: only system admins can call it
  - Non-admins get a permission-denied exception

  ### 2. public.get_table_pk_column(p_table text)
  - SECURITY DEFINER is unnecessary — information_schema is accessible to all roles
  - Flagged as a security risk because it runs with elevated privileges
  Fix:
  - Recreate as SECURITY INVOKER (no privilege escalation)
  - Keep GRANT to authenticated so the frontend can still call it via RPC

  ## Notes
  - The security.sync_system_admin_privileges() (in the security schema) remains
    callable by authenticated users because it is needed by triggers; its public
    wrapper is the one that gets hardened.
  - Leaked password protection must be enabled in the Supabase dashboard under
    Authentication → Settings → Password protection.
*/

-- ── 1. Harden public.sync_system_admin_privileges() ─────────────────────────

CREATE OR REPLACE FUNCTION public.sync_system_admin_privileges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security
AS $$
BEGIN
  -- Block unauthenticated calls
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Block non-system-admin calls
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Only System Administrators can invoke this function.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM security.sync_system_admin_privileges();
END;
$$;

-- Revoke from PUBLIC (covers anon) then grant only to authenticated
REVOKE ALL ON FUNCTION public.sync_system_admin_privileges() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_system_admin_privileges() FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_system_admin_privileges() TO authenticated;

-- ── 2. Switch get_table_pk_column to SECURITY INVOKER ───────────────────────
-- information_schema.table_constraints is readable by all roles; no SECURITY
-- DEFINER needed.  SECURITY INVOKER removes the privilege-escalation concern.

CREATE OR REPLACE FUNCTION public.get_table_pk_column(p_table text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
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
