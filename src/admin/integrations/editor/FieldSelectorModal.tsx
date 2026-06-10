import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Link2, Database, Settings2 } from 'lucide-react';
import type { EntityFieldInfo } from '../../../types/apiIntegration';

interface Props {
  title?: string;
  fields: EntityFieldInfo[];
  /** Logical names already mapped — shown greyed but still selectable. */
  usedColumns?: Set<string>;
  onSelect: (field: EntityFieldInfo) => void;
  onClose: () => void;
}

// Logical names treated as "system" fields for grouping purposes.
const SYSTEM_NAMES = new Set([
  'created_at', 'modified_at', 'created_by', 'modified_by', 'createdon', 'modifiedon',
  'createdby', 'modifiedby', 'owner_id', 'ownerid', 'owning_user', 'owning_team',
  'business_unit_id', 'owning_business_unit', 'is_deleted', 'statecode', 'statuscode',
  'state_code', 'status_code', 'statusreason', 'import_id', 'version', 'versionnumber',
  'timezone_id',
]);

function classify(f: EntityFieldInfo): 'lookup' | 'system' | 'standard' {
  if (f.field_type?.name === 'lookup' || f.lookup_entity) return 'lookup';
  if (SYSTEM_NAMES.has(f.logical_name) || f.logical_name.endsWith('_code')) return 'system';
  return 'standard';
}

const GROUP_META: Record<
  'standard' | 'lookup' | 'system',
  { label: string; icon: typeof Database }
> = {
  standard: { label: 'Standard fields', icon: Database },
  lookup: { label: 'Lookup fields', icon: Link2 },
  system: { label: 'System fields', icon: Settings2 },
};

export default function FieldSelectorModal({
  title = 'Add field',
  fields,
  usedColumns,
  onSelect,
  onClose,
}: Props) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = fields.filter(
      (f) =>
        !q ||
        f.display_name.toLowerCase().includes(q) ||
        f.physical_column_name.toLowerCase().includes(q) ||
        f.logical_name.toLowerCase().includes(q)
    );
    const out: Record<'standard' | 'lookup' | 'system', EntityFieldInfo[]> = {
      standard: [],
      lookup: [],
      system: [],
    };
    for (const f of filtered) out[classify(f)].push(f);
    return out;
  }, [fields, search]);

  const order: ('standard' | 'lookup' | 'system')[] = ['standard', 'lookup', 'system'];
  const total = order.reduce((n, k) => n + groups[k].length, 0);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white rounded-xl border border-gray-200 shadow-2xl w-full max-w-md flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + search */}
        <div className="px-4 pt-3.5 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[13px] font-semibold text-gray-800">{title}</h3>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-100 text-slate-400 hover:text-slate-600"
            >
              <X size={15} />
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or logical name…"
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto py-1.5">
          {total === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No fields match "{search}"</p>
          ) : (
            order.map((key) =>
              groups[key].length === 0 ? null : (
                <div key={key} className="mb-1">
                  <div className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide sticky top-0 bg-white">
                    {(() => {
                      const Icon = GROUP_META[key].icon;
                      return <Icon size={11} />;
                    })()}
                    {GROUP_META[key].label}
                    <span className="text-slate-300">· {groups[key].length}</span>
                  </div>
                  {groups[key].map((f) => {
                    const used = usedColumns?.has(f.physical_column_name);
                    return (
                      <button
                        key={f.field_definition_id}
                        onClick={() => onSelect(f)}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-blue-50 transition-colors group"
                      >
                        <TypeBadge type={f.field_type?.name ?? 'text'} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-800 truncate flex items-center gap-1.5">
                            {f.display_name}
                            {used && (
                              <span className="text-[9px] font-normal text-amber-500 bg-amber-50 px-1 rounded">
                                mapped
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate font-mono">
                            {f.physical_column_name}
                          </p>
                        </div>
                        {f.lookup_entity && (
                          <span className="text-[9px] text-slate-400 truncate max-w-[80px]">
                            → {f.lookup_entity.logical_name}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )
            )
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const BADGE_COLORS: Record<string, string> = {
  lookup: 'bg-purple-50 text-purple-600 border-purple-200',
  text: 'bg-slate-50 text-slate-500 border-slate-200',
  number: 'bg-blue-50 text-blue-600 border-blue-200',
  integer: 'bg-blue-50 text-blue-600 border-blue-200',
  decimal: 'bg-blue-50 text-blue-600 border-blue-200',
  money: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  boolean: 'bg-amber-50 text-amber-600 border-amber-200',
  datetime: 'bg-rose-50 text-rose-600 border-rose-200',
  date: 'bg-rose-50 text-rose-600 border-rose-200',
  email: 'bg-cyan-50 text-cyan-600 border-cyan-200',
  optionset: 'bg-indigo-50 text-indigo-600 border-indigo-200',
};

export function TypeBadge({ type }: { type: string }) {
  const cls = BADGE_COLORS[type] ?? 'bg-slate-50 text-slate-500 border-slate-200';
  return (
    <span
      className={`text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${cls}`}
      title={`Field type: ${type}`}
    >
      {type}
    </span>
  );
}
