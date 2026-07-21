import { useEffect } from 'react';
import { X, SlidersHorizontal, Database } from 'lucide-react';
import type { DesignerStore } from './designerStore';
import { ControlProperties } from './PropertiesPanel';

interface FieldSettingsModalProps {
  store: DesignerStore;
  /** field_definition_id for each lookup field: keyed by field_definition_id */
  lookupEntityMap: Record<string, string>;
  /** Opens the shared column-definition editor for this control's field. */
  onEditColumn: (fieldDefinitionId: string) => void;
  onClose: () => void;
}

/**
 * Click a control on the canvas → this opens over the designer so the field can be
 * edited in place. Form-level settings (label override, width, visibility, required,
 * lookup config) are the same editor the right-hand properties panel renders, so the
 * two surfaces can never drift apart. The real column definition — data type, choices,
 * max length — lives in field_definition and is reached via "Edit column definition".
 */
export default function FieldSettingsModal({
  store, lookupEntityMap, onEditColumn, onClose,
}: FieldSettingsModalProps) {
  const tab = store.getSelectedTab();
  const section = store.getSelectedSection();
  const control = store.getSelectedControl();

  // "Remove Field" inside ControlProperties deletes the control out from under us.
  const gone = !tab || !section || !control;
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!tab || !section || !control) return null;

  const title = control.label_override ?? control.field_display_name
    ?? control.field_logical_name ?? 'Control';

  // Only a real field control maps to a row in field_definition.
  const canEditColumn = control.control_type === 'field' && !!control.field_definition_id
    && !control.borrowed_field_config;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[85vh]">
        <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <SlidersHorizontal size={14} className="text-blue-500 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-800 truncate">{title}</h3>
              {control.field_logical_name && (
                <p className="text-[10px] text-slate-400 font-mono truncate">{control.field_logical_name}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <ControlProperties
            store={store}
            tab={tab}
            section={section}
            control={control}
            lookupEntityMap={lookupEntityMap}
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl shrink-0">
          {canEditColumn ? (
            <button
              onClick={() => onEditColumn(control.field_definition_id!)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              <Database size={12} />
              Edit column definition
            </button>
          ) : <span />}
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
