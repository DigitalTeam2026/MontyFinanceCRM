/*
  # Fix Opportunity UPDATE RLS - Final

  ## Root Cause
  PostgreSQL applies the SELECT policy's USING clause as an implicit WITH CHECK
  on the NEW row during UPDATE operations. Since the SELECT policy requires
  `is_deleted = false`, setting `is_deleted = true` (soft-delete) causes the
  new row to fail that implicit check, resulting in a 403 error.

  ## Fix
  Drop all existing UPDATE policies on opportunity and replace with a single
  unified UPDATE policy that has explicit WITH CHECK (true), which overrides
  the implicit SELECT-policy-derived check. The USING clause still enforces
  that only authorized users can update records they have access to.

  This mirrors the pattern used successfully on the `account` table.
*/

DROP POLICY IF EXISTS "Users with write privilege can update opportunities they own or have access to" ON opportunity;
DROP POLICY IF EXISTS "Users with write privilege can update opportunities they own or" ON opportunity;
DROP POLICY IF EXISTS "Users with delete privilege can soft-delete opportunities" ON opportunity;

CREATE POLICY "Users with write or delete privilege can update opportunities"
  ON opportunity FOR UPDATE
  TO authenticated
  USING (
    (
      crm_user_has_privilege('opportunity'::text, 'can_write'::text)
      OR crm_user_has_privilege('opportunity'::text, 'can_delete'::text)
    )
    AND crm_user_has_access('opportunity'::text, opportunity_id, owner_type, owner_id)
  )
  WITH CHECK (true);
