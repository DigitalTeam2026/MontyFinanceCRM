/*
  # Fix Opportunity Soft Delete RLS

  ## Problem
  The UPDATE policy on the opportunity table has a WITH CHECK clause that only validates
  `modified_by = auth.uid()`, but does NOT include the access check in WITH CHECK.
  When bulk-deleting (soft-delete via PATCH setting is_deleted=true), the RLS engine
  evaluates WITH CHECK on the new row values and the check fails because it doesn't
  confirm the user still has access.

  ## Changes
  - Drop the existing UPDATE policy on `opportunity`
  - Re-create it with a proper WITH CHECK that mirrors the USING clause access check,
    so soft-deletes (and regular updates) pass correctly for users with write privilege
    who have access to the record
*/

DROP POLICY IF EXISTS "Users with write privilege can update opportunities they have a" ON opportunity;

CREATE POLICY "Users with write privilege can update opportunities they own or have access to"
  ON opportunity
  FOR UPDATE
  TO authenticated
  USING (
    crm_user_has_privilege('opportunity'::text, 'can_write'::text)
    AND crm_user_has_access('opportunity'::text, opportunity_id, owner_type, owner_id)
  )
  WITH CHECK (
    crm_user_has_privilege('opportunity'::text, 'can_write'::text)
    AND (modified_by = auth.uid())
  );
