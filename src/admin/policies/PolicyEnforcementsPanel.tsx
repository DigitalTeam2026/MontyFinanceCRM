import { Plus, Trash2, ChevronUp, ChevronDown, ShieldAlert, MessageSquare, Lock, Star, Bell, Hash } from 'lucide-react';
import type { PolicyEnforcementDraft, EnforcementType } from '../../types/dataPolicy';
import { ENFORCEMENT_TYPE_META } from '../../types/dataPolicy';

interface PolicyEnforcementsPanelProps {
  enforcements: PolicyEnforcementDraft[];
  onChange: (enforcements: PolicyEnforcementDraft[]) => void;
  disabled?: boolean;
}

const ENFORCEMENT_ICONS: Record<EnforcementType, React.ReactNode> = {
  block_save:    <ShieldAlert size={12} />,
  show_message:  <MessageSquare size={12} />,
  require_field: <Star size={12} />,
  lock_field:    <Lock size={12} />,
  set_value:     <Hash size={12} />,
  notify_user:   <Bell size={12} />,
};

function makeEnforcement(order: number): PolicyEnforcementDraft {
  return {
    _tempId: `enf-${Date.now()}-${Math.random()}`,
    enforcement_type: 'show_message',
    target_field: null,
    message_text: null,
    value_text: null,
    display_order: order,
  };
}

export default function PolicyEnforcementsPanel({ enforcements, onChange, disabled }: PolicyEnforcementsPanelProps) {
  const add = () => onChange([...enforcements, makeEnforcement(enforcements.length)]);
  const remove = (id: string) => onChange(enforcements.filter((e) => e._tempId !== id).map((e, i) => ({ ...e, display_order: i })));
  const update = (id: string, patch: Partial<PolicyEnforcementDraft>) =>
    onChange(enforcements.map((e) => e._tempId === id ? { ...e, ...patch } : e));
  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...enforcements];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next.map((e, i) => ({ ...e, display_order: i })));
  };
  const moveDown = (idx: number) => {
    if (idx === enforcements.length - 1) return;
    const next = [...enforcements];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onChange(next.map((e, i) => ({ ...e, display_order: i })));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">Enforcement Actions</span>
          <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5">{enforcements.length}</span>
          {enforcements.length > 1 && (
            <span className="text-[10px] text-blue-600">All actions fire together</span>
          )}
        </div>
        {!disabled && (
          <button onClick={add} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
            <Plus size={11} />Add action
          </button>
        )}
      </div>

      {enforcements.length === 0 ? (
        <div className="text-center py-6 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
          No enforcement actions — add at least one action for this policy to have an effect.
          {!disabled && (
            <button onClick={add} className="block mx-auto mt-1 text-blue-600 hover:underline">Add action</button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {enforcements.map((enf, idx) => {
            const meta = ENFORCEMENT_TYPE_META[enf.enforcement_type];
            return (
              <div key={enf._tempId} className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                <div className="flex items-center gap-0.5 flex-col flex-shrink-0 mt-1">
                  <button onClick={() => moveUp(idx)} disabled={idx === 0 || disabled} className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20">
                    <ChevronUp size={12} />
                  </button>
                  <span className="text-[10px] font-bold text-gray-400">{idx + 1}</span>
                  <button onClick={() => moveDown(idx)} disabled={idx === enforcements.length - 1 || disabled} className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20">
                    <ChevronDown size={12} />
                  </button>
                </div>

                <div className="flex-1 space-y-2">
                  {/* Type selector */}
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">Enforcement Type</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(Object.entries(ENFORCEMENT_TYPE_META) as [EnforcementType, typeof ENFORCEMENT_TYPE_META[EnforcementType]][]).map(([type, m]) => (
                        <button
                          key={type}
                          onClick={() => !disabled && update(enf._tempId, { enforcement_type: type, target_field: null, message_text: null, value_text: null })}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-semibold text-left transition-all ${
                            enf.enforcement_type === type
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          } ${disabled ? 'pointer-events-none' : 'cursor-pointer'}`}
                        >
                          {ENFORCEMENT_ICONS[type]}
                          <span className="leading-tight">{m.label}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{meta.description}</p>
                  </div>

                  {/* Field input */}
                  {meta.needsField && (
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">Target Field</label>
                      <input
                        value={enf.target_field ?? ''}
                        onChange={(e) => update(enf._tempId, { target_field: e.target.value || null })}
                        disabled={disabled}
                        placeholder="e.g. transactioncurrencyid"
                        className="w-full px-2 py-1.5 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                      />
                    </div>
                  )}

                  {/* Message input */}
                  {meta.needsMessage && (
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">User Message</label>
                      <textarea
                        value={enf.message_text ?? ''}
                        onChange={(e) => update(enf._tempId, { message_text: e.target.value || null })}
                        disabled={disabled}
                        rows={2}
                        placeholder="Message shown to the user when this policy fires..."
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                      />
                    </div>
                  )}

                  {/* Value input (for set_value) */}
                  {meta.needsValue && (
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1">Set Value To</label>
                      <input
                        value={enf.value_text ?? ''}
                        onChange={(e) => update(enf._tempId, { value_text: e.target.value || null })}
                        disabled={disabled}
                        placeholder="value to assign to the field"
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                      />
                    </div>
                  )}
                </div>

                {!disabled && (
                  <button onClick={() => remove(enf._tempId)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 mt-1">
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
