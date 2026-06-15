// Widget catalog for the customizable Admin Dashboard.
//
// Two kinds of widgets live here:
//  1. Curated presets — fixed cards reusing the user-dashboard fetchers (KPI
//     bundle, funnel, opportunity breakdown/trend, accounts health). Not editable.
//  2. Configurable widgets — generic "Custom KPI" and "Custom Chart" cards driven
//     by a per-instance WidgetConfig (entity + measure/dimension + status filter).
//     These are what let an admin repoint a card at a different source/condition,
//     e.g. Opportunities where status = Lost.
//
// Every widget reuses the SAME presentational primitives as the per-user Sales
// Dashboard, so the cards look identical; only scope (RLS → all records) differs.

import type { ReactNode, JSX } from 'react';
import {
  Users, Target, Award, Building2, DollarSign, UserPlus, Repeat, Contact, Package, Settings,
} from 'lucide-react';
import { Card, KpiCard, CardSkeleton, EmptyState } from '../../app/pages/dashboard/widgets';
import { Donut, Legend, HBars, LineChart, Funnel, type Datum } from '../../app/pages/dashboard/charts';
import {
  formatCount, formatPercent, formatMoney, formatMoneyCompact, deltaPercent, type DateRange,
} from '../../app/pages/dashboard/theme';
import type { DrilldownRequest, DrillChip } from '../../app/pages/dashboard/drilldown';
import type { AppEntity } from '../../app/types';
import {
  fetchKpis, fetchOppStats, fetchWonTrend, fetchAccountBreakdown, fetchFunnel, type Kpis,
} from '../../app/pages/dashboard/data';
import { useRangedData, fetchContactsKpi, fetchProductsBreakdown, FULL_RANGE } from './adminData';
import {
  META_BY_ENTITY, configKey, type WidgetConfig, type KpiConfig, type StatusFilter,
} from './entityMeta';
import { fetchGroupedGeneric, fetchMeasureGeneric, type MeasurePair } from './genericData';

// ── Shared widget context + definitions ──────────────────────────────────────

export interface WidgetCtx {
  /** This widget INSTANCE id — used as the drill-down sectionId (unique per card). */
  wid: string;
  current: DateRange;
  previous: DateRange;
  drill: (req: DrilldownRequest) => void;
  /** The active drill-down request iff it belongs to THIS instance (selection highlight). */
  activeReq: DrilldownRequest | null;
  /** Per-instance configuration (only set for configurable widgets). */
  config?: WidgetConfig;
}

export type WidgetType = 'kpi' | 'chart';

export interface WidgetDef {
  id: string;
  group: string;
  title: string;
  type: WidgetType;
  span: number;
  /** Editable via the config panel (gear icon). */
  configurable?: boolean;
  /** Added from the palette's "Build your own" section; multiple instances allowed. */
  custom?: boolean;
  Comp: (ctx: WidgetCtx) => JSX.Element;
}

/** One placed widget. `def` → registry id, `i` → unique instance id, `cfg` → config. */
export interface LayoutItem {
  i: string;
  def: string;
  cfg?: WidgetConfig;
}

// ── Drill-down helpers ────────────────────────────────────────────────────────

interface DimDrillOpts {
  entity: AppEntity;
  entityLabel: string;
  dateField: string;
  dateRange: DateRange;
  field: string;
  dimLabel: string;
  contextPrefix: string;
  /** Fixed extra filters (e.g. the widget's status condition). */
  constraints?: DrillChip[];
}

function dimDrill(ctx: WidgetCtx, opts: DimDrillOpts, d: Datum): void {
  ctx.drill({
    sectionId: ctx.wid,
    entity: opts.entity,
    entityLabel: opts.entityLabel,
    dateField: opts.dateField,
    dateRange: opts.dateRange,
    primary: { id: 'dim', label: `${opts.dimLabel}: ${d.label}`, field: opts.field, operator: 'eq', value: d.raw ?? d.label, kind: 'primary' },
    constraints: opts.constraints,
    contextLabel: `${opts.contextPrefix} · ${d.label}`,
  });
}

