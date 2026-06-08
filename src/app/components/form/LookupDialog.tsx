import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, Search, Loader2, ChevronLeft, ChevronRight, AlertCircle, Database, Link } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { fetchViewColumns, fetchViewsForEntityLogical } from '../../../services/viewService';
import type { ViewColumn, ViewDefinition } from '../../../types/view';
import type { LookupConfig } from '../../../types/form';

interface LookupRecord {
  id: string;
  cells: Record<string, unknown>;
}

interface LookupDialogProps {
  label: string;
  entityLogicalName: string;
  entityTable: string;
  pkColumn: string;
  labelColumn: string;
  lookupConfig?: LookupConfig | null;
  formValues: Record<string, unknown>;
  onSelect: (id: string, label: string) => void;
  onClose: () => void;
}

const PAGE_SIZE = 20;

interface EntityCfg {
  table: string;
  pk: string;
  labelCol: string;
  searchCols: string[];
  fallbackCols: Array<{ physical: string; label: string }>;
}

const ENTITY_CFG: Record<string, EntityCfg> = {
  account: {
    table: 'account',
    pk: 'account_id',
    labelCol: 'account_name',
    searchCols: ['account_name'],
    fallbackCols: [
      { physical: 'account_name', label: 'Account Name' },
      { physical: 'phone', label: 'Phone' },
    ],
  },
  contact: {
    table: 'contact',
    pk: 'contact_id',
    labelCol: 'full_name',
    searchCols: ['full_name', 'email'],
    fallbackCols: [
      { physical: 'full_name', label: 'Full Name' },
      { physical: 'email', label: 'Email' },
      { physical: 'business_phone', label: 'Phone' },
      { physical: 'job_title', label: 'Job Title' },
    ],
  },
  opportunity: {
    table: 'opportunity',
    pk: 'opportunity_id',
    labelCol: 'topic',
    searchCols: ['topic'],
    fallbackCols: [
      { physical: 'topic', label: 'Topic' },
    ],
  },
  lead: {
    table: 'lead',
    pk: 'lead_id',
    labelCol: 'full_name',
    searchCols: ['full_name', 'email'],
    fallbackCols: [
      { physical: 'full_name', label: 'Full Name' },
      { physical: 'email', label: 'Email' },
      { physical: 'company_name', label: 'Company' },
    ],
  },
  crm_user: {
    table: 'crm_user',
    pk: 'user_id',
    labelCol: 'email',
    searchCols: ['email'],
    fallbackCols: [
      { physical: 'email', label: 'Email' },
    ],
  },
  sources: {
    table: 'crm_source',
    pk: 'source_id',
    labelCol: 'name',
    searchCols: ['name'],
    fallbackCols: [
      { physical: 'name', label: 'Name' },
    ],
  },
  crm_source: {
    table: 'crm_source',
    pk: 'source_id',
    labelCol: 'name',
    searchCols: ['name'],
    fallbackCols: [
      { physical: 'name', label: 'Name' },
    ],
  },
  crm_sources: {
    table: 'crm_source',
    pk: 'source_id',
    labelCol: 'name',
    searchCols: ['name'],
    fallbackCols: [
      { physical: 'name', label: 'Name' },
    ],
  },
  campaign: {
    table: 'campaign',
    pk: 'campaign_id',
    labelCol: 'name',
    searchCols: ['name'],
    fallbackCols: [
      { physical: 'name', label: 'Campaign Name' },
      { physical: 'campaign_type', label: 'Type' },
      { physical: 'start_date', label: 'Start Date' },
    ],
  },
  event: {
    table: 'event',
    pk: 'event_id',
    labelCol: 'name',
    searchCols: ['name'],
    fallbackCols: [
      { physical: 'name', label: 'Event Name' },
      { physical: 'event_type', label: 'Type' },
      { physical: 'start_date', label: 'Start Date' },
    ],
  },
};

const DELETED_AT_TABLES = new Set([
  'business_unit', 'country', 'crm_user', 'industry', 'line_of_business',
  'product', 'product_family', 'security_role', 'team',
]);
const NO_SOFT_DELETE_TABLES = new Set(['currency', 'organization']);

const LOGICAL_TO_PHYSICAL: Record<string, string> = {
  statecode: 'state_code',
  statusreason: 'status_reason',
};

