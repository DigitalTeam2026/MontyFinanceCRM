REVOKE EXECUTE ON FUNCTION public.get_current_user_is_admin() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.get_is_system_admin_bypass_rls(uuid) FROM authenticated, anon, public;