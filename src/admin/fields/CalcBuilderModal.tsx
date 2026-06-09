import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Calculator, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { CalcToken, CalcFormula } from '../../types/field';

export type { CalcToken, CalcFormula };

const NUMERIC_TYPE_NAMES = new Set(['number', 'integer', 'decimal', 'currency', 'calculated']);

export const OP_SYMBOLS: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

export function buildFormulaPreview(formula: CalcFormula): string {
  return formula.tokens.map(t => {
    if (t.type === 'field') return t.displayName;
    if (t.type === 'operator') return ` ${OP_SYMBOLS[t.op]} `;
    return String(t.value);
  }).join('');
}

function isValidFormula(tokens: CalcToken[]): boolean {
  if (tokens.length === 0) return false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (i % 2 === 0) { if (t.type === 'operator') return false; }
    else { if (t.type !== 'operator') return false; }
  }
  return tokens[tokens.length - 1].type !== 'operator';
}

interface SourceField { logical_name: string; display_name: string; }

interface CalcBuilderModalProps {
  entityId: string;
  currentFieldLogicalName?: string;
  formula: CalcFormula | null;
  fieldDisplayName: string;
  onSave: (formula: CalcFormula) => void;
  onClose: () => void;
}

export default function CalcBuilderModal({
  entityId, currentFieldLogicalName, formula, fieldDisplayName, onSave, onClose,
}: CalcBuilderModalProps) {
  const [fields, setFields] = useState<SourceField[]>([]);
  const [tokens, setTokens] = useState<CalcToken[]>(formula?.tokens ?? []);
  const [numInput, setNumInput] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('field_definition')
      .select('logical_name, display_name, field_type:field_type_id(name)')
      .eq('entity_definition_id', entityId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .then(({ data }) => {
        const numeric = (data ?? []).filter(fd => {
          const tn = (fd.field_type as { name: string } | null)?.name ?? '';
          return NUMERIC_TYPE_NAMES.has(tn) && fd.logical_name !== currentFieldLogicalName;
        }).map(fd => ({ logical_name: fd.logical_name, display_name: fd.display_name }));
        setFields(numeric);
        setLoading(false);
      });
  }, [entityId, currentFieldLogicalName]);

  const lastToken = tokens[tokens.length - 1];
  const lastIsOperand = !!lastToken && lastToken.type !== 'operator';
  const canAddOperand = !lastIsOperand;
  const canAddOperator = lastIsOperand;

  const addField = (f: SourceField) => {
    if (!canAddOperand) return;
    setTokens(prev => [...prev, { type: 'field', fieldName: f.logical_name, displayName: f.display_name }]);
  };

  const addOperator = (op: '+' | '-' | '*' | '/') => {
    if (!canAddOperator) return;
    setTokens(prev => [...prev, { type: 'operator', op }]);
  };

  const addNumber = () => {
    if (!canAddOperand) return;
    const n = parseFloat(numInput);
    if (isNaN(n)) return;
    setTokens(prev => [...prev, { type: 'number', value: n }]);
    setNumInput('');
  };

  const removeToken = (idx: number) => setTokens(prev => prev.filter((_, i) => i !== idx));
  const clearAll = () => setTokens([]);

  const valid = isValidFormula(tokens);
  const preview = buildFormulaPreview({ tokens });

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col overflow-hidden border border-[#e7eaf1]" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div style={{ height: 3, background: 'linear-gradient(135deg,#3b6fff,#22d3ee)' }} />
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e7eaf1]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#3b6fff,#22d3ee)' }}>
              <Calculator size={15} className="text-white" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-[#111827]">Calculation Builder</p>
              <p className="text-[11px] text-[#6b7280]">{fieldDisplayName || 'Calculated Field'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#9ca3af] hover:text-[#374151] hover:bg-[#f3f4f6] rounded-lg transition">
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Left: available fields */}
          <div className="w-52 shrink-0 border-r border-[#e7eaf1] flex flex-col bg-[#f7f9fc]">
            <p className="px-3 pt-3 pb-1.5 text-[9px] font-semibold text-[#3b6fff] uppercase tracking-widest">
              Numeric Fields
            </p>
            <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
              {loading ? (
                <p className="text-[11px] text-[#9ca3af] px-2 py-2">Loading…</p>
              ) : fields.length === 0 ? (
                <p className="text-[11px] text-[#9ca3af] px-2 py-2 italic">No numeric fields found</p>
              ) : fields.map(f => (
                <button
                  key={f.logical_name}
                  type="button"
                  onClick={() => addField(f)}
                  disabled={!canAddOperand}
                  title={!canAddOperand ? 'Add an operator first' : `Add ${f.display_name}`}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition flex items-center gap-2 ${
                    canAddOperand
                      ? 'hover:bg-white hover:shadow-sm text-[#374151] cursor-pointer'
                      : 'text-[#9ca3af] cursor-not-allowed opacity-60'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3b6fff] opacity-50 shrink-0" />
                  <span className="truncate font-medium">{f.display_name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right: builder */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-5">

              {/* Formula tokens */}
              <div>
                <p className="text-[9px] font-semibold text-[#6b7280] uppercase tracking-widest mb-2">Formula</p>
                <div className="min-h-[60px] p-3 rounded-xl border border-[#e7eaf1] bg-[#f7f9fc] flex flex-wrap gap-1.5 items-center">
                  {tokens.length === 0 ? (
                    <span className="text-[12px] text-[#9ca3af] italic">Click fields and operators to build your formula…</span>
                  ) : tokens.map((token, idx) => (
                    <span
                      key={idx}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-semibold group ${
                        token.type === 'operator'
                          ? 'bg-[#f0f4ff] text-[#3b6fff] border border-[#c7d9ff]'
                          : token.type === 'number'
                          ? 'bg-[#fefce8] text-[#854d0e] border border-[#fde68a]'
                          : 'bg-white text-[#111827] border border-[#e7eaf1] shadow-sm'
                      }`}
                    >
                      {token.type === 'operator' ? OP_SYMBOLS[token.op]
                        : token.type === 'number' ? token.value
                        : token.displayName}
                      <button
                        type="button"
                        onClick={() => removeToken(idx)}
                        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition text-current leading-none ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Operators */}
              <div>
                <p className="text-[9px] font-semibold text-[#6b7280] uppercase tracking-widest mb-2">Operators</p>
                <div className="flex gap-2">
                  {(['+', '-', '*', '/'] as const).map(op => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => addOperator(op)}
                      disabled={!canAddOperator}
                      className={`w-11 h-11 rounded-xl border text-[17px] font-bold transition flex items-center justify-center ${
                        canAddOperator
                          ? 'border-[#3b6fff] text-[#3b6fff] bg-[#f0f4ff] hover:bg-[#3b6fff] hover:text-white'
                          : 'border-[#e7eaf1] text-[#9ca3af] cursor-not-allowed opacity-50'
                      }`}
                    >
                      {OP_SYMBOLS[op]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fixed number */}
              <div>
                <p className="text-[9px] font-semibold text-[#6b7280] uppercase tracking-widest mb-2">Fixed Number</p>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={numInput}
                    onChange={e => setNumInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addNumber(); }}
                    placeholder="e.g. 100"
                    disabled={!canAddOperand}
                    className={`w-32 px-2.5 py-1.5 text-[12px] border rounded-lg focus:outline-none focus:border-[#3b6fff] focus:ring-1 focus:ring-[#3b6fff] transition ${
                      !canAddOperand ? 'border-[#e7eaf1] bg-[#f7f9fc] text-[#9ca3af] cursor-not-allowed' : 'border-[#e7eaf1] bg-white text-[#111827]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={addNumber}
                    disabled={!canAddOperand || !numInput}
                    className={`p-1.5 rounded-lg border transition ${
                      canAddOperand && numInput
                        ? 'border-[#3b6fff] text-[#3b6fff] bg-[#f0f4ff] hover:bg-[#3b6fff] hover:text-white'
                        : 'border-[#e7eaf1] text-[#9ca3af] cursor-not-allowed opacity-50'
                    }`}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>

              {tokens.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="flex items-center gap-1.5 text-[11px] text-[#ef4444] hover:text-[#dc2626] transition"
                >
                  <Trash2 size={11} />
                  Clear formula
                </button>
              )}
            </div>

            {/* Preview bar */}
            <div className="px-4 py-3 border-t border-[#e7eaf1] bg-[#f7f9fc] shrink-0">
              <p className="text-[9px] font-semibold text-[#6b7280] uppercase tracking-widest mb-1">Preview</p>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-[#111827] truncate flex-1">
                  {fieldDisplayName || 'Result'} = {preview || '…'}
                </span>
                {valid && <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />}
                {!valid && tokens.length > 0 && (
                  <span className="text-[10px] text-red-500 font-medium shrink-0">Incomplete</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#e7eaf1]">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[12px] text-[#6b7280] border border-[#e7eaf1] rounded-lg hover:bg-[#f7f9fc] transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => valid && onSave({ tokens })}
            disabled={!valid}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: valid ? 'linear-gradient(135deg,#3b6fff,#22d3ee)' : '#9ca3af' }}
          >
            <Calculator size={13} />
            Save Formula
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
