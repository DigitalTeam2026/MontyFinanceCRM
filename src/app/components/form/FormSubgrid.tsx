import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Loader2, ExternalLink, RefreshCw, AlertCircle,
  ChevronUp, ChevronDown, ChevronsUpDown,
  ChevronLeft, ChevronRight, MoreHorizontal,
  LayoutGrid, Link2, Trash2,
} from 'lucide-react';
import { buildRecordUrl } from '../../../App';
import { useToast, toFriendlyError } from '../../context/ToastContext';
import {
  fetchSubgridRowsPaged,
  fetchSubgridRowsPagedByRelDef,
  createSubgridRecord,
  createSubgridRecordByRelDef,
  deleteSubgridRecord,
  deleteSubgridRecordByRelDef,
  resolveRelationshipConfig,
  fetchViewColumnsForSubgrid,
  fetchDefaultViewForEntity,
  resolveSubgridLookups,
  SUBGRID_CONFIGS,
  type SubgridRow,
  type SubgridColumn,
  type SubgridSort,
  type SubgridFilter,
  type ResolvedRelationshipConfig,
  type ViewDrivenColumn,
} from '../../services/subgridService';
import SubgridQuickCreatePanel from './SubgridQuickCreatePanel';

const DEFAULT_PAGE_SIZE = 5;

// ─── Field type → display logic ──────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:      'bg-emerald-50 text-emerald-700 border border-emerald-200',
  inactive:    'bg-slate-100 text-slate-500 border border-slate-200',
  new:         'bg-blue-50 text-blue-700 border border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border border-amber-200',
  waiting:     'bg-orange-50 text-orange-700 border border-orange-200',
  resolved:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
  closed:      'bg-slate-100 text-slate-500 border border-slate-200',
  won:         'bg-emerald-50 text-emerald-700 border border-emerald-200',
  lost:        'bg-red-50 text-red-600 border border-red-200',
  qualify:     'bg-blue-50 text-blue-700 border border-blue-200',
  develop:     'bg-cyan-50 text-cyan-700 border border-cyan-200',
  propose:     'bg-teal-50 text-teal-700 border border-teal-200',
  close:       'bg-amber-50 text-amber-700 border border-amber-200',
  disqualified:'bg-red-50 text-red-600 border border-red-200',
  qualified:   'bg-emerald-50 text-emerald-700 border border-emerald-200',
};

type ColType = 'text' | 'currency' | 'date' | 'datetime' | 'badge' | 'boolean' | 'number' | 'decimal';

function resolveColType(fieldType: string | null | undefined): ColType {
  if (!fieldType) return 'text';
  switch (fieldType) {
    case 'currency':    return 'currency';
    case 'date':        return 'date';
    case 'datetime':    return 'datetime';
    case 'boolean':     return 'boolean';
    case 'number':
    case 'decimal':     return 'number';
    case 'choice':
    case 'option_set':
    case 'multi_choice':
    case 'multi_option_set': return 'badge';
    default:            return 'text';
  }
}

