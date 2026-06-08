/*
  # Grant EXECUTE on public.is_system_admin to authenticated

  1. Problem
    - 63 INSERT RLS policies across many tables reference public.is_system_admin()
    - The authenticated role only has EXECUTE on security.is_system_admin()
    - This causes "permission denied for function is_system_admin" errors on
      operations like loading nav_item records

  2. Fix
    - Grant EXECUTE on public.is_system_admin() to the authenticated role
    - The function is SECURITY DEFINER and already safe for authenticated callers
*/

GRANT EXECUTE ON FUNCTION public.is_system_admin() TO authenticated;
