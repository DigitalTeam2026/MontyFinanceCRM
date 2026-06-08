import { useState, useEffect } from 'react';
import { X, GitMerge } from 'lucide-react';
import SearchableSelect from '../../app/components/SearchableSelect';
import type { ProcessFlow, ProcessFlowFormData } from '../../types/processFlow';
import type { EntityDefinition } from '../../types/entity';
import { createProcessFlow, fetchFormsForEntity, ensurePrimaryEntityConfig } from '../../services/processFlowService';
import { useToast } from '../../app/context/ToastContext';

interface ProcessFlowFormModalProps {
  entities: EntityDefinition[];
  onClose: () => void;
  onCreated: (flow: ProcessFlow) => void;
}

const STAGE_FIELD_BY_ENTITY: Record<string, string> = {
  opportunity: 'stage',
  lead: 'state_code',
  contact: 'state_code',
  ticket: 'state_code',
};

function deriveStageField(entities: EntityDefinition[], entityId: string): string {
  const entity = entities.find((e) => e.entity_definition_id === entityId);
  return STAGE_FIELD_BY_ENTITY[entity?.logical_name ?? ''] ?? 'stage';
}

interface FormOption {
  form_id: string;
  name: string;
  is_default: boolean;
}

export default function ProcessFlowFormModal({ entities, onClose, onCreated }: ProcessFlowFormModalProps) {
  const { showError } = useToast();
  const defaultEntityId = entities[0]?.entity_definition_id ?? '';
  const [form, setForm] = useState<ProcessFlowFormData>({
    name: '',
    description: '',
    entity_definition_id: defaultEntityId,
    lob_id: null,
    product_id: null,
    form_id: null,
    stage_field: deriveStageField(entities, defaultEntityId),
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [availableForms, setAvailableForms] = useState<FormOption[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);

  useEffect(() => {
    if (!form.entity_definition_id) { setAvailableForms([]); return; }
    setLoadingForms(true);
    fetchFormsForEntity(form.entity_definition_id)
      .then((forms) => {
        setAvailableForms(forms);
        const defaultForm = forms.find((f) => f.is_default);
        setForm((prev) => ({ ...prev, form_id: defaultForm?.form_id ?? forms[0]?.form_id ?? null }));
      })
      .catch(() => setAvailableForms([]))
      .finally(() => setLoadingForms(false));
  }, [form.entity_definition_id]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.entity_definition_id) return;
    setSaving(true);
    try {
      const flow = await createProcessFlow(form);
      // Seed the primary entity config entry
      await ensurePrimaryEntityConfig(flow.process_flow_id, flow.entity_definition_id, form.form_id ?? null);
      onCreated(flow);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const set = (field: keyof ProcessFlowFormData, value: string | boolean | null) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleEntityChange = (entityId: string) => {
    setForm((prev) => ({
      ...prev,
      entity_definition_id: entityId,
      stage_field: deriveStageField(entities, entityId),
      form_id: null,
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <GitMerge size={16} className="text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900">New Process Flow</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Sales Pipeline"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              placeholder="Describe the purpose of this process flow"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Primary Entity <span className="text-red-500">*</span></label>
              <SearchableSelect
                options={entities.map((e) => ({ value: e.entity_definition_id, label: e.display_name }))}
                value={form.entity_definition_id}
                onChange={handleEntityChange}
                placeholder="Select entity..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Primary Form</label>
              <SearchableSelect
                options={[
                  { value: '', label: 'Default main form' },
                  ...availableForms.map((f) => ({ value: f.form_id, label: `${f.name}${f.is_default ? ' (default)' : ''}` })),
                ]}
                value={form.form_id ?? ''}
                onChange={(v) => set('form_id', v || null)}
                placeholder="Default main form"
                disabled={loadingForms || availableForms.length === 0}
              />
              {loadingForms && (
                <p className="text-[10px] text-gray-400 mt-1">Loading forms...</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={(e) => set('is_active', e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded"
            />
            <label htmlFor="is_active" className="text-sm text-gray-700">Active</label>
          </div>

          <p className="text-xs text-gray-400">
            Related entities, relationships, and scope (LOB / Product) can be configured in the flow's Settings tab after creation.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim() || !form.entity_definition_id}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Creating...' : 'Create & Configure'}
          </button>
        </div>
      </div>
    </div>
  );
}
