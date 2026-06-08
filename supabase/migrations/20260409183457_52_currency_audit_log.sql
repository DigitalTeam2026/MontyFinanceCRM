/*
  # Currency Audit Log

  ## Summary
  Adds a dedicated `currency_audit_log` table to capture every monetary or
  currency-related change with full fintech-grade context.

  Unlike the generic `field_change_log`, every row here explicitly records:
  - Which monetary field changed (e.g. estimated_value, annual_revenue)
  - Old and new numeric amounts
  - Old and new currency (code + symbol), not just a UUID
  - Exchange rate in effect at the time of change (if applicable)
  - Whether an FX conversion was involved
  - The source of the change (system_save, controlled_currency_change, workflow, import)
  - An optional reason (required for controlled currency overrides)
  - User and timestamp

  ## New Tables
  - `currency_audit_log`
    - `log_id` (uuid, primary key)
    - `entity_name` (text) — physical table name e.g. 'opportunity'
    - `record_id` (uuid)
    - `field_name` (text) — monetary field that changed, or '__currency__' for currency-only changes
    - `old_amount` (numeric) — previous numeric value (null if field was blank)
    - `new_amount` (numeric) — new numeric value (null if field was cleared)
    - `old_currency_id` (uuid, FK currency)
    - `new_currency_id` (uuid, FK currency)
    - `old_currency_code` (text) — snapshot of code at time of change
    - `new_currency_code` (text) — snapshot of code at time of change
    - `old_currency_symbol` (text) — snapshot
    - `new_currency_symbol` (text) — snapshot
    - `exchange_rate_snapshot` (numeric) — rate used if conversion occurred
    - `conversion_occurred` (boolean) — whether currencies differed
    - `change_source` (text) — 'system_save' | 'controlled_currency_change' | 'workflow' | 'import' | 'status_lock'
    - `reason` (text) — free-text reason (required for controlled changes)
    - `changed_by` (uuid, FK auth.users)
    - `changed_at` (timestamptz)

  ## Security
  - RLS enabled
  - Authenticated users may read and insert
  - No UPDATE or DELETE (immutable audit trail)

  ## Indexes
  - (entity_name, record_id, changed_at DESC) for per-record queries
  - (field_name) for field-level filtering
  - (change_source) for source-based filtering
*/

CREATE TABLE IF NOT EXISTS currency_audit_log (
  log_id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name            text        NOT NULL,
  record_id              uuid        NOT NULL,
  field_name             text        NOT NULL,
  old_amount             numeric,
  new_amount             numeric,
  old_currency_id        uuid        REFERENCES currency (currency_id) ON DELETE SET NULL,
  new_currency_id        uuid        REFERENCES currency (currency_id) ON DELETE SET NULL,
  old_currency_code      text,
  new_currency_code      text,
  old_currency_symbol    text,
  new_currency_symbol    text,
  exchange_rate_snapshot numeric,
  conversion_occurred    boolean     NOT NULL DEFAULT false,
  change_source          text        NOT NULL DEFAULT 'system_save',
  reason                 text,
  changed_by             uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  changed_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS currency_audit_log_record_idx
  ON currency_audit_log (entity_name, record_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS currency_audit_log_field_idx
  ON currency_audit_log (field_name);

CREATE INDEX IF NOT EXISTS currency_audit_log_source_idx
  ON currency_audit_log (change_source);

ALTER TABLE currency_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read currency audit logs"
  ON currency_audit_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert currency audit logs"
  ON currency_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (changed_by = auth.uid());
