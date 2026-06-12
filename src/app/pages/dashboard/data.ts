// Dashboard data-access layer.
//
// PERMISSIONS: every query runs through the authenticated Supabase session, so
// Row-Level Security scopes results to exactly what the current user may read
// (account/lead/opportunity policies use crm_user_has_access(...)). No extra
// ownership filtering is needed here — RLS is the source of truth.
//
// AGGREGATION: counts use server-side `head` counts (no rows transferred). The
// grouped charts fetch only the grouping column(s) for the period and bucket in
// JS — these are low-cardinality sales tables. The production-ideal is a set of
// SECURITY DEFINER aggregate RPCs (see supabase/migrations/*dashboard_aggregates*),
// which this module is structured to swap to without touching the UI.

import { supabase } from '../../../lib/supabase';
import { batchResolveLookupLabels } from '../../services/displayResolver';
import type { Datum } from './charts';
import type { DateRange } from './theme';
import { lastMonths } from './theme';

// ── Metadata: entity ids + state/status-reason label maps ────────────────────

interface StatusMaps {
  entityDefId: string;
  /** state_value (as string) → label, e.g. "1" → "Open". */
  stateByCode: Record<string, string>;
  /** label (lowercased) → state_value, e.g. "won" → "2". */
  stateByLabel: Record<string, string>;
  /** reason_value (as string) → label. */
  reasonByCode: Record<string, string>;
}

const ctxCache = new Map<string, StatusMaps | null>();

async function getStatusMaps(entityLogical: string): Promise<StatusMaps | null> {
  if (ctxCache.has(entityLogical)) return ctxCache.get(entityLogical)!;

  const { data: ed } = await supabase
    .from('entity_definition')
    .select('entity_definition_id')
    .eq('logical_name', entityLogical)
    .maybeSingle();
  if (!ed) { ctxCache.set(entityLogical, null); return null; }
  const entityDefId = (ed as { entity_definition_id: string }).entity_definition_id;

  const [{ data: states }, { data: reasons }] = await Promise.all([
    supabase.from('statecode_definition').select('state_value, display_label').eq('entity_definition_id', entityDefId),
    supabase.from('status_reason_definition').select('reason_value, display_label').eq('entity_definition_id', entityDefId).eq('is_active', true),
  ]);

  const stateByCode: Record<string, string> = {};
  const stateByLabel: Record<string, string> = {};
  for (const r of (states ?? []) as { state_value: number; display_label: string }[]) {
    stateByCode[String(r.state_value)] = r.display_label;
    stateByLabel[r.display_label.toLowerCase()] = String(r.state_value);
    // Some tables (e.g. crm_prospect after normalisation) store state_code as the
    // lowercased label text ('active' / 'converted') rather than the numeric
    // state_value. Index by that too so both representations resolve to a label.
    stateByCode[r.display_label.toLowerCase()] = r.display_label;
  }
  const reasonByCode: Record<string, string> = {};
  for (const r of (reasons ?? []) as { reason_value: number; display_label: string }[]) {
    reasonByCode[String(r.reason_value)] = r.display_label;
  }

  const maps: StatusMaps = { entityDefId, stateByCode, stateByLabel, reasonByCode };
  ctxCache.set(entityLogical, maps);
  return maps;
}

// ── Generic helpers ──────────────────────────────────────────────────────────

/** Server-side count for `table` over an optional created_at range. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countRows(table: string, range?: DateRange, extra?: (q: any) => any): Promise<number> {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  if (range) q = q.gte('created_at', range.from).lt('created_at', range.to);
  if (extra) q = extra(q);
  const { count } = await q;
  return count ?? 0;
}

/** Server-side count for `table` over a range on an arbitrary timestamp column. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countByDateField(table: string, dateField: string, range: DateRange, extra?: (q: any) => any): Promise<number> {
  let q = supabase.from(table).select('*', { count: 'exact', head: true })
    .gte(dateField, range.from).lt(dateField, range.to);
  if (extra) q = extra(q);
  const { count } = await q;
  return count ?? 0;
}

/**
 * Bucket rows by a raw key (the value used for click-through filtering) while
 * carrying a display label for each key. `keyOf` returns null to skip a row.
 */
function bucketKeyed<T>(
  rows: T[],
  keyOf: (r: T) => { raw: string; label: string } | null,
): Map<string, { label: string; value: number }> {
  const m = new Map<string, { label: string; value: number }>();
  for (const r of rows) {
    const k = keyOf(r);
    if (k === null) continue;
    const cur = m.get(k.raw);
    if (cur) cur.value += 1;
    else m.set(k.raw, { label: k.label, value: 1 });
  }
  return m;
}