function selKey(ctx: WidgetCtx, field: string): string | null {
  const r = ctx.activeReq;
  return r?.primary && r.primary.field === field ? r.primary.value : null;
}

function statusChip(status: StatusFilter): DrillChip {
  return { id: 'status', label: status.label, field: status.field, operator: 'eq', value: status.value, kind: 'constraint' };
}

const sum = (data: Datum[]) => data.reduce((s, d) => s + d.value, 0);

const ENTITY_ICON: Record<string, ReactNode> = {
  leads: <Users size={18} />, opportunities: <Target size={18} />, accounts: <Building2 size={18} />,
  contacts: <Contact size={18} />, prospect: <UserPlus size={18} />, product: <Package size={18} />,
};

// ── Generic chart shells (Donut + Legend, HBars) ─────────────────────────────

function DonutChart({ ctx, title, subtitle, centerLabel, data, loading, drillOpts }: {
  ctx: WidgetCtx; title: string; subtitle: string; centerLabel: string;
  data: Datum[] | null | undefined; loading: boolean; drillOpts?: DimDrillOpts;
}) {
  const field = drillOpts?.field ?? '';
  return (
    <Card title={title} subtitle={subtitle}>
      {loading ? <CardSkeleton /> : !data || data.length === 0 ? (
        <EmptyState message="No data for this period" />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Donut data={data} centerValue={formatCount(sum(data))} centerLabel={centerLabel}
            selectedKey={drillOpts ? selKey(ctx, field) : null}
            onSliceClick={drillOpts ? (d) => dimDrill(ctx, drillOpts, d) : undefined} />
          <Legend data={data} selectedKey={drillOpts ? selKey(ctx, field) : null}
            onItemClick={drillOpts ? (d) => dimDrill(ctx, drillOpts, d) : undefined} />
        </div>
      )}
    </Card>
  );
}

function BarsChart({ ctx, title, subtitle, data, loading, drillOpts, emptyMessage }: {
  ctx: WidgetCtx; title: string; subtitle: string; data: Datum[] | null | undefined; loading: boolean;
  drillOpts?: DimDrillOpts; emptyMessage?: string;
}) {
  const field = drillOpts?.field ?? '';
  return (
    <Card title={title} subtitle={subtitle}>
      {loading ? <CardSkeleton /> : !data || data.length === 0 ? (
        <EmptyState message={emptyMessage ?? 'No data for this period'} />
      ) : (
        <HBars data={data}
          selectedKey={drillOpts ? selKey(ctx, field) : null}
          onBarClick={drillOpts ? (d) => dimDrill(ctx, drillOpts, d) : undefined} />
      )}
    </Card>
  );
}

// ── Configurable widgets ──────────────────────────────────────────────────────

function ConfigPlaceholder({ what }: { what: string }) {
  return (
    <Card title={`Custom ${what}`} subtitle="Not configured yet">
      <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--muted)' }}>
        <Settings size={22} style={{ opacity: 0.6 }} />
        <p style={{ fontSize: 12, margin: '10px 0 0' }}>Enter <b style={{ color: 'var(--text)' }}>Customize</b> mode and click the gear to choose a source and condition.</p>
      </div>
    </Card>
  );
}

function kpiDrill(ctx: WidgetCtx, cfg: KpiConfig): DrilldownRequest {
  const meta = META_BY_ENTITY[cfg.entity];
  return {
    sectionId: ctx.wid, entity: meta.entity, entityLabel: meta.label,
    dateField: meta.dateField, dateRange: meta.catalog ? FULL_RANGE : ctx.current,
    constraints: cfg.status ? [statusChip(cfg.status)] : undefined,
    contextLabel: cfg.label,
  };
}

