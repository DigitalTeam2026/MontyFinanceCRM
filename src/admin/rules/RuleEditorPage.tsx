import FilterSelect from '../../app/components/FilterSelect';
import { useEffect, useState } from 'react';
import { useToast } from '../../app/context/ToastContext';
import {
  ArrowLeft, Save, RefreshCw, Zap, Settings, Activity, CheckCircle2, Globe, FileText, FlaskConical, Database, GitBranch, Milestone, LayoutGrid } from 'lucide-react';
import type { BusinessRule, RuleTrigger, RuleActionSet, RuleScope, RuleConditionGroup, RuleCondition, RuleConditionBlock, RuleAction, BusinessRuleCategory } from '../../types/businessRule';
import { validateProcessFlowCondition, getRuleConditionBlocks } from '../../types/businessRule';
import type { FieldDefinition } from '../../types/field';
import type { FormDefinition } from '../../types/form';
import type { ProcessFlow, ProcessStage } from '../../types/processFlow';
import { fetchFieldsForEntity } from '../../services/fieldService';
import { fetchFormsForEntity } from '../../services/formService';
import { saveRule, createRule } from '../../services/businessRuleService';
import { fetchRuleCategories, createRuleCategory, RULE_CATEGORY_COLORS } from '../../services/businessRuleCategoryService';
import { getCurrentUserId } from '../../services/automationRuleService';
import { fetchProcessFlowsForEntity, fetchProcessFlowWithDetails } from '../../services/processFlowService';
import RulePreviewPanel from './RulePreviewPanel';
import RuleCanvas from './RuleCanvas';

type Tab = 'canvas' | 'trigger' | 'settings' | 'preview';

const SCOPE_OPTIONS: { value: RuleScope; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    value: 'all_forms',
    label: 'All Forms',
    desc: 'Applies on every form, quick create, and any other context for this entity',
    icon: <Globe size={14} className="text-blue-500" />,
  },
  {
    value: 'specific_form',
    label: 'Specific Form',
    desc: 'Applies only to a single named form — choose which form below',
    icon: <FileText size={14} className="text-slate-500" />,
  },
  {
    value: 'specific_bpf',
    label: 'Specific Business Process Flow',
    desc: 'Applies only when the record is using a specific Business Process Flow',
    icon: <GitBranch size={14} className="text-teal-500" />,
  },
  {
    value: 'specific_bpf_stage',
    label: 'Specific BPF Stage',
    desc: 'Applies only when the record is at a specific stage in a Business Process Flow',
    icon: <Milestone size={14} className="text-orange-500" />,
  },
];

interface RuleEditorPageProps {
  rule: BusinessRule;
  entityId: string;
  entityName: string;
  onBack: () => void;
  onRuleUpdate: (r: BusinessRule) => void;
}

let blockCtr = 0;
const newBlockId = () => `cb_${Date.now()}_${blockCtr++}`;

/**
 * Build the action_json + trigger_json payload from the canonical block list,
 * mirroring the first block into the legacy if_actions/else_actions/
 * condition_group fields so older consumers keep working.
 */
function blocksToRule(rule: BusinessRule, blocks: RuleConditionBlock[]): BusinessRule {
  const first = blocks[0];
  return {
    ...rule,
    trigger_json: {
      ...(rule.trigger_json ?? { trigger_on: 'onChange', watch_fields: [], condition_group: null }),
      condition_group: first?.condition_group ?? null,
    },
    action_json: {
      ...(rule.action_json ?? {}),
      if_actions: first?.if_actions ?? [],
      else_actions: first?.else_actions ?? [],
      condition_blocks: blocks,
    },
  };
}

/**
 * Normalize a loaded rule into multi-block form: guarantee at least one block,
 * stable block ids, positional names, and unique action ids across all blocks.
 */
