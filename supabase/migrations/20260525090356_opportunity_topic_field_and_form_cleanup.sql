/*
  # Opportunity: Topic field + form/field cleanup

  1. Deactivate 6 field_definitions: name, stagecode, stage, productid, estimatedvalue, closeprobability
  2. Insert new system field_definition "Topic" (logical=topic, physical=topic)
  3. Rewrite Opportunity Main Form: replace name/stage/product/estvalue/probability with topic
  4. Rewrite MontyPay-PG Form: remove same fields, add topic if missing
  5. Remove deactivated field view_columns from all opportunity views
  6. Add topic view_column to all opportunity views
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Deactivate old field definitions
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE field_definition
SET is_active = false
WHERE field_definition_id IN (
  'ab7a8c63-8fba-4a82-942d-97d2b79003e5',
  'd5371da0-486c-4663-8944-364da626ce67',
  'a3b786f0-e118-4b4f-8b32-2ad77c839935',
  '6507973d-4348-4216-b39e-c19501ecf4ec',
  '167639a3-4fe4-4935-97c3-1b47fa2ad234',
  '41a3aca9-d91e-4ae2-b67d-0269f87e1aff'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Insert new Topic system field (skip if already active)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO field_definition (
  entity_definition_id, logical_name, display_name, physical_column_name,
  field_type_id, is_required, is_searchable, is_sortable, is_filterable,
  is_system, is_custom, is_active, is_deletable, is_schema_editable,
  sort_order, created_at, modified_at
)
SELECT
  'e9482035-8715-40fa-a9d3-794c5b963c95',
  'topic', 'Topic', 'topic',
  '42369027-c4a5-446c-affd-df4c45b053ec',
  false, true, true, true,
  true, false, true, false, false,
  5, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM field_definition
  WHERE entity_definition_id = 'e9482035-8715-40fa-a9d3-794c5b963c95'
    AND logical_name = 'topic'
    AND is_active = true
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Rewrite Opportunity Main Form layout_json
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE form_definition
SET layout_json = '{
  "tabs": [
    {
      "id": "tab_general",
      "name": "general",
      "label": "General",
      "is_visible": true,
      "display_order": 0,
      "sections": [
        {
          "id": "sec_opp_info",
          "name": "opportunity_info",
          "label": "Opportunity Information",
          "columns": 2,
          "is_visible": true,
          "is_collapsed": false,
          "display_order": 0,
          "controls": [
            {
              "id": "ctrl_opp_topic",
              "control_type": "field",
              "field_logical_name": "topic",
              "field_display_name": "Topic",
              "field_type_name": "text",
              "field_definition_id": null,
              "column_span": 2,
              "display_order": 0,
              "is_visible": true,
              "is_readonly": false,
              "is_required_override": true,
              "label_override": null,
              "subgrid_config": null,
              "lookup_config": null
            },
            {
              "id": "c2",
              "control_type": "field",
              "field_logical_name": "parentaccountid",
              "field_display_name": "Account",
              "field_type_name": "lookup",
              "field_definition_id": "716b80a2-4e43-4691-a6d1-51d8fd657109",
              "column_span": 1,
              "display_order": 1,
              "is_visible": true,
              "is_readonly": false,
              "is_required_override": false,
              "label_override": null,
              "subgrid_config": null,
              "lookup_config": {
                "default_view_id": null,
                "filter_fk_column": null,
                "target_entity_id": "e8c85d9b-2883-416e-8b49-1e83e641c530",
                "filter_relationship_id": null,
                "filter_by_field_logical_name": null
              }
            },
            {
              "id": "c3",
              "control_type": "field",
              "field_logical_name": "parentcontactid",
              "field_display_name": "Contact",
              "field_type_name": "lookup",
              "field_definition_id": "2aa89764-cde7-4eae-b186-cd09a9c7d727",
              "column_span": 1,
              "display_order": 2,
              "is_visible": true,
              "is_readonly": false,
              "is_required_override": false,
              "label_override": null,
              "subgrid_config": null,
              "lookup_config": {
                "default_view_id": null,
                "filter_fk_column": null,
                "target_entity_id": "bbb2b0af-2d11-46dc-9316-52106b816825",
                "filter_relationship_id": null,
                "filter_by_field_logical_name": null
              }
            },
            {
              "id": "c5",
              "control_type": "field",
              "field_logical_name": "statuscode",
              "field_display_name": "Status",
              "field_type_name": "choice",
              "field_definition_id": "725d50f5-d439-4c81-b9e4-7abb9b359b19",
              "column_span": 1,
              "display_order": 3,
              "is_visible": true,
              "is_readonly": false,
              "is_required_override": false,
              "label_override": null,
              "subgrid_config": null
            },
            {
              "id": "c7",
              "control_type": "field",
              "field_logical_name": "estimatedclosedate",
              "field_display_name": "Close Date",
              "field_type_name": "date",
              "field_definition_id": "d499fbae-2af1-4bba-bad8-9de18c07f1a9",
              "column_span": 1,
              "display_order": 4,
              "is_visible": true,
              "is_readonly": false,
              "is_required_override": false,
              "label_override": null,
              "subgrid_config": null
            }
          ]
        },
        {
          "id": "sec_desc",
          "name": "description",
          "label": "Description",
          "columns": 1,
          "is_visible": true,
          "is_collapsed": false,
          "display_order": 1,
          "controls": [
            {
              "id": "c10",
              "control_type": "field",
              "field_logical_name": "description",
              "field_display_name": "Description",
              "field_type_name": "textarea",
              "field_definition_id": "43467693-cece-4e33-a2cf-b5465a4f8376",
              "column_span": 1,
              "display_order": 0,
              "is_visible": true,
              "is_readonly": false,
              "is_required_override": false,
              "label_override": null,
              "subgrid_config": null
            }
          ]
        }
      ]
    },
    {
      "id": "tab_system",
      "name": "system",
      "label": "System",
      "is_visible": true,
      "display_order": 1,
      "sections": [
        {
          "id": "sec_audit",
          "name": "audit",
          "label": "Audit",
          "columns": 2,
          "is_visible": true,
          "is_collapsed": false,
          "display_order": 0,
          "controls": [
            {
              "id": "cs1",
              "control_type": "field",
              "field_logical_name": "createdon",
              "field_display_name": "Created On",
              "field_type_name": "datetime",
              "field_definition_id": "309a0efe-36a8-49e2-acfa-00c16786f286",
              "column_span": 1,
              "display_order": 0,
              "is_visible": true,
              "is_readonly": true,
              "is_required_override": false,
              "label_override": null,
              "subgrid_config": null
            },
            {
              "id": "cs2",
              "control_type": "field",
              "field_logical_name": "modifiedon",
              "field_display_name": "Modified On",
              "field_type_name": "datetime",
              "field_definition_id": "02bf9390-661d-4f21-85c9-b472f256a785",
              "column_span": 1,
              "display_order": 1,
              "is_visible": true,
              "is_readonly": true,
              "is_required_override": false,
              "label_override": null,
              "subgrid_config": null
            }
          ]
        }
      ]
    }
  ]
}'::jsonb
WHERE form_id = '1a49940b-900e-4784-bda2-5d0bcc35ba90';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Clean MontyPay-PG Form: remove deleted field controls, add topic
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 4a: strip the removed fields from controls array
UPDATE form_definition
SET layout_json = jsonb_set(
  layout_json,
  '{tabs,0,sections,0,controls}',
  (
    SELECT COALESCE(jsonb_agg(ctrl ORDER BY (ctrl->>'display_order')::int), '[]'::jsonb)
    FROM jsonb_array_elements(layout_json->'tabs'->0->'sections'->0->'controls') ctrl
    WHERE (ctrl->>'field_logical_name') NOT IN ('name','stagecode','stage','productid','estimatedvalue','closeprobability')
  )
)
WHERE form_id = 'bc9e76aa-e2f3-47fd-b0f9-67539ab0c535';

-- Step 4b: prepend topic if not already present
UPDATE form_definition
SET layout_json = jsonb_set(
  layout_json,
  '{tabs,0,sections,0,controls}',
  jsonb_build_array(
    jsonb_build_object(
      'id', 'ctrl_opp_topic_mp',
      'control_type', 'field',
      'field_logical_name', 'topic',
      'field_display_name', 'Topic',
      'field_type_name', 'text',
      'field_definition_id', null,
      'column_span', 2,
      'display_order', 0,
      'is_visible', true,
      'is_readonly', false,
      'is_required_override', true,
      'label_override', null,
      'subgrid_config', null
    )
  ) ||
  (
    SELECT COALESCE(jsonb_agg(
      ctrl || jsonb_build_object('display_order', (ctrl->>'display_order')::int + 1)
      ORDER BY (ctrl->>'display_order')::int
    ), '[]'::jsonb)
    FROM jsonb_array_elements(layout_json->'tabs'->0->'sections'->0->'controls') ctrl
  )
)
WHERE form_id = 'bc9e76aa-e2f3-47fd-b0f9-67539ab0c535'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(layout_json->'tabs'->0->'sections'->0->'controls') c
    WHERE c->>'field_logical_name' = 'topic'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Remove deactivated view columns from opportunity views
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM view_column
WHERE field_definition_id IN (
  'ab7a8c63-8fba-4a82-942d-97d2b79003e5',
  'd5371da0-486c-4663-8944-364da626ce67',
  'a3b786f0-e118-4b4f-8b32-2ad77c839935',
  '6507973d-4348-4216-b39e-c19501ecf4ec',
  '167639a3-4fe4-4935-97c3-1b47fa2ad234',
  '41a3aca9-d91e-4ae2-b67d-0269f87e1aff'
)
AND view_id IN (
  SELECT view_id FROM view_definition
  WHERE entity_definition_id = 'e9482035-8715-40fa-a9d3-794c5b963c95'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Add topic view_column to all opportunity views that are missing it
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_topic_fd_id uuid;
  v_view record;
BEGIN
  SELECT field_definition_id INTO v_topic_fd_id
  FROM field_definition
  WHERE entity_definition_id = 'e9482035-8715-40fa-a9d3-794c5b963c95'
    AND logical_name = 'topic'
    AND is_active = true
  LIMIT 1;

  IF v_topic_fd_id IS NULL THEN RETURN; END IF;

  FOR v_view IN
    SELECT vd.view_id FROM view_definition vd
    WHERE vd.entity_definition_id = 'e9482035-8715-40fa-a9d3-794c5b963c95'
    AND NOT EXISTS (
      SELECT 1 FROM view_column vc2
      WHERE vc2.view_id = vd.view_id AND vc2.field_definition_id = v_topic_fd_id
    )
  LOOP
    INSERT INTO view_column (view_id, field_definition_id, display_order, is_sortable, is_hidden)
    VALUES (v_view.view_id, v_topic_fd_id, 0, true, false)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
