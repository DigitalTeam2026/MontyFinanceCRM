/*
  # MontyPay Opportunity Field Definitions

  ## Summary
  Registers all MontyPay-specific columns from migration 143 in the
  field_definition platform metadata table. This makes all fields visible
  and manageable in the Fields Management admin screen, correctly categorized
  as custom fields created by the admin.

  ## Fields Registered (all on 'opportunity' entity)

  ### Custom flags on all new fields
  - is_system = false (not platform-delivered)
  - is_custom = true  (shows as "Custom" in Fields Management)
  - is_deletable = true
  - is_schema_editable = true

  ### Commercial / Fee Fields (8 fields)
  - send_note, setup_fees, setup_currency_id, setup_vat
  - monthly_fees, monthly_currency_id, monthly_vat, monthly_cost

  ### Processing / Transaction Fields (14 fields)
  - local_rate, international_rate, profit_margin
  - estimated_avg_transactions_per_month, estimated_average_volume, estimated_volume
  - processing_rate, processing_currency_id, montypay_estimated_revenue
  - minimum_transaction_amount, maximum_transaction_amount
  - uk_card, premium_local, international_processing, dev_bank_transfer, wallet_fee, dev_qris

  ### Settlement Fields (6 fields)
  - settlement_frequency (choice), settlement_account, settlement_client
  - settlement_contact, bank_name, wallet_type

  ### Approval Status Fields (15 fields, 5 groups of 3)
  - technical_status (choice), technical_approved_by (lookup→crm_user), technical_approved_on
  - compliance_status (choice), compliance_approved_by (lookup→crm_user), compliance_approved_on
  - operation_status (choice), operations_approved_by (lookup→crm_user), operations_approved_on
  - settlement_status (choice), settlement_approved_by (lookup→crm_user), settlement_approved_on
  - qa_status (choice), qa_approved_by (lookup→crm_user), qa_approved_on

  ### Boolean Checklist Fields (14 booleans)
  - send_questionnaire_file, documents_received, start_agreement_approval
  - agreement_sent_to_merchant, signed, integration_completed
  - partner_agreement_signed, ok_to_proceed, soft_copy_available
  - technical_integration_completed, test_integration, qa_check
  - training_completed, uploaded_and_live

  ### Website Development Fields (3 fields)
  - commercial_proposal_shared, content_management, website_type

  ## Security
  No RLS changes — field_definition already has RLS enabled.
*/

DO $$
DECLARE
  v_eid_opp        uuid;
  v_eid_crm_user   uuid;
  v_eid_currency   uuid;

  -- field type ids
  ft_text          uuid;
  ft_number        uuid;
  ft_currency_type uuid;
  ft_boolean       uuid;
  ft_lookup        uuid;
  ft_choice        uuid;
  ft_datetime      uuid;
  ft_textarea      uuid;

  -- option set ids
  v_approval_os_id    uuid;
  v_settlement_os_id  uuid;