const USER_FK_COLUMNS = new Set(['owner_id', 'created_by', 'modified_by']);

export default function LookupDialog({
  label,
  entityLogicalName,
  entityTable,
  pkColumn,
  labelColumn,
  lookupConfig,
  formValues,
  onSelect,
  onClose,
}: LookupDialogProps) {
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<LookupRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [viewCols, setViewCols] = useState<ViewColumn[]>([]);
  const [activeView, setActiveView] = useState<ViewDefinition | null>(null);
  const [loadingView, setLoadingView] = useState(true);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const cfg: EntityCfg = useMemo(() =>
    ENTITY_CFG[entityLogicalName] ?? ENTITY_CFG[entityTable] ?? {
      table: entityTable,
      pk: pkColumn,
      labelCol: labelColumn,
      searchCols: [labelColumn],
      fallbackCols: [{ physical: labelColumn, label }],
    },
    [entityLogicalName, entityTable, pkColumn, labelColumn, label]
  );

  const softDeleteMode: 'is_deleted' | 'deleted_at' | 'is_active' = useMemo(() => {
    if (DELETED_AT_TABLES.has(cfg.table)) return 'deleted_at';
    if (NO_SOFT_DELETE_TABLES.has(cfg.table)) return 'is_active';
    return 'is_deleted';
  }, [cfg.table]);

  // ── Load the configured view (or default) ──────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoadingView(true);
    fetchViewsForEntityLogical(entityLogicalName)
      .then(async (views) => {
        if (cancelled) return;
        let target: ViewDefinition | null = null;
        if (lookupConfig?.default_view_id) {
          target = views.find((v) => v.view_id === lookupConfig.default_view_id) ?? null;
        }
        if (!target) target = views.find((v) => v.is_default) ?? views[0] ?? null;
        setActiveView(target);

        if (target) {
          const cols = await fetchViewColumns(target.view_id).catch(() => []);
          if (!cancelled) setViewCols(cols.filter((c) => !c.is_hidden));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingView(false); });
    return () => { cancelled = true; };
  }, [entityLogicalName, lookupConfig?.default_view_id]);

  // ── Dependent filter ──────────────────────────────────────────────────────
  const filterFkColumn = lookupConfig?.filter_fk_column ?? null;
  const filterSourceFieldName = lookupConfig?.filter_by_field_logical_name ?? null;

  const filterValue = useMemo(() => {
    if (!filterSourceFieldName) return null;
    const direct = formValues[filterSourceFieldName];
    if (direct) return direct as string;
    const asPhysical = filterSourceFieldName.replace(/([a-z])id$/i, '$1_id');
    const via = formValues[asPhysical];
    if (via) return via as string;
    const root = filterSourceFieldName.replace(/id$/i, '').toLowerCase();
    const match = Object.keys(formValues).find(
      (k) => k.toLowerCase().startsWith(root) && k.endsWith('_id') && formValues[k]
    );
    return match ? (formValues[match] as string) : null;
  }, [filterSourceFieldName, formValues]);

  // ── Build display columns ─────────────────────────────────────────────────

  const finalCols = useMemo(() => {
    const base: Array<{ key: string; header: string; isLabel: boolean }> =
      viewCols.length > 0
        ? viewCols
            .filter((c) => c.field_physical_column && c.field_physical_column !== cfg.pk)
            .map((c) => ({
              key: c.field_physical_column!,
              header: c.label_override ?? c.field_display_name ?? c.field_logical_name ?? c.field_physical_column!,
              isLabel: c.field_physical_column === cfg.labelCol,
            }))
        : cfg.fallbackCols.map((c) => ({
            key: c.physical,
            header: c.label,
            isLabel: c.physical === cfg.labelCol,
          }));

    const hasLabel = base.some((c) => c.key === cfg.labelCol);
    return hasLabel
      ? base
      : [{ key: cfg.labelCol, header: label, isLabel: true }, ...base];
  }, [viewCols, cfg.pk, cfg.labelCol, cfg.fallbackCols, label]);

  // ── Stable ref for view-dependent data used in fetch ──────────────────────

  const viewRef = useRef({ activeView, viewCols });
  viewRef.current = { activeView, viewCols };

  // ── Fetch records ─────────────────────────────────────────────────────────

  const fetchRecords = useCallback(async (q: string, pg: number, cols: typeof finalCols) => {
    setLoading(true);
    try {
      const { activeView: av, viewCols: vc } = viewRef.current;
      const physicalCols = [...new Set([cfg.pk, ...cols.map((c) => c.key)])];
      const selectStr = physicalCols.join(', ');

      const buildQueries = (applyViewFilters: boolean) => {
        let cQ = supabase.from(cfg.table).select(cfg.pk, { count: 'exact', head: true });
        let dQ = supabase.from(cfg.table).select(selectStr);

        if (softDeleteMode === 'is_deleted') {
          cQ = (cQ as any).eq('is_deleted', false);
          dQ = (dQ as any).eq('is_deleted', false);
        } else if (softDeleteMode === 'deleted_at') {
          cQ = (cQ as any).is('deleted_at', null);
          dQ = (dQ as any).is('deleted_at', null);
        } else {
          cQ = (cQ as any).eq('is_active', true);
          dQ = (dQ as any).eq('is_active', true);
        }

        if (q.trim()) {
          const filter = cfg.searchCols.map((col) => `${col}.ilike.%${q.trim()}%`).join(',');
          cQ = cQ.or(filter);
          dQ = dQ.or(filter);
        }

        if (filterFkColumn && filterValue) {
          cQ = cQ.eq(filterFkColumn, filterValue);
          dQ = dQ.eq(filterFkColumn, filterValue);
        }

        if (applyViewFilters && av?.filter_json) {
          for (const cond of av.filter_json.conditions ?? []) {
            const physCol = (cond as Record<string, unknown>).field_physical_column as string | undefined;
            const resolvedFromView = vc.find((v) => v.field_logical_name === cond.field_logical_name)?.field_physical_column;
            const col = physCol || resolvedFromView || LOGICAL_TO_PHYSICAL[cond.field_logical_name] || cond.field_logical_name;
            if (!col) continue;
            if (cond.operator === 'eq' && cond.value != null) {
              dQ = dQ.eq(col, cond.value);
              cQ = cQ.eq(col, cond.value);
            } else if (cond.operator === 'is_not_null') {
              dQ = dQ.not(col, 'is', null);
              cQ = cQ.not(col, 'is', null);
            } else if (cond.operator === 'is_null') {
              dQ = dQ.is(col, null);
              cQ = cQ.is(col, null);
            }
          }
        }

        if (applyViewFilters && av?.sort_json?.length) {
          for (const s of av.sort_json) {
            const sortCol = LOGICAL_TO_PHYSICAL[s.field_logical_name] || s.field_logical_name;
            dQ = dQ.order(sortCol, { ascending: s.direction === 'asc' });
          }
        } else {
          dQ = dQ.order(cfg.labelCol);
        }

        dQ = dQ.range(pg * PAGE_SIZE, pg * PAGE_SIZE + PAGE_SIZE - 1);
        return { countQ: cQ, dataQ: dQ };
      };

      let { countQ, dataQ } = buildQueries(true);
      let [countRes, dataRes] = await Promise.all([countQ, dataQ]);

      if (dataRes.error && av?.filter_json) {
        ({ countQ, dataQ } = buildQueries(false));
        [countRes, dataRes] = await Promise.all([countQ, dataQ]);
      }

      setTotal(countRes.count ?? 0);
      const rows = (dataRes.data ?? []).map((row: Record<string, unknown>) => ({
        id: row[cfg.pk] as string,
        cells: row,
      }));
      setRecords(rows);

      const userCols = cols.filter((c) => USER_FK_COLUMNS.has(c.key));
      if (userCols.length > 0) {
        const ids = new Set<string>();
        for (const r of rows) {
          for (const c of userCols) {
            const v = r.cells[c.key];
            if (typeof v === 'string' && v.length > 10) ids.add(v);
          }
        }
        if (ids.size > 0) {
          const { data: users } = await supabase.rpc('fn_get_user_display_map', { p_user_ids: [...ids] });
          if (users) {
            const map: Record<string, string> = {};
            for (const u of (users as { user_id: string; display_name: string }[])) map[u.user_id] = u.display_name;
            setUserMap((prev) => ({ ...prev, ...map }));
          }
        }
      }
    } catch {
      setRecords([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [cfg.pk, cfg.table, cfg.searchCols, cfg.labelCol, softDeleteMode, filterFkColumn, filterValue]);

  // ── Dependent filter gate ─────────────────────────────────────────────────
  // If a filter is configured (e.g. contact filtered by account) but the source
  // field has no value yet, block the search and prompt the user to select first.
  const filterRequired = !!(filterFkColumn && filterSourceFieldName);
  const filterMissing = filterRequired && !filterValue;

  // ── Trigger fetch once view is ready, then on query/page changes ──────────

  const viewReady = !loadingView;
  const viewId = activeView?.view_id ?? null;

  useEffect(() => {
    if (!viewReady || filterMissing) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const cols = finalCols;
    debounceRef.current = setTimeout(() => fetchRecords(query, page, cols), query ? 180 : 0);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, page, viewReady, viewId, fetchRecords, finalCols, filterMissing]);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 60);
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <Database size={16} className="text-blue-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-800">Select {label}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {activeView && (
                <span className="text-[11px] text-slate-400">{activeView.name}</span>
              )}
              {filterValue && filterSourceFieldName && (
                <span className="text-[11px] text-blue-500 font-medium">
                  · Filtered by {filterSourceFieldName.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0); }}
              placeholder={filterMissing ? '' : `Search ${label.toLowerCase()}...`}
              disabled={filterMissing}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-slate-50 text-slate-700 placeholder-slate-400 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {loading && (
              <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin pointer-events-none" />
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto min-h-0">
          {filterMissing ? (
            <div className="flex flex-col items-center justify-center py-14 text-center px-6">
              <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center mb-3">
                <Link size={20} className="text-amber-500" />
              </div>
              <p className="text-sm font-medium text-slate-700">
                Select {filterSourceFieldName?.replace(/_id$/, '').replace(/_/g, ' ') ?? 'a parent record'} first
              </p>
              <p className="text-[12px] text-slate-400 mt-1 leading-relaxed max-w-xs">
                {label} records are filtered by their associated {filterSourceFieldName?.replace(/_id$/, '').replace(/_/g, ' ') ?? 'record'}. Please choose one on the form before selecting a {label.toLowerCase()}.
              </p>
            </div>
          ) : loadingView ? (
            <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : records.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle size={20} className="text-slate-300 mb-2" />
              <p className="text-sm text-slate-400">
                {query ? `No results for "${query}"` : 'No records found'}
              </p>
              {filterValue && !query && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Only showing records linked to the selected {filterSourceFieldName?.replace(/_/g, ' ')}
                </p>
              )}
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  {finalCols.map((col) => (
                    <th
                      key={col.key}
                      className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 whitespace-nowrap"
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => (
                  <tr
                    key={rec.id}
                    onClick={() => {
                      const lbl = (rec.cells[cfg.labelCol] as string | null) ?? rec.id;
                      onSelect(rec.id, lbl);
                    }}
                    className="cursor-pointer hover:bg-[#ebf1fa] transition-colors duration-100 group border-b border-slate-100 last:border-0"
                  >
                    {finalCols.map((col) => {
                      let cellVal = rec.cells[col.key];
                      if (USER_FK_COLUMNS.has(col.key) && typeof cellVal === 'string' && userMap[cellVal]) {
                        cellVal = userMap[cellVal];
                      }
                      return (
                        <td
                          key={col.key}
                          className={`px-4 py-2.5 truncate max-w-[200px] ${
                            col.isLabel
                              ? 'text-blue-600 font-medium group-hover:text-blue-700'
                              : 'text-slate-600'
                          }`}
                        >
                          {fmt(cellVal)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 shrink-0">
          <span className="text-[11px] text-slate-400">
            {filterMissing ? '\u2014' : loading ? 'Loading...' : total > 0 ? `${from}\u2013${to} of ${total} records` : '0 records'}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="text-[11px] text-slate-500 px-2">{page + 1} / {totalPages}</span>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function fmt(val: unknown): string {
  if (val == null) return '\u2014';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(val)) {
      try { return new Date(val).toLocaleDateString(); } catch { return val; }
    }
    return val || '\u2014';
  }
  if (typeof val === 'number') return val.toLocaleString();
  return String(val);
}
