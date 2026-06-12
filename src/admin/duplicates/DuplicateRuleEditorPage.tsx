import FilterSelect from '../../app/components/FilterSelect';
import { useState, useEffect } from 'react';
import {
  ArrowLeft, Save, AlertTriangle, Plus, Trash2,
  ShieldAlert, AlertCircle, ToggleLeft, ToggleRight,
  Zap, Search, CheckSquare, X,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type { DuplicateDetectionRule, DuplicateDetectionRuleFormData, FuzzyMatchField } from '../../types/duplicateDetection';
import { BEHAVIOR_META, TRIGGER_LABELS } from '../../types/duplicateDetection';
import { updateDuplicateRule } from '../../services/duplicateDetectionService';

interface DuplicateRuleEditorPageProps {
  rule: DuplicateDetectionRule;
  onBack: () => void;
  onUpdated: (rule: DuplicateDetectionRule) => void;
}

const KNOWN_ENTITIES = [
  { logical_name: 'account',     display_name: 'Account' },
  { logical_name: 'contact',     display_name: 'Contact' },
  { logical_name: 'lead',        display_name: 'Lead' },
  { logical_name: 'opportunity', display_name: 'Opportunity' },
  { logical_name: 'case',        display_name: 'Case' },
];

const ENTITY_FIELD_SUGGESTIONS: Record<string, string[]> = {
  contact:     ['emailaddress1', 'telephone1', 'mobilephone', 'firstname', 'lastname', 'fullname'],
  lead:        ['emailaddress1', 'telephone1', 'mobilephone', 'firstname', 'lastname', 'companyname'],
  account:     ['name', 'address1_country', 'websiteurl', 'telephone1', 'accountnumber'],
  opportunity: ['name', 'parentaccountid', 'estimatedclosedate', 'estimatedvalue'],
  case:        ['title', 'customerid', 'casetypecode'],
};

export default function DuplicateRuleEditorPage({ rule, onBack, onUpdated }: DuplicateRuleEditorPageProps) {
  const { showSuccess, showError } = useToast();
  const [form, setForm] = useState<DuplicateDetectionRuleFormData>(toForm(rule));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(toForm(rule));
    setDirty(false);
  }, [rule.duplicate_rule_id]);

  function toForm(r: DuplicateDetectionRule): DuplicateDetectionRuleFormData {
    return {
      entity_logical_name: r.entity_logical_name,
      name: r.name,
      description: r.description,
      is_active: r.is_active,
      behavior: r.behavior,
      exact_match_fields: r.exact_match_fields ?? [],
      fuzzy_match_fields: r.fuzzy_match_fields ?? [],
      run_on_create: r.run_on_create,
      run_on_update: r.run_on_update,
      run_on_import: r.run_on_import,
      run_on_lead_qualify: r.run_on_lead_qualify,
    };
  }

  const set = <K extends keyof DuplicateDetectionRuleFormData>(key: K, value: DuplicateDetectionRuleFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showError('Rule name is required.'); return; }
    setSaving(true);
    try {
      const updated = await updateDuplicateRule(rule.duplicate_rule_id, form);
      onUpdated(updated);
      setDirty(false);
      showSuccess('Rule saved');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const suggestions = ENTITY_FIELD_SUGGESTIONS[form.entity_logical_name] ?? [];

  const addExactField = (field: string) => {
    if (!field || form.exact_match_fields.includes(field)) return;
    set('exact_match_fields', [...form.exact_match_fields, field]);
  };
  const removeExactField = (field: string) => set('exact_match_fields', form.exact_match_fields.filter((f) => f !== field));

  const addFuzzyField = () => set('fuzzy_match_fields', [...form.fuzzy_match_fields, { field: '', threshold: 85 }]);
  const removeFuzzyField = (i: number) => set('fuzzy_match_fields', form.fuzzy_match_fields.filter((_, idx) => idx !== i));
  const updateFuzzyField = (i: number, patch: Partial<FuzzyMatchField>) =>
    set('fuzzy_match_fields', form.fuzzy_match_fields.map((f, idx) => idx === i ? { ...f, ...patch } : f));

  const bMeta = BEHAVIOR_META[form.behavior];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft size={14} />
            Rules
          </button>
          <span className="text-gray-200">·</span>
          <div>
            <span className="text-sm font-semibold text-gray-900">{form.name || 'Untitled Rule'}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-400">{KNOWN_ENTITIES.find((e) => e.logical_name === form.entity_logical_name)?.display_name ?? form.entity_logical_name}</span>
              <span
                className="text-[10px] font-medium rounded-full px-1.5 py-0"
                style={{ backgroundColor: bMeta.bg, color: bMeta.color }}
              >
                {bMeta.label}
              </span>
              {rule.is_system && (
                <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0">system</span>
              )}
            </div>
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
        <div className="max-w-3xl mx-auto px-5 py-6 space-y-8">

          {/* ── Identity ──────────────────────────────────── */}
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
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Target Entity</label>
                <FilterSelect
                  value={form.entity_logical_name}
                  onChange={(e) => set('entity_logical_name', e.target.value)}
                  disabled={rule.is_system}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  {KNOWN_ENTITIES.map((e) => <option key={e.logical_name} value={e.logical_name}>{e.display_name}</option>)}
                </FilterSelect>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                <button
                  onClick={() => set('is_active', !form.is_active)}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-xl w-full hover:bg-gray-50 transition-colors"
                >
                  {form.is_active
                    ? <ToggleRight size={18} className="text-blue-600" />
                    : <ToggleLeft size={18} className="text-gray-400" />
                  }
                  <span className={form.is_active ? 'text-gray-800' : 'text-gray-400'}>
                    {form.is_active ? 'Active' : 'Inactive'}
                  </span>
                </button>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  rows={2}
                  placeholder="Describe when this rule fires and what it does..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            </div>
          </Section>

          {/* ── Behavior ──────────────────────────────────── */}
          <Section title="Behavior" subtitle="What happens when a duplicate is detected">
            <div className="grid grid-cols-2 gap-3">
              {(['warn', 'block'] as const).map((b) => {
                const meta = BEHAVIOR_META[b];
                return (
                  <button
                    key={b}
                    onClick={() => set('behavior', b)}
                    className={`text-left px-4 py-4 rounded-xl border-2 transition-all ${
                      form.behavior === b ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: meta.bg }}>
                        {b === 'block'
                          ? <ShieldAlert size={15} style={{ color: meta.color }} />
                          : <AlertCircle size={15} style={{ color: meta.color }} />
                        }
                      </div>
                      <span className="text-sm font-bold text-gray-800">{meta.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 leading-snug">{meta.description}</p>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ── Exact Match Fields ────────────────────────── */}
          <Section
            title="Exact Match Fields"
            subtitle="Records must match ALL of these fields exactly (case-insensitive, trimmed)"
            icon={<CheckSquare size={14} className="text-gray-400" />}
          >
            <div className="space-y-3">
              {form.exact_match_fields.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.exact_match_fields.map((field) => (
                    <div key={field} className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-2.5 py-1.5">
                      <code className="text-xs text-gray-700 font-mono">{field}</code>
                      <button onClick={() => removeExactField(field)} className="text-gray-400 hover:text-red-500 transition-colors">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <ExactFieldInput suggestions={suggestions} existing={form.exact_match_fields} onAdd={addExactField} />
              {form.exact_match_fields.length === 0 && (
                <p className="text-xs text-gray-400 italic">No exact fields — add at least one field for meaningful detection.</p>
              )}
            </div>
          </Section>

          {/* ── Fuzzy Match Fields ────────────────────────── */}
          <Section
            title="Fuzzy Match Fields"
            subtitle="Similarity-based matching — fire when similarity exceeds the threshold"
            icon={<Search size={14} className="text-gray-400" />}
          >
            <div className="space-y-3">
              {form.fuzzy_match_fields.map((f, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <div className="flex-1">
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">Field Name</label>
                    <input
                      value={f.field}
                      onChange={(e) => updateFuzzyField(i, { field: e.target.value })}
                      placeholder="field_logical_name"
                      list={`fuzzy-suggestions-${i}`}
                      className="w-full px-2 py-1.5 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <datalist id={`fuzzy-suggestions-${i}`}>
                      {suggestions.map((s) => <option key={s} value={s} />)}
                    </datalist>
                  </div>
                  <div className="w-36">
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">Similarity Threshold</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={50}
                        max={100}
                        step={5}
                        value={f.threshold}
                        onChange={(e) => updateFuzzyField(i, { threshold: parseInt(e.target.value) })}
                        className="flex-1 accent-blue-600"
                      />
                      <span className="text-xs font-semibold text-gray-700 w-8 text-right">{f.threshold}%</span>
                    </div>
                  </div>
                  <button onClick={() => removeFuzzyField(i)} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                onClick={addFuzzyField}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <Plus size={12} />
                Add fuzzy field
              </button>
              {form.fuzzy_match_fields.length === 0 && (
                <p className="text-xs text-gray-400 italic">No fuzzy fields configured — fuzzy matching is optional.</p>
              )}
            </div>
          </Section>

          {/* ── Triggers ──────────────────────────────────── */}
          <Section
            title="When to Run"
            subtitle="Choose which operations trigger this rule"
            icon={<Zap size={14} className="text-gray-400" />}
          >
            <div className="grid grid-cols-2 gap-3">
              {TRIGGER_LABELS.map((trigger) => {
                const isLead = trigger.key === 'run_on_lead_qualify';
                const checked = form[trigger.key];
                return (
                  <button
                    key={trigger.key}
                    onClick={() => set(trigger.key, !checked)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                      checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                    } ${isLead && form.entity_logical_name !== 'lead' ? 'opacity-40 pointer-events-none' : ''}`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0 ${
                      checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                    }`}>
                      {checked && <span className="text-white text-[9px] font-bold">✓</span>}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{trigger.label}</p>
                      {isLead && <p className="text-[10px] text-gray-400">Lead entity only</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>

          {rule.is_system && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800">System Rule</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  This is a system-provided rule. It cannot be deleted, but all settings can be customized.
                </p>
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

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, subtitle, icon, children }: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      {subtitle && <p className="text-xs text-gray-500 mb-3">{subtitle}</p>}
      {children}
    </div>
  );
}

// ─── Exact Field Input ────────────────────────────────────────────────────────

function ExactFieldInput({ suggestions, existing, onAdd }: {
  suggestions: string[];
  existing: string[];
  onAdd: (field: string) => void;
}) {
  const [value, setValue] = useState('');
  const available = suggestions.filter((s) => !existing.includes(s));

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed) { onAdd(trimmed); setValue(''); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          placeholder="Type field name or pick below..."
          list="exact-field-suggestions"
          className="flex-1 px-3 py-1.5 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <datalist id="exact-field-suggestions">
          {available.map((s) => <option key={s} value={s} />)}
        </datalist>
        <button
          onClick={commit}
          disabled={!value.trim()}
          className="px-3 py-1.5 text-xs font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          Add
        </button>
      </div>
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] text-gray-400 font-medium">Suggestions:</span>
          {available.map((s) => (
            <button
              key={s}
              onClick={() => onAdd(s)}
              className="text-[10px] font-mono bg-white border border-gray-200 hover:border-blue-400 hover:text-blue-600 text-gray-600 rounded px-2 py-0.5 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
