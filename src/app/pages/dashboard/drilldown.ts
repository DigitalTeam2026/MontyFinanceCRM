// Dashboard drill-down data layer.
//
// A chart click opens an inline panel showing the matching records WITHOUT
// navigating away. The panel renders the columns of the user's selected saved
// view (same views as the entity list page) and the same resolved cell values,
// with the chart filter + dashboard date range always applied on top.
//
// Data flows through the SAME list pipeline the grid uses (fetchEntityList +
// resolveGridValues) so cells resolve identically. RLS scopes results to what
// the current user may read — no extra ownership filtering here.

import type { AppEntity } from '../../types';
import { ENTITY_LOGICAL_NAME } from '../../types';
import type { ActiveFilter, FilterOperator, ListRow, RelatedColumnSpec } from '../../services/listService';
import { fetchEntityList } from '../../services/listService';
import { resolveGridValues } from '../../services/gridResolver';
import { fetchViewsForEntityLogical, fetchViewColumns } from '../../../services/viewService';
import { buildColumnStatesFromViewColumns } from '../../services/viewColumnState';
import type { ColumnState } from '../../components/ColumnCustomizer';
import type { ViewDefinition } from '../../../types/view';
import type { DateRange } from './theme';

const LOGICAL_TO_PHYSICAL: Record<string, string> = { statecode: 'state_code', statusreason: 'status_reason' };
const LABEL_FALLBACKS: Record<string, string[]> = {
  lead: ['topic', 'company_name', 'email'],
  contact: ['email', 'business_phone'],
};

// Fallback columns for entities without an ENTITY_COLUMNS default (e.g. prospect),
// used when the user has no saved view to source columns from. Keys reference
// physical columns that fetchEntityList returns directly.
const FALLBACK_COLUMNS: Record<string, ColumnState[]> = {
  prospect: [
    { key: 'first_name',   label: 'First Name', visible: true, type: 'text' },
    { key: 'last_name',    label: 'Last Name',  visible: true, type: 'text' },
    { key: 'company_name', label: 'Company',    visible: true, type: 'text' },
    { key: 'email',        label: 'Email',      visible: true, type: 'text' },
    { key: 'state_code',   label: 'Status',     visible: true, type: 'badge' },
    { key: 'source',       label: 'Source',     visible: true, type: 'text' },
    { key: 'created_at',   label: 'Created',    visible: true, type: 'date' },
  ],
  contacts: [
    { key: 'first_name',  label: 'First Name', visible: true, type: 'text' },
    { key: 'last_name',   label: 'Last Name',  visible: true, type: 'text' },
    { key: 'email',       label: 'Email',      visible: true, type: 'text' },
    { key: 'job_title',   label: 'Job Title',  visible: true, type: 'text' },
    { key: 'status_code', label: 'Status',     visible: true, type: 'badge' },
    { key: 'created_at',  label: 'Created',    visible: true, type: 'date' },
  ],
  product: [
    { key: 'name',         label: 'Name',    visible: true, type: 'text' },
    { key: 'code',         label: 'Code',    visible: true, type: 'text' },
    { key: 'product_type', label: 'Type',    visible: true, type: 'text' },
    { key: 'is_active',    label: 'Active',  visible: true, type: 'boolean' },
    { key: 'created_at',   label: 'Created', visible: true, type: 'date' },
  ],
};

/** A filter applied to the drill-down, surfaced in the panel header as a chip. */
export interface DrillChip {
  id: string;
  /** Human label, e.g. "Status: New" or "Won". */
  label: string;
  field: string;
  operator: FilterOperator;
  value: string;
  /** primary = the clicked dimension (removable blue chip); constraint = fixed gray chip. */
  kind: 'primary' | 'constraint';
}

/** Everything needed to describe one drill-down (which records to show). */
export interface DrilldownRequest {
  /** The section this panel belongs to — only one drill-down open per section. */
  sectionId: string;
  entity: AppEntity;
  /** Header title, e.g. "Leads". */
  entityLabel: string;
  /** Timestamp column the dashboard date range applies to. */
  dateField: string;
  dateRange: DateRange;
  /** The clicked dimension (omitted for KPI/stage totals that filter by date alone). */
  primary?: DrillChip;
  /** Fixed extra filters for the slice (e.g. Won, Qualified). */
  constraints?: DrillChip[];
  /** Label shown beside "Open in <Entity> list →". */
  contextLabel: string;
}

export interface DrilldownView {
  view_id: string;
  name: string;
  is_default: boolean;
}

export interface DrilldownColumns {
  columns: ColumnState[];
  /** Gray chips from the selected view's own filters (combined per spec). */
  viewFilterChips: DrillChip[];
}

export interface DrilldownPage {
  rows: ListRow[];
  total: number;
}

const PAGE_SIZE = 10;

/** List the current user's saved views for an entity (default first). */
export async function listDrilldownViews(entity: AppEntity): Promise<{ views: DrilldownView[]; defaultViewId: string | null }> {
  const logical = ENTITY_LOGICAL_NAME[entity] ?? entity;
  let defs: ViewDefinition[] = [];
  try {
    defs = await fetchViewsForEntityLogical(logical);
  } catch {
    defs = [];
  }
  const views = defs.map((v) => ({ view_id: v.view_id, name: v.name, is_default: !!v.is_default }));
  const defaultViewId = views.find((v) => v.is_default)?.view_id ?? views[0]?.view_id ?? null;
  return { views, defaultViewId };
}

