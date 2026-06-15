import {
  Pencil, Trash2, Lock, Hash, Type, Calendar, ToggleLeft, Link,
  List, FileText, DollarSign, Mail, Phone, Globe, Image, File, Clock, AlignLeft,
  Shield, Wrench, ShieldCheck,
} from 'lucide-react';
import type { FieldDefinition } from '../../types/field';

const TYPE_ICON: Record<string, React.ReactNode> = {
  text: <Type size={11} />, textarea: <AlignLeft size={11} />, number: <Hash size={11} />,
  decimal: <Hash size={11} />, currency: <DollarSign size={11} />, boolean: <ToggleLeft size={11} />,
  date: <Calendar size={11} />, datetime: <Calendar size={11} />, time: <Clock size={11} />,
  email: <Mail size={11} />, phone: <Phone size={11} />, url: <Globe size={11} />,
  lookup: <Link size={11} />, choice: <List size={11} />, multi_choice: <List size={11} />,
  file: <File size={11} />, image: <Image size={11} />, autonumber: <Hash size={11} />, calculated: <FileText size={11} />,
};

const TYPE_COLOR: Record<string, string> = {
  text: 'bg-blue-50 text-blue-700 border-blue-200',
  textarea: 'bg-blue-50 text-blue-700 border-blue-200',
  number: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  decimal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  currency: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  boolean: 'bg-amber-50 text-amber-700 border-amber-200',
  date: 'bg-sky-50 text-sky-700 border-sky-200',
  datetime: 'bg-sky-50 text-sky-700 border-sky-200',
  time: 'bg-sky-50 text-sky-700 border-sky-200',
  email: 'bg-teal-50 text-teal-700 border-teal-200',
  phone: 'bg-teal-50 text-teal-700 border-teal-200',
  url: 'bg-teal-50 text-teal-700 border-teal-200',
  lookup: 'bg-rose-50 text-rose-700 border-rose-200',
  choice: 'bg-orange-50 text-orange-700 border-orange-200',
  multi_choice: 'bg-orange-50 text-orange-700 border-orange-200',
  file: 'bg-slate-50 text-slate-600 border-slate-200',
  image: 'bg-slate-50 text-slate-600 border-slate-200',
  autonumber: 'bg-slate-50 text-slate-600 border-slate-200',
  calculated: 'bg-slate-50 text-slate-600 border-slate-200',
};

interface FieldGridProps {
  fields: FieldDefinition[];
  onEdit: (field: FieldDefinition) => void;
  onDelete: (field: FieldDefinition) => void;
  onToggleSecured?: (field: FieldDefinition, secured: boolean) => void;
  togglingSecured?: string | null;
  onToggleCustom?: (field: FieldDefinition) => void;
  reclassifying?: string | null;
}

export default function FieldGrid({ fields, onEdit, onDelete, onToggleSecured, togglingSecured, onToggleCustom, reclassifying }: FieldGridProps) {
  if (fields.length === 0) return null;

  return (
    <table className="w-full text-[12px] border-collapse">
      <thead className="sticky top-0 z-10">
        <tr className="bg-slate-50 border-b border-slate-200">
          {['Display name', 'Schema name', 'Data type', 'Category', 'Required', 'Secured', 'Status', ''].map((h) => (
            <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {fields.map((field) => {
          const tn = field.field_type?.name ?? '';
          const isSystem = field.is_system;
          const canDelete = field.is_deletable !== false && !isSystem;
          const isToggling = togglingSecured === field.field_definition_id;

          return (
            <tr
              key={field.field_definition_id}
              className={`border-b border-slate-100 transition-colors group cursor-pointer ${isSystem ? 'hover:bg-slate-50/80' : 'hover:bg-blue-50/40'}`}
              onClick={() => onEdit(field)}
            >
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                    TYPE_COLOR[tn] ? TYPE_COLOR[tn].replace('text-', 'text-').split(' ')[0] + ' ring-1 ' + TYPE_COLOR[tn].split(' ')[2].replace('border-', 'ring-') : 'bg-slate-50 ring-1 ring-slate-200'
                  }`}>
                    {TYPE_ICON[tn] ?? <Type size={13} />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate leading-tight">{field.display_name}</p>
                    {field.description && <p className="text-[10px] text-slate-400 truncate leading-tight mt-0.5 max-w-[200px]">{field.description}</p>}
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5">
                <code className="text-[11px] text-slate-500 font-mono">{field.logical_name}</code>
              </td>
              <td className="px-3 py-2.5">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${TYPE_COLOR[tn] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                  {TYPE_ICON[tn] ?? <Type size={11} />}
                  {field.field_type?.display_name ?? tn}
                </span>
              </td>
              <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const isReclassifying = reclassifying === field.field_definition_id;
                  const badge = isSystem
                    ? <><Shield size={8} /> System</>
                    : <><Wrench size={8} /> Custom</>;
                  const cls = isSystem
                    ? 'bg-slate-100 text-slate-600 ring-slate-200'
                    : 'bg-amber-50 text-amber-700 ring-amber-200';
                  if (!onToggleCustom) {
                    return <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ring-1 ring-inset ${cls}`}>{badge}</span>;
                  }
                  return (
                    <button
                      onClick={() => onToggleCustom(field)}
                      disabled={isReclassifying}
                      title={isSystem ? 'Convert to custom column' : 'Convert to system column'}
                      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ring-1 ring-inset transition-colors hover:brightness-95 ${cls} ${isReclassifying ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {badge}
                    </button>
                  );
                })()}
              </td>
              <td className="px-3 py-2.5">
                {field.is_required
                  ? <span className="text-[10px] font-semibold text-red-600 bg-red-50 ring-1 ring-inset ring-red-200 px-2 py-0.5 rounded-full">Required</span>
                  : <span className="text-[11px] text-slate-400">Optional</span>
                }
              </td>
              <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                {onToggleSecured ? (
                  <button
                    onClick={() => onToggleSecured(field, !field.is_secured)}
                    disabled={isToggling}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ring-1 ring-inset ${
                      field.is_secured
                        ? 'bg-blue-50 ring-blue-200 text-blue-700 hover:bg-blue-100'
                        : 'bg-slate-50 ring-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                    } ${isToggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <ShieldCheck size={9} />
                    {field.is_secured ? 'Secured' : 'Off'}
                  </button>
                ) : (
                  field.is_secured ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-50 ring-1 ring-inset ring-blue-200 text-blue-700">
                      <ShieldCheck size={9} /> Secured
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-300">--</span>
                  )
                )}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${field.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <span className={`text-[11px] ${field.is_active ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {field.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </td>
              <td className="px-2 py-2.5 w-16" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEdit(field)}
                    title="Edit"
                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  >
                    <Pencil size={12} />
                  </button>
                  {canDelete ? (
                    <button
                      onClick={() => onDelete(field)}
                      title="Delete"
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : (
                    <div className="p-1 text-slate-200 cursor-not-allowed" title={isSystem ? 'System column cannot be deleted' : 'This column cannot be deleted'}>
                      <Lock size={12} />
                    </div>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
