/*
  # MontyPay Opportunity Physical Columns

  ## Summary
  Adds all MontyPay-specific physical columns to the opportunity table.
  These columns capture the commercial, technical, compliance, and operational
  data required across all three MontyPay product flows.

  ## New Columns on opportunity table

  ### Commercial / Fee Fields
  - `send_note` (text): Optional internal note for this opportunity
  - `setup_fees` (numeric 18,2): One-time setup fee amount
  - `setup_currency_id` (uuid FK → currency): Currency for setup fee
  - `setup_vat` (numeric 5,2): VAT percentage on setup fee
  - `monthly_fees` (numeric 18,2): Recurring monthly fee amount
  - `monthly_currency_id` (uuid FK → currency): Currency for monthly fee
  - `monthly_vat` (numeric 5,2): VAT percentage on monthly fee
  - `monthly_cost` (numeric 18,2): Internal cost for monthly service (website dev)

  ### Processing / Transaction Fields
  - `local_rate` (numeric 10,4): Local card processing rate (%)
  - `international_rate` (numeric 10,4): International card processing rate (%)
  - `profit_margin` (numeric 10,4): Profit margin percentage
  - `estimated_avg_transactions_per_month` (integer): Expected monthly transaction count
  - `estimated_average_volume` (numeric 18,2): Expected average transaction volume
  - `estimated_volume` (numeric 18,2): Total expected monthly volume
  - `processing_rate` (numeric 10,4): General processing rate
  - `processing_currency_id` (uuid FK → currency): Currency for processing fees
  - `montypay_estimated_revenue` (numeric 18,2): MontyPay estimated revenue
  - `minimum_transaction_amount` (numeric 18,2): Minimum allowed transaction
  - `maximum_transaction_amount` (numeric 18,2): Maximum allowed transaction
  - `uk_card` (numeric 10,4): UK card processing rate
  - `premium_local` (numeric 10,4): Premium local card rate
  - `international_processing` (numeric 10,4): International processing rate
  - `dev_bank_transfer` (numeric 10,4): Bank transfer fee
  - `wallet_fee` (numeric 10,4): Wallet payment fee
  - `dev_qris` (numeric 10,4): QRIS payment fee

  ### Settlement Fields
  - `settlement_frequency` (text → option set): How often settlement is processed
  - `settlement_account` (text): Settlement bank account reference
  - `settlement_client` (text): Settlement client reference
  - `settlement_contact` (text): Settlement contact reference
  - `bank_name` (text): Merchant bank name
  - `wallet_type` (text): Type of wallet integration

  ### Approval Status Fields (choice → approval_status option set)
  - `technical_status` (text): Technical team review status
  - `technical_approved_by` (uuid FK → crm_user): Technical approver
  - `technical_approved_on` (timestamptz): Technical approval timestamp
  - `compliance_status` (text): Compliance team review status
  - `compliance_approved_by` (uuid FK → crm_user): Compliance approver
  - `compliance_approved_on` (timestamptz): Compliance approval timestamp
  - `operation_status` (text): Operations team review status
  - `operations_approved_by` (uuid FK → crm_user): Operations approver
  - `operations_approved_on` (timestamptz): Operations approval timestamp
  - `settlement_status` (text): Settlement team review status
  - `settlement_approved_by` (uuid FK → crm_user): Settlement approver
  - `settlement_approved_on` (timestamptz): Settlement approval timestamp
  - `qa_status` (text): QA team review status
  - `qa_approved_by` (uuid FK → crm_user): QA approver
  - `qa_approved_on` (timestamptz): QA approval timestamp

  ### Checklist / Boolean Fields
  - `send_questionnaire_file` (boolean): Questionnaire sent to merchant
  - `documents_received` (boolean): Merchant documents received
  - `start_agreement_approval` (boolean): Agreement approval process started
  - `agreement_sent_to_merchant` (boolean): Agreement sent to merchant
  - `signed` (boolean): Agreement signed by merchant
  - `integration_completed` (boolean): Technical integration completed
  - `partner_agreement_signed` (boolean): Partner agreement signed
  - `ok_to_proceed` (boolean): All checks passed, ok to proceed
  - `soft_copy_available` (boolean): Soft copy of documents available
  - `technical_integration_completed` (boolean): Technical integration done
  - `test_integration` (boolean): Integration testing completed
  - `qa_check` (boolean): QA check completed
  - `training_completed` (boolean): Merchant training completed
  - `uploaded_and_live` (boolean): Merchant is live on platform

  ### Website Development Specific Fields
  - `commercial_proposal_shared` (boolean): Commercial proposal sent
  - `content_management` (text): Content management system details
  - `website_type` (text): Type of website to be developed

  ## Security
  No RLS changes — existing opportunity policies cover all new columns.
*/

