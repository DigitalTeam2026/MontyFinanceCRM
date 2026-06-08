/*
  # Fix fn_check_product_access grant

  ## Problem
  The public.fn_check_product_access function is missing EXECUTE grant for
  the authenticated role, causing 403 errors when the app tries to check
  product access for logged-in users.

  ## Fix
  Grant EXECUTE on public.fn_check_product_access to authenticated role.
*/

GRANT EXECUTE ON FUNCTION public.fn_check_product_access(uuid, text, uuid) TO authenticated;
