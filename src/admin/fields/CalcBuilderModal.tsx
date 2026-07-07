import { uuid } from '../../lib/uuid';
import FilterSelect from '../../app/components/FilterSelect';
import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Calculator, CheckCircle2, AlertCircle, CornerDownRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  CalculationConfig, CalcResultType, CalcBranch, CalcConditionRow, CalcOperand,
  CalcArithOp, CalcOperator, CalcFormula,
} from '../../types/field';
import {
  operatorsForType, operatorNeedsValue, OPERATOR_LABELS, ARITH_LABELS,
  isNumericType, validateCalculation, summarizeCalculation, referencedFields,
} from '../../app/services/calcEngine';

export { summarizeCalculation } from '../../app/services/calcEngine';

// Field types selectable in the builder (lookups/files excluded — they expose GUIDs/blobs).
const SELECTABLE_TYPES = new Set([
  'text', 'long_text', 'textarea', 'email', 'phone', 'url',
  'number', 'integer', 'whole_number', 'decimal', 'currency',
  'date', 'datetime', 'boolean', 'choice', 'option_set',
]);

const RESULT_TYPES: { value: CalcResultType; label: string }[] = [
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'text', label: 'Text' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'choice', label: 'Choice' },
];

interface SourceField {
  logical_name: string;
  physical_column_name: string;
  display_name: string;
  field_type: string;
  choices: { value: string; label: string }[];
}

interface CalcBuilderModalProps {
  entityId: string;
  currentFieldLogicalName?: string;
  calculation: CalculationConfig | null;
  /** Legacy numeric formula, migrated into the new model on open. */
  legacyFormula?: CalcFormula | null;
  fieldDisplayName: string;
  onSave: (config: CalculationConfig) => void;
  onClose: () => void;
}

const uid = () => uuid();

function defaultConfig(): CalculationConfig {
  return {
    version: 2,
    resultType: 'number',
    branches: [
      { id: uid(), isDefault: true, condition: { logic: 'and', rows: [] }, result: { operands: [{ kind: 'value', value: '' }], operators: [] } },
    ],
  };
}

function migrateLegacy(formula: CalcFormula): CalculationConfig {
  const operands: CalcOperand[] = [];
  const operators: CalcArithOp[] = [];
  for (const t of formula.tokens) {
    if (t.type === 'operator') operators.push(t.op);
    else if (t.type === 'number') operands.push({ kind: 'value', value: String(t.value) });
    else operands.push({ kind: 'field', field: t.fieldName, column: t.fieldName, fieldType: 'number', displayName: t.displayName });
  }
  return {
    version: 2,
    resultType: 'number',
    branches: [{ id: uid(), isDefault: true, condition: { logic: 'and', rows: [] }, result: { operands: operands.length ? operands : [{ kind: 'value', value: '' }], operators } }],
  };
}

