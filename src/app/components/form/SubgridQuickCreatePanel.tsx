import FilterSelect from '../FilterSelect';
import { useState, useEffect, useRef } from 'react';
import { X, Save, Loader2, AlertCircle, FileText, Plus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { DesignerControl } from '../../../types/form';
import { useToast, toFriendlyError } from '../../context/ToastContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldMeta {
  logical_name: string;
  physical_column_name: string;
  display_name: string;
  field_type: string;
  is_required: boolean;
  config_json: Record<string, unknown> | null;
}

interface OptionItem {
  value: string;
  label: string;
}

const optionCache: Record<string, OptionItem[]> = {};

async function loadOptionSetValues(optionSetName: string): Promise<OptionItem[]> {
  if (optionCache[optionSetName]) return optionCache[optionSetName];
  const { data } = await supabase
    .from('option_set')
    .select('option_set_id')
    .eq('name', optionSetName)
    .maybeSingle();
  if (!data) return [];
  const { data: vals } = await supabase
    .from('option_set_value')
    .select('value, label')
    .eq('option_set_id', data.option_set_id)
    .order('display_order');
  const items = ((vals ?? []) as { value: string; label: string }[]).map((v) => ({
    value: v.value,
    label: v.label,
  }));
  optionCache[optionSetName] = items;
  return items;
}

// ─── Single field input ───────────────────────────────────────────────────────

