export type RuleScope = 'all_forms' | 'specific_form' | 'specific_bpf' | 'specific_bpf_stage';
export type ConditionOperator =
  | 'eq' | 'neq'
  | 'contains' | 'not_contains' | 'begins_with' | 'ends_with'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'is_null' | 'is_not_null'
  | 'in' | 'not_in'
  | 'between';

export type ConditionGroupOperator = 'AND' | 'OR';

export type ProcessFlowField = 'process_flow' | 'current_stage' | 'stage_category';

export interface RuleCondition {
  id: string;
  field_logical_name: string;
  field_display_name: string;
  field_type_name: string;
  operator: ConditionOperator;
  value: string | string[] | null;
  value2?: string | null;
  source?: 'entity' | 'process_flow';
  process_flow_field?: ProcessFlowField;
  process_flow_id?: string | null;
}

export interface RuleConditionGroup {
  id: string;
  operator: ConditionGroupOperator;
  conditions: RuleCondition[];
  groups: RuleConditionGroup[];
}

export type ActionType =
  | 'set_visibility'
  | 'lock_unlock'
  | 'show_error_message'
  | 'set_field_value'
  | 'set_default_value'
  | 'set_business_required'
  | 'clear_field_value'
  | 'advanced_formula_value'
  | 'add_recommendation'
  // legacy types kept for backwards compat (existing saved rules)
  | 'require_field'
  | 'unrequire_field'
  | 'show_field'
  | 'hide_field'
  | 'lock_field'
  | 'unlock_field'
  | 'set_value'
  | 'clear_value'
  | 'show_message'
  | 'set_field_options';

export type FormulaTokenType = 'field' | 'text' | 'operator' | 'date_offset';

export interface FormulaToken {
  id: string;
  type: FormulaTokenType;
  field?: string;
  value?: string;
  operator?: string;
  offset_days?: number;
}

export interface RuleAction {
  id: string;
  action_type: ActionType;
  // target field
  target_field?: string;
  target_field_display_name?: string;
  // generic value (boolean, string, etc. depending on action_type)
  value?: string | boolean;
  // set_field_value / set_default_value
  value_type?: 'static' | 'field' | 'current_user';
  value_field?: string;       // legacy single field (kept for backwards compat)
  value_fields?: string[];    // ordered list of fields to concatenate
  value_fields_separator?: string; // separator between fields, default ' '
  apply_when?: 'always' | 'if_empty' | 'on_create';
  // set_business_required
  required_level?: 'required' | 'recommended' | 'none';
  // show_error_message
  message?: string;
  block_save?: boolean;
  // add_recommendation
  recommendation_title?: string;
  recommendation_message?: string;
  // advanced_formula_value
  formula_tokens?: FormulaToken[];
  // legacy show_message fields
  message_text?: string;
  message_level?: 'info' | 'warning' | 'error';
  blocks_save?: boolean;
  recommendation_description?: string;
  value_source?: 'static' | 'field' | 'expression';
  value_expression?: string;
}

export interface RuleTrigger {
  trigger_on: 'onLoad' | 'onChange' | 'always';
  watch_fields: string[];
  condition_group: RuleConditionGroup | null;
}

export interface BusinessRule {
  business_rule_id: string;
  entity_definition_id: string;
  name: string;
  description: string | null;
  trigger_json: RuleTrigger;
  action_json: RuleActionSet;
  scope: RuleScope;
  target_form_id: string | null;
  target_process_flow_id: string | null;
  target_process_stage_id: string | null;
  run_order: number;
  is_active: boolean;
  is_system: boolean;
  is_deletable: boolean;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
  modified_at: string;
}

/**
 * A single condition block: its own IF condition group plus the THEN/ELSE
 * actions that belong exclusively to it. Multiple blocks are evaluated
 * independently — actions in one block never affect another.
 */
export interface RuleConditionBlock {
  id: string;
  name?: string;
  condition_group: RuleConditionGroup | null;
  if_actions: RuleAction[];
  else_actions: RuleAction[];
}

