import FilterSelect from './FilterSelect';
import AnchoredPopover from './overlay/AnchoredPopover';
import { useState, useEffect, useCallback } from 'react';
import { Search, X, Check, Loader2, ArrowUpAZ, ArrowDownZA, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ColumnState } from './ColumnCustomizer';
import type { ActiveFilter, FilterOperator } from '../services/listService';
import {
  pickLookupLabel, lookupLabelColumns, resolveNestedLabel, fetchNestedLabelMap,
} from '../services/lookupLabel';

interface ColumnFilterDropdownProps {
  column: ColumnState;
  currentFilter: ActiveFilter | null;
  anchorEl: HTMLElement | null;
  onApply: (filter: ActiveFilter | null) => void;
  onClose: () => void;
  /** entity_definition_id for the source entity — used for status/choice queries */
  entityDefinitionId?: string | null;
  /** Physical table name for the source entity — used for distinct value queries */
  entityTable?: string | null;
  isRedesign?: boolean;
  /** When provided, show a combined sort section at the top */
  sortKey?: string | null;
  sortDir?: 'asc' | 'desc';
  onSort?: (dir: 'asc' | 'desc') => void;
  onHide?: () => void;
}

type TextOperator = 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'eq' | 'neq' | 'is_empty' | 'is_not_empty';
type DateOperator = 'on' | 'on_or_after' | 'on_or_before' | 'today' | 'yesterday' | 'tomorrow' | 'this_week' | 'last_week' | 'next_week' | 'this_month' | 'last_month' | 'next_month' | 'this_year' | 'last_year' | 'next_year';
type NumberOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is_empty' | 'is_not_empty';
type LookupOperator = 'eq' | 'neq' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'is_empty' | 'is_not_empty';

const TEXT_OPERATORS: { value: TextOperator; label: string }[] = [
  { value: 'contains',      label: 'Contains' },
  { value: 'not_contains',  label: 'Does not contain' },
  { value: 'eq',            label: 'Equals' },
  { value: 'neq',           label: 'Does not equal' },
  { value: 'starts_with',   label: 'Begins with' },
  { value: 'ends_with',     label: 'Ends with' },
  { value: 'is_empty',      label: 'Contains no data' },
  { value: 'is_not_empty',  label: 'Contains data' },
];

const DATE_OPERATORS: { value: DateOperator; label: string; hasInput: boolean }[] = [
  { value: 'today',        label: 'Today',        hasInput: false },
  { value: 'yesterday',    label: 'Yesterday',    hasInput: false },
  { value: 'tomorrow',     label: 'Tomorrow',     hasInput: false },
  { value: 'this_week',    label: 'This week',    hasInput: false },
  { value: 'last_week',    label: 'Last week',    hasInput: false },
  { value: 'next_week',    label: 'Next week',    hasInput: false },
  { value: 'this_month',   label: 'This month',   hasInput: false },
  { value: 'last_month',   label: 'Last month',   hasInput: false },
  { value: 'next_month',   label: 'Next month',   hasInput: false },
  { value: 'this_year',    label: 'This year',    hasInput: false },
  { value: 'last_year',    label: 'Last year',    hasInput: false },
  { value: 'next_year',    label: 'Next year',    hasInput: false },
  { value: 'on',           label: 'On',           hasInput: true  },
  { value: 'on_or_after',  label: 'On or after',  hasInput: true  },
  { value: 'on_or_before', label: 'On or before', hasInput: true  },
];

const NUMBER_OPERATORS: { value: NumberOperator; label: string }[] = [
  { value: 'eq',           label: 'Equals' },
  { value: 'neq',          label: 'Does not equal' },
  { value: 'gt',           label: 'Greater than' },
  { value: 'gte',          label: 'Greater than or equal to' },
  { value: 'lt',           label: 'Less than' },
  { value: 'lte',          label: 'Less than or equal to' },
  { value: 'is_empty',     label: 'Contains no data' },
  { value: 'is_not_empty', label: 'Contains data' },
];

