import { useState, useEffect, useRef } from 'react';
import {
  ChevronDown, Globe, Lock, Cpu, Check, Plus, Share2,
  Pencil, Trash2, Star, Loader2, MoreHorizontal, AlertTriangle,
} from 'lucide-react';
import type { ViewDefinition } from '../../types/view';
import {
  fetchAccessibleViews,
  softDeleteView,
  setDefaultView,
  renameView,
} from '../../services/viewService';
import { useToast, toFriendlyError } from '../context/ToastContext';

interface ViewSelectorProps {
  entityDefinitionId: string | null;
  activeViewId: string | null;
  currentUserId?: string;
  onViewChange: (view: ViewDefinition | null) => void;
  onDefaultViewLoaded?: (view: ViewDefinition) => void | Promise<void>;
  onViewsResolved?: () => void;
  onSaveAsNew: () => void;
  onShareView: (view: ViewDefinition) => void;
}

const VIEW_TYPE_ICON: Record<string, React.ReactNode> = {
  system:   <Cpu size={11} className="text-slate-400" />,
  public:   <Globe size={11} className="text-blue-500" />,
  personal: <Lock size={11} className="text-amber-500" />,
};

const VIEW_TYPE_LABEL: Record<string, string> = {
  system: 'System',
  public: 'Public',
  personal: 'Personal',
};

export default function ViewSelector({
  entityDefinitionId,
  activeViewId,
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
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [savingRename, setSavingRename] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ViewDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
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
        const defaultView =
          data.find((v) => v.is_default) ??
          data.find((v) => v.view_type === 'public') ??
          data[0] ??
          null;
        if (defaultView) {
          await onDefaultViewLoaded(defaultView);
        }
      }
    } catch {
      // silently fail — views are optional
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActionMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const grouped = {
    system:   views.filter((v) => v.view_type === 'system'),
    public:   views.filter((v) => v.view_type === 'public'),
    personal: views.filter((v) => v.view_type === 'personal'),
  };

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

  const renderGroup = (label: string, groupViews: ViewDefinition[]) => {
    if (groupViews.length === 0) return null;
    return (
      <div key={label}>
        <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold text-[var(--ink-400)] uppercase tracking-wider">
          {label}
        </div>
        {groupViews.map((view) => {
          const isActive = view.view_id === activeViewId;
          const isOwner = view.created_by === currentUserId || view.view_type === 'system';
          const canManage = view.created_by === currentUserId && !view.is_system;
          return (
            <div
              key={view.view_id}
              onClick={() => handleSelect(view)}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--ink-50)] group ${isActive ? 'bg-[#e5efff]' : ''}`}
            >
              {VIEW_TYPE_ICON[view.view_type]}
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
                  className="flex-1 min-w-0 px-1.5 py-0.5 text-[12px] border border-blue-300 rounded focus:outline-none"
                />
              ) : (
                <span className={`flex-1 min-w-0 truncate text-[13px] ${isActive ? 'text-[var(--navy-accent)] font-semibold' : 'text-[var(--ink-700)]'}`}>
                  {view.name}
                </span>
              )}
              {savingRename && renamingId === view.view_id && <Loader2 size={11} className="animate-spin text-slate-400 shrink-0" />}
              {view.is_default && <Star size={10} className="text-amber-400 fill-amber-400 shrink-0" />}
              {isActive && <Check size={12} className="text-blue-600 shrink-0" />}
              {canManage && !renamingId && (
                <div className="relative shrink-0" ref={actionRef}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setActionMenuId(actionMenuId === view.view_id ? null : view.view_id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-200 transition"
                  >
                    <MoreHorizontal size={12} className="text-slate-500" />
                  </button>
                  {actionMenuId === view.view_id && (
                    <div className="absolute right-0 top-6 z-50 w-40 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                      <button
                        onClick={(e) => startRename(view, e)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil size={11} /> Rename
                      </button>
                      {!view.is_system && (
                        <button
                          onClick={(e) => handleSetDefault(view, e)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
                        >
                          <Star size={11} /> Set as Default
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); onShareView(view); setActionMenuId(null); setOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
                      >
                        <Share2 size={11} /> Share
                      </button>
                      {view.is_deletable && (
                        <button
                          onClick={(e) => handleDelete(view, e)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={11} /> Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {!canManage && isOwner && view.view_type !== 'system' && !renamingId && (
                <button
                  onClick={(e) => { e.stopPropagation(); onShareView(view); setOpen(false); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-200 transition"
                  title="Share view"
                >
                  <Share2 size={11} className="text-slate-400" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div ref={dropRef} className="relative">
      <button
        onClick={() => {
          const willOpen = !open;
          setOpen(willOpen);
          if (willOpen) load();
        }}
        className="flex items-center gap-1.5 max-w-[220px] transition"
      >
        <span className="text-[18px] font-semibold text-[var(--ink-900)] truncate">{activeView?.name ?? (loading ? '' : 'All Records')}</span>
        {loading ? <Loader2 size={12} className="animate-spin text-[var(--ink-300)] shrink-0" /> : <ChevronDown size={13} className="text-[var(--ink-400)] shrink-0" />}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-white rounded-lg shadow-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="max-h-72 overflow-y-auto">
            {renderGroup(VIEW_TYPE_LABEL.system, grouped.system)}
            {renderGroup(VIEW_TYPE_LABEL.public, grouped.public)}
            {renderGroup(VIEW_TYPE_LABEL.personal, grouped.personal)}
            {views.length === 0 && !loading && (
              <div className="px-4 py-5 text-center text-[12px] text-slate-400">No views configured</div>
            )}
          </div>
          <div className="p-2" style={{ borderTop: '1px solid var(--divider)' }}>
            <button
              onClick={() => { setOpen(false); onSaveAsNew(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-[var(--navy-accent)] hover:bg-[var(--ink-50)] rounded-lg transition"
            >
              <Plus size={12} />
              Save Current View As…
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog — centered toast-style */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-[360px] p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
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
