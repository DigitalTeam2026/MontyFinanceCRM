import { useState, useEffect, useRef } from 'react';
import { X, Save, Loader2, AlertCircle, FileText, Plus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { DesignerControl } from '../../../types/form';
import { useToast, toFriendlyError } from '../../context/ToastContext';
import FormField, { PRODUCT_PICKER_SENTINEL } from './FormField';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldDefRow {
  field_definition_id: string;
  logical_name: string;
  physical_column_name: string;
  display_name: string;
  is_required: boolean;
  config_json: Record<string, unknown> | null;
  field_type?: { name: string } | null;
  lookup_entity?: { logical_name: string; physical_table_name: string } | null;
}

/** A ready-to-render field: an enriched control plus the choice/lookup metadata
 *  the shared FormField engine needs to actually SHOW the data for every type. */
interface FormRow {
  control: DesignerControl;
  logical: string;
  physical: string;
  isRequired: boolean;
  optionSetName?: string;
  choiceOptions?: { value: string; label: string }[];
}

/** Entity logical_name (DB) → lookup entity slug used by FormField's LookupField.
 *  Anything not listed falls back to the raw logical_name, which LookupField
 *  resolves dynamically against entity_definition. */
const ENTITY_LOGICAL_TO_SLUG: Record<string, string> = {
  account: 'accounts',
  contact: 'contacts',
  lead: 'leads',
  opportunity: 'opportunities',
  ticket: 'tickets',
  crm_user: 'users',
};

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
  const [entityDefinitionId, setEntityDefinitionId] = useState<string | undefined>(undefined);
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

  // Load form definition + field metadata, then enrich each control so FormField
  // can render every field type (lookup / choice / boolean / datetime / …) with data.
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
        setEntityDefinitionId((formDef.entity_definition_id as string) ?? undefined);

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

        // Fetch enriched field metadata for all controls — same shape RecordFormPage
        // uses: field type name, lookup target entity, and config_json (option sets /
        // inline choices). This is what makes lookups/choices actually show data.
        const fieldIds = controls.map((c) => c.field_definition_id!).filter(Boolean);
        const fieldMetaMap: Record<string, FieldDefRow> = {};

        if (fieldIds.length > 0) {
          const { data: fieldDefs } = await supabase
            .from('field_definition')
            .select('field_definition_id, logical_name, physical_column_name, display_name, is_required, config_json, field_type:field_type_id(name), lookup_entity:entity_definition!lookup_entity_id(logical_name, physical_table_name)')
            .in('field_definition_id', fieldIds);

          for (const fd of ((fieldDefs as unknown as FieldDefRow[]) ?? [])) {
            fieldMetaMap[fd.field_definition_id] = fd;
          }
        }

        const formRows: FormRow[] = [];
        for (const control of controls) {
          const fd = control.field_definition_id ? fieldMetaMap[control.field_definition_id] : undefined;
          if (!fd) continue;

          const logical = control.field_logical_name ?? fd.logical_name;
          const physical = fd.physical_column_name;
          // Skip the FK field — it's pre-filled from the parent record.
          if (logical === fkColumn || physical === fkColumn) continue;

          const fieldType = fd.field_type?.name ?? control.field_type_name ?? 'text';

          // Resolve lookup target entity slug from the field's lookup_entity join.
          let lookupSlug: string | null = control.lookup_entity_slug ?? null;
          if (fieldType === 'lookup' && fd.lookup_entity?.logical_name) {
            const targetLogical = fd.lookup_entity.logical_name;
            lookupSlug = ENTITY_LOGICAL_TO_SLUG[targetLogical] ?? targetLogical;
          }

          // Resolve option set / inline choices for choice fields from config_json.
          const cfg = fd.config_json ?? undefined;
          let optionSetName: string | undefined;
          let choiceOptions: { value: string; label: string }[] | undefined;
          if (cfg) {
            if (cfg.control === 'product_picker') {
              optionSetName = PRODUCT_PICKER_SENTINEL;
            } else if (typeof cfg.option_set_name === 'string' && cfg.option_set_name) {
              optionSetName = cfg.option_set_name;
            }
            const choices = cfg.choices as { value: string; label: string }[] | undefined;
            if (Array.isArray(choices) && choices.length > 0) choiceOptions = choices;
          }

          const enriched: DesignerControl = {
            ...control,
            field_logical_name: logical,
            field_display_name: control.field_display_name ?? fd.display_name,
            field_type_name: fieldType,
            lookup_entity_slug: lookupSlug,
            lookup_config: control.lookup_config ?? null,
            config_json: fd.config_json ?? control.config_json ?? null,
          };

          formRows.push({
            control: enriched,
            logical,
            physical,
            isRequired: control.is_required_override || fd.is_required,
            optionSetName,
            choiceOptions,
          });
        }

        setRows(formRows);
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
      if (!row.isRequired) continue;
      const v = values[row.logical];
      const isEmpty = v == null
        || (Array.isArray(v) ? (v as unknown[]).length === 0 : String(v).trim() === '');
      if (isEmpty) {
        const label = row.control.label_override ?? row.control.field_display_name ?? row.logical;
        errs[row.logical] = `${label} is required`;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildPayload = () => {
    const payload: Record<string, unknown> = {};
    for (const row of rows) {
      const v = values[row.logical];
      // Use physical_column_name so PostgREST receives valid DB column names
      if (v != null && !(Array.isArray(v) ? v.length === 0 : v === '')) {
        payload[row.physical] = v;
      }
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

  // Include the locked parent FK in the value set so dependent lookups that filter
  // by the parent record resolve correctly.
  const formValues = { ...values, [fkColumn]: parentId };

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

              {rows.map((row) => (
                <FormField
                  key={row.control.id}
                  control={row.control}
                  value={values[row.logical] ?? ''}
                  onChange={(fieldLogicalName, v) => set(fieldLogicalName, v)}
                  isReadonly={saving}
                  isRequired={row.isRequired}
                  errorMessage={errors[row.logical] ?? null}
                  optionSetName={row.optionSetName}
                  choiceOptions={row.choiceOptions}
                  lookupConfig={row.control.lookup_config ?? null}
                  formValues={formValues}
                  entityDefinitionId={entityDefinitionId}
                />
              ))}
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