DO $$
DECLARE
  col RECORD;
BEGIN

  -- ── Commercial / Fee columns ─────────────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='send_note') THEN
    ALTER TABLE opportunity ADD COLUMN send_note text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='setup_fees') THEN
    ALTER TABLE opportunity ADD COLUMN setup_fees numeric(18,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='setup_currency_id') THEN
    ALTER TABLE opportunity ADD COLUMN setup_currency_id uuid REFERENCES currency(currency_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='setup_vat') THEN
    ALTER TABLE opportunity ADD COLUMN setup_vat numeric(5,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='monthly_fees') THEN
    ALTER TABLE opportunity ADD COLUMN monthly_fees numeric(18,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='monthly_currency_id') THEN
    ALTER TABLE opportunity ADD COLUMN monthly_currency_id uuid REFERENCES currency(currency_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='monthly_vat') THEN
    ALTER TABLE opportunity ADD COLUMN monthly_vat numeric(5,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='monthly_cost') THEN
    ALTER TABLE opportunity ADD COLUMN monthly_cost numeric(18,2);
  END IF;

  -- ── Processing / Transaction columns ────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='local_rate') THEN
    ALTER TABLE opportunity ADD COLUMN local_rate numeric(10,4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='international_rate') THEN
    ALTER TABLE opportunity ADD COLUMN international_rate numeric(10,4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='profit_margin') THEN
    ALTER TABLE opportunity ADD COLUMN profit_margin numeric(10,4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='estimated_avg_transactions_per_month') THEN
    ALTER TABLE opportunity ADD COLUMN estimated_avg_transactions_per_month integer;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='estimated_average_volume') THEN
    ALTER TABLE opportunity ADD COLUMN estimated_average_volume numeric(18,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='estimated_volume') THEN
    ALTER TABLE opportunity ADD COLUMN estimated_volume numeric(18,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='processing_rate') THEN
    ALTER TABLE opportunity ADD COLUMN processing_rate numeric(10,4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='processing_currency_id') THEN
    ALTER TABLE opportunity ADD COLUMN processing_currency_id uuid REFERENCES currency(currency_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='montypay_estimated_revenue') THEN
    ALTER TABLE opportunity ADD COLUMN montypay_estimated_revenue numeric(18,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='minimum_transaction_amount') THEN
    ALTER TABLE opportunity ADD COLUMN minimum_transaction_amount numeric(18,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='maximum_transaction_amount') THEN
    ALTER TABLE opportunity ADD COLUMN maximum_transaction_amount numeric(18,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='uk_card') THEN
    ALTER TABLE opportunity ADD COLUMN uk_card numeric(10,4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='premium_local') THEN
    ALTER TABLE opportunity ADD COLUMN premium_local numeric(10,4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='international_processing') THEN
    ALTER TABLE opportunity ADD COLUMN international_processing numeric(10,4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='dev_bank_transfer') THEN
    ALTER TABLE opportunity ADD COLUMN dev_bank_transfer numeric(10,4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='wallet_fee') THEN
    ALTER TABLE opportunity ADD COLUMN wallet_fee numeric(10,4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='dev_qris') THEN
    ALTER TABLE opportunity ADD COLUMN dev_qris numeric(10,4);
  END IF;

  -- ── Settlement columns ───────────────────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='settlement_frequency') THEN
    ALTER TABLE opportunity ADD COLUMN settlement_frequency text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='settlement_account') THEN
    ALTER TABLE opportunity ADD COLUMN settlement_account text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='settlement_client') THEN
    ALTER TABLE opportunity ADD COLUMN settlement_client text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='settlement_contact') THEN
    ALTER TABLE opportunity ADD COLUMN settlement_contact text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='bank_name') THEN
    ALTER TABLE opportunity ADD COLUMN bank_name text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='wallet_type') THEN
    ALTER TABLE opportunity ADD COLUMN wallet_type text;
  END IF;

  -- ── Approval status columns ──────────────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='technical_status') THEN
    ALTER TABLE opportunity ADD COLUMN technical_status text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='technical_approved_by') THEN
    ALTER TABLE opportunity ADD COLUMN technical_approved_by uuid REFERENCES crm_user(user_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='technical_approved_on') THEN
    ALTER TABLE opportunity ADD COLUMN technical_approved_on timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='compliance_status') THEN
    ALTER TABLE opportunity ADD COLUMN compliance_status text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='compliance_approved_by') THEN
    ALTER TABLE opportunity ADD COLUMN compliance_approved_by uuid REFERENCES crm_user(user_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='compliance_approved_on') THEN
    ALTER TABLE opportunity ADD COLUMN compliance_approved_on timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='operation_status') THEN
    ALTER TABLE opportunity ADD COLUMN operation_status text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='operations_approved_by') THEN
    ALTER TABLE opportunity ADD COLUMN operations_approved_by uuid REFERENCES crm_user(user_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='operations_approved_on') THEN
    ALTER TABLE opportunity ADD COLUMN operations_approved_on timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='settlement_status') THEN
    ALTER TABLE opportunity ADD COLUMN settlement_status text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='settlement_approved_by') THEN
    ALTER TABLE opportunity ADD COLUMN settlement_approved_by uuid REFERENCES crm_user(user_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='settlement_approved_on') THEN
    ALTER TABLE opportunity ADD COLUMN settlement_approved_on timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='qa_status') THEN
    ALTER TABLE opportunity ADD COLUMN qa_status text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='qa_approved_by') THEN
    ALTER TABLE opportunity ADD COLUMN qa_approved_by uuid REFERENCES crm_user(user_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='qa_approved_on') THEN
    ALTER TABLE opportunity ADD COLUMN qa_approved_on timestamptz;
  END IF;

  -- ── Boolean checklist columns ────────────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='send_questionnaire_file') THEN
    ALTER TABLE opportunity ADD COLUMN send_questionnaire_file boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='documents_received') THEN
    ALTER TABLE opportunity ADD COLUMN documents_received boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='start_agreement_approval') THEN
    ALTER TABLE opportunity ADD COLUMN start_agreement_approval boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='agreement_sent_to_merchant') THEN
    ALTER TABLE opportunity ADD COLUMN agreement_sent_to_merchant boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='signed') THEN
    ALTER TABLE opportunity ADD COLUMN signed boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='integration_completed') THEN
    ALTER TABLE opportunity ADD COLUMN integration_completed boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='partner_agreement_signed') THEN
    ALTER TABLE opportunity ADD COLUMN partner_agreement_signed boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='ok_to_proceed') THEN
    ALTER TABLE opportunity ADD COLUMN ok_to_proceed boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='soft_copy_available') THEN
    ALTER TABLE opportunity ADD COLUMN soft_copy_available boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='technical_integration_completed') THEN
    ALTER TABLE opportunity ADD COLUMN technical_integration_completed boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='test_integration') THEN
    ALTER TABLE opportunity ADD COLUMN test_integration boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='qa_check') THEN
    ALTER TABLE opportunity ADD COLUMN qa_check boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='training_completed') THEN
    ALTER TABLE opportunity ADD COLUMN training_completed boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='uploaded_and_live') THEN
    ALTER TABLE opportunity ADD COLUMN uploaded_and_live boolean NOT NULL DEFAULT false;
  END IF;

  -- ── Website Development specific columns ─────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='commercial_proposal_shared') THEN
    ALTER TABLE opportunity ADD COLUMN commercial_proposal_shared boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='content_management') THEN
    ALTER TABLE opportunity ADD COLUMN content_management text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='opportunity' AND column_name='website_type') THEN
    ALTER TABLE opportunity ADD COLUMN website_type text;
  END IF;

END $$;

-- ── Indexes on FK columns ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_opp_setup_currency    ON opportunity(setup_currency_id);
CREATE INDEX IF NOT EXISTS idx_opp_monthly_currency  ON opportunity(monthly_currency_id);
CREATE INDEX IF NOT EXISTS idx_opp_proc_currency     ON opportunity(processing_currency_id);
CREATE INDEX IF NOT EXISTS idx_opp_tech_approved_by  ON opportunity(technical_approved_by);
CREATE INDEX IF NOT EXISTS idx_opp_comp_approved_by  ON opportunity(compliance_approved_by);
CREATE INDEX IF NOT EXISTS idx_opp_ops_approved_by   ON opportunity(operations_approved_by);
CREATE INDEX IF NOT EXISTS idx_opp_sett_approved_by  ON opportunity(settlement_approved_by);
CREATE INDEX IF NOT EXISTS idx_opp_qa_approved_by    ON opportunity(qa_approved_by);
