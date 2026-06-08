/*
  # Per-Action Access Levels on Role Privileges

  ## Summary
  Replaces the single shared `access_level` column on `role_privilege` with six
  individual access-level columns — one per CRUD+assign+share action.

  ## Changes to `role_privilege`
  - Add `create_access_level` (text, default 'user') — scope for Create
  - Add `read_access_level`   (text, default 'user') — scope for Read
  - Add `write_access_level`  (text, default 'user') — scope for Write
  - Add `delete_access_level` (text, default 'user') — scope for Delete
  - Add `assign_access_level` (text, default 'user') — scope for Assign
  - Add `share_access_level`  (text, default 'user') — scope for Share
  - Migrate existing `access_level` value into all six new columns
  - Keep `access_level` column untouched for now to avoid data loss

  ## Notes
  - The old `access_level` column is left in place; the application will stop
    reading it but the data remains safe.
  - All six new columns default to 'user', matching the prior single default.
  - Existing rows are migrated: each new column inherits the old access_level value.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'role_privilege' AND column_name = 'create_access_level'
  ) THEN
    ALTER TABLE role_privilege ADD COLUMN create_access_level text NOT NULL DEFAULT 'user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'role_privilege' AND column_name = 'read_access_level'
  ) THEN
    ALTER TABLE role_privilege ADD COLUMN read_access_level text NOT NULL DEFAULT 'user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'role_privilege' AND column_name = 'write_access_level'
  ) THEN
    ALTER TABLE role_privilege ADD COLUMN write_access_level text NOT NULL DEFAULT 'user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'role_privilege' AND column_name = 'delete_access_level'
  ) THEN
    ALTER TABLE role_privilege ADD COLUMN delete_access_level text NOT NULL DEFAULT 'user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'role_privilege' AND column_name = 'assign_access_level'
  ) THEN
    ALTER TABLE role_privilege ADD COLUMN assign_access_level text NOT NULL DEFAULT 'user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'role_privilege' AND column_name = 'share_access_level'
  ) THEN
    ALTER TABLE role_privilege ADD COLUMN share_access_level text NOT NULL DEFAULT 'user';
  END IF;
END $$;

UPDATE role_privilege
SET
  create_access_level = access_level,
  read_access_level   = access_level,
  write_access_level  = access_level,
  delete_access_level = access_level,
  assign_access_level = access_level,
  share_access_level  = access_level
WHERE
  access_level IS NOT NULL
  AND create_access_level = 'user'
  AND read_access_level   = 'user'
  AND write_access_level  = 'user'
  AND delete_access_level = 'user'
  AND assign_access_level = 'user'
  AND share_access_level  = 'user';
