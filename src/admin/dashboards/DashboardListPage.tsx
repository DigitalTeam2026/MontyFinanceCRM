import { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, Loader2, LayoutDashboard, MoreHorizontal, Copy, Trash2,
  Upload, Download, Eye, Pencil, CheckCircle2, CircleSlash, Star, StarOff, Share2, Globe,
} from 'lucide-react';
import {
  fetchDashboards, softDeleteDashboard, duplicateDashboardWithScope,
  publishDashboard, unpublishDashboard, exportDefinition, importDefinition,
  setDefaultDashboard, clearDefaultDashboard, fetchShareSummaries,
} from './services/dashboardService';
import type { DuplicateScope, DashboardShareSummary } from './services/dashboardService';
import type { DashboardListRow } from './types/dashboard';
import { DASHBOARD_TYPES } from './types/dashboard';
import { useToast, toFriendlyError } from '../../app/context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';
import DuplicateScopeModal from './DuplicateScopeModal';
import ShareDashboardDialog from './ShareDashboardDialog';
import AnchoredPopover from '../../app/components/overlay/AnchoredPopover';

interface Props {
  onNew: () => void;
  onOpen: (id: string) => void;
}

const TYPE_LABEL = Object.fromEntries(DASHBOARD_TYPES.map((t) => [t.value, t.label]));

