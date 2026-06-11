import { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Info, X } from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import { supabase } from '../../lib/supabase';
import type { FormDefinition, SubgridConfig } from '../../types/form';
import type { FormScript, FormEventHandler } from '../../types/form';
import type { FieldDefinition, FieldFormData, FieldType, ChoiceOption } from '../../types/field';
import type { EntityDefinition } from '../../types/entity';
import type { BusinessRule } from '../../types/businessRule';
import {
  saveFormLayout,
  renameForm,
  publishForm,
  unpublishForm,
  fetchScripts,
  fetchEventHandlers,
  upsertScript,
  deleteScript,
  upsertEventHandler,
  deleteEventHandler,
} from '../../services/formService';
import {
  fetchFieldsForEntity,
  fetchFieldTypes,
  createField,
} from '../../services/fieldService';
import { fetchEntities } from '../../services/entityService';
import { createRule } from '../../services/businessRuleService';
import { useDesignerStore } from './designerStore';
import { uid } from './designerStore';
import FormToolbar from './FormToolbar';
import ComponentLibrary from './ComponentLibrary';
import FormCanvas from './FormCanvas';
import PropertiesPanel from './PropertiesPanel';
import FormTreeView from './FormTreeView';
import FieldEditorPanel from '../fields/FieldEditorPanel';
import SubgridPickerModal from './SubgridPickerModal';
import RuleEditorPage from '../rules/RuleEditorPage';

interface FormDesignerPageProps {
  form: FormDefinition;
  entityId: string;
  onBack: () => void;
  onFormUpdate: (form: FormDefinition) => void;
}

