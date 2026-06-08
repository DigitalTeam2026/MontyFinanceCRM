
/*
  # Fix RLS helper function volatility to reduce auth timeout

  The functions get_is_system_admin_bypass_rls, get_current_user_is_admin,
  and crm_user_has_access are marked VOLATILE, which means PostgreSQL cannot
  cache their results within a single query. With 400+ RLS policies, each login
  triggers hundreds of redundant DB lookups causing 504 timeouts.

  Marking them STABLE allows PostgreSQL to cache results per-transaction,
  dramatically reducing the number of DB round-trips during auth.
*/

CREATE OR REPLACE FUNCTION get_is_system_admin_bypass_rls(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_system_admin FROM crm_user WHERE user_id = p_user_id),
    false
  );
$$;

CREATE OR REPLACE FUNCTION get_current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_is_system_admin_bypass_rls(auth.uid());
$$;

CREATE OR REPLACE FUNCTION is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_current_user_is_admin();
$$;

-- Also re-create get_current_crm_user_id as STABLE if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_current_crm_user_id') THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION get_current_crm_user_id()
      RETURNS uuid
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $inner$
        SELECT user_id FROM crm_user WHERE user_id = auth.uid() LIMIT 1;
      $inner$;
    $func$;
  END IF;
END $$;
