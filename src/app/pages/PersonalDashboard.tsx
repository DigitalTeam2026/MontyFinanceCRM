// Sales analytics dashboard. KPI row, conversion funnel, and Prospects / Leads /
// Opportunities / Accounts sections. Every number is computed from real records
// through the authenticated session, so Row-Level Security scopes them to the
// current user's permissions. All colours come from theme tokens (src/index.css).
//
// Clicking any chart segment, legend row, bar, funnel stage, KPI, or tile opens
// an INLINE drill-down panel below that section (no navigation). The panel lists
// the matching records using the columns of the user's selected saved view.

import { useEffect, useState, useCallback } from 'react';
import { Users, Target, Award, Building2, DollarSign, UserPlus, Repeat } from 'lucide-react';
import type { AppEntity, AppModule } from '../types';
import {
  RANGE_OPTIONS, resolveRange, formatCount, formatPercent, formatMoney, formatMoneyCompact,
  deltaPercent, type RangeKey, type DateRange,
} from './dashboard/theme';
import { Donut, Legend, HBars, LineChart, Funnel, type Datum } from './dashboard/charts';
import { Card, KpiCard, CardSkeleton, EmptyState, SectionHeader } from './dashboard/widgets';
import {
  fetchKpis, fetchLeadsBreakdown, fetchOppStats, fetchWonTrend, fetchAccountBreakdown,
  fetchProspectsBreakdown, fetchFunnel,
  type Kpis, type LeadsBreakdown, type OppStats, type AccountBreakdown,
  type ProspectsBreakdown, type FunnelData,
} from './dashboard/data';
import DrilldownPanel from './dashboard/DrilldownPanel';
import type { DrilldownRequest } from './dashboard/drilldown';

// Minimal filter shape (structurally compatible with listService.ActiveFilter).
export interface DashFilter { id: string; field: string; label: string; operator: string; value: string }

interface PersonalDashboardProps {
  userId: string;
  /** "Open in list →" escape hatch: opens an entity list pre-filtered to the drill-down. */
  onNavigateFiltered?: (entity: AppEntity, module: AppModule, filters: DashFilter[], contextLabel: string) => void;
  /** Open a single record (drill-down row click / name link). Entity-aware so it
   *  switches to the record's entity, which may differ from the active one. */
  onOpenRecord?: (entity: AppEntity, id: string, label?: string) => void;
}

// ── Drill-down identity + nav conversion ─────────────────────────────────────

/** Stable signature for a drill request (drives toggle + remount). */
function drillSig(req: DrilldownRequest): string {
  const cons = (req.constraints ?? []).map((c) => `${c.field}=${c.value}`).join('&');
  return `${req.entity}|${req.dateField}|${req.primary?.field ?? ''}=${req.primary?.value ?? ''}|${cons}`;
}

/** Convert a drill request into list-page filters for "Open in <Entity> list →". */
function reqToNavFilters(req: DrilldownRequest, primaryActive: boolean): DashFilter[] {
  const fromStr = req.dateRange.from.slice(0, 10);
  const toDate = new Date(req.dateRange.to);
  toDate.setUTCDate(toDate.getUTCDate() - 1); // range.to is exclusive — step back for on_or_before
  const toStr = toDate.toISOString().slice(0, 10);
  const filters: DashFilter[] = [
    { id: 'dash_from', field: req.dateField, label: 'On or after', operator: 'on_or_after', value: fromStr },
    { id: 'dash_to', field: req.dateField, label: 'On or before', operator: 'on_or_before', value: toStr },
  ];
  for (const c of req.constraints ?? []) {
    filters.push({ id: c.id, field: c.field, label: c.label, operator: c.operator, value: c.value });
  }
  if (primaryActive && req.primary && !req.primary.field.startsWith('__')) {
    filters.unshift({ id: req.primary.id, field: req.primary.field, label: req.primary.label, operator: req.primary.operator, value: req.primary.value });
  }
  return filters;
}

// ── Small async hook: each card loads independently with its own loading flag ──

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setData(null); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading };
}

const GRID = (min: number): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
  gap: 16,
});

// Shared bundle of drill-down handlers passed to each section.
interface DrillCtx {
  open: (req: DrilldownRequest) => void;
  drills: Record<string, DrilldownRequest>;
  close: (sectionId: string) => void;
  userId: string;
  onOpenInList: (req: DrilldownRequest, primaryActive: boolean) => void;
  openRecord?: (entity: AppEntity, id: string, label?: string) => void;
}

