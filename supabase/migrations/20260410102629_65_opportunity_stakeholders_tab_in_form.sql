/*
  # Add Stakeholders Tab to Opportunity Form Layout

  ## Overview
  Appends a "Related" tab to the Opportunity main form that contains a custom
  "opportunity_contacts" subgrid control. This surfaces the new many-to-many
  stakeholder panel directly on the opportunity record form.

  ## Changes
  - Opportunity Main Form (id: e7781cd5-3a91-4ca2-8e65-d524b3712941):
    adds a "Related" tab with a Stakeholders subgrid section using the
    `opportunity_contacts` config key which the frontend maps to
    OpportunityContactsPanel.

  ## Notes
  - The related_entity_name "opportunity_contacts" is a special key recognised
    by RecordFormPage to render the custom OpportunityContactsPanel component
    instead of the generic FormSubgrid.
*/

UPDATE form_definition
SET layout_json = jsonb_set(
  layout_json,
  '{tabs}',
  (layout_json->'tabs') || '[
    {
      "id": "tab_opp_related",
      "name": "related",
      "label": "Related",
      "display_order": 2,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_opp_stakeholders",
          "name": "stakeholders",
          "label": "Stakeholders",
          "columns": 1,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {
              "id": "ctrl_opp_contacts_sg",
              "control_type": "subgrid",
              "field_definition_id": null,
              "field_logical_name": null,
              "field_display_name": "Stakeholders",
              "field_type_name": null,
              "label_override": "Stakeholders",
              "column_span": 1,
              "is_visible": true,
              "is_readonly": false,
              "is_required_override": false,
              "subgrid_config": {
                "related_entity_id": "",
                "related_entity_name": "opportunity_contacts",
                "relationship_field": "opportunity_id",
                "rows_to_show": 10,
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
WHERE form_id = 'e7781cd5-3a91-4ca2-8e65-d524b3712941';
