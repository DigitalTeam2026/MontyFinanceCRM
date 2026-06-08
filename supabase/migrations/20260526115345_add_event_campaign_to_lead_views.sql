/*
  # Add Event and Campaign columns to all Lead views

  1. Changes
    - Adds the Event lookup field to all Lead view definitions
    - Adds the Campaign lookup field to all Lead view definitions
    - Placed after existing columns (appended at end)

  2. Important Notes
    - Uses NOT EXISTS to avoid duplicates
    - Field definition IDs:
      - Event:    66ff8174-c83f-4ba7-a8e7-1759bc7f29e3
      - Campaign: e02cea29-c751-49d5-aa46-b9f02a25090f
*/

-- Add Event column to all Lead views
INSERT INTO view_column (view_id, field_definition_id, display_order, width, is_sortable, is_hidden)
SELECT 
  vd.view_id,
  '66ff8174-c83f-4ba7-a8e7-1759bc7f29e3',
  COALESCE((SELECT MAX(vc2.display_order) FROM view_column vc2 WHERE vc2.view_id = vd.view_id), 0) + 10,
  150,
  true,
  false
FROM view_definition vd
WHERE vd.entity_definition_id = '2892cad3-04be-47c2-8de0-cc16509e1fcf'
  AND vd.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM view_column vc3
    WHERE vc3.view_id = vd.view_id
      AND vc3.field_definition_id = '66ff8174-c83f-4ba7-a8e7-1759bc7f29e3'
  );

-- Add Campaign column to all Lead views
INSERT INTO view_column (view_id, field_definition_id, display_order, width, is_sortable, is_hidden)
SELECT 
  vd.view_id,
  'e02cea29-c751-49d5-aa46-b9f02a25090f',
  COALESCE((SELECT MAX(vc2.display_order) FROM view_column vc2 WHERE vc2.view_id = vd.view_id), 0) + 10,
  150,
  true,
  false
FROM view_definition vd
WHERE vd.entity_definition_id = '2892cad3-04be-47c2-8de0-cc16509e1fcf'
  AND vd.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM view_column vc3
    WHERE vc3.view_id = vd.view_id
      AND vc3.field_definition_id = 'e02cea29-c751-49d5-aa46-b9f02a25090f'
  );
