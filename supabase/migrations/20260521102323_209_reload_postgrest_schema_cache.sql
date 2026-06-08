/*
  # Reload PostgREST schema cache

  Forces PostgREST to reload its schema cache so that crm_sources and any
  other recently-created tables become visible via the REST API.
  Also fixes the SELECT policy on crm_sources to properly check auth.uid().
*/

-- Drop and recreate the overly-permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view sources" ON crm_sources;

CREATE POLICY "Authenticated users can view sources"
  ON crm_sources
  FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM crm_user
      WHERE crm_user.user_id = auth.uid()
        AND crm_user.is_active = true
    )
  );

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