export interface RuleActionSet {
  // Legacy / mirror of the first condition block (kept for backwards compat
  // with rules and consumers that only read these fields).
  if_actions: RuleAction[];
  else_actions: RuleAction[];
  // Multiple condition blocks. When present and non-empty this is the source
  // of truth; the first block is mirrored to if_actions/else_actions above.
  condition_blocks?: RuleConditionBlock[];
}

/**
 * Normalize a rule's trigger + action JSON into the canonical list of
 * condition blocks. Rules saved before multi-block support are migrated on
 * the fly into a single block built from the legacy condition_group +
 * if_actions/else_actions, so all consumers can treat every rule uniformly.
 */
export function getRuleConditionBlocks(
  trigger: RuleTrigger | null | undefined,
  actionSet: RuleActionSet | null | undefined,
): RuleConditionBlock[] {
  const blocks = actionSet?.condition_blocks;
  if (blocks && blocks.length > 0) return blocks;
  return [
    {
      id: 'block_1',
      name: 'Condition 1',
      condition_group: trigger?.condition_group ?? null,
      if_actions: actionSet?.if_actions ?? [],
      else_actions: actionSet?.else_actions ?? [],
    },
  ];
}

export const ACTION_META: Record<
  ActionType,
  { label: string; group: string; color: string; dotColor: string }
> = {
  add_recommendation:    { label: 'Recommendation',          group: 'Notify',      color: 'text-cyan-700 bg-cyan-50 border-cyan-200',      dotColor: 'bg-cyan-500' },
  lock_unlock:           { label: 'Lock / Unlock',           group: 'Lock',        color: 'text-amber-700 bg-amber-50 border-amber-200',    dotColor: 'bg-amber-500' },
  show_error_message:    { label: 'Show Error Message',      group: 'Notify',      color: 'text-red-700 bg-red-50 border-red-200',          dotColor: 'bg-red-500' },
  set_field_value:       { label: 'Set Field Value',         group: 'Data',        color: 'text-blue-700 bg-blue-50 border-blue-200',       dotColor: 'bg-blue-500' },
  set_default_value:     { label: 'Set Default Value',       group: 'Data',        color: 'text-blue-600 bg-blue-50 border-blue-200',       dotColor: 'bg-blue-400' },
  set_business_required: { label: 'Set Business Required',   group: 'Validation',  color: 'text-rose-700 bg-rose-50 border-rose-200',       dotColor: 'bg-rose-500' },
  set_visibility:        { label: 'Set Visibility',          group: 'Visibility',  color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dotColor: 'bg-emerald-500' },
  clear_field_value:     { label: 'Clear Field Value',       group: 'Data',        color: 'text-slate-600 bg-slate-50 border-slate-200',    dotColor: 'bg-slate-400' },
  advanced_formula_value:{ label: 'Advanced Formula Value',  group: 'Data',        color: 'text-violet-700 bg-violet-50 border-violet-200', dotColor: 'bg-violet-500' },
  // legacy
  require_field:         { label: 'Require Field (legacy)',  group: 'Legacy',      color: 'text-slate-500 bg-slate-50 border-slate-200',    dotColor: 'bg-slate-300' },
  unrequire_field:       { label: 'Make Optional (legacy)',  group: 'Legacy',      color: 'text-slate-500 bg-slate-50 border-slate-200',    dotColor: 'bg-slate-300' },
  show_field:            { label: 'Show Field (legacy)',     group: 'Legacy',      color: 'text-slate-500 bg-slate-50 border-slate-200',    dotColor: 'bg-slate-300' },
  hide_field:            { label: 'Hide Field (legacy)',     group: 'Legacy',      color: 'text-slate-500 bg-slate-50 border-slate-200',    dotColor: 'bg-slate-300' },
  lock_field:            { label: 'Lock Field (legacy)',     group: 'Legacy',      color: 'text-slate-500 bg-slate-50 border-slate-200',    dotColor: 'bg-slate-300' },
  unlock_field:          { label: 'Unlock Field (legacy)',   group: 'Legacy',      color: 'text-slate-500 bg-slate-50 border-slate-200',    dotColor: 'bg-slate-300' },
  set_value:             { label: 'Set Value (legacy)',      group: 'Legacy',      color: 'text-slate-500 bg-slate-50 border-slate-200',    dotColor: 'bg-slate-300' },
  clear_value:           { label: 'Clear Value (legacy)',    group: 'Legacy',      color: 'text-slate-500 bg-slate-50 border-slate-200',    dotColor: 'bg-slate-300' },
  show_message:          { label: 'Show Message (legacy)',   group: 'Legacy',      color: 'text-slate-500 bg-slate-50 border-slate-200',    dotColor: 'bg-slate-300' },
  set_field_options:     { label: 'Filter Options (legacy)', group: 'Legacy',      color: 'text-slate-500 bg-slate-50 border-slate-200',    dotColor: 'bg-slate-300' },
};

