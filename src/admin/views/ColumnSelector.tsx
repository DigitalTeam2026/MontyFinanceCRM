import { useState } from 'react';
import {
  Search,
  GripVertical,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  ChevronUp,
  ChevronDown,
  Type,
  Hash,
  Calendar,
  ToggleLeft,
  Mail,
  Phone,
  Globe,
  Link,
  List,
  AlignLeft,
  DollarSign,
  Clock,
  File,
  Image,
} from 'lucide-react';
import type { FieldDefinition } from '../../types/field';
import type { ViewColumn } from '../../types/view';

const FIELD_ICONS: Record<string, React.ReactNode> = {
  text: <Type size={11} />,
  textarea: <AlignLeft size={11} />,
  number: <Hash size={11} />,
  decimal: <Hash size={11} />,
  currency: <DollarSign size={11} />,
  boolean: <ToggleLeft size={11} />,
  date: <Calendar size={11} />,
  datetime: <Calendar size={11} />,
  time: <Clock size={11} />,
  email: <Mail size={11} />,
  phone: <Phone size={11} />,
  url: <Globe size={11} />,
  lookup: <Link size={11} />,
  choice: <List size={11} />,
  multi_choice: <List size={11} />,
  option_set: <List size={11} />,
  file: <File size={11} />,
  image: <Image size={11} />,
};

interface ColumnSelectorProps {
  fields: FieldDefinition[];
  columns: ViewColumn[];
  onChange: (columns: ViewColumn[]) => void;
}

