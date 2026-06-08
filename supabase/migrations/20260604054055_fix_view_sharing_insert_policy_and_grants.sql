/*
  # Fix view_sharing INSERT policy and function grants

  The INSERT policy on view_sharing calls `is_view_owner(view_id)` which resolves
  to `public.is_view_owner` — but authenticated users have no EXECUTE grant on it,
  causing a 403 "permission denied for function is_view_owner".

  Fixes:
  1. Grant EXECUTE on public.is_view_owner to authenticated
  2. Grant EXECUTE on security.is_view_owner to authenticated (belt-and-suspenders)
  3. Recreate the INSERT policy to explicitly use security.is_view_owner for consistency
*/

-- Grant execute on both variants
GRANT EXECUTE ON FUNCTION public.is_view_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION security.is_view_owner(uuid) TO authenticated;

-- Recreate INSERT policy to use the security-schema variant explicitly
DROP POLICY IF EXISTS "View owners can create shares" ON public.view_sharing;

CREATE POLICY "View owners can create shares"
  ON public.view_sharing
  FOR INSERT
  TO authenticated
  WITH CHECK (security.is_view_owner(view_id));