export const COND_OPERATORS_BY_TYPE: Record<string, ConditionOperator[]> = {
  text:         ['eq','neq','contains','not_contains','begins_with','ends_with','is_null','is_not_null'],
  textarea:     ['contains','not_contains','is_null','is_not_null'],
  number:       ['eq','neq','gt','gte','lt','lte','between','is_null','is_not_null'],
  decimal:      ['eq','neq','gt','gte','lt','lte','between','is_null','is_not_null'],
  currency:     ['eq','neq','gt','gte','lt','lte','between','is_null','is_not_null'],
  date:         ['eq','neq','gt','gte','lt','lte','between','is_null','is_not_null'],
  datetime:     ['eq','neq','gt','gte','lt','lte','between','is_null','is_not_null'],
  boolean:      ['eq','is_null','is_not_null'],
  lookup:       ['eq','neq','is_null','is_not_null'],
  choice:       ['eq','neq','in','not_in','is_null','is_not_null'],
  multi_choice: ['in','not_in','is_null','is_not_null'],
  email:        ['eq','neq','contains','begins_with','is_null','is_not_null'],
  phone:        ['eq','contains','is_null','is_not_null'],
};

export const PROCESS_FLOW_OPERATORS: ConditionOperator[] = ['eq', 'neq'];

export const PROCESS_FLOW_FIELD_OPTIONS: { value: ProcessFlowField; label: string }[] = [
  { value: 'process_flow',   label: 'Process Flow' },
  { value: 'current_stage',  label: 'Current Stage' },
  { value: 'stage_category', label: 'Stage Category' },
];

export const STAGE_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'general',        label: 'General' },
  { value: 'prospecting',    label: 'Prospecting' },
  { value: 'qualification',  label: 'Qualification' },
  { value: 'proposal',       label: 'Proposal' },
  { value: 'negotiation',    label: 'Negotiation' },
  { value: 'closing',        label: 'Closing' },
  { value: 'post_sale',      label: 'Post-Sale' },
  { value: 'review',         label: 'Review' },
  { value: 'onboarding',     label: 'Onboarding' },
];

export function validateProcessFlowCondition(cond: RuleCondition): string | null {
  if (cond.source !== 'process_flow') return null;
  if (!cond.process_flow_field) return 'Process context field is required';
  if (cond.process_flow_field === 'current_stage' && !cond.process_flow_id)
    return 'Process Flow must be selected when comparing Current Stage';
  if (cond.value == null || cond.value === '') return 'Value is required';
  return null;
}

export const COND_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: 'Equals',
  neq: 'Not Equals',
  contains: 'Contains',
  not_contains: 'Does Not Contain',
  begins_with: 'Begins With',
  ends_with: 'Ends With',
  gt: 'Greater Than',
  gte: 'Greater Than or Equal',
  lt: 'Less Than',
  lte: 'Less Than or Equal',
  is_null: 'Is Empty',
  is_not_null: 'Is Not Empty',
  in: 'In',
  not_in: 'Not In',
  between: 'Between',
};
