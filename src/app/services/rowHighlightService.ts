import type { AppEntity } from '../types';
import type { ListRow } from './listService';

export type HighlightColor =
  | 'red'
  | 'amber'
  | 'green'
  | 'blue'
  | 'sky'
  | 'emerald'
  | 'orange'
  | 'rose'
  | 'teal';

export interface HighlightRule {
  id: string;
  label: string;
  color: HighlightColor;
  priority: number;
  test: (row: ListRow) => boolean;
}

export interface HighlightResult {
  rule: HighlightRule;
  rowClass: string;
  leftBorderClass: string;
  badgeClass: string;
  badgeDotClass: string;
}

const COLOR_CLASSES: Record<HighlightColor, { row: string; leftBorder: string; badge: string; dot: string }> = {
  red:     { row: '',  leftBorder: 'border-l-[3px] border-l-red-500',     badge: 'bg-red-100 text-red-700',        dot: 'bg-red-500' },
  rose:    { row: '',  leftBorder: 'border-l-[3px] border-l-rose-400',    badge: 'bg-rose-100 text-rose-700',      dot: 'bg-rose-400' },
  amber:   { row: '',  leftBorder: 'border-l-[3px] border-l-amber-400',   badge: 'bg-amber-100 text-amber-700',    dot: 'bg-amber-400' },
  orange:  { row: '',  leftBorder: 'border-l-[3px] border-l-orange-400',  badge: 'bg-orange-100 text-orange-700',  dot: 'bg-orange-400' },
  green:   { row: '',  leftBorder: 'border-l-[3px] border-l-green-500',   badge: 'bg-green-100 text-green-700',    dot: 'bg-green-500' },
  emerald: { row: '',  leftBorder: 'border-l-[3px] border-l-emerald-500', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  teal:    { row: '',  leftBorder: 'border-l-[3px] border-l-teal-500',    badge: 'bg-teal-100 text-teal-700',      dot: 'bg-teal-500' },
  sky:     { row: '',  leftBorder: 'border-l-[3px] border-l-sky-500',     badge: 'bg-sky-100 text-sky-700',        dot: 'bg-sky-500' },
  blue:    { row: '',  leftBorder: 'border-l-[3px] border-l-blue-500',    badge: 'bg-blue-100 text-blue-700',      dot: 'bg-blue-500' },
};

function daysAgo(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / 86_400_000;
}

function daysUntil(isoDate: string): number {
  return (new Date(isoDate).getTime() - Date.now()) / 86_400_000;
}

function statusIs(val: unknown, ...targets: string[]): boolean {
  if (val == null) return false;
  const s = String(val).toLowerCase();
  return targets.some((t) => t === s);
}

const ENTITY_RULES: Record<AppEntity, HighlightRule[]> = {
  opportunities: [
    {
      id: 'opp_won',
      label: 'Won',
      color: 'emerald',
      priority: 10,
      test: (r) => statusIs(r.state_code, 'won') || statusIs(r.stage, 'won'),
    },
    {
      id: 'opp_lost',
      label: 'Lost',
      color: 'red',
      priority: 10,
      test: (r) => statusIs(r.state_code, 'lost') || statusIs(r.stage, 'lost'),
    },
    {
      id: 'opp_closing_soon',
      label: 'Closing soon',
      color: 'amber',
      priority: 8,
      test: (r) => {
        const closeDate = r.estimated_close_date as string | null;
        if (!closeDate) return false;
        const d = daysUntil(closeDate);
        return d >= 0 && d <= 14;
      },
    },
    {
      id: 'opp_overdue_close',
      label: 'Overdue',
      color: 'red',
      priority: 9,
      test: (r) => {
        const closeDate = r.estimated_close_date as string | null;
        if (!closeDate || statusIs(r.state_code, 'won', 'lost')) return false;
        return daysUntil(closeDate) < 0;
      },
    },
    {
      id: 'opp_high_value',
      label: 'High value',
      color: 'sky',
      priority: 5,
      test: (r) => {
        const v = Number(r.estimated_value ?? 0);
        return v >= 50_000;
      },
    },
  ],
  tickets: [
    {
      id: 'ticket_urgent',
      label: 'Urgent',
      color: 'red',
      priority: 10,
      test: (r) => r.priority === 'urgent',
    },
    {
      id: 'ticket_high',
      label: 'High priority',
      color: 'orange',
      priority: 9,
      test: (r) => r.priority === 'high',
    },
    {
      id: 'ticket_overdue',
      label: 'Overdue (7+ days open)',
      color: 'rose',
      priority: 8,
      test: (r) => {
        const created = r.created_at as string | null;
        if (!created) return false;
        return statusIs(r.state_code, 'open', 'in_progress', 'active') && daysAgo(created) >= 7;
      },
    },
    {
      id: 'ticket_resolved',
      label: 'Resolved',
      color: 'emerald',
      priority: 5,
      test: (r) => statusIs(r.state_code, 'resolved', 'closed', 'inactive'),
    },
    {
      id: 'ticket_pending',
      label: 'Pending',
      color: 'amber',
      priority: 6,
      test: (r) => statusIs(r.state_code, 'pending'),
    },
  ],
  leads: [
    {
      id: 'lead_hot',
      label: 'Hot lead',
      color: 'red',
      priority: 10,
      test: (r) => r.rating === 'hot',
    },
    {
      id: 'lead_warm',
      label: 'Warm lead',
      color: 'amber',
      priority: 9,
      test: (r) => r.rating === 'warm',
    },
    {
      id: 'lead_qualified',
      label: 'Qualified',
      color: 'green',
      priority: 8,
      test: (r) => statusIs(r.state_code, 'qualified'),
    },
    {
      id: 'lead_disqualified',
      label: 'Disqualified',
      color: 'rose',
      priority: 7,
      test: (r) => statusIs(r.state_code, 'disqualified'),
    },
    {
      id: 'lead_stale',
      label: 'Stale (30+ days)',
      color: 'orange',
      priority: 5,
      test: (r) => {
        const created = r.created_at as string | null;
        return !!created && daysAgo(created) >= 30 && statusIs(r.state_code, 'new', 'open');
      },
    },
  ],
  accounts: [
    {
      id: 'account_inactive',
      label: 'Inactive',
      color: 'red',
      priority: 9,
      test: (r) => statusIs(r.state_code, 'inactive'),
    },
    {
      id: 'account_new',
      label: 'New (last 7 days)',
      color: 'green',
      priority: 5,
      test: (r) => {
        const created = r.created_at as string | null;
        return !!created && daysAgo(created) <= 7;
      },
    },
  ],
  contacts: [
    {
      id: 'contact_inactive',
      label: 'Inactive',
      color: 'red',
      priority: 9,
      test: (r) => statusIs(r.state_code, 'inactive'),
    },
    {
      id: 'contact_new',
      label: 'New (last 7 days)',
      color: 'green',
      priority: 5,
      test: (r) => {
        const created = r.created_at as string | null;
        return !!created && daysAgo(created) <= 7;
      },
    },
  ],
};

export function evaluateRowHighlight(entity: AppEntity, row: ListRow): HighlightResult | null {
  const rules = ENTITY_RULES[entity] ?? [];
  const matching = rules
    .filter((r) => r.test(row))
    .sort((a, b) => b.priority - a.priority);

  if (matching.length === 0) return null;

  const rule = matching[0];
  const colors = COLOR_CLASSES[rule.color];

  return {
    rule,
    rowClass: colors.row,
    leftBorderClass: colors.leftBorder,
    badgeClass: colors.badge,
    badgeDotClass: colors.dot,
  };
}

export function getEntityRules(entity: AppEntity): HighlightRule[] {
  return ENTITY_RULES[entity] ?? [];
}