const LOOKUP_OPERATORS: { value: LookupOperator; label: string }[] = [
  { value: 'eq',           label: 'Equals' },
  { value: 'neq',          label: 'Does not equal' },
  { value: 'contains',     label: 'Contains' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'starts_with',  label: 'Begins with' },
  { value: 'ends_with',    label: 'Ends with' },
  { value: 'is_empty',     label: 'Contains no data' },
  { value: 'is_not_empty', label: 'Contains data' },
];

interface ChoiceOption { value: string; label: string }
interface LookupResult { id: string; label: string }

/**
 * Resolve the filter-facing column type from the ColumnState.
 * Handles both static ENTITY_COLUMNS types and DB field_type.name values.
 */
function resolveColType(col: ColumnState): 'text' | 'number' | 'date' | 'boolean' | 'choice' | 'lookup' {
  const t = (col.type ?? '').toLowerCase();
  // date/datetime
  if (t === 'date' || t === 'datetime') return 'date';
  // numeric
  if (['currency', 'number', 'decimal', 'integer', 'whole_number'].includes(t)) return 'number';
  // boolean
  if (['boolean', 'two_options', 'twooptions'].includes(t)) return 'boolean';
  // lookup / owner
  if (t === 'lookup' || t === 'owner') return 'lookup';
  // choice / badge / option-set / status
  if (['badge', 'choice', 'option_set', 'optionset', 'select', 'status', 'picklist'].includes(t)) return 'choice';
  // text variants
  return 'text';
}

function getLookupMeta(col: ColumnState): { table: string; labelCol: string; fkCol: string } | null {
  const fkCol = col.field_physical_column ?? null;
  if (!fkCol) return null;
  const table = col.lookup_table ?? (fkCol.endsWith('_id') ? fkCol.replace(/_id$/, '') : null);
  if (!table) return null;
  const labelCol = col.lookup_label_field ?? 'name';
  return { table, labelCol, fkCol };
}

const needsNoValue = (op: string) => op === 'is_empty' || op === 'is_not_empty';