export default function PersonalDashboard({ userId, onNavigateFiltered, onOpenRecord }: PersonalDashboardProps) {
  const [rangeKey, setRangeKey] = useState<RangeKey>('month');
  const range = resolveRange(rangeKey);
  const { current, previous } = range;

  // One drill-down open per section, keyed by sectionId.
  const [drills, setDrills] = useState<Record<string, DrilldownRequest>>({});

  // Changing the date range invalidates open drill-downs (their range is stale).
  useEffect(() => { setDrills({}); }, [current.from, current.to]);

  const openDrill = useCallback((req: DrilldownRequest) => {
    setDrills((prev) => {
      const cur = prev[req.sectionId];
      if (cur && drillSig(cur) === drillSig(req)) {
        const next = { ...prev }; delete next[req.sectionId]; return next;
      }
      return { ...prev, [req.sectionId]: req };
    });
  }, []);

  const closeDrill = useCallback((sectionId: string) => {
    setDrills((prev) => { const next = { ...prev }; delete next[sectionId]; return next; });
  }, []);

  const onOpenInList = useCallback((req: DrilldownRequest, primaryActive: boolean) => {
    onNavigateFiltered?.(req.entity, 'sales', reqToNavFilters(req, primaryActive), req.contextLabel);
  }, [onNavigateFiltered]);

  const drillCtx: DrillCtx = { open: openDrill, drills, close: closeDrill, userId, onOpenInList, openRecord: onOpenRecord };

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--app-bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header + date-range filter */}
      <div style={{
        padding: '20px 32px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Sales Dashboard</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0 0' }}>
            Track your sales pipeline and key metrics at a glance
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
          {RANGE_OPTIONS.map((opt) => {
            const active = rangeKey === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setRangeKey(opt.key)}
                style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: active ? 'var(--primary)' : 'transparent',
                  color: active ? 'var(--primary-text)' : 'var(--muted)',
                  transition: 'all .15s ease',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
        <div style={{ maxWidth: 1600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
          <KpiRow current={current} previous={previous} ctx={drillCtx} />
          <FunnelSection range={current} ctx={drillCtx} />
          <ProspectsSection range={current} ctx={drillCtx} />
          <LeadsSection range={current} ctx={drillCtx} />
          <OppSection range={current} ctx={drillCtx} />
          <AccountsSection range={current} ctx={drillCtx} />
        </div>
      </div>

      <style>{`
        @keyframes dash-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>
    </div>
  );
}

// Renders the inline drill-down panel for a section, if one is open.
function SectionPanel({ sectionId, ctx }: { sectionId: string; ctx: DrillCtx }) {
  const req = ctx.drills[sectionId];
  if (!req) return null;
  return (
    <DrilldownPanel
      key={drillSig(req)}
      req={req}
      userId={ctx.userId}
      onClose={() => ctx.close(sectionId)}
      onOpenInList={ctx.onOpenInList}
      onOpenRecord={ctx.openRecord ? (id, label) => ctx.openRecord!(req.entity, id, label) : undefined}
    />
  );
}

/** Selected key for a card: the open drill's primary value when it targets this field. */
function selectedFor(ctx: DrillCtx, sectionId: string, field: string): string | null {
  const req = ctx.drills[sectionId];
  if (req?.primary && req.primary.field === field) return req.primary.value;
  return null;
}

// ── KPI row ──────────────────────────────────────────────────────────────────

const KPI_SECTION = 'kpi';

function KpiRow({ current, previous, ctx }: { current: DateRange; previous: DateRange; ctx: DrillCtx }) {
  const { data, loading } = useAsync<Kpis>(() => fetchKpis(current, previous), [current.from, current.to]);
  const k = data;

  const totalReq = (entity: AppEntity, label: string): DrilldownRequest => ({
    sectionId: KPI_SECTION, entity, entityLabel: label, dateField: 'created_at', dateRange: current, contextLabel: label,
  });

  return (
    <div>
      <div style={GRID(190)}>
        <KpiCard label="Total Prospects" icon={<UserPlus size={18} />} loading={loading}
          value={k ? formatCount(k.totalProspects) : '—'}
          delta={k ? deltaPercent(k.totalProspects, k.totalProspectsPrev) : null}
          onClick={() => ctx.open(totalReq('prospect', 'Prospects'))} />
        <KpiCard label="Prospect → Lead Conversion" icon={<Repeat size={18} />} loading={loading}
          value={k ? formatPercent(k.conversionRate) : '—'}
          delta={k ? deltaPercent(k.conversionRate, k.conversionRatePrev) : null}
          onClick={() => ctx.open({
            sectionId: KPI_SECTION, entity: 'prospect', entityLabel: 'Prospects',
            dateField: 'converted_at', dateRange: current,
            constraints: [{ id: 'converted', label: 'Converted', field: 'converted_lead_id', operator: 'is_not_empty', value: '', kind: 'constraint' }],
            contextLabel: 'Converted Prospects',
          })} />
        <KpiCard label="Total Leads" icon={<Users size={18} />} loading={loading}
          value={k ? formatCount(k.totalLeads) : '—'}
          delta={k ? deltaPercent(k.totalLeads, k.totalLeadsPrev) : null}
          onClick={() => ctx.open(totalReq('leads', 'Leads'))} />
        <KpiCard label="Open Opportunities" icon={<Target size={18} />} loading={loading}
          value={k ? formatCount(k.openOpps) : '—'}
          delta={k ? deltaPercent(k.openOpps, k.openOppsPrev) : null} />
        <KpiCard label="Win Rate" icon={<Award size={18} />} loading={loading}
          value={k ? formatPercent(k.winRate) : '—'}
          delta={k ? deltaPercent(k.winRate, k.winRatePrev) : null} />
        <KpiCard label="Total Accounts" icon={<Building2 size={18} />} loading={loading}
          value={k ? formatCount(k.totalAccounts) : '—'}
          delta={k ? deltaPercent(k.totalAccounts, k.totalAccountsPrev) : null}
          onClick={() => ctx.open(totalReq('accounts', 'Accounts'))} />
        {k && k.pipelineValue !== null && (
          <KpiCard label="Pipeline Value" icon={<DollarSign size={18} />} loading={loading}
            value={formatMoneyCompact(k.pipelineValue)}
            delta={k.pipelineValuePrev !== null ? deltaPercent(k.pipelineValue, k.pipelineValuePrev) : null} />
        )}
      </div>
      <SectionPanel sectionId={KPI_SECTION} ctx={ctx} />
    </div>
  );
}

// ── Conversion funnel ────────────────────────────────────────────────────────

const FUNNEL_SECTION = 'funnel';

function FunnelSection({ range, ctx }: { range: DateRange; ctx: DrillCtx }) {
  const { data, loading } = useAsync<FunnelData>(() => fetchFunnel(range), [range.from, range.to]);

  // Each funnel stage drills into a different entity / date column / constraint.
  const stageRequest = (stageKey: string, label: string): DrilldownRequest | null => {
    const base = { sectionId: FUNNEL_SECTION, dateRange: range, contextLabel: `Funnel · ${label}`, primary: { id: 'stage', label, field: '__stage', operator: 'eq' as const, value: stageKey, kind: 'primary' as const } };
    switch (stageKey) {
      case 'prospects':
        return { ...base, entity: 'prospect', entityLabel: 'Prospects', dateField: 'created_at' };
      case 'converted':
        return {
          ...base, entity: 'prospect', entityLabel: 'Prospects', dateField: 'converted_at',
          constraints: [{ id: 'converted', label: 'Converted', field: 'converted_lead_id', operator: 'is_not_empty', value: '', kind: 'constraint' }],
        };
      case 'qualified':
        return {
          ...base, entity: 'leads', entityLabel: 'Leads', dateField: 'created_at',
          constraints: [{ id: 'qualified', label: 'Qualified', field: 'is_qualified', operator: 'eq', value: 'true', kind: 'constraint' }],
        };
      case 'opportunities':
        return { ...base, entity: 'opportunities', entityLabel: 'Opportunities', dateField: 'created_at' };
      case 'won':
        return data?.wonStateCode
          ? {
              ...base, entity: 'opportunities', entityLabel: 'Opportunities', dateField: 'actual_close_date',
              constraints: [{ id: 'won', label: 'Won', field: 'state_code', operator: 'eq', value: data.wonStateCode, kind: 'constraint' }],
            }
          : null;
      default:
        return null;
    }
  };

  const selectedKey = ctx.drills[FUNNEL_SECTION]?.primary?.value ?? null;

  return (
    <section>
      <SectionHeader title="Conversion Funnel" badge={data ? `${formatCount(data.stages[0]?.value ?? 0)} prospects` : undefined} />
      <Card title="Prospect → Lead → Qualified → Opportunity → Won" subtitle="For the selected period">
        {loading ? <CardSkeleton rows={3} /> : !data ? <EmptyState message="No funnel data for this period" /> : (
          <Funnel
            stages={data.stages.map((s) => ({ label: s.label, value: s.value, raw: s.key }))}
            selectedKey={selectedKey}
            onStageClick={(s) => {
              const req = stageRequest(s.raw ?? '', s.label);
              if (req) ctx.open(req);
            }}
          />
        )}
      </Card>
      <SectionPanel sectionId={FUNNEL_SECTION} ctx={ctx} />
    </section>
  );
}

// ── Prospects section ────────────────────────────────────────────────────────

const PROSPECTS_SECTION = 'prospects';

function ProspectsSection({ range, ctx }: { range: DateRange; ctx: DrillCtx }) {
  const { data, loading } = useAsync<ProspectsBreakdown>(() => fetchProspectsBreakdown(range), [range.from, range.to]);
  const [dim, setDim] = useState<'state' | 'reason'>('state');
  const statusData = dim === 'state' ? data?.byState : data?.byReason;
  const statusField = dim === 'state' ? 'state_code' : 'status_reason';

  const dimDrill = (field: string, dimLabel: string, d: Datum) => ctx.open({
    sectionId: PROSPECTS_SECTION, entity: 'prospect', entityLabel: 'Prospects', dateField: 'created_at', dateRange: range,
    primary: { id: 'dim', label: `${dimLabel}: ${d.label}`, field, operator: 'eq', value: d.raw ?? d.label, kind: 'primary' },
    contextLabel: `Prospects · ${d.label}`,
  });

  return (
    <section>
      <SectionHeader title="Prospects" badge={data ? `${formatCount(data.total)} total` : undefined} />
      <div style={GRID(300)}>
        <Card title="By Status" subtitle="Current prospect pipeline" action={
          <Toggle value={dim} onChange={setDim} options={[{ k: 'state', label: 'Status' }, { k: 'reason', label: 'Reason' }]} />
        }>
          {loading ? <CardSkeleton /> : !statusData || statusData.length === 0 ? (
            <EmptyState message="No prospects in this period" />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <Donut data={statusData} centerValue={formatCount(statusData.reduce((s, d) => s + d.value, 0))} centerLabel="prospects"
                selectedKey={selectedFor(ctx, PROSPECTS_SECTION, statusField)}
                onSliceClick={(d) => dimDrill(statusField, 'Status', d)} />
              <Legend data={statusData} selectedKey={selectedFor(ctx, PROSPECTS_SECTION, statusField)}
                onItemClick={(d) => dimDrill(statusField, 'Status', d)} />
            </div>
          )}
        </Card>

        <Card title="By Source" subtitle="Where prospects come from">
          {loading ? <CardSkeleton /> : !data || data.bySource.length === 0 ? (
            <EmptyState message="No prospects in this period" />
          ) : (
            <HBars data={data.bySource} secondaryLabel="Converted to lead"
              selectedKey={selectedFor(ctx, PROSPECTS_SECTION, 'source')}
              onBarClick={(d) => dimDrill('source', 'Source', d)} />
          )}
        </Card>
      </div>
      <SectionPanel sectionId={PROSPECTS_SECTION} ctx={ctx} />
    </section>
  );
}

// ── Leads section ────────────────────────────────────────────────────────────

const LEADS_SECTION = 'leads';

function LeadsSection({ range, ctx }: { range: DateRange; ctx: DrillCtx }) {
  const { data, loading } = useAsync<LeadsBreakdown>(() => fetchLeadsBreakdown(range), [range.from, range.to]);
  const [dim, setDim] = useState<'state' | 'reason'>('reason');
  const statusData = dim === 'state' ? data?.byState : data?.byReason;
  const statusField = dim === 'state' ? 'state_code' : 'status_reason';

  const dimDrill = (field: string, dimLabel: string, d: Datum) => ctx.open({
    sectionId: LEADS_SECTION, entity: 'leads', entityLabel: 'Leads', dateField: 'created_at', dateRange: range,
    primary: { id: 'dim', label: `${dimLabel}: ${d.label}`, field, operator: 'eq', value: d.raw ?? d.label, kind: 'primary' },
    contextLabel: `Leads · ${d.label}`,
  });

  return (
    <section>
      <SectionHeader title="Leads" badge={data ? `${formatCount(data.total)} total` : undefined} />
      <div style={GRID(300)}>
        <Card title="By Status" subtitle="Current lead pipeline" action={
          <Toggle value={dim} onChange={setDim} options={[{ k: 'state', label: 'Status' }, { k: 'reason', label: 'Reason' }]} />
        }>
          {loading ? <CardSkeleton /> : !statusData || statusData.length === 0 ? (
            <EmptyState message="No leads in this period" />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <Donut data={statusData} centerValue={formatCount(statusData.reduce((s, d) => s + d.value, 0))} centerLabel="leads"
                selectedKey={selectedFor(ctx, LEADS_SECTION, statusField)}
                onSliceClick={(d) => dimDrill(statusField, 'Status', d)} />
              <Legend data={statusData} selectedKey={selectedFor(ctx, LEADS_SECTION, statusField)}
                onItemClick={(d) => dimDrill(statusField, 'Status', d)} />
            </div>
          )}
        </Card>

        <Card title="By Source" subtitle="Where leads come from">
          {loading ? <CardSkeleton /> : !data || data.bySource.length === 0 ? (
            <EmptyState message="No leads in this period" />
          ) : (
            <HBars data={data.bySource} secondaryLabel="Converted to opportunity"
              selectedKey={selectedFor(ctx, LEADS_SECTION, 'lead_source')}
              onBarClick={(d) => dimDrill('lead_source', 'Source', d)} />
          )}
        </Card>

        <Card title="By Product" subtitle="Interest per product">
          {loading ? <CardSkeleton /> : !data || data.byProduct.length === 0 ? (
            <EmptyState message="No product interest in this period" />
          ) : (
            <HBars data={data.byProduct}
              selectedKey={selectedFor(ctx, LEADS_SECTION, 'product_id')}
              onBarClick={(d) => dimDrill('product_id', 'Product', d)} />
          )}
        </Card>
      </div>
      <SectionPanel sectionId={LEADS_SECTION} ctx={ctx} />
    </section>
  );
}

// ── Opportunities section ────────────────────────────────────────────────────

const OPP_SECTION = 'opportunities';

function OppSection({ range, ctx }: { range: DateRange; ctx: DrillCtx }) {
  const stats = useAsync<OppStats>(() => fetchOppStats(range), [range.from, range.to]);
  const trend = useAsync<{ label: string; value: number }[]>(() => fetchWonTrend(), []);
  const s = stats.data;
  const totalDeals = s ? s.won + s.lost + s.open : 0;

  const tileDrill = (label: string, code: string | null, dateField: string) => {
    if (!code) return;
    ctx.open({
      sectionId: OPP_SECTION, entity: 'opportunities', entityLabel: 'Opportunities', dateField, dateRange: range,
      primary: { id: 'dim', label: `Status: ${label}`, field: 'state_code', operator: 'eq', value: code, kind: 'primary' },
      contextLabel: `Opportunities · ${label}`,
    });
  };

  const sel = selectedFor(ctx, OPP_SECTION, 'state_code');

  return (
    <section>
      <SectionHeader title="Opportunities" badge={s ? `${formatCount(totalDeals)} this period` : undefined} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.2fr) minmax(320px, 1fr)', gap: 16 }}>
        <Card title="Won vs Lost vs Open" subtitle="For the selected period">
          {stats.loading ? <CardSkeleton rows={3} /> : !s ? <EmptyState message="No opportunities in this period" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <Tile label="Won" value={formatCount(s.won)} tone="var(--success)"
                  dim={sel != null && sel !== s.wonCode}
                  onClick={() => tileDrill('Won', s.wonCode, 'actual_close_date')} />
                <Tile label="Lost" value={formatCount(s.lost)} tone="var(--danger)"
                  dim={sel != null && sel !== s.lostCode}
                  onClick={() => tileDrill('Lost', s.lostCode, 'actual_close_date')} />
                <Tile label="Open" value={formatCount(s.open)} tone="var(--link)"
                  dim={sel != null && sel !== s.openCode}
                  onClick={() => tileDrill('Open', s.openCode, 'created_at')} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <Stat label="Won value" value={s.wonValue !== null ? formatMoney(s.wonValue) : '—'} />
                <Stat label="Open pipeline" value={s.openPipeline !== null ? formatMoney(s.openPipeline) : '—'} />
                <Stat label="Avg. days to close" value={s.avgDaysToClose !== null ? `${s.avgDaysToClose} days` : '—'} />
              </div>
            </div>
          )}
        </Card>

        <Card title="Monthly Trend" subtitle="Won opportunities, last 6 months">
          {trend.loading ? <CardSkeleton rows={3} /> : !trend.data || trend.data.every((p) => p.value === 0) ? (
            <EmptyState message="No won opportunities yet" />
          ) : (
            <LineChart points={trend.data} />
          )}
        </Card>
      </div>
      <SectionPanel sectionId={OPP_SECTION} ctx={ctx} />
    </section>
  );
}

// ── Accounts section ─────────────────────────────────────────────────────────

const ACCOUNTS_SECTION = 'accounts';

function AccountsSection({ range, ctx }: { range: DateRange; ctx: DrillCtx }) {
  const { data, loading } = useAsync<AccountBreakdown>(() => fetchAccountBreakdown(range), [range.from, range.to]);

  const healthDonut: Datum[] = data
    ? [
        { label: 'Active', value: data.active, color: 'var(--success)', raw: 'active' },
        { label: 'Inactive', value: data.inactive, color: 'var(--muted)', raw: 'inactive' },
      ]
    : [];
  const activePct = data && data.total > 0 ? Math.round((data.active / data.total) * 100) : 0;

  const dimDrill = (field: string, dimLabel: string, d: Datum) => ctx.open({
    sectionId: ACCOUNTS_SECTION, entity: 'accounts', entityLabel: 'Accounts', dateField: 'created_at', dateRange: range,
    primary: { id: 'dim', label: `${dimLabel}: ${d.label}`, field, operator: 'eq', value: d.raw ?? d.label, kind: 'primary' },
    contextLabel: `Accounts · ${d.label}`,
  });

  return (
    <section>
      <SectionHeader title="Accounts" badge={data ? `${formatCount(data.total)} total` : undefined} />
      <div style={GRID(300)}>
        <Card title="By Industry" subtitle="Account distribution">
          {loading ? <CardSkeleton /> : !data || data.byIndustry.length === 0 ? (
            <EmptyState message="No accounts to show" />
          ) : (
            <HBars data={data.byIndustry}
              selectedKey={selectedFor(ctx, ACCOUNTS_SECTION, 'industry')}
              onBarClick={(d) => dimDrill('industry', 'Industry', d)} />
          )}
        </Card>

        <Card title="By Country" subtitle="Geographic spread">
          {loading ? <CardSkeleton /> : !data || data.byCountry.length === 0 ? (
            <EmptyState message="No accounts to show" />
          ) : (
            <HBars data={data.byCountry}
              selectedKey={selectedFor(ctx, ACCOUNTS_SECTION, 'country_id')}
              onBarClick={(d) => dimDrill('country_id', 'Country', d)} />
          )}
        </Card>

        <Card title="Health & Growth" subtitle="Status and recency">
          {loading ? <CardSkeleton /> : !data || data.total === 0 ? (
            <EmptyState message="No accounts to show" />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              {/* Active/Inactive is a synthetic split (inactive spans multiple state
                  codes), so this donut is not a single-value drill target. */}
              <Donut data={healthDonut} centerValue={`${activePct}%`} centerLabel="active" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 0 }}>
                <Legend data={healthDonut} />
                <div style={{ height: 1, background: 'var(--border)' }} />
                <MiniStat dotColor="var(--link)" label="New this period" value={formatCount(data.newThisPeriod)} />
                <MiniStat dotColor="var(--warn-text)" label="With open opps" value={formatCount(data.withOpenOpps)} />
              </div>
            </div>
          )}
        </Card>
      </div>
      <SectionPanel sectionId={ACCOUNTS_SECTION} ctx={ctx} />
    </section>
  );
}

// ── Small presentational helpers ─────────────────────────────────────────────

function Toggle<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { k: T; label: string }[];
}) {
  return (
    <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', padding: 2, borderRadius: 6, border: '1px solid var(--border)' }}>
      {options.map((o) => {
        const active = value === o.k;
        return (
          <button key={o.k} onClick={() => onChange(o.k)} style={{
            padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: active ? 'var(--surface)' : 'transparent',
            color: active ? 'var(--text)' : 'var(--muted)',
            boxShadow: active ? 'var(--shadow)' : 'none',
          }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Tile({ label, value, tone, onClick, dim }: { label: string; value: string; tone: string; onClick?: () => void; dim?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        borderRadius: 8, padding: '14px 12px', textAlign: 'center', width: '100%',
        background: `color-mix(in srgb, ${tone} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${tone} 35%, transparent)`,
        cursor: onClick ? 'pointer' : 'default',
        opacity: dim ? 0.3 : 1, transition: 'opacity .15s ease',
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 700, color: tone }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: 8, padding: '12px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function MiniStat({ dotColor, label, value }: { dotColor: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{value}</span>
    </div>
  );
}
