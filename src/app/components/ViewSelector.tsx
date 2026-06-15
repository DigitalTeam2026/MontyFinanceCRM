import { useState, useEffect, useRef } from 'react';
import {
  ChevronDown, Check, Plus, Share2,
  Pencil, Trash2, Star, Loader2, MoreHorizontal, AlertTriangle,
  X, Search, LayoutList,
} from 'lucide-react';
import type { ViewDefinition } from '../../types/view';
import {
  fetchAccessibleViews,
  softDeleteView,
  setDefaultView,
  renameView,
} from '../../services/viewService';
import { useToast, toFriendlyError } from '../context/ToastContext';
import AnchoredPopover from './overlay/AnchoredPopover';

interface ViewSelectorProps {
  entityDefinitionId: string | null;
  activeViewId: string | null;
  /** View to auto-select on initial load (restored from the URL after a refresh). */
  initialViewId?: string;
  currentUserId?: string;
  onViewChange: (view: ViewDefinition | null) => void;
  onDefaultViewLoaded?: (view: ViewDefinition) => void | Promise<void>;
  onViewsResolved?: () => void;
  onSaveAsNew: () => void;
  onShareView: (view: ViewDefinition) => void;
}

export default function ViewSelector({
  entityDefinitionId,
  activeViewId,
  initialViewId,
  currentUserId,
  onViewChange,
  onDefaultViewLoaded,
  onViewsResolved,
  onSaveAsNew,
  onShareView,
}: ViewSelectorProps) {
  const { showError, showSuccess } = useToast();
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<ViewDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [savingRename, setSavingRename] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ViewDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);

  const activeView = views.find((v) => v.view_id === activeViewId) ?? null;
  const initialLoadDone = useRef(false);

  const load = async () => {
    if (!entityDefinitionId) { onViewsResolved?.(); return; }
    const isInitial = !initialLoadDone.current;
    if (isInitial) setLoading(true);
    try {
      const data = await fetchAccessibleViews(entityDefinitionId);
      setViews(data);
      if (isInitial && activeViewId === null && onDefaultViewLoaded) {
        // Prefer the view restored from the URL (refresh); otherwise the default.
        const restored = initialViewId ? data.find((v) => v.view_id === initialViewId) : undefined;
        const defaultView =
          restored ??
          data.find((v) => v.is_default) ??
          data.find((v) => v.view_type === 'public') ??
          data[0] ??
          null;
        if (defaultView) await onDefaultViewLoaded(defaultView);
      }
    } catch {
      // silently fail
    } finally {
      if (isInitial) {
        setLoading(false);
        initialLoadDone.current = true;
      }
      onViewsResolved?.();
    }
  };

  useEffect(() => {
    initialLoadDone.current = false;
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityDefinitionId]);

  const closePanel = () => { setOpen(false); setActionMenuId(null); };

  const handleSelect = (view: ViewDefinition) => {
    onViewChange(view);
    setOpen(false);
    setActionMenuId(null);
  };

  const handleDelete = (view: ViewDefinition, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionMenuId(null);
    setOpen(false);
    setDeleteTarget(view);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await softDeleteView(deleteTarget.view_id);
      setViews((prev) => prev.filter((v) => v.view_id !== deleteTarget.view_id));
      if (activeViewId === deleteTarget.view_id) onViewChange(null);
      showSuccess(`View "${deleteTarget.name}" deleted.`);
    } catch (err) {
      showError(toFriendlyError(err, 'Unable to delete view.'));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleSetDefault = async (view: ViewDefinition, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!entityDefinitionId) return;
    try {
      await setDefaultView(view.view_id, entityDefinitionId);
      setViews((prev) => prev.map((v) => ({ ...v, is_default: v.view_id === view.view_id })));
      showSuccess(`"${view.name}" is now the default view.`);
    } catch (err) {
      showError(toFriendlyError(err, 'Unable to set default view.'));
    }
    setActionMenuId(null);
  };

  const startRename = (view: ViewDefinition, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(view.view_id);
    setRenameValue(view.name);
    setActionMenuId(null);
  };

  const commitRename = async (viewId: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    setSavingRename(true);
    try {
      await renameView(viewId, renameValue.trim());
      setViews((prev) => prev.map((v) => v.view_id === viewId ? { ...v, name: renameValue.trim() } : v));
      setRenamingId(null);
    } catch (err) {
      showError(toFriendlyError(err, 'Unable to rename view.'));
    } finally {
      setSavingRename(false);
    }
  };

  const q = search.toLowerCase();
  const matches = (v: ViewDefinition) => !q || v.name.toLowerCase().includes(q);

  // MY VIEWS = personal + public  |  SYSTEM VIEWS = system
  const myViews     = views.filter((v) => v.view_type !== 'system' && matches(v));
  const systemViews = views.filter((v) => v.view_type === 'system' && matches(v));

  const renderRow = (view: ViewDefinition, showStar: boolean) => {
    const isActive  = view.view_id === activeViewId;
    const canManage = view.created_by === currentUserId && !view.is_system;
    const isOwner   = view.created_by === currentUserId || view.view_type === 'system';

    return (
      <div
        key={view.view_id}
        onClick={() => handleSelect(view)}
        className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors group"
        style={{ background: isActive ? 'var(--row-hover)' : undefined }}
        onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
        onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = ''; }}
      >
        {/* Star / default toggle */}
        {showStar && (
          <button
            onClick={(e) => handleSetDefault(view, e)}
            className="shrink-0 transition-transform hover:scale-110"
            title={view.is_default ? 'Default view' : 'Set as default'}
          >
            <Star
              size={13}
              className={view.is_default ? 'text-amber-400 fill-amber-400' : 'text-[var(--border)] group-hover:text-[var(--muted)]'}
            />
          </button>
        )}

        {/* Name + rename input */}
        <div className="flex-1 min-w-0">
          {renamingId === view.view_id ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(view.view_id);
                if (e.key === 'Escape') setRenamingId(null);
                e.stopPropagation();
              }}
              onBlur={() => commitRename(view.view_id)}
              onClick={(e) => e.stopPropagation()}
              className="w-full px-1.5 py-0.5 text-[12px] border border-[var(--link)] rounded focus:outline-none"
            />
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="truncate text-[13px] font-medium"
                style={{ color: isActive ? 'var(--link)' : 'var(--text)' }}
              >
                {view.name}
              </span>
              {view.is_default && (
                <span
                  className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                  style={{ background: 'var(--row-hover)', color: 'var(--link)', border: '1px solid var(--surface-2)' }}
                >
                  Default
                </span>
              )}
            </div>
          )}
          {view.view_type === 'system' && (
            <p className="text-[10px] text-[var(--muted)] mt-0.5 leading-none">Everyone can see this</p>
          )}
        </div>

        {savingRename && renamingId === view.view_id && (
          <Loader2 size={11} className="animate-spin text-slate-400 shrink-0" />
        )}

        {/* Active check */}
        {isActive && <Check size={13} className="shrink-0" style={{ color: 'var(--link)' }} />}

        {/* Action menu (owner, non-system) */}
        {canManage && !renamingId && (
          <div className="relative shrink-0" ref={actionRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setActionMenuId(actionMenuId === view.view_id ? null : view.view_id); }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--border)] transition"
            >
              <MoreHorizontal size={12} className="text-[var(--muted)]" />
            </button>
            {actionMenuId === view.view_id && (
              <div className="absolute right-0 top-6 z-50 w-40 bg-white rounded-xl shadow-xl py-1 overflow-hidden"
                style={{ border: '1px solid var(--border)' }}>
                <button onClick={(e) => startRename(view, e)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[var(--text)] hover:bg-[var(--surface-2)] transition">
                  <Pencil size={11} className="text-[var(--muted)]" /> Rename
                </button>
                {!view.is_system && (
                  <button onClick={(e) => handleSetDefault(view, e)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[var(--text)] hover:bg-[var(--surface-2)] transition">
                    <Star size={11} className="text-[var(--muted)]" /> Set as Default
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onShareView(view); setActionMenuId(null); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-[var(--text)] hover:bg-[var(--surface-2)] transition">
                  <Share2 size={11} className="text-[var(--muted)]" /> Share
                </button>
                {view.is_deletable && (
                  <button onClick={(e) => handleDelete(view, e)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-red-600 hover:bg-red-50 transition">
                    <Trash2 size={11} /> Delete
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Share button for non-owner */}
        {!canManage && isOwner && view.view_type !== 'system' && !renamingId && (
          <button
            onClick={(e) => { e.stopPropagation(); onShareView(view); setOpen(false); }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--border)] transition"
            title="Share view"
          >
            <Share2 size={11} className="text-[var(--muted)]" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div ref={dropRef} className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
        onClick={() => { const w = !open; setOpen(w); if (w) load(); }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 max-w-[260px] transition"
      >
        <span className="text-[20px] font-semibold text-[var(--ink-900)] truncate">
          {activeView?.name ?? (loading ? '' : 'All Records')}
        </span>
        {loading
          ? <Loader2 size={14} className="animate-spin text-[var(--ink-300)] shrink-0" />
          : <ChevronDown size={15} className="text-[var(--ink-400)] shrink-0" />
        }
      </button>

      {/* Dropdown panel */}
      <AnchoredPopover
        anchorEl={triggerRef.current}
        open={open}
        onClose={closePanel}
        width={280}
        role="menu"
        className="bg-white overflow-hidden flex flex-col"
        style={{ borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(17,24,39,.12), 0 2px 8px rgba(17,24,39,.06)' }}
      >
        <>
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid var(--surface-2)' }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--row-hover)' }}>
              <LayoutList size={13} style={{ color: 'var(--link)' }} />
            </div>
            <span className="flex-1 text-[13px] font-semibold text-[var(--text)]">Switch view</span>
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition"
            >
              <X size={13} />
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--surface-2)' }}>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search views..."
                className="w-full text-[12px] pl-7 pr-3 py-1.5 focus:outline-none transition"
                style={{
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text)',
                }}
                onFocus={(e) => { e.currentTarget.style.border = '1px solid var(--link)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,111,255,.12)'; }}
                onBlur={(e) => { e.currentTarget.style.border = '1px solid var(--border)'; e.currentTarget.style.boxShadow = ''; }}
              />
            </div>
          </div>

          {/* Lists */}
          <div className="max-h-60 overflow-y-auto">
            {/* MY VIEWS */}
            {myViews.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                  My Views
                </p>
                {myViews.map((v) => renderRow(v, true))}
              </div>
            )}
            {/* SYSTEM VIEWS */}
            {systemViews.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                  System Views
                </p>
                {systemViews.map((v) => renderRow(v, false))}
              </div>
            )}
            {views.length === 0 && !loading && (
              <div className="px-4 py-5 text-center text-[12px] text-slate-400">No views configured</div>
            )}
            {views.length > 0 && myViews.length === 0 && systemViews.length === 0 && (
              <div className="px-4 py-5 text-center text-[12px] text-slate-400">No results for "{search}"</div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => { setOpen(false); onSaveAsNew(); }}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-[12px] font-semibold text-white transition"
              style={{ background: 'linear-gradient(135deg,var(--link),var(--link))', borderRadius: 10, boxShadow: '0 4px 12px rgba(59,111,255,.3)' }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = ''; }}
            >
              <Plus size={13} />
              Create view
            </button>
          </div>
        </>
      </AnchoredPopover>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-[360px] p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-9 h-9 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
                <AlertTriangle size={17} className="text-red-500" />
              </span>
              <div>
                <p className="text-[14px] font-semibold text-slate-800">Delete view</p>
                <p className="text-[13px] text-slate-500 mt-0.5">
                  Delete <span className="font-medium text-slate-700">"{deleteTarget.name}"</span>? This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-[13px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-[13px] font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition flex items-center gap-1.5 disabled:opacity-60"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