BEGIN

  -- ── Resolve entity IDs ────────────────────────────────────────────────────
  SELECT entity_definition_id INTO v_eid_opp      FROM entity_definition WHERE logical_name = 'opportunity' LIMIT 1;
  SELECT entity_definition_id INTO v_eid_crm_user FROM entity_definition WHERE logical_name = 'crm_user'    LIMIT 1;
  SELECT entity_definition_id INTO v_eid_currency  FROM entity_definition WHERE logical_name = 'currency'    LIMIT 1;

  -- ── Resolve field type IDs ────────────────────────────────────────────────
  SELECT field_type_id INTO ft_text          FROM field_type WHERE name = 'text'     LIMIT 1;
  SELECT field_type_id INTO ft_number        FROM field_type WHERE name = 'number'   LIMIT 1;
  SELECT field_type_id INTO ft_currency_type FROM field_type WHERE name = 'currency' LIMIT 1;
  SELECT field_type_id INTO ft_boolean       FROM field_type WHERE name = 'boolean'  LIMIT 1;
  SELECT field_type_id INTO ft_lookup        FROM field_type WHERE name = 'lookup'   LIMIT 1;
  SELECT field_type_id INTO ft_choice        FROM field_type WHERE name = 'choice'   LIMIT 1;
  SELECT field_type_id INTO ft_datetime      FROM field_type WHERE name = 'datetime' LIMIT 1;
  SELECT field_type_id INTO ft_textarea      FROM field_type WHERE name = 'textarea' LIMIT 1;

  -- ── Resolve option set IDs ────────────────────────────────────────────────
  SELECT option_set_id INTO v_approval_os_id   FROM option_set WHERE name = 'approval_status'     LIMIT 1;
  SELECT option_set_id INTO v_settlement_os_id FROM option_set WHERE name = 'settlement_frequency' LIMIT 1;

  -- ── Commercial / Fee fields ───────────────────────────────────────────────

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_textarea, 'sendnote',         'Send Note',            'send_note',         false, false, false, false, true, false, true, true, 200),
    (v_eid_opp, ft_number,   'setupfees',         'Setup Fees',           'setup_fees',         false, false, true, true,  true, false, true, true, 201),
    (v_eid_opp, ft_number,   'setupvat',          'Setup VAT (%)',         'setup_vat',          false, false, true, true,  true, false, true, true, 203),
    (v_eid_opp, ft_number,   'monthlyfees',       'Monthly Fees',         'monthly_fees',       false, false, true, true,  true, false, true, true, 205),
    (v_eid_opp, ft_number,   'monthlyvat',        'Monthly VAT (%)',       'monthly_vat',        false, false, true, true,  true, false, true, true, 207),
    (v_eid_opp, ft_number,   'monthlycost',       'Monthly Cost',         'monthly_cost',       false, false, true, true,  true, false, true, true, 208)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  -- Currency lookup fields for fees
  INSERT INTO field_definition (
    entity_definition_id, field_type_id, lookup_entity_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_lookup, v_eid_currency, 'setupcurrencyid',     'Setup Currency',      'setup_currency_id',     false, false, false, true, true, false, true, true, 202),
    (v_eid_opp, ft_lookup, v_eid_currency, 'monthlycurrencyid',   'Monthly Currency',    'monthly_currency_id',   false, false, false, true, true, false, true, true, 206),
    (v_eid_opp, ft_lookup, v_eid_currency, 'processingcurrencyid','Processing Currency', 'processing_currency_id',false, false, false, true, true, false, true, true, 220)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  -- ── Processing / Transaction fields ──────────────────────────────────────

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_number, 'localrate',                     'Local Rate (%)',                    'local_rate',                         false, false, true, true, true, false, true, true, 210),
    (v_eid_opp, ft_number, 'internationalrate',             'International Rate (%)',            'international_rate',                 false, false, true, true, true, false, true, true, 211),
    (v_eid_opp, ft_number, 'profitmargin',                  'Profit Margin (%)',                 'profit_margin',                      false, false, true, true, true, false, true, true, 212),
    (v_eid_opp, ft_number, 'estimatedavgtxpermonth',        'Est. Avg. Transactions / Month',    'estimated_avg_transactions_per_month',false, false, true, true, true, false, true, true, 213),
    (v_eid_opp, ft_number, 'estimatedaveragevolume',        'Est. Average Volume',               'estimated_average_volume',           false, false, true, true, true, false, true, true, 214),
    (v_eid_opp, ft_number, 'estimatedvolume',               'Est. Monthly Volume',               'estimated_volume',                   false, false, true, true, true, false, true, true, 215),
    (v_eid_opp, ft_number, 'processingrate',                'Processing Rate (%)',               'processing_rate',                    false, false, true, true, true, false, true, true, 216),
    (v_eid_opp, ft_number, 'montypayestimatedrevenue',      'MontyPay Est. Revenue',             'montypay_estimated_revenue',         false, false, true, true, true, false, true, true, 221),
    (v_eid_opp, ft_number, 'minimumtransactionamount',      'Min. Transaction Amount',           'minimum_transaction_amount',         false, false, true, true, true, false, true, true, 222),
    (v_eid_opp, ft_number, 'maximumtransactionamount',      'Max. Transaction Amount',           'maximum_transaction_amount',         false, false, true, true, true, false, true, true, 223),
    (v_eid_opp, ft_number, 'ukcard',                        'UK Card Rate (%)',                  'uk_card',                            false, false, true, true, true, false, true, true, 224),
    (v_eid_opp, ft_number, 'premiumlocal',                  'Premium Local Rate (%)',            'premium_local',                      false, false, true, true, true, false, true, true, 225),
    (v_eid_opp, ft_number, 'internationalprocessing',       'International Processing Rate (%)', 'international_processing',           false, false, true, true, true, false, true, true, 226),
    (v_eid_opp, ft_number, 'devbanktransfer',               'Bank Transfer Fee (%)',             'dev_bank_transfer',                  false, false, true, true, true, false, true, true, 227),
    (v_eid_opp, ft_number, 'walletfee',                     'Wallet Fee (%)',                    'wallet_fee',                         false, false, true, true, true, false, true, true, 228),
    (v_eid_opp, ft_number, 'devqris',                       'QRIS Fee (%)',                      'dev_qris',                           false, false, true, true, true, false, true, true, 229)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  -- ── Settlement fields ─────────────────────────────────────────────────────

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, option_set_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_choice, v_settlement_os_id, 'settlementfrequency', 'Settlement Frequency', 'settlement_frequency', false, false, true, true, true, false, true, true, 230)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_text, 'settlementaccount', 'Settlement Account', 'settlement_account', false, false, false, false, true, false, true, true, 231),
    (v_eid_opp, ft_text, 'settlementclient',  'Settlement Client',  'settlement_client',  false, false, false, false, true, false, true, true, 232),
    (v_eid_opp, ft_text, 'settlementcontact', 'Settlement Contact', 'settlement_contact', false, false, false, false, true, false, true, true, 233),
    (v_eid_opp, ft_text, 'bankname',          'Bank Name',          'bank_name',          false, true,  true,  true,  true, false, true, true, 234),
    (v_eid_opp, ft_text, 'wallettype',        'Wallet Type',        'wallet_type',        false, false, false, false, true, false, true, true, 235)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  -- ── Approval status fields ────────────────────────────────────────────────

  -- Technical
  INSERT INTO field_definition (
    entity_definition_id, field_type_id, option_set_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_choice, v_approval_os_id, 'technicalstatus', 'Technical Status', 'technical_status', false, false, true, true, true, false, true, true, 240)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, lookup_entity_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_lookup, v_eid_crm_user, 'technicalapprovedby', 'Technical Approved By', 'technical_approved_by', false, false, false, false, true, false, true, true, 241)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_datetime, 'technicalapprovedon', 'Technical Approved On', 'technical_approved_on', false, false, true, true, true, false, true, true, 242)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  -- Compliance
  INSERT INTO field_definition (
    entity_definition_id, field_type_id, option_set_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_choice, v_approval_os_id, 'compliancestatus', 'Compliance Status', 'compliance_status', false, false, true, true, true, false, true, true, 243)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, lookup_entity_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_lookup, v_eid_crm_user, 'complianceapprovedby', 'Compliance Approved By', 'compliance_approved_by', false, false, false, false, true, false, true, true, 244)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_datetime, 'complianceapprovedon', 'Compliance Approved On', 'compliance_approved_on', false, false, true, true, true, false, true, true, 245)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  -- Operations
  INSERT INTO field_definition (
    entity_definition_id, field_type_id, option_set_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_choice, v_approval_os_id, 'operationstatus', 'Operation Status', 'operation_status', false, false, true, true, true, false, true, true, 246)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, lookup_entity_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_lookup, v_eid_crm_user, 'operationsapprovedby', 'Operations Approved By', 'operations_approved_by', false, false, false, false, true, false, true, true, 247)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_datetime, 'operationsapprovedon', 'Operations Approved On', 'operations_approved_on', false, false, true, true, true, false, true, true, 248)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  -- Settlement approval
  INSERT INTO field_definition (
    entity_definition_id, field_type_id, option_set_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_choice, v_approval_os_id, 'settlementstatus', 'Settlement Status', 'settlement_status', false, false, true, true, true, false, true, true, 249)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, lookup_entity_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_lookup, v_eid_crm_user, 'settlementapprovedby', 'Settlement Approved By', 'settlement_approved_by', false, false, false, false, true, false, true, true, 250)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_datetime, 'settlementapprovedon', 'Settlement Approved On', 'settlement_approved_on', false, false, true, true, true, false, true, true, 251)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  -- QA
  INSERT INTO field_definition (
    entity_definition_id, field_type_id, option_set_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_choice, v_approval_os_id, 'qastatus', 'QA Status', 'qa_status', false, false, true, true, true, false, true, true, 252)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, lookup_entity_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_lookup, v_eid_crm_user, 'qaapprovedby', 'QA Approved By', 'qa_approved_by', false, false, false, false, true, false, true, true, 253)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_datetime, 'qaapprovedon', 'QA Approved On', 'qa_approved_on', false, false, true, true, true, false, true, true, 254)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  -- ── Boolean checklist fields ──────────────────────────────────────────────

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_boolean, 'sendquestionnairefile',         'Send Questionnaire File',         'send_questionnaire_file',         false, false, false, true, true, false, true, true, 260),
    (v_eid_opp, ft_boolean, 'documentsreceived',             'Documents Received',              'documents_received',              false, false, false, true, true, false, true, true, 261),
    (v_eid_opp, ft_boolean, 'startagreementapproval',        'Start Agreement Approval',        'start_agreement_approval',        false, false, false, true, true, false, true, true, 262),
    (v_eid_opp, ft_boolean, 'agreementsenttomerchant',       'Agreement Sent to Merchant',      'agreement_sent_to_merchant',      false, false, false, true, true, false, true, true, 263),
    (v_eid_opp, ft_boolean, 'signed',                        'Signed',                          'signed',                          false, false, false, true, true, false, true, true, 264),
    (v_eid_opp, ft_boolean, 'integrationcompleted',          'Integration Completed',           'integration_completed',           false, false, false, true, true, false, true, true, 265),
    (v_eid_opp, ft_boolean, 'partneragreementsigned',        'Partner Agreement Signed',        'partner_agreement_signed',        false, false, false, true, true, false, true, true, 266),
    (v_eid_opp, ft_boolean, 'oktoproceed',                   'OK to Proceed',                   'ok_to_proceed',                   false, false, false, true, true, false, true, true, 267),
    (v_eid_opp, ft_boolean, 'softcopyavailable',             'Soft Copy Available',             'soft_copy_available',             false, false, false, true, true, false, true, true, 268),
    (v_eid_opp, ft_boolean, 'technicalintegrationcompleted', 'Technical Integration Completed', 'technical_integration_completed', false, false, false, true, true, false, true, true, 269),
    (v_eid_opp, ft_boolean, 'testintegration',               'Test Integration',                'test_integration',                false, false, false, true, true, false, true, true, 270),
    (v_eid_opp, ft_boolean, 'qacheck',                       'QA Check',                        'qa_check',                        false, false, false, true, true, false, true, true, 271),
    (v_eid_opp, ft_boolean, 'trainingcompleted',             'Training Completed',              'training_completed',              false, false, false, true, true, false, true, true, 272),
    (v_eid_opp, ft_boolean, 'uploadedandlive',               'Uploaded and Live',               'uploaded_and_live',               false, false, false, true, true, false, true, true, 273)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

  -- ── Website Development specific fields ───────────────────────────────────

  INSERT INTO field_definition (
    entity_definition_id, field_type_id, logical_name, display_name, physical_column_name,
    is_required, is_searchable, is_sortable, is_filterable, is_custom, is_system,
    is_deletable, is_schema_editable, sort_order
  ) VALUES
    (v_eid_opp, ft_boolean, 'commercialproposalshared', 'Commercial Proposal Shared', 'commercial_proposal_shared', false, false, false, true, true, false, true, true, 280),
    (v_eid_opp, ft_textarea,'contentmanagement',        'Content Management',         'content_management',         false, false, false, false, true, false, true, true, 281),
    (v_eid_opp, ft_text,    'websitetype',              'Website Type',               'website_type',               false, false, true,  true,  true, false, true, true, 282)
  ON CONFLICT (entity_definition_id, logical_name) DO NOTHING;

END $$;
