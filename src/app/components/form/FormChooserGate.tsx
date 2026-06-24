import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { LayoutTemplate, Star, RefreshCw, Lock, ChevronRight } from 'lucide-react';
import Modal from '../Modal';
import { usePermissions } from '../../context/PermissionContext';
import { getAllowedFormIds } from '../../services/permissionService';
import { fetchSelectableMainForms } from '../../services/recordService';
import type { SelectableForm } from '../../services/recordService';
import type { AppEntity } from '../../types';

/**
 * A small professional card that asks the user which form to use. Shown only when
 * a role is allowed more than one form for the entity. Generic — the form list is
 * driven entirely by metadata + the user's form permissions, nothing hardcoded.
 */
export function FormChooserModal({
  forms, onSelect, onCancel,
}: {
  forms: SelectableForm[];
  onSelect: (formId: string) => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title="Choose a form"
      description="Select which form you'd like to use to create this record."
      icon={<LayoutTemplate size={16} />}
      iconClassName="bg-indigo-50 border border-indigo-100 text-indigo-500"
      width={460}
      onClose={onCancel}
      footer={
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          Cancel
        </button>
      }
    >
      <div className="space-y-2">
        {forms.map((f) => (
          <button
            key={f.form_id}
            type="button"
            onClick={() => onSelect(f.form_id)}
            className="w-full flex items-center gap-3 px-3.5 py-3 text-left border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors group"
          >
            <span className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center shrink-0 transition-colors">
              <LayoutTemplate size={14} className="text-slate-500 group-hover:text-indigo-500" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-slate-800 truncate">{f.name}</span>
                {f.is_default && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-semibold rounded-full shrink-0">
                    <Star size={7} /> Default
                  </span>
                )}
              </span>
            </span>
            <ChevronRight size={15} className="text-slate-300 group-hover:text-indigo-400 shrink-0" />
          </button>
        ))}
      </div>
    </Modal>
  );
}

/**
 * Gates the create flow behind a form chooser. Wraps the record-create page via a
 * render-prop child that receives the chosen form_id (or null = use the default).
 *
 * Behaviour for a NEW record (active = true):
 *   - 0 main forms exist for the entity  → render normally (children(null)); the
 *     create page falls back to its default-form resolution.
 *   - 0 forms allowed for the role       → blocked card (no access).
 *   - exactly 1 form allowed             → open it directly (no card).
 *   - more than 1 allowed                → show the chooser card, then open.
 *
 * When active = false (editing an existing record) the gate is a pass-through;
 * form switching there is handled inside the record page itself.
 */
export function CreateRecordGate({
  active, entity, presetFormId = null, onCancel, children,
}: {
  active: boolean;
  entity: AppEntity;
  /** Reuse this form without prompting (e.g. Save & New). null = ask the user. */
  presetFormId?: string | null;
  onCancel: () => void;
  children: (formId: string | null) => ReactNode;
}) {
  // Depend on the stable `permissions` object (not the per-render-recreated
  // context helper) so a choice the user makes isn't reset by re-renders.
  const { permissions, ready: permissionsReady } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [allowedForms, setAllowedForms] = useState<SelectableForm[]>([]);
  const [totalForms, setTotalForms] = useState(0);
  // Seed from a preset (Save & New) so the chooser is skipped and there's no flash.
  const [chosenFormId, setChosenFormId] = useState<string | null>(presetFormId);

  useEffect(() => {
    if (!active) return;
    if (!permissionsReady) return;
    // A preset form (Save & New) reuses the loaded form — skip the chooser.
    if (presetFormId) { setChosenFormId(presetFormId); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setChosenFormId(null);
    fetchSelectableMainForms(entity)
      .then((forms) => {
        if (cancelled) return;
        const allowedSet = getAllowedFormIds(permissions, entity); // null = all (system admin)
        const allowed = allowedSet === null ? forms : forms.filter((f) => allowedSet.has(f.form_id));
        setTotalForms(forms.length);
        setAllowedForms(allowed);
        // Auto-select when there is exactly one choice (or one allowed).
        if (allowed.length === 1) setChosenFormId(allowed[0].form_id);
      })
      .catch(() => {
        if (!cancelled) { setTotalForms(0); setAllowedForms([]); }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [active, entity, permissionsReady, permissions, presetFormId]);

  // Editing an existing record — no gating here.
  if (!active) return <>{children(null)}</>;

  // A form is chosen (preset / auto-selected / picked) → open the create page.
  if (chosenFormId) return <>{children(chosenFormId)}</>;

  if (!permissionsReady || loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  // No forms configured for this entity at all → let the create page resolve its
  // own default form (keeps brand-new / unconfigured entities working).
  if (totalForms === 0) return <>{children(null)}</>;

  // Forms exist but none are granted to this role → blocked.
  if (allowedForms.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-3">
            <Lock size={20} className="text-red-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700">No form available</p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Your security role isn't allowed to use any form for this record type. Ask an administrator to grant form access in Security Roles.
          </p>
          <button
            onClick={onCancel}
            className="mt-4 px-4 py-2 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  // More than one allowed and not yet chosen → ask.
  return (
    <FormChooserModal
      forms={allowedForms}
      onSelect={setChosenFormId}
      onCancel={onCancel}
    />
  );
}
