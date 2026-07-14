import { useEffect, useMemo, useState } from 'react';
import {
  Search, RefreshCw, Lock, Unlock, ArrowRight, ArrowLeft, Trash2,
  ShieldCheck, AlertTriangle, Loader2, CheckCircle2, XCircle,
} from 'lucide-react';
import {
  fetchClearManifest, executeClear,
  type ClearManifest, type ClearCategory, type ClearItem, type ClearResult,
} from '../../services/clearDataService';

// Per-category working state the UI mutates: which item ids are queued for
// deletion, and which locked (system) ids the admin has explicitly unlocked so
// they can be moved. Defaults come from the manifest's `protected` flag.
type WorkState = Record<string, { del: Set<string>; unlocked: Set<string> }>;

function buildInitialState(categories: ClearCategory[]): WorkState {
  const state: WorkState = {};
  for (const cat of categories) {
    // Non-protected items start queued for deletion (right column); protected
    // items start on the Protected side.
    const del = new Set(cat.items.filter((i) => !i.protected).map((i) => i.id));
    state[cat.key] = { del, unlocked: new Set() };
  }
  return state;
}

function fmtCount(n: number | null): string {
  if (n == null) return '';
  if (n <= 0) return '~0 rows';
  return `~${n.toLocaleString()} rows`;
}

