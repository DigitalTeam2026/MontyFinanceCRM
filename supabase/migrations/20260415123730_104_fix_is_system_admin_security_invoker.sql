/*
  # Fix is_system_admin() — Switch to SECURITY INVOKER

  ## Problem
  The is_system_admin() function was declared as SECURITY DEFINER, which causes
  it to run as the function owner (postgres superuser) rather than the calling user.
  In this context, auth.uid() returns null because the JWT claim is only visible
  in the invoking user's session context. This makes every RLS policy that calls
  is_system_admin() evaluate to false for all authenticated users, blocking
  INSERT and UPDATE operations on business_rule and other platform metadata tables.

  ## Fix
  Recreate is_system_admin() as SECURITY INVOKER (the default) so auth.uid()
  correctly resolves to the authenticated user's ID from their JWT.
*/

CREATE OR REPLACE FUNCTION is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM crm_user
    WHERE user_id = auth.uid() AND is_system_admin = true
  );
$$;