export default function DashboardListPage({ onNew, onOpen }: Props) {
  const { showSuccess, showError } = useToast();
  const [rows, setRows] = useState<DashboardListRow[]>([]);
  const [shares, setShares] = useState<Record<string, DashboardShareSummary>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<DashboardListRow | null>(null);
  const [duplicateFor, setDuplicateFor] = useState<DashboardListRow | null>(null);
  const [shareFor, setShareFor] = useState<DashboardListRow | null>(null);
  const [menuFor, setMenuFor] = useState<{ row: DashboardListRow; el: HTMLElement } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [list, shareSummaries] = await Promise.all([
        fetchDashboards(),
        fetchShareSummaries().catch(() => ({})),
      ]);
      setRows(list);
      setShares(shareSummaries);
    }
    catch (e) { showError(toFriendlyError(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const filtered = rows.filter((r) =>
    !search || r.name.toLowerCase().includes(search.toLowerCase())
    || (r.description ?? '').toLowerCase().includes(search.toLowerCase()));

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); showSuccess(ok); await load(); }
    catch (e) { showError(toFriendlyError(e)); }
    setBusy(false);
    setMenuFor(null);
  };

  const handleExport = async (row: DashboardListRow) => {
    try {
      const json = await exportDefinition(row.dashboard_id);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${row.name.replace(/\s+/g, '_')}.dashboard.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { showError(toFriendlyError(e)); }
    setMenuFor(null);
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const dash = await importDefinition(text);
      showSuccess('Dashboard imported.');
      await load();
      onOpen(dash.dashboard_id);
    } catch (e) { showError(toFriendlyError(e)); }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 bg-white shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dashboards…"
            className="w-full pl-8 pr-3 py-1.5 text-[12px] border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <input ref={fileRef} type="file" accept="application/json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }} />
        <button onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-slate-600 border border-slate-300 rounded hover:bg-slate-50">
          <Upload size={13} /> Import
        </button>
        <button onClick={onNew}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700">
          <Plus size={14} /> Create Dashboard
        </button>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
            <LayoutDashboard size={32} className="mb-3 opacity-40" />
            <p className="text-[13px]">No dashboards yet.</p>
            <button onClick={onNew} className="mt-3 text-[12px] text-blue-600 hover:underline">Create your first dashboard</button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Name</th>
                  <th className="text-left font-medium px-4 py-2.5">Type</th>
                  <th className="text-left font-medium px-4 py-2.5">Primary Entity</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                  <th className="text-left font-medium px-4 py-2.5">Modified</th>
                  <th className="px-4 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.dashboard_id} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <button onClick={() => onOpen(r.dashboard_id)} className="font-medium text-slate-800 hover:text-blue-600 text-left">
                          {r.name}
                        </button>
                        {r.is_default && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
                            <Star size={10} className="fill-blue-700" /> Default
                          </span>
                        )}
                        {shares[r.dashboard_id]?.organization && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-100 text-violet-700">
                            <Globe size={10} /> Everyone
                          </span>
                        )}
                        {!!shares[r.dashboard_id]?.count && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                            <Share2 size={10} /> Shared · {shares[r.dashboard_id].count}
                          </span>
                        )}
                      </span>
                      {r.description && <p className="text-slate-400 text-[11px] truncate max-w-xs">{r.description}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{TYPE_LABEL[r.dashboard_type] ?? r.dashboard_type}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.primary_entity_name ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        r.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.status === 'published' ? <CheckCircle2 size={11} /> : <CircleSlash size={11} />}
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{new Date(r.modified_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={(e) => setMenuFor({ row: r, el: e.currentTarget })}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100">
                        <MoreHorizontal size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {menuFor && (
        <AnchoredPopover
          anchorEl={menuFor.el} open onClose={() => setMenuFor(null)} placement="bottom-end" width={200} role="menu"
          className="rounded-xl border border-slate-200 bg-white shadow-[0_10px_25px_rgba(15,23,42,0.12)]"
        >
          <div className="py-1 text-[12px]">
            <MenuItem icon={<Eye size={13} />} label="Open" onClick={() => { onOpen(menuFor.row.dashboard_id); setMenuFor(null); }} />
            <MenuItem icon={<Pencil size={13} />} label="Edit" onClick={() => { onOpen(menuFor.row.dashboard_id); setMenuFor(null); }} />
            <MenuItem icon={<Copy size={13} />} label="Duplicate" disabled={busy}
              onClick={() => { setDuplicateFor(menuFor.row); setMenuFor(null); }} />
            <MenuItem icon={<Share2 size={13} />} label="Share…"
              onClick={() => { setShareFor(menuFor.row); setMenuFor(null); }} />
            {menuFor.row.status === 'published' ? (
              <MenuItem icon={<CircleSlash size={13} />} label="Unpublish" disabled={busy}
                onClick={() => act(() => unpublishDashboard(menuFor.row.dashboard_id), 'Dashboard unpublished.')} />
            ) : (
              <MenuItem icon={<CheckCircle2 size={13} />} label="Publish" disabled={busy}
                onClick={() => act(() => publishDashboard(menuFor.row.dashboard_id), 'Dashboard published.')} />
            )}
            {menuFor.row.is_default ? (
              <MenuItem icon={<StarOff size={13} />} label="Remove as Default" disabled={busy}
                onClick={() => act(() => clearDefaultDashboard(menuFor.row.dashboard_id), 'Default dashboard cleared.')} />
            ) : (
              <MenuItem icon={<Star size={13} />} label="Set as Default (all users)" disabled={busy}
                onClick={() => act(() => setDefaultDashboard(menuFor.row.dashboard_id), 'Default dashboard set.')} />
            )}
            <MenuItem icon={<Download size={13} />} label="Export Definition" onClick={() => handleExport(menuFor.row)} />
            <div className="my-1 border-t border-slate-100" />
            <MenuItem icon={<Trash2 size={13} />} label="Delete" danger
              onClick={() => { setConfirmDelete(menuFor.row); setMenuFor(null); }} />
          </div>
        </AnchoredPopover>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete dashboard?"
          message={`"${confirmDelete.name}" will be removed. This cannot be undone.`}
          confirmLabel="Delete" destructive loading={busy}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => act(() => softDeleteDashboard(confirmDelete.dashboard_id), 'Dashboard deleted.').then(() => setConfirmDelete(null))}
        />
      )}

      {duplicateFor && (
        <DuplicateScopeModal
          dashboardName={duplicateFor.name}
          loading={busy}
          onCancel={() => setDuplicateFor(null)}
          onConfirm={(scope: DuplicateScope) =>
            act(() => duplicateDashboardWithScope(duplicateFor.dashboard_id, scope), 'Dashboard duplicated.').then(() => setDuplicateFor(null))}
        />
      )}

      {shareFor && (
        <ShareDashboardDialog
          dashboardId={shareFor.dashboard_id}
          dashboardName={shareFor.name}
          onClose={() => { setShareFor(null); load(); }}
        />
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger, disabled }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left disabled:opacity-50 ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}>
      {icon} {label}
    </button>
  );
}
