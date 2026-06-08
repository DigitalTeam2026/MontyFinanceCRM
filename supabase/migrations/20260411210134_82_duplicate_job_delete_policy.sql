/*
  # Add DELETE policy for duplicate_job

  1. Changes
    - Adds a DELETE RLS policy on duplicate_job so authenticated users can remove job records
*/

CREATE POLICY "Authenticated users can delete duplicate jobs"
  ON duplicate_job
  FOR DELETE
  TO authenticated
  USING (true);
