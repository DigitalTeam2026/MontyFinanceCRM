import type { AutomationRule, AutomationOperator, AutomationActionType, AutomationRunAfter, ScheduleConfig } from '../../types/automationRule';

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
  get_row: 'Get row by ID',
  send_email: 'Send email',
  update_field: 'Update field',
  generate_document: 'Generate document',
  export_view_email: 'Export view & email',
  related_export_email: 'Related export & email',
  send_documents_email: 'Send documents by email',
  create_related_record: 'Create related record',
  update_related_record: 'Update related record',
  condition: 'Condition',
  switch: 'Switch',
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINAL = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
function hhmm(cfg: ScheduleConfig): string {
  const h = Math.min(23, Math.max(0, Math.trunc(cfg.hour ?? 8)));
  const m = Math.min(59, Math.max(0, Math.trunc(cfg.minute ?? 0)));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Plain-language cadence, e.g. "Every Monday at 08:00". */
export function scheduleSummary(cfg: ScheduleConfig | null | undefined): string {
  if (!cfg || !cfg.frequency) return 'Not scheduled';
  switch (cfg.frequency) {
    case 'hourly':  return `Every hour at :${String(Math.min(59, Math.max(0, Math.trunc(cfg.minute ?? 0)))).padStart(2, '0')}`;
    case 'daily':   return `Every day at ${hhmm(cfg)}`;
    case 'weekly':  return `Every ${WEEKDAYS[Math.min(6, Math.max(0, Math.trunc(cfg.weekday ?? 1)))]} at ${hhmm(cfg)}`;
    case 'monthly': return `Every ${ORDINAL(Math.min(31, Math.max(1, Math.trunc(cfg.monthday ?? 1))))} of the month at ${hhmm(cfg)}`;
    default:        return 'Custom schedule';
  }
}

export function actionLabel(t: AutomationActionType): string {
  return ACTION_LABEL[t] ?? t;
}

export function actionsSummary(types: AutomationActionType[]): string {
  if (types.length === 0) return 'No actions';
  return types.map(actionLabel).join(', ');
}

/** "Configure run after" labels + branch styling, shared by the flow editor. */
export const RUN_AFTER_META: Record<AutomationRunAfter, { label: string; short: string; hint: string; cls: string }> = {
  success: { label: 'On success', short: 'Success', hint: 'Runs only if every earlier action succeeded.', cls: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  failure: { label: 'On failure', short: 'Failure', hint: 'Runs only if an earlier action failed — a "catch" step.', cls: 'text-red-600 bg-red-50 border-red-200' },
  always:  { label: 'Always',     short: 'Always',  hint: 'Runs regardless of earlier results — a "finally" step.', cls: 'text-slate-600 bg-slate-100 border-slate-200' },
};

/** Compact relative time, e.g. "3m ago", "2h ago", "5d ago". Falls back to a date. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 45) return 'just now';
  if (s < 90) return '1m ago';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
