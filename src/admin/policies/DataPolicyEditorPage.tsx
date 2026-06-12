import FilterSelect from '../../app/components/FilterSelect';
import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Save, AlertTriangle,
  ToggleLeft, ToggleRight, Info, ShieldAlert,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type {
  DataPolicy,
  DataPolicyFormData,
  PolicyConditionDraft,
  PolicyEnforcementDraft,
  PolicyCategory,
  EnforcementLevel,
  TriggerEvent,
} from '../../types/dataPolicy';
import {
  KNOWN_ENTITIES, POLICY_CATEGORY_META, ENFORCEMENT_LEVEL_META,
  TRIGGER_EVENT_META, ALL_TRIGGER_EVENTS,
} from '../../types/dataPolicy';
import {
  updateDataPolicy,
  fetchDataPolicyWithDetails,
  replaceConditions,
  replaceEnforcements,
} from '../../services/dataPolicyService';
import PolicyConditionsPanel from './PolicyConditionsPanel';
import PolicyEnforcementsPanel from './PolicyEnforcementsPanel';

interface Props {
  policy: DataPolicy;
  onBack: () => void;
  onUpdated: (policy: DataPolicy) => void;
}

function toConditionDrafts(policy: DataPolicy): PolicyConditionDraft[] {
  return (policy.conditions ?? []).map((c) => ({
    _tempId: c.condition_id,
    field_name: c.field_name,
    operator: c.operator,
    value_text: c.value_text,
    display_order: c.display_order,
  }));
}

function toEnforcementDrafts(policy: DataPolicy): PolicyEnforcementDraft[] {
  return (policy.enforcements ?? []).map((e) => ({
    _tempId: e.enforcement_id,
    enforcement_type: e.enforcement_type,
    target_field: e.target_field,
    message_text: e.message_text,
    value_text: e.value_text,
    display_order: e.display_order,
  }));
}

function toForm(p: DataPolicy): DataPolicyFormData {
  return {
    name: p.name,
    description: p.description,
    entity_logical_name: p.entity_logical_name,
    policy_category: p.policy_category,
    enforcement_level: p.enforcement_level,
    trigger_on: p.trigger_on,
    is_active: p.is_active,
  };
}

