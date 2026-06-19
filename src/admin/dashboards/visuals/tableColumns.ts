// Table-visual column model helpers — shared by the designer (PropertiesPanel /
// TableColumnsPanel) and the runtime (TableVisual). Centralises:
//   • building a default TableColumnConfig from a field definition,
//   • deriving the effective column list (configured → legacy columns fallback),
//   • the physical columns the query engine must SELECT,
//   • field-type → filter-kind mapping + the per-kind operator menus (§4).
// The custom display label only changes the header; `field` (physical column) is
// always what the query, sort and filter use (§12).

import type { FieldDefinition } from '../../../types/field';
import type {
  TableColumnConfig, FilterOp, DashboardVisual,
} from '../types/dashboard';

// ── field-type normalisation ──────────────────────────────────────────────────
const NUMERIC = new Set(['number', 'decimal', 'integer', 'currency', 'money', 'whole_number', 'float', 'percentage']);
const CURRENCY = new Set(['currency', 'money']);
const DATE = new Set(['date', 'datetime']);
const CHOICE = new Set(['choice', 'multi_choice', 'option_set', 'multi_option_set', 'picklist', 'select']);

/** Normalised type token used to drive defaults, formatting and filter menus. */
export function normalizeFieldType(f: FieldDefinition): string {
  const phys = f.physical_column_name;
  if (phys === 'status_reason' || phys === 'statuscode') return 'statusreason';
  if (phys === 'state_code' || phys === 'statecode') return 'statecode';
  if (f.lookup_entity_id || f.lookup_entity) return 'lookup';
  const t = f.field_type?.name ?? 'text';
  if (CURRENCY.has(t)) return 'currency';
  if (NUMERIC.has(t)) return 'number';
  if (DATE.has(t)) return 'date';
  if (CHOICE.has(t)) return 'choice';
  return t;
}

export type FilterKind = 'text' | 'number' | 'date' | 'boolean' | 'choice' | 'lookup';

/** Maps a (normalised OR raw) data type to the filter UI family for its header filter. */
export function filterKindOf(dataType: string | undefined): FilterKind {
  switch (dataType) {
    case 'number':
    case 'currency':
    case 'percentage':
    case 'money':
    case 'decimal':
    case 'integer':
    case 'whole_number':
    case 'float':
      return 'number';
    case 'date':
    case 'datetime':
      return 'date';
    case 'boolean':
      return 'boolean';
    case 'choice':
    case 'multi_choice':
    case 'option_set':
    case 'multi_option_set':
    case 'picklist':
    case 'select':
    case 'statusreason':
    case 'statecode':
      return 'choice';
    case 'lookup':
      return 'lookup';
    default:
      return 'text';
  }
}

const ALIGN_RIGHT = new Set(['number', 'currency', 'percentage']);
const ALIGN_CENTER = new Set(['boolean', 'date']);

/** Sensible default alignment per data type (numbers right, dates/bools centred). */
function defaultAlignment(dataType: string): TableColumnConfig['alignment'] {
  if (ALIGN_RIGHT.has(dataType)) return 'right';
  if (ALIGN_CENTER.has(dataType)) return 'center';
  return 'left';
}

// ── column construction ─────────────────────────────────────────────────────────
function uid(): string {
  try { return crypto.randomUUID(); } catch { return `col_${Math.random().toString(36).slice(2)}`; }
}

/** Build a fully-defaulted column config from an entity field definition. */
export function makeColumn(f: FieldDefinition): TableColumnConfig {
  const dataType = normalizeFieldType(f);
  return {
    id: uid(),
    fieldId: f.field_definition_id,
    sourceEntityId: f.entity_definition_id,
    field: f.physical_column_name,
    displayLabel: f.display_name,
    dataType,
    alignment: defaultAlignment(dataType),
    visible: true,
    sortable: f.is_sortable !== false,
    filterable: f.is_filterable !== false,
    resizable: true,
    reorderable: true,
    searchable: f.is_searchable !== false,
    relationshipPath: [],
  };
}

/** Synthesise a column from a bare physical name (legacy tables without config). */
export function makeColumnFromName(field: string, fields?: FieldDefinition[]): TableColumnConfig {
  const f = fields?.find((x) => x.physical_column_name === field);
  if (f) return makeColumn(f);
  return {
    id: uid(), field, displayLabel: field, dataType: 'text',
    alignment: 'left', visible: true, sortable: true, filterable: true,
    resizable: true, reorderable: true, searchable: true, relationshipPath: [],
  };
}

/**
 * The effective ordered column list for a visual. Prefers the configured
 * data_config.tableColumns; otherwise derives from the legacy
 * query_config.columns so existing tables keep working (and gain headers).
 */
export function effectiveColumns(visual: DashboardVisual, fields?: FieldDefinition[]): TableColumnConfig[] {
  const cfg = visual.data_config?.tableColumns;
  if (cfg && cfg.length) return cfg;
  const legacy = visual.query_config?.columns ?? [];
  return legacy.map((c) => makeColumnFromName(c, fields));
}

