/*
  # Seed Forms for System Entities: Business Unit, Currency, Security Role, Team

  ## Summary
  Creates main, quick create, and quick view forms for four system entities
  that previously had no forms defined.

  ## Entities
  1. Business Unit  (entity_definition_id: 33d6f250-7376-4f10-acab-49cbba9a9e9a)
  2. Currency       (entity_definition_id: 9ddb2a99-5f32-4c97-a022-bc3eb63c449d)
  3. Security Role  (entity_definition_id: e3319109-c732-4191-809e-96cbdac1c5a6)
  4. Team           (entity_definition_id: b057f86e-9e38-4a5b-b543-273cd9899175)

  ## Forms per entity
  - Main Form      (form_type = 'main')      — full layout with tabs and sections
  - Quick Create   (form_type = 'quick_create') — minimal fields for fast creation
  - Quick View     (form_type = 'quick_view')   — read-only summary fields

  ## Security
  - All forms are system forms (is_system = true, is_deletable = false)
  - No new tables created; no RLS changes needed
*/

-- ============================================================
-- BUSINESS UNIT
-- ============================================================

INSERT INTO form_definition (
  entity_definition_id, name, form_type, description,
  is_default, is_active, is_system, is_deletable, is_published
) VALUES
  ('33d6f250-7376-4f10-acab-49cbba9a9e9a', 'Business Unit Main Form',   'main',         'Default main form for Business Unit',   true,  true, true, false, true),
  ('33d6f250-7376-4f10-acab-49cbba9a9e9a', 'Business Unit Quick Create','quick_create', 'Quick create form for Business Unit',   false, true, true, false, true),
  ('33d6f250-7376-4f10-acab-49cbba9a9e9a', 'Business Unit Quick View',  'quick_view',   'Quick view form for Business Unit',     false, true, true, false, true)
ON CONFLICT DO NOTHING;

