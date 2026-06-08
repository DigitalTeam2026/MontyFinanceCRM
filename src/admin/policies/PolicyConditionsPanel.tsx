import { Plus, Trash2, ChevronUp, ChevronDown, AlertCircle } from 'lucide-react';
import type { PolicyConditionDraft, PolicyConditionOperator } from '../../types/dataPolicy';
import { POLICY_CONDITION_OPERATOR_META } from '../../types/dataPolicy';

interface PolicyConditionsPanelProps {
  conditions: PolicyConditionDraft[];
  onChange: (conditions: PolicyConditionDraft[]) => void;
  disabled?: boolean;
}

function makeCondition(order: number): PolicyConditionDraft {
  return {
    _tempId: `cond-${Date.now()}-${Math.random()}`,
    field_name: '',
    operator: 'is_not_null',
    value_text: null,
    display_order: order,
  };
}

export default function PolicyConditionsPanel({ conditions, onChange, disabled }: PolicyConditionsPanelProps) {
  const add = () => onChange([...conditions, makeCondition(conditions.length)]);
  const remove = (id: string) => onChange(conditions.filter((c) => c._tempId !== id).map((c, i) => ({ ...c, display_order: i })));
  const update = (id: string, patch: Partial<PolicyConditionDraft>) =>
    onChange(conditions.map((c) => c._tempId === id ? { ...c, ...patch } : c));
  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...conditions];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next.map((c, i) => ({ ...c, display_order: i })));
  };
  const moveDown = (idx: number) => {
    if (idx === conditions.length - 1) return;
    const next = [...conditions];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onChange(next.map((c, i) => ({ ...c, display_order: i })));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">When Conditions Are Met</span>
          <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5">{conditions.length}</span>
          {conditions.length > 1 && (
            <span className="text-[10px] text-amber-600 flex items-center gap-1">
              <AlertCircle size={10} />All conditions apply (AND)
            </span>
          )}
        </div>
        {!disabled && (
          <button onClick={add} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
            <Plus size={11} />Add condition
          </button>
        )}
      </div>

      {conditions.length === 0 ? (
        <div className="text-center py-6 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
          No conditions — policy will always fire on the configured trigger events.
          {!disabled && (
            <button onClick={add} className="block mx-auto mt-1 text-blue-600 hover:underline">Add condition</button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {conditions.map((cond, idx) => {
            const opMeta = POLICY_CONDITION_OPERATOR_META[cond.operator];
            return (
              <div key={cond._tempId} className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                {idx > 0 && (
                  <span className="text-[10px] font-bold text-gray-400 mt-2.5 flex-shrink-0 w-8 text-center">AND</span>
                )}
                {idx === 0 && <span className="w-8 flex-shrink-0" />}

                <div className="flex-1 grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Field</label>
                    <input
                      value={cond.field_name}
                      onChange={(e) => update(cond._tempId, { field_name: e.target.value })}
                      disabled={disabled}
                      placeholder="e.g. emailaddress1"
                      className="w-full px-2 py-1.5 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Operator</label>
                    <select
                      value={cond.operator}
                      onChange={(e) => {
                        const op = e.target.value as PolicyConditionOperator;
                        update(cond._tempId, {
                          operator: op,
                          value_text: POLICY_CONDITION_OPERATOR_META[op].needsValue ? cond.value_text : null,
                        });
                      }}
                      disabled={disabled}
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                    >
                      {(Object.entries(POLICY_CONDITION_OPERATOR_META) as [PolicyConditionOperator, typeof POLICY_CONDITION_OPERATOR_META[PolicyConditionOperator]][]).map(([k, m]) => (
                        <option key={k} value={k}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1">Value</label>
                    {opMeta.needsValue ? (
                      <input
                        value={cond.value_text ?? ''}
                        onChange={(e) => update(cond._tempId, { value_text: e.target.value || null })}
                        disabled={disabled}
                        placeholder={cond.operator.includes('regex') ? '^pattern$' : 'expected value'}
                        className={`w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 ${
                          cond.operator.includes('regex') ? 'font-mono' : ''
                        }`}
                      />
                    ) : (
                      <div className="px-2 py-1.5 text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg">n/a</div>
                    )}
                  </div>
                </div>

                {!disabled && (
                  <div className="flex flex-col gap-0.5 flex-shrink-0 mt-4">
                    <button onClick={() => moveUp(idx)} disabled={idx === 0} className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20"><ChevronUp size={12} /></button>
                    <button onClick={() => moveDown(idx)} disabled={idx === conditions.length - 1} className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20"><ChevronDown size={12} /></button>
                    <button onClick={() => remove(cond._tempId)} className="p-0.5 text-gray-300 hover:text-red-500 mt-0.5"><Trash2 size={11} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