function CustomKpi({ ctx }: { ctx: WidgetCtx }) {
  const cfg = ctx.config && ctx.config.kind === 'kpi' ? ctx.config : null;
  const meta = cfg ? META_BY_ENTITY[cfg.entity] : undefined;
  const { data, loading } = useRangedData<MeasurePair>(
    `cfg:${cfg ? configKey(cfg) : 'none'}`,
    (c, p) => (cfg && meta ? fetchMeasureGeneric(meta, cfg.measure, cfg.field, cfg.status, c, p) : Promise.resolve({ cur: 0, prev: 0 })),
    ctx.current, ctx.previous,
  );
  if (!cfg || !meta) return <ConfigPlaceholder what="KPI" />;
  const isMoney = cfg.measure === 'sum';
  const value = data ? (isMoney ? formatMoneyCompact(data.cur) : formatCount(data.cur)) : '—';
  const delta = data && !meta.catalog ? deltaPercent(data.cur, data.prev) : null;
  return (
    <KpiCard label={cfg.label} icon={ENTITY_ICON[cfg.entity]} loading={loading} value={value} delta={delta}
      onClick={() => ctx.drill(kpiDrill(ctx, cfg))} />
  );
}

function CustomChart({ ctx }: { ctx: WidgetCtx }) {
  const cfg = ctx.config && ctx.config.kind === 'chart' ? ctx.config : null;
  const meta = cfg ? META_BY_ENTITY[cfg.entity] : undefined;
  const dim = cfg && meta ? (meta.dimensions.find((d) => d.key === cfg.dimension) ?? meta.dimensions[0]) : undefined;
  const range = meta?.catalog ? FULL_RANGE : ctx.current;
  const { data, loading } = useRangedData<Datum[]>(
    `cfg:${cfg ? configKey(cfg) : 'none'}`,
    () => (cfg && meta && dim ? fetchGroupedGeneric(meta, dim, cfg.status, range) : Promise.resolve([])),
    ctx.current, ctx.previous,
  );
  if (!cfg || !meta || !dim) return <ConfigPlaceholder what="chart" />;
  const subtitle = `By ${dim.label}${cfg.status ? ` · ${cfg.status.label}` : ''}`;
  const drillOpts: DimDrillOpts = {
    entity: meta.entity, entityLabel: meta.label, dateField: meta.dateField, dateRange: range,
    field: dim.key, dimLabel: dim.label, contextPrefix: meta.label,
    constraints: cfg.status ? [statusChip(cfg.status)] : undefined,
  };
  return cfg.chartType === 'donut'
    ? <DonutChart ctx={ctx} title={cfg.title} subtitle={subtitle} centerLabel={meta.label.toLowerCase()} data={data} loading={loading} drillOpts={drillOpts} />
    : <BarsChart ctx={ctx} title={cfg.title} subtitle={subtitle} data={data} loading={loading} drillOpts={drillOpts} />;
}

// ── KPI bundle widgets (special metrics: win rate, conversion, pipeline) ──────

function useKpis(ctx: WidgetCtx) {
  return useRangedData<Kpis>('kpis', (c, p) => fetchKpis(c, p), ctx.current, ctx.previous);
}

interface BundleKpiSpec {
  label: string;
  icon: ReactNode;
  value: (k: Kpis) => string;
  delta: (k: Kpis) => number | null;
  drill?: (ctx: WidgetCtx) => DrilldownRequest | null;
}

function BundleKpi({ ctx, spec }: { ctx: WidgetCtx; spec: BundleKpiSpec }) {
  const { data: k, loading } = useKpis(ctx);
  const onClick = spec.drill ? () => { const r = spec.drill!(ctx); if (r) ctx.drill(r); } : undefined;
  return (
    <KpiCard label={spec.label} icon={spec.icon} loading={loading}
      value={k ? spec.value(k) : '—'} delta={k ? spec.delta(k) : null} onClick={onClick} />
  );
}

const totalReq = (ctx: WidgetCtx, entity: AppEntity, label: string): DrilldownRequest => ({
  sectionId: ctx.wid, entity, entityLabel: label, dateField: 'created_at', dateRange: ctx.current, contextLabel: label,
});

