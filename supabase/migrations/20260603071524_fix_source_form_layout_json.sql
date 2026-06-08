
/*
  # Fix Source entity form layout_json

  The Source Main Form and Source Quick Create forms had malformed layout_json
  structures — controls were missing required fields (is_visible, column_span,
  is_readonly, field_type_name, field_display_name, is_required_override).
  The quick_create form also used wrong keys (col_span, label, required).

  This migration rebuilds both forms with the correct structure matching
  the standard used by all other system entities.
*/

-- Fix Source Main Form
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
          "id": "sec_info",
          "name": "source_info",
          "label": "Source Information",
          "columns": 2,
          "is_visible": true,
          "is_collapsed": false,
          "display_order": 0,
          "controls": [
            {
              "id": "ctrl_name",
              "is_visible": true,
              "column_span": 1,
              "is_readonly": false,
              "control_type": "field",
              "field_type_name": "text",
              "field_display_name": "Name",
              "field_logical_name": "name",
              "field_definition_id": "e3ee930e-b3a1-4702-9101-b76e30019280",
              "is_required_override": true
            },
            {
              "id": "ctrl_description",
              "is_visible": true,
              "column_span": 2,
              "is_readonly": false,
              "control_type": "field",
              "field_type_name": "text",
              "field_display_name": "Description",
              "field_logical_name": "description",
              "field_definition_id": "7eb38c15-2b6a-4100-a917-0862a51fed39",
              "is_required_override": false
            }
          ]
        }
      ]
    },
    {
      "id": "tab_system",
      "name": "system_info",
      "label": "System",
      "is_visible": true,
      "display_order": 99,
      "sections": [
        {
          "id": "sec_system",
          "name": "system_fields",
          "label": "System Information",
          "columns": 2,
          "is_visible": true,
          "is_collapsed": true,
          "display_order": 0,
          "controls": [
            {
              "id": "ctrl_createdon",
              "is_visible": true,
              "column_span": 1,
              "is_readonly": true,
              "control_type": "field",
              "field_type_name": "datetime",
              "field_display_name": "Created On",
              "field_logical_name": "createdon",
              "field_definition_id": "92c2a32a-dc96-4701-aa77-97d780be3b0f",
              "is_required_override": false
            },
            {
              "id": "ctrl_modifiedon",
              "is_visible": true,
              "column_span": 1,
              "is_readonly": true,
              "control_type": "field",
              "field_type_name": "datetime",
              "field_display_name": "Modified On",
              "field_logical_name": "modifiedon",
              "field_definition_id": "c8914322-0a1e-4e1a-a1c6-f817a71e5e8f",
              "is_required_override": false
            }
          ]
        }
      ]
    }
  ]
}'::jsonb
WHERE form_id = '3a2b6eea-bb29-4f00-a0f4-a943440bfef0';

-- Fix Source Quick Create Form
UPDATE form_definition
SET layout_json = '{
  "tabs": [
    {
      "id": "tab_main",
      "name": "main",
      "label": "Details",
      "is_visible": true,
      "display_order": 0,
      "sections": [
        {
          "id": "sec_qc",
          "name": "quick_create",
          "label": "Source Information",
          "columns": 1,
          "is_visible": true,
          "is_collapsed": false,
          "display_order": 0,
          "controls": [
            {
              "id": "ctrl_qc_name",
              "is_visible": true,
              "column_span": 1,
              "is_readonly": false,
              "control_type": "field",
              "field_type_name": "text",
              "field_display_name": "Name",
              "field_logical_name": "name",
              "field_definition_id": "e3ee930e-b3a1-4702-9101-b76e30019280",
              "is_required_override": true
            },
            {
              "id": "ctrl_qc_description",
              "is_visible": true,
              "column_span": 1,
              "is_readonly": false,
              "control_type": "field",
              "field_type_name": "text",
              "field_display_name": "Description",
              "field_logical_name": "description",
              "field_definition_id": "7eb38c15-2b6a-4100-a917-0862a51fed39",
              "is_required_override": false
            }
          ]
        }
      ]
    }
  ]
}'::jsonb
WHERE form_id = '451b3a83-9325-4419-a221-9a18900601b9';