UPDATE form_definition
SET layout_json = '{
  "tabs": [
    {
      "id": "tab_general",
      "name": "general",
      "label": "General",
      "display_order": 0,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_bu_info",
          "name": "bu_info",
          "label": "Business Unit Information",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"bu_c1","control_type":"field","field_definition_id":"5490f68d-9352-4fca-ab65-9da889f1f8d6","field_logical_name":"name","field_display_name":"Name","field_type_name":"text","label_override":null,"column_span":2,"is_visible":true,"is_readonly":false,"is_required_override":true,"subgrid_config":null},
            {"id":"bu_c2","control_type":"field","field_definition_id":"0e4ef943-08a3-4903-abaf-47b30b81618d","field_logical_name":"parent_business_unit_id","field_display_name":"Parent Business Unit","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"bu_c3","control_type":"field","field_definition_id":"124f74ce-aee0-4afb-930a-9e0ba4f0d3ff","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        },
        {
          "id": "sec_bu_desc",
          "name": "bu_desc",
          "label": "Description",
          "columns": 1,
          "display_order": 1,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"bu_c4","control_type":"field","field_definition_id":"fded0167-7b41-48c6-85a0-04f27f073ee7","field_logical_name":"description","field_display_name":"Description","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    },
    {
      "id": "tab_audit",
      "name": "audit",
      "label": "Audit",
      "display_order": 1,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_bu_audit",
          "name": "bu_audit",
          "label": "Audit Information",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"bu_c5","control_type":"field","field_definition_id":"931359a1-6d92-4693-946e-3e1a9eb5727e","field_logical_name":"created_at","field_display_name":"Created At","field_type_name":"datetime","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"bu_c6","control_type":"field","field_definition_id":"581cef31-f7f4-45f9-a551-b9ef37779245","field_logical_name":"modified_at","field_display_name":"Modified At","field_type_name":"datetime","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'
WHERE entity_definition_id = '33d6f250-7376-4f10-acab-49cbba9a9e9a'
  AND form_type = 'main' AND name = 'Business Unit Main Form';

UPDATE form_definition
SET layout_json = '{
  "tabs": [
    {
      "id": "tab_general",
      "name": "general",
      "label": "General",
      "display_order": 0,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_qc",
          "name": "qc",
          "label": "Business Unit",
          "columns": 1,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"bu_qc1","control_type":"field","field_definition_id":"5490f68d-9352-4fca-ab65-9da889f1f8d6","field_logical_name":"name","field_display_name":"Name","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":true,"subgrid_config":null},
            {"id":"bu_qc2","control_type":"field","field_definition_id":"0e4ef943-08a3-4903-abaf-47b30b81618d","field_logical_name":"parent_business_unit_id","field_display_name":"Parent Business Unit","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'
WHERE entity_definition_id = '33d6f250-7376-4f10-acab-49cbba9a9e9a'
  AND form_type = 'quick_create' AND name = 'Business Unit Quick Create';

UPDATE form_definition
SET layout_json = '{
  "tabs": [
    {
      "id": "tab_general",
      "name": "general",
      "label": "General",
      "display_order": 0,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_qv",
          "name": "qv",
          "label": "Business Unit",
          "columns": 1,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"bu_qv1","control_type":"field","field_definition_id":"5490f68d-9352-4fca-ab65-9da889f1f8d6","field_logical_name":"name","field_display_name":"Name","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"bu_qv2","control_type":"field","field_definition_id":"0e4ef943-08a3-4903-abaf-47b30b81618d","field_logical_name":"parent_business_unit_id","field_display_name":"Parent Business Unit","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"bu_qv3","control_type":"field","field_definition_id":"124f74ce-aee0-4afb-930a-9e0ba4f0d3ff","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'
WHERE entity_definition_id = '33d6f250-7376-4f10-acab-49cbba9a9e9a'
  AND form_type = 'quick_view' AND name = 'Business Unit Quick View';


-- ============================================================
-- CURRENCY
-- ============================================================

INSERT INTO form_definition (
  entity_definition_id, name, form_type, description,
  is_default, is_active, is_system, is_deletable, is_published
) VALUES
  ('9ddb2a99-5f32-4c97-a022-bc3eb63c449d', 'Currency Main Form',   'main',         'Default main form for Currency',   true,  true, true, false, true),
  ('9ddb2a99-5f32-4c97-a022-bc3eb63c449d', 'Currency Quick Create','quick_create', 'Quick create form for Currency',   false, true, true, false, true),
  ('9ddb2a99-5f32-4c97-a022-bc3eb63c449d', 'Currency Quick View',  'quick_view',   'Quick view form for Currency',     false, true, true, false, true)
ON CONFLICT DO NOTHING;

UPDATE form_definition
SET layout_json = '{
  "tabs": [
    {
      "id": "tab_general",
      "name": "general",
      "label": "General",
      "display_order": 0,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_cur_info",
          "name": "cur_info",
          "label": "Currency Information",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"cur_c1","control_type":"field","field_definition_id":"3e1fdc13-82c7-4787-810c-aead1ed5121c","field_logical_name":"name","field_display_name":"Name","field_type_name":"text","label_override":null,"column_span":2,"is_visible":true,"is_readonly":false,"is_required_override":true,"subgrid_config":null},
            {"id":"cur_c2","control_type":"field","field_definition_id":"b1cb9f82-4f30-4ef3-9023-9cebd2f35c9b","field_logical_name":"code","field_display_name":"Code","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":true,"subgrid_config":null},
            {"id":"cur_c3","control_type":"field","field_definition_id":"ad04dd6c-dcfb-40a3-a75c-2cde159903a9","field_logical_name":"symbol","field_display_name":"Symbol","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"cur_c4","control_type":"field","field_definition_id":"729695a7-2c92-4367-bb26-1522778c4cc5","field_logical_name":"exchange_rate","field_display_name":"Exchange Rate","field_type_name":"decimal","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"cur_c5","control_type":"field","field_definition_id":"63e8975b-07e9-4bab-9b97-29e63ea16a63","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"cur_c6","control_type":"field","field_definition_id":"dd97bb8a-be47-4c07-abde-64d0ef4e9819","field_logical_name":"is_base","field_display_name":"Is Base","field_type_name":"boolean","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'
WHERE entity_definition_id = '9ddb2a99-5f32-4c97-a022-bc3eb63c449d'
  AND form_type = 'main' AND name = 'Currency Main Form';

UPDATE form_definition
SET layout_json = '{
  "tabs": [
    {
      "id": "tab_general",
      "name": "general",
      "label": "General",
      "display_order": 0,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_qc",
          "name": "qc",
          "label": "Currency",
          "columns": 1,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"cur_qc1","control_type":"field","field_definition_id":"3e1fdc13-82c7-4787-810c-aead1ed5121c","field_logical_name":"name","field_display_name":"Name","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":true,"subgrid_config":null},
            {"id":"cur_qc2","control_type":"field","field_definition_id":"b1cb9f82-4f30-4ef3-9023-9cebd2f35c9b","field_logical_name":"code","field_display_name":"Code","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":true,"subgrid_config":null},
            {"id":"cur_qc3","control_type":"field","field_definition_id":"ad04dd6c-dcfb-40a3-a75c-2cde159903a9","field_logical_name":"symbol","field_display_name":"Symbol","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'
WHERE entity_definition_id = '9ddb2a99-5f32-4c97-a022-bc3eb63c449d'
  AND form_type = 'quick_create' AND name = 'Currency Quick Create';

UPDATE form_definition
SET layout_json = '{
  "tabs": [
    {
      "id": "tab_general",
      "name": "general",
      "label": "General",
      "display_order": 0,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_qv",
          "name": "qv",
          "label": "Currency",
          "columns": 1,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"cur_qv1","control_type":"field","field_definition_id":"3e1fdc13-82c7-4787-810c-aead1ed5121c","field_logical_name":"name","field_display_name":"Name","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"cur_qv2","control_type":"field","field_definition_id":"b1cb9f82-4f30-4ef3-9023-9cebd2f35c9b","field_logical_name":"code","field_display_name":"Code","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"cur_qv3","control_type":"field","field_definition_id":"ad04dd6c-dcfb-40a3-a75c-2cde159903a9","field_logical_name":"symbol","field_display_name":"Symbol","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"cur_qv4","control_type":"field","field_definition_id":"63e8975b-07e9-4bab-9b97-29e63ea16a63","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'
WHERE entity_definition_id = '9ddb2a99-5f32-4c97-a022-bc3eb63c449d'
  AND form_type = 'quick_view' AND name = 'Currency Quick View';


-- ============================================================
-- SECURITY ROLE
-- ============================================================

INSERT INTO form_definition (
  entity_definition_id, name, form_type, description,
  is_default, is_active, is_system, is_deletable, is_published
) VALUES
  ('e3319109-c732-4191-809e-96cbdac1c5a6', 'Security Role Main Form',   'main',         'Default main form for Security Role',   true,  true, true, false, true),
  ('e3319109-c732-4191-809e-96cbdac1c5a6', 'Security Role Quick Create','quick_create', 'Quick create form for Security Role',   false, true, true, false, true),
  ('e3319109-c732-4191-809e-96cbdac1c5a6', 'Security Role Quick View',  'quick_view',   'Quick view form for Security Role',     false, true, true, false, true)
ON CONFLICT DO NOTHING;

UPDATE form_definition
SET layout_json = '{
  "tabs": [
    {
      "id": "tab_general",
      "name": "general",
      "label": "General",
      "display_order": 0,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_sr_info",
          "name": "sr_info",
          "label": "Role Information",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"sr_c1","control_type":"field","field_definition_id":"ffa9caa1-5f8d-4fb9-9022-411b7519d6e7","field_logical_name":"name","field_display_name":"Name","field_type_name":"text","label_override":null,"column_span":2,"is_visible":true,"is_readonly":false,"is_required_override":true,"subgrid_config":null},
            {"id":"sr_c2","control_type":"field","field_definition_id":"ac532b73-051e-4459-a369-fe61932791ba","field_logical_name":"business_unit_id","field_display_name":"Business Unit","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"sr_c3","control_type":"field","field_definition_id":"cbe83f1c-82d2-4899-8922-fb520b57f79f","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"sr_c4","control_type":"field","field_definition_id":"de2be0da-0a8c-408e-bad7-91af60933e8d","field_logical_name":"is_system","field_display_name":"Is System","field_type_name":"boolean","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null}
          ]
        },
        {
          "id": "sec_sr_desc",
          "name": "sr_desc",
          "label": "Description",
          "columns": 1,
          "display_order": 1,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"sr_c5","control_type":"field","field_definition_id":"1aba435f-8e6a-4523-bd4b-40497834c59e","field_logical_name":"description","field_display_name":"Description","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    },
    {
      "id": "tab_audit",
      "name": "audit",
      "label": "Audit",
      "display_order": 1,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_sr_audit",
          "name": "sr_audit",
          "label": "Audit Information",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"sr_c6","control_type":"field","field_definition_id":"8ce91ca6-84ff-4b50-8a12-577bda0950e3","field_logical_name":"created_at","field_display_name":"Created On","field_type_name":"datetime","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"sr_c7","control_type":"field","field_definition_id":"f6bb96d4-b9ba-4126-9f9c-dbc1c230ce89","field_logical_name":"modified_at","field_display_name":"Modified On","field_type_name":"datetime","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'
WHERE entity_definition_id = 'e3319109-c732-4191-809e-96cbdac1c5a6'
  AND form_type = 'main' AND name = 'Security Role Main Form';

UPDATE form_definition
SET layout_json = '{
  "tabs": [
    {
      "id": "tab_general",
      "name": "general",
      "label": "General",
      "display_order": 0,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_qc",
          "name": "qc",
          "label": "Security Role",
          "columns": 1,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"sr_qc1","control_type":"field","field_definition_id":"ffa9caa1-5f8d-4fb9-9022-411b7519d6e7","field_logical_name":"name","field_display_name":"Name","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":true,"subgrid_config":null},
            {"id":"sr_qc2","control_type":"field","field_definition_id":"ac532b73-051e-4459-a369-fe61932791ba","field_logical_name":"business_unit_id","field_display_name":"Business Unit","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'
WHERE entity_definition_id = 'e3319109-c732-4191-809e-96cbdac1c5a6'
  AND form_type = 'quick_create' AND name = 'Security Role Quick Create';

UPDATE form_definition
SET layout_json = '{
  "tabs": [
    {
      "id": "tab_general",
      "name": "general",
      "label": "General",
      "display_order": 0,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_qv",
          "name": "qv",
          "label": "Security Role",
          "columns": 1,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"sr_qv1","control_type":"field","field_definition_id":"ffa9caa1-5f8d-4fb9-9022-411b7519d6e7","field_logical_name":"name","field_display_name":"Name","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"sr_qv2","control_type":"field","field_definition_id":"ac532b73-051e-4459-a369-fe61932791ba","field_logical_name":"business_unit_id","field_display_name":"Business Unit","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"sr_qv3","control_type":"field","field_definition_id":"cbe83f1c-82d2-4899-8922-fb520b57f79f","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'
WHERE entity_definition_id = 'e3319109-c732-4191-809e-96cbdac1c5a6'
  AND form_type = 'quick_view' AND name = 'Security Role Quick View';


-- ============================================================
-- TEAM
-- ============================================================

INSERT INTO form_definition (
  entity_definition_id, name, form_type, description,
  is_default, is_active, is_system, is_deletable, is_published
) VALUES
  ('b057f86e-9e38-4a5b-b543-273cd9899175', 'Team Main Form',   'main',         'Default main form for Team',   true,  true, true, false, true),
  ('b057f86e-9e38-4a5b-b543-273cd9899175', 'Team Quick Create','quick_create', 'Quick create form for Team',   false, true, true, false, true),
  ('b057f86e-9e38-4a5b-b543-273cd9899175', 'Team Quick View',  'quick_view',   'Quick view form for Team',     false, true, true, false, true)
ON CONFLICT DO NOTHING;

UPDATE form_definition
SET layout_json = '{
  "tabs": [
    {
      "id": "tab_general",
      "name": "general",
      "label": "General",
      "display_order": 0,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_team_info",
          "name": "team_info",
          "label": "Team Information",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"tm_c1","control_type":"field","field_definition_id":"b2193aff-f1dd-4f00-965e-ee3e551c0777","field_logical_name":"name","field_display_name":"Name","field_type_name":"text","label_override":null,"column_span":2,"is_visible":true,"is_readonly":false,"is_required_override":true,"subgrid_config":null},
            {"id":"tm_c2","control_type":"field","field_definition_id":"c55954c4-4f70-45b0-a75e-bbc3b14e385f","field_logical_name":"business_unit_id","field_display_name":"Business Unit","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"tm_c3","control_type":"field","field_definition_id":"2c254f02-c0e8-475b-86dc-362a602b1b90","field_logical_name":"team_type","field_display_name":"Team Type","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"tm_c4","control_type":"field","field_definition_id":"5bafee85-025c-417e-8d79-955baaba288a","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        },
        {
          "id": "sec_team_desc",
          "name": "team_desc",
          "label": "Description",
          "columns": 1,
          "display_order": 1,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"tm_c5","control_type":"field","field_definition_id":"2448773a-2495-4a08-b56a-d6c564539933","field_logical_name":"description","field_display_name":"Description","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    },
    {
      "id": "tab_audit",
      "name": "audit",
      "label": "Audit",
      "display_order": 1,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_team_audit",
          "name": "team_audit",
          "label": "Audit Information",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"tm_c6","control_type":"field","field_definition_id":"4953077b-09a4-4f33-9b13-d5334b683f3b","field_logical_name":"created_at","field_display_name":"Created On","field_type_name":"datetime","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"tm_c7","control_type":"field","field_definition_id":"dff058a0-7fdb-4c23-99aa-5453304c6e0a","field_logical_name":"modified_at","field_display_name":"Modified On","field_type_name":"datetime","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'
WHERE entity_definition_id = 'b057f86e-9e38-4a5b-b543-273cd9899175'
  AND form_type = 'main' AND name = 'Team Main Form';

UPDATE form_definition
SET layout_json = '{
  "tabs": [
    {
      "id": "tab_general",
      "name": "general",
      "label": "General",
      "display_order": 0,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_qc",
          "name": "qc",
          "label": "Team",
          "columns": 1,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"tm_qc1","control_type":"field","field_definition_id":"b2193aff-f1dd-4f00-965e-ee3e551c0777","field_logical_name":"name","field_display_name":"Name","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":true,"subgrid_config":null},
            {"id":"tm_qc2","control_type":"field","field_definition_id":"c55954c4-4f70-45b0-a75e-bbc3b14e385f","field_logical_name":"business_unit_id","field_display_name":"Business Unit","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"tm_qc3","control_type":"field","field_definition_id":"2c254f02-c0e8-475b-86dc-362a602b1b90","field_logical_name":"team_type","field_display_name":"Team Type","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'
WHERE entity_definition_id = 'b057f86e-9e38-4a5b-b543-273cd9899175'
  AND form_type = 'quick_create' AND name = 'Team Quick Create';

UPDATE form_definition
SET layout_json = '{
  "tabs": [
    {
      "id": "tab_general",
      "name": "general",
      "label": "General",
      "display_order": 0,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_qv",
          "name": "qv",
          "label": "Team",
          "columns": 1,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"tm_qv1","control_type":"field","field_definition_id":"b2193aff-f1dd-4f00-965e-ee3e551c0777","field_logical_name":"name","field_display_name":"Name","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"tm_qv2","control_type":"field","field_definition_id":"c55954c4-4f70-45b0-a75e-bbc3b14e385f","field_logical_name":"business_unit_id","field_display_name":"Business Unit","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"tm_qv3","control_type":"field","field_definition_id":"2c254f02-c0e8-475b-86dc-362a602b1b90","field_logical_name":"team_type","field_display_name":"Team Type","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"tm_qv4","control_type":"field","field_definition_id":"5bafee85-025c-417e-8d79-955baaba288a","field_logical_name":"is_active","field_display_name":"Is Active","field_type_name":"boolean","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'
WHERE entity_definition_id = 'b057f86e-9e38-4a5b-b543-273cd9899175'
  AND form_type = 'quick_view' AND name = 'Team Quick View';
