import { useState } from 'react';
import { X, Save, Loader2, Globe, Lock } from 'lucide-react';
import type { ColumnState } from './ColumnCustomizer';
import type { ActiveFilter } from '../services/listService';
import { savePersonalView } from '../../services/viewService';
import { useToast, toFriendlyError } from '../context/ToastContext';

interface SaveViewModalProps {
  entityDefinitionId: string;
  columnStates: ColumnState[];
  filters: ActiveFilter[];
  sortKey: string;
  sortDir: 'asc' | 'desc';
  onSaved: (viewId: string, viewName: string) => void;
  onClose: () => void;
}

export default function SaveViewModal({
  entityDefinitionId,
  columnStates,
  filters: _filters,
  sortKey: _sortKey,
  sortDir: _sortDir,
  onSaved,
  onClose,
}: SaveViewModalProps) {
  const { showError } = useToast();
  const [name, setName] = useState('');
  const [viewType, setViewType] = useState<'personal' | 'public'>('personal');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      // Resolve field_definition_ids from column states — we stored them on ColumnState
      const cols = columnStates
        .filter((c) => c.visible && c.field_definition_id)
        .map((c, i) => ({
          field_definition_id: c.field_definition_id!,
          label_override: c.labelOverride ?? null,
          width: c.width ?? null,
          is_sortable: c.sortable ?? false,
          display_order: i,
          relationship_definition_id: c.relationship_definition_id ?? null,
        }));

      const view = await savePersonalView({
        entityDefinitionId,
        name: name.trim(),
        viewType,
        isDefault,
        columns: cols,
      });

      onSaved(view.view_id, view.name);
    } catch (err) {
      showError(toFriendlyError(err, 'Unable to save view.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Save size={16} className="text-blue-600" />
            <h2 className="text-[14px] font-semibold text-slate-800">Save View As</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X size={14} className="text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              View Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
              placeholder="e.g. My Active Accounts"
              className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Visibility
            </label>
            <div className="flex gap-2">
              {(['personal', 'public'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setViewType(type)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] font-medium transition ${
                    viewType === type
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {type === 'personal' ? <Lock size={12} /> : <Globe size={12} />}
                  {type === 'personal' ? 'Personal' : 'Public'}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              {viewType === 'personal'
                ? 'Only visible to you.'
                : 'Visible to all users in your organization.'}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              id="set_default"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="set_default" className="text-[13px] text-slate-600 cursor-pointer select-none">
              Set as default view for this entity
            </label>
          </div>

          <div className="bg-slate-50 rounded-lg px-3 py-2.5">
            <p className="text-[11px] font-semibold text-slate-500 mb-1">Columns to save ({columnStates.filter((c) => c.visible).length})</p>
            <p className="text-[11px] text-slate-400">
              {columnStates.filter((c) => c.visible).map((c) => c.labelOverride || c.label).join(', ')}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-slate-100 bg-slate-50">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            Save View
          </button>
        </div>
      </div>
    </div>
  );
}
