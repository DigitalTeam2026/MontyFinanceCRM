import { useState, useMemo } from 'react';
import { X, Search, Check, Type, Hash, Calendar, ToggleLeft, Link2, List, FileText } from 'lucide-react';
import type { FieldDefinition } from '../../types/field';

interface ColumnSelectorPanelProps {
  fields: FieldDefinition[];
  visibleFieldIds: string[];
  onSave: (fieldIds: string[]) => void;
  onCancel: () => void;
}

const FIELD_TYPE_ICON: Record<string, React.ReactNode> = {
  text: <Type size={12} />,
  nvarchar: <Type size={12} />,
  textarea: <FileText size={12} />,
  number: <Hash size={12} />,
  integer: <Hash size={12} />,
  decimal: <Hash size={12} />,
  currency: <Hash size={12} />,
  datetime: <Calendar size={12} />,
  boolean: <ToggleLeft size={12} />,
  lookup: <Link2 size={12} />,
  choice: <List size={12} />,
  optionset: <List size={12} />,
  calculated: <Hash size={12} />,
  statecode: <List size={12} />,
  statusreason: <List size={12} />,
};

export function getFieldTypeIcon(typeName: string): React.ReactNode {
  return FIELD_TYPE_ICON[typeName] ?? <Type size={12} />;
}

export default function ColumnSelectorPanel({ fields, visibleFieldIds, onSave, onCancel }: ColumnSelectorPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(visibleFieldIds));
  const [search, setSearch] = useState('');

  const activeFields = useMemo(
    () => fields.filter((f) => f.is_active),
    [fields]
  );

  const filtered = useMemo(
    () => activeFields.filter((f) =>
      f.display_name.toLowerCase().includes(search.toLowerCase()) ||
      f.logical_name.toLowerCase().includes(search.toLowerCase())
    ),
    [activeFields, search]
  );

  const allSelected = filtered.length > 0 && filtered.every((f) => selected.has(f.field_definition_id));

  const toggleField = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((f) => next.delete(f.field_definition_id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((f) => next.add(f.field_definition_id));
        return next;
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onCancel} />
      <div className="relative w-[340px] h-full bg-white border-l border-slate-200 shadow-xl flex flex-col animate-in slide-in-from-right">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <p className="text-[13px] font-semibold text-slate-800">Show existing column</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              This table has additional existing columns.{'\n'}Select from the list below to show.
            </p>
          </div>
          <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5 border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-[12px] border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-400"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {/* Select All */}
          <div
            onClick={toggleAll}
            className="flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors"
          >
            <Checkbox checked={allSelected} />
            <span className="text-[12px] font-medium text-slate-600">(Select All)</span>
          </div>

          {filtered.map((field) => {
            const checked = selected.has(field.field_definition_id);
            const typeName = field.field_type?.name ?? '';
            const icon = getFieldTypeIcon(typeName);

            return (
              <div
                key={field.field_definition_id}
                onClick={() => toggleField(field.field_definition_id)}
                className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer transition-colors ${
                  checked ? 'bg-blue-50/40 hover:bg-blue-50/60' : 'hover:bg-slate-50'
                }`}
              >
                <Checkbox checked={checked} />
                <span className="text-slate-400 shrink-0">{icon}</span>
                <span className="text-[12px] text-slate-700 flex-1 truncate">
                  {field.display_name}
                  {field.physical_column_name === 'name' || field.logical_name === field.display_name.toLowerCase() ? '' : ''}
                </span>
                {field.is_required && <span className="text-red-500 text-[11px] font-bold shrink-0">*</span>}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-[12px] text-slate-400">No columns match your search</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0 bg-white">
          <button
            onClick={() => onSave(Array.from(selected))}
            className="px-4 py-1.5 text-[12px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-[12px] font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
      checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'
    }`}>
      {checked && <Check size={10} className="text-white" />}
    </div>
  );
}
