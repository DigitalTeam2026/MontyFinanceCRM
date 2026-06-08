/*
  # Fix View Column Duplicates and Add Unique Constraint

  ## Changes

  ### 1. Clean existing duplicate view_column rows
  - Keep the first occurrence (lowest display_order) for each unique combination
  - Delete all subsequent duplicates
  - Recalculate display_order to be sequential after cleanup

  ### 2. Add partial unique indexes
  - For current-entity columns (no relationship): unique on (view_id, field_definition_id)
    where relationship_definition_id IS NULL
  - For related columns: unique on (view_id, field_definition_id, relationship_definition_id)
    where relationship_definition_id IS NOT NULL
*/

-- ─── Step 1: Delete duplicates, keeping only the first by display_order ─────
DELETE FROM public.view_column
WHERE view_column_id IN (
  SELECT view_column_id FROM (
    SELECT
      view_column_id,
      ROW_NUMBER() OVER (
        PARTITION BY view_id, field_definition_id, COALESCE(relationship_definition_id::text, '')
        ORDER BY display_order ASC
      ) AS rn
    FROM public.view_column
  ) ranked
  WHERE rn > 1
);

-- ─── Step 2: Recalculate display_order to be sequential within each view ─────
WITH ordered AS (
  SELECT
    view_column_id,
    ROW_NUMBER() OVER (PARTITION BY view_id ORDER BY display_order ASC) - 1 AS new_order
  FROM public.view_column
)
UPDATE public.view_column vc
SET display_order = o.new_order
FROM ordered o
WHERE vc.view_column_id = o.view_column_id;

-- ─── Step 3: Unique index for current-entity columns (no relationship) ────────
DROP INDEX IF EXISTS public.uq_view_column_no_rel;
CREATE UNIQUE INDEX uq_view_column_no_rel
  ON public.view_column (view_id, field_definition_id)
  WHERE relationship_definition_id IS NULL;

-- ─── Step 4: Unique index for related columns (with relationship) ─────────────
DROP INDEX IF EXISTS public.uq_view_column_with_rel;
CREATE UNIQUE INDEX uq_view_column_with_rel
  ON public.view_column (view_id, field_definition_id, relationship_definition_id)
  WHERE relationship_definition_id IS NOT NULL;
