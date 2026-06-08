/*
  # Fix recent_items duplicate entries

  ## Problem
  The recent_items table was missing a unique constraint on (user_id, entity, record_id),
  causing the upsert to insert duplicates instead of updating the existing row.

  ## Changes
  1. Delete duplicate rows, keeping only the most recently viewed per (user_id, entity, record_id)
  2. Add unique constraint on (user_id, entity, record_id)
*/

DELETE FROM recent_items
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, entity, record_id) id
  FROM recent_items
  ORDER BY user_id, entity, record_id, viewed_at DESC
);

ALTER TABLE recent_items
  ADD CONSTRAINT recent_items_user_entity_record_unique
  UNIQUE (user_id, entity, record_id);