export default function CalcBuilderModal({
  entityId, currentFieldLogicalName, calculation, legacyFormula, fieldDisplayName, onSave, onClose,
}: CalcBuilderModalProps) {
  const [fields, setFields] = useState<SourceField[]>([]);
  const [otherCalcDeps, setOtherCalcDeps] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<CalculationConfig>(
    calculation ?? (legacyFormula ? migrateLegacy(legacyFormula) : defaultConfig())
  );

  useEffect(() => {
    supabase
      .from('field_definition')
      .select('logical_name, physical_column_name, display_name, config_json, field_type:field_type_id(name)')
      .eq('entity_definition_id', entityId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as Array<{
          logical_name: string; physical_column_name: string; display_name: string;
          config_json: Record<string, unknown> | null; field_type: { name: string } | null;
        }>;
        const src: SourceField[] = [];
        const deps: Record<string, string[]> = {};
        for (const fd of rows) {
          const tn = fd.field_type?.name ?? '';
          if (fd.logical_name === currentFieldLogicalName) {
            // skip self as a selectable field, but record its (none-yet) deps
            continue;
          }
          if (tn === 'calculated') {
            const calc = (fd.config_json as { calculation?: CalculationConfig } | null)?.calculation;
            if (calc) deps[fd.logical_name] = referencedFields(calc);
            // calculated fields are still selectable (numeric) as operands
          }
          if (SELECTABLE_TYPES.has(tn) || tn === 'calculated') {
            const choices = (fd.config_json as { choices?: { value: string; label: string }[] } | null)?.choices ?? [];
            src.push({
              logical_name: fd.logical_name,
              physical_column_name: fd.physical_column_name,
              display_name: fd.display_name,
              field_type: tn,
              choices,
            });
          }
        }
        src.sort((a, b) => a.display_name.localeCompare(b.display_name));
        setFields(src);
        setOtherCalcDeps(deps);
        setLoading(false);
      });
  }, [entityId, currentFieldLogicalName]);

  const numericResult = config.resultType === 'number' || config.resultType === 'currency';
  const conditionFields = fields;
  const operandFields = numericResult
    ? fields.filter((f) => isNumericType(f.field_type))
    : fields;

  const validation = useMemo(
    () => validateCalculation(config, { selfLogical: currentFieldLogicalName, otherCalcDeps }),
    [config, currentFieldLogicalName, otherCalcDeps]
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  function patchBranch(id: string, patch: Partial<CalcBranch>) {
    setConfig((c) => ({ ...c, branches: c.branches.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  }
  function setResultType(rt: CalcResultType) {
    setConfig((c) => {
      const nowNumeric = rt === 'number' || rt === 'currency';
      const branches = c.branches.map((b) =>
        nowNumeric ? b : { ...b, result: { operands: b.result.operands.slice(0, 1), operators: [] } }
      );
      return { ...c, resultType: rt, branches };
    });
  }
  function addIfBranch() {
    setConfig((c) => {
      const idx = c.branches.findIndex((b) => b.isDefault);
      const newBranch: CalcBranch = {
        id: uid(), isDefault: false,
        condition: { logic: 'and', rows: [newConditionRow(fields[0])] },
        result: { operands: [{ kind: 'value', value: '' }], operators: [] },
      };
      const branches = [...c.branches];
      branches.splice(idx < 0 ? branches.length : idx, 0, newBranch);
      return { ...c, branches };
    });
  }
  function removeBranch(id: string) {
    setConfig((c) => ({ ...c, branches: c.branches.filter((b) => b.id !== id) }));
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 flex flex-col overflow-hidden border border-[#e7eaf1]" style={{ maxHeight: '92vh' }}>
        <div style={{ height: 3, background: 'linear-gradient(135deg,#3b6fff,#22d3ee)' }} />
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e7eaf1]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#3b6fff,#22d3ee)' }}>
              <Calculator size={15} className="text-white" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-[#111827]">Calculation Designer</p>
              <p className="text-[11px] text-[#6b7280]">{fieldDisplayName || 'Calculated Field'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#9ca3af] hover:text-[#374151] hover:bg-[#f3f4f6] rounded-lg transition">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#fafbfd]">
          {loading ? (
            <p className="text-[12px] text-[#9ca3af] py-8 text-center">Loading fields…</p>
          ) : (
            <>
              {/* Result type */}
              <div className="bg-white rounded-xl border border-[#e7eaf1] p-3.5">
                <p className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-widest mb-2">Result Data Type</p>
                <div className="flex flex-wrap gap-1.5">
                  {RESULT_TYPES.map((rt) => (
                    <button
                      key={rt.value}
                      type="button"
                      onClick={() => setResultType(rt.value)}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition ${
                        config.resultType === rt.value
                          ? 'border-[#3b6fff] bg-[#f0f4ff] text-[#3b6fff]'
                          : 'border-[#e7eaf1] text-[#6b7280] hover:bg-[#f7f9fc]'
                      }`}
                    >
                      {rt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Branches */}
              {config.branches.map((branch) => (
                <BranchCard
                  key={branch.id}
                  branch={branch}
                  isFirstIf={config.branches.filter((b) => !b.isDefault).indexOf(branch) === 0}
                  numericResult={numericResult}
                  conditionFields={conditionFields}
                  operandFields={operandFields}
                  resultType={config.resultType}
                  canRemove={config.branches.length > 1}
                  onChange={(patch) => patchBranch(branch.id, patch)}
                  onRemove={() => removeBranch(branch.id)}
                />
              ))}

              <button
                type="button"
                onClick={addIfBranch}
                className="flex items-center gap-1.5 text-[12px] font-medium text-[#3b6fff] border border-dashed border-[#c7d9ff] rounded-lg px-3 py-2 hover:bg-[#f0f4ff] transition"
              >
                <Plus size={13} /> Add condition branch (IF…)
              </button>

              {/* Validation */}
              {!validation.valid && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                  {validation.errors.map((e, i) => (
                    <p key={i} className="text-[11px] text-red-600 flex items-center gap-1.5">
                      <AlertCircle size={11} className="shrink-0" /> {e}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Preview + footer */}
        <div className="border-t border-[#e7eaf1] bg-white">
          <div className="px-5 py-2.5 border-b border-[#f0f2f6]">
            <p className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-widest mb-1">Summary</p>
            <p className="text-[11px] text-[#374151] leading-relaxed">
              {summarizeCalculation(config) || '…'}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 px-5 py-3">
            <span className="text-[11px] text-[#9ca3af]">Calculated columns are read-only and update automatically.</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-[12px] text-[#6b7280] border border-[#e7eaf1] rounded-lg hover:bg-[#f7f9fc] transition">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => validation.valid && onSave(config)}
                disabled={!validation.valid}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: validation.valid ? 'linear-gradient(135deg,#3b6fff,#22d3ee)' : '#9ca3af' }}
              >
                {validation.valid && <CheckCircle2 size={13} />} Save Calculation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function newConditionRow(f?: SourceField): CalcConditionRow {
  return {
    id: uid(),
    field: f?.logical_name ?? '',
    column: f?.physical_column_name ?? '',
    fieldType: f?.field_type ?? 'text',
    displayName: f?.display_name ?? '',
    operator: f ? operatorsForType(f.field_type)[0] : 'eq',
    value: '',
  };
}

// ── Branch card ────────────────────────────────────────────────────────────
function BranchCard({
  branch, isFirstIf, numericResult, conditionFields, operandFields, resultType, canRemove, onChange, onRemove,
}: {
  branch: CalcBranch; isFirstIf: boolean; numericResult: boolean;
  conditionFields: SourceField[]; operandFields: SourceField[]; resultType: CalcResultType;
  canRemove: boolean; onChange: (patch: Partial<CalcBranch>) => void; onRemove: () => void;
}) {
  const header = branch.isDefault ? 'ELSE — default result' : isFirstIf ? 'IF' : 'ELSE IF';

  function setCondition(rows: CalcConditionRow[]) {
    onChange({ condition: { ...branch.condition, rows } });
  }
  function addConditionRow() {
    setCondition([...branch.condition.rows, newConditionRow(conditionFields[0])]);
  }

  return (
    <div className="bg-white rounded-xl border border-[#e7eaf1] overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#f7f9fc] border-b border-[#eef1f6]">
        <span className="text-[11px] font-bold text-[#3b6fff] uppercase tracking-wide">{header}</span>
        {canRemove && (
          <button onClick={onRemove} className="p-1 rounded hover:bg-red-100 text-[#9ca3af] hover:text-red-500 transition" title="Remove branch">
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <div className="p-3.5 space-y-3">
        {/* Conditions */}
        {!branch.isDefault && (
          <div className="space-y-2">
            {branch.condition.rows.length > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#9ca3af] uppercase tracking-wide">Match</span>
                <FilterSelect
                  value={branch.condition.logic}
                  onChange={(e) => onChange({ condition: { ...branch.condition, logic: e.target.value as 'and' | 'or' } })}
                  className="text-[11px] border border-[#e7eaf1] rounded px-1.5 py-1 bg-white"
                >
                  <option value="and">ALL conditions (AND)</option>
                  <option value="or">ANY condition (OR)</option>
                </FilterSelect>
              </div>
            )}
            {branch.condition.rows.map((row, ri) => (
              <ConditionRowEditor
                key={row.id}
                row={row}
                fields={conditionFields}
                showJoin={ri > 0}
                join={branch.condition.logic}
                onChange={(patch) => setCondition(branch.condition.rows.map((r) => (r.id === row.id ? { ...r, ...patch } : r)))}
                onRemove={() => setCondition(branch.condition.rows.filter((r) => r.id !== row.id))}
              />
            ))}
            <button type="button" onClick={addConditionRow} className="flex items-center gap-1.5 text-[11px] text-[#3b6fff] hover:text-[#1d4ed8] font-medium transition">
              <Plus size={11} /> Add condition
            </button>
          </div>
        )}

        {/* Result */}
        <div className={branch.isDefault ? '' : 'pt-1'}>
          <p className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <CornerDownRight size={11} /> {branch.isDefault ? 'Set result to' : 'Then set result to'}
          </p>
          <ResultExpression
            expr={branch.result}
            numericResult={numericResult}
            resultType={resultType}
            fields={operandFields}
            onChange={(result) => onChange({ result })}
          />
        </div>
      </div>
    </div>
  );
}

// ── Condition row ────────────────────────────────────────────────────────────
function ConditionRowEditor({
  row, fields, showJoin, join, onChange, onRemove,
}: {
  row: CalcConditionRow; fields: SourceField[]; showJoin: boolean; join: 'and' | 'or';
  onChange: (patch: Partial<CalcConditionRow>) => void; onRemove: () => void;
}) {
  const selected = fields.find((f) => f.logical_name === row.field);
  const ops = operatorsForType(row.fieldType);

  function pickField(logical: string) {
    const f = fields.find((x) => x.logical_name === logical);
    if (!f) return;
    const nextOps = operatorsForType(f.field_type);
    onChange({
      field: f.logical_name, column: f.physical_column_name, fieldType: f.field_type,
      displayName: f.display_name,
      operator: nextOps.includes(row.operator) ? row.operator : nextOps[0],
      value: '',
    });
  }

  return (
    <div className="flex items-start gap-1.5">
      {showJoin && <span className="text-[10px] font-semibold text-[#9ca3af] w-8 pt-2 shrink-0 uppercase">{join}</span>}
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr] gap-1.5">
        <FilterSelect value={row.field} onChange={(e) => pickField(e.target.value)} className="text-[12px] border border-[#e7eaf1] rounded-lg px-2 py-1.5 bg-white">
          <option value="">Select field…</option>
          {fields.map((f) => <option key={f.logical_name} value={f.logical_name}>{f.display_name}</option>)}
        </FilterSelect>
        <FilterSelect value={row.operator} onChange={(e) => onChange({ operator: e.target.value as CalcOperator })} className="text-[12px] border border-[#e7eaf1] rounded-lg px-2 py-1.5 bg-white">
          {ops.map((op) => <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>)}
        </FilterSelect>
        {operatorNeedsValue(row.operator)
          ? <ValueInput fieldType={row.fieldType} choices={selected?.choices ?? []} value={row.value} onChange={(v) => onChange({ value: v })} />
          : <div />}
      </div>
      <button onClick={onRemove} className="p-1.5 rounded hover:bg-red-100 text-[#cbd2dc] hover:text-red-500 transition shrink-0" title="Remove condition">
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ── Result expression ──────────────────────────────────────────────────────
function ResultExpression({
  expr, numericResult, resultType, fields, onChange,
}: {
  expr: { operands: CalcOperand[]; operators: CalcArithOp[] };
  numericResult: boolean; resultType: CalcResultType; fields: SourceField[];
  onChange: (e: { operands: CalcOperand[]; operators: CalcArithOp[] }) => void;
}) {
  function setOperand(i: number, op: CalcOperand) {
    onChange({ ...expr, operands: expr.operands.map((o, idx) => (idx === i ? op : o)) });
  }
  function addOperation() {
    onChange({ operands: [...expr.operands, { kind: 'value', value: '' }], operators: [...expr.operators, '+'] });
  }
  function removeOperand(i: number) {
    onChange({
      operands: expr.operands.filter((_, idx) => idx !== i),
      operators: expr.operators.filter((_, idx) => idx !== Math.max(0, i - 1)),
    });
  }
  function setOperator(i: number, op: CalcArithOp) {
    onChange({ ...expr, operators: expr.operators.map((o, idx) => (idx === i ? op : o)) });
  }

  return (
    <div className="space-y-1.5">
      {expr.operands.map((op, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {i > 0 && (
            <FilterSelect value={expr.operators[i - 1] ?? '+'} onChange={(e) => setOperator(i - 1, e.target.value as CalcArithOp)} className="text-[12px] border border-[#e7eaf1] rounded-lg px-2 py-1.5 bg-white w-24">
              {(['+', '-', '*', '/'] as CalcArithOp[]).map((o) => <option key={o} value={o}>{ARITH_LABELS[o]}</option>)}
            </FilterSelect>
          )}
          <OperandEditor
            operand={op}
            resultType={resultType}
            fields={fields}
            onChange={(o) => setOperand(i, o)}
          />
          {expr.operands.length > 1 && (
            <button onClick={() => removeOperand(i)} className="p-1.5 rounded hover:bg-red-100 text-[#cbd2dc] hover:text-red-500 transition shrink-0">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
      {numericResult && (
        <button type="button" onClick={addOperation} className="flex items-center gap-1.5 text-[11px] text-[#3b6fff] hover:text-[#1d4ed8] font-medium transition">
          <Plus size={11} /> Add operation (Add / Subtract / Multiply / Divide)
        </button>
      )}
    </div>
  );
}

function OperandEditor({
  operand, resultType, fields, onChange,
}: {
  operand: CalcOperand; resultType: CalcResultType; fields: SourceField[];
  onChange: (o: CalcOperand) => void;
}) {
  const isField = operand.kind === 'field';
  const selected = isField ? fields.find((f) => f.logical_name === operand.field) : undefined;

  function switchKind(kind: 'field' | 'value') {
    if (kind === 'field') {
      const f = fields[0];
      onChange(f
        ? { kind: 'field', field: f.logical_name, column: f.physical_column_name, fieldType: f.field_type, displayName: f.display_name }
        : { kind: 'field', field: '', column: '', fieldType: 'text', displayName: '' });
    } else {
      onChange({ kind: 'value', value: '' });
    }
  }
  function pickField(logical: string) {
    const f = fields.find((x) => x.logical_name === logical);
    if (f) onChange({ kind: 'field', field: f.logical_name, column: f.physical_column_name, fieldType: f.field_type, displayName: f.display_name });
  }

  return (
    <div className="flex items-center gap-1.5 flex-1">
      <FilterSelect value={operand.kind} onChange={(e) => switchKind(e.target.value as 'field' | 'value')} className="text-[12px] border border-[#e7eaf1] rounded-lg px-2 py-1.5 bg-white w-20">
        <option value="field">Field</option>
        <option value="value">Value</option>
      </FilterSelect>
      {isField ? (
        <FilterSelect value={operand.field} onChange={(e) => pickField(e.target.value)} className="flex-1 text-[12px] border border-[#e7eaf1] rounded-lg px-2 py-1.5 bg-white">
          <option value="">Select field…</option>
          {fields.map((f) => <option key={f.logical_name} value={f.logical_name}>{f.display_name}</option>)}
        </FilterSelect>
      ) : (
        <ValueInput
          fieldType={resultType}
          choices={selected?.choices ?? []}
          value={operand.kind === 'value' ? operand.value : ''}
          onChange={(v) => onChange({ kind: 'value', value: v })}
        />
      )}
    </div>
  );
}

// ── Type-aware value input (readable values, never GUIDs) ─────────────────────
function ValueInput({
  fieldType, choices, value, onChange,
}: {
  fieldType: string; choices: { value: string; label: string }[]; value: string; onChange: (v: string) => void;
}) {
  const cls = 'flex-1 text-[12px] border border-[#e7eaf1] rounded-lg px-2 py-1.5 bg-white';

  if (fieldType === 'boolean') {
    return (
      <FilterSelect value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </FilterSelect>
    );
  }
  if ((fieldType === 'choice' || fieldType === 'option_set') && choices.length > 0) {
    return (
      <FilterSelect value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">Select value…</option>
        {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </FilterSelect>
    );
  }
  if (fieldType === 'date' || fieldType === 'datetime') {
    return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={cls} />;
  }
  if (isNumericType(fieldType) || fieldType === 'currency') {
    return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" className={cls} />;
  }
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Value" className={cls} />;
}
