import { Search, Plus, X } from 'lucide-react';
import type { FieldDefinition } from '../../types/field';

interface QuickFindEditorProps {
  fields: FieldDefinition[];
  selected: string[];
  onChange: (names: string[]) => void;
}

export default function QuickFindEditor({ fields, selected, onChange }: QuickFindEditorProps) {
  const searchableFields = fields.filter((f) => f.is_searchable);
  const selectedSet = new Set(selected);
  const available = searchableFields.filter((f) => !selectedSet.has(f.logical_name));
  const selectedFields = selected
    .map((name) => fields.find((f) => f.logical_name === name))
    .filter(Boolean) as FieldDefinition[];

  const add = (logicalName: string) => onChange([...selected, logicalName]);
  const remove = (logicalName: string) => onChange(selected.filter((n) => n !== logicalName));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <Search size={13} />
          <span>Quick Find searches across these fields when a user types in the search bar</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {selectedFields.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Active Search Fields
            </p>
            <div className="space-y-1.5">
              {selectedFields.map((f) => (
                <div
                  key={f.field_definition_id}
                  className="flex items-center gap-2.5 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg"
                >
                  <Search size={11} className="text-blue-400 shrink-0" />
                  <span className="text-xs font-medium text-blue-700 flex-1 truncate">{f.display_name}</span>
                  <span className="text-[10px] text-blue-400">{f.field_type?.name}</span>
                  <button
                    onClick={() => remove(f.logical_name)}
                    className="text-blue-300 hover:text-red-500 transition-colors"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {available.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Available Fields
            </p>
            <div className="space-y-1">
              {available.map((f) => (
                <button
                  key={f.field_definition_id}
                  onClick={() => add(f.logical_name)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition-colors text-left group"
                >
                  <span className="flex-1 font-medium">{f.display_name}</span>
                  <span className="text-[10px] text-slate-400">{f.field_type?.name}</span>
                  <Plus size={11} className="text-slate-300 group-hover:text-blue-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {available.length === 0 && selectedFields.length === 0 && (
          <div className="text-center py-10 text-slate-400">
            <Search size={24} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">No searchable fields available</p>
            <p className="text-[10px] mt-1">Mark fields as searchable in Field Management</p>
          </div>
        )}
      </div>
    </div>
  );
}
