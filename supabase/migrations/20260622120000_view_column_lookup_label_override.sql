-- Per-view override for which field a lookup column's filter/display uses.
-- NULL = fall back to the lookup entity's primary field + LOOKUP_LABEL_FALLBACKS.
-- Lets each view search/display the same lookup column by a different field
-- (e.g. search "Originating Lead" by `topic` in one view, `company_name` in another).
ALTER TABLE view_column
  ADD COLUMN IF NOT EXISTS lookup_label_field_override text;

COMMENT ON COLUMN view_column.lookup_label_field_override IS
  'Per-view override of the physical field used to search/display a lookup column. NULL = entity primary field + fallbacks.';

-- Reload PostgREST schema cache so the new column is queryable immediately.
NOTIFY pgrst, 'reload schema';