function FieldInput({
  meta,
  value,
  onChange,
  disabled,
}: {
  meta: FieldMeta;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<OptionItem[]>([]);

  const base =
    'w-full h-8 px-2.5 text-[13px] text-slate-700 bg-white border border-slate-200 rounded-md ' +
    'placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition ' +
    'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed';

  useEffect(() => {
    const cfg = meta.config_json;
    const osName = cfg?.option_set_name as string | undefined;
    if (!osName && meta.field_type !== 'choice' && meta.field_type !== 'option_set') return;
    const name = osName ?? '';
    if (!name) return;
    loadOptionSetValues(name).then(setOptions);
  }, [meta]);

  const ft = meta.field_type;

  if (ft === 'boolean') {
    return (
      <FilterSelect
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value === 'true' ? true : e.target.value === 'false' ? false : null)}
        disabled={disabled}
        className={base}
      >
        <option value="">— Select —</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </FilterSelect>
    );
  }

  if (ft === 'choice' || ft === 'option_set') {
    return (
      <FilterSelect
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className={base}
      >
        <option value="">— Select —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </FilterSelect>
    );
  }

  if (ft === 'textarea') {
    return (
      <textarea
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        className={`${base} h-auto py-1.5 resize-none`}
        placeholder={meta.display_name}
      />
    );
  }

  const inputType =
    ft === 'email' ? 'email' :
    ft === 'phone' ? 'tel' :
    ft === 'url' ? 'url' :
    ft === 'number' || ft === 'decimal' || ft === 'currency' ? 'number' :
    ft === 'date' ? 'date' :
    ft === 'datetime' ? 'datetime-local' :
    'text';

  return (
    <input
      type={inputType}
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={meta.display_name}
      className={base}
      step={ft === 'decimal' || ft === 'currency' ? '0.01' : undefined}
    />
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface SubgridQuickCreatePanelProps {
  title: string;
  quickCreateFormId: string;
  relatedEntityName: string;
  fkColumn: string;
  parentId: string;
  parentLabel?: string;
  relationshipDefinitionId?: string | null;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onSaveAndNew?: (values: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

interface FormRow {
  control: DesignerControl;
  meta: FieldMeta | null;
}

export default function SubgridQuickCreatePanel({
  title,
  quickCreateFormId,
  relatedEntityName,
  fkColumn,
  parentId,
  parentLabel,
  onSave,
  onSaveAndNew,
  onClose,
}: SubgridQuickCreatePanelProps) {
  const { showError } = useToast();
  const [rows, setRows] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMode, setSaveMode] = useState<'close' | 'new'>('close');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Load form definition + field metadata
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Fetch form definition
        const { data: formDef } = await supabase
          .from('form_definition')
          .select('layout_json, entity_definition_id')
          .eq('form_id', quickCreateFormId)
          .maybeSingle();

        if (!formDef?.layout_json) { setLoading(false); return; }

        const layout = formDef.layout_json as { tabs: { sections: { controls: DesignerControl[] }[] }[] };
        const controls: DesignerControl[] = [];
        for (const tab of layout.tabs ?? []) {
          for (const section of tab.sections ?? []) {
            for (const control of section.controls ?? []) {
              if (control.control_type === 'field' && control.field_definition_id) {
                controls.push(control);
              }
            }
          }
        }

        // Fetch field metadata for all controls
        const fieldIds = controls.map((c) => c.field_definition_id!).filter(Boolean);
        let fieldMetaMap: Record<string, FieldMeta> = {};

        if (fieldIds.length > 0) {
          const { data: fieldDefs } = await supabase
            .from('field_definition')
            .select('field_definition_id, logical_name, physical_column_name, display_name, is_required, config_json, field_type:field_type_id(name)')
            .in('field_definition_id', fieldIds);

          for (const fd of (fieldDefs as Record<string, unknown>[] ?? [])) {
            const ft = fd.field_type as { name: string } | null;
            fieldMetaMap[fd.field_definition_id as string] = {
              logical_name: fd.logical_name as string,
              physical_column_name: fd.physical_column_name as string,
              display_name: fd.display_name as string,
              field_type: ft?.name ?? 'text',
              is_required: fd.is_required as boolean,
              config_json: fd.config_json as Record<string, unknown> | null,
            };
          }
        }

        const formRows: FormRow[] = controls.map((control) => ({
          control,
          meta: control.field_definition_id ? (fieldMetaMap[control.field_definition_id] ?? null) : null,
        }));

        // Skip FK field (it's pre-filled from parent) — check both logical and physical name
        const visible = formRows.filter((r) => r.meta && r.meta.logical_name !== fkColumn && r.meta.physical_column_name !== fkColumn);
        setRows(visible);
      } catch {
        // fallback: show empty
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [quickCreateFormId, fkColumn]);

  const set = (key: string, val: unknown) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    for (const row of rows) {
      if (!row.meta) continue;
      const isRequired = row.control.is_required_override || row.meta.is_required;
      if (isRequired) {
        const v = values[row.meta.logical_name];
        if (v == null || String(v).trim() === '') {
          errs[row.meta.logical_name] = `${row.control.label_override ?? row.meta.display_name} is required`;
        }
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildPayload = () => {
    const payload: Record<string, unknown> = {};
    for (const row of rows) {
      if (!row.meta) continue;
      const v = values[row.meta.logical_name];
      // Use physical_column_name so PostgREST receives valid DB column names
      if (v != null && v !== '') payload[row.meta.physical_column_name] = v;
    }
    return payload;
  };

  const handleSave = async (mode: 'close' | 'new') => {
    if (!validate()) return;
    setSaveMode(mode);
    setSaving(true);
    try {
      const payload = buildPayload();
      if (mode === 'new' && onSaveAndNew) {
        await onSaveAndNew(payload);
        // Reset form for next entry
        setValues({});
        setErrors({});
      } else {
        await onSave(payload);
      }
    } catch (e) {
      showError(toFriendlyError(e, 'Unable to create the record.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed top-0 right-0 bottom-0 z-50 w-[400px] max-w-full bg-white shadow-2xl flex flex-col"
        style={{ borderLeft: '1px solid #e2e8f0' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-md bg-blue-100 flex items-center justify-center shrink-0">
              <FileText size={14} className="text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-slate-800 truncate">
                Quick Create: {title}
              </p>
              {parentLabel && (
                <p className="text-[11px] text-slate-400 truncate">{parentLabel}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 shrink-0 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition ml-2"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={18} className="animate-spin text-slate-300" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <AlertCircle size={24} className="text-slate-200" />
              <div>
                <p className="text-[12px] font-medium text-slate-500">No fields configured</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Add fields to the Quick Create form in the Form Designer.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Parent record link (read-only) */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  {relatedEntityName.charAt(0).toUpperCase() + relatedEntityName.slice(1)}
                </label>
                <div className="flex items-center gap-2 h-8 px-2.5 text-[13px] text-slate-500 bg-slate-50 border border-slate-200 rounded-md">
                  <span className="truncate">{parentLabel ?? parentId}</span>
                  <span className="ml-auto text-[10px] text-slate-300 shrink-0">locked</span>
                </div>
              </div>

              {rows.map((row) => {
                if (!row.meta) return null;
                const label = row.control.label_override ?? row.meta.display_name;
                const isRequired = row.control.is_required_override || row.meta.is_required;
                return (
                  <div key={row.control.id}>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      {label}
                      {isRequired && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <FieldInput
                      meta={row.meta}
                      value={values[row.meta.logical_name] ?? ''}
                      onChange={(v) => set(row.meta!.logical_name, v)}
                      disabled={saving}
                    />
                    {errors[row.meta.logical_name] && (
                      <p className="text-[11px] text-red-500 mt-1">{errors[row.meta.logical_name]}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2 text-[12px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition disabled:opacity-50"
          >
            Cancel
          </button>
          <div className="flex-1" />
          {onSaveAndNew && (
            <button
              onClick={() => handleSave('new')}
              disabled={saving || loading || rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && saveMode === 'new' ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Save & New
            </button>
          )}
          <button
            onClick={() => handleSave('close')}
            disabled={saving || loading || rows.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && saveMode === 'close' ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            Save & Close
          </button>
        </div>
      </div>
    </>
  );
}