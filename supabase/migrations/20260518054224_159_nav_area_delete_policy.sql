/*
  # Add missing DELETE policy for nav_area

  The nav_area table was missing a DELETE policy, preventing system admins
  from hard-deleting nav areas. Soft-delete (UPDATE) already worked.
  This adds the missing DELETE policy consistent with other nav tables.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'nav_area' AND cmd = 'DELETE'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "System admins can delete nav areas"
        ON nav_area FOR DELETE
        TO authenticated
        USING (is_system_admin())
    $policy$;
  END IF;
END $$;
