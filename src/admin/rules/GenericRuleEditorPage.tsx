import FilterSelect from '../../app/components/FilterSelect';
import { useState } from 'react';
import {
  ArrowLeft, Save, Plus, Trash2, Info, AlertTriangle, Ban, Lightbulb, X } from 'lucide-react';
import type {
  GenericRule, GenericCondition, GenericConditionsBlock,
  GenericAction, GenericActionType, GenericFieldSchema,
  GenericConditionOperator,
} from '../../app/services/genericRulesEngine';
import {
  OPERATORS_BY_TYPE, OPERATOR_LABELS, NO_VALUE_OPERATORS,
  DUAL_VALUE_OPERATORS, MULTI_VALUE_OPERATORS, ACTION_META, genId,
} from '../../app/services/genericRulesEngine';

interface GenericRuleEditorPageProps {
  rule: GenericRule;
  entitySchema: GenericFieldSchema[];
  onSave: (rule: GenericRule) => void;
  onBack: () => void;
  saving?: boolean;
}

export default function GenericRuleEditorPage({
  rule: initialRule,
  entitySchema,
  onSave,
  onBack,
  saving,
}: GenericRuleEditorPageProps) {
  const [rule, setRule] = useState<GenericRule>(initialRule);
  const [activeTab, setActiveTab] = useState<'conditions' | 'actions' | 'else'>('conditions');

  const update = (patch: Partial<GenericRule>) => setRule((r) => ({ ...r, ...patch }));

  const handleSave = () => onSave(rule);

  const conditionsCount = rule.conditions.conditions.length;
  const actionsCount = rule.actions.length;
  const elseCount = rule.elseActions?.length ?? 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fafbfc]">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={rule.name}
            onChange={(e) => update({ name: e.target.value })}
            className="w-full text-[14px] font-semibold text-slate-800 bg-transparent border-0 focus:outline-none focus:ring-0 placeholder:text-slate-300"
            placeholder="Rule name..."
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-[11px] text-slate-500">Active</span>
            <button
              type="button"
              onClick={() => update({ isActive: !rule.isActive })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${rule.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${rule.isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </label>
          <button
            onClick={handleSave}
            disabled={!rule.name.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            <Save size={12} />
            {saving ? 'Saving...' : 'Save Rule'}
          </button>
        </div>
      </div>

      {/* Description */}
      <div className="bg-white border-b border-slate-100 px-5 py-2 shrink-0">
        <input
          type="text"
          value={rule.description ?? ''}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Optional description..."
          className="w-full text-[12px] text-slate-500 bg-transparent border-0 focus:outline-none placeholder:text-slate-300"
        />
      </div>

      {/* Logical operator selector */}
      <div className="bg-white border-b border-slate-100 px-5 py-2.5 flex items-center gap-4 shrink-0">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Run when conditions are</span>
        <div className="flex rounded-lg overflow-hidden border border-slate-200">
          {(['AND', 'OR'] as const).map((op) => (
            <button
              key={op}
              onClick={() => update({ conditions: { ...rule.conditions, logicalOperator: op } })}
              className={`px-3 py-1 text-[11px] font-bold transition-colors ${
                rule.conditions.logicalOperator === op
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {op === 'AND' ? 'ALL met (AND)' : 'ANY met (OR)'}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-slate-400 ml-auto">
          Run order: {rule.runOrder}
        </span>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-5 flex items-center gap-0 shrink-0">
        {([
          { id: 'conditions' as const, label: 'Conditions', count: conditionsCount },
          { id: 'actions' as const, label: 'THEN Actions', count: actionsCount },
          { id: 'else' as const, label: 'ELSE Actions', count: elseCount },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-medium border-b-2 transition-all -mb-px ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-5">
        {activeTab === 'conditions' && (
          <ConditionsPanel
            schema={entitySchema}
            block={rule.conditions}
            onChange={(conditions) => update({ conditions })}
          />
        )}
        {activeTab === 'actions' && (
          <ActionsPanel
            label="THEN — when conditions are met"
            labelColor="text-emerald-700"
            borderColor="border-emerald-200"
            bgColor="bg-emerald-50/30"
            schema={entitySchema}
            actions={rule.actions}
            onChange={(actions) => update({ actions })}
          />
        )}
        {activeTab === 'else' && (
          <ActionsPanel
            label="ELSE — when conditions are NOT met"
            labelColor="text-slate-600"
            borderColor="border-slate-200"
            bgColor="bg-slate-50/30"
            schema={entitySchema}
            actions={rule.elseActions ?? []}
            onChange={(elseActions) => update({ elseActions })}
            optional
          />
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Conditions Panel
// ──────────────────────────────────────────

function ConditionsPanel({
  schema,
  block,
  onChange,
}: {
  schema: GenericFieldSchema[];
  block: GenericConditionsBlock;
  onChange: (b: GenericConditionsBlock) => void;
}) {
  const addCondition = () => {
    const f = schema[0];
    const ops = f ? OPERATORS_BY_TYPE[f.type] : ['equals' as GenericConditionOperator];
    const cond: GenericCondition = {
      id: genId(),
      field: f?.key ?? '',
      operator: ops[0],
      value: null,
    };
    onChange({ ...block, conditions: [...block.conditions, cond] });
  };

  const updateCondition = (id: string, c: GenericCondition) =>
    onChange({ ...block, conditions: block.conditions.map((x) => (x.id === id ? c : x)) });

  const removeCondition = (id: string) =>
    onChange({ ...block, conditions: block.conditions.filter((x) => x.id !== id) });

  return (
    <div className="max-w-3xl space-y-3">
      {block.conditions.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
          <p className="text-[13px] text-slate-400 mb-1">No conditions defined</p>
          <p className="text-[11px] text-slate-300">This rule will always run when active.</p>
        </div>
      ) : (
        block.conditions.map((cond, idx) => (
          <ConditionRow
            key={cond.id}
            cond={cond}
            idx={idx}
            schema={schema}
            logicalOp={block.logicalOperator}
            onChange={(c) => updateCondition(cond.id, c)}
            onRemove={() => removeCondition(cond.id)}
          />
        ))
      )}
      <button
        onClick={addCondition}
        className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-[12px] text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
      >
        <Plus size={13} /> Add Condition
      </button>
    </div>
  );
}

function ConditionRow({
  cond,
  idx,
  schema,
  logicalOp,
  onChange,
  onRemove,
}: {
  cond: GenericCondition;
  idx: number;
  schema: GenericFieldSchema[];
  logicalOp: 'AND' | 'OR';
  onChange: (c: GenericCondition) => void;
  onRemove: () => void;
}) {
  const field = schema.find((f) => f.key === cond.field);
  const operators = field ? OPERATORS_BY_TYPE[field.type] : ['equals' as GenericConditionOperator];
  const noValue = NO_VALUE_OPERATORS.has(cond.operator);
  const dualValue = DUAL_VALUE_OPERATORS.has(cond.operator);
  const multiValue = MULTI_VALUE_OPERATORS.has(cond.operator);

  const handleFieldChange = (key: string) => {
    const f = schema.find((x) => x.key === key);
    const ops = f ? OPERATORS_BY_TYPE[f.type] : ['equals' as GenericConditionOperator];
    onChange({ ...cond, field: key, operator: ops[0], value: null, value2: null });
  };

  const handleOperatorChange = (op: GenericConditionOperator) => {
    onChange({ ...cond, operator: op, value: MULTI_VALUE_OPERATORS.has(op) ? [] : null, value2: null });
  };

  const toggleOption = (opt: string) => {
    const arr = Array.isArray(cond.value) ? (cond.value as string[]) : [];
    const next = arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt];
    onChange({ ...cond, value: next });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        {idx === 0 ? (
          <span className="text-[10px] font-bold text-slate-400 uppercase w-8 text-center shrink-0">IF</span>
        ) : (
          <span className={`text-[10px] font-bold uppercase w-8 text-center shrink-0 ${
            logicalOp === 'AND' ? 'text-blue-500' : 'text-amber-500'
          }`}>{logicalOp}</span>
        )}

        {/* Field selector */}
        <div className="relative w-44 shrink-0">
          <FilterSelect
            value={cond.field}
            onChange={(e) => handleFieldChange(e.target.value)}
            className="w-full appearance-none text-[12px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 pr-6"
          >
            {schema.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </FilterSelect>
          </div>

        {/* Operator selector */}
        <div className="relative w-44 shrink-0">
          <FilterSelect
            value={cond.operator}
            onChange={(e) => handleOperatorChange(e.target.value as GenericConditionOperator)}
            className="w-full appearance-none text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 pr-6"
          >
            {operators.map((op) => (
              <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
            ))}
          </FilterSelect>
          </div>

        {/* Value input */}
        {!noValue && !multiValue && (
          <div className="flex-1 flex items-center gap-2">
            {field?.type === 'optionset' && field.options ? (
              <div className="relative flex-1">
                <FilterSelect
                  value={String(cond.value ?? '')}
                  onChange={(e) => onChange({ ...cond, value: e.target.value })}
                  className="w-full appearance-none text-[12px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 pr-6"
                >
                  <option value="">— Select —</option>
                  {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </FilterSelect>
                </div>
            ) : field?.type === 'boolean' ? (
              <div className="relative flex-1">
                <FilterSelect
                  value={String(cond.value ?? '')}
                  onChange={(e) => onChange({ ...cond, value: e.target.value })}
                  className="w-full appearance-none text-[12px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 pr-6"
                >
                  <option value="">— Select —</option>
                  <option value="true">True</option>
                  <option value="false">False</option>
                </FilterSelect>
                </div>
            ) : field?.type === 'date' ? (
              <input
                type="date"
                value={String(cond.value ?? '')}
                onChange={(e) => onChange({ ...cond, value: e.target.value })}
                className="flex-1 text-[12px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            ) : (
              <input
                type={field?.type === 'number' ? 'number' : 'text'}
                value={String(cond.value ?? '')}
                onChange={(e) => onChange({ ...cond, value: e.target.value })}
                placeholder="Value..."
                className="flex-1 text-[12px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300"
              />
            )}
            {dualValue && (
              <>
                <span className="text-[11px] text-slate-400 shrink-0">and</span>
                <input
                  type={field?.type === 'number' ? 'number' : field?.type === 'date' ? 'date' : 'text'}
                  value={String(cond.value2 ?? '')}
                  onChange={(e) => onChange({ ...cond, value2: e.target.value })}
                  placeholder="To..."
                  className="flex-1 text-[12px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300"
                />
              </>
            )}
          </div>
        )}

        {noValue && <span className="flex-1 text-[11px] text-slate-300 italic">No value required</span>}

        <button onClick={onRemove} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors shrink-0">
          <Trash2 size={13} />
        </button>
      </div>

      {/* Multi-value checkbox panel for IN / NOT IN */}
      {multiValue && field?.type === 'optionset' && field.options && (
        <div className="border-t border-slate-100 px-3 py-2 bg-slate-50/50">
          <p className="text-[10px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Select values</p>
          <div className="flex flex-wrap gap-2">
            {field.options.map((opt) => {
              const arr = Array.isArray(cond.value) ? (cond.value as string[]) : [];
              const checked = arr.includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => toggleOption(opt)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                    checked
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                  }`}
                >
                  {checked && <X size={10} />}
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────
// Actions Panel
// ──────────────────────────────────────────

function ActionsPanel({
  label,
  labelColor,
  borderColor,
  bgColor,
  schema,
  actions,
  onChange,
  optional,
}: {
  label: string;
  labelColor: string;
  borderColor: string;
  bgColor: string;
  schema: GenericFieldSchema[];
  actions: GenericAction[];
  onChange: (a: GenericAction[]) => void;
  optional?: boolean;
}) {
  const addAction = () => {
    const action: GenericAction = {
      id: genId(),
      type: 'setVisibility',
      field: schema[0]?.key,
      value: 'hidden',
    };
    onChange([...actions, action]);
  };

  const update = (id: string, a: GenericAction) => onChange(actions.map((x) => (x.id === id ? a : x)));
  const remove = (id: string) => onChange(actions.filter((x) => x.id !== id));

  return (
    <div className={`max-w-3xl border-2 rounded-xl p-4 ${borderColor} ${bgColor}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-[11px] font-bold ${labelColor}`}>{label}</span>
        {actions.length > 0 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/60 text-slate-600 border border-slate-200">
            {actions.length}
          </span>
        )}
        {optional && actions.length === 0 && (
          <span className="text-[10px] text-slate-400">(optional)</span>
        )}
      </div>

      <div className="space-y-2">
        {actions.map((action) => (
          <ActionRow
            key={action.id}
            action={action}
            schema={schema}
            onChange={(a) => update(action.id, a)}
            onRemove={() => remove(action.id)}
          />
        ))}
      </div>

      <button
        onClick={addAction}
        className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 text-[12px] border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
      >
        <Plus size={12} /> Add Action
      </button>
    </div>
  );
}

const ACTION_TYPE_OPTIONS: { type: GenericActionType; label: string; group: string }[] = [
  { type: 'setVisibility', label: 'Set Visibility', group: 'Visibility' },
  { type: 'setRequired',   label: 'Set Required',   group: 'Validation' },
  { type: 'lock',          label: 'Lock Field',      group: 'Lock' },
  { type: 'setValue',      label: 'Set Value',       group: 'Data' },
  { type: 'setDefault',    label: 'Set Default',     group: 'Data' },
  { type: 'showError',     label: 'Show Message',    group: 'Notify' },
  { type: 'recommend',     label: 'Recommendation',  group: 'Notify' },
];

function ActionRow({
  action,
  schema,
  onChange,
  onRemove,
}: {
  action: GenericAction;
  schema: GenericFieldSchema[];
  onChange: (a: GenericAction) => void;
  onRemove: () => void;
}) {
  const meta = ACTION_META[action.type];

  const handleTypeChange = (type: GenericActionType) => {
    const m = ACTION_META[type];
    onChange({
      id: action.id,
      type,
      field: m.hasField ? (action.field ?? schema[0]?.key) : undefined,
      value: type === 'setVisibility' ? 'hidden'
           : type === 'setRequired'   ? 'true'
           : type === 'lock'          ? 'true'
           : m.hasValue               ? ''
           : undefined,
      message: type === 'showError' ? (action.message ?? '') : undefined,
      level: type === 'showError' ? (action.level ?? 'info') : undefined,
      title: type === 'recommend' ? (action.title ?? '') : undefined,
      description: type === 'recommend' ? (action.description ?? '') : undefined,
    });
  };

  return (
    <div className="flex items-start gap-2 bg-white border border-slate-200 rounded-lg p-2.5">
      <div className="flex-1 space-y-2">
        {/* Type + group badge */}
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${meta.color}`}>
            {meta.group}
          </span>
          <div className="relative flex-1">
            <FilterSelect
              value={action.type}
              onChange={(e) => handleTypeChange(e.target.value as GenericActionType)}
              className="w-full appearance-none text-[12px] font-medium text-slate-700 bg-transparent border-0 focus:outline-none pr-5"
            >
              {ACTION_TYPE_OPTIONS.map(({ type, label }) => (
                <option key={type} value={type}>{label}</option>
              ))}
            </FilterSelect>
            </div>
        </div>

        {/* Field selector */}
        {meta.hasField && (
          <div className="flex items-center gap-2 pl-1">
            <span className="text-[10px] text-slate-400 shrink-0 w-12">Field:</span>
            <div className="relative flex-1">
              <FilterSelect
                value={action.field ?? ''}
                onChange={(e) => onChange({ ...action, field: e.target.value })}
                className="w-full appearance-none text-[12px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 pr-6"
              >
                {schema.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </FilterSelect>
              </div>
          </div>
        )}

        {/* setVisibility value */}
        {action.type === 'setVisibility' && (
          <div className="flex items-center gap-2 pl-1">
            <span className="text-[10px] text-slate-400 shrink-0 w-12">Make:</span>
            <div className="flex rounded-lg overflow-hidden border border-slate-200">
              {([
                { v: 'visible', label: 'Visible' },
                { v: 'hidden',  label: 'Hidden' },
              ]).map(({ v, label }) => (
                <button
                  key={v}
                  onClick={() => onChange({ ...action, value: v })}
                  className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
                    action.value === v ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* setRequired / lock toggle */}
        {(action.type === 'setRequired' || action.type === 'lock') && (
          <div className="flex items-center gap-2 pl-1">
            <span className="text-[10px] text-slate-400 shrink-0 w-12">{action.type === 'lock' ? 'Lock:' : 'Status:'}</span>
            <div className="flex rounded-lg overflow-hidden border border-slate-200">
              {([
                { v: 'true',  label: action.type === 'lock' ? 'Locked' : 'Required' },
                { v: 'false', label: action.type === 'lock' ? 'Unlocked' : 'Optional' },
              ]).map(({ v, label }) => (
                <button
                  key={v}
                  onClick={() => onChange({ ...action, value: v })}
                  className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
                    String(action.value) === v
                      ? v === 'true' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'
                      : 'bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* setValue / setDefault */}
        {(action.type === 'setValue' || action.type === 'setDefault') && (
          <div className="flex items-center gap-2 pl-1">
            <span className="text-[10px] text-slate-400 shrink-0 w-12">Value:</span>
            <input
              type="text"
              value={String(action.value ?? '')}
              onChange={(e) => onChange({ ...action, value: e.target.value })}
              placeholder="Enter value..."
              className="flex-1 text-[12px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300"
            />
          </div>
        )}

        {/* showError */}
        {action.type === 'showError' && (
          <div className="space-y-2 pl-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 shrink-0 w-12">Level:</span>
              <div className="flex rounded-lg overflow-hidden border border-slate-200">
                {([
                  { v: 'info' as const,    label: 'Info',    cls: 'bg-blue-600 text-white' },
                  { v: 'warning' as const, label: 'Warning', cls: 'bg-amber-500 text-white' },
                  { v: 'error' as const,   label: 'Error',   cls: 'bg-red-500 text-white' },
                ]).map(({ v, label, cls }) => (
                  <button
                    key={v}
                    onClick={() => onChange({ ...action, level: v })}
                    className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                      action.level === v ? cls : 'bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[10px] text-slate-400 shrink-0 w-12 pt-1.5">
                {action.level === 'error' ? <Ban size={11} /> : action.level === 'warning' ? <AlertTriangle size={11} /> : <Info size={11} />}
              </span>
              <textarea
                value={action.message ?? ''}
                onChange={(e) => onChange({ ...action, message: e.target.value })}
                placeholder="Message text shown to the user..."
                rows={2}
                className="flex-1 text-[12px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300 resize-none"
              />
            </div>
          </div>
        )}

        {/* recommend */}
        {action.type === 'recommend' && (
          <div className="space-y-1.5 pl-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 shrink-0 w-12">Title:</span>
              <input
                type="text"
                value={action.title ?? ''}
                onChange={(e) => onChange({ ...action, title: e.target.value })}
                placeholder="Recommendation title..."
                className="flex-1 text-[12px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300"
              />
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[10px] text-slate-400 shrink-0 w-12 pt-1.5"><Lightbulb size={11} /></span>
              <textarea
                value={action.description ?? ''}
                onChange={(e) => onChange({ ...action, description: e.target.value })}
                placeholder="Describe the recommendation..."
                rows={2}
                className="flex-1 text-[12px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300 resize-none"
              />
            </div>
          </div>
        )}
      </div>

      <button onClick={onRemove} className="p-1 text-slate-300 hover:text-red-500 transition-colors shrink-0 mt-0.5">
        <Trash2 size={12} />
      </button>
    </div>
  );
}
