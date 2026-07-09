import type { AutomationRule, AutomationOperator, AutomationActionType } from '../../types/automationRule';

const OPERATOR_LABEL: Record<AutomationOperator, string> = {
  changes_to: 'changes to',
  equals: 'equals',
  changes_from_to: 'changes from → to',
  is_any_of: 'is any of',
  changed: 'changes',
};

export function operatorLabel(op: AutomationOperator): string {
  return OPERATOR_LABEL[op] ?? op;
}

function valueLabel(rule: Pick<AutomationRule, 'operator' | 'trigger_value'>): string {
  const v = rule.trigger_value;
  if (rule.operator === 'changed') return '';
  if (rule.operator === 'is_any_of' && Array.isArray(v)) return `[${v.join(', ')}]`;
  if (rule.operator === 'changes_from_to' && v && typeof v === 'object') {
    const ft = v as { from?: unknown; to?: unknown };
    return `${ft.from ?? '∅'} → ${ft.to ?? ''}`;
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return v == null ? '' : String(v);
}

/** e.g. "When Start Approval changes to Yes" */
export function triggerSummary(
  rule: Pick<AutomationRule, 'operator' | 'trigger_value' | 'field_logical_name' | 'trigger_event'>,
  fieldDisplayName?: string,
): string {
  const field = fieldDisplayName ?? rule.field_logical_name ?? 'any field';
  const val = valueLabel(rule);
  const evt = rule.trigger_event === 'create' ? 'created' : rule.trigger_event === 'both' ? 'created/updated' : 'updated';
  if (!rule.field_logical_name) return `When a record is ${evt}`;
  return `When ${field} ${operatorLabel(rule.operator)}${val ? ` ${val}` : ''}`;
}

const ACTION_LABEL: Record<AutomationActionType, string> = {
  list_rows: 'List rows',
  send_email: 'Send email',
  update_field: 'Update field',
  generate_document: 'Generate document',
};

export function actionLabel(t: AutomationActionType): string {
  return ACTION_LABEL[t] ?? t;
}

export function actionsSummary(types: AutomationActionType[]): string {
  if (types.length === 0) return 'No actions';
  return types.map(actionLabel).join(', ');
}
