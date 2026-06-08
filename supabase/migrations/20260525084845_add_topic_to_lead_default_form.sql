/*
  # Add Topic field to Lead Default Form

  Inserts the Topic field as the first control (display_order 0, column_span 2, full-width)
  in the Lead Information section of the Lead Default Form.
  Shifts existing controls down by incrementing their display_order.

  The topic field_definition_id is dc78b4a2-0099-412c-859e-cd0c94383ad3 (already a system field).
*/

UPDATE form_definition
SET layout_json = jsonb_set(
  layout_json,
  '{tabs,0,sections,0,controls}',
  (
    -- Prepend topic control, then shift existing controls' display_order +1
    jsonb_build_array(
      jsonb_build_object(
        'id', 'ctrl_lead_topic',
        'is_visible', true,
        'column_span', 2,
        'is_readonly', false,
        'control_type', 'field',
        'display_order', 0,
        'label_override', null,
        'subgrid_config', null,
        'field_type_name', 'text',
        'field_display_name', 'Topic',
        'field_logical_name', 'topic',
        'field_definition_id', 'dc78b4a2-0099-412c-859e-cd0c94383ad3',
        'is_required_override', false
      )
    ) ||
    (
      SELECT jsonb_agg(
        ctrl || jsonb_build_object('display_order', (ctrl->>'display_order')::int + 1)
        ORDER BY (ctrl->>'display_order')::int
      )
      FROM jsonb_array_elements(layout_json->'tabs'->0->'sections'->0->'controls') AS ctrl
    )
  )
)
WHERE form_id = 'e7781cd5-3a91-4ca2-8e65-d524b3712941';