const KPI_SPECS: { id: string; spec: BundleKpiSpec }[] = [
  { id: 'adkpi.prospects', spec: { label: 'Total Prospects', icon: <UserPlus size={18} />, value: (k) => formatCount(k.totalProspects), delta: (k) => deltaPercent(k.totalProspects, k.totalProspectsPrev), drill: (ctx) => totalReq(ctx, 'prospect', 'Prospects') } },
  { id: 'adkpi.conversion', spec: { label: 'Prospect → Lead Conversion', icon: <Repeat size={18} />, value: (k) => formatPercent(k.conversionRate), delta: (k) => deltaPercent(k.conversionRate, k.conversionRatePrev), drill: (ctx) => ({ sectionId: ctx.wid, entity: 'prospect', entityLabel: 'Prospects', dateField: 'converted_at', dateRange: ctx.current, constraints: [{ id: 'converted', label: 'Converted', field: 'converted_lead_id', operator: 'is_not_empty', value: '', kind: 'constraint' }], contextLabel: 'Converted Prospects' }) } },
  { id: 'adkpi.leads', spec: { label: 'Total Leads', icon: <Users size={18} />, value: (k) => formatCount(k.totalLeads), delta: (k) => deltaPercent(k.totalLeads, k.totalLeadsPrev), drill: (ctx) => totalReq(ctx, 'leads', 'Leads') } },
  { id: 'adkpi.openOpps', spec: { label: 'Open Opportunities', icon: <Target size={18} />, value: (k) => formatCount(k.openOpps), delta: (k) => deltaPercent(k.openOpps, k.openOppsPrev) } },
  { id: 'adkpi.winRate', spec: { label: 'Win Rate', icon: <Award size={18} />, value: (k) => formatPercent(k.winRate), delta: (k) => deltaPercent(k.winRate, k.winRatePrev) } },
  { id: 'adkpi.accounts', spec: { label: 'Total Accounts', icon: <Building2 size={18} />, value: (k) => formatCount(k.totalAccounts), delta: (k) => deltaPercent(k.totalAccounts, k.totalAccountsPrev), drill: (ctx) => totalReq(ctx, 'accounts', 'Accounts') } },
  { id: 'adkpi.pipeline', spec: { label: 'Pipeline Value', icon: <DollarSign size={18} />, value: (k) => k.pipelineValue !== null ? formatMoneyCompact(k.pipelineValue) : '—', delta: (k) => k.pipelineValue !== null && k.pipelineValuePrev !== null ? deltaPercent(k.pipelineValue, k.pipelineValuePrev) : null } },
];

function ContactsKpi({ ctx }: { ctx: WidgetCtx }) {
  const { data, loading } = useRangedData('contactsKpi', (c, p) => fetchContactsKpi(c, p), ctx.current, ctx.previous);
  return (
    <KpiCard label="Total Contacts" icon={<Contact size={18} />} loading={loading}
      value={data ? formatCount(data.total) : '—'} delta={data ? deltaPercent(data.total, data.totalPrev) : null}
      onClick={() => ctx.drill(totalReq(ctx, 'contacts', 'Contacts'))} />
  );
}

function ProductsKpi({ ctx }: { ctx: WidgetCtx }) {
  const { data, loading } = useRangedData('products', () => fetchProductsBreakdown(), ctx.current, ctx.previous);
  return (
    <KpiCard label="Products / Services" icon={<Package size={18} />} loading={loading}
      value={data ? formatCount(data.active) : '—'}
      onClick={() => ctx.drill({ sectionId: ctx.wid, entity: 'product', entityLabel: 'Products / Services', dateField: 'created_at', dateRange: FULL_RANGE, contextLabel: 'Products / Services' })} />
  );
}

// ── Curated chart widgets (funnel, opportunity breakdown/trend, health) ──────

