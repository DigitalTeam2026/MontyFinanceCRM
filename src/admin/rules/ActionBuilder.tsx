import { useState, useEffect } from 'react';
import {
  Plus, Trash2, Eye, Lock, AlertCircle, Sliders, Database,
  Star, XCircle, Braces, ChevronDown, GripVertical, Settings,
  X, Check, Loader2,
} from 'lucide-react';
import type { FieldDefinition, ChoiceOption } from '../../types/field';
import type { RuleAction, ActionType, RuleActionSet, FormulaToken } from '../../types/businessRule';
import { ACTION_META } from '../../types/businessRule';
import { supabase } from '../../lib/supabase';

// Name and PK column per physical table for lookup dropdowns
const TABLE_NAME_COL: Record<string, string> = {
  account: 'account_name',
  contact: 'full_name',
  crm_user: 'full_name',
  currency: 'name',
  country: 'name',
  industry: 'name',
  product: 'name',
  product_family: 'name',
  lead: 'full_name',
  opportunity: 'topic',
  campaign: 'name',
  event: 'name',
  crm_source: 'name',
  business_unit: 'name',
  team: 'name',
  security_role: 'name',
  segment: 'name',
  journey: 'name',
  marketing_email: 'subject',
};
const TABLE_PK_COL: Record<string, string> = {
  account: 'account_id',
  contact: 'contact_id',
  crm_user: 'user_id',
  currency: 'currency_id',
  country: 'country_id',
  industry: 'industry_id',
  product: 'product_id',
  product_family: 'family_id',
  lead: 'lead_id',
  opportunity: 'opportunity_id',
  campaign: 'campaign_id',
  event: 'event_id',
  crm_source: 'source_id',
  business_unit: 'business_unit_id',
  team: 'team_id',
  security_role: 'role_id',
  segment: 'segment_id',
  journey: 'journey_id',
  marketing_email: 'email_id',
};

let ctr = 0;
const uid = () => `a_${Date.now()}_${ctr++}`;
const tid = () => `t_${Date.now()}_${ctr++}`;

// ─── Component palette definition ────────────────────────────────────────────
const PALETTE: { type: ActionType; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    type: 'add_recommendation',
    label: 'Recommendation',
    desc: 'Suggest an action to the user',
    icon: <Star size={14} className="text-cyan-600" />,
  },
  {
    type: 'lock_unlock',
    label: 'Lock / Unlock',
    desc: 'Make a field read-only or editable',
    icon: <Lock size={14} className="text-amber-600" />,
  },
  {
    type: 'show_error_message',
    label: 'Show Error Message',
    desc: 'Display error and optionally block save',
    icon: <AlertCircle size={14} className="text-red-600" />,
  },
  {
    type: 'set_field_value',
    label: 'Set Field Value',
    desc: 'Set a field to a static or derived value',
    icon: <Sliders size={14} className="text-blue-600" />,
  },
  {
    type: 'set_default_value',
    label: 'Set Default Value',
    desc: 'Apply a default when field is empty',
    icon: <Database size={14} className="text-blue-500" />,
  },
  {
    type: 'set_business_required',
    label: 'Set Business Required',
    desc: 'Control required level of a field',
    icon: <AlertCircle size={14} className="text-rose-600" />,
  },
  {
    type: 'set_visibility',
    label: 'Set Visibility',
    desc: 'Show or hide a field on the form',
    icon: <Eye size={14} className="text-emerald-600" />,
  },
  {
    type: 'clear_field_value',
    label: 'Clear Field Value',
    desc: 'Clear the value of a field',
    icon: <XCircle size={14} className="text-slate-500" />,
  },
  {
    type: 'advanced_formula_value',
    label: 'Advanced Formula Value',
    desc: 'Build a formula from fields and text',
    icon: <Braces size={14} className="text-violet-600" />,
  },
];

// ─── Helper: get field type name ─────────────────────────────────────────────
function getFieldTypeName(f: FieldDefinition): string {
  return f.field_type?.name ?? 'text';
}

function getChoiceOptions(f: FieldDefinition): ChoiceOption[] {
  const config = f.config_json as Record<string, unknown> | null;
  if (!config) return [];
  const opts = config.choices ?? config.options ?? config.inline_choices;
  if (Array.isArray(opts)) return opts as ChoiceOption[];
  return [];
}