export default function ClearDataPage() {
  const [manifest, setManifest] = useState<ClearManifest | null>(null);
  const [work, setWork] = useState<WorkState>({});
  const [activeKey, setActiveKey] = useState('tables');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ClearResult | null>(null);

  // `silent` re-fetches without the full-page spinner or clearing the last
  // result summary — used to refresh counts right after a clear.
  const load = async (silent = false) => {
    if (!silent) { setLoading(true); setResult(null); }
    setError(null);
    try {
      const m = await fetchClearManifest();
      setManifest(m);
      setWork(buildInitialState(m.categories));
      if (!m.categories.some((c) => c.key === activeKey) && m.categories[0]) {
        setActiveKey(m.categories[0].key);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCat = manifest?.categories.find((c) => c.key === activeKey) ?? null;
  const activeWork = work[activeKey];

  // Totals across every category (drives the header + Clear button).
  const totals = useMemo(() => {
    let del = 0, protectedCount = 0;
    if (manifest) {
      for (const cat of manifest.categories) {
        const w = work[cat.key];
        if (!w) continue;
        del += w.del.size;
        protectedCount += cat.items.length - w.del.size;
      }
    }
    return { del, protectedCount };
  }, [manifest, work]);

  const setDel = (key: string, mutate: (del: Set<string>, unlocked: Set<string>) => void) => {
    setWork((prev) => {
      const cur = prev[key] ?? { del: new Set<string>(), unlocked: new Set<string>() };
      const del = new Set(cur.del);
      const unlocked = new Set(cur.unlocked);
      mutate(del, unlocked);
      return { ...prev, [key]: { del, unlocked } };
    });
  };

  const isLocked = (item: ClearItem, w: WorkState[string]) => item.locked && !w.unlocked.has(item.id);

  const moveToDelete = (item: ClearItem) => {
    if (!activeWork || isLocked(item, activeWork)) return;
    setDel(activeKey, (del) => del.add(item.id));
  };
  const moveToProtected = (item: ClearItem) => {
    setDel(activeKey, (del) => del.delete(item.id));
  };
  const toggleUnlock = (item: ClearItem) => {
    setDel(activeKey, (_del, unlocked) => {
      if (unlocked.has(item.id)) unlocked.delete(item.id);
      else unlocked.add(item.id);
    });
  };

  const moveAll = (toDelete: boolean) => {
    if (!activeCat || !activeWork) return;
    setDel(activeKey, (del, unlocked) => {
      for (const item of activeCat.items) {
        const locked = item.locked && !unlocked.has(item.id);
        if (toDelete) {
          if (!locked) del.add(item.id);
        } else {
          del.delete(item.id);
        }
      }
    });
  };

  // Partition the active category into the two columns, applying the search.
  const { protectedItems, deleteItems } = useMemo(() => {
    const p: ClearItem[] = [], d: ClearItem[] = [];
    if (activeCat && activeWork) {
      const q = search.trim().toLowerCase();
      for (const item of activeCat.items) {
        if (q && !item.label.toLowerCase().includes(q)) continue;
        (activeWork.del.has(item.id) ? d : p).push(item);
      }
    }
    return { protectedItems: p, deleteItems: d };
  }, [activeCat, activeWork, search]);

  const confirmPhrase = manifest?.confirmPhrase ?? 'DELETE';
  const canClear = confirmText === confirmPhrase && totals.del > 0 && !busy;

  const runClear = async () => {
    if (!manifest) return;
    setBusy(true);
    setError(null);
    try {
      const selections: Record<string, string[]> = {};
      for (const cat of manifest.categories) {
        const w = work[cat.key];
        if (w && w.del.size) selections[cat.key] = Array.from(w.del);
      }
      const res = await executeClear(confirmPhrase, selections);
      setConfirmOpen(false);
      setConfirmText('');
      await load(true); // quietly refresh counts/definitions after the delete
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Clear failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--app-bg)' }}>
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Danger banner */}
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="text-[12px] text-red-800">
            <p className="font-semibold">Permanent deletion — this cannot be undone.</p>
            <p className="text-red-700 mt-0.5">
              Items in the <strong>To-be-deleted</strong> column are erased when you press Clear.
              Protected items are only a safe default — unlock any of them to include them.
            </p>
          </div>
        </div>

        {result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px]">
            <div className="flex items-center gap-2 font-semibold text-emerald-800">
              <CheckCircle2 className="w-4 h-4" />
              Cleared {result.totalRows.toLocaleString()} row{result.totalRows === 1 ? '' : 's'}
              {' '}across {result.cleared.length} item{result.cleared.length === 1 ? '' : 's'}.
            </div>
            {result.failed.length > 0 && (
              <div className="mt-2 text-red-700">
                <div className="flex items-center gap-1.5 font-semibold">
                  <XCircle className="w-3.5 h-3.5" /> {result.failed.length} could not be cleared:
                </div>
                <ul className="mt-1 ml-5 list-disc space-y-0.5">
                  {result.failed.map((f, i) => (
                    <li key={i}><span className="font-medium">{f.label}</span> — {f.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
            {error}
          </div>
        )}

        {/* Category tabs */}
        <div className="flex flex-wrap gap-1.5">
          {manifest?.categories.map((cat) => {
            const w = work[cat.key];
            const delCount = w?.del.size ?? 0;
            const active = cat.key === activeKey;
            return (
              <button
                key={cat.key}
                onClick={() => { setActiveKey(cat.key); setSearch(''); }}
                className={`px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat.label}
                {delCount > 0 && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                    active ? 'bg-white/25 text-white' : 'bg-red-100 text-red-600'
                  }`}>
                    {delCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Panel */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-[15px] font-semibold text-slate-800">{activeCat?.label}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {totals.del} will be cleared · {totals.protectedCount} protected · auto-discovered from the database
              </p>
            </div>
            <button
              onClick={() => void load()}
              className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-700"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          <div className="relative mb-4">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeCat?.label.toLowerCase()}…`}
              className="w-full pl-9 pr-3 py-2 text-[13px] rounded-lg border border-blue-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Column
              title="Protected (will NOT be cleared)"
              icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}
              items={protectedItems}
              side="protected"
              activeWork={activeWork}
              onMove={moveToDelete}
              onToggleLock={toggleUnlock}
              onMoveAll={() => moveAll(true)}
              moveAllLabel="Delete all →"
            />
            <Column
              title="To-be-deleted (will be cleared)"
              icon={<Trash2 className="w-4 h-4 text-red-500" />}
              items={deleteItems}
              side="delete"
              activeWork={activeWork}
              onMove={moveToProtected}
              onToggleLock={toggleUnlock}
              onMoveAll={() => moveAll(false)}
              moveAllLabel="← Protect all"
            />
          </div>
        </div>

        {/* Footer / Clear */}
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-3">
          <p className="text-[12px] text-slate-600">
            <strong className="text-red-600">{totals.del}</strong> item{totals.del === 1 ? '' : 's'} queued
            for permanent deletion across all categories.
          </p>
          <button
            onClick={() => { setConfirmText(''); setConfirmOpen(true); }}
            disabled={totals.del === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" /> Clear
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-6">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-[16px] font-semibold text-slate-800">Confirm permanent deletion</h3>
            </div>
            <p className="text-[13px] text-slate-600">
              This will permanently delete{' '}
              <strong className="text-red-600">{totals.del} selected item{totals.del === 1 ? '' : 's'}</strong>{' '}
              (row data for tables, definitions for everything else). This action cannot be undone.
            </p>
            <p className="text-[12px] text-slate-500 mt-3 mb-1.5">
              Type <span className="font-mono font-semibold text-slate-700">{confirmPhrase}</span> to confirm:
            </p>
            <input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canClear) void runClear(); }}
              placeholder={confirmPhrase}
              className="w-full px-3 py-2 text-[13px] rounded-lg border border-slate-300 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100"
            />
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => { setConfirmOpen(false); setConfirmText(''); }}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-[13px] font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={() => void runClear()}
                disabled={!canClear}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Permanently clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ColumnProps {
  title: string;
  icon: React.ReactNode;
  items: ClearItem[];
  side: 'protected' | 'delete';
  activeWork: WorkState[string] | undefined;
  onMove: (item: ClearItem) => void;
  onToggleLock: (item: ClearItem) => void;
  onMoveAll: () => void;
  moveAllLabel: string;
}

function Column({ title, icon, items, side, activeWork, onMove, onToggleLock, onMoveAll, moveAllLabel }: ColumnProps) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
          {icon} {title}
        </div>
        {items.length > 0 && (
          <button onClick={onMoveAll} className="text-[10px] text-slate-400 hover:text-slate-600 font-medium">
            {moveAllLabel}
          </button>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto p-2 space-y-1.5 min-h-[8rem]">
        {items.length === 0 && (
          <div className="text-[11px] text-slate-300 text-center py-8 select-none">Empty</div>
        )}
        {items.map((item) => {
          const locked = !!activeWork && item.locked && !activeWork.unlocked.has(item.id);
          return (
            <div
              key={item.id}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-[12px] ${
                side === 'delete' ? 'bg-red-50/60 border-red-100' : 'bg-white border-slate-100'
              }`}
            >
              {(item.locked || locked) && (
                <button
                  onClick={() => onToggleLock(item)}
                  title={locked ? 'Locked — click to unlock and allow deletion' : 'Unlocked — click to re-lock'}
                  className={locked ? 'text-slate-400 hover:text-amber-500' : 'text-amber-500 hover:text-slate-400'}
                >
                  {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-mono text-slate-700 truncate">{item.label}</div>
                {item.count != null && (
                  <div className="text-[10px] text-slate-400">{fmtCount(item.count)}</div>
                )}
              </div>
              {locked ? (
                <span className="text-[9px] font-semibold text-slate-400 tracking-wide">LOCKED</span>
              ) : (
                <button
                  onClick={() => onMove(item)}
                  title={side === 'protected' ? 'Move to To-be-deleted' : 'Move to Protected'}
                  className={`shrink-0 ${side === 'protected' ? 'text-red-400 hover:text-red-600' : 'text-emerald-400 hover:text-emerald-600'}`}
                >
                  {side === 'protected' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
