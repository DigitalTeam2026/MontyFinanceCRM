import FilterSelect from '../../app/components/FilterSelect';
import { useState, useEffect } from 'react';
import {
  Save, Loader2, Plus, ChevronDown, ChevronUp, GripVertical,
  AlertCircle, CheckCircle2, X,
} from 'lucide-react';
import {
  fetchDigitalRuleWithDetails,
  createDigitalRule,
  updateDigitalRule,
  replaceConditions,
  replaceActions,
} from '../../services/digitalRuleService';
import type { ConditionDraft, ActionDraft } from '../../types/digitalRule';
import {
  TRIGGER_EVENT_META,
  CONDITION_TYPE_META,
  CONDITION_OPERATOR_META,
  ACTION_TYPE_META,
  KNOWN_ENTITIES,
  ALL_TRIGGER_EVENTS,
  ALL_CONDITION_TYPES,
  ALL_ACTION_TYPES,
} from '../../types/digitalRule';
import type { TriggerEvent, ConditionType, ConditionOperator, ActionType } from '../../types/digitalRule';

interface Props {
  ruleId?: string;
  onSaved: () => void;
  onCancel: () => void;
}

const INPUT = 'w-full text-[12px] text-slate-800 border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition';
const LABEL = 'block text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1.5';
const HELP = 'text-[10px] text-slate-500 mt-1';

const FORM_ACCESS_OPTIONS: { value: string; label: string }[] = [
  { value: 'allow_edit', label: 'Allow Edit' },
  { value: 'read_only', label: 'Read Only' },
  { value: 'not_allow', label: 'Not Allowed' },
];

let tempCounter = 0;
function tempId(): string { return `_t${++tempCounter}_${Date.now()}`; }