/**
 * Physical columns the query engine must SELECT — every configured column's
 * field (deduped, original order). Hidden columns are still fetched so toggling
 * visibility at runtime needs no refetch and header filters/sort always resolve.
 */
export function queryColumnsFor(columns: TableColumnConfig[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of columns) {
    if (!c.field || seen.has(c.field)) continue;
    seen.add(c.field);
    out.push(c.field);
  }
  return out;
}

/** Header text for a column — custom label wins, else the physical field name. */
export function headerLabel(c: TableColumnConfig): string {
  return c.displayLabel?.trim() || c.field;
}

// ── filter operators per kind (§4) ────────────────────────────────────────────
export interface OpDef { op: FilterOp | DatePresetOp; label: string }
/** Date presets translate to a computed range client-side before querying. */
export type DatePresetOp = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'relative';

export const TEXT_OPS: OpDef[] = [
  { op: 'eq', label: 'Equals' },
  { op: 'neq', label: 'Not equals' },
  { op: 'contains', label: 'Contains' },
  { op: 'not_contains', label: 'Does not contain' },
  { op: 'starts_with', label: 'Starts with' },
  { op: 'ends_with', label: 'Ends with' },
  { op: 'is_empty', label: 'Is empty' },
  { op: 'is_not_empty', label: 'Is not empty' },
];

export const NUMBER_OPS: OpDef[] = [
  { op: 'eq', label: 'Equals' },
  { op: 'neq', label: 'Not equals' },
  { op: 'gt', label: 'Greater than' },
  { op: 'gte', label: 'Greater than or equal' },
  { op: 'lt', label: 'Less than' },
  { op: 'lte', label: 'Less than or equal' },
  { op: 'between', label: 'Between' },
  { op: 'is_empty', label: 'Is empty' },
  { op: 'is_not_empty', label: 'Is not empty' },
];

export const DATE_OPS: OpDef[] = [
  { op: 'on', label: 'On' },
  { op: 'before', label: 'Before' },
  { op: 'after', label: 'After' },
  { op: 'between', label: 'Between' },
  { op: 'today', label: 'Today' },
  { op: 'yesterday', label: 'Yesterday' },
  { op: 'this_week', label: 'This week' },
  { op: 'this_month', label: 'This month' },
  { op: 'relative', label: 'Relative date' },
  { op: 'is_empty', label: 'Is empty' },
  { op: 'is_not_empty', label: 'Is not empty' },
];

export const CHOICE_OPS: OpDef[] = [
  { op: 'in', label: 'Is any of' },
  { op: 'not_in', label: 'Is not any of' },
  { op: 'is_empty', label: 'Is empty' },
  { op: 'is_not_empty', label: 'Is not empty' },
];

export const LOOKUP_OPS: OpDef[] = [
  { op: 'in', label: 'Is any of' },
  { op: 'not_in', label: 'Is not any of' },
  { op: 'is_empty', label: 'Is empty' },
  { op: 'is_not_empty', label: 'Is not empty' },
];

export function opsForKind(kind: FilterKind): OpDef[] {
  switch (kind) {
    case 'number': return NUMBER_OPS;
    case 'date': return DATE_OPS;
    case 'boolean': return CHOICE_OPS;   // rendered as Yes/No/Empty toggles
    case 'choice': return CHOICE_OPS;
    case 'lookup': return LOOKUP_OPS;
    default: return TEXT_OPS;
  }
}

/** Operators that take no value input. */
export const NO_VALUE_OPS = new Set<string>(['is_empty', 'is_not_empty', 'today', 'yesterday', 'this_week', 'this_month']);
/** Operators that take two value inputs. */
export const RANGE_OPS = new Set<string>(['between']);

// ── date-preset resolution ──────────────────────────────────────────────────────
/**
 * Translate a date preset operator into a concrete FilterOp + value(s) the query
 * engine understands. `now` is injected so callers control the clock.
 */
export function resolveDatePreset(op: DatePresetOp, now: Date, relativeDays?: number): { op: FilterOp; value?: unknown; value2?: unknown } {
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const iso = (d: Date) => d.toISOString();
  const today = startOfDay(now);
  switch (op) {
    case 'today': {
      const end = new Date(today); end.setDate(end.getDate() + 1);
      return { op: 'between', value: iso(today), value2: iso(end) };
    }
    case 'yesterday': {
      const start = new Date(today); start.setDate(start.getDate() - 1);
      return { op: 'between', value: iso(start), value2: iso(today) };
    }
    case 'this_week': {
      const start = new Date(today); start.setDate(start.getDate() - start.getDay());
      const end = new Date(start); end.setDate(end.getDate() + 7);
      return { op: 'between', value: iso(start), value2: iso(end) };
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      return { op: 'between', value: iso(start), value2: iso(end) };
    }
    case 'relative': {
      const days = relativeDays ?? 7;
      const start = new Date(today); start.setDate(start.getDate() - days);
      const end = new Date(today); end.setDate(end.getDate() + 1);
      return { op: 'between', value: iso(start), value2: iso(end) };
    }
  }
}
