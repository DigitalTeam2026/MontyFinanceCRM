// Metadata that powers the configurable widgets: which entities can be charted,
// what dimensions they can be grouped by, what can be summed, and which date
// column to scope by. This single table drives BOTH the config UI (the dropdowns
// the admin sees) and the generic aggregation engine (genericData.ts), so the two
// can never drift apart.

import type { AppEntity } from '../../app/types';
import type { ReactNode } from 'react';

// ── Widget configuration (persisted per instance, frontend-only) ─────────────

/** A status/condition constraint, e.g. Opportunities where state_code = Lost. */
export interface StatusFilter {
  field: string;   // physical column, e.g. 'state_code'
  value: string;   // stored value as text, e.g. '3'
  label: string;   // human label, e.g. 'Lost'
}

export interface KpiConfig {
  kind: 'kpi';
  entity: AppEntity;
  measure: 'count' | 'sum';
  field?: string;          // physical column to sum (when measure === 'sum')
  status?: StatusFilter;   // optional condition
  label: string;           // card label
}

export interface ChartConfig {
  kind: 'chart';
  entity: AppEntity;
  dimension: string;       // DimOption.key to group by
  chartType: 'donut' | 'bars';
  status?: StatusFilter;   // optional condition
  title: string;
}

export type WidgetConfig = KpiConfig | ChartConfig;

// ── Per-entity metadata ───────────────────────────────────────────────────────

export type DimKind = 'state' | 'reason' | 'text' | 'fk';

export interface DimOption {
  key: string;             // physical column, e.g. 'state_code' | 'country_id'
  label: string;           // human label shown in the config dropdown
  kind: DimKind;
  /** For kind 'fk': the lookup table/slug passed to batchResolveLookupLabels. */
  fk?: string;
  /** For kind 'text': optional value→label map (e.g. lead sources). */
  textMap?: Record<string, string>;
}

export interface SumField {
  key: string;
  label: string;
  money?: boolean;
}

export interface EntityMeta {
  entity: AppEntity;
  table: string;            // physical table name
  logical: string;          // entity_definition.logical_name (for status defs)
  label: string;
  dateField: string;
  /** Catalog/reference entity (Products) — charts ignore the date range. */
  catalog?: boolean;
  /** Column used for status/condition filtering, or null if none. */
  statusField: string | null;
  dimensions: DimOption[];
  sumFields: SumField[];
}

const SOURCE_LABELS: Record<string, string> = {
  web: 'Website', referral: 'Referral', social_media: 'Social Media',
  email_campaign: 'Email Campaign', cold_call: 'Cold Call', trade_show: 'Trade Show',
  partner: 'Partner', other: 'Other',
};

export const ENTITY_META: EntityMeta[] = [
  {
    entity: 'leads', table: 'lead', logical: 'lead', label: 'Leads', dateField: 'created_at', statusField: 'state_code',
    dimensions: [
      { key: 'state_code', label: 'Status', kind: 'state' },
      { key: 'status_reason', label: 'Status Reason', kind: 'reason' },
      { key: 'lead_source', label: 'Source', kind: 'text', textMap: SOURCE_LABELS },
      { key: 'product_id', label: 'Product', kind: 'fk', fk: 'product' },
    ],
    sumFields: [],
  },
  {
    entity: 'opportunities', table: 'opportunity', logical: 'opportunity', label: 'Opportunities', dateField: 'created_at', statusField: 'state_code',
    dimensions: [
      { key: 'state_code', label: 'Status', kind: 'state' },
      { key: 'status_reason', label: 'Status Reason', kind: 'reason' },
    ],
    sumFields: [
      { key: 'estimated_value', label: 'Estimated value', money: true },
      { key: 'actual_value', label: 'Actual value', money: true },
    ],
  },
  {
    entity: 'accounts', table: 'account', logical: 'account', label: 'Accounts', dateField: 'created_at', statusField: 'state_code',
    dimensions: [
      { key: 'state_code', label: 'Status', kind: 'state' },
      { key: 'industry', label: 'Industry', kind: 'text' },
      { key: 'country_id', label: 'Country', kind: 'fk', fk: 'country' },
    ],
    sumFields: [],
  },
  {
    entity: 'contacts', table: 'contact', logical: 'contact', label: 'Contacts', dateField: 'created_at', statusField: 'status_code',
    dimensions: [
      { key: 'status_code', label: 'Status', kind: 'text' },
      { key: 'country_id', label: 'Country', kind: 'fk', fk: 'country' },
    ],
    sumFields: [],
  },
  {
    entity: 'prospect', table: 'crm_prospect', logical: 'prospect', label: 'Prospects', dateField: 'created_at', statusField: 'state_code',
    dimensions: [
      { key: 'state_code', label: 'Status', kind: 'state' },
      { key: 'status_reason', label: 'Status Reason', kind: 'reason' },
      { key: 'source', label: 'Source', kind: 'text', textMap: SOURCE_LABELS },
    ],
    sumFields: [],
  },
  {
    entity: 'product', table: 'product', logical: 'product', label: 'Products / Services', dateField: 'created_at', catalog: true, statusField: 'is_active',
    dimensions: [
      { key: 'product_type', label: 'Type', kind: 'text' },
      { key: 'family_id', label: 'Family', kind: 'fk', fk: 'product_family' },
    ],
    sumFields: [],
  },
];

export const META_BY_ENTITY: Record<string, EntityMeta> = Object.fromEntries(
  ENTITY_META.map((m) => [m.entity, m]),
);

/** A stable cache key for a widget config (drives the per-range request cache). */
export function configKey(cfg: WidgetConfig): string {
  if (cfg.kind === 'kpi') {
    return `kpi|${cfg.entity}|${cfg.measure}|${cfg.field ?? ''}|${cfg.status?.field ?? ''}=${cfg.status?.value ?? ''}`;
  }
  return `chart|${cfg.entity}|${cfg.dimension}|${cfg.status?.field ?? ''}=${cfg.status?.value ?? ''}`;
}

/** Sensible starting points when the admin adds a blank custom widget. */
export function defaultKpiConfig(): KpiConfig {
  return { kind: 'kpi', entity: 'opportunities', measure: 'count', label: 'Opportunities' };
}

export function defaultChartConfig(): ChartConfig {
  return { kind: 'chart', entity: 'opportunities', dimension: 'state_code', chartType: 'donut', title: 'Opportunities by Status' };
}

// Re-export ReactNode purely so callers can type icon props without another import.
export type Icon = ReactNode;