export default function ColumnFilterDropdown({
  column,
  currentFilter,
  anchorEl,
  onApply,
  onClose,
  entityDefinitionId,
  entityTable,
  sortKey,
  sortDir,
  onSort,
  onHide,
}: ColumnFilterDropdownProps) {
  const colType = resolveColType(column);

  /* ── Text state ── */
  const [textOp, setTextOp] = useState<TextOperator>(() =>
    colType === 'text' ? ((currentFilter?.operator as TextOperator) ?? 'contains') : 'contains'
  );
  const [textValue, setTextValue] = useState(() =>
    colType === 'text' ? (currentFilter?.value ?? '') : ''
  );

  /* ── Number state ── */
  const [numOp, setNumOp] = useState<NumberOperator>(() =>
    colType === 'number' ? ((currentFilter?.operator as NumberOperator) ?? 'eq') : 'eq'
  );
  const [numValue, setNumValue] = useState(() =>
    colType === 'number' ? (currentFilter?.value ?? '') : ''
  );

  /* ── Date state ── */
  const [dateOp, setDateOp] = useState<DateOperator>(() =>
    colType === 'date' ? ((currentFilter?.operator as DateOperator) ?? 'today') : 'today'
  );
  const [dateValue, setDateValue] = useState(() =>
    colType === 'date' ? (currentFilter?.value ?? '') : ''
  );

  /* ── Boolean state ── */
  const [boolValue, setBoolValue] = useState<'true' | 'false' | ''>(() =>
    colType === 'boolean' ? ((currentFilter?.value ?? '') as 'true' | 'false' | '') : ''
  );

  /* ── Choice state ── */
  const [choiceOptions, setChoiceOptions] = useState<ChoiceOption[]>([]);
  const [choiceLoading, setChoiceLoading] = useState(false);
  const [selectedChoices, setSelectedChoices] = useState<string[]>(() => {
    if (colType === 'choice' && currentFilter?.value) {
      return currentFilter.value.split(',').filter(Boolean);
    }
    return [];
  });

  /* ── Lookup state ── */
  const [lookupOp, setLookupOp] = useState<LookupOperator>(() =>
    colType === 'lookup' ? ((currentFilter?.operator as LookupOperator) ?? 'eq') : 'eq'
  );
  const [lookupTextValue, setLookupTextValue] = useState(() =>
    colType === 'lookup' && currentFilter?.operator !== 'eq' && currentFilter?.operator !== 'neq'
      ? (currentFilter?.value ?? '') : ''
  );
  const [lookupSearch, setLookupSearch] = useState('');
  const [lookupResults, setLookupResults] = useState<LookupResult[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [selectedLookup, setSelectedLookup] = useState<LookupResult | null>(() => {
    if (colType === 'lookup' && (currentFilter?.operator === 'eq' || currentFilter?.operator === 'neq') && currentFilter?.value) {
      return { id: currentFilter.value, label: currentFilter.label ?? currentFilter.value };
    }
    return null;
  });

  /* ── Load choice options — column-aware ── */
  useEffect(() => {
    if (colType !== 'choice') return;
    setChoiceLoading(true);

    const physCol = column.field_physical_column ?? column.key;

    const resolveEntityId = async (): Promise<string | null> => {
      if (entityDefinitionId) return entityDefinitionId;
      if (!column.field_definition_id) return null;
      const { data } = await supabase
        .from('field_definition')
        .select('entity_definition_id')
        .eq('field_definition_id', column.field_definition_id)
        .maybeSingle();
      return data?.entity_definition_id ?? null;
    };

    const load = async () => {
      const edId = await resolveEntityId();

      if (physCol === 'status' && edId) {
        const { data } = await supabase
          .from('statecode_definition')
          .select('state_value, display_label')
          .eq('entity_definition_id', edId)
          .order('sort_order', { ascending: true });
        setChoiceOptions(
          (data ?? []).map((r) => ({ value: String(r.display_label).toLowerCase(), label: r.display_label }))
        );
      } else if (physCol === 'state_code' && edId) {
        const { data } = await supabase
          .from('statecode_definition')
          .select('state_value, display_label')
          .eq('entity_definition_id', edId)
          .order('sort_order', { ascending: true });
        setChoiceOptions(
          (data ?? []).map((r) => ({ value: String(r.state_value), label: r.display_label }))
        );
      } else if (physCol === 'status_reason' && edId) {
        const { data } = await supabase
          .from('status_reason_definition')
          .select('reason_value, display_label')
          .eq('entity_definition_id', edId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });
        setChoiceOptions(
          (data ?? []).map((r) => ({ value: String(r.reason_value), label: r.display_label }))
        );
      } else if (entityTable && physCol) {
        const { data } = await supabase
          .from(entityTable)
          .select(physCol)
          .not(physCol, 'is', null)
          .limit(200);
        const unique = [...new Set(((data ?? []) as unknown as Record<string, unknown>[]).map((r: Record<string, unknown>) => String(r[physCol] ?? '')).filter(Boolean))].sort();
        setChoiceOptions(unique.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) })));
      } else {
        setChoiceOptions([]);
      }
      setChoiceLoading(false);
    };

    load().catch(() => setChoiceLoading(false));
  }, [colType, entityDefinitionId, entityTable, column.field_definition_id, column.field_physical_column, column.key]);

  /* ── Search lookup records ── */
  const searchLookup = useCallback(async (q: string) => {
    setLookupLoading(true);
    try {
      let targetTable = column.lookup_table ?? null;
      let nameCol = column.lookup_label_field ?? null;
      let pkCol: string | null = null;

      // Resolve via field_definition if missing
      if ((!targetTable || !nameCol) && column.field_definition_id) {
        const { data: fd } = await supabase
          .from('field_definition')
          .select('lookup_entity_id, lookup_entity:entity_definition!lookup_entity_id(physical_table_name, primary_field_name, primary_key_column)')
          .eq('field_definition_id', column.field_definition_id)
          .maybeSingle();
        if (fd?.lookup_entity_id) {
          const le = fd.lookup_entity as { physical_table_name?: string; primary_field_name?: string; primary_key_column?: string | null } | null;
          targetTable = targetTable ?? le?.physical_table_name ?? null;
          nameCol = nameCol ?? le?.primary_field_name ?? null;
          pkCol = pkCol ?? le?.primary_key_column ?? null;
        }
      }

      // Derive from FK column name as last resort
      if (!targetTable && column.field_physical_column?.endsWith('_id')) {
        targetTable = column.field_physical_column.replace(/_id$/, '');
      }
      if (!targetTable) { setLookupLoading(false); return; }

      const PK_OVERRIDES: Record<string, string> = {
        product_family: 'family_id', line_of_business: 'lob_id',
        crm_user: 'user_id', security_role: 'role_id',
      };
      const DELETED_AT_TABLES = new Set([
        'business_unit', 'country', 'crm_user', 'industry', 'line_of_business',
        'product', 'product_family', 'security_role', 'team',
      ]);

      // crm_user: PK=user_id, search by email (more meaningful than full_name)
      if (targetTable === 'crm_user') {
        nameCol = 'email';
        pkCol = 'user_id';
      } else {
        nameCol = nameCol ?? 'name';
        // Prefer the metadata PK; the `${table}_id` guess breaks on crm_-prefixed
        // tables (crm_leadsource → leadsource_id, not crm_leadsource_id).
        pkCol = pkCol ?? PK_OVERRIDES[targetTable] ?? `${targetTable.replace(/^crm_/, '')}_id`;
      }

      const labelField = nameCol as string;

      // Nested: the chosen "filter by" field is itself a lookup (e.g. show the
      // lead picker by each lead's Account). List/search by the RELATED record's
      // name rather than a raw id. Two hops: nested name ⇢ base FK ⇢ base row.
      const nested = resolveNestedLabel(targetTable, labelField);
      if (nested.isNested && nested.table && nested.fkColumn && nested.labelField) {
        const basePk = pkCol as string;
        const fk = nested.fkColumn;
        const nTable = nested.table;
        const nName = nested.labelField;
        const nFallbacks = nested.fallbackFields ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const applyActive = (b: any, t: string) =>
          t === 'crm_user' ? b.eq('is_active', true)
            : DELETED_AT_TABLES.has(t) ? b.is('deleted_at', null)
            : b.eq('is_deleted', false);

        // Search step: find nested records whose name matches `q`.
        let restrictIds: string[] | null = null;
        if (q) {
          if (nTable === 'crm_user') {
            const { data } = await applyActive(supabase.from('crm_user').select('user_id'), 'crm_user')
              .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`).limit(50);
            restrictIds = (data ?? []).map((r: Record<string, unknown>) => String(r['user_id']));
          } else {
            const nPk = nested.pk ?? `${nTable.replace(/^crm_/, '')}_id`;
            const ncols = [...new Set([nName, ...nFallbacks])];
            const { data } = await applyActive(supabase.from(nTable).select(nPk), nTable)
              .or(ncols.map((c) => `${c}.ilike.%${q}%`).join(',')).limit(50);
            restrictIds = (data ?? []).map((r: Record<string, unknown>) => String(r[nPk]));
          }
          if (restrictIds.length === 0) { setLookupResults([]); return; }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let bq: any = applyActive(supabase.from(targetTable).select(`${basePk}, ${fk}`), targetTable).limit(30);
        if (restrictIds) bq = bq.in(fk, restrictIds);
        const { data: baseRows } = await bq;
        const rows = (baseRows ?? []) as Record<string, unknown>[];
        const nestedMap = await fetchNestedLabelMap(
          nTable, rows.map((r) => r[fk] as string | null), nName, nFallbacks, nested.pk,
        );
        setLookupResults(
          rows
            .map((r) => ({
              id: String(r[basePk] ?? ''),
              label: nestedMap[r[fk] != null ? String(r[fk]) : ''] ?? '',
            }))
            .filter((x) => x.label)
        );
        return;
      }

      // Search/display across the primary field AND the same fallbacks the grid
      // uses (e.g. lead → topic/company_name/email), so options never render blank
      // and typing matches whichever field actually holds the text. crm_user is
      // already pinned to `email`, so it gets no fallbacks.
      const labelCols = targetTable === 'crm_user'
        ? [labelField]
        : lookupLabelColumns(labelField, targetTable);
      const selectCols = [...new Set([pkCol, ...labelCols])].join(',');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let qb: any = supabase
        .from(targetTable)
        .select(selectCols)
        .limit(30);

      if (targetTable === 'crm_user') {
        qb = qb.eq('is_active', true);
      } else if (DELETED_AT_TABLES.has(targetTable)) {
        qb = qb.is('deleted_at', null);
      } else {
        qb = qb.eq('is_deleted', false);
      }

      if (q) qb = qb.or(labelCols.map((c) => `${c}.ilike.%${q}%`).join(','));

      const { data } = await qb;
      setLookupResults(
        (data ?? []).map((r: Record<string, unknown>) => ({
          id: String(r[pkCol!] ?? r['id'] ?? ''),
          label: pickLookupLabel(r, labelField, labelCols.slice(1)),
        }))
      );
    } finally {
      setLookupLoading(false);
    }
  }, [column.field_definition_id, column.lookup_table, column.lookup_label_field, column.field_physical_column]);

  useEffect(() => {
    if (colType !== 'lookup' || (lookupOp !== 'eq' && lookupOp !== 'neq')) return;
    const delay = lookupSearch ? 300 : 0;
    const t = setTimeout(() => searchLookup(lookupSearch), delay);
    return () => clearTimeout(t);
  }, [colType, lookupOp, lookupSearch, searchLookup]);

  /* ── Build ActiveFilter ── */
  function buildFilter(): ActiveFilter | null {
    const id = `col-${column.key}-${Date.now()}`;
    const label = column.labelOverride ?? column.label;
    const field = column.field_physical_column ?? column.key;

    if (colType === 'text') {
      if (needsNoValue(textOp)) return { id, field, label, operator: textOp as FilterOperator, value: '' };
      if (!textValue.trim()) return null;
      return { id, field, label, operator: textOp as FilterOperator, value: textValue.trim() };
    }
    if (colType === 'number') {
      if (needsNoValue(numOp)) return { id, field, label, operator: numOp as FilterOperator, value: '' };
      if (!numValue.trim()) return null;
      return { id, field, label, operator: numOp as FilterOperator, value: numValue.trim() };
    }
    if (colType === 'date') {
      const dateOpInfo = DATE_OPERATORS.find((d) => d.value === dateOp);
      if (dateOpInfo?.hasInput && !dateValue) return null;
      return { id, field, label, operator: dateOp as FilterOperator, value: dateValue };
    }
    if (colType === 'boolean') {
      if (!boolValue) return null;
      return { id, field, label, operator: 'eq', value: boolValue };
    }
    if (colType === 'choice') {
      if (!selectedChoices.length) return null;
      return { id, field, label, operator: 'eq', value: selectedChoices[0] };
    }
    if (colType === 'lookup') {
      if (needsNoValue(lookupOp)) return { id, field, label, operator: lookupOp as FilterOperator, value: '' };
      if (lookupOp === 'eq' || lookupOp === 'neq') {
        if (!selectedLookup) return null;
        return { id, field, label, operator: lookupOp as FilterOperator, value: selectedLookup.id };
      }
      // Text-based lookup filter: encode for server-side pre-resolution
      if (!lookupTextValue.trim()) return null;
      const meta = getLookupMeta(column);
      if (!meta) return null;
      return {
        id,
        field: `LOOKUP:${meta.table}|${meta.labelCol}|${meta.fkCol}`,
        label,
        operator: lookupOp as FilterOperator,
        value: lookupTextValue.trim(),
      };
    }
    return null;
  }

  const handleApply = () => { onApply(buildFilter()); onClose(); };
  const handleClear = () => { onApply(null); onClose(); };
  const toggleChoice = (val: string) =>
    setSelectedChoices((prev) => prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]);

  if (!anchorEl) return null;

  const dateOpInfo = DATE_OPERATORS.find((d) => d.value === dateOp);
  const colFieldKey = column.field_physical_column ?? column.key;
  const isSortedAsc  = sortKey === colFieldKey && sortDir === 'asc';
  const isSortedDesc = sortKey === colFieldKey && sortDir === 'desc';
  const colLabel = column.labelOverride ?? column.label;

  return (
    <AnchoredPopover
      anchorEl={anchorEl}
      open
      onClose={onClose}
      width={300}
      role="dialog"
      className="bg-white overflow-y-auto flex flex-col"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 14,
        boxShadow: '0 8px 32px rgba(17,24,39,.12), 0 2px 8px rgba(17,24,39,.06)',
      }}
    >
      {/* ── Header: column name ── */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--surface-2)' }}>
        <span className="text-[13px] font-semibold text-[var(--text)] truncate">{colLabel}</span>
        <button onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition shrink-0">
          <X size={13} />
        </button>
      </div>

      {/* ── SORT section (when sort callbacks provided) ── */}
      {onSort && (
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--surface-2)' }}>
          <p className="text-[9px] font-bold text-[var(--muted)] uppercase tracking-widest mb-2">Sort</p>
          <div className="flex gap-2">
            <button
              onClick={() => { onSort('asc'); onClose(); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-semibold rounded-lg transition"
              style={isSortedAsc
                ? { background: 'var(--row-hover)', color: 'var(--link)', border: '1px solid var(--surface-2)' }
                : { background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
              onMouseEnter={(e) => { if (!isSortedAsc) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={(e) => { if (!isSortedAsc) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
            >
              <ArrowUpAZ size={14} />
              A → Z
            </button>
            <button
              onClick={() => { onSort('desc'); onClose(); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-semibold rounded-lg transition"
              style={isSortedDesc
                ? { background: 'var(--row-hover)', color: 'var(--link)', border: '1px solid var(--surface-2)' }
                : { background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
              onMouseEnter={(e) => { if (!isSortedDesc) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={(e) => { if (!isSortedDesc) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
            >
              <ArrowDownZA size={14} />
              Z → A
            </button>
          </div>
        </div>
      )}

      {/* ── FILTER section ── */}
      <div className="px-4 py-3">
        {onSort && (
          <p className="text-[9px] font-bold text-[var(--muted)] uppercase tracking-widest mb-2">Filter</p>
        )}

        <div className="space-y-2">
          {/* ── TEXT ── */}
          {colType === 'text' && (
            <>
              <StyledSelect value={textOp} onChange={(v) => setTextOp(v as TextOperator)}
                options={TEXT_OPERATORS} />
              {!needsNoValue(textOp) && (
                <StyledInput autoFocus value={textValue} onChange={setTextValue}
                  onEnter={handleApply} placeholder="Enter value" />
              )}
            </>
          )}

          {/* ── NUMBER ── */}
          {colType === 'number' && (
            <>
              <StyledSelect value={numOp} onChange={(v) => setNumOp(v as NumberOperator)}
                options={NUMBER_OPERATORS} />
              {!needsNoValue(numOp) && (
                <StyledInput autoFocus type="number" value={numValue} onChange={setNumValue}
                  onEnter={handleApply} placeholder="Enter value" />
              )}
            </>
          )}

          {/* ── DATE ── */}
          {colType === 'date' && (
            <>
              <StyledSelect value={dateOp} onChange={(v) => setDateOp(v as DateOperator)}
                options={DATE_OPERATORS} />
              {dateOpInfo?.hasInput && (
                <input
                  autoFocus
                  type="date"
                  value={dateValue}
                  onChange={(e) => setDateValue(e.target.value)}
                  className="w-full text-[12px] border rounded-lg px-2.5 py-2 bg-white text-[var(--text)] focus:outline-none transition"
                  style={{ borderColor: 'var(--border)' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--link)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,111,255,.1)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
                />
              )}
            </>
          )}

          {/* ── BOOLEAN ── */}
          {colType === 'boolean' && (
            <FilterSelect
              value={boolValue}
              onChange={(e) => setBoolValue(e.target.value as 'true' | 'false' | '')}
              className="w-full text-[12px] border rounded-lg px-2.5 py-2 bg-white text-[var(--text)] focus:outline-none transition"
              style={{ borderColor: 'var(--border)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--link)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,111,255,.1)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
            >
              <option value="">Any</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </FilterSelect>
          )}

          {/* ── CHOICE / STATUS ── */}
          {colType === 'choice' && (
            <div className="max-h-48 overflow-y-auto space-y-0.5 -mx-1 px-1">
              {choiceLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={16} className="animate-spin" style={{ color: 'var(--link)' }} />
                </div>
              ) : choiceOptions.length === 0 ? (
                <p className="text-[12px] text-[var(--muted)] py-3 text-center">No options available</p>
              ) : (
                choiceOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => toggleChoice(opt.value)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-[12px] text-left rounded-lg transition"
                    style={selectedChoices.includes(opt.value)
                      ? { background: 'var(--row-hover)', color: 'var(--link)', border: '1px solid var(--surface-2)' }
                      : { background: 'transparent', color: 'var(--text)' }}
                    onMouseEnter={(e) => { if (!selectedChoices.includes(opt.value)) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                    onMouseLeave={(e) => { if (!selectedChoices.includes(opt.value)) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <span className="w-4 h-4 rounded-sm border flex-shrink-0 flex items-center justify-center transition"
                      style={selectedChoices.includes(opt.value) ? { background: 'var(--link)', borderColor: 'var(--link)' } : { borderColor: 'var(--border)' }}>
                      {selectedChoices.includes(opt.value) && <Check size={10} className="text-white" />}
                    </span>
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          )}

          {/* ── LOOKUP ── */}
          {colType === 'lookup' && (
            <>
              <StyledSelect value={lookupOp} onChange={(v) => {
                setLookupOp(v as LookupOperator);
                setSelectedLookup(null);
                setLookupTextValue('');
                setLookupSearch('');
                setLookupResults([]);
              }} options={LOOKUP_OPERATORS} />

              {!needsNoValue(lookupOp) && (lookupOp === 'eq' || lookupOp === 'neq') && (
                <>
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
                    <input
                      autoFocus
                      type="text"
                      value={lookupSearch}
                      onChange={(e) => setLookupSearch(e.target.value)}
                      placeholder="Search records..."
                      className="w-full text-[12px] border rounded-lg pl-8 pr-2.5 py-2 bg-white placeholder-[var(--muted)] focus:outline-none transition"
                      style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--link)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,111,255,.1)'; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
                    />
                  </div>
                  {selectedLookup && (
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg"
                      style={{ background: 'var(--row-hover)', border: '1px solid var(--surface-2)' }}>
                      <span className="text-[12px] font-medium truncate" style={{ color: 'var(--link)' }}>{selectedLookup.label}</span>
                      <button onClick={() => setSelectedLookup(null)} className="ml-1.5 shrink-0 hover:opacity-70">
                        <X size={12} style={{ color: 'var(--link)' }} />
                      </button>
                    </div>
                  )}
                  <div className="max-h-40 overflow-y-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
                    {lookupLoading ? (
                      <div className="flex items-center justify-center py-3">
                        <Loader2 size={14} className="animate-spin" style={{ color: 'var(--link)' }} />
                      </div>
                    ) : lookupResults.length === 0 ? (
                      <p className="text-[12px] text-[var(--muted)] py-3 text-center">
                        {lookupSearch ? 'No records found' : 'Type to search...'}
                      </p>
                    ) : (
                      lookupResults.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => { setSelectedLookup(r); setLookupSearch(''); }}
                          className="w-full flex items-center gap-2 px-2.5 py-2 text-[12px] text-left transition-colors"
                          style={selectedLookup?.id === r.id
                            ? { background: 'var(--row-hover)', color: 'var(--link)', borderBottom: '1px solid var(--border)' }
                            : { background: 'white', color: 'var(--text)', borderBottom: '1px solid var(--surface-2)' }}
                          onMouseEnter={(e) => { if (selectedLookup?.id !== r.id) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                          onMouseLeave={(e) => { if (selectedLookup?.id !== r.id) (e.currentTarget as HTMLElement).style.background = 'white'; }}
                        >
                          <span className="w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center transition"
                            style={selectedLookup?.id === r.id ? { background: 'var(--link)', borderColor: 'var(--link)' } : { borderColor: 'var(--border)' }}>
                            {selectedLookup?.id === r.id && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                          {r.label}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}

              {!needsNoValue(lookupOp) && lookupOp !== 'eq' && lookupOp !== 'neq' && (
                <StyledInput autoFocus value={lookupTextValue} onChange={setLookupTextValue}
                  onEnter={handleApply} placeholder="Enter value" />
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--surface-2)' }}>
        {/* Hide column button */}
        {onHide && (
          <button
            onClick={() => { onHide(); onClose(); }}
            className="flex items-center gap-1.5 text-[12px] font-medium transition"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; }}
          >
            <EyeOff size={13} />
            Hide
          </button>
        )}
        <div className="flex-1" />
        {currentFilter && (
          <button
            onClick={handleClear}
            className="px-3 py-1.5 text-[12px] font-medium rounded-lg hover:bg-[var(--surface-2)] transition"
            style={{ color: 'var(--text)', border: '1px solid var(--border)' }}
          >
            Clear
          </button>
        )}
        <button
          onClick={handleApply}
          className="px-3 py-1.5 text-[12px] font-semibold text-white rounded-lg transition"
          style={{ background: 'linear-gradient(135deg,var(--link),var(--link))', boxShadow: '0 4px 12px rgba(59,111,255,.25)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.08)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = ''; }}
        >
          Apply
        </button>
      </div>
    </AnchoredPopover>
  );
}

/* ── Styled sub-components (new design) ── */

function StyledSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <FilterSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-[12px] border rounded-lg px-2.5 py-2 bg-white text-[var(--text)] focus:outline-none appearance-none pr-6 transition"
        style={{ borderColor: 'var(--border)' }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--link)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,111,255,.1)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </FilterSelect>
      <svg className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 3.5L5 6.5L8 3.5" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function StyledInput({ value, onChange, onEnter, placeholder, autoFocus, type = 'text' }: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  type?: string;
}) {
  return (
    <input
      autoFocus={autoFocus}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      placeholder={placeholder}
      className="w-full text-[12px] border rounded-lg px-2.5 py-2 bg-white text-[var(--text)] placeholder-[var(--muted)] focus:outline-none transition"
      style={{ borderColor: 'var(--border)' }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--link)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,111,255,.1)'; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = ''; }}
    />
  );
}
