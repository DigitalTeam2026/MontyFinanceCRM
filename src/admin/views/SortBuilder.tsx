import { Plus, Trash2, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import type { FieldDefinition } from '../../types/field';
import type { SortDefinition } from '../../types/view';

interface SortBuilderProps {
  fields: FieldDefinition[];
  sorts: SortDefinition[];
  onChange: (sorts: SortDefinition[]) => void;
}

export default function SortBuilder({ fields, sorts, onChange }: SortBuilderProps) {
  const sortableFields = fields.filter((f) => f.is_sortable);

  const addSort = () => {
    const usedNames = new Set(sorts.map((s) => s.field_logical_name));
    const available = sortableFields.find((f) => !usedNames.has(f.logical_name));
    if (!available) return;
    onChange([
      ...sorts,
      {
        field_logical_name: available.logical_name,
        field_display_name: available.display_name,
        direction: 'asc',
        order: sorts.length,
      },
    ]);
  };

  const updateSort = (idx: number, patch: Partial<SortDefinition>) => {
    const next = sorts.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange(next);
  };

  const removeSort = (idx: number) => {
    onChange(sorts.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })));
  };

  const moveSort = (idx: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= sorts.length) return;
    const next = [...sorts];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next.map((s, i) => ({ ...s, order: i })));
  };

  const usedNames = new Set(sorts.map((s) => s.field_logical_name));
  const canAdd = sortableFields.some((f) => !usedNames.has(f.logical_name));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-xs text-slate-500">
          {sorts.length === 0 ? 'No sort defined — records use natural order' : `${sorts.length} sort${sorts.length !== 1 ? 's' : ''} defined`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {sorts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-center">
            <ArrowUpDown size={24} className="mb-2 opacity-30" />
            <p className="text-xs">No sort order defined</p>
          </div>
        )}

        {sorts.map((sort, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2.5"
          >
            <span className="text-[10px] font-bold text-slate-300 w-5 text-center shrink-0">
              {idx + 1}
            </span>

            <select
              value={sort.field_logical_name}
              onChange={(e) => {
                const field = fields.find((f) => f.logical_name === e.target.value);
                updateSort(idx, {
                  field_logical_name: e.target.value,
                  field_display_name: field?.display_name ?? e.target.value,
                });
              }}
              className="flex-1 text-xs text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            >
              {sortableFields.map((f) => (
                <option
                  key={f.field_definition_id}
                  value={f.logical_name}
                  disabled={usedNames.has(f.logical_name) && f.logical_name !== sort.field_logical_name}
                >
                  {f.display_name}
                </option>
              ))}
            </select>

            <div className="flex rounded-lg overflow-hidden border border-slate-200 shrink-0">
              {(['asc', 'desc'] as const).map((dir) => (
                <button
                  key={dir}
                  onClick={() => updateSort(idx, { direction: dir })}
                  className={`px-2.5 py-1.5 text-[10px] font-semibold uppercase transition-colors ${
                    sort.direction === dir
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {dir}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-0 shrink-0">
              <button
                disabled={idx === 0}
                onClick={() => moveSort(idx, 'up')}
                className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20"
              >
                <ChevronUp size={11} />
              </button>
              <button
                disabled={idx === sorts.length - 1}
                onClick={() => moveSort(idx, 'down')}
                className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20"
              >
                <ChevronDown size={11} />
              </button>
            </div>

            <button
              onClick={() => removeSort(idx)}
              className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-slate-100">
        <button
          onClick={addSort}
          disabled={!canAdd}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-blue-600 border-2 border-dashed border-blue-200 rounded-lg hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={12} />
          Add Sort Field
        </button>
      </div>
    </div>
  );
}