/** Resolve the selected view into render columns + its own filter chips. */
export async function resolveDrilldownColumns(entity: AppEntity, viewId: string | null): Promise<DrilldownColumns> {
  let cols: Awaited<ReturnType<typeof fetchViewColumns>> = [];
  let viewDef: ViewDefinition | null = null;
  if (viewId) {
    try {
      const logical = ENTITY_LOGICAL_NAME[entity] ?? entity;
      const [fetchedCols, defs] = await Promise.all([
        fetchViewColumns(viewId),
        fetchViewsForEntityLogical(logical),
      ]);
      cols = fetchedCols;
      viewDef = defs.find((v) => v.view_id === viewId) ?? null;
    } catch {
      cols = [];
    }
  }
  let columns = buildColumnStatesFromViewColumns(entity, cols).filter((c) => c.visible);
  if (columns.length === 0 && FALLBACK_COLUMNS[entity]) columns = FALLBACK_COLUMNS[entity];
  const viewFilterChips: DrillChip[] = (viewDef?.filter_json?.conditions ?? []).map((c, idx) => {
    const field = LOGICAL_TO_PHYSICAL[c.field_logical_name] ?? c.field_logical_name;
    const value = Array.isArray(c.value) ? c.value.join(',') : (c.value ?? '');
    return {
      id: `viewf-${idx}`,
      label: `${c.field_display_name ?? c.field_logical_name}: ${value}`,
      field,
      operator: c.operator as FilterOperator,
      value,
      kind: 'constraint' as const,
    };
  });
  return { columns, viewFilterChips };
}

/** Build the full ActiveFilter[] for a drill-down: date range + chips + view filters. */
function buildFilters(req: DrilldownRequest, includePrimary: boolean, viewFilterChips: DrillChip[]): ActiveFilter[] {
  const filters: ActiveFilter[] = [
    { id: 'dd_from', field: req.dateField, label: 'From', operator: 'gte', value: req.dateRange.from },
    { id: 'dd_to', field: req.dateField, label: 'To', operator: 'lt', value: req.dateRange.to },
  ];
  if (includePrimary && req.primary) {
    filters.push({ id: req.primary.id, field: req.primary.field, label: req.primary.label, operator: req.primary.operator, value: req.primary.value });
  }
  for (const c of req.constraints ?? []) {
    filters.push({ id: c.id, field: c.field, label: c.label, operator: c.operator, value: c.value });
  }
  for (const c of viewFilterChips) {
    filters.push({ id: c.id, field: c.field, label: c.label, operator: c.operator, value: c.value });
  }
  return filters;
}

/** Derive list-fetch related-column specs + key map from the view's columns. */
function specsFor(columns: ColumnState[]): { relatedColumns: RelatedColumnSpec[]; columnKeyMap: Record<string, string> } {
  const relatedColumns: RelatedColumnSpec[] = columns
    .filter((c) => c.visible && c.relationship_definition_id && c.field_definition_id)
    .map((c) => ({
      colKey: c.key,
      relatedTable: c.related_table_name ?? '',
      fkColumn: c.fk_physical_column ?? '',
      fieldPhysicalColumn: c.field_physical_column ?? '',
      fallbackFields: LABEL_FALLBACKS[c.related_table_name ?? ''],
    }))
    .filter((s) => s.relatedTable && s.fkColumn && s.fieldPhysicalColumn);

  const columnKeyMap: Record<string, string> = {};
  for (const c of columns) {
    if (!c.visible) continue;
    if (c.relationship_definition_id) continue;
    if (c.lookup_table && c.lookup_label_field) continue;
    const phys = c.field_physical_column;
    if (phys && phys !== c.key) columnKeyMap[c.key] = phys;
  }
  return { relatedColumns, columnKeyMap };
}

/**
 * Fetch one page of drill-down rows. Always applies the date range + constraints
 * + view filters; the primary dimension filter is applied unless removed.
 */
export async function fetchDrilldownPage(
  req: DrilldownRequest,
  columns: ColumnState[],
  viewFilterChips: DrillChip[],
  opts: { page: number; primaryActive: boolean; search?: string },
): Promise<DrilldownPage> {
  const filters = buildFilters(req, opts.primaryActive, viewFilterChips);
  const { relatedColumns, columnKeyMap } = specsFor(columns);

  const result = await fetchEntityList(req.entity, {
    page: opts.page,
    pageSize: PAGE_SIZE,
    // Server-side text search (ilike across the entity's search fields). Empty/whitespace
    // is normalized to undefined so a blank box doesn't add a no-op filter.
    search: opts.search?.trim() || undefined,
    sortKey: req.dateField,
    sortDir: 'desc',
    filters,
    relatedColumns,
    columnKeyMap,
  });
  const rows = await resolveGridValues(result.rows, columns);
  return { rows, total: result.total };
}

export { PAGE_SIZE as DRILLDOWN_PAGE_SIZE };
