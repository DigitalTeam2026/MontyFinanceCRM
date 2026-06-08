import { Save, Globe, Radio, ArrowLeft, CreditCard as Edit2, CheckCircle, Shield } from 'lucide-react';
import type { FormDefinition, FormType } from '../../types/form';

const FORM_TYPE_LABELS: Record<FormType, string> = {
  main: 'Main Form',
  quick_create: 'Quick Create',
  quick_view: 'Quick View',
};

interface FormToolbarProps {
  form: FormDefinition;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onPublish: () => void;
  onBack: () => void;
  onRenameClick: () => void;
}

export default function FormToolbar({
  form,
  dirty,
  saving,
  onSave,
  onPublish,
  onBack,
  onRenameClick,
}: FormToolbarProps) {
  return (
    <div className="h-12 bg-white border-b border-slate-200 px-4 flex items-center gap-3 shrink-0 shadow-sm z-10">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowLeft size={13} />
        Forms
      </button>

      <div className="w-px h-5 bg-slate-200" />

      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-slate-800">{form.name}</span>
        <button
          onClick={onRenameClick}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          title="Rename form"
        >
          <Edit2 size={11} />
        </button>
      </div>

      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500">
        {FORM_TYPE_LABELS[form.form_type]}
      </span>

      {form.is_system && (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium bg-slate-100 border-slate-300 text-slate-600">
          <Shield size={9} />
          System
        </span>
      )}

      {form.is_published ? (
        <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
          <CheckCircle size={11} />
          Published
        </span>
      ) : (
        <span className="text-[10px] text-amber-500 font-medium">Draft</span>
      )}

      {form.is_default && (
        <span className="text-[10px] text-blue-500 font-medium">Default</span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {dirty && (
          <span className="text-[10px] text-amber-500">Unsaved changes</span>
        )}

        <button
          onClick={onSave}
          disabled={saving || !dirty}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Save size={12} />
          {saving ? 'Saving...' : 'Save'}
        </button>

        <button
          onClick={onPublish}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {form.is_published ? (
            <>
              <Radio size={12} />
              Unpublish
            </>
          ) : (
            <>
              <Globe size={12} />
              Publish
            </>
          )}
        </button>
      </div>
    </div>
  );
}