export default function DataPolicyEditorPage({ policy, onBack, onUpdated }: Props) {
  const { showSuccess, showError } = useToast();
  const [form, setForm] = useState<DataPolicyFormData>(toForm(policy));
  const [conditions, setConditions] = useState<PolicyConditionDraft[]>([]);
  const [enforcements, setEnforcements] = useState<PolicyEnforcementDraft[]>([]);
  const [activeTab, setActiveTab] = useState<'settings' | 'conditions' | 'enforcements'>('settings');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    try {
      const full = await fetchDataPolicyWithDetails(policy.data_policy_id);
      setConditions(toConditionDrafts(full));
      setEnforcements(toEnforcementDrafts(full));
    } finally { setLoading(false); }
  }, [policy.data_policy_id]);

  useEffect(() => {
    setForm(toForm(policy));
    setDirty(false);
    loadDetails();
  }, [policy.data_policy_id]);

  const set = <K extends keyof DataPolicyFormData>(key: K, value: DataPolicyFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const toggleTrigger = (event: TriggerEvent) => {
    const has = form.trigger_on.includes(event);
    const next = has ? form.trigger_on.filter((t) => t !== event) : [...form.trigger_on, event];
    set('trigger_on', next.length > 0 ? next : ['create']);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showError('Name is required.'); return; }
    setSaving(true);
    try {
      const updated = await updateDataPolicy(policy.data_policy_id, form);
      await Promise.all([
        replaceConditions(policy.data_policy_id, conditions.map(({ _tempId, ...c }) => c)),
        replaceEnforcements(policy.data_policy_id, enforcements.map(({ _tempId, ...e }) => e)),
      ]);
      onUpdated(updated);
      setDirty(false);
      showSuccess('Policy saved');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const entityLabel = KNOWN_ENTITIES.find((e) => e.logical_name === form.entity_logical_name)?.display_name ?? form.entity_logical_name;
  const catMeta = POLICY_CATEGORY_META[form.policy_category];
  const levelMeta = ENFORCEMENT_LEVEL_META[form.enforcement_level];

  const tabs = [
    { key: 'settings' as const,     label: 'Settings' },
    { key: 'conditions' as const,   label: `Conditions (${conditions.length})` },
    { key: 'enforcements' as const, label: `Enforcement (${enforcements.length})` },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft size={14} />Policies
          </button>
          <span className="text-gray-200">·</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catMeta.color }} />
              <span className="text-sm font-semibold text-gray-900">{form.name || 'Untitled'}</span>
              {policy.is_system && <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5">system</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-gray-400">{entityLabel}</span>
              <span className="text-[10px] font-medium" style={{ color: levelMeta.color }}>{levelMeta.label}</span>
            </div>
          </div>
        </div>
        {dirty && (
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            <Save size={12} />{saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-gray-200 bg-white px-5">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-5 py-6">

          {/* ── Settings ─────────────────── */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Policy Name <span className="text-red-500">*</span></label>
                  <input value={form.name} onChange={(e) => set('name', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Description</label>
                  <textarea value={form.description} onChange={(e) => set('description', e.target.value)}
                    rows={2} placeholder="Describe what this policy governs and why..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Entity</label>
                  <FilterSelect value={form.entity_logical_name} onChange={(e) => set('entity_logical_name', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    {KNOWN_ENTITIES.map((e) => <option key={e.logical_name} value={e.logical_name}>{e.display_name}</option>)}
                  </FilterSelect>
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Category</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.entries(POLICY_CATEGORY_META) as [PolicyCategory, typeof POLICY_CATEGORY_META[PolicyCategory]][]).map(([cat, meta]) => (
                    <button key={cat} onClick={() => set('policy_category', cat)}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                        form.policy_category === cat ? 'border-current' : 'border-gray-200 hover:border-gray-300'
                      }`}
                      style={form.policy_category === cat ? { borderColor: meta.color } : {}}>
                      <span className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: meta.color }} />
                      <div>
                        <p className="text-[11px] font-bold text-gray-800">{meta.label}</p>
                        <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{meta.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Enforcement level */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Enforcement Level</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['error', 'warning', 'info'] as EnforcementLevel[]).map((lvl) => {
                    const meta = ENFORCEMENT_LEVEL_META[lvl];
                    return (
                      <button key={lvl} onClick={() => set('enforcement_level', lvl)}
                        className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                          form.enforcement_level === lvl ? 'border-current' : 'border-gray-200 hover:border-gray-300'
                        }`}
                        style={form.enforcement_level === lvl ? { borderColor: meta.color } : {}}>
                        <div>
                          <p className="text-xs font-bold" style={{ color: meta.color }}>{meta.label}</p>
                          <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{meta.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Trigger events */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Trigger Events</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_TRIGGER_EVENTS.map((event) => {
                    const active = form.trigger_on.includes(event);
                    return (
                      <button key={event} onClick={() => toggleTrigger(event)}
                        className={`px-3 py-1.5 rounded-xl border-2 text-xs font-semibold transition-all ${
                          active
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-400 hover:border-gray-300'
                        }`}>
                        {TRIGGER_EVENT_META[event].label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">Policy is evaluated each time one of these operations occurs on the entity.</p>
              </div>

              {/* Active toggle */}
              <button onClick={() => set('is_active', !form.is_active)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all w-full ${
                  form.is_active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}>
                {form.is_active
                  ? <ToggleRight size={18} className="text-blue-600 flex-shrink-0" />
                  : <ToggleLeft size={18} className="text-gray-400 flex-shrink-0" />}
                <div>
                  <p className="text-xs font-semibold text-gray-800">Active</p>
                  <p className="text-[10px] text-gray-400">Inactive policies are not evaluated at runtime</p>
                </div>
              </button>

              {policy.is_system && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800">System Policy</p>
                    <p className="text-xs text-amber-700 mt-0.5">System policies cannot be deleted, but all settings, conditions, and enforcement actions can be customised.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Conditions ───────────────── */}
          {activeTab === 'conditions' && (
            <div>
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-5">
                <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">
                  Define field conditions that must all match (AND logic) for this policy to fire.
                  Leave empty to always enforce on the configured trigger events.
                  Separate policies handle OR scenarios.
                </p>
              </div>
              {loading ? (
                <div className="text-xs text-gray-400 py-4">Loading...</div>
              ) : (
                <PolicyConditionsPanel conditions={conditions} onChange={(c) => { setConditions(c); setDirty(true); }} />
              )}
            </div>
          )}

          {/* ── Enforcement ──────────────── */}
          {activeTab === 'enforcements' && (
            <div>
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-5">
                <ShieldAlert size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">
                  Enforcement actions define what happens when this policy fires. Multiple actions
                  execute together. The enforcement level (Error / Warning / Info) set on the Settings
                  tab controls the overall severity — individual actions determine what is visually shown.
                </p>
              </div>
              {loading ? (
                <div className="text-xs text-gray-400 py-4">Loading...</div>
              ) : (
                <PolicyEnforcementsPanel enforcements={enforcements} onChange={(e) => { setEnforcements(e); setDirty(true); }} />
              )}
            </div>
          )}

          <div className="flex justify-end pt-6 pb-8">
            {dirty && (
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
                <Save size={14} />{saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
