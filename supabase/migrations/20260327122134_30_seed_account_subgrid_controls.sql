/*
  # Seed Subgrid Controls into Account Form Layout

  ## Overview
  Adds a "Related Records" tab to the Account main form layout with subgrid
  controls for Contacts, Opportunities, and Tickets.

  ## Changes
  - Account Main Form: adds a "Related" tab containing subgrid sections
    - Contacts subgrid (relationship: account_id)
    - Opportunities subgrid (relationship: account_id)
    - Tickets subgrid (relationship: account_id)

  These subgrids are driven by the new FormSubgrid component that uses
  the subgrid_config.related_entity_name to look up the SUBGRID_CONFIGS
  map in the frontend.
*/

UPDATE form_definition
SET layout_json = jsonb_set(
  layout_json,
  '{tabs}',
  (layout_json->'tabs') || '[
    {
      "id": "tab_related",
      "name": "related",
      "label": "Related",
      "display_order": 3,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_contacts_subgrid",
          "name": "contacts_subgrid",
          "label": "Contacts",
          "columns": 1,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {
              "id": "ctrl_contacts_sg",
              "control_type": "subgrid",
              "field_definition_id": null,
              "field_logical_name": null,
              "field_display_name": "Contacts",
              "field_type_name": null,
              "label_override": "Contacts",
              "column_span": 1,
              "is_visible": true,
              "is_readonly": false,
              "is_required_override": false,
              "subgrid_config": {
                "related_entity_id": "",
                "related_entity_name": "contact",
                "relationship_field": "account_id",
                "rows_to_show": 8,
                "allow_create": true,
                "allow_associate": false
              }
            }
          ]
        },
        {
          "id": "sec_opps_subgrid",
          "name": "opps_subgrid",
          "label": "Opportunities",
          "columns": 1,
          "display_order": 1,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {
              "id": "ctrl_opps_sg",
              "control_type": "subgrid",
              "field_definition_id": null,
              "field_logical_name": null,
              "field_display_name": "Opportunities",
              "field_type_name": null,
              "label_override": "Opportunities",
              "column_span": 1,
              "is_visible": true,
              "is_readonly": false,
              "is_required_override": false,
              "subgrid_config": {
                "related_entity_id": "",
                "related_entity_name": "opportunity",
                "relationship_field": "account_id",
                "rows_to_show": 8,
                "allow_create": true,
                "allow_associate": false
              }
            }
          ]
        },
        {
          "id": "sec_tickets_subgrid",
          "name": "tickets_subgrid",
          "label": "Tickets",
          "columns": 1,
          "display_order": 2,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {
              "id": "ctrl_tickets_sg",
              "control_type": "subgrid",
              "field_definition_id": null,
              "field_logical_name": null,
              "field_display_name": "Tickets",
              "field_type_name": null,
              "label_override": "Tickets",
              "column_span": 1,
              "is_visible": true,
              "is_readonly": false,
              "is_required_override": false,
              "subgrid_config": {
                "related_entity_id": "",
                "related_entity_name": "ticket",
                "relationship_field": "account_id",
                "rows_to_show": 8,
                "allow_create": true,
                "allow_associate": false
              }
            }
          ]
        }
      ]
    }
  ]'::jsonb
)
WHERE form_id = '8a6fcaf8-1259-4d8f-a25b-bdbeb285a52e';
