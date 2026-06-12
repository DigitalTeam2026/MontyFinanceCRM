import FilterSelect from '../../app/components/FilterSelect';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import type { ApprovalConditionDraft, ConditionType, ConditionOperator } from '../../types/approvalProcess';
import { CONDITION_TYPE_META } from '../../types/approvalProcess';

interface ApprovalConditionsPanelProps {
  conditions: ApprovalConditionDraft[];
  onChange: (conditions: ApprovalConditionDraft[]) => void;
  disabled?: boolean;
}

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'eq',       label: '= equals' },
  { value: 'neq',      label: '≠ not equals' },
  { value: 'gte',      label: '≥ at or above' },
  { value: 'lte',      label: '≤ at or below' },
  { value: 'contains', label: 'contains' },
  { value: 'in',       label: 'in list' },
];

function makeCondition(): ApprovalConditionDraft {
  return {
    _tempId: `cond-${Date.now()}-${Math.random()}`,
    condition_type: 'always',
    field_name: null,
    operator: 'eq',
    value_text: null,
    value_number: null,
    ref_id: null,
    display_order: 0,
  };
}

export default function ApprovalConditionsPanel({ conditions, onChange, disabled }: ApprovalConditionsPanelProps) {
  const add = () => onChange([...conditions, makeCondition()]);
  const remove = (id: string) => onChange(conditions.filter((c) => c._tempId !== id));
  const update = (id: string, patch: Partial<ApprovalConditionDraft>) =>
    onChange(conditions.map((c) => c._tempId === id ? { ...c, ...patch } : c));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">Trigger Conditions</span>
          <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5">{conditions.length}</span>
          {conditions.length > 1 && (
            <span className="text-[10px] text-amber-600 flex items-center gap-1">
              <AlertCircle size={10} />All conditions must match (AND logic)
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
        <div className="text-center py-5 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
          No conditions — process will never trigger automatically.
          {!disabled && <button onClick={add} className="block mx-auto mt-1 text-blue-600 hover:underline">Add condition</button>}
        </div>
      ) : (
        <div className="space-y-2">
          {conditions.map((cond, idx) => {
            const meta = CONDITION_TYPE_META[cond.condition_type];
            return (
              <div key={cond._tempId} className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                {idx > 0 && (
                  <span className="text-[10px] font-bold text-gray-400 mt-2 flex-shrink-0 w-8 text-center">AND</span>
                )}
                {idx === 0 && <span className="w-8 flex-shrink-0" />}

                <div className="flex-1 grid grid-cols-1 gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">Condition Type</label>
                      <FilterSelect
                        value={cond.condition_type}
                        onChange={(e) => {
                          const type = e.target.value as ConditionType;
                          update(cond._tempId, {
                            condition_type: type,
                            field_name: null,
                            value_text: null,
                            value_number: null,
                            ref_id: null,
                          });
                        }}
                        disabled={disabled}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                      >
                        {Object.entries(CONDITION_TYPE_META).map(([key, m]) => (
                          <option key={key} value={key}>{m.label}</option>
                        ))}
                      </FilterSelect>
                    </div>

                    {meta.hasField && (
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1">Operator</label>
                        <FilterSelect
                          value={cond.operator}
                          onChange={(e) => update(cond._tempId, { operator: e.target.value as ConditionOperator })}
                          disabled={disabled}
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                        >
                          {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </FilterSelect>
                      </div>
                    )}
                  </div>

                  {meta.hasField && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1">Field Name</label>
                        <input
                          value={cond.field_name ?? ''}
                          onChange={(e) => update(cond._tempId, { field_name: e.target.value || null })}
                          disabled={disabled}
                          placeholder="e.g. industrycode"
                          className="w-full px-2 py-1.5 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 mb-1">Value</label>
                        <input
                          value={cond.value_text ?? ''}
                          onChange={(e) => update(cond._tempId, { value_text: e.target.value || null })}
                          disabled={disabled}
                          placeholder="expected value"
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                        />
                      </div>
                    </div>
                  )}

                  {meta.hasAmount && (
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">
                        {cond.condition_type === 'amount_gte' ? 'Minimum Amount (≥)' : 'Maximum Amount (≤)'}
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">£</span>
                        <input
                          type="number"
                          value={cond.value_number ?? ''}
                          onChange={(e) => update(cond._tempId, { value_number: e.target.value ? Number(e.target.value) : null })}
                          disabled={disabled}
                          placeholder="0"
                          className="w-full pl-6 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                        />
                      </div>
                    </div>
                  )}

                  {meta.hasRef && (
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">Reference ID (UUID)</label>
                      <input
                        value={cond.ref_id ?? ''}
                        onChange={(e) => update(cond._tempId, { ref_id: e.target.value || null })}
                        disabled={disabled}
                        placeholder="Paste UUID of the product / LOB / BU / stage"
                        className="w-full px-2 py-1.5 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                      />
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Tip: copy the ID from the {CONDITION_TYPE_META[cond.condition_type].label} record
                      </p>
                    </div>
                  )}

                  {cond.condition_type === 'always' && (
                    <p className="text-xs text-gray-400 italic">This process will apply to all {'{entity}'} records — no additional filtering.</p>
                  )}
                </div>

                {!disabled && (
                  <button onClick={() => remove(cond._tempId)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 mt-1">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
