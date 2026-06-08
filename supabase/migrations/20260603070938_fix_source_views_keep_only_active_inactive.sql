
/*
  # Fix Source entity views — keep only Active Sources and Inactive Sources

  Soft-delete the three generic views (Active Records, Inactive Records, All Records)
  that were created by the bootstrap template. The correct views are
  "Active Sources" (default) and "Inactive Sources", which already exist.

  Also ensure "Active Sources" is the only default view.
*/

UPDATE view_definition
SET deleted_at = now(), is_active = false, is_default = false
WHERE entity_definition_id = '672f0481-f23f-42b1-90f4-edc87570a8a1'
  AND view_id IN (
    '7bce07e4-3638-4e79-819d-3b6cb32f46ef', -- Active Records
    '1ddc303f-5b1b-4fab-91d2-c395b72dfa3a', -- Inactive Records
    'd70af2e9-9bb2-4017-94c7-d375dc6d8a1b'  -- All Records
  );

-- Ensure Active Sources is the default
UPDATE view_definition
SET is_default = true
WHERE view_id = 'd62bd1a8-c249-4cd9-82eb-0650cafbeb21';

-- Ensure Inactive Sources is not default
UPDATE view_definition
SET is_default = false
WHERE view_id = 'f516cdf7-e3da-4f58-a583-f36559bcedce';
