/*
  # Seed Form Layouts (Migration 29)

  ## Overview
  Populates layout_json for the default main form of each core CRM entity
  (account, contact, lead, opportunity, ticket). These layouts define tabs,
  sections, and controls rendered by the dynamic Record Form Page.

  ## Changes
  - account main form: 3 tabs (General, Address, Details)
  - contact main form: 3 tabs (General, Address, Details)
  - lead main form: 3 tabs (General, Company, Details)
  - opportunity main form: 2 tabs (General, Details)
  - ticket main form: 2 tabs (General, Resolution)

  Each layout uses field_definition_id references from the field_definition table.
*/

-- ACCOUNT MAIN FORM
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
          "id": "sec_account_info",
          "name": "account_info",
          "label": "Account Information",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"c1","control_type":"field","field_definition_id":"366dccd7-f807-4622-8e1b-4c1bb89ec373","field_logical_name":"name","field_display_name":"Account Name","field_type_name":"text","label_override":null,"column_span":2,"is_visible":true,"is_readonly":false,"is_required_override":true,"subgrid_config":null},
            {"id":"c2","control_type":"field","field_definition_id":"0eac8214-e657-4251-9195-5c2627b10863","field_logical_name":"telephone1","field_display_name":"Phone","field_type_name":"phone","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c3","control_type":"field","field_definition_id":"95087b6f-4931-43b4-b374-114aa48f28a0","field_logical_name":"websiteurl","field_display_name":"Website","field_type_name":"url","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c4","control_type":"field","field_definition_id":"478f7797-9b20-4ea4-9761-6a5a9f307a96","field_logical_name":"industrycode","field_display_name":"Industry","field_type_name":"choice","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c5","control_type":"field","field_definition_id":"07281b22-3aab-4beb-8fc6-2b936de5784c","field_logical_name":"statuscode","field_display_name":"Status","field_type_name":"choice","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c6","control_type":"field","field_definition_id":"203b8d0a-0961-4d42-8389-81f0fa2dd5e6","field_logical_name":"revenue","field_display_name":"Annual Revenue","field_type_name":"currency","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c7","control_type":"field","field_definition_id":"119b3ad8-e780-473e-a003-4345422a8c7a","field_logical_name":"numberofemployees","field_display_name":"Employees","field_type_name":"number","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c8","control_type":"field","field_definition_id":"e8178944-59ef-4e01-abcc-efb17a257875","field_logical_name":"ownerid","field_display_name":"Owner","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c9","control_type":"field","field_definition_id":"a213a4fd-a3aa-4392-bfe7-e188a1e941fc","field_logical_name":"accountnumber","field_display_name":"Account Number","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        },
        {
          "id": "sec_description",
          "name": "description",
          "label": "Description",
          "columns": 1,
          "display_order": 1,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"c10","control_type":"field","field_definition_id":"1cf747d6-6ad3-42b3-9735-e1d2fbc908c3","field_logical_name":"description","field_display_name":"Description","field_type_name":"textarea","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    },
    {
      "id": "tab_address",
      "name": "address",
      "label": "Address",
      "display_order": 1,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_address_info",
          "name": "address_info",
          "label": "Address Information",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"ca1","control_type":"field","field_definition_id":"85bf8b2c-6844-4ed6-ab06-399e3fefe62d","field_logical_name":"address1_city","field_display_name":"City","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"ca2","control_type":"field","field_definition_id":"ae38b755-2f11-42fe-bbc5-2b5229860e64","field_logical_name":"countrycode","field_display_name":"Country","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    },
    {
      "id": "tab_system",
      "name": "system",
      "label": "System",
      "display_order": 2,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_audit",
          "name": "audit",
          "label": "Audit",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"cs1","control_type":"field","field_definition_id":"a4762974-93e8-4ec2-b8ef-cd27b8041145","field_logical_name":"createdon","field_display_name":"Created On","field_type_name":"datetime","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"cs2","control_type":"field","field_definition_id":"2c3d9223-6543-4161-86f7-0db9fec07c64","field_logical_name":"modifiedon","field_display_name":"Modified On","field_type_name":"datetime","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'::jsonb
WHERE form_id = '8a6fcaf8-1259-4d8f-a25b-bdbeb285a52e';

-- CONTACT MAIN FORM
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
          "id": "sec_name",
          "name": "name_section",
          "label": "Contact Information",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"c1","control_type":"field","field_definition_id":"6ea1a4e1-99a3-484a-959c-e087719755d7","field_logical_name":"firstname","field_display_name":"First Name","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c2","control_type":"field","field_definition_id":"1faf0d99-62c7-4ed6-a061-05bb1905610b","field_logical_name":"lastname","field_display_name":"Last Name","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":true,"subgrid_config":null},
            {"id":"c3","control_type":"field","field_definition_id":"eaec5e2e-27a8-435c-b958-e120a2d78f14","field_logical_name":"emailaddress1","field_display_name":"Email","field_type_name":"email","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c4","control_type":"field","field_definition_id":"aa5167b0-19f1-4452-ab3c-b32583ad0dbb","field_logical_name":"telephone1","field_display_name":"Business Phone","field_type_name":"phone","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c5","control_type":"field","field_definition_id":"1277e605-c340-492b-9705-6b88a951d98d","field_logical_name":"mobilephone","field_display_name":"Mobile Phone","field_type_name":"phone","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c6","control_type":"field","field_definition_id":"272bb636-0f60-4db8-a651-688c70f3c9cc","field_logical_name":"parentcustomerid","field_display_name":"Account","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c7","control_type":"field","field_definition_id":"f1448c24-f18f-4256-8f3b-3c931341aa28","field_logical_name":"jobtitle","field_display_name":"Job Title","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c8","control_type":"field","field_definition_id":"ea69b275-8897-41a1-ba9c-3d2b53975fd6","field_logical_name":"department","field_display_name":"Department","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c9","control_type":"field","field_definition_id":"68ae3bcc-4cc2-4fae-bcbb-368c3f2f24f9","field_logical_name":"statuscode","field_display_name":"Status","field_type_name":"choice","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c10","control_type":"field","field_definition_id":"c641f0df-b17a-474f-bc86-1e2ec549ddd9","field_logical_name":"ownerid","field_display_name":"Owner","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        },
        {
          "id": "sec_desc",
          "name": "description",
          "label": "Description",
          "columns": 1,
          "display_order": 1,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"c11","control_type":"field","field_definition_id":"1397c577-5412-48f7-b3f6-4cabff2dbcfc","field_logical_name":"description","field_display_name":"Description","field_type_name":"textarea","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    },
    {
      "id": "tab_address",
      "name": "address",
      "label": "Address",
      "display_order": 1,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_addr",
          "name": "address_info",
          "label": "Address",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"ca1","control_type":"field","field_definition_id":"49da8185-6dd5-4949-bbc4-e23ddbe9ab44","field_logical_name":"address1_city","field_display_name":"City","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"ca2","control_type":"field","field_definition_id":"060a3b70-b4d8-4b78-8589-8222461caa54","field_logical_name":"countrycode","field_display_name":"Country","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    },
    {
      "id": "tab_system",
      "name": "system",
      "label": "System",
      "display_order": 2,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_audit",
          "name": "audit",
          "label": "Audit",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"cs1","control_type":"field","field_definition_id":"dd44d9c5-bc5b-4fc5-aa07-1eb582d48cdb","field_logical_name":"createdon","field_display_name":"Created On","field_type_name":"datetime","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"cs2","control_type":"field","field_definition_id":"2a7cabf4-9c88-491c-8449-2c28136a4387","field_logical_name":"modifiedon","field_display_name":"Modified On","field_type_name":"datetime","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'::jsonb
WHERE form_id = '5ecf4f62-3a9a-48e3-97e7-25a9f6e9b958';

-- LEAD MAIN FORM
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
          "id": "sec_lead_info",
          "name": "lead_info",
          "label": "Lead Information",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"c1","control_type":"field","field_definition_id":"f2df5d02-37cf-4c05-bb97-b3f5a2ed5dcc","field_logical_name":"firstname","field_display_name":"First Name","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c2","control_type":"field","field_definition_id":"7e6f7cf7-acad-4b3b-8692-f39291af1d61","field_logical_name":"lastname","field_display_name":"Last Name","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":true,"subgrid_config":null},
            {"id":"c3","control_type":"field","field_definition_id":"5624e6b8-e0b9-4b25-8d52-62b2bd2138c6","field_logical_name":"emailaddress","field_display_name":"Email","field_type_name":"email","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c4","control_type":"field","field_definition_id":"cf8f4d78-b9fb-45a7-9be7-2977f86320a0","field_logical_name":"telephone1","field_display_name":"Phone","field_type_name":"phone","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c5","control_type":"field","field_definition_id":"63fc6a1e-e757-43fe-bd39-3b9061584d98","field_logical_name":"companyname","field_display_name":"Company","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c6","control_type":"field","field_definition_id":"86669869-0060-4d57-8119-648c490b93af","field_logical_name":"jobtitle","field_display_name":"Job Title","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c7","control_type":"field","field_definition_id":"5ee55b7b-7e1d-4e9d-b093-b157441b437a","field_logical_name":"statuscode","field_display_name":"Status","field_type_name":"choice","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c8","control_type":"field","field_definition_id":"b2da10e3-1308-4fa0-9ebc-5be7278075a7","field_logical_name":"leadsourcecode","field_display_name":"Source","field_type_name":"choice","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c9","control_type":"field","field_definition_id":"bd22618f-6a19-4425-900b-27ef681fc3a4","field_logical_name":"ownerid","field_display_name":"Owner","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c10","control_type":"field","field_definition_id":"28583fb6-7f0a-46b1-9c47-cc038dd7610f","field_logical_name":"mobilephone","field_display_name":"Mobile Phone","field_type_name":"phone","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        },
        {
          "id": "sec_desc",
          "name": "description",
          "label": "Description",
          "columns": 1,
          "display_order": 1,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"c11","control_type":"field","field_definition_id":"1c78def5-ea38-411b-b910-55863a6523c2","field_logical_name":"description","field_display_name":"Description","field_type_name":"textarea","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    },
    {
      "id": "tab_address",
      "name": "address",
      "label": "Address",
      "display_order": 1,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_addr",
          "name": "address_info",
          "label": "Address",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"ca1","control_type":"field","field_definition_id":"d018d50e-5324-4424-ad88-8103a550fec4","field_logical_name":"address1_city","field_display_name":"City","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"ca2","control_type":"field","field_definition_id":"2c2700bd-73d7-4090-92e9-0dc68c631d63","field_logical_name":"countrycode","field_display_name":"Country","field_type_name":"text","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    },
    {
      "id": "tab_system",
      "name": "system",
      "label": "System",
      "display_order": 2,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_audit",
          "name": "audit",
          "label": "Audit",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"cs1","control_type":"field","field_definition_id":"bec5daab-1279-4362-b91c-6eec8b169eb9","field_logical_name":"createdon","field_display_name":"Created On","field_type_name":"datetime","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"cs2","control_type":"field","field_definition_id":"fe108c2b-ee05-44f6-9912-89dd3403f91b","field_logical_name":"modifiedon","field_display_name":"Modified On","field_type_name":"datetime","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'::jsonb
WHERE form_id = 'e7781cd5-3a91-4ca2-8e65-d524b3712941';

-- OPPORTUNITY MAIN FORM
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
          "id": "sec_opp_info",
          "name": "opportunity_info",
          "label": "Opportunity Information",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"c1","control_type":"field","field_definition_id":"ab7a8c63-8fba-4a82-942d-97d2b79003e5","field_logical_name":"name","field_display_name":"Opportunity Name","field_type_name":"text","label_override":null,"column_span":2,"is_visible":true,"is_readonly":false,"is_required_override":true,"subgrid_config":null},
            {"id":"c2","control_type":"field","field_definition_id":"716b80a2-4e43-4691-a6d1-51d8fd657109","field_logical_name":"parentaccountid","field_display_name":"Account","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c3","control_type":"field","field_definition_id":"2aa89764-cde7-4eae-b186-cd09a9c7d727","field_logical_name":"parentcontactid","field_display_name":"Contact","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c4","control_type":"field","field_definition_id":"d5371da0-486c-4663-8944-364da626ce67","field_logical_name":"stagecode","field_display_name":"Stage","field_type_name":"choice","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c5","control_type":"field","field_definition_id":"725d50f5-d439-4c81-b9e4-7abb9b359b19","field_logical_name":"statuscode","field_display_name":"Status","field_type_name":"choice","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c6","control_type":"field","field_definition_id":"167639a3-4fe4-4935-97c3-1b47fa2ad234","field_logical_name":"estimatedvalue","field_display_name":"Est. Value","field_type_name":"currency","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c7","control_type":"field","field_definition_id":"d499fbae-2af1-4bba-bad8-9de18c07f1a9","field_logical_name":"estimatedclosedate","field_display_name":"Close Date","field_type_name":"date","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c8","control_type":"field","field_definition_id":"41a3aca9-d91e-4ae2-b67d-0269f87e1aff","field_logical_name":"closeprobability","field_display_name":"Probability (%)","field_type_name":"number","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c9","control_type":"field","field_definition_id":"ad532025-1217-4efd-9e78-a4b839c26eb0","field_logical_name":"ownerid","field_display_name":"Owner","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        },
        {
          "id": "sec_desc",
          "name": "description",
          "label": "Description",
          "columns": 1,
          "display_order": 1,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"c10","control_type":"field","field_definition_id":"43467693-cece-4e33-a2cf-b5465a4f8376","field_logical_name":"description","field_display_name":"Description","field_type_name":"textarea","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    },
    {
      "id": "tab_system",
      "name": "system",
      "label": "System",
      "display_order": 1,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_audit",
          "name": "audit",
          "label": "Audit",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"cs1","control_type":"field","field_definition_id":"309a0efe-36a8-49e2-acfa-00c16786f286","field_logical_name":"createdon","field_display_name":"Created On","field_type_name":"datetime","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"cs2","control_type":"field","field_definition_id":"02bf9390-661d-4f21-85c9-b472f256a785","field_logical_name":"modifiedon","field_display_name":"Modified On","field_type_name":"datetime","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'::jsonb
WHERE form_id = '1a49940b-900e-4784-bda2-5d0bcc35ba90';

-- TICKET MAIN FORM
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
          "id": "sec_ticket_info",
          "name": "ticket_info",
          "label": "Ticket Information",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"c1","control_type":"field","field_definition_id":"d6f87ac8-708b-45af-b836-264f07fae6eb","field_logical_name":"title","field_display_name":"Title","field_type_name":"text","label_override":null,"column_span":2,"is_visible":true,"is_readonly":false,"is_required_override":true,"subgrid_config":null},
            {"id":"c2","control_type":"field","field_definition_id":"2df92415-f6f8-46c7-97b6-162311fb36b8","field_logical_name":"customerid","field_display_name":"Customer","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c3","control_type":"field","field_definition_id":"2435d1c5-0998-4eb4-ac75-6bdb8e5c1939","field_logical_name":"prioritycode","field_display_name":"Priority","field_type_name":"choice","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c4","control_type":"field","field_definition_id":"282abe06-753b-4c39-b6f6-285020c0d1a6","field_logical_name":"statuscode","field_display_name":"Status","field_type_name":"choice","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c5","control_type":"field","field_definition_id":"4c8743cb-862d-4c3e-88ca-02608144c576","field_logical_name":"casetypecode","field_display_name":"Type","field_type_name":"choice","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null},
            {"id":"c6","control_type":"field","field_definition_id":"ecd09176-89b3-4cfc-b7e0-dd244ca80db3","field_logical_name":"ownerid","field_display_name":"Assigned To","field_type_name":"lookup","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        },
        {
          "id": "sec_desc",
          "name": "description",
          "label": "Description",
          "columns": 1,
          "display_order": 1,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"c7","control_type":"field","field_definition_id":"55aa0d00-362d-47de-9eaa-29c47f4c043a","field_logical_name":"description","field_display_name":"Description","field_type_name":"textarea","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    },
    {
      "id": "tab_resolution",
      "name": "resolution",
      "label": "Resolution",
      "display_order": 1,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_res",
          "name": "resolution_section",
          "label": "Resolution Details",
          "columns": 1,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"cr1","control_type":"field","field_definition_id":"02a81345-475a-4ed0-b98d-5b2e90e703a7","field_logical_name":"resolution","field_display_name":"Resolution","field_type_name":"textarea","label_override":null,"column_span":1,"is_visible":true,"is_readonly":false,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    },
    {
      "id": "tab_system",
      "name": "system",
      "label": "System",
      "display_order": 2,
      "is_visible": true,
      "sections": [
        {
          "id": "sec_audit",
          "name": "audit",
          "label": "Audit",
          "columns": 2,
          "display_order": 0,
          "is_visible": true,
          "is_collapsed": false,
          "controls": [
            {"id":"cs1","control_type":"field","field_definition_id":"da1d3114-e07e-4719-8e01-8a1b61aa3cd8","field_logical_name":"createdon","field_display_name":"Created On","field_type_name":"datetime","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null},
            {"id":"cs2","control_type":"field","field_definition_id":"47a4f250-6a44-488e-9818-f7b3f020563a","field_logical_name":"modifiedon","field_display_name":"Modified On","field_type_name":"datetime","label_override":null,"column_span":1,"is_visible":true,"is_readonly":true,"is_required_override":false,"subgrid_config":null}
          ]
        }
      ]
    }
  ]
}'::jsonb
WHERE form_id = 'cb4dc22a-31aa-4c82-9843-72ef4930a32d';
