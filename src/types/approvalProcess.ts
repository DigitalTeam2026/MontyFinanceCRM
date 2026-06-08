export type StepExecutionMode = 'sequential' | 'parallel';

export type ConditionType =
  | 'always'
  | 'product'
  | 'lob'
  | 'amount_gte'
  | 'amount_lte'
  | 'business_unit'
  | 'stage'
  | 'field_value';

export type ConditionOperator = 'eq' | 'neq' | 'gte' | 'lte' | 'contains' | 'in';

export type ApproverType = 'user' | 'role' | 'team' | 'manager' | 'record_owner';

export type ApprovalAction = 'approve' | 'reject' | 'delegate' | 'reassign';

// ─── Core Entities ─────────────────────────────────────────────────────────

export interface ApprovalProcess {
  approval_process_id: string;
  name: string;
  description: string;
  entity_logical_name: string;
  step_execution_mode: StepExecutionMode;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  modified_at: string;
  deleted_at: string | null;
  conditions?: ApprovalCondition[];
  steps?: ApprovalStep[];
}

export interface ApprovalCondition {
  approval_condition_id: string;
  approval_process_id: string;
  condition_type: ConditionType;
  field_name: string | null;
  operator: ConditionOperator;
  value_text: string | null;
  value_number: number | null;
  ref_id: string | null;
  display_order: number;
  created_at: string;
}

export interface ApprovalStep {
  approval_step_id: string;
  approval_process_id: string;
  step_name: string;
  description: string;
  display_order: number;
  approver_type: ApproverType;
  approver_user_id: string | null;
  approver_role_id: string | null;
  approver_team_id: string | null;
  allowed_actions: ApprovalAction[];
  requires_comment: boolean;
  escalation_after_hours: number | null;
  escalation_to_user_id: string | null;
  is_active: boolean;
  created_at: string;
  modified_at: string;
}

// ─── Form Data ─────────────────────────────────────────────────────────────

export interface ApprovalProcessFormData {
  name: string;
  description: string;
  entity_logical_name: string;
  step_execution_mode: StepExecutionMode;
  is_active: boolean;
}

export interface ApprovalConditionDraft extends Omit<ApprovalCondition, 'approval_condition_id' | 'approval_process_id' | 'created_at'> {
  _tempId: string;
}

export interface ApprovalStepDraft extends Omit<ApprovalStep, 'approval_step_id' | 'approval_process_id' | 'created_at' | 'modified_at'> {
  _tempId: string;
}

// ─── Metadata ──────────────────────────────────────────────────────────────

export const STEP_EXECUTION_MODE_META: Record<StepExecutionMode, { label: string; description: string; icon: string }> = {
  sequential: {
    label: 'Sequential',
    description: 'Steps run one after another in order. Each step must complete before the next begins.',
    icon: '→',
  },
  parallel: {
    label: 'Parallel',
    description: 'All steps are triggered at the same time. All must approve before the process completes.',
    icon: '⇉',
  },
};

export const CONDITION_TYPE_META: Record<ConditionType, { label: string; description: string; hasRef: boolean; hasAmount: boolean; hasField: boolean }> = {
  always:        { label: 'Always',            description: 'Applies to all records of the entity',           hasRef: false, hasAmount: false, hasField: false },
  product:       { label: 'Product',           description: 'Applies when the record involves a product',     hasRef: true,  hasAmount: false, hasField: false },
  lob:           { label: 'Line of Business',  description: 'Applies to a specific line of business',        hasRef: true,  hasAmount: false, hasField: false },
  amount_gte:    { label: 'Amount ≥',          description: 'Triggers when the deal value is at or above',   hasRef: false, hasAmount: true,  hasField: false },
  amount_lte:    { label: 'Amount ≤',          description: 'Triggers when the deal value is at or below',   hasRef: false, hasAmount: true,  hasField: false },
  business_unit: { label: 'Business Unit',     description: 'Applies when the record belongs to a BU',       hasRef: true,  hasAmount: false, hasField: false },
  stage:         { label: 'Pipeline Stage',    description: 'Triggers when the record enters a stage',       hasRef: true,  hasAmount: false, hasField: false },
  field_value:   { label: 'Field Value',       description: 'Evaluates a field on the record',               hasRef: false, hasAmount: false, hasField: true  },
};

export const APPROVER_TYPE_META: Record<ApproverType, { label: string; description: string }> = {
  user:         { label: 'Specific User',   description: 'Assigns to a named CRM user' },
  role:         { label: 'Security Role',   description: 'Assigns to any user holding a security role' },
  team:         { label: 'Team',            description: 'Assigns to a team — any member can approve' },
  manager:      { label: "Record Owner's Manager", description: "Automatically resolves to the owner's direct manager" },
  record_owner: { label: 'Record Owner',    description: 'The user who owns the record approves it' },
};

export const APPROVAL_ACTION_META: Record<ApprovalAction, { label: string; color: string }> = {
  approve:   { label: 'Approve',   color: '#059669' },
  reject:    { label: 'Reject',    color: '#dc2626' },
  delegate:  { label: 'Delegate',  color: '#2563eb' },
  reassign:  { label: 'Reassign',  color: '#d97706' },
};

export const KNOWN_ENTITIES = [
  { logical_name: 'opportunity', display_name: 'Opportunity' },
  { logical_name: 'order',       display_name: 'Order' },
  { logical_name: 'quote',       display_name: 'Quote' },
  { logical_name: 'contract',    display_name: 'Contract' },
  { logical_name: 'case',        display_name: 'Case' },
  { logical_name: 'lead',        display_name: 'Lead' },
  { logical_name: 'account',     display_name: 'Account' },
];
