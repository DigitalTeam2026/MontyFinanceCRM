import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  ChevronRight, RefreshCw, Search, Trash2, RotateCcw, MoreVertical,
  Eye, ChevronLeft, ChevronRight as PageRight, ChevronsLeft, ChevronsRight,
  ArrowUp, ArrowDown, X, AlertTriangle,
} from 'lucide-react';
import type { EntityDefinition } from '../../types/entity';
import FilterSelect from '../../app/components/FilterSelect';
import AnchoredPopover from '../../app/components/overlay/AnchoredPopover';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  getSoftDeleteMeta, fetchDeletedRecords, countDeletedRecords, restoreRecords,
  purgeRecords, purgeRecordsCascade, fetchDependents, resolveUserNames,
  fetchDeletedByOptions, resolvePrimaryKey,
  type SoftDeleteMeta, type DeletedDatePreset, type DependentGroup,
} from './services/recycleBinService';

interface EntityRecycleBinPageProps {
  entity: EntityDefinition;
  onBack: () => void;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];
type SortDir = 'asc' | 'desc';

export default function EntityRecycleBinPage({ entity, onBack }: EntityRecycleBinPageProps) {
  const table = entity.physical_table_name;
  const pk = resolvePrimaryKey(entity);
  const nameCol = entity.primary_field_name || null;

  const [meta, setMeta] = useState<SoftDeleteMeta | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  const [deletedByOptions, setDeletedByOptions] = useState<{ id: string; name: string }[]>([]);

  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [datePreset, setDatePreset] = useState<DeletedDatePreset>('all');
  const [deletedByUserId, setDeletedByUserId] = useState<string>('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [viewRecord, setViewRecord] = useState<Record<string, unknown> | null>(null);
  // Permanent-delete confirmation target: a set of ids (single row or bulk).
  const [purgeTarget, setPurgeTarget] = useState<string[] | null>(null);
  // When the target has FK dependents, a second confirmation listing them.
  const [cascade, setCascade] = useState<{ ids: string[]; deps: DependentGroup[] } | null>(null);
  const [checkingDeps, setCheckingDeps] = useState(false);
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);

  // Resolve soft-delete capability + the deleted-by filter options once per table.
  useEffect(() => {
    let cancelled = false;
    getSoftDeleteMeta(table).then((m) => {
      if (cancelled) return;
      setMeta(m);
      fetchDeletedByOptions(table, m).then((opts) => { if (!cancelled) setDeletedByOptions(opts); });
    });
    return () => { cancelled = true; };
  }, [table]);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (!meta) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDeletedRecords({
        table, pk, nameCol, meta, page, pageSize,
        search, sortCol, sortDir, datePreset,
        deletedByUserId: deletedByUserId || null,
      });
      setRows(res.rows);
      setTotal(res.total);
      // Resolve owner + deleted-by ids to display names.
      const ids: string[] = [];
      for (const r of res.rows) {
        if (meta.hasOwnerId && r.owner_id) ids.push(String(r.owner_id));
        if (meta.deletedByCol && r[meta.deletedByCol]) ids.push(String(r[meta.deletedByCol]));
      }
      setUserNames(await resolveUserNames(ids));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deleted records');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [meta, table, pk, nameCol, page, pageSize, search, sortCol, sortDir, datePreset, deletedByUserId]);

  useEffect(() => { load(); }, [load]);

  // Shift+Delete opens the permanent-delete confirmation for the current selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'Delete' && selected.size > 0) {
        e.preventDefault();
        setPurgeTarget([...selected]);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageIds = useMemo(() => rows.map((r) => String(r[pk] ?? '')), [rows, pk]);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggleSort = (col: string) => {
    if (sortCol === col) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); }
    else { setSortCol(col); setSortDir('asc'); }
    setPage(0);
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (pageIds.every((id) => prev.has(id))) {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...pageIds]);
    });
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const doRestore = async (ids: string[]) => {
    if (!meta || ids.length === 0) return;
    setWorking(true);
    setError(null);
    try {
      await restoreRecords(table, pk, ids, meta);
      setSelected((prev) => { const n = new Set(prev); ids.forEach((i) => n.delete(i)); return n; });
      setMenuFor(null);
      setToast(ids.length === 1 ? 'Record restored.' : `${ids.length} records restored.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setWorking(false);
    }
  };

  const finishPurge = (ids: string[], removed: number, cascaded: boolean) => {
    setSelected((prev) => { const n = new Set(prev); ids.forEach((i) => n.delete(i)); return n; });
    setPurgeTarget(null);
    setCascade(null);
    setMenuFor(null);
    const base = ids.length === 1 ? 'Record permanently deleted.' : `${ids.length} records permanently deleted.`;
    setToast(cascaded ? `${base} (${removed} rows removed incl. related records.)` : base);
  };

  // First confirmation accepted → check for FK dependents. If any, escalate to the
  // cascade dialog; otherwise purge directly.
  const doPurge = async () => {
    if (!meta || !purgeTarget) return;
    const ids = purgeTarget;
    setCheckingDeps(true);
    setError(null);
    try {
      const deps = await fetchDependents(table, ids);
      if (deps.length > 0) {
        setPurgeTarget(null);
        setCascade({ ids, deps });
        return;
      }
      const removed = await purgeRecords(table, pk, ids, meta);
      finishPurge(ids, removed, false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Permanent delete failed');
    } finally {
      setCheckingDeps(false);
    }
  };

  // Cascade confirmation accepted → delete dependents + the records.
  const doCascadePurge = async () => {
    if (!cascade) return;
    const { ids } = cascade;
    setWorking(true);
    setError(null);
    try {
      const removed = await purgeRecordsCascade(table, pk, ids);
      finishPurge(ids, removed, true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cascade delete failed');
    } finally {
      setWorking(false);
    }
  };

  const recordName = (r: Record<string, unknown>): string => {
    if (nameCol && r[nameCol] != null && r[nameCol] !== '') return String(r[nameCol]);
    return '(no name)';
  };
  const userName = (id: unknown): string => {
    if (!id) return '—';
    return userNames.get(String(id)) ?? String(id);
  };
  const statusLabel = (r: Record<string, unknown>): { text: string; tone: 'green' | 'slate' } => {
    if (!meta?.statusCol) return { text: '—', tone: 'slate' };
    const v = r[meta.statusCol];
    if (v === 0 || v === '0') return { text: 'Active', tone: 'green' };
    if (v === 1 || v === '1') return { text: 'Inactive', tone: 'slate' };
    return { text: v == null ? '—' : String(v), tone: 'slate' };
  };
  const deletedOn = (r: Record<string, unknown>): string => {
    if (!meta?.deletedAtCol) return '—';
    const v = r[meta.deletedAtCol];
    if (!v) return '—';
    try {
      return new Date(String(v)).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return String(v); }
  };

  const SortHead = ({ col, label, className = '' }: { col: string; label: string; className?: string }) => (
    <button
      onClick={() => toggleSort(col)}
      className={`flex items-center gap-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-700 ${className}`}
    >
      {label}
      {sortCol === col && (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </button>
  );

  // Soft-delete unsupported → render an explanatory empty state.
  if (meta && !meta.supported) {
    return (
      <div className="flex-1 flex flex-col min-h-0" style={{ background: 'var(--app-bg)' }}>
        <Breadcrumb entity={entity} onBack={onBack} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Trash2 size={28} className="mx-auto text-slate-300" />
            <p className="mt-3 text-[13px] font-semibold text-slate-600">Soft delete is not enabled for this table</p>
            <p className="mt-1 text-[12px] text-slate-400">Records in this table are deleted permanently and cannot be recovered.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: 'var(--app-bg)' }}>
      <Breadcrumb entity={entity} onBack={onBack} />

      {/* Title + command bar */}
      <div className="bg-white border-b border-slate-100 px-5 py-2.5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-50 ring-1 ring-red-100 flex items-center justify-center shrink-0">
            <Trash2 size={15} className="text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14px] font-semibold text-slate-800">{entity.display_name} Recycle Bin</h2>
            <p className="text-[11px] text-slate-400">
              {loading ? 'Loading…' : `${total} deleted record${total === 1 ? '' : 's'}`}
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-slate-600 rounded hover:bg-slate-100 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name…"
              className="pl-8 pr-3 py-1.5 text-[12px] border border-slate-200 rounded w-56 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <FilterSelect
            value={datePreset}
            onChange={(e) => { setDatePreset(e.target.value as DeletedDatePreset); setPage(0); }}
            className="text-[12px] border border-slate-200 rounded px-2 py-1.5 w-40"
          >
            <option value="all">Any delete date</option>
            <option value="today">Deleted today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </FilterSelect>
          {meta?.deletedByCol && (
            <FilterSelect
              value={deletedByUserId}
              onChange={(e) => { setDeletedByUserId(e.target.value); setPage(0); }}
              className="text-[12px] border border-slate-200 rounded px-2 py-1.5 w-48"
              placeholder="Any deleter"
            >
              <option value="">Any deleter</option>
              {deletedByOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </FilterSelect>
          )}
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="bg-blue-50 border-b border-blue-100 px-5 py-2 flex items-center gap-3 shrink-0">
          <span className="text-[12px] font-medium text-blue-800">{selected.size} selected</span>
          <button
            onClick={() => doRestore([...selected])}
            disabled={working}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-emerald-700 bg-white border border-emerald-200 rounded hover:bg-emerald-50 transition-colors disabled:opacity-50"
          >
            <RotateCcw size={12} /> Restore selected
          </button>
          <button
            onClick={() => setPurgeTarget([...selected])}
            disabled={working}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-red-700 bg-white border border-red-200 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <Trash2 size={12} /> Delete selected permanently
          </button>
          <button onClick={() => setSelected(new Set())} className="text-[12px] text-slate-500 hover:text-slate-700 ml-auto">
            Clear
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-5 py-2 flex items-center gap-2 shrink-0">
          <span className="text-[12px] text-red-700 flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={13} className="text-red-400" /></button>
        </div>
      )}

      {/* Grid */}
      <div ref={gridRef} className="flex-1 overflow-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="cursor-pointer" />
              </th>
              <th className="px-3 py-2.5 text-left"><SortHead col={nameCol ?? pk} label="Record name" /></th>
              <th className="px-3 py-2.5 text-left"><span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Record ID</span></th>
              <th className="px-3 py-2.5 text-left"><span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Owner</span></th>
              <th className="px-3 py-2.5 text-left"><span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</span></th>
              <th className="px-3 py-2.5 text-left"><span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Deleted by</span></th>
              <th className="px-3 py-2.5 text-left">
                {meta?.deletedAtCol
                  ? <SortHead col={meta.deletedAtCol} label="Deleted on" />
                  : <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Deleted on</span>}
              </th>
              <th className="w-12 px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-[12px]">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center">
                <Trash2 size={24} className="mx-auto text-slate-200" />
                <p className="mt-2 text-[12px] text-slate-400">The recycle bin is empty.</p>
              </td></tr>
            ) : rows.map((r) => {
              const id = String(r[pk] ?? '');
              const status = statusLabel(r);
              return (
                <tr key={id} className={`border-b border-slate-50 hover:bg-slate-50/60 ${selected.has(id) ? 'bg-blue-50/40' : ''}`}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={selected.has(id)} onChange={() => toggleRow(id)} className="cursor-pointer" />
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-700 max-w-[260px] truncate">{recordName(r)}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400 max-w-[180px] truncate">{id}</td>
                  <td className="px-3 py-2.5 text-slate-600">{meta?.hasOwnerId ? userName(r.owner_id) : '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                      status.tone === 'green' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
                    }`}>{status.text}</span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{meta?.deletedByCol ? userName(r[meta.deletedByCol]) : '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{deletedOn(r)}</td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={(e) => setMenuFor({ id, el: e.currentTarget })}
                      className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <MoreVertical size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="bg-white border-t border-slate-100 px-5 py-2 flex items-center gap-3 shrink-0 text-[12px]">
        <span className="text-slate-500">
          {total === 0 ? '0 records' : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} of ${total}`}
        </span>
        <div className="flex-1" />
        <FilterSelect
          value={String(pageSize)}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
          matchTriggerWidth
          className="text-[12px] border border-slate-200 rounded px-2 py-1"
        >
          {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n} / page</option>)}
        </FilterSelect>
        <div className="flex items-center gap-1">
          <PageBtn onClick={() => setPage(0)} disabled={page === 0}><ChevronsLeft size={14} /></PageBtn>
          <PageBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft size={14} /></PageBtn>
          <span className="px-2 text-slate-500">{page + 1} / {totalPages}</span>
          <PageBtn onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}><PageRight size={14} /></PageBtn>
          <PageBtn onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}><ChevronsRight size={14} /></PageBtn>
        </div>
      </div>

      {/* Row action menu */}
      <AnchoredPopover
        anchorEl={menuFor?.el ?? null}
        open={!!menuFor}
        onClose={() => setMenuFor(null)}
        placement="bottom-end"
        width={180}
        className="bg-white rounded-lg shadow-xl border border-slate-200 py-1"
        role="menu"
      >
        {menuFor && (() => {
          const row = rows.find((r) => String(r[pk] ?? '') === menuFor.id);
          return (
            <>
              <MenuItem icon={<Eye size={13} />} onClick={() => { if (row) setViewRecord(row); setMenuFor(null); }}>
                View details
              </MenuItem>
              <MenuItem icon={<RotateCcw size={13} />} onClick={() => doRestore([menuFor.id])}>
                Restore
              </MenuItem>
              <div className="my-1 border-t border-slate-100" />
              <MenuItem icon={<Trash2 size={13} />} danger onClick={() => setPurgeTarget([menuFor.id])}>
                Delete permanently
              </MenuItem>
            </>
          );
        })()}
      </AnchoredPopover>

      {/* Permanent-delete confirmation */}
      {purgeTarget && (
        <ConfirmDialog
          title="Permanently delete this record?"
          message={
            purgeTarget.length === 1
              ? 'This record will be removed from the table and cannot be restored.'
              : `${purgeTarget.length} records will be removed from the table and cannot be restored.`
          }
          confirmLabel={checkingDeps ? 'Checking…' : 'Delete permanently'}
          onConfirm={doPurge}
          onCancel={() => setPurgeTarget(null)}
          destructive
          loading={checkingDeps}
        />
      )}

      {/* Cascade confirmation — record is referenced by child rows */}
      {cascade && (
        <CascadeDeleteDialog
          entityName={entity.display_name}
          recordCount={cascade.ids.length}
          deps={cascade.deps}
          working={working}
          onConfirm={doCascadePurge}
          onCancel={() => setCascade(null)}
        />
      )}

      {/* View details modal */}
      {viewRecord && (
        <RecordDetailsModal
          title={recordName(viewRecord)}
          record={viewRecord}
          onClose={() => setViewRecord(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[1100] bg-slate-800 text-white text-[12px] px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ---------- Sub-components ---------- */

/** Prettify a physical table name for display: "opportunity_contact" → "Opportunity contact". */
function humanizeTable(t: string): string {
  const s = t.replace(/^crm_/, '').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function CascadeDeleteDialog({ entityName, recordCount, deps, working, onConfirm, onCancel }: {
  entityName: string; recordCount: number; deps: DependentGroup[];
  working: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const totalRelated = deps.reduce((s, d) => s + d.count, 0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={working ? undefined : onCancel} />
      <div className="relative bg-white rounded-lg border border-slate-200 shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-7 h-7 rounded flex items-center justify-center shrink-0 mt-0.5 bg-red-100">
            <AlertTriangle size={14} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-semibold text-slate-800">Related records must be deleted too</h3>
            <p className="mt-1 text-[12px] text-slate-500 leading-relaxed">
              {recordCount === 1 ? 'This record is' : `These ${recordCount} records are`} referenced by other records
              through foreign keys, so {recordCount === 1 ? 'it' : 'they'} can't be deleted on {recordCount === 1 ? 'its' : 'their'} own.
              Deleting permanently will also remove <strong>{totalRelated}</strong> related record{totalRelated === 1 ? '' : 's'}:
            </p>
          </div>
        </div>
        <div className="px-5 py-3 max-h-56 overflow-auto">
          <ul className="space-y-1.5">
            {deps.map((d) => (
              <li key={`${d.table}.${d.column}`} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-slate-700">
                  <span className="font-medium">{humanizeTable(d.table)}</span>
                  <span className="text-slate-400 font-mono text-[11px] ml-1.5">via {d.column}</span>
                </span>
                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200 text-[11px] font-semibold">
                  {d.count} row{d.count === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-slate-400">
            This also removes anything those records reference in turn. This cannot be undone.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 bg-slate-50">
          <button onClick={onCancel} disabled={working}
            className="px-3 py-1.5 text-[12px] text-slate-600 border border-slate-300 rounded hover:bg-white transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={working}
            className="px-3 py-1.5 text-[12px] font-medium text-white rounded bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60">
            {working ? 'Deleting…' : `Delete all (${totalRelated + recordCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Breadcrumb({ entity, onBack }: { entity: EntityDefinition; onBack: () => void }) {
  return (
    <div className="bg-white border-b border-slate-200 px-5 py-2 flex items-center gap-1.5 shrink-0 text-[12px]">
      <button onClick={onBack} className="text-blue-600 hover:text-blue-800 hover:underline font-medium transition-colors">
        {entity.display_name}
      </button>
      <ChevronRight size={11} className="text-slate-300" />
      <span className="text-slate-800 font-semibold">Recycle Bin</span>
    </div>
  );
}

function PageBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
      {children}
    </button>
  );
}

function MenuItem({ children, icon, onClick, danger }: {
  children: React.ReactNode; icon: React.ReactNode; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left transition-colors ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      {icon}{children}
    </button>
  );
}

function RecordDetailsModal({ title, record, onClose }: {
  title: string; record: Record<string, unknown>; onClose: () => void;
}) {
  const entries = Object.entries(record).filter(([k]) => !k.startsWith('_'));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-lg border border-slate-200 shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
          <Eye size={14} className="text-slate-400" />
          <h3 className="text-[13px] font-semibold text-slate-800 flex-1 truncate">{title}</h3>
          <button onClick={onClose}><X size={15} className="text-slate-400 hover:text-slate-600" /></button>
        </div>
        <div className="overflow-auto px-5 py-3">
          <dl className="grid grid-cols-1 gap-2">
            {entries.map(([k, v]) => (
              <div key={k} className="grid grid-cols-3 gap-2 py-1 border-b border-slate-50">
                <dt className="text-[11px] font-mono text-slate-400 truncate">{k}</dt>
                <dd className="col-span-2 text-[12px] text-slate-700 break-words">
                  {v == null || v === '' ? <span className="text-slate-300">—</span> : String(typeof v === 'object' ? JSON.stringify(v) : v)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