function CellValue({
  value,
  colType,
  currencyCode,
  isFirst,
  href,
  onOpen,
}: {
  value: unknown;
  colType: ColType;
  currencyCode?: string | null;
  isFirst?: boolean;
  href?: string;
  onOpen?: () => void;
}) {
  if (value == null || value === '') {
    return <span className="text-slate-300">—</span>;
  }
  const str = String(value);

  let content: React.ReactNode;
  switch (colType) {
    case 'currency': {
      const num = parseFloat(str);
      content = (
        <span className="font-medium tabular-nums text-slate-800">
          {isNaN(num)
            ? str
            : new Intl.NumberFormat(undefined, {
                style: 'currency',
                currency: currencyCode ?? 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              }).format(num)}
        </span>
      );
      break;
    }
    case 'date': {
      const d = new Date(str);
      content = (
        <span className="text-slate-600 tabular-nums">
          {isNaN(d.getTime())
            ? str
            : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      );
      break;
    }
    case 'datetime': {
      const d = new Date(str);
      content = (
        <span className="text-slate-600 tabular-nums text-[11px]">
          {isNaN(d.getTime())
            ? str
            : d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      );
      break;
    }
    case 'boolean':
      content = (
        <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${value ? 'text-emerald-600' : 'text-slate-400'}`}>
          <span className={`w-2 h-2 rounded-full ${value ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          {value ? 'Yes' : 'No'}
        </span>
      );
      break;
    case 'badge': {
      const colorClass = STATUS_COLORS[str.toLowerCase()] ?? 'bg-slate-100 text-slate-600 border border-slate-200';
      content = (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${colorClass}`}>
          {str.replace(/_/g, ' ')}
        </span>
      );
      break;
    }
    default:
      content = <span className="text-slate-700">{str}</span>;
  }

  if (isFirst && (href || onOpen)) {
    return (
      <a
        href={href}
        onClick={onOpen ? (e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); onOpen(); } } : undefined}
        className="text-blue-600 hover:text-blue-800 hover:underline font-medium cursor-pointer"
      >
        {content}
      </a>
    );
  }

  return <>{content}</>;
}

function SortIcon({ column, sort }: { column: string; sort: SubgridSort | null }) {
  if (!sort || sort.column !== column)
    return <ChevronsUpDown size={10} className="text-slate-300 ml-0.5 flex-shrink-0 opacity-0 group-hover/th:opacity-100 transition-opacity" />;
  return sort.direction === 'asc'
    ? <ChevronUp size={10} className="text-blue-500 ml-0.5 flex-shrink-0" />
    : <ChevronDown size={10} className="text-blue-500 ml-0.5 flex-shrink-0" />;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface FormSubgridProps {
  configKey: string;
  relationshipDefinitionId?: string | null;
  viewId?: string | null;
  quickCreateFormId?: string | null;
  parentId: string;
  parentLabel?: string;
  userId?: string;
  rowsToShow?: number;
  allowCreate?: boolean;
  allowDelete?: boolean;
  /** Provide to enable permission-aware create/delete based on target entity */
  getEntityPrivilege?: (entityName: string) => { can_create: boolean; can_delete: boolean };
  displayLabel?: string;
  onOpenRecord?: (entitySlug: string, recordId: string) => void;
  onViewAll?: (entitySlug: string, fkColumn: string, parentId: string) => void;
  refreshTrigger?: number;
}

type ColDef = {
  key: string;
  label: string;
  type: ColType;
  sortable: boolean;
};

function viewDrivenToColDef(vc: ViewDrivenColumn): ColDef {
  return {
    key:      vc.key,
    label:    vc.label,
    type:     resolveColType(vc.fieldType),
    sortable: vc.sortable,
  };
}

function subgridColToColDef(sc: SubgridColumn): ColDef {
  return {
    key:      sc.key,
    label:    sc.label,
    type:     (sc.type ?? 'text') as ColType,
    sortable: sc.sortable ?? false,
  };
}

export default function FormSubgrid({
  configKey,
  relationshipDefinitionId,
  viewId,
  quickCreateFormId,
  parentId,
  parentLabel,
  userId,
  rowsToShow = DEFAULT_PAGE_SIZE,
  allowCreate = true,
  allowDelete = false,
  getEntityPrivilege,
  displayLabel,
  onOpenRecord,
  onViewAll,
  refreshTrigger,
}: FormSubgridProps) {
  const staticConf = SUBGRID_CONFIGS[configKey];
  const { showError } = useToast();

  const usingRelDef = !staticConf && !!relationshipDefinitionId;

  // Resolved relationship config (metadata-driven path)
  const [relConf, setRelConf] = useState<ResolvedRelationshipConfig | null>(null);
  const [relConfLoading, setRelConfLoading] = useState(usingRelDef);

  // View-driven columns
  const [viewCols, setViewCols] = useState<ColDef[] | null>(null);
  const [rawViewCols, setRawViewCols] = useState<ViewDrivenColumn[]>([]);
  const [viewLoading, setViewLoading] = useState(!!viewId);

  useEffect(() => {
    if (!usingRelDef || !relationshipDefinitionId) return;
    setRelConfLoading(true);
    resolveRelationshipConfig(relationshipDefinitionId)
      .then((rc) => { setRelConf(rc); setRelConfLoading(false); })
      .catch(() => setRelConfLoading(false));
  }, [relationshipDefinitionId, usingRelDef]);

  useEffect(() => {
    if (!viewId) { setViewCols(null); setRawViewCols([]); setViewLoading(false); return; }
    setViewLoading(true);
    fetchViewColumnsForSubgrid(viewId)
      .then((cols) => {
        setRawViewCols(cols);
        setViewCols(cols.length > 0 ? cols.map(viewDrivenToColDef) : null);
        setViewLoading(false);
      })
      .catch(() => { setViewCols(null); setRawViewCols([]); setViewLoading(false); });
  }, [viewId]);

  // Auto-load default view columns when no viewId but have relConf
  const [autoViewLoaded, setAutoViewLoaded] = useState(false);
  useEffect(() => {
    if (viewId || autoViewLoaded || !relConf || viewCols !== null) return;
    setAutoViewLoaded(true);
    fetchDefaultViewForEntity(relConf.targetEntityLogical)
      .then(async (dv) => {
        if (!dv) return;
        const cols = await fetchViewColumnsForSubgrid(dv.view_id);
        if (cols.length > 0) {
          setRawViewCols(cols);
          setViewCols(cols.map(viewDrivenToColDef));
        }
      })
      .catch(() => {});
  }, [viewId, relConf, viewCols, autoViewLoaded]);

  // Data
  const [rows, setRows] = useState<SubgridRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sort, setSort] = useState<SubgridSort | null>(null);
  const [filters] = useState<SubgridFilter[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = rowsToShow;

  const [quickCreating, setQuickCreating] = useState(false);
  const [, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const hasQuickCreateForm = !!quickCreateFormId;
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Derive active columns
  const staticCols: ColDef[] | null = staticConf
    ? staticConf.columns.map(subgridColToColDef)
    : null;
  const activeCols: ColDef[] = viewCols ?? staticCols ?? [
    { key: 'name', label: 'Name', type: 'text', sortable: true },
    { key: 'created_at', label: 'Created', type: 'date', sortable: true },
  ];

  const entitySlug  = staticConf?.entitySlug ?? relConf?.targetEntityLogical ?? configKey;
  const pkField     = staticConf?.pk ?? relConf?.targetEntityPk ?? 'id';
  const fkColumn    = staticConf?.fkColumn ?? relConf?.fkColumn ?? '';
  const entityName  = relConf?.targetEntityLogical ?? staticConf?.table ?? configKey;

  // Resolve effective create/delete permissions from the target entity's privilege
  const targetPriv = getEntityPrivilege ? getEntityPrivilege(entityName) : null;
  const effectiveAllowCreate = targetPriv ? targetPriv.can_create && allowCreate : allowCreate;
  const effectiveAllowDelete = targetPriv ? targetPriv.can_delete && allowDelete : allowDelete;

  const resolvedLabel = displayLabel
    ?? staticConf?.displayName
    ?? relConf?.displayName
    ?? configKey;

  const totalPages = Math.ceil(totalCount / pageSize);

  const load = useCallback(async () => {
    if (!parentId) { setLoading(false); return; }

    if (usingRelDef) {
      if (!relConf) return;
      setLoading(true); setError(null);
      try {
        const result = await fetchSubgridRowsPagedByRelDef(relConf.relationshipDefinitionId, parentId, {
          sort: sort ?? undefined, filters, page, pageSize,
        });
        const resolved = rawViewCols.length > 0
          ? await resolveSubgridLookups(result.rows, rawViewCols)
          : result.rows;
        setRows(resolved); setTotalCount(result.totalCount);
      } catch {
        setError('Unable to load records.');
      } finally { setLoading(false); }
      return;
    }

    if (!staticConf) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const result = await fetchSubgridRowsPaged(configKey, parentId, {
        sort: sort ?? undefined, filters, page, pageSize,
      });
      const resolved = rawViewCols.length > 0
        ? await resolveSubgridLookups(result.rows, rawViewCols)
        : result.rows;
      setRows(resolved); setTotalCount(result.totalCount);
    } catch {
      setError('Unable to load records.');
    } finally { setLoading(false); }
  }, [configKey, parentId, staticConf, relConf, usingRelDef, sort, filters, page, pageSize, refreshTrigger, rawViewCols]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [sort, filters]);

  const handleSort = (key: string) => {
    const col = activeCols.find((c) => c.key === key);
    if (!col?.sortable) return;
    setSort((prev) => {
      if (!prev || prev.column !== key) return { column: key, direction: 'asc' };
      if (prev.direction === 'asc') return { column: key, direction: 'desc' };
      return null;
    });
  };

  const handleQuickCreate = async (values: Record<string, unknown>, andNew = false) => {
    if (!userId) return;
    setSaving(true);
    try {
      if (usingRelDef && relConf) {
        await createSubgridRecordByRelDef(relConf.relationshipDefinitionId, parentId, values, userId);
      } else {
        await createSubgridRecord(configKey, parentId, values, userId);
      }
      if (andNew) {
        // Keep panel open but signal a reset via a key change (handled in panel)
        setQuickCreating(false);
        setTimeout(() => setQuickCreating(true), 0);
      } else {
        setQuickCreating(false);
      }
      await load();
    } catch (e) {
      showError(toFriendlyError(e, 'Unable to create the record.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (recordId: string) => {
    if (!userId) return;
    setDeletingId(recordId);
    try {
      if (usingRelDef && relConf) {
        await deleteSubgridRecordByRelDef(relConf.relationshipDefinitionId, recordId);
      } else {
        await deleteSubgridRecord(configKey, recordId);
      }
      setConfirmDeleteId(null);
      await load();
    } catch (e) {
      showError(toFriendlyError(e, 'Unable to delete the record.'));
    } finally {
      setDeletingId(null);
    }
  };

  // Loading skeleton
  if ((usingRelDef && relConfLoading) || viewLoading) {
    return (
      <SubgridShell label={resolvedLabel} loading>
        <div className="flex items-center justify-center py-10">
          <Loader2 size={16} className="animate-spin text-slate-300" />
        </div>
      </SubgridShell>
    );
  }

  if (!staticConf && !relConf) return null;

  return (
    <>
    <SubgridShell
      label={resolvedLabel}
      totalCount={totalCount}
      loading={loading}
      entitySlug={entitySlug}
      fkColumn={fkColumn}
      parentId={parentId}
      allowCreate={effectiveAllowCreate && !!userId}
      onNew={() => setQuickCreating(true)}
      onRefresh={load}
      onViewAll={onViewAll ? () => onViewAll(entitySlug, fkColumn, parentId) : undefined}
      moreMenuOpen={moreMenuOpen}
      onMoreMenu={() => setMoreMenuOpen((v) => !v)}
      moreMenuRef={moreMenuRef}
    >
      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-2 px-4 py-4 text-[12px] text-red-500 bg-red-50 border-b border-red-100">
          <AlertCircle size={13} className="shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-[11px] text-red-600 hover:text-red-800 underline font-medium">Retry</button>
        </div>
      )}

      {/* Loading shimmer */}
      {loading && (
        <div className="divide-y divide-slate-50">
          {Array.from({ length: Math.min(pageSize, 3) }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-3 bg-slate-100 rounded animate-pulse flex-1" style={{ maxWidth: `${40 + (i % 3) * 20}%` }} />
              <div className="h-3 bg-slate-100 rounded animate-pulse w-16" />
              <div className="h-3 bg-slate-100 rounded animate-pulse w-12" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && rows.length === 0 && !quickCreating && (
        <div className="flex flex-col items-center justify-center py-10 gap-2.5">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
            <LayoutGrid size={18} className="text-slate-300" />
          </div>
          <div className="text-center">
            <p className="text-[12px] font-medium text-slate-500">No {resolvedLabel.toLowerCase()}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Related records will appear here</p>
          </div>
          {effectiveAllowCreate && userId && (
            <button
              onClick={() => setQuickCreating(true)}
              className="flex items-center gap-1.5 mt-1 px-3 py-1.5 text-[11px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition"
            >
              <Plus size={11} />
              New {resolvedLabel.replace(/s$/, '')}
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[400px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {activeCols.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => col.sortable && handleSort(col.key)}
                    className={`group/th px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 whitespace-nowrap select-none ${col.sortable ? 'cursor-pointer hover:text-slate-700 hover:bg-slate-100/80' : ''}`}
                  >
                    <span className="flex items-center gap-0.5">
                      {col.label}
                      {col.sortable && <SortIcon column={col.key} sort={sort} />}
                    </span>
                  </th>
                ))}
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row) => {
                const rowId = String(row[pkField]);
                const href = buildRecordUrl(entitySlug, rowId);
                const currencyCode = row.currency_code as string | null | undefined;
                const isDeleting = deletingId === rowId;
                const isConfirming = confirmDeleteId === rowId;
                return (
                  <tr key={rowId} className={`hover:bg-[#ebf1fa] transition-colors duration-100 group cursor-pointer ${isDeleting ? 'opacity-40' : ''}`}>
                    {activeCols.map((col, ci) => (
                      <td key={col.key} className="px-4 py-2.5 text-[12px] whitespace-nowrap">
                        <CellValue
                          value={row[col.key]}
                          colType={col.type}
                          currencyCode={currencyCode}
                          isFirst={ci === 0}
                          href={ci === 0 ? href : undefined}
                          onOpen={ci === 0 && onOpenRecord ? () => onOpenRecord(entitySlug, rowId) : undefined}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {onOpenRecord && (
                          <button
                            onClick={() => onOpenRecord(entitySlug, rowId)}
                            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                            title="Open record"
                          >
                            <ExternalLink size={11} />
                          </button>
                        )}
                        {effectiveAllowDelete && userId && (
                          isConfirming ? (
                            <span className="flex items-center gap-1 ml-1">
                              <button
                                onClick={() => handleDelete(rowId)}
                                disabled={isDeleting}
                                className="px-2 py-0.5 rounded text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 transition disabled:opacity-50"
                              >
                                {isDeleting ? <Loader2 size={9} className="animate-spin" /> : 'Delete'}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-0.5 rounded text-[10px] font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 transition"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(rowId)}
                              disabled={isDeleting}
                              className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                              title="Delete record"
                            >
                              <Trash2 size={11} />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50/60">
          <span className="text-[11px] text-slate-400 tabular-nums">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount}
          </span>
          <div className="flex items-center gap-1">
            <PagBtn disabled={page <= 1} onClick={() => setPage((p) => p - 1)} title="Previous">
              <ChevronLeft size={11} />
            </PagBtn>
            {buildPageNumbers(page, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={`ell-${i}`} className="text-[10px] text-slate-300 px-0.5">…</span>
              ) : (
                <PagBtn key={p} active={page === p} onClick={() => setPage(p as number)} title={`Page ${p}`}>
                  {p}
                </PagBtn>
              )
            )}
            <PagBtn disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} title="Next">
              <ChevronRight size={11} />
            </PagBtn>
          </div>
        </div>
      )}
    </SubgridShell>

      {/* D365-style Quick Create panel (renders as fixed right drawer) */}
      {quickCreating && hasQuickCreateForm && quickCreateFormId && userId && effectiveAllowCreate && (
        <SubgridQuickCreatePanel
          title={resolvedLabel}
          quickCreateFormId={quickCreateFormId}
          relatedEntityName={entityName}
          fkColumn={fkColumn}
          parentId={parentId}
          parentLabel={parentLabel}
          onSave={(values) => handleQuickCreate(values, false)}
          onSaveAndNew={(values) => handleQuickCreate(values, true)}
          onClose={() => setQuickCreating(false)}
        />
      )}
    </>
  );
}

// ─── Shell / chrome ───────────────────────────────────────────────────────────

interface SubgridShellProps {
  label: string;
  totalCount?: number;
  loading?: boolean;
  entitySlug?: string;
  fkColumn?: string;
  parentId?: string;
  allowCreate?: boolean;
  onNew?: () => void;
  onRefresh?: () => void;
  onViewAll?: () => void;
  moreMenuOpen?: boolean;
  onMoreMenu?: () => void;
  moreMenuRef?: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
}

function SubgridShell({
  label, totalCount, loading, allowCreate, onNew, onRefresh, onViewAll,
  moreMenuOpen, onMoreMenu, moreMenuRef, children,
}: SubgridShellProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
      {/* D365-style header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-100">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center shrink-0">
            <Link2 size={12} className="text-blue-600" />
          </div>
          <span className="text-[13px] font-semibold text-slate-800 truncate">{label}</span>
          {!loading && totalCount !== undefined && (
            <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full tabular-nums">
              {totalCount}
            </span>
          )}
        </div>

        {/* Command bar */}
        <div className="flex items-center gap-1 shrink-0">
          {allowCreate && onNew && (
            <button
              onClick={onNew}
              className="flex items-center gap-1 h-7 px-2.5 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition"
            >
              <Plus size={11} />
              New
            </button>
          )}

          <button
            onClick={onRefresh}
            disabled={loading}
            className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition"
            title="Refresh"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>

          {onViewAll && (
            <button
              onClick={onViewAll}
              className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition"
              title="View all records"
            >
              <ExternalLink size={11} />
            </button>
          )}

          {onMoreMenu && (
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={onMoreMenu}
                className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition"
              >
                <MoreHorizontal size={13} />
              </button>
              {moreMenuOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[140px]">
                  {onViewAll && (
                    <button
                      onClick={() => { onViewAll(); if (onMoreMenu) onMoreMenu(); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50 transition text-left"
                    >
                      <ExternalLink size={12} className="text-slate-400" />
                      View all
                    </button>
                  )}
                  {onRefresh && (
                    <button
                      onClick={() => { if (onRefresh) onRefresh(); if (onMoreMenu) onMoreMenu(); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50 transition text-left"
                    >
                      <RefreshCw size={12} className="text-slate-400" />
                      Refresh
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PagBtn({
  children, onClick, disabled, active, title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`min-w-[24px] h-6 px-1 rounded text-[11px] font-medium transition disabled:opacity-30 disabled:cursor-not-allowed ${
        active
          ? 'bg-blue-600 text-white'
          : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function buildPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [];
  const add = (n: number) => { if (!pages.includes(n)) pages.push(n); };
  add(1);
  if (current > 3) pages.push('…');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) add(p);
  if (current < total - 2) pages.push('…');
  add(total);
  return pages;
}
