/*
  # Approval Status and Settlement Frequency Option Sets

  ## Summary
  Creates two reusable option sets used across MontyPay opportunity fields:

  1. **approval_status** — used for technical_status, compliance_status,
     operation_status, settlement_status, qa_status fields.
     Values: pending, in_review, approved, rejected, returned

  2. **settlement_frequency** — used for the settlement_frequency field.
     Values: daily, weekly, biweekly, monthly

  ## New Option Sets
  - `approval_status` (global: false, entity-scoped)
  - `settlement_frequency` (global: false, entity-scoped)

  ## Security
  No changes — option_set and option_set_value tables already have RLS.
*/

DO $$
DECLARE
  v_approval_os_id     uuid;
  v_settlement_os_id   uuid;
BEGIN

  -- ── Approval Status option set ───────────────────────────────────────────
  INSERT INTO option_set (name, display_name, description, is_global)
  VALUES ('approval_status', 'Approval Status', 'Status for internal approval workflow steps', false)
  ON CONFLICT (name) DO NOTHING;

  SELECT option_set_id INTO v_approval_os_id FROM option_set WHERE name = 'approval_status';

  INSERT INTO option_set_value (option_set_id, value, display_label, sort_order, color, is_active)
  VALUES
    (v_approval_os_id, 'pending',   'Pending',   10, '#6b7280', true),
    (v_approval_os_id, 'in_review', 'In Review', 20, '#f59e0b', true),
    (v_approval_os_id, 'approved',  'Approved',  30, '#10b981', true),
    (v_approval_os_id, 'rejected',  'Rejected',  40, '#ef4444', true),
    (v_approval_os_id, 'returned',  'Returned',  50, '#f97316', true)
  ON CONFLICT DO NOTHING;

  -- ── Settlement Frequency option set ──────────────────────────────────────
  INSERT INTO option_set (name, display_name, description, is_global)
  VALUES ('settlement_frequency', 'Settlement Frequency', 'How often merchant settlement is processed', false)
  ON CONFLICT (name) DO NOTHING;

  SELECT option_set_id INTO v_settlement_os_id FROM option_set WHERE name = 'settlement_frequency';

  INSERT INTO option_set_value (option_set_id, value, display_label, sort_order, color, is_active)
  VALUES
    (v_settlement_os_id, 'daily',     'Daily',     10, '#3b82f6', true),
    (v_settlement_os_id, 'weekly',    'Weekly',    20, '#3b82f6', true),
    (v_settlement_os_id, 'biweekly',  'Biweekly',  30, '#3b82f6', true),
    (v_settlement_os_id, 'monthly',   'Monthly',   40, '#3b82f6', true)
  ON CONFLICT DO NOTHING;

END $$;