// A BPF stage/condition key (e.g. "stage_1780914561053") must never surface as a
// lifecycle Status / Status Reason. It leaks in when a process flow is
// misconfigured to write its stage into state_code/status_reason instead of
// bpf_stage. Such records are lifecycle-default (state '1'), so normalise any
// stray stage key to '1' — mirrors applyStatusLabels() in listService.ts.
const STAGE_KEY_RE = /^(stage|condition)_/i;

/** Resolve a raw state_code/status_reason to { raw filter value, display label }. */
function resolveStatus(
  value: string | null,
  map: Record<string, string>,
  fallback: string,
): { raw: string; label: string } {
  if (value == null || STAGE_KEY_RE.test(String(value))) {
    return { raw: '1', label: map['1'] ?? fallback };
  }
  const code = String(value);
  return { raw: code, label: map[code] ?? code };
}

function toData(m: Map<string, { label: string; value: number }>, limit = 8): Datum[] {
  return [...m.entries()]
    .map(([raw, { label, value }]) => ({ raw, label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// ── KPI row ──────────────────────────────────────────────────────────────────

export interface Kpis {
  totalProspects: number; totalProspectsPrev: number;
  conversionRate: number; conversionRatePrev: number;
  totalLeads: number; totalLeadsPrev: number;
  openOpps: number; openOppsPrev: number;
  winRate: number; winRatePrev: number;
  totalAccounts: number; totalAccountsPrev: number;
  pipelineValue: number | null; pipelineValuePrev: number | null;
}

/**
 * Prospect→Lead conversion rate for a period: prospects whose converted_at falls
 * in the range divided by prospects created in the range, as a percentage.
 */
async function prospectConversionRate(range: DateRange): Promise<number> {
  const [created, converted] = await Promise.all([
    countRows('crm_prospect', range),
    countByDateField('crm_prospect', 'converted_at', range),
  ]);
  return created ? (converted / created) * 100 : 0;
}

async function winRateFor(oppMaps: StatusMaps, range: DateRange): Promise<number> {
  const wonCode = oppMaps.stateByLabel['won'];
  const lostCode = oppMaps.stateByLabel['lost'];
  if (!wonCode || !lostCode) return 0;
  const [won, lost] = await Promise.all([
    countRows('opportunity', undefined, (q) => q.eq('state_code', wonCode).gte('actual_close_date', range.from).lt('actual_close_date', range.to)),
    countRows('opportunity', undefined, (q) => q.eq('state_code', lostCode).gte('actual_close_date', range.from).lt('actual_close_date', range.to)),
  ]);
  const total = won + lost;
  return total ? (won / total) * 100 : 0;
}

async function pipelineFor(oppMaps: StatusMaps, range: DateRange): Promise<number | null> {
  const openCode = oppMaps.stateByLabel['open'];
  if (!openCode) return null;
  // Sum needs the value column; fetch only estimated_value for open opps in the period.
  const { data, error } = await supabase
    .from('opportunity')
    .select('estimated_value')
    .eq('state_code', openCode)
    .gte('created_at', range.from).lt('created_at', range.to);
  if (error) return null;
  return (data ?? []).reduce((s, r) => s + (Number((r as { estimated_value: number | null }).estimated_value) || 0), 0);
}

export async function fetchKpis(current: DateRange, previous: DateRange): Promise<Kpis> {
  const oppMaps = await getStatusMaps('opportunity');
  const openCode = oppMaps?.stateByLabel['open'];

  const openCount = (range: DateRange) =>
    openCode ? countRows('opportunity', range, (q) => q.eq('state_code', openCode)) : Promise.resolve(0);

  const [
    totalProspects, totalProspectsPrev,
    conversionRate, conversionRatePrev,
    totalLeads, totalLeadsPrev,
    openOpps, openOppsPrev,
    winRate, winRatePrev,
    totalAccounts, totalAccountsPrev,
    pipelineValue, pipelineValuePrev,
  ] = await Promise.all([
    countRows('crm_prospect', current), countRows('crm_prospect', previous),
    prospectConversionRate(current), prospectConversionRate(previous),
    countRows('lead', current), countRows('lead', previous),
    openCount(current), openCount(previous),
    oppMaps ? winRateFor(oppMaps, current) : Promise.resolve(0),
    oppMaps ? winRateFor(oppMaps, previous) : Promise.resolve(0),
    countRows('account', current), countRows('account', previous),
    oppMaps ? pipelineFor(oppMaps, current) : Promise.resolve(null),
    oppMaps ? pipelineFor(oppMaps, previous) : Promise.resolve(null),
  ]);

  return {
    totalProspects, totalProspectsPrev,
    conversionRate, conversionRatePrev,
    totalLeads, totalLeadsPrev,
    openOpps, openOppsPrev,
    winRate, winRatePrev,
    totalAccounts, totalAccountsPrev,
    pipelineValue, pipelineValuePrev,
  };
}

// ── Leads section (one query powers status / source / product) ───────────────

interface LeadRow {
  state_code: string | null;
  status_reason: string | null;
  lead_source: string | null;
  product_id: string | null;
  is_qualified: boolean | null;
}

export interface LeadsBreakdown {
  byState: Datum[];
  byReason: Datum[];
  bySource: Datum[];   // with `secondary` = converted (qualified) count
  byProduct: Datum[];
  total: number;
}

const SOURCE_LABELS: Record<string, string> = {
  web: 'Website', referral: 'Referral', social_media: 'Social Media',
  email_campaign: 'Email Campaign', cold_call: 'Cold Call', trade_show: 'Trade Show',
  partner: 'Partner', other: 'Other',
};

export async function fetchLeadsBreakdown(range: DateRange): Promise<LeadsBreakdown> {
  const maps = await getStatusMaps('lead');
  const { data, error } = await supabase
    .from('lead')
    .select('state_code, status_reason, lead_source, product_id, is_qualified')
    .gte('created_at', range.from).lt('created_at', range.to);
  if (error || !data) return { byState: [], byReason: [], bySource: [], byProduct: [], total: 0 };
  const rows = data as LeadRow[];

  const byState = toData(bucketKeyed(rows, (r) =>
    resolveStatus(r.state_code, maps?.stateByCode ?? {}, 'Open')));
  const byReason = toData(bucketKeyed(rows, (r) =>
    resolveStatus(r.status_reason, maps?.reasonByCode ?? {}, 'New')));

  // Source with converted (qualified) secondary measure.
  const srcTotal = bucketKeyed(rows, (r) => {
    const raw = r.lead_source ?? 'other';
    return { raw, label: SOURCE_LABELS[raw] ?? raw };
  });
  const srcConv = bucketKeyed(rows.filter((r) => r.is_qualified === true), (r) => {
    const raw = r.lead_source ?? 'other';
    return { raw, label: raw };
  });
  const bySource: Datum[] = [...srcTotal.entries()]
    .map(([raw, { label, value }]) => ({ label, value, raw, secondary: srcConv.get(raw)?.value ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Product needs lookup resolution; raw = product_id for click-through.
  const prodIds = [...new Set(rows.map((r) => r.product_id).filter((x): x is string => !!x))];
  const prodLabels = prodIds.length ? await batchResolveLookupLabels('product', prodIds) : {};
  const byProduct = toData(bucketKeyed(rows, (r) =>
    r.product_id ? { raw: r.product_id, label: prodLabels[r.product_id] ?? r.product_id } : null));

  return { byState, byReason, bySource, byProduct, total: rows.length };
}

// ── Prospects section ────────────────────────────────────────────────────────

interface ProspectRow {
  state_code: string | null;
  status_reason: string | null;
  source: string | null;
  converted_lead_id: string | null;
}

export interface ProspectsBreakdown {
  byState: Datum[];
  byReason: Datum[];
  bySource: Datum[];   // with `secondary` = converted count per source
  total: number;
}

export async function fetchProspectsBreakdown(range: DateRange): Promise<ProspectsBreakdown> {
  const maps = await getStatusMaps('prospect');
  const { data, error } = await supabase
    .from('crm_prospect')
    .select('state_code, status_reason, source, converted_lead_id')
    .gte('created_at', range.from).lt('created_at', range.to);
  if (error || !data) return { byState: [], byReason: [], bySource: [], total: 0 };
  const rows = data as ProspectRow[];

  // raw stays the literal stored value so the drill-down filter matches the column.
  const byState = toData(bucketKeyed(rows, (r) =>
    resolveStatus(r.state_code, maps?.stateByCode ?? {}, 'Active')));
  const byReason = toData(bucketKeyed(rows, (r) =>
    resolveStatus(r.status_reason, maps?.reasonByCode ?? {}, 'New')));

  // Source with converted secondary measure (prospects that became leads).
  const srcTotal = bucketKeyed(rows, (r) => {
    const raw = r.source ?? 'other';
    return { raw, label: SOURCE_LABELS[raw] ?? raw };
  });
  const srcConv = bucketKeyed(rows.filter((r) => !!r.converted_lead_id), (r) => {
    const raw = r.source ?? 'other';
    return { raw, label: raw };
  });
  const bySource: Datum[] = [...srcTotal.entries()]
    .map(([raw, { label, value }]) => ({ label, value, raw, secondary: srcConv.get(raw)?.value ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return { byState, byReason, bySource, total: rows.length };
}

// ── Conversion funnel ────────────────────────────────────────────────────────
// Prospects → Converted to Leads → Qualified Leads → Opportunities → Won, for the
// selected period. Each stage counts on the timestamp that marks entry to that
// stage (created_at, except conversion = converted_at and Won = actual_close_date).

export interface FunnelData {
  stages: { key: string; label: string; value: number }[];
  /** Opportunity 'Won' state_value code — used by the Won stage drill-down. */
  wonStateCode: string | null;
}

export async function fetchFunnel(range: DateRange): Promise<FunnelData> {
  const oppMaps = await getStatusMaps('opportunity');
  const wonCode = oppMaps?.stateByLabel['won'];

  const [prospects, converted, qualified, opportunities, won] = await Promise.all([
    countRows('crm_prospect', range),
    countByDateField('crm_prospect', 'converted_at', range),
    countRows('lead', range, (q) => q.eq('is_qualified', true)),
    countRows('opportunity', range),
    wonCode
      ? countByDateField('opportunity', 'actual_close_date', range, (q) => q.eq('state_code', wonCode))
      : Promise.resolve(0),
  ]);

  return {
    stages: [
      { key: 'prospects',     label: 'Prospects',         value: prospects },
      { key: 'converted',     label: 'Converted to Leads', value: converted },
      { key: 'qualified',     label: 'Qualified Leads',    value: qualified },
      { key: 'opportunities', label: 'Opportunities',      value: opportunities },
      { key: 'won',           label: 'Won',                value: won },
    ],
    wonStateCode: wonCode ?? null,
  };
}

// ── Opportunities section ────────────────────────────────────────────────────

export interface OppStats {
  won: number; lost: number; open: number;
  wonValue: number | null; openPipeline: number | null;
  avgDaysToClose: number | null;
  /** state_value codes for drill-down filtering. */
  wonCode: string | null; lostCode: string | null; openCode: string | null;
}

interface OppRow {
  state_code: string | null;
  estimated_value: number | null;
  actual_value: number | null;
  created_at: string;
  actual_close_date: string | null;
}

export async function fetchOppStats(range: DateRange): Promise<OppStats> {
  const maps = await getStatusMaps('opportunity');
  if (!maps) return { won: 0, lost: 0, open: 0, wonValue: null, openPipeline: null, avgDaysToClose: null, wonCode: null, lostCode: null, openCode: null };
  const wonCode = maps.stateByLabel['won'];
  const lostCode = maps.stateByLabel['lost'];
  const openCode = maps.stateByLabel['open'];

  // Won/lost by close date in period; open by created in period.
  const { data: closed } = await supabase
    .from('opportunity')
    .select('state_code, estimated_value, actual_value, created_at, actual_close_date')
    .gte('actual_close_date', range.from).lt('actual_close_date', range.to);
  const { data: open } = await supabase
    .from('opportunity')
    .select('state_code, estimated_value, actual_value, created_at, actual_close_date')
    .eq('state_code', openCode ?? '___none')
    .gte('created_at', range.from).lt('created_at', range.to);

  const closedRows = (closed ?? []) as OppRow[];
  const openRows = (open ?? []) as OppRow[];
  const wonRows = closedRows.filter((r) => String(r.state_code) === wonCode);
  const lostRows = closedRows.filter((r) => String(r.state_code) === lostCode);

  const wonValue = wonRows.reduce((s, r) => s + (Number(r.actual_value ?? r.estimated_value) || 0), 0);
  const openPipeline = openRows.reduce((s, r) => s + (Number(r.estimated_value) || 0), 0);

  const dayDiffs = wonRows
    .filter((r) => r.actual_close_date && r.created_at)
    .map((r) => (new Date(r.actual_close_date as string).getTime() - new Date(r.created_at).getTime()) / 86400000)
    .filter((d) => d >= 0);
  const avgDaysToClose = dayDiffs.length ? Math.round(dayDiffs.reduce((s, d) => s + d, 0) / dayDiffs.length) : null;

  return {
    won: wonRows.length, lost: lostRows.length, open: openRows.length,
    wonValue, openPipeline, avgDaysToClose,
    wonCode: wonCode ?? null, lostCode: lostCode ?? null, openCode: openCode ?? null,
  };
}

export async function fetchWonTrend(): Promise<{ label: string; value: number }[]> {
  const maps = await getStatusMaps('opportunity');
  const wonCode = maps?.stateByLabel['won'];
  const months = lastMonths(6);
  if (!wonCode) return months.map((m) => ({ label: m.label, value: 0 }));
  const counts = await Promise.all(
    months.map((m) =>
      countRows('opportunity', undefined, (q) =>
        q.eq('state_code', wonCode).gte('actual_close_date', m.from).lt('actual_close_date', m.to)),
    ),
  );
  return months.map((m, i) => ({ label: m.label, value: counts[i] }));
}

// ── Accounts section ─────────────────────────────────────────────────────────

interface AccountRow {
  state_code: string | null;
  industry: string | null;
  industry_id: string | null;
  country_id: string | null;
}

export interface AccountBreakdown {
  byIndustry: Datum[];
  byCountry: Datum[];
  active: number;
  inactive: number;
  newThisPeriod: number;
  withOpenOpps: number;
  total: number;
}

export async function fetchAccountBreakdown(range: DateRange): Promise<AccountBreakdown> {
  const maps = await getStatusMaps('account');
  const activeCode = maps?.stateByLabel['active'];

  // Whole-table snapshot for distribution + active/inactive; period count separately.
  const { data, error } = await supabase
    .from('account')
    .select('state_code, industry, industry_id, country_id');
  if (error || !data) {
    return { byIndustry: [], byCountry: [], active: 0, inactive: 0, newThisPeriod: 0, withOpenOpps: 0, total: 0 };
  }
  const rows = data as AccountRow[];

  // Industry: prefer text column (raw = text, filter field 'industry'), else
  // resolve the FK (raw = uuid, filter field 'industry_id').
  const industryFkIds = [...new Set(rows.filter((r) => !r.industry && r.industry_id).map((r) => r.industry_id as string))];
  const industryLabels = industryFkIds.length ? await batchResolveLookupLabels('industry', industryFkIds) : {};
  const byIndustry = toData(bucketKeyed(rows, (r) => {
    if (r.industry) return { raw: r.industry, label: r.industry };
    if (r.industry_id) return { raw: r.industry_id, label: industryLabels[r.industry_id] ?? 'Other' };
    return { raw: '__none', label: 'Other' };
  }));

  // Country: resolve the FK; null → Unspecified (raw = country_id).
  const countryIds = [...new Set(rows.map((r) => r.country_id).filter((x): x is string => !!x))];
  const countryLabels = countryIds.length ? await batchResolveLookupLabels('country', countryIds) : {};
  const byCountry = toData(bucketKeyed(rows, (r) =>
    r.country_id ? { raw: r.country_id, label: countryLabels[r.country_id] ?? r.country_id } : { raw: '__none', label: 'Unspecified' }));

  let active = 0, inactive = 0;
  for (const r of rows) {
    if (activeCode != null && String(r.state_code) === activeCode) active++;
    else inactive++;
  }

  // New accounts in the period (server-side count) + accounts with an open opp.
  const oppMaps = await getStatusMaps('opportunity');
  const openCode = oppMaps?.stateByLabel['open'];
  const [newThisPeriod, withOpenOpps] = await Promise.all([
    countRows('account', range),
    openCode ? accountsWithOpenOpps(openCode) : Promise.resolve(0),
  ]);

  return { byIndustry, byCountry, active, inactive, newThisPeriod, withOpenOpps, total: rows.length };
}

async function accountsWithOpenOpps(openCode: string): Promise<number> {
  const { data } = await supabase.from('opportunity').select('account_id').eq('state_code', openCode);
  const ids = new Set((data ?? []).map((r) => (r as { account_id: string | null }).account_id).filter(Boolean));
  return ids.size;
}

/** Clear cached metadata (call on sign-out / theme of org change if needed). */
export function clearDashboardCache(): void {
  ctxCache.clear();
}
