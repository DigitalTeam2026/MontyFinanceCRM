import { X, Eye, FileText, Zap, GitBranch, Link, Shield, Navigation, Play, Trash2, ExternalLink, CheckCircle, Loader } from 'lucide-react';
import { useState } from 'react';
import type { Dependency } from '../../services/dependencyService';
import { removeFieldFromForm, removeFieldFromViewColumn, removeFieldFromViewFilter, removeFieldFromViewSort } from '../../services/dependencyService';

interface DependencyBlockModalProps {
  title: string;
  itemName: string;
  dependencies: Dependency[];
  fieldDefinitionId?: string;
  fieldLogicalName?: string;
  onClose: () => void;
  /** Called when all removable deps are cleared so the parent can re-check */
  onDepsCleared?: () => void;
  /** Called to navigate to a business rule editor */
  onOpenBusinessRule?: (ruleId: string) => void;
  /** Called to navigate to a process flow editor */
  onOpenProcessFlow?: (flowId: string) => void;
  /** Called to navigate to the navigation editor (opens the Navigation page) */
  onOpenNavigation?: () => void;
}

const TYPE_CONFIG: Record<Dependency['type'], { label: string; icon: React.ReactNode; color: string }> = {
  view: { label: 'Views', icon: <Eye size={14} />, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  form: { label: 'Forms', icon: <FileText size={14} />, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  business_rule: { label: 'Business Rules', icon: <Zap size={14} />, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  process_flow: { label: 'Process Flows', icon: <GitBranch size={14} />, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
  workflow: { label: 'Workflows', icon: <Play size={14} />, color: 'text-violet-600 bg-violet-50 border-violet-200' },
  relationship: { label: 'Relationships', icon: <Link size={14} />, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  column_security: { label: 'Column Security', icon: <Shield size={14} />, color: 'text-red-600 bg-red-50 border-red-200' },
  navigation: { label: 'Navigation', icon: <Navigation size={14} />, color: 'text-slate-600 bg-slate-50 border-slate-200' },
  security_role: { label: 'Security Roles', icon: <Shield size={14} />, color: 'text-rose-600 bg-rose-50 border-rose-200' },
};

const TYPE_ORDER: Dependency['type'][] = [
  'view', 'form', 'business_rule', 'process_flow', 'workflow',
  'relationship', 'column_security', 'navigation', 'security_role',
];

export default function DependencyBlockModal({
  title,
  itemName,
  dependencies: initialDeps,
  fieldDefinitionId,
  fieldLogicalName,
  onClose,
  onDepsCleared,
  onOpenBusinessRule,
  onOpenProcessFlow,
  onOpenNavigation,
}: DependencyBlockModalProps) {
  const [deps, setDeps] = useState<Dependency[]>(initialDeps);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const depKey = (d: Dependency, i: number) => `${d.type}-${d.recordId ?? i}-${d.subType ?? ''}`;

  const handleRemove = async (dep: Dependency, key: string) => {
    if (!fieldDefinitionId && !fieldLogicalName) return;
    setRemoving(key);
    try {
      if (dep.type === 'form' && dep.recordId && fieldDefinitionId) {
        await removeFieldFromForm(dep.recordId, fieldDefinitionId);
      } else if (dep.type === 'view' && dep.recordId) {
        if (dep.subType === 'column' && fieldDefinitionId) {
          await removeFieldFromViewColumn(dep.recordId, fieldDefinitionId);
        } else if (dep.subType === 'filter' && fieldLogicalName) {
          await removeFieldFromViewFilter(dep.recordId, fieldLogicalName);
        } else if (dep.subType === 'sort' && fieldLogicalName) {
          await removeFieldFromViewSort(dep.recordId, fieldLogicalName);
        }
      }
      setRemoved((prev) => new Set([...prev, key]));
      const remaining = deps.filter((_, i) => depKey(_, i) !== key && !removed.has(depKey(_, i)));
      setDeps(remaining);
      if (remaining.length === 0) onDepsCleared?.();
    } catch (e) {
      console.error('Failed to remove dependency:', e);
    } finally {
      setRemoving(null);
    }
  };

  const activeDeps = deps.filter((d, i) => !removed.has(depKey(d, i)));
  const grouped = TYPE_ORDER.reduce<Record<string, { dep: Dependency; key: string }[]>>((acc, type) => {
    const items = activeDeps
      .map((d, i) => ({ dep: d, key: depKey(d, i) }))
      .filter(({ dep }) => dep.type === type);
    if (items.length > 0) acc[type] = items;
    return acc;
  }, {});

  const canRemove = (dep: Dependency) =>
    (dep.type === 'form' && !!dep.recordId) ||
    (dep.type === 'view' && !!dep.recordId && !!dep.subType);

  const canOpen = (dep: Dependency) =>
    (dep.type === 'business_rule' && !!dep.recordId && !!onOpenBusinessRule) ||
    (dep.type === 'process_flow' && !!dep.recordId && !!onOpenProcessFlow) ||
    (dep.type === 'navigation' && !!onOpenNavigation);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              <span className="font-medium text-slate-700">"{itemName}"</span>{' '}
              {activeDeps.length > 0
                ? <>is used in {activeDeps.length} place{activeDeps.length !== 1 ? 's' : ''} and cannot be deleted.</>
                : <span className="text-emerald-600 font-medium">All dependencies resolved — you can now delete this item.</span>
              }
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors -mt-0.5"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeDeps.length > 0 && (
            <p className="text-[12px] text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 leading-relaxed">
              Resolve each dependency below before deletion is allowed. Use "Open" to navigate to the editor, or "Remove" where available.
            </p>
          )}

          {activeDeps.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle size={32} className="text-emerald-500 mb-3" />
              <p className="text-[13px] font-medium text-slate-700">All dependencies have been removed.</p>
              <p className="text-[12px] text-slate-400 mt-1">Close this dialog and try deleting again.</p>
            </div>
          )}

          {Object.entries(grouped).map(([type, items]) => {
            const cfg = TYPE_CONFIG[type as Dependency['type']];
            return (
              <div key={type} className="space-y-1.5">
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${cfg.color}`}>
                  {cfg.icon}
                  {cfg.label}
                  <span className="ml-0.5 opacity-60">({items.length})</span>
                </div>
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  {items.map(({ dep, key }) => (
                    <div
                      key={key}
                      className={`flex items-start gap-3 px-3.5 py-2.5 ${items[items.length - 1].key !== key ? 'border-b border-slate-100' : ''}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-slate-800 truncate">{dep.name}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">{dep.location}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{dep.reason}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                        {canRemove(dep) && (
                          <button
                            onClick={() => handleRemove(dep, key)}
                            disabled={removing === key}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
                            title="Remove from this location"
                          >
                            {removing === key
                              ? <Loader size={11} className="animate-spin" />
                              : <Trash2 size={11} />
                            }
                            Remove
                          </button>
                        )}
                        {canOpen(dep) && (
                          <button
                            onClick={() => {
                              if (dep.type === 'business_rule' && dep.recordId) onOpenBusinessRule?.(dep.recordId);
                              if (dep.type === 'process_flow' && dep.recordId) onOpenProcessFlow?.(dep.recordId);
                              if (dep.type === 'navigation') onOpenNavigation?.();
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors"
                            title={dep.type === 'navigation' ? 'Open Navigation editor' : 'Open editor'}
                          >
                            <ExternalLink size={11} />
                            {dep.type === 'navigation' ? 'Open Navigation' : 'Open'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-slate-200 shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 text-[13px] font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
