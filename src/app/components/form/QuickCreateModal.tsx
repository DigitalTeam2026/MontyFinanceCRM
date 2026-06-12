import FilterSelect from '../FilterSelect';
import { useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { useToast, toFriendlyError } from '../../context/ToastContext';

export interface QuickCreateField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select';
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface QuickCreateModalProps {
  title: string;
  fields: QuickCreateField[];
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}

const inputBase =
  'w-full px-3 py-1.5 text-[13px] text-slate-700 bg-white border border-slate-200 rounded-md placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition';

export default function QuickCreateModal({ title, fields, onSave, onClose }: QuickCreateModalProps) {
  const { showError } = useToast();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: string, val: unknown) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    for (const f of fields) {
      if (f.required) {
        const v = values[f.key];
        if (v == null || String(v).trim() === '') {
          errs[f.key] = `${f.label} is required`;
        }
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave(values);
      onClose();
    } catch (e) {
      showError(toFriendlyError(e, 'Unable to create the record. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-[14px] font-semibold text-slate-800">{title}</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Fill in the details below</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {fields.map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-slate-500">
                {f.label}
                {f.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              {f.type === 'textarea' ? (
                <textarea
                  value={String(values[f.key] ?? '')}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  rows={3}
                  className={`${inputBase} resize-none`}
                />
              ) : f.type === 'select' ? (
                <FilterSelect
                  value={String(values[f.key] ?? '')}
                  onChange={(e) => set(f.key, e.target.value || null)}
                  className={inputBase}
                >
                  <option value="">— Select —</option>
                  {(f.options ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </FilterSelect>
              ) : (
                <input
                  type={f.type}
                  value={String(values[f.key] ?? '')}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className={inputBase}
                />
              )}
              {errors[f.key] && (
                <p className="text-[11px] text-red-500">{errors[f.key]}</p>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-[12px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition disabled:opacity-60"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