function normalizeRule(rule: BusinessRule): BusinessRule {
  const seen = new Set<string>();
  const fixAction = (a: RuleAction): RuleAction => {
    if (!a.id || seen.has(a.id)) {
      const id = `a_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
      seen.add(id);
      return { ...a, id };
    }
    seen.add(a.id);
    return a;
  };

  const blocks = getRuleConditionBlocks(rule.trigger_json, rule.action_json).map((b, i) => ({
    ...b,
    id: b.id || newBlockId(),
    name: b.name || `Condition ${i + 1}`,
    if_actions: (b.if_actions ?? []).map(fixAction),
    else_actions: (b.else_actions ?? []).map(fixAction),
  }));

  return blocksToRule(rule, blocks);
}

export default function RuleEditorPage({ rule: initRule, entityId, entityName, onBack, onRuleUpdate }: RuleEditorPageProps) {
  const { showSuccess, showError } = useToast();
  const [rule, setRule] = useState<BusinessRule>(() => normalizeRule(initRule));
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [categories, setCategories] = useState<BusinessRuleCategory[]>([]);
  const [processFlows, setProcessFlows] = useState<ProcessFlow[]>([]);
  const [stageCache, setStageCache] = useState<Record<string, ProcessStage[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // A draft rule (empty id, not yet inserted) starts dirty so it can be saved
  // straight away; an existing rule starts clean.
  const [dirty, setDirty] = useState(() => !initRule.business_rule_id);
  const [activeTab, setActiveTab] = useState<Tab>('canvas');
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);

  const trigger: RuleTrigger = rule.trigger_json ?? {
    trigger_on: 'onChange',
    watch_fields: [],
    condition_group: null,
  };
  const actionSet: RuleActionSet = rule.action_json ?? { if_actions: [], else_actions: [] };

  // ── Condition blocks (normalizeRule guarantees at least one) ──────────────
  const blocks: RuleConditionBlock[] = actionSet.condition_blocks ?? [];
  const [activeBlockId, setActiveBlockId] = useState<string>(() => blocks[0]?.id ?? '');
  const activeBlock = blocks.find((b) => b.id === activeBlockId) ?? blocks[0];

  useEffect(() => {
    Promise.all([
      fetchFieldsForEntity(entityId),
      fetchProcessFlowsForEntity(entityId).catch(() => [] as ProcessFlow[]),
      fetchRuleCategories().catch(() => [] as BusinessRuleCategory[]),
    ]).then(([f, pf, cats]) => {
      setFields(f);
      setProcessFlows(pf);
      setCategories(cats);
    }).finally(() => setLoading(false));
  }, [entityId]);

  const handleCreateCategory = async (name: string): Promise<BusinessRuleCategory | null> => {
    const nm = name.trim();
    if (!nm) return null;
    try {
      const created_by = await getCurrentUserId().catch(() => null);
      const cat = await createRuleCategory({
        name: nm,
        color: RULE_CATEGORY_COLORS[categories.length % RULE_CATEGORY_COLORS.length],
        sort_order: categories.length,
        created_by,
      });
      setCategories((prev) => [...prev, cat]);
      return cat;
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to create category');
      return null;
    }
  };

  const loadFlowStages = async (flowId: string): Promise<ProcessStage[]> => {
    if (stageCache[flowId]) return stageCache[flowId];
    try {
      const detail = await fetchProcessFlowWithDetails(flowId);
      const stages = detail?.stages ?? [];
      setStageCache((prev) => ({ ...prev, [flowId]: stages }));
      return stages;
    } catch {
      return [];
    }
  };

  const markDirty = () => setDirty(true);

  const setTrigger = (t: RuleTrigger) => {
    setRule((r) => ({ ...r, trigger_json: t }));
    markDirty();
  };

  // Persist a new block list, keeping the legacy mirror fields in sync.
  const setBlocks = (next: RuleConditionBlock[]) => {
    setRule((r) => blocksToRule(r, next));
    markDirty();
  };

  const updateBlock = (id: string, patch: Partial<RuleConditionBlock>) => {
    setBlocks(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const addBlock = () => {
    const id = newBlockId();
    const next: RuleConditionBlock = {
      id,
      name: `Condition ${blocks.length + 1}`,
      condition_group: null,
      if_actions: [],
      else_actions: [],
    };
    setBlocks([...blocks, next]);
    setActiveBlockId(id);
  };

  const removeBlock = (id: string) => {
    if (blocks.length <= 1) return;
    const next = blocks.filter((b) => b.id !== id);
    setBlocks(next);
    if (activeBlockId === id) setActiveBlockId(next[0].id);
    if (expandedBlockId === id) setExpandedBlockId(null);
  };

  const reorderBlocks = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setBlocks(next);
  };

  const collectProcessFlowConditions = (group: RuleConditionGroup | null): RuleCondition[] => {
    if (!group) return [];
    const direct = group.conditions.filter((c) => c.source === 'process_flow');
    const nested = group.groups.flatMap((g) => collectProcessFlowConditions(g));
    return [...direct, ...nested];
  };

  const handleSave = async () => {
    const pfConds = blocks.flatMap((b) => collectProcessFlowConditions(b.condition_group));
    const errors = pfConds.map((c) => validateProcessFlowCondition(c)).filter(Boolean) as string[];
    if (errors.length > 0) {
      showError(`Incomplete process flow condition: ${errors[0]}`);
      return;
    }

    const payload = {
      name: rule.name,
      description: rule.description,
      scope: rule.scope,
      target_form_id: rule.scope === 'specific_form' ? rule.target_form_id : null,
      target_process_flow_id: (rule.scope === 'specific_bpf' || rule.scope === 'specific_bpf_stage') ? rule.target_process_flow_id : null,
      target_process_stage_id: rule.scope === 'specific_bpf_stage' ? rule.target_process_stage_id : null,
      run_order: rule.run_order,
      trigger_json: rule.trigger_json,
      action_json: rule.action_json,
    };

    setSaving(true);
    try {
      // A draft (empty id) is inserted here on first save; thereafter it has a
      // real id and is updated in place.
      const updated = rule.business_rule_id
        ? await saveRule(rule.business_rule_id, payload)
        : await createRule({
            entity_definition_id: entityId,
            is_active: rule.is_active,
            ...payload,
          });
      const normalized = normalizeRule(updated);
      setRule(normalized);
      if (!normalized.action_json.condition_blocks?.some((b) => b.id === activeBlockId)) {
        setActiveBlockId(normalized.action_json.condition_blocks?.[0]?.id ?? '');
      }
      onRuleUpdate(updated);
      setDirty(false);
      showSuccess('Rule saved');
    } finally {
      setSaving(false);
    }
  };

  const blockCount = blocks.length;
  const actionCount = blocks.reduce(
    (n, b) => n + b.if_actions.length + b.else_actions.length,
    0,
  );
  const activeBlockIndex = Math.max(0, blocks.findIndex((b) => b.id === activeBlock?.id));

  const TABS: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'canvas',     label: 'Canvas',     icon: <LayoutGrid size={13} />, badge: blockCount > 1 ? blockCount : undefined },
    { id: 'trigger',    label: 'Trigger',    icon: <Zap size={13} /> },
    { id: 'settings',   label: 'Settings',   icon: <Settings size={13} /> },
    { id: 'preview',    label: 'Preview',    icon: <FlaskConical size={13} /> },
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50">
      <div className="h-12 bg-white border-b border-slate-200 px-4 flex items-center gap-3 shrink-0 shadow-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={13} />
          Rules
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-blue-500" />
          <input
            type="text"
            value={rule.name}
            onChange={(e) => { setRule((r) => ({ ...r, name: e.target.value })); markDirty(); }}
            className="text-sm font-semibold text-slate-800 border-0 bg-transparent focus:outline-none focus:ring-0 min-w-0"
          />
        </div>
        <div className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${
          rule.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
        }`}>
          <CheckCircle2 size={10} />
          {rule.is_active ? 'Active' : 'Inactive'}
        </div>
        {entityName && (
          <div className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium border border-slate-200">
            <Database size={9} className="text-slate-400" />
            {entityName}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-[10px] text-amber-500">Unsaved changes</span>}
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={12} />
            {saving ? 'Saving...' : 'Save Rule'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden h-full">
        <div className="w-60 bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="px-3 py-3 border-b border-slate-100">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Rule Designer</p>
          </div>
          <nav className="py-1.5 px-2 space-y-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className={activeTab === tab.id ? 'text-blue-600' : 'text-slate-400'}>
                  {tab.icon}
                </span>
                <span className="flex-1">{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id ? 'bg-blue-200 text-blue-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="mt-auto px-3 py-3 border-t border-slate-100 space-y-1.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Summary</p>
            {entityName && <SummaryRow label="Entity" value={entityName} active />}
            <SummaryRow label="Trigger" value={trigger.trigger_on === 'onLoad' ? 'On Load' : trigger.trigger_on === 'onChange' ? 'On Change' : 'Always'} />
            <SummaryRow
              label="Scope"
              value={SCOPE_OPTIONS.find((s) => s.value === rule.scope)?.label ?? rule.scope}
            />
            <SummaryRow label="Condition Blocks" value={`${blockCount}`} active={blockCount > 0} />
            <SummaryRow label="Total Actions" value={actionCount > 0 ? `${actionCount}` : 'None'} active={actionCount > 0} />
            {activeBlock && (
              <SummaryRow
                label={`Condition ${activeBlockIndex + 1} · THEN/ELSE`}
                value={`${activeBlock.if_actions.length} / ${activeBlock.else_actions.length}`}
                active={activeBlock.if_actions.length + activeBlock.else_actions.length > 0}
              />
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {activeTab === 'canvas' && (
            <RuleCanvas
              blocks={blocks}
              fields={fields}
              processFlows={processFlows}
              loadFlowStages={loadFlowStages}
              expandedBlockId={expandedBlockId}
              onExpandBlock={setExpandedBlockId}
              onUpdateBlock={updateBlock}
              onAddBlock={addBlock}
              onRemoveBlock={removeBlock}
              onReorderBlocks={reorderBlocks}
            />
          )}
          {activeTab === 'trigger' && (
            <TriggerPanel
              trigger={trigger}
              fields={fields}
              rule={rule}
              entityId={entityId}
              onTriggerChange={setTrigger}
              onRuleChange={(r) => { setRule(r); markDirty(); }}
              processFlows={processFlows}
              loadFlowStages={loadFlowStages}
            />
          )}
          {activeTab === 'settings' && (
            <RuleSettingsPanel rule={rule} onChange={(r) => { setRule(r); markDirty(); }} />
          )}
          {activeTab === 'preview' && (
            <div>
              <SectionHeading
                title="Preview"
                subtitle="Enter test values to simulate rule execution and see results in real time."
                icon={<FlaskConical size={14} />}
              />
              <RulePreviewPanel rule={rule} fields={fields} processFlows={processFlows} loadFlowStages={loadFlowStages} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TriggerPanel({
  trigger,
  fields,
  rule,
  onTriggerChange,
  onRuleChange,
  entityId,
  processFlows,
  loadFlowStages,
}: {
  trigger: RuleTrigger;
  fields: FieldDefinition[];
  rule: BusinessRule;
  onTriggerChange: (t: RuleTrigger) => void;
  onRuleChange: (r: BusinessRule) => void;
  entityId: string;
  processFlows: ProcessFlow[];
  loadFlowStages: (flowId: string) => Promise<ProcessStage[]>;
}) {
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [scopeStages, setScopeStages] = useState<ProcessStage[]>([]);
  const watchableFields = fields.filter((f) => f.is_active);
  const selectedWatched = new Set(trigger.watch_fields);

  useEffect(() => {
    if (entityId) {
      fetchFormsForEntity(entityId).then(setForms).catch(() => {});
    }
  }, [entityId]);

  useEffect(() => {
    if (rule.target_process_flow_id) {
      loadFlowStages(rule.target_process_flow_id).then(setScopeStages).catch(() => setScopeStages([]));
    } else {
      setScopeStages([]);
    }
  }, [rule.target_process_flow_id]);

  const toggleWatch = (ln: string) => {
    const next = selectedWatched.has(ln)
      ? trigger.watch_fields.filter((x) => x !== ln)
      : [...trigger.watch_fields, ln];
    onTriggerChange({ ...trigger, watch_fields: next });
  };

  const selectedForm = forms.find((f) => f.form_id === rule.target_form_id);

  return (
    <div>
      <SectionHeading
        title="Trigger"
        subtitle="Control when this rule evaluates and which forms it applies to."
        icon={<Zap size={14} />}
      />
      <div className="space-y-6">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Run On
          </label>
          <div className="space-y-2">
            {([
              { value: 'onLoad',    label: 'Form Load',     desc: 'Evaluates once when the record form opens' },
              { value: 'onChange',  label: 'Field Change',  desc: 'Re-evaluates each time a watched field changes' },
              { value: 'always',    label: 'Always',        desc: 'Evaluates on load and on every field change' },
            ] as const).map(({ value, label, desc }) => (
              <div
                key={value}
                onClick={() => onTriggerChange({ ...trigger, trigger_on: value })}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  trigger.trigger_on === value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                  trigger.trigger_on === value ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                }`}>
                  {trigger.trigger_on === value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700">{label}</p>
                  <p className="text-[10px] text-slate-400">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {trigger.trigger_on === 'onChange' && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Watch Fields <span className="normal-case font-normal text-slate-400">(empty = watch all)</span>
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {watchableFields.map((f) => (
                <button
                  key={f.field_definition_id}
                  onClick={() => toggleWatch(f.logical_name)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left border transition-all ${
                    selectedWatched.has(f.logical_name)
                      ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${selectedWatched.has(f.logical_name) ? 'bg-blue-500' : 'bg-slate-200'}`} />
                  <span className="truncate">{f.display_name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-slate-100 pt-5">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Scope
          </label>
          <p className="text-[10px] text-slate-400 mb-3">Choose which forms this rule applies to.</p>
          <div className="space-y-2">
            {SCOPE_OPTIONS.map(({ value, label, desc, icon }) => (
              <div
                key={value}
                onClick={() => onRuleChange({
                  ...rule,
                  scope: value,
                  target_form_id: value === 'specific_form' ? rule.target_form_id : null,
                  target_process_flow_id: (value === 'specific_bpf' || value === 'specific_bpf_stage') ? rule.target_process_flow_id : null,
                  target_process_stage_id: value === 'specific_bpf_stage' ? rule.target_process_stage_id : null,
                })}
                className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                  rule.scope === value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                  rule.scope === value ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                }`}>
                  {rule.scope === value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="flex items-start gap-2 flex-1">
                  <div className="mt-0.5 shrink-0">{icon}</div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {rule.scope === 'specific_form' && (
            <div className="mt-3 pl-1">
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Target Form
              </label>
              {forms.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">No forms found for this entity.</p>
              ) : (
                <div className="relative">
                  <FilterSelect
                    value={rule.target_form_id ?? ''}
                    onChange={(e) => onRuleChange({ ...rule, target_form_id: e.target.value || null })}
                    className="w-full appearance-none pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                  >
                    <option value="">-- select a form --</option>
                    {forms.map((f) => (
                      <option key={f.form_id} value={f.form_id}>
                        {f.name}{f.form_type ? ` (${f.form_type})` : ''}
                      </option>
                    ))}
                  </FilterSelect>
                  </div>
              )}
              {!rule.target_form_id && (
                <p className="mt-1.5 text-[10px] text-amber-600 font-medium">
                  No form selected -- this rule will not run until a form is chosen.
                </p>
              )}
              {selectedForm && (
                <p className="mt-1.5 text-[10px] text-slate-400">
                  This rule will only evaluate on the <span className="font-medium text-slate-600">{selectedForm.name}</span> form.
                </p>
              )}
            </div>
          )}

          {(rule.scope === 'specific_bpf' || rule.scope === 'specific_bpf_stage') && (
            <div className="mt-3 pl-1 space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Target Business Process Flow
                </label>
                {processFlows.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">No process flows found for this entity.</p>
                ) : (
                  <div className="relative">
                    <FilterSelect
                      value={rule.target_process_flow_id ?? ''}
                      onChange={(e) => onRuleChange({
                        ...rule,
                        target_process_flow_id: e.target.value || null,
                        target_process_stage_id: null,
                      })}
                      className="w-full appearance-none pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                    >
                      <option value="">-- select a process flow --</option>
                      {processFlows.filter((f) => f.is_active && !f.deleted_at).map((f) => (
                        <option key={f.process_flow_id} value={f.process_flow_id}>
                          {f.name}
                        </option>
                      ))}
                    </FilterSelect>
                    </div>
                )}
                {!rule.target_process_flow_id && (
                  <p className="mt-1.5 text-[10px] text-amber-600 font-medium">
                    No process flow selected -- this rule will not run until one is chosen.
                  </p>
                )}
              </div>

              {rule.scope === 'specific_bpf_stage' && rule.target_process_flow_id && (
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Target Stage
                  </label>
                  {scopeStages.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">Loading stages...</p>
                  ) : (
                    <div className="relative">
                      <FilterSelect
                        value={rule.target_process_stage_id ?? ''}
                        onChange={(e) => onRuleChange({ ...rule, target_process_stage_id: e.target.value || null })}
                        className="w-full appearance-none pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                      >
                        <option value="">-- select a stage --</option>
                        {scopeStages
                          .sort((a, b) => a.display_order - b.display_order)
                          .map((s) => (
                            <option key={s.process_stage_id} value={s.process_stage_id}>
                              {s.name}
                            </option>
                          ))}
                      </FilterSelect>
                      </div>
                  )}
                  {!rule.target_process_stage_id && (
                    <p className="mt-1.5 text-[10px] text-amber-600 font-medium">
                      No stage selected -- this rule will not run until one is chosen.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleSettingsPanel({
  rule,
  onChange,
}: {
  rule: BusinessRule;
  onChange: (r: BusinessRule) => void;
}) {
  return (
    <div>
      <SectionHeading
        title="Settings"
        subtitle="Configure rule priority, description, and active status."
        icon={<Settings size={14} />}
      />
      <div className="space-y-5 max-w-lg">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Description
          </label>
          <textarea
            value={rule.description ?? ''}
            onChange={(e) => onChange({ ...rule, description: e.target.value })}
            rows={3}
            placeholder="Optional — describe what this rule does..."
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-300 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Run Order <span className="normal-case font-normal text-slate-400">(lower runs first)</span>
          </label>
          <input
            type="number"
            min={0}
            value={rule.run_order}
            onChange={(e) => onChange({ ...rule, run_order: parseInt(e.target.value) || 0 })}
            className="w-32 px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Status
          </label>
          <button
            onClick={() => onChange({ ...rule, is_active: !rule.is_active })}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
              rule.is_active
                ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <div className={`w-8 h-4 rounded-full transition-colors relative ${rule.is_active ? 'bg-emerald-500' : 'bg-slate-200'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${rule.is_active ? 'left-4' : 'left-0.5'}`} />
            </div>
            <span className="text-xs font-medium">{rule.is_active ? 'Active' : 'Inactive'}</span>
          </button>
          <p className="mt-2 text-[10px] text-slate-400">
            Inactive rules are saved but never evaluated on forms.
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title, subtitle, icon }: { title: string; subtitle: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">{icon}</div>
      <div>
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-slate-400">{label}</span>
      <span className={`text-[10px] font-medium ${active ? 'text-blue-600' : 'text-slate-400'}`}>{value}</span>
    </div>
  );
}

