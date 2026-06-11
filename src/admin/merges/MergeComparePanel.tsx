import { CheckCircle2, Crown, Minus } from 'lucide-react';
import type { MergeCandidate, FieldSelection, FieldSelectionSource } from '../../types/mergeCenter';

export interface FieldRow {
  field_name: string;
  display_name: string;
  value_a: string | null;
  value_b: string | null;
}

interface MergeComparePanelProps {
  candidate: MergeCandidate;
  masterSide: 'a' | 'b';
  fieldRows: FieldRow[];
  fieldSelections: Record<string, FieldSelection>;
  onMasterSideChange: (side: 'a' | 'b') => void;
  onFieldSelectionChange: (field: string, selection: FieldSelection) => void;
  disabled?: boolean;
}

function truncate(v: string | null, n = 80): string {
  if (!v) return '—';
  return v.length > n ? v.slice(0, n) + '…' : v;
}

function ValueCell({ value, selected, master, onSelect, disabled }: {
  value: string | null;
  selected: boolean;
  master: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      className={`group w-full text-left px-3 py-2.5 rounded-xl border-2 transition-all text-xs relative ${
        selected
          ? 'border-blue-500 bg-blue-50'
          : value
          ? 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer'
          : 'border-dashed border-gray-200 cursor-default opacity-50'
      } ${disabled ? 'pointer-events-none' : ''}`}
    >
      {master && (
        <Crown size={9} className={`absolute top-1.5 right-1.5 ${selected ? 'text-blue-400' : 'text-gray-300'}`} />
      )}
      {selected && !master && (
        <CheckCircle2 size={10} className="absolute top-1.5 right-1.5 text-blue-500" />
      )}
      <span className={`leading-snug ${value ? (selected ? 'text-blue-800 font-medium' : 'text-gray-700') : 'text-gray-400 italic'}`}>
        {value ? truncate(value) : 'empty'}
      </span>
    </button>
  );
}

export default function MergeComparePanel({
  candidate,
  masterSide,
  fieldRows,
  fieldSelections,
  onMasterSideChange,
  onFieldSelectionChange,
  disabled,
}: MergeComparePanelProps) {
  const labelA = candidate.record_a_label || 'Record A';
  const labelB = candidate.record_b_label || 'Record B';

  const getSelection = (field: string): FieldSelectionSource => {
    return fieldSelections[field]?.source ?? (masterSide === 'a' ? 'master' : 'loser');
  };

  const handlePick = (field: string, side: 'a' | 'b') => {
    const isMaster = side === masterSide;
    onFieldSelectionChange(field, { source: isMaster ? 'master' : 'loser' });
  };

  const isSideASelected = (field: string) => {
    const sel = getSelection(field);
    return masterSide === 'a' ? sel === 'master' : sel === 'loser';
  };

  const isSideBSelected = (field: string) => {
    const sel = getSelection(field);
    return masterSide === 'b' ? sel === 'master' : sel === 'loser';
  };

  const diffCount = fieldRows.filter((r) => r.value_a !== r.value_b && (r.value_a || r.value_b)).length;

  return (
    <div>
      {/* Master Selector */}
      <div className="mb-5">
        <p className="text-xs font-semibold text-gray-700 mb-2">Choose Master Record (survives the merge)</p>
        <div className="grid grid-cols-2 gap-3">
          {(['a', 'b'] as const).map((side) => {
            const label = side === 'a' ? labelA : labelB;
            const id = side === 'a' ? candidate.record_a_id : candidate.record_b_id;
            const isMaster = masterSide === side;
            return (
              <button key={side} onClick={() => !disabled && onMasterSideChange(side)}
                className={`flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                  isMaster
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-gray-200 hover:border-gray-300'
                } ${disabled ? 'pointer-events-none' : ''}`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isMaster ? 'bg-emerald-100' : 'bg-gray-100'
                }`}>
                  {isMaster
                    ? <Crown size={16} className="text-emerald-600" />
                    : <Minus size={16} className="text-gray-400" />}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-bold truncate ${isMaster ? 'text-emerald-800' : 'text-gray-700'}`}>{label}</p>
                  <p className="text-[10px] font-mono text-gray-400 truncate">{id}</p>
                  <p className={`text-[10px] mt-0.5 font-semibold ${isMaster ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {isMaster ? 'MASTER — will be kept' : 'LOSER — will be retired'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">The master record retains its ID. The loser record is archived and all related records are reparented.</p>
      </div>

      {/* Field Comparison */}
      {fieldRows.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700">Field Values — Select the value to keep</p>
            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              {diffCount} field{diffCount !== 1 ? 's' : ''} differ
            </span>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[160px_1fr_1fr] gap-2 mb-1.5 px-1">
            <div />
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
              {labelA}
              {masterSide === 'a' && <Crown size={9} className="text-emerald-500" />}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
              {labelB}
              {masterSide === 'b' && <Crown size={9} className="text-emerald-500" />}
            </div>
          </div>

          <div className="space-y-1.5">
            {fieldRows.map((row) => {
              const different = row.value_a !== row.value_b;
              return (
                <div key={row.field_name}
                  className={`grid grid-cols-[160px_1fr_1fr] gap-2 items-start px-1 py-0.5 rounded-xl ${
                    different ? 'bg-amber-50/60' : ''
                  }`}>
                  <div className="pt-2.5">
                    <p className="text-xs font-semibold text-gray-700 truncate">{row.display_name}</p>
                    <p className="text-[10px] text-gray-400 font-mono truncate">{row.field_name}</p>
                  </div>
                  <ValueCell
                    value={row.value_a}
                    selected={isSideASelected(row.field_name)}
                    master={masterSide === 'a'}
                    onSelect={() => handlePick(row.field_name, 'a')}
                    disabled={disabled}
                  />
                  <ValueCell
                    value={row.value_b}
                    selected={isSideBSelected(row.field_name)}
                    master={masterSide === 'b'}
                    onSelect={() => handlePick(row.field_name, 'b')}
                    disabled={disabled}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-3">Click a cell to select that value. Yellow rows indicate fields where values differ.</p>
        </div>
      )}
    </div>
  );
}
