/*
  # Drop industry table

  1. Changes
    - Drops the `industry` table (20 rows) so it can be recreated fresh
    - Drops any dependent foreign key references first

  2. Notes
    - User requested deletion to recreate with a new structure
*/

-- Remove FK on account if it references industry
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE '%industry%' AND table_name = 'account'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE account DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE constraint_name LIKE '%industry%' AND table_name = 'account'
      LIMIT 1
    );
  END IF;
END $$;

DROP TABLE IF EXISTS industry CASCADE;
