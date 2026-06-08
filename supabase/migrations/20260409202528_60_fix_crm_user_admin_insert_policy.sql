/*
  # Fix crm_user admin INSERT policy

  ## Problem
  Admins cannot create new users from Admin Studio because the only INSERT policy
  on crm_user requires `auth.uid() = user_id`, which fails when an admin creates
  a record for a different user.

  ## Changes
  - Add INSERT policy allowing system admins to insert any crm_user record
*/

CREATE POLICY "Admins can insert any user"
  ON crm_user
  FOR INSERT
  TO authenticated
  WITH CHECK (is_system_admin());
