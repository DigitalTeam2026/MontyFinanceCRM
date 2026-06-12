import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Save, AlertTriangle, Star, StarOff, ToggleLeft, ToggleRight, ArrowRight, LogIn } from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type {
  EntityConversionRule,
  EntityConversionRuleFormData,
  EntityConversionFieldMapping,
} from '../../types/entityConversion';
import {
  fetchConversionRuleWithMappings,
  updateConversionRule,
  replaceConversionMappings,
} from '../../services/entityConversionService';
import { fetchEntities } from '../../services/entityService';
import { fetchFieldsForEntity } from '../../services/fieldService';
import ConversionFieldMappingPanel from './ConversionFieldMappingPanel';
import type { FieldOption } from './ConversionFieldMappingPanel';

interface Props {
  rule: EntityConversionRule;
  onBack: () => void;
  onUpdated: (rule: EntityConversionRule) => void;
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export default function ConversionRuleEditorPage({ rule, onBack, onUpdated }: Props) {
  const { showSuccess, showError } = useToast();
  const [form, setForm] = useState<EntityConversionRuleFormData>(toForm(rule));
  const [mappings, setMappings] = useState<EntityConversionFieldMapping[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sourceFields, setSourceFields] = useState<FieldOption[]>([]);
  const [targetFields, setTargetFields] = useState<FieldOption[]>([]);

  const sourceLabel = cap(rule.source_entity);
  const targetLabel = cap(rule.target_entity);

  function toForm(r: EntityConversionRule): EntityConversionRuleFormData {
    return {
      name: r.name,
      description: r.description ?? '',
      is_active: r.is_active,
      is_default: r.is_default,
    };
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [full, entities] = await Promise.all([
        fetchConversionRuleWithMappings(rule.entity_conversion_rule_id),
        fetchEntities(),
      ]);
      setMappings(full.mappings ?? []);

      const entityMap = new Map(entities.map((e) => [e.logical_name, e.entity_definition_id]));
      const toOptions = (entityName: string): Promise<FieldOption[]> => {
        const id = entityMap.get(entityName);
        if (!id) return Promise.resolve([]);
        return fetchFieldsForEntity(id).then((fields) =>
          fields
            .filter((f) => f.is_active)
            // The mapping stores PHYSICAL column names — that's what the conversion
            // RPC reads from the source row and writes to the target row.
            .map((f) => ({ value: f.physical_column_name ?? f.logical_name, display_name: f.display_name })),
        );
      };

      const [sf, tf] = await Promise.all([
        toOptions(rule.source_entity),
        toOptions(rule.target_entity),
      ]);
      setSourceFields(sf);
      setTargetFields(tf);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to load conversion rule');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule.entity_conversion_rule_id]);

  useEffect(() => {
    setForm(toForm(rule));
    setDirty(false);
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule.entity_conversion_rule_id]);

  const set = <K extends keyof EntityConversionRuleFormData>(key: K, value: EntityConversionRuleFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleMappingsChange = (newMappings: EntityConversionFieldMapping[]) => {
    setMappings(newMappings);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showError('Name is required.'); return; }
    setSaving(true);
    try {
      const updated = await updateConversionRule(rule.entity_conversion_rule_id, form);
      const payload = mappings.map(
        ({ entity_conversion_field_mapping_id, entity_conversion_rule_id, created_at, ...rest }) => rest,
      );
      const savedMappings = await replaceConversionMappings(rule.entity_conversion_rule_id, payload);
      setMappings(savedMappings);
      onUpdated({ ...updated, mappings: savedMappings });
      setDirty(false);
      showSuccess('Conversion rule saved');
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft size={14} />Conversions
          </button>
          <span className="text-gray-200">·</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{form.name || 'Untitled Rule'}</span>
            {form.is_default && <Star size={11} className="text-amber-400 fill-amber-400" />}
            {rule.is_system && <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0">system</span>}
          </div>
        </div>
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save size={12} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-5 py-6 space-y-8">

          {/* Flow summary */}
          <div className="flex items-center gap-3 p-4 rounded-xl border border-blue-100 bg-blue-50/50">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
              <span className="px-2.5 py-1 rounded-lg bg-white border border-blue-200">{sourceLabel}</span>
              <ArrowRight size={16} className="text-blue-400" />
              <span className="px-2.5 py-1 rounded-lg bg-white border border-blue-200 flex items-center gap-1.5">
                <LogIn size={12} />{targetLabel}
              </span>
            </div>
            <p className="text-xs text-blue-600/80 ml-2">
              On convert: a new {targetLabel} is created from the mapped fields, then the new {targetLabel} GUID is
              written back onto the {sourceLabel} and its status is set to Converted.
            </p>
          </div>

          {/* Identity */}
          <Section title="Identity">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Rule Name <span className="text-red-500">*</span></label>
                <input
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  rows={2}
                  placeholder="Describe when this conversion rule should be used..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div className="flex flex-col gap-2.5">
                <Toggle label="Active" description="Rule is available during conversion" checked={form.is_active} onChange={(v) => set('is_active', v)} />
                <Toggle
                  label="Default Rule"
                  description="Used when no rule is explicitly selected"
                  checked={form.is_default}
                  onChange={(v) => set('is_default', v)}
                  icon={form.is_default ? <Star size={12} className="text-amber-400 fill-amber-400" /> : <StarOff size={12} className="text-gray-400" />}
                />
              </div>
            </div>
          </Section>

          {/* Field Mappings */}
          <Section title="Field Mappings" subtitle={`Map ${sourceLabel} fields onto the new ${targetLabel}`}>
            {loading ? (
              <div className="text-xs text-gray-400 py-4">Loading mappings...</div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3 text-[10px] text-gray-400">
                  <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{rule.source_entity}_field</span>
                  <ArrowRight size={11} />
                  <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{rule.target_entity}_field</span>
                </div>
                <ConversionFieldMappingPanel
                  mappings={mappings}
                  onChange={handleMappingsChange}
                  sourceFields={sourceFields}
                  targetFields={targetFields}
                  sourceLabel={sourceLabel}
                  targetLabel={targetLabel}
                />
              </>
            )}
          </Section>

          {rule.is_system && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800">System Rule</p>
                <p className="text-xs text-amber-700 mt-0.5">This system-provided rule cannot be deleted, but all settings and mappings can be customized.</p>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2 pb-6">
            {dirty && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Save size={14} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-900 mb-1">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 mb-4">{subtitle}</p>}
      {children}
    </div>
  );
}

function Toggle({ label, description, checked, onChange, icon }: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all w-full ${
        checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      <div className="flex-shrink-0">
        {checked ? <ToggleRight size={18} className="text-blue-600" /> : <ToggleLeft size={18} className="text-gray-400" />}
      </div>
      {icon && <div className="flex-shrink-0">{icon}</div>}
      <div>
        <p className="text-xs font-semibold text-gray-800">{label}</p>
        {description && <p className="text-[10px] text-gray-400 mt-0">{description}</p>}
      </div>
    </button>
  );
}