function FunnelWidget({ ctx }: { ctx: WidgetCtx }) {
  const { data, loading } = useRangedData('funnel', (c) => fetchFunnel(c), ctx.current, ctx.previous);

  const stageRequest = (stageKey: string, label: string): DrilldownRequest | null => {
    const base = {
      sectionId: ctx.wid, dateRange: ctx.current, contextLabel: `Funnel · ${label}`,
      primary: { id: 'stage', label, field: '__stage', operator: 'eq' as const, value: stageKey, kind: 'primary' as const },
    };
    switch (stageKey) {
      case 'prospects': return { ...base, entity: 'prospect', entityLabel: 'Prospects', dateField: 'created_at' };
      case 'converted': return { ...base, entity: 'prospect', entityLabel: 'Prospects', dateField: 'converted_at', constraints: [{ id: 'converted', label: 'Converted', field: 'converted_lead_id', operator: 'is_not_empty', value: '', kind: 'constraint' }] };
      case 'qualified': return { ...base, entity: 'leads', entityLabel: 'Leads', dateField: 'created_at', constraints: [{ id: 'qualified', label: 'Qualified', field: 'is_qualified', operator: 'eq', value: 'true', kind: 'constraint' }] };
      case 'opportunities': return { ...base, entity: 'opportunities', entityLabel: 'Opportunities', dateField: 'created_at' };
      case 'won': return data?.wonStateCode ? { ...base, entity: 'opportunities', entityLabel: 'Opportunities', dateField: 'actual_close_date', constraints: [{ id: 'won', label: 'Won', field: 'state_code', operator: 'eq', value: data.wonStateCode, kind: 'constraint' }] } : null;
      default: return null;
    }
  };

  const selectedKey = ctx.activeReq?.primary?.value ?? null;
  return (
    <Card title="Conversion Funnel" subtitle="Prospect → Lead → Qualified → Opportunity → Won">
      {loading ? <CardSkeleton rows={3} /> : !data ? <EmptyState message="No funnel data for this period" /> : (
        <Funnel stages={data.stages.map((s) => ({ label: s.label, value: s.value, raw: s.key }))} selectedKey={selectedKey}
          onStageClick={(s) => { const req = stageRequest(s.raw ?? '', s.label); if (req) ctx.drill(req); }} />
      )}
    </Card>
  );
}

function OppBreakdownWidget({ ctx }: { ctx: WidgetCtx }) {
  const { data: s, loading } = useRangedData('oppStats', (c) => fetchOppStats(c), ctx.current, ctx.previous);
  const sel = selKey(ctx, 'state_code');

  const tileDrill = (label: string, code: string | null, dateField: string) => {
    if (!code) return;
    ctx.drill({
      sectionId: ctx.wid, entity: 'opportunities', entityLabel: 'Opportunities', dateField, dateRange: ctx.current,
      primary: { id: 'dim', label: `Status: ${label}`, field: 'state_code', operator: 'eq', value: code, kind: 'primary' },
      contextLabel: `Opportunities · ${label}`,
    });
  };

  return (
    <Card title="Won vs Lost vs Open" subtitle="For the selected period">
      {loading ? <CardSkeleton rows={3} /> : !s ? <EmptyState message="No opportunities in this period" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Tile label="Won" value={formatCount(s.won)} tone="var(--success)" dim={sel != null && sel !== s.wonCode} onClick={() => tileDrill('Won', s.wonCode, 'actual_close_date')} />
            <Tile label="Lost" value={formatCount(s.lost)} tone="var(--danger)" dim={sel != null && sel !== s.lostCode} onClick={() => tileDrill('Lost', s.lostCode, 'actual_close_date')} />
            <Tile label="Open" value={formatCount(s.open)} tone="var(--link)" dim={sel != null && sel !== s.openCode} onClick={() => tileDrill('Open', s.openCode, 'created_at')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <Stat label="Won value" value={s.wonValue !== null ? formatMoney(s.wonValue) : '—'} />
            <Stat label="Open pipeline" value={s.openPipeline !== null ? formatMoney(s.openPipeline) : '—'} />
            <Stat label="Avg. days to close" value={s.avgDaysToClose !== null ? `${s.avgDaysToClose} days` : '—'} />
          </div>
        </div>
      )}
    </Card>
  );
}