export default function DigitalRuleEditorPage({ ruleId, onSaved, onCancel }: Props) {
  const isNew = !ruleId;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [isSystem, setIsSystem] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entityLogicalName, setEntityLogicalName] = useState('');
  const [triggerEvent, setTriggerEvent] = useState<TriggerEvent>('before_delete');
  const [isActive, setIsActive] = useState(true);
  const [priority, setPriority] = useState(100);

  const [conditions, setConditions] = useState<ConditionDraft[]>([]);
  const [actions, setActions] = useState<ActionDraft[]>([]);
  const [expandedCondition, setExpandedCondition] = useState<string | null>(null);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);

  useEffect(() => {
    if (!ruleId) return;
    (async () => {
      try {
        const rule = await fetchDigitalRuleWithDetails(ruleId);
        setName(rule.name);
        setDescription(rule.description);
        setEntityLogicalName(rule.entity_logical_name);
        setTriggerEvent(rule.trigger_event);
        setIsActive(rule.is_active);
        setPriority(rule.priority);
        setIsSystem(rule.is_system);
        setConditions(
          (rule.conditions ?? []).map((c) => ({
            ...c,
            _tempId: c.digital_rule_condition_id,
          }))
        );
        setActions(
          (rule.actions ?? []).map((a) => ({
            ...a,
            action_config: a.action_config ?? {},
            _tempId: a.digital_rule_action_id,
          }))
        );
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [ruleId]);

  const handleSave = async () => {
    if (!name.trim() || !entityLogicalName) return;
    setSaving(true);
    setSaveStatus('idle');
    try {
      let finalId = ruleId;
      const payload = { name, description, entity_logical_name: entityLogicalName, trigger_event: triggerEvent, is_active: isActive, priority };
      if (isNew) {
        const created = await createDigitalRule(payload);
        finalId = created.digital_rule_id;
      } else {
        await updateDigitalRule(ruleId!, payload);
      }
      await replaceConditions(
        finalId!,
        conditions.map(({ _tempId, ...c }) => c)
      );
      await replaceActions(
        finalId!,
        actions.map(({ _tempId, ...a }) => a)
      );
      setSaveStatus('saved');
      setTimeout(() => onSaved(), 600);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const addCondition = () => {
    const id = tempId();
    setConditions((prev) => [
      ...prev,
      {
        _tempId: id,
        condition_type: 'lookup_not_null' as ConditionType,
        target_entity: null,
        target_field: null,
        source_field: '',
        operator: 'not_null' as ConditionOperator,
        value: null,
        display_order: prev.length,
      },
    ]);
    setExpandedCondition(id);
  };

  const removeCondition = (id: string) => {
    setConditions((prev) => prev.filter((c) => c._tempId !== id));
  };

  const updateConditionField = (id: string, field: string, value: unknown) => {
    setConditions((prev) =>
      prev.map((c) => (c._tempId === id ? { ...c, [field]: value } : c))
    );
  };

  const addAction = () => {
    const id = tempId();
    setActions((prev) => [
      ...prev,
      {
        _tempId: id,
        action_type: 'confirm_before_delete' as ActionType,
        target_entity: null,
        target_field: null,
        source_field: null,
        field_value: null,
        message: '',
        display_order: prev.length,
        action_config: {},
      },
    ]);
    setExpandedAction(id);
  };

  const removeAction = (id: string) => {
    setActions((prev) => prev.filter((a) => a._tempId !== id));
  };

  const updateActionField = (id: string, field: string, value: unknown) => {
    setActions((prev) =>
      prev.map((a) => (a._tempId === id ? { ...a, [field]: value } : a))
    );
  };

  const moveAction = (idx: number, dir: -1 | 1) => {
    setActions((prev) => {
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr.map((a, i) => ({ ...a, display_order: i }));
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Sticky command bar — pinned above the single scroll area */}
      <div className="shrink-0 z-20 px-6 py-3 border-b border-slate-200 bg-white flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="text-[12px] text-slate-500 hover:text-slate-800 font-medium transition">Cancel</button>
          <div className="h-5 w-px bg-slate-200" />
          <h2 className="text-[13px] font-semibold text-slate-800">{isNew ? 'New Digital Rule' : name}</h2>
          {isSystem && (
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[9px] font-semibold uppercase tracking-wide border border-blue-200">System</span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || !entityLogicalName}
          className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium rounded-lg transition shadow-sm disabled:opacity-50 ${
            saveStatus === 'saved'
              ? 'bg-emerald-600 text-white'
              : saveStatus === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : saveStatus === 'saved' ? <CheckCircle2 size={13} /> : saveStatus === 'error' ? <AlertCircle size={13} /> : <Save size={13} />}
          {saving ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Error' : 'Save'}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 pb-8 space-y-4" style={{ background: 'var(--app-bg)' }}>
        {/* General settings */}
        <section className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 space-y-4">
          <h3 className="text-[12px] font-semibold text-slate-700 uppercase tracking-wide">General</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Rule Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="e.g. Reopen Lead when Opportunity is deleted" />
            </div>
            <div>
              <label className={LABEL}>Entity *</label>
              <FilterSelect value={entityLogicalName} onChange={(e) => setEntityLogicalName(e.target.value)} className={INPUT}>
                <option value="">Select entity...</option>
                {KNOWN_ENTITIES.map((e) => (
                  <option key={e.logical_name} value={e.logical_name}>{e.display_name}</option>
                ))}
              </FilterSelect>
            </div>
            <div>
              <label className={LABEL}>Trigger Event</label>
              <FilterSelect value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value as TriggerEvent)} className={INPUT}>
                {ALL_TRIGGER_EVENTS.map((t) => (
                  <option key={t} value={t}>{TRIGGER_EVENT_META[t].label}</option>
                ))}
              </FilterSelect>
            </div>
            <div>
              <label className={LABEL}>Priority</label>
              <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className={INPUT} min={1} max={1000} />
              <p className={HELP}>Lower number runs first</p>
            </div>
            <div className="md:col-span-2">
              <label className={LABEL}>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${INPUT} min-h-[60px] resize-y`} placeholder="Describe what this rule does..." />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsActive(!isActive)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
              </button>
              <span className="text-[12px] text-slate-700 font-medium">{isActive ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </section>

        {/* Conditions */}
        <section className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-slate-700 uppercase tracking-wide">Conditions ({conditions.length})</h3>
            <button onClick={addCondition} className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-blue-600 hover:bg-blue-50 rounded-md transition">
              <Plus size={12} /> Add Condition
            </button>
          </div>
          {conditions.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3">
              <p className="text-[12px] font-medium text-slate-600">No conditions configured.</p>
              <p className="text-[11px] text-slate-500 mt-0.5">This rule will run whenever the selected trigger occurs.</p>
            </div>
          )}
          {conditions.map((cond, idx) => {
            const meta = CONDITION_TYPE_META[cond.condition_type];
            const isExpanded = expandedCondition === cond._tempId;
            return (
              <div key={cond._tempId} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 cursor-pointer" onClick={() => setExpandedCondition(isExpanded ? null : cond._tempId)}>
                  <span className="text-[10px] text-slate-400 font-semibold w-5">{idx + 1}</span>
                  <span className="text-[12px] font-medium text-slate-700 flex-1">{meta?.label ?? cond.condition_type}</span>
                  {cond.source_field && <span className="text-[10px] text-slate-400 font-mono">{cond.source_field}</span>}
                  <button onClick={(e) => { e.stopPropagation(); removeCondition(cond._tempId); }} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition">
                    <X size={12} />
                  </button>
                  {isExpanded ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                </div>
                {isExpanded && (
                  <div className="px-4 py-3 space-y-3 border-t border-slate-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className={LABEL}>Condition Type</label>
                        <FilterSelect value={cond.condition_type} onChange={(e) => updateConditionField(cond._tempId, 'condition_type', e.target.value)} className={INPUT}>
                          {ALL_CONDITION_TYPES.map((t) => (
                            <option key={t} value={t}>{CONDITION_TYPE_META[t].label}</option>
                          ))}
                        </FilterSelect>
                      </div>
                      <div>
                        <label className={LABEL}>Operator</label>
                        <FilterSelect value={cond.operator} onChange={(e) => updateConditionField(cond._tempId, 'operator', e.target.value)} className={INPUT}>
                          {(Object.keys(CONDITION_OPERATOR_META) as ConditionOperator[]).map((o) => (
                            <option key={o} value={o}>{CONDITION_OPERATOR_META[o].label}</option>
                          ))}
                        </FilterSelect>
                      </div>
                      {meta?.needsSourceField && (
                        <div>
                          <label className={LABEL}>Source Field (on trigger entity)</label>
                          <input type="text" value={cond.source_field ?? ''} onChange={(e) => updateConditionField(cond._tempId, 'source_field', e.target.value)} className={INPUT} placeholder="e.g. originating_lead_id" />
                        </div>
                      )}
                      {meta?.needsTarget && (
                        <>
                          <div>
                            <label className={LABEL}>Target Entity</label>
                            <FilterSelect value={cond.target_entity ?? ''} onChange={(e) => updateConditionField(cond._tempId, 'target_entity', e.target.value || null)} className={INPUT}>
                              <option value="">Select...</option>
                              {KNOWN_ENTITIES.map((e) => (
                                <option key={e.logical_name} value={e.logical_name}>{e.display_name}</option>
                              ))}
                            </FilterSelect>
                          </div>
                          <div>
                            <label className={LABEL}>Target Field (FK column on target)</label>
                            <input type="text" value={cond.target_field ?? ''} onChange={(e) => updateConditionField(cond._tempId, 'target_field', e.target.value || null)} className={INPUT} placeholder="e.g. originating_lead_id" />
                          </div>
                        </>
                      )}
                      {meta?.needsValue && (
                        <div>
                          <label className={LABEL}>Value</label>
                          <input type="text" value={cond.value ?? ''} onChange={(e) => updateConditionField(cond._tempId, 'value', e.target.value || null)} className={INPUT} placeholder="Value to compare" />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* Actions */}
        <section className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-slate-700 uppercase tracking-wide">Actions ({actions.length})</h3>
            <button onClick={addAction} className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-blue-600 hover:bg-blue-50 rounded-md transition">
              <Plus size={12} /> Add Action
            </button>
          </div>
          {actions.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3">
              <p className="text-[12px] font-medium text-slate-600">No actions configured.</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Add at least one action to define what this rule does.</p>
            </div>
          )}
          {actions.map((act, idx) => {
            const meta = ACTION_TYPE_META[act.action_type];
            const isExpanded = expandedAction === act._tempId;
            return (
              <div key={act._tempId} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 cursor-pointer" onClick={() => setExpandedAction(isExpanded ? null : act._tempId)}>
                  <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); moveAction(idx, -1); }} disabled={idx === 0} className="text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronUp size={11} /></button>
                    <button onClick={(e) => { e.stopPropagation(); moveAction(idx, 1); }} disabled={idx === actions.length - 1} className="text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronDown size={11} /></button>
                  </div>
                  <GripVertical size={12} className="text-slate-300" />
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta?.color ?? '#6b7280' }} />
                  <span className="text-[12px] font-medium text-slate-700 flex-1">{meta?.label ?? act.action_type}</span>
                  {act.target_entity && <span className="text-[10px] text-slate-400">{KNOWN_ENTITIES.find((e) => e.logical_name === act.target_entity)?.display_name ?? act.target_entity}</span>}
                  <button onClick={(e) => { e.stopPropagation(); removeAction(act._tempId); }} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition">
                    <X size={12} />
                  </button>
                  {isExpanded ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                </div>
                {isExpanded && (
                  <div className="px-4 py-3 space-y-3 border-t border-slate-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className={LABEL}>Action Type</label>
                        <FilterSelect value={act.action_type} onChange={(e) => updateActionField(act._tempId, 'action_type', e.target.value)} className={INPUT}>
                          {ALL_ACTION_TYPES.map((t) => (
                            <option key={t} value={t}>{ACTION_TYPE_META[t].label}</option>
                          ))}
                        </FilterSelect>
                        <p className={HELP}>{meta?.description}</p>
                      </div>
                      {meta?.needsTarget && (
                        <div>
                          <label className={LABEL}>Target Entity</label>
                          <FilterSelect value={act.target_entity ?? ''} onChange={(e) => updateActionField(act._tempId, 'target_entity', e.target.value || null)} className={INPUT}>
                            <option value="">Select...</option>
                            {KNOWN_ENTITIES.map((e) => (
                              <option key={e.logical_name} value={e.logical_name}>{e.display_name}</option>
                            ))}
                          </FilterSelect>
                        </div>
                      )}
                      {meta?.needsSource && (
                        <div>
                          <label className={LABEL}>Source Field (lookup on trigger entity)</label>
                          <input type="text" value={act.source_field ?? ''} onChange={(e) => updateActionField(act._tempId, 'source_field', e.target.value || null)} className={INPUT} placeholder="e.g. originating_lead_id" />
                        </div>
                      )}
                      {meta?.needsField && (
                        <div>
                          <label className={LABEL}>Target Field</label>
                          <input type="text" value={act.target_field ?? ''} onChange={(e) => updateActionField(act._tempId, 'target_field', e.target.value || null)} className={INPUT} placeholder="e.g. state_code" />
                        </div>
                      )}
                      {meta?.needsValue && act.action_type === 'set_form_access' && (
                        <div>
                          <label className={LABEL}>Form Access</label>
                          <FilterSelect value={act.field_value ?? 'read_only'} onChange={(e) => updateActionField(act._tempId, 'field_value', e.target.value)} className={INPUT}>
                            {FORM_ACCESS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </FilterSelect>
                          <p className={HELP}>Controls whether users can edit, only view, or cannot open the form.</p>
                        </div>
                      )}
                      {meta?.needsValue && act.action_type !== 'set_form_access' && (
                        <div>
                          <label className={LABEL}>Field Value</label>
                          <input type="text" value={act.field_value ?? ''} onChange={(e) => updateActionField(act._tempId, 'field_value', e.target.value || null)} className={INPUT} placeholder="e.g. 1" />
                        </div>
                      )}
                      {meta?.needsMessage && (
                        <div className="md:col-span-2">
                          <label className={LABEL}>Message</label>
                          <textarea value={act.message ?? ''} onChange={(e) => updateActionField(act._tempId, 'message', e.target.value || null)} className={`${INPUT} min-h-[60px] resize-y`} placeholder="Message to show the user..." />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