export default function ColumnSelector({ fields, columns, onChange }: ColumnSelectorProps) {
  const [search, setSearch] = useState('');
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);

  const selectedFieldIds = new Set(columns.map((c) => c.field_definition_id));

  const filteredFields = fields.filter(
    (f) =>
      !selectedFieldIds.has(f.field_definition_id) &&
      (f.display_name.toLowerCase().includes(search.toLowerCase()) ||
        f.logical_name.toLowerCase().includes(search.toLowerCase()))
  );

  const addField = (field: FieldDefinition) => {
    if (selectedFieldIds.has(field.field_definition_id)) return;
    const col: ViewColumn = {
      view_column_id: `new_${Date.now()}`,
      view_id: '',
      field_definition_id: field.field_definition_id,
      field_logical_name: field.logical_name,
      field_display_name: field.display_name,
      field_type_name: field.field_type?.name,
      display_order: columns.length,
      width: null,
      is_sortable: field.is_sortable,
      label_override: null,
      is_hidden: false,
    };
    onChange([...columns, col]);
  };

  const removeColumn = (id: string) => {
    onChange(columns.filter((c) => c.view_column_id !== id));
  };

  const toggleHidden = (id: string) => {
    onChange(columns.map((c) => (c.view_column_id === id ? { ...c, is_hidden: !c.is_hidden } : c)));
  };

  const moveColumn = (id: string, dir: 'up' | 'down') => {
    const idx = columns.findIndex((c) => c.view_column_id === id);
    if (idx === -1) return;
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= columns.length) return;
    const next = [...columns];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next.map((c, i) => ({ ...c, display_order: i })));
  };

  const updateLabel = (id: string, label: string) => {
    onChange(columns.map((c) => (c.view_column_id === id ? { ...c, label_override: label || null } : c)));
  };

  const updateWidth = (id: string, width: string) => {
    const num = parseInt(width);
    onChange(columns.map((c) => (c.view_column_id === id ? { ...c, width: isNaN(num) ? null : num } : c)));
  };

  const toggleSortable = (id: string) => {
    onChange(columns.map((c) => (c.view_column_id === id ? { ...c, is_sortable: !c.is_sortable } : c)));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex flex-col border-r border-slate-200 w-56 shrink-0">
          <div className="px-3 py-3 border-b border-slate-100">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Available Fields
            </p>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search fields..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1.5 px-2">
            {filteredFields.length === 0 && (
              <p className="text-xs text-slate-400 px-2 py-3 text-center">No fields available</p>
            )}
            {filteredFields.map((field) => {
              const icon = FIELD_ICONS[field.field_type?.name ?? ''] ?? <Type size={11} />;
              return (
                <button
                  key={field.field_definition_id}
                  onClick={() => addField(field)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left group"
                >
                  <span className="text-slate-400 group-hover:text-blue-500 shrink-0">{icon}</span>
                  <span className="font-medium truncate flex-1">{field.display_name}</span>
                  <Plus size={11} className="text-slate-300 group-hover:text-blue-400 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Selected Columns ({columns.length})
            </p>
            {columns.length > 0 && (
              <button
                onClick={() => onChange([])}
                className="text-[10px] text-red-400 hover:text-red-600 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {columns.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-10">
                <List size={24} className="mb-2 opacity-30" />
                <p className="text-xs">Add fields from the left panel</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {columns.map((col, idx) => {
                  const icon = FIELD_ICONS[col.field_type_name ?? ''] ?? <Type size={11} />;
                  const isEditingLabel = editingLabelId === col.view_column_id;
                  return (
                    <div
                      key={col.view_column_id}
                      className={`flex items-center gap-2 px-4 py-2.5 group transition-colors ${
                        col.is_hidden ? 'opacity-50' : ''
                      } hover:bg-slate-50`}
                    >
                      <GripVertical size={13} className="text-slate-300 shrink-0 cursor-grab" />

                      <span className="text-slate-400 shrink-0">{icon}</span>

                      <div className="flex-1 min-w-0">
                        {isEditingLabel ? (
                          <input
                            type="text"
                            defaultValue={col.label_override ?? col.field_display_name ?? ''}
                            autoFocus
                            onBlur={(e) => {
                              updateLabel(col.view_column_id, e.target.value);
                              setEditingLabelId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                updateLabel(col.view_column_id, (e.target as HTMLInputElement).value);
                                setEditingLabelId(null);
                              }
                              if (e.key === 'Escape') setEditingLabelId(null);
                            }}
                            className="w-full text-xs px-2 py-1 border border-blue-400 rounded focus:outline-none"
                          />
                        ) : (
                          <div
                            className="cursor-pointer"
                            onDoubleClick={() => setEditingLabelId(col.view_column_id)}
                          >
                            <p className="text-xs font-medium text-slate-700 truncate">
                              {col.label_override ?? col.field_display_name}
                              {col.label_override && (
                                <span className="text-[9px] text-blue-400 ml-1">(renamed)</span>
                              )}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate">{col.field_logical_name}</p>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          value={col.width ?? ''}
                          onChange={(e) => updateWidth(col.view_column_id, e.target.value)}
                          placeholder="auto"
                          className="w-14 px-1.5 py-0.5 text-[10px] border border-slate-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                          title="Column width (px)"
                        />
                        <button
                          onClick={() => toggleSortable(col.view_column_id)}
                          title={col.is_sortable ? 'Sortable — click to disable' : 'Not sortable'}
                          className={`p-1 rounded transition-colors ${col.is_sortable ? 'text-blue-500 bg-blue-50' : 'text-slate-300 hover:text-blue-400'}`}
                        >
                          <ChevronUp size={10} />
                        </button>
                        <button
                          onClick={() => toggleHidden(col.view_column_id)}
                          title={col.is_hidden ? 'Hidden — click to show' : 'Click to hide'}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {col.is_hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                        <div className="flex flex-col gap-0">
                          <button
                            disabled={idx === 0}
                            onClick={() => moveColumn(col.view_column_id, 'up')}
                            className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors"
                          >
                            <ChevronUp size={10} />
                          </button>
                          <button
                            disabled={idx === columns.length - 1}
                            onClick={() => moveColumn(col.view_column_id, 'down')}
                            className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors"
                          >
                            <ChevronDown size={10} />
                          </button>
                        </div>
                        <button
                          onClick={() => removeColumn(col.view_column_id)}
                          className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