function OppTrendWidget({ ctx }: { ctx: WidgetCtx }) {
  const { data, loading } = useRangedData('wonTrend', () => fetchWonTrend(), ctx.current, ctx.previous);
  return (
    <Card title="Monthly Trend" subtitle="Won opportunities, last 6 months">
      {loading ? <CardSkeleton rows={3} /> : !data || data.every((p) => p.value === 0) ? (
        <EmptyState message="No won opportunities yet" />
      ) : <LineChart points={data} />}
    </Card>
  );
}

function AccountsHealthWidget({ ctx }: { ctx: WidgetCtx }) {
  const { data, loading } = useRangedData('accounts', (c) => fetchAccountBreakdown(c), ctx.current, ctx.previous);
  const healthDonut: Datum[] = data
    ? [
        { label: 'Active', value: data.active, color: 'var(--success)', raw: 'active' },
        { label: 'Inactive', value: data.inactive, color: 'var(--muted)', raw: 'inactive' },
      ]
    : [];
  const activePct = data && data.total > 0 ? Math.round((data.active / data.total) * 100) : 0;
  return (
    <Card title="Accounts Health & Growth" subtitle="Status and recency">
      {loading ? <CardSkeleton /> : !data || data.total === 0 ? <EmptyState message="No accounts to show" /> : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
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
  );
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const WIDGET_REGISTRY: WidgetDef[] = [
  ...KPI_SPECS.map(({ id, spec }): WidgetDef => ({
    id, group: 'KPIs', title: spec.label, type: 'kpi', span: 1,
    Comp: (ctx) => <BundleKpi ctx={ctx} spec={spec} />,
  })),
  { id: 'adkpi.contacts', group: 'KPIs', title: 'Total Contacts', type: 'kpi', span: 1, Comp: (ctx) => <ContactsKpi ctx={ctx} /> },
  { id: 'adkpi.products', group: 'KPIs', title: 'Products / Services', type: 'kpi', span: 1, Comp: (ctx) => <ProductsKpi ctx={ctx} /> },

  { id: 'adc.funnel', group: 'Conversion', title: 'Conversion Funnel', type: 'chart', span: 2, Comp: (ctx) => <FunnelWidget ctx={ctx} /> },
  { id: 'adc.oppBreakdown', group: 'Opportunities', title: 'Won / Lost / Open', type: 'chart', span: 2, Comp: (ctx) => <OppBreakdownWidget ctx={ctx} /> },
  { id: 'adc.oppTrend', group: 'Opportunities', title: 'Won Trend (6 months)', type: 'chart', span: 1, Comp: (ctx) => <OppTrendWidget ctx={ctx} /> },
  { id: 'adc.accountsHealth', group: 'Accounts', title: 'Accounts Health & Growth', type: 'chart', span: 1, Comp: (ctx) => <AccountsHealthWidget ctx={ctx} /> },

  // Configurable building blocks (added from the palette, multiple instances OK).
  { id: 'custom.kpi', group: 'Build your own', title: 'Custom KPI Card', type: 'kpi', span: 1, configurable: true, custom: true, Comp: (ctx) => <CustomKpi ctx={ctx} /> },
  { id: 'custom.chart', group: 'Build your own', title: 'Custom Chart', type: 'chart', span: 1, configurable: true, custom: true, Comp: (ctx) => <CustomChart ctx={ctx} /> },
];

export const WIDGET_BY_ID: Record<string, WidgetDef> = Object.fromEntries(
  WIDGET_REGISTRY.map((w) => [w.id, w]),
);

/** Helper for building a default custom.chart seed item. */
function chartSeed(i: string, entity: AppEntity, dimension: string, chartType: 'donut' | 'bars', title: string): LayoutItem {
  return { i, def: 'custom.chart', cfg: { kind: 'chart', entity, dimension, chartType, title } };
}

/** Default layout: KPIs + funnel + editable entity charts + opportunity/accounts cards. */
export const DEFAULT_LAYOUT: LayoutItem[] = [
  ...['adkpi.prospects', 'adkpi.conversion', 'adkpi.leads', 'adkpi.openOpps', 'adkpi.winRate', 'adkpi.accounts', 'adkpi.pipeline', 'adkpi.contacts', 'adkpi.products']
    .map((id): LayoutItem => ({ i: id, def: id })),
  { i: 'adc.funnel', def: 'adc.funnel' },
  chartSeed('seed.prospectsStatus', 'prospect', 'state_code', 'donut', 'Prospects by Status'),
  chartSeed('seed.prospectsSource', 'prospect', 'source', 'bars', 'Prospects by Source'),
  chartSeed('seed.leadsStatus', 'leads', 'state_code', 'donut', 'Leads by Status'),
  chartSeed('seed.leadsSource', 'leads', 'lead_source', 'bars', 'Leads by Source'),
  chartSeed('seed.leadsProduct', 'leads', 'product_id', 'bars', 'Leads by Product'),
  { i: 'adc.oppBreakdown', def: 'adc.oppBreakdown' },
  { i: 'adc.oppTrend', def: 'adc.oppTrend' },
  chartSeed('seed.accountsIndustry', 'accounts', 'industry', 'bars', 'Accounts by Industry'),
  chartSeed('seed.accountsCountry', 'accounts', 'country_id', 'bars', 'Accounts by Country'),
  { i: 'adc.accountsHealth', def: 'adc.accountsHealth' },
  chartSeed('seed.contactsStatus', 'contacts', 'status_code', 'donut', 'Contacts by Status'),
  chartSeed('seed.contactsCountry', 'contacts', 'country_id', 'bars', 'Contacts by Country'),
  chartSeed('seed.productsType', 'product', 'product_type', 'donut', 'Products by Type'),
  chartSeed('seed.productsFamily', 'product', 'family_id', 'bars', 'Products by Family'),
];

// ── Small presentational helpers (ported from the user dashboard) ────────────

function Tile({ label, value, tone, onClick, dim }: { label: string; value: string; tone: string; onClick?: () => void; dim?: boolean }) {
  return (
    <button onClick={onClick} style={{
      borderRadius: 8, padding: '14px 12px', textAlign: 'center', width: '100%',
      background: `color-mix(in srgb, ${tone} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${tone} 35%, transparent)`,
      cursor: onClick ? 'pointer' : 'default', opacity: dim ? 0.3 : 1, transition: 'opacity .15s ease',
    }}>
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

// ── DB-driven entry points (used by the database dashboard runtime) ───────────
// Map a persisted "preset" key to its curated renderer, and expose the two
// generic config-driven widgets so the runtime can render rows from the DB.

const PRESET_KPI_BY_KEY: Record<string, string> = {
  'kpi.prospects': 'adkpi.prospects', 'kpi.conversion': 'adkpi.conversion', 'kpi.leads': 'adkpi.leads',
  'kpi.openOpps': 'adkpi.openOpps', 'kpi.winRate': 'adkpi.winRate', 'kpi.accounts': 'adkpi.accounts',
  'kpi.pipeline': 'adkpi.pipeline',
};

export function renderPreset(key: string, ctx: WidgetCtx): JSX.Element {
  if (key === 'kpi.contacts') return <ContactsKpi ctx={ctx} />;
  if (key === 'kpi.products') return <ProductsKpi ctx={ctx} />;
  const kpiId = PRESET_KPI_BY_KEY[key];
  if (kpiId) {
    const found = KPI_SPECS.find((s) => s.id === kpiId);
    if (found) return <BundleKpi ctx={ctx} spec={found.spec} />;
  }
  switch (key) {
    case 'funnel': return <FunnelWidget ctx={ctx} />;
    case 'oppBreakdown': return <OppBreakdownWidget ctx={ctx} />;
    case 'oppTrend': return <OppTrendWidget ctx={ctx} />;
    case 'accountsHealth': return <AccountsHealthWidget ctx={ctx} />;
    default: return <ConfigPlaceholder what="widget" />;
  }
}

export { CustomKpi, CustomChart };