// ─── Action card summary label ────────────────────────────────────────────────
function actionSummary(a: RuleAction, fields: FieldDefinition[]): string {
  const f = fields.find((x) => x.logical_name === a.target_field);
  const fname = f?.display_name ?? a.target_field ?? '—';
  switch (a.action_type) {
    case 'set_visibility':
      return fname;
    case 'lock_unlock':
      return fname;
    case 'set_field_value':
    case 'set_default_value':
    case 'advanced_formula_value':
      return fname;
    case 'set_business_required':
      return fname;
    case 'clear_field_value':
      return fname;
    case 'show_error_message':
      return a.message ? `"${a.message.slice(0, 30)}${a.message.length > 30 ? '…' : ''}"` : '—';
    case 'add_recommendation':
      return a.recommendation_title ? a.recommendation_title.slice(0, 30) : '—';
    default:
      return fname;
  }
}

// ─── Create default action ────────────────────────────────────────────────────
function makeAction(type: ActionType, fields: FieldDefinition[]): RuleAction {
  const f = fields[0];
  const base: RuleAction = { id: uid(), action_type: type };
  switch (type) {
    case 'set_visibility':
      return { ...base, target_field: f?.logical_name, target_field_display_name: f?.display_name, value: true };
    case 'lock_unlock':
      return { ...base, target_field: f?.logical_name, target_field_display_name: f?.display_name, value: true };
    case 'set_business_required':
      return { ...base, target_field: f?.logical_name, target_field_display_name: f?.display_name, required_level: 'required' };
    case 'set_field_value':
      return { ...base, target_field: f?.logical_name, target_field_display_name: f?.display_name, value_type: 'static', value: '' };
    case 'set_default_value':
      return { ...base, target_field: f?.logical_name, target_field_display_name: f?.display_name, value_type: 'static', value: '', apply_when: 'if_empty' };
    case 'clear_field_value':
      return { ...base, target_field: f?.logical_name, target_field_display_name: f?.display_name };
    case 'show_error_message':
      return { ...base, target_field: f?.logical_name, target_field_display_name: f?.display_name, message: '', block_save: true };
    case 'add_recommendation':
      return { ...base, recommendation_title: '', recommendation_message: '' };
    case 'advanced_formula_value':
      return { ...base, target_field: f?.logical_name, target_field_display_name: f?.display_name, formula_tokens: [] };
    default:
      return base;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
interface ActionBuilderProps {
  fields: FieldDefinition[];
  actionSet: RuleActionSet;
  onChange: (set: RuleActionSet) => void;
}

function normalizeActionIds(set: RuleActionSet): RuleActionSet {
  const seen = new Set<string>();
  const fix = (a: RuleAction): RuleAction => {
    if (!a.id || seen.has(a.id)) {
      const newId = uid();
      seen.add(newId);
      return { ...a, id: newId };
    }
    seen.add(a.id);
    return a;
  };
  return {
    if_actions: set.if_actions.map(fix),
    else_actions: set.else_actions.map(fix),
  };
}

export default function ActionBuilder({ fields, actionSet, onChange }: ActionBuilderProps) {
  const [selectedIfId, setSelectedIfId] = useState<string | null>(null);
  const [selectedElseId, setSelectedElseId] = useState<string | null>(null);
  const [activeBranch, setActiveBranch] = useState<'if' | 'else'>('if');

  const selectedId = activeBranch === 'if' ? selectedIfId : selectedElseId;
  const setSelectedId = activeBranch === 'if' ? setSelectedIfId : setSelectedElseId;

  const branchActions = activeBranch === 'if' ? actionSet.if_actions : actionSet.else_actions;
  const selectedAction = branchActions.find((a) => a.id === selectedId) ?? null;

  const updateIf = (actions: RuleAction[]) => onChange({ ...actionSet, if_actions: actions });
  const updateElse = (actions: RuleAction[]) => onChange({ ...actionSet, else_actions: actions });

  const addAction = (type: ActionType) => {
    const a = makeAction(type, fields);
    if (activeBranch === 'if') {
      updateIf([...actionSet.if_actions, a]);
      setSelectedIfId(a.id);
    } else {
      updateElse([...actionSet.else_actions, a]);
      setSelectedElseId(a.id);
    }
  };

  const updateAction = (updated: RuleAction) => {
    if (activeBranch === 'if') {
      updateIf(actionSet.if_actions.map((a) => (a.id === updated.id ? updated : a)));
    } else {
      updateElse(actionSet.else_actions.map((a) => (a.id === updated.id ? updated : a)));
    }
  };

  const removeAction = (id: string) => {
    if (activeBranch === 'if') {
      updateIf(actionSet.if_actions.filter((a) => a.id !== id));
      if (selectedIfId === id) setSelectedIfId(null);
    } else {
      updateElse(actionSet.else_actions.filter((a) => a.id !== id));
      if (selectedElseId === id) setSelectedElseId(null);
    }
  };

  return (
    <div className="flex gap-0 h-full min-h-[520px] border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Left: Components panel */}
      <ComponentsPanel onAdd={addAction} activeBranch={activeBranch} />

      {/* Center: Canvas */}
      <div className="flex-1 flex flex-col min-w-0 border-x border-slate-200">
        {/* Branch selector */}
        <div className="h-10 flex shrink-0 border-b border-slate-200">
          <button
            onClick={() => setActiveBranch('if')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors border-r border-slate-200 ${
              activeBranch === 'if'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${activeBranch === 'if' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            THEN
            {actionSet.if_actions.length > 0 && (
              <span className="ml-1 text-[10px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded-full">
                {actionSet.if_actions.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveBranch('else')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${
              activeBranch === 'else'
                ? 'bg-slate-100 text-slate-700'
                : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${activeBranch === 'else' ? 'bg-slate-500' : 'bg-slate-300'}`} />
            ELSE
            {actionSet.else_actions.length > 0 && (
              <span className="ml-1 text-[10px] bg-slate-200 text-slate-600 font-bold px-1.5 py-0.5 rounded-full">
                {actionSet.else_actions.length}
              </span>
            )}
          </button>
        </div>

        {/* Action cards */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {activeBranch === 'if' && (
            <ActionCanvas
              actions={actionSet.if_actions}
              fields={fields}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onRemove={removeAction}
            />
          )}
          {activeBranch === 'else' && (
            <ActionCanvas
              actions={actionSet.else_actions}
              fields={fields}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onRemove={removeAction}
            />
          )}
          {(activeBranch === 'if' ? actionSet.if_actions : actionSet.else_actions).length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <div className="text-slate-300 mb-2">
                <Plus size={24} />
              </div>
              <p className="text-xs text-slate-400">
                Click an action in the <strong>Components</strong> panel to add it here
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right: Properties panel */}
      <div className="w-72 shrink-0 flex flex-col bg-slate-50">
        <div className="h-10 flex items-center gap-2 px-4 border-b border-slate-200 bg-white shrink-0">
          <Settings size={13} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-600">Properties</span>
          {selectedAction && (
            <button
              onClick={() => setSelectedId(null)}
              className="ml-auto text-slate-300 hover:text-slate-500 transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {selectedAction ? (
            <PropertiesPanel
              action={selectedAction}
              fields={fields}
              branch={activeBranch}
              onChange={updateAction}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10">
              <Settings size={24} className="text-slate-200 mb-3" />
              <p className="text-xs text-slate-400">
                Select an action card to configure its properties
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Left panel: Components ───────────────────────────────────────────────────
function ComponentsPanel({
  onAdd,
  activeBranch,
}: {
  onAdd: (type: ActionType) => void;
  activeBranch: 'if' | 'else';
}) {
  return (
    <div className="w-52 shrink-0 flex flex-col bg-white">
      <div className="h-10 flex items-center px-4 border-b border-slate-200 shrink-0">
        <span className="text-xs font-semibold text-slate-600">Components</span>
      </div>
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {PALETTE.map(({ type, label, desc, icon }) => (
          <button
            key={type}
            onClick={() => onAdd(type)}
            title={desc}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left hover:bg-blue-50 hover:text-blue-700 group transition-colors border border-transparent hover:border-blue-100"
          >
            <span className="shrink-0 group-hover:scale-110 transition-transform">{icon}</span>
            <span className="text-xs font-medium text-slate-700 group-hover:text-blue-700 leading-tight">{label}</span>
            <Plus
              size={11}
              className={`ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                activeBranch === 'if' ? 'text-emerald-600' : 'text-slate-500'
              }`}
            />
          </button>
        ))}
      </div>
      <div className="px-3 py-2 border-t border-slate-100 bg-slate-50">
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Click to add to <span className={`font-semibold ${activeBranch === 'if' ? 'text-emerald-600' : 'text-slate-500'}`}>{activeBranch === 'if' ? 'THEN' : 'ELSE'}</span> branch
        </p>
      </div>
    </div>
  );
}

// ─── Center: Action canvas ────────────────────────────────────────────────────
function ActionCanvas({
  actions,
  fields,
  selectedId,
  onSelect,
  onRemove,
}: {
  actions: RuleAction[];
  fields: FieldDefinition[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      {actions.map((a) => {
        const meta = ACTION_META[a.action_type];
        const isSelected = a.id === selectedId;
        const summary = actionSummary(a, fields);
        return (
          <div
            key={a.id}
            onClick={() => onSelect(a.id)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-all group ${
              isSelected
                ? 'border-blue-400 bg-blue-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
            }`}
          >
            <GripVertical size={12} className="text-slate-300 shrink-0" />
            <div className={`w-2 h-2 rounded-full shrink-0 ${meta.dotColor}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold truncate ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                {meta.label}
              </p>
              <p className="text-[10px] text-slate-400 truncate">{summary}</p>
            </div>
            {isSelected && (
              <Check size={11} className="text-blue-500 shrink-0" />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(a.id); }}
              className="shrink-0 p-0.5 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={11} />
            </button>
          </div>
        );
      })}
    </>
  );
}

// ─── Right: Properties panel ──────────────────────────────────────────────────
function PropertiesPanel({
  action,
  fields,
  branch,
  onChange,
}: {
  action: RuleAction;
  fields: FieldDefinition[];
  branch: 'if' | 'else';
  onChange: (a: RuleAction) => void;
}) {
  const meta = ACTION_META[action.action_type];
  const targetField = fields.find((f) => f.logical_name === action.target_field);
  const fieldTypeName = targetField ? getFieldTypeName(targetField) : 'text';

  const setField = (ln: string) => {
    const f = fields.find((x) => x.logical_name === ln);
    onChange({ ...action, target_field: ln, target_field_display_name: f?.display_name });
  };

  return (
    <div className="p-4 space-y-4">
      {/* Action type badge */}
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${meta.color}`}>
        <div className={`w-1.5 h-1.5 rounded-full ${meta.dotColor}`} />
        {meta.label}
      </div>

      <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">
        {branch === 'if' ? 'THEN Branch' : 'ELSE Branch'}
      </p>

      {/* Action type label */}
      <PropRow label="Action Type">
        <span className="text-xs text-slate-700 font-medium">{meta.label}</span>
      </PropRow>

      {/* ── Set Visibility ───────────────────────────────────── */}
      {action.action_type === 'set_visibility' && (
        <>
          <FieldSelector fields={fields} value={action.target_field ?? ''} onChange={setField} />
          <PropRow label="Visibility">
            <ToggleButtons
              options={[
                { value: 'true', label: 'Visible' },
                { value: 'false', label: 'Hidden' },
              ]}
              value={String(action.value ?? 'true')}
              onChange={(v) => onChange({ ...action, value: v === 'true' })}
              activeClass="bg-emerald-600 text-white"
            />
          </PropRow>
        </>
      )}

      {/* ── Lock / Unlock ────────────────────────────────────── */}
      {action.action_type === 'lock_unlock' && (
        <>
          <FieldSelector fields={fields} value={action.target_field ?? ''} onChange={setField} />
          <PropRow label="Behavior">
            <ToggleButtons
              options={[
                { value: 'true', label: 'Lock' },
                { value: 'false', label: 'Unlock' },
              ]}
              value={String(action.value ?? 'true')}
              onChange={(v) => onChange({ ...action, value: v === 'true' })}
              activeClass="bg-amber-500 text-white"
            />
          </PropRow>
        </>
      )}

      {/* ── Set Business Required ────────────────────────────── */}
      {action.action_type === 'set_business_required' && (
        <>
          <FieldSelector fields={fields} value={action.target_field ?? ''} onChange={setField} />
          <PropRow label="Required Level">
            <div className="flex flex-col gap-1 w-full">
              {([
                { value: 'required',    label: 'Business Required',       desc: 'Blocks save if empty' },
                { value: 'recommended', label: 'Business Recommended',    desc: 'Shows suggestion only' },
                { value: 'none',        label: 'Not Business Required',   desc: 'Removes requirement' },
              ] as const).map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => onChange({ ...action, required_level: value })}
                  className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border text-left transition-all ${
                    action.required_level === value
                      ? 'border-rose-400 bg-rose-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${
                    action.required_level === value ? 'border-rose-500 bg-rose-500' : 'border-slate-300'
                  }`}>
                    {action.required_level === value && <div className="w-1 h-1 rounded-full bg-white" />}
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-700">{label}</p>
                    <p className="text-[10px] text-slate-400">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </PropRow>
        </>
      )}

      {/* ── Set Field Value ──────────────────────────────────── */}
      {action.action_type === 'set_field_value' && (
        <>
          <FieldSelector fields={fields} value={action.target_field ?? ''} onChange={setField} />
          <PropRow label="Value Type">
            <ToggleButtons
              options={[
                { value: 'static', label: 'Static Value' },
                { value: 'field',  label: 'Field(s)' },
              ]}
              value={action.value_type ?? 'static'}
              onChange={(v) => onChange({ ...action, value_type: v as 'static' | 'field', value: '', value_field: undefined, value_fields: [] })}
              activeClass="bg-blue-600 text-white"
            />
          </PropRow>
          {action.value_type !== 'field' ? (
            <PropRow label="Value">
              <FieldValueInput
                fieldType={fieldTypeName}
                field={targetField}
                value={String(action.value ?? '')}
                onChange={(v) => onChange({ ...action, value: v })}
              />
            </PropRow>
          ) : (
            <MultiFieldSelector
              fields={fields}
              value={action.value_fields ?? (action.value_field ? [action.value_field] : [])}
              separator={action.value_fields_separator ?? ' '}
              onChange={(fs, sep) => onChange({ ...action, value_fields: fs, value_fields_separator: sep, value_field: undefined })}
            />
          )}
        </>
      )}

      {/* ── Set Default Value ────────────────────────────────── */}
      {action.action_type === 'set_default_value' && (
        <>
          <FieldSelector fields={fields} value={action.target_field ?? ''} onChange={setField} />
          <PropRow label="Value Type">
            <ToggleButtons
              options={[
                { value: 'static', label: 'Static Value' },
                { value: 'field',  label: 'Field(s)' },
              ]}
              value={action.value_type ?? 'static'}
              onChange={(v) => onChange({ ...action, value_type: v as 'static' | 'field', value: '', value_field: undefined, value_fields: [] })}
              activeClass="bg-blue-600 text-white"
            />
          </PropRow>
          {action.value_type !== 'field' ? (
            <PropRow label="Value">
              <FieldValueInput
                fieldType={fieldTypeName}
                field={targetField}
                value={String(action.value ?? '')}
                onChange={(v) => onChange({ ...action, value: v })}
              />
            </PropRow>
          ) : (
            <MultiFieldSelector
              fields={fields}
              value={action.value_fields ?? (action.value_field ? [action.value_field] : [])}
              separator={action.value_fields_separator ?? ' '}
              onChange={(fs, sep) => onChange({ ...action, value_fields: fs, value_fields_separator: sep, value_field: undefined })}
            />
          )}
          <PropRow label="Apply When">
            <ToggleButtons
              options={[
                { value: 'if_empty',  label: 'Only if empty' },
                { value: 'on_create', label: 'On create only' },
              ]}
              value={action.apply_when ?? 'if_empty'}
              onChange={(v) => onChange({ ...action, apply_when: v as 'if_empty' | 'on_create' })}
              activeClass="bg-blue-600 text-white"
            />
          </PropRow>
        </>
      )}

      {/* ── Clear Field Value ────────────────────────────────── */}
      {action.action_type === 'clear_field_value' && (
        <>
          <FieldSelector fields={fields} value={action.target_field ?? ''} onChange={setField} />
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
            <p className="text-[11px] text-slate-500">
              The field value will be cleared when this action runs. No additional configuration needed.
            </p>
          </div>
        </>
      )}

      {/* ── Show Error Message ───────────────────────────────── */}
      {action.action_type === 'show_error_message' && (
        <>
          <FieldSelector fields={fields} value={action.target_field ?? ''} onChange={setField} />
          <PropRow label="Error Message">
            <textarea
              value={action.message ?? ''}
              onChange={(e) => onChange({ ...action, message: e.target.value })}
              placeholder="Enter error message shown to user..."
              rows={3}
              className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-300 resize-none"
            />
          </PropRow>
          <PropRow label="Block Save">
            <div
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                action.block_save ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'
              }`}
              onClick={() => onChange({ ...action, block_save: !action.block_save })}
            >
              <div className="flex-1">
                <p className={`text-[11px] font-semibold ${action.block_save ? 'text-red-700' : 'text-slate-600'}`}>
                  {action.block_save ? 'Save is blocked' : 'Warning only'}
                </p>
                <p className="text-[10px] text-slate-400">
                  {action.block_save ? 'User cannot save until resolved' : 'User can still save'}
                </p>
              </div>
              <Toggle active={!!action.block_save} activeClass="bg-red-500" />
            </div>
          </PropRow>
        </>
      )}

      {/* ── Recommendation ───────────────────────────────────── */}
      {action.action_type === 'add_recommendation' && (
        <>
          <PropRow label="Title">
            <input
              type="text"
              value={action.recommendation_title ?? ''}
              onChange={(e) => onChange({ ...action, recommendation_title: e.target.value })}
              placeholder="Recommendation title..."
              className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-300"
            />
          </PropRow>
          <PropRow label="Message">
            <textarea
              value={action.recommendation_message ?? ''}
              onChange={(e) => onChange({ ...action, recommendation_message: e.target.value })}
              placeholder="Describe the recommended action..."
              rows={3}
              className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-300 resize-none"
            />
          </PropRow>
        </>
      )}

      {/* ── Advanced Formula Value ───────────────────────────── */}
      {action.action_type === 'advanced_formula_value' && (
        <>
          <FieldSelector fields={fields} value={action.target_field ?? ''} onChange={setField} />
          <FormulaBuilder
            tokens={action.formula_tokens ?? []}
            fields={fields}
            onChange={(tokens) => onChange({ ...action, formula_tokens: tokens })}
          />
        </>
      )}

      {/* ── Legacy actions: show a helpful note ─────────────── */}
      {['require_field','unrequire_field','show_field','hide_field','lock_field','unlock_field','set_value','clear_value','show_message','set_field_options'].includes(action.action_type) && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
          <p className="text-[11px] text-amber-700 font-medium">Legacy Action</p>
          <p className="text-[10px] text-amber-600 mt-0.5">
            This action was created with an older version. It will continue to work, but consider replacing it with a current action type.
          </p>
          {action.target_field && (
            <p className="text-[10px] text-amber-600 mt-1">Field: <strong>{action.target_field_display_name ?? action.target_field}</strong></p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Field selector row (reused by most actions) ──────────────────────────────
// ─── Multi-field selector (for "Another Field" value type) ───────────────────
function MultiFieldSelector({
  fields,
  value,
  separator,
  onChange,
}: {
  fields: FieldDefinition[];
  value: string[];
  separator: string;
  onChange: (fields: string[], separator: string) => void;
}) {
  const activeFields = fields.filter((f) => f.is_active);

  const addField = () => onChange([...value, activeFields[0]?.logical_name ?? ''], separator);
  const updateField = (idx: number, ln: string) => {
    const next = [...value];
    next[idx] = ln;
    onChange(next, separator);
  };
  const removeField = (idx: number) => onChange(value.filter((_, i) => i !== idx), separator);

  // Preview of the resulting value
  const preview = value
    .map((ln) => {
      const f = activeFields.find((x) => x.logical_name === ln);
      return f ? `[${f.display_name}]` : ln;
    })
    .filter(Boolean)
    .join(separator || ' ');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Source Fields</label>
        <button
          onClick={addField}
          className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700 transition-colors"
        >
          <Plus size={10} /> Add Field
        </button>
      </div>

      {value.length === 0 ? (
        <div className="text-[11px] text-slate-400 italic px-1">No fields selected. Click Add Field.</div>
      ) : (
        <div className="space-y-1.5">
          {value.map((ln, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 shrink-0 w-4 text-right">{idx + 1}.</span>
              <div className="relative flex-1">
                <select
                  value={ln}
                  onChange={(e) => updateField(idx, e.target.value)}
                  className="w-full appearance-none text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 pr-7"
                >
                  <option value="">— select field —</option>
                  {activeFields.map((f) => (
                    <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>
                  ))}
                </select>
                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <button
                onClick={() => removeField(idx)}
                className="shrink-0 text-slate-300 hover:text-red-500 transition-colors p-0.5"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {value.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider shrink-0 w-16">Separator</label>
          <input
            type="text"
            value={separator}
            onChange={(e) => onChange(value, e.target.value)}
            placeholder="space"
            className="flex-1 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-300 font-mono"
          />
        </div>
      )}

      {preview && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Preview</p>
          <p className="text-xs text-slate-700 font-mono break-all">{preview}</p>
        </div>
      )}
    </div>
  );
}

function FieldSelector({
  fields,
  value,
  onChange,
}: {
  fields: FieldDefinition[];
  value: string;
  onChange: (ln: string) => void;
}) {
  return (
    <PropRow label="Target Field">
      <FieldSelect fields={fields} value={value} onChange={onChange} />
    </PropRow>
  );
}

function FieldSelect({
  fields,
  value,
  onChange,
}: {
  fields: FieldDefinition[];
  value: string;
  onChange: (ln: string) => void;
}) {
  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 pr-8"
      >
        <option value="">— select field —</option>
        {fields.filter((f) => f.is_active).map((f) => (
          <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>
        ))}
      </select>
      <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  );
}

// ─── Field-type-aware value input ────────────────────────────────────────────
function FieldValueInput({
  fieldType,
  field,
  value,
  onChange,
}: {
  fieldType: string;
  field: FieldDefinition | undefined;
  value: string;
  onChange: (v: string) => void;
}) {
  const cfg = field?.config_json as Record<string, unknown> | null;
  const isStatecodeField = !!(cfg?.is_statecode_field);
  const isStatusreasonField = !!(cfg?.is_statusreason_field);
  const isChoice = fieldType === 'choice' || fieldType === 'multi_choice' || fieldType === 'optionset';
  const isLookup = fieldType === 'lookup';

  const [statecodeOptions, setStatecodeOptions] = useState<{ value: string; label: string }[]>([]);
  const [statusreasonOptions, setStatusreasonOptions] = useState<{ value: string; label: string }[]>([]);
  const [lookupOptions, setLookupOptions] = useState<{ value: string; label: string }[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    if (!field) return;
    if (isStatecodeField) {
      supabase
        .from('statecode_definition')
        .select('state_value, display_label')
        .eq('entity_definition_id', field.entity_definition_id)
        .order('sort_order')
        .then(({ data }) => {
          setStatecodeOptions((data ?? []).map((r) => ({ value: String(r.state_value), label: r.display_label })));
        });
    }
    if (isStatusreasonField) {
      supabase
        .from('status_reason_definition')
        .select('reason_value, display_label')
        .eq('entity_definition_id', field.entity_definition_id)
        .order('sort_order')
        .then(({ data }) => {
          setStatusreasonOptions((data ?? []).map((r) => ({ value: String(r.reason_value), label: r.display_label })));
        });
    }
  }, [field?.field_definition_id, isStatecodeField, isStatusreasonField]);

  useEffect(() => {
    if (!isLookup || !field?.lookup_entity_id) return;
    setLookupLoading(true);
    supabase
      .from('entity_definition')
      .select('physical_table_name')
      .eq('entity_definition_id', field.lookup_entity_id)
      .maybeSingle()
      .then(async ({ data: ent }) => {
        if (!ent) { setLookupLoading(false); return; }
        const table = ent.physical_table_name as string;
        const pkCol = TABLE_PK_COL[table] ?? `${table}_id`;
        const nameCol = TABLE_NAME_COL[table] ?? 'name';
        const { data } = await supabase.from(table).select(`${pkCol}, ${nameCol}`).order(nameCol).limit(200);
        setLookupOptions(
          (data ?? []).map((r: Record<string, unknown>) => ({
            value: String(r[pkCol] ?? ''),
            label: String(r[nameCol] ?? r[pkCol] ?? ''),
          }))
        );
        setLookupLoading(false);
      });
  }, [field?.field_definition_id, isLookup]);

  const selectCls = 'w-full appearance-none text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 pr-8';

  if (fieldType === 'boolean') {
    return (
      <ToggleButtons
        options={[
          { value: 'true',  label: 'Yes' },
          { value: 'false', label: 'No' },
        ]}
        value={value || 'true'}
        onChange={onChange}
        activeClass="bg-blue-600 text-white"
      />
    );
  }

  if (isStatecodeField && statecodeOptions.length > 0) {
    return (
      <div className="relative w-full">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
          <option value="">— Select status —</option>
          {statecodeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    );
  }

  if (isStatusreasonField && statusreasonOptions.length > 0) {
    return (
      <div className="relative w-full">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
          <option value="">— Select reason —</option>
          {statusreasonOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    );
  }

  if (isChoice && field) {
    const options = getChoiceOptions(field);
    if (options.length > 0) {
      return (
        <div className="relative w-full">
          <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
            <option value="">— select value —</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      );
    }
  }

  if (isLookup) {
    if (lookupLoading) {
      return (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
          <Loader2 size={12} className="animate-spin" /> Loading options...
        </div>
      );
    }
    if (lookupOptions.length > 0) {
      return (
        <div className="relative w-full">
          <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
            <option value="">— select record —</option>
            {lookupOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      );
    }
    // Fallback: show a select with current UUID value as a readable option
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUuid = UUID_RE.test(value);
    const selectCls2 = 'w-full appearance-none text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 pr-8';
    return (
      <div className="relative w-full">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls2}>
          <option value="">— Select —</option>
          {isUuid && value && <option value={value}>{value.slice(0, 8)}…</option>}
        </select>
        <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    );
  }

  if (fieldType === 'date') {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    );
  }

  if (fieldType === 'datetime') {
    return (
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    );
  }

  if (fieldType === 'number' || fieldType === 'integer' || fieldType === 'decimal') {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter number..."
        className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-300"
      />
    );
  }

  if (fieldType === 'currency') {
    return (
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-300"
      />
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Enter value..."
      className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-300"
    />
  );
}

// ─── Formula builder ──────────────────────────────────────────────────────────
function FormulaBuilder({
  tokens,
  fields,
  onChange,
}: {
  tokens: FormulaToken[];
  fields: FieldDefinition[];
  onChange: (tokens: FormulaToken[]) => void;
}) {
  const add = (type: FormulaToken['type']) => {
    const t: FormulaToken = { id: tid(), type };
    if (type === 'field') t.field = fields[0]?.logical_name ?? '';
    if (type === 'text') t.value = '';
    if (type === 'operator') t.operator = '+';
    if (type === 'date_offset') t.offset_days = 0;
    onChange([...tokens, t]);
  };

  const update = (id: string, patch: Partial<FormulaToken>) =>
    onChange(tokens.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const remove = (id: string) => onChange(tokens.filter((t) => t.id !== id));

  // Preview
  const preview = tokens.map((t) => {
    if (t.type === 'field') {
      const f = fields.find((x) => x.logical_name === t.field);
      return `[${f?.display_name ?? t.field}]`;
    }
    if (t.type === 'text') return `"${t.value}"`;
    if (t.type === 'operator') return t.operator;
    if (t.type === 'date_offset') return `+${t.offset_days}d`;
    return '';
  }).join(' ');

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        {(['field', 'text', 'operator', 'date_offset'] as const).map((type) => (
          <button
            key={type}
            onClick={() => add(type)}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold bg-white border border-slate-200 rounded-lg hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-colors"
          >
            <Plus size={10} />
            {type === 'field' ? 'Add Field' : type === 'text' ? 'Add Text' : type === 'operator' ? 'Add Operator' : 'Add Date Offset'}
          </button>
        ))}
      </div>

      {tokens.length > 0 && (
        <div className="space-y-1.5">
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                t.type === 'field' ? 'bg-blue-100 text-blue-700' :
                t.type === 'text' ? 'bg-slate-100 text-slate-600' :
                t.type === 'operator' ? 'bg-violet-100 text-violet-700' :
                'bg-amber-100 text-amber-700'
              }`}>
                {t.type === 'date_offset' ? 'date' : t.type}
              </span>
              {t.type === 'field' && (
                <div className="relative flex-1">
                  <select
                    value={t.field ?? ''}
                    onChange={(e) => update(t.id, { field: e.target.value })}
                    className="w-full appearance-none text-[11px] text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 pr-6"
                  >
                    {fields.filter((f) => f.is_active).map((f) => (
                      <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>
                    ))}
                  </select>
                  <ChevronDown size={9} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              )}
              {t.type === 'text' && (
                <input
                  type="text"
                  value={t.value ?? ''}
                  onChange={(e) => update(t.id, { value: e.target.value })}
                  placeholder="text..."
                  className="flex-1 text-[11px] text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300"
                />
              )}
              {t.type === 'operator' && (
                <div className="relative flex-1">
                  <select
                    value={t.operator ?? '+'}
                    onChange={(e) => update(t.id, { operator: e.target.value })}
                    className="w-full appearance-none text-[11px] text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 pr-6"
                  >
                    {['+','-','*','/','&'].map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                  <ChevronDown size={9} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              )}
              {t.type === 'date_offset' && (
                <input
                  type="number"
                  value={t.offset_days ?? 0}
                  onChange={(e) => update(t.id, { offset_days: parseInt(e.target.value) || 0 })}
                  placeholder="days"
                  className="w-20 text-[11px] text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              )}
              <button
                onClick={() => remove(t.id)}
                className="shrink-0 text-slate-300 hover:text-red-500 transition-colors"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Preview</p>
          <p className="text-xs text-slate-700 font-mono break-all">{preview}</p>
        </div>
      )}
    </div>
  );
}

// ─── Reusable UI primitives ───────────────────────────────────────────────────
function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

function ToggleButtons({
  options,
  value,
  onChange,
  activeClass,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  activeClass: string;
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-slate-200 w-full">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-1.5 text-[11px] font-semibold transition-colors ${
            value === opt.value ? activeClass : 'bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ active, activeClass }: { active: boolean; activeClass: string }) {
  return (
    <div className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${active ? activeClass : 'bg-slate-300'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${active ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </div>
  );
}
