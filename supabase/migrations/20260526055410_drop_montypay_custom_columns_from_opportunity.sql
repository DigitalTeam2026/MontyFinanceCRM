/*
  # Drop MontyPay custom columns from opportunity table

  1. Modified Tables
    - `opportunity`
      - Drops all MontyPay-specific physical columns that were added for the
        Payment Gateway / POS / SoftPOS business flows.
      - These columns have no corresponding field_definition rows and are not
        referenced by any process_stage, form_definition, or view_column.

  2. Columns Removed (60 columns)
    - Financial: send_note, setup_currency_id, setup_vat, monthly_fees,
      monthly_currency_id, monthly_vat, monthly_cost, local_rate,
      international_rate, profit_margin, estimated_avg_transactions_per_month,
      estimated_average_volume, estimated_volume, processing_rate,
      processing_currency_id, montypay_estimated_revenue,
      minimum_transaction_amount, maximum_transaction_amount
    - Card rates: uk_card, premium_local, international_processing,
      dev_bank_transfer, wallet_fee, dev_qris
    - Settlement: settlement_frequency, settlement_account,
      settlement_client, settlement_contact, bank_name, wallet_type
    - Approval statuses: technical_status, technical_approved_by,
      technical_approved_on, compliance_status, compliance_approved_by,
      compliance_approved_on, operation_status, operations_approved_by,
      operations_approved_on, settlement_status, settlement_approved_by,
      settlement_approved_on, qa_status, qa_approved_by, qa_approved_on
    - Checklist booleans: send_questionnaire_file, documents_received,
      start_agreement_approval, agreement_sent_to_merchant, signed,
      integration_completed, partner_agreement_signed, ok_to_proceed,
      soft_copy_available, technical_integration_completed,
      test_integration, qa_check, training_completed,
      uploaded_and_live, commercial_proposal_shared
    - Other: content_management, website_type

  3. Cleanup
    - Deactivates the non-system "Product" field_definition (already inactive)
    - Deactivates the non-system "MontyPay-PG" form_definition

  4. Important Notes
    - All data in these columns for the single existing opportunity record is NULL
    - No form layouts, view columns, or process stages reference these columns
*/

-- Drop MontyPay financial columns
ALTER TABLE opportunity
  DROP COLUMN IF EXISTS send_note,
  DROP COLUMN IF EXISTS setup_currency_id,
  DROP COLUMN IF EXISTS setup_vat,
  DROP COLUMN IF EXISTS monthly_fees,
  DROP COLUMN IF EXISTS monthly_currency_id,
  DROP COLUMN IF EXISTS monthly_vat,
  DROP COLUMN IF EXISTS monthly_cost,
  DROP COLUMN IF EXISTS local_rate,
  DROP COLUMN IF EXISTS international_rate,
  DROP COLUMN IF EXISTS profit_margin,
  DROP COLUMN IF EXISTS estimated_avg_transactions_per_month,
  DROP COLUMN IF EXISTS estimated_average_volume,
  DROP COLUMN IF EXISTS estimated_volume,
  DROP COLUMN IF EXISTS processing_rate,
  DROP COLUMN IF EXISTS processing_currency_id,
  DROP COLUMN IF EXISTS montypay_estimated_revenue,
  DROP COLUMN IF EXISTS minimum_transaction_amount,
  DROP COLUMN IF EXISTS maximum_transaction_amount;

-- Drop card rate columns
ALTER TABLE opportunity
  DROP COLUMN IF EXISTS uk_card,
  DROP COLUMN IF EXISTS premium_local,
  DROP COLUMN IF EXISTS international_processing,
  DROP COLUMN IF EXISTS dev_bank_transfer,
  DROP COLUMN IF EXISTS wallet_fee,
  DROP COLUMN IF EXISTS dev_qris;

-- Drop settlement columns
ALTER TABLE opportunity
  DROP COLUMN IF EXISTS settlement_frequency,
  DROP COLUMN IF EXISTS settlement_account,
  DROP COLUMN IF EXISTS settlement_client,
  DROP COLUMN IF EXISTS settlement_contact,
  DROP COLUMN IF EXISTS bank_name,
  DROP COLUMN IF EXISTS wallet_type;

-- Drop approval status columns
ALTER TABLE opportunity
  DROP COLUMN IF EXISTS technical_status,
  DROP COLUMN IF EXISTS technical_approved_by,
  DROP COLUMN IF EXISTS technical_approved_on,
  DROP COLUMN IF EXISTS compliance_status,
  DROP COLUMN IF EXISTS compliance_approved_by,
  DROP COLUMN IF EXISTS compliance_approved_on,
  DROP COLUMN IF EXISTS operation_status,
  DROP COLUMN IF EXISTS operations_approved_by,
  DROP COLUMN IF EXISTS operations_approved_on,
  DROP COLUMN IF EXISTS settlement_status,
  DROP COLUMN IF EXISTS settlement_approved_by,
  DROP COLUMN IF EXISTS settlement_approved_on,
  DROP COLUMN IF EXISTS qa_status,
  DROP COLUMN IF EXISTS qa_approved_by,
  DROP COLUMN IF EXISTS qa_approved_on;

-- Drop checklist boolean columns
ALTER TABLE opportunity
  DROP COLUMN IF EXISTS send_questionnaire_file,
  DROP COLUMN IF EXISTS documents_received,
  DROP COLUMN IF EXISTS start_agreement_approval,
  DROP COLUMN IF EXISTS agreement_sent_to_merchant,
  DROP COLUMN IF EXISTS signed,
  DROP COLUMN IF EXISTS integration_completed,
  DROP COLUMN IF EXISTS partner_agreement_signed,
  DROP COLUMN IF EXISTS ok_to_proceed,
  DROP COLUMN IF EXISTS soft_copy_available,
  DROP COLUMN IF EXISTS technical_integration_completed,
  DROP COLUMN IF EXISTS test_integration,
  DROP COLUMN IF EXISTS qa_check,
  DROP COLUMN IF EXISTS training_completed,
  DROP COLUMN IF EXISTS uploaded_and_live,
  DROP COLUMN IF EXISTS commercial_proposal_shared;

-- Drop other custom columns
ALTER TABLE opportunity
  DROP COLUMN IF EXISTS content_management,
  DROP COLUMN IF EXISTS website_type;

-- Deactivate the non-system MontyPay-PG form
UPDATE form_definition
SET is_active = false
WHERE form_id = 'bc9e76aa-e2f3-47fd-b0f9-67539ab0c535'
  AND is_system = false;

-- Deactivate the non-system product field_definition (already inactive, but ensure)
UPDATE field_definition
SET is_active = false
WHERE field_definition_id = '6507973d-4348-4216-b39e-c19501ecf4ec'
  AND is_system = false;
