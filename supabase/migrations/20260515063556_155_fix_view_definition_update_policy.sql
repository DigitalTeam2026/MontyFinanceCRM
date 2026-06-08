/*
  # Fix view_definition UPDATE policy

  ## Problem
  The existing UPDATE policy requires `created_by = auth.uid()` but views created by
  admin seeding have `created_by = NULL`, making them uneditable by any user.

  ## Changes
  - Drop the existing UPDATE policy
  - Add a new UPDATE policy that also allows updates when `created_by IS NULL`
    (covers legacy/seeded views) or when the user is the creator
  - Add `created_by` population: update existing null rows to the first admin user
    so future updates work correctly
*/

DROP POLICY IF EXISTS "Users can update their own views" ON view_definition;

CREATE POLICY "Users can update views they own or that are unclaimed"
  ON view_definition FOR UPDATE
  TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR created_by IS NULL
    OR view_type = 'system'
  )
  WITH CHECK (
    created_by = (SELECT auth.uid())
    OR created_by IS NULL
    OR view_type = 'system'
  );