export default function FormDesignerPage({
  form: initialForm,
  entityId,
  onBack,
  onFormUpdate,
}: FormDesignerPageProps) {
  const { showSuccess, showError } = useToast();
  const [form, setForm] = useState<FormDefinition>(initialForm);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [fieldTypes, setFieldTypes] = useState<FieldType[]>([]);
  const [scripts, setScripts] = useState<FormScript[]>([]);
  const [handlers, setHandlers] = useState<FormEventHandler[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState(form.name);
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [activeTabId, setActiveTabId] = useState('');
  const [activeSectionId, setActiveSectionId] = useState('');
  const [showNewColumn, setShowNewColumn] = useState(false);
  const [showSubgridPicker, setShowSubgridPicker] = useState(false);
  const [formUsageInfo, setFormUsageInfo] = useState<string[]>([]);
  const [ruleEditorRule, setRuleEditorRule] = useState<BusinessRule | null>(null);

  const store = useDesignerStore(form.layout_json);

  useEffect(() => {
    const load = async () => {
      try {
        const [flds, ents, fts, sc, ev] = await Promise.all([
          fetchFieldsForEntity(entityId),
          fetchEntities(),
          fetchFieldTypes(),
          fetchScripts(form.form_id),
          fetchEventHandlers(form.form_id),
        ]);
        setFields(flds);
        setEntities(ents);
        setFieldTypes(fts);
        setScripts(sc);
        setHandlers(ev);

        const usages: string[] = [];
        if (form.is_default) usages.push('Default form for this entity');

        const { data: flowRefs } = await supabase
          .from('process_flow_entity_config')
          .select('process_flow:process_flow_id(name)')
          .eq('form_id', form.form_id);
        if (flowRefs) {
          for (const r of flowRefs) {
            const name = (r.process_flow as unknown as { name: string } | null)?.name;
            if (name) usages.push(`Used by "${name}" process flow`);
          }
        }

        const { data: directFlowRefs } = await supabase
          .from('process_flow')
          .select('name')
          .eq('form_id', form.form_id)
          .eq('is_active', true)
          .is('deleted_at', null);
        if (directFlowRefs) {
          for (const r of directFlowRefs) {
            if (r.name) usages.push(`Used by "${r.name}" process flow`);
          }
        }

        const uniqueUsages = [...new Set(usages)];
        setFormUsageInfo(uniqueUsages);
        if (uniqueUsages.length === 0) {
          setFormUsageInfo(['This form is not referenced by any process flow or set as default — changes will not appear on record forms']);
        }
        if (store.layout.tabs.length > 0) {
          const firstTab = store.layout.tabs[0];
          setActiveTabId(firstTab.id);
          if (firstTab.sections.length > 0) {
            setActiveSectionId(firstTab.sections[0].id);
          }
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [form.form_id, entityId]);

  // Build the set of field_definition_ids currently placed on the canvas
  const fieldsInForm = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    for (const tab of store.layout.tabs) {
      for (const section of tab.sections) {
        for (const control of section.controls) {
          if (control.field_definition_id) ids.add(control.field_definition_id);
        }
      }
    }
    return ids;
  }, [store.layout]);

  // Map field_definition_id → target entity_definition_id for lookup fields
  const lookupEntityMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const f of fields) {
      if (f.field_type?.name === 'lookup' && f.lookup_entity_id) {
        map[f.field_definition_id] = f.lookup_entity_id;
      }
    }
    return map;
  }, [fields]);

  const entityName = useMemo(
    () => entities.find((e) => e.entity_definition_id === entityId)?.logical_name ?? '',
    [entities, entityId],
  );

  const handleOpenRule = (rule: BusinessRule) => {
    setRuleEditorRule(rule);
  };

  const handleNewRule = async (fieldLogicalName: string, fieldDisplayName: string) => {
    try {
      const rule = await createRule({
        entity_definition_id: entityId,
        name: `${fieldDisplayName} Rule`,
        description: `Auto-created rule for field "${fieldDisplayName}"`,
      });
      const seeded: BusinessRule = {
        ...rule,
        trigger_json: {
          trigger_on: 'onChange',
          watch_fields: [fieldLogicalName],
          condition_group: null,
        },
        action_json: {
          if_actions: [{
            id: `a_${Date.now()}`,
            action_type: 'set_visibility',
            target_field: fieldLogicalName,
            target_field_display_name: fieldDisplayName,
            value: true,
          }],
          else_actions: [],
        },
      };
      setRuleEditorRule(seeded);
      showSuccess(`Rule "${rule.name}" created — configure it now`);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to create rule');
    }
  };

  const handleRename = async () => {
    const trimmedName = renameName.trim();
    if (!trimmedName) {
      setRenameError('Form name cannot be empty');
      return;
    }
    if (trimmedName === form.name) {
      setRenaming(false);
      setRenameError(null);
      return;
    }
    setRenameLoading(true);
    setRenameError(null);
    try {
      const { data: existing } = await supabase
        .from('form_definition')
        .select('form_id')
        .eq('entity_definition_id', entityId)
        .ilike('name', trimmedName)
        .is('deleted_at', null)
        .neq('form_id', form.form_id)
        .maybeSingle();
      if (existing) {
        setRenameError(`A form named "${trimmedName}" already exists for this entity`);
        return;
      }
      const updated = await renameForm(form.form_id, trimmedName);
      setForm(updated);
      onFormUpdate(updated);
      showSuccess(`Form renamed to "${trimmedName}"`);
      setRenaming(false);
      setRenameError(null);
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : 'Failed to rename form');
    } finally {
      setRenameLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const controlCount = store.layout.tabs.reduce(
        (n, t) => n + t.sections.reduce((m, s) => m + s.controls.length, 0), 0);
      const updated = await saveFormLayout(form.form_id, store.layout, renameName);

      const savedControlCount = (updated.layout_json?.tabs ?? []).reduce(
        (n: number, t: { sections: { controls: unknown[] }[] }) =>
          n + t.sections.reduce((m: number, s: { controls: unknown[] }) => m + s.controls.length, 0), 0);

      setForm(updated);
      onFormUpdate(updated);
      store.setDirty(false);

      if (savedControlCount !== controlCount) {
        showError(`Layout mismatch: sent ${controlCount} controls but database returned ${savedControlCount}`);
      } else if (!updated.is_default) {
        showSuccess(`Form saved — but this is not the default form. Publish it to make it the active default.`);
      } else {
        showSuccess(`Form saved — ${updated.layout_json?.tabs?.length ?? 0} tabs, ${savedControlCount} controls`);
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setSaving(true);
    try {
      if (store.dirty) {
        const saved = await saveFormLayout(form.form_id, store.layout, renameName);
        setForm(saved);
        onFormUpdate(saved);
        store.setDirty(false);
      }
      const wasPublished = form.is_published;
      const updated = wasPublished
        ? await unpublishForm(form.form_id)
        : await publishForm(form.form_id);
      setForm(updated);
      onFormUpdate(updated);
      showSuccess(wasPublished ? 'Unpublished' : 'Published');
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAddScript = async (s: Partial<FormScript>) => {
    const saved = await upsertScript(form.form_id, s);
    setScripts((prev) => [...prev, saved]);
  };

  const handleDeleteScript = async (id: string) => {
    await deleteScript(id);
    setScripts((prev) => prev.filter((s) => s.script_id !== id));
  };

  const handleAddHandler = async (h: Partial<FormEventHandler>) => {
    const saved = await upsertEventHandler(form.form_id, h);
    setHandlers((prev) => [...prev, saved]);
  };

  const handleDeleteHandler = async (id: string) => {
    await deleteEventHandler(id);
    setHandlers((prev) => prev.filter((e) => e.handler_id !== id));
  };

  // Create a new column from within the designer, then auto-add it to the active section
  const handleCreateColumn = async (formData: FieldFormData, choices: ChoiceOption[]) => {
    const created = await createField(formData, choices, fieldTypes);
    // Refresh the field list so the new column appears in the panel
    const refreshed = await fetchFieldsForEntity(entityId);
    setFields(refreshed);
    showSuccess(`Column "${created.display_name}" created`);
    // If a section is active, immediately add it to the canvas
    if (activeTabId && activeSectionId) {
      store.addControl(activeTabId, activeSectionId, {
        id: `new_${Date.now()}`,
        control_type: 'field',
        field_definition_id: created.field_definition_id,
        field_logical_name: created.logical_name,
        field_display_name: created.display_name,
        field_type_name: created.field_type?.name ?? null,
        label_override: null,
        column_span: 1,
        is_visible: true,
        is_readonly: false,
        is_required_override: created.is_required,
        subgrid_config: null,
      });
    }
    setShowNewColumn(false);
  };

  const handleAddSubgrid = (config: SubgridConfig, label: string) => {
    if (!activeTabId || !activeSectionId) return;
    store.addControl(activeTabId, activeSectionId, {
      id: uid(),
      control_type: 'subgrid',
      field_definition_id: null,
      field_logical_name: null,
      field_display_name: label,
      field_type_name: null,
      label_override: null,
      column_span: 2,
      is_visible: true,
      is_readonly: false,
      is_required_override: false,
      subgrid_config: config,
    });
    setShowSubgridPicker(false);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <FormToolbar
        form={form}
        dirty={store.dirty}
        saving={saving}
        onSave={handleSave}
        onPublish={handlePublish}
        onBack={onBack}
        onRenameClick={() => { setRenameName(form.name); setRenameError(null); setRenaming(true); }}
      />

      {formUsageInfo.length > 0 && (
        <div className="px-4 py-1.5 bg-blue-50 border-b border-blue-100 flex items-center gap-2 shrink-0">
          <Info size={12} className="text-blue-500 shrink-0" />
          <span className="text-[11px] text-blue-700">
            {formUsageInfo.join(' · ')}
          </span>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Tree view */}
        <div className="w-48 shrink-0 flex flex-col overflow-hidden border-r border-slate-200">
          <FormTreeView
            layout={store.layout}
            selection={store.selection}
            onSelect={(target) => {
              store.setSelection(target);
              if (target?.type === 'section') {
                setActiveTabId(target.tabId);
                setActiveSectionId(target.sectionId);
              } else if (target?.type === 'control') {
                setActiveTabId(target.tabId);
                setActiveSectionId(target.sectionId);
              } else if (target?.type === 'tab') {
                setActiveTabId(target.tabId);
              }
            }}
          />
        </div>

        {/* Column library — wider to show field names properly */}
        <div className="w-64 shrink-0 flex flex-col overflow-hidden border-r border-slate-200">
          <ComponentLibrary
            fields={fields}
            entities={entities}
            activeTabId={activeTabId}
            activeSectionId={activeSectionId}
            onAddControl={store.addControl}
            onAddTab={store.addTab}
            onAddSection={store.addSection}
            layoutTabId={activeTabId}
            fieldsInForm={fieldsInForm}
            onNewColumn={() => setShowNewColumn(true)}
            onAddSubgrid={() => setShowSubgridPicker(true)}
          />
        </div>

        {/* Canvas */}
        <FormCanvas
          store={store}
          onActiveSectionChange={(tabId, sectionId) => {
            setActiveTabId(tabId);
            setActiveSectionId(sectionId);
          }}
        />

        {/* Properties panel */}
        <div className="w-64 shrink-0 flex flex-col overflow-hidden border-l border-slate-200">
          <PropertiesPanel
            store={store}
            scripts={scripts}
            eventHandlers={handlers}
            onAddScript={handleAddScript}
            onDeleteScript={handleDeleteScript}
            onAddHandler={handleAddHandler}
            onDeleteHandler={handleDeleteHandler}
            lookupEntityMap={lookupEntityMap}
            entityId={entityId}
            entityName={entityName}
            onOpenRule={handleOpenRule}
            onNewRule={handleNewRule}
          />
        </div>
      </div>

      {/* Rename modal */}
      {renaming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => { if (!renameLoading) { setRenaming(false); setRenameError(null); } }}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Rename Form</h3>
            <input
              type="text"
              value={renameName}
              onChange={(e) => { setRenameName(e.target.value); setRenameError(null); }}
              className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-1 ${renameError ? 'border-red-400' : 'border-slate-200'}`}
              autoFocus
              disabled={renameLoading}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
            />
            {renameError && (
              <p className="text-xs text-red-600 mb-3">{renameError}</p>
            )}
            {!renameError && <div className="mb-3" />}
            <div className="flex gap-3">
              <button
                onClick={() => { if (!renameLoading) { setRenaming(false); setRenameError(null); } }}
                disabled={renameLoading}
                className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={renameLoading}
                className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {renameLoading && <RefreshCw size={12} className="animate-spin" />}
                {renameLoading ? 'Saving…' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Column panel — slides in from right, reuses FieldEditorPanel */}
      {showNewColumn && (
        <FieldEditorPanel
          entityId={entityId}
          fieldTypes={fieldTypes}
          entities={entities}
          onSave={handleCreateColumn}
          onClose={() => setShowNewColumn(false)}
        />
      )}

      {showSubgridPicker && (
        <SubgridPickerModal
          entityId={entityId}
          onConfirm={handleAddSubgrid}
          onClose={() => setShowSubgridPicker(false)}
        />
      )}

      {ruleEditorRule && (
        <div className="fixed inset-0 z-50 flex flex-col">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRuleEditorRule(null)} />
          <div className="relative flex-1 flex flex-col m-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 shrink-0">
              <span className="text-xs font-semibold text-slate-600">Business Rule Editor</span>
              <button
                onClick={() => setRuleEditorRule(null)}
                className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <RuleEditorPage
                rule={ruleEditorRule}
                entityId={entityId}
                entityName={entityName}
                onBack={() => setRuleEditorRule(null)}
                onRuleUpdate={(r) => setRuleEditorRule(r)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
