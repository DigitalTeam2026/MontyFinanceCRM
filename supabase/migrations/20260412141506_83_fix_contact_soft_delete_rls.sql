/*
  # Fix Contact Soft Delete RLS

  ## Problem
  Two issues prevent soft-deleting contacts:

  1. The existing UPDATE policy only checks `can_write`, so users with `can_delete` but
     not `can_write` cannot soft-delete. More importantly, its WITH CHECK requires
     `modified_by = auth.uid()` and `can_write`, which blocks the delete path.

  2. When PostgreSQL executes an UPDATE it re-checks the SELECT policy on the post-update
     row. The current SELECT policy requires `is_deleted = false`, so setting
     `is_deleted = true` causes the post-update visibility check to fail with a 403.

  ## Fix
  1. Replace the existing UPDATE policy with a merged policy that allows both writes
     (can_write) and soft-deletes (can_delete).
  2. Add a permissive SELECT policy that allows users to see their own soft-deleted
     contacts, satisfying the post-update visibility check.
*/

DROP POLICY IF EXISTS "Users with write privilege can update contacts they have access" ON contact;

CREATE POLICY "Users can update or soft-delete contacts based on privileges"
  ON contact
  FOR UPDATE
  TO authenticated
  USING (
    (
      crm_user_has_privilege('contact', 'can_write')
      AND crm_user_has_access('contact', contact_id, owner_type, owner_id)
    )
    OR
    (
      crm_user_has_privilege('contact', 'can_delete')
      AND (
        (owner_type = 'user' AND owner_id = auth.uid())
        OR is_system_admin()
      )
    )
  )
  WITH CHECK (
    (
      crm_user_has_privilege('contact', 'can_write')
      AND (modified_by = auth.uid())
    )
    OR
    (
      crm_user_has_privilege('contact', 'can_delete')
      AND (
        (owner_type = 'user' AND owner_id = auth.uid())
        OR is_system_admin()
      )
    )
  );

CREATE POLICY "Users can see their own soft-deleted contacts for update"
  ON contact
  FOR SELECT
  TO authenticated
  USING (
    is_deleted = true
    AND (
      is_system_admin()
      OR (owner_type = 'user' AND owner_id = auth.uid())
      OR (owner_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu WHERE tu.team_id = owner_id AND tu.user_id = auth.uid()
      ))
    )
  );
