/*
  # Fix gate_required_fields: close_date -> estimatedclosedate

  The Propose and Close stage gate configs reference field name "close_date",
  but the actual field logical name on the Opportunity entity is "estimatedclosedate".
  This mismatch caused the field to be treated as "missing from form" even though
  it is present in the form layout, resulting in it appearing in the inline
  "Fill in here to proceed" section of the stage gate popup instead of the
  "Required fields / Go to field" section.

  This migration corrects both stages to use the proper logical name.
*/

UPDATE public.process_stage
SET gate_required_fields = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'field' = 'close_date'
        THEN jsonb_set(elem, '{field}', '"estimatedclosedate"')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(gate_required_fields) AS elem
)
WHERE stage_key IN ('propose', 'close')
  AND gate_required_fields IS NOT NULL;
