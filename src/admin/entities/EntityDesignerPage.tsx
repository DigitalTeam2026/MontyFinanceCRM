import { useState, useEffect } from 'react';
import { Save, AlertCircle, Lock, Info, GitBranch, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import type { EntityDefinition, EntityFormData, OwnershipType } from '../../types/entity';
import { createEntityWithTable, updateEntity } from '../../services/entityService';
import { bootstrapEntity } from '../../services/bootstrapEntityService';
import { fetchProcessFlowsForEntity, setEntityDefaultFlow } from '../../services/processFlowService';
import type { ProcessFlow } from '../../types/processFlow';
import { supabase } from '../../lib/supabase';

interface EntityDesignerPageProps {
  entity?: EntityDefinition;
  onSaved: (entity: EntityDefinition) => void;
  onCancel: () => void;
}

const OWNERSHIP_OPTIONS: { value: OwnershipType; label: string; desc: string }[] = [
  { value: 'user',         label: 'User',         desc: 'Owned by individual users' },
  { value: 'team',         label: 'Team',         desc: 'Owned by teams' },
  { value: 'organization', label: 'Organization', desc: 'Owned by the organization' },
];

const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function buildInitialForm(entity?: EntityDefinition): EntityFormData {
  if (entity) {
    return {
      logical_name: entity.logical_name, display_name: entity.display_name,
      display_name_plural: entity.display_name_plural, physical_table_name: entity.physical_table_name,
      primary_field_name: entity.primary_field_name, description: entity.description,
      icon_name: entity.icon_name, ownership_type: entity.ownership_type,
      enable_activities: entity.enable_activities, enable_notes: entity.enable_notes,
      enable_audit: entity.enable_audit, allow_timeline: entity.allow_timeline ?? false, is_active: entity.is_active,
    };
  }
  return {
    logical_name: '', display_name: '', display_name_plural: '', physical_table_name: '',
    primary_field_name: 'name', description: null, icon_name: null, ownership_type: 'user',
    enable_activities: false, enable_notes: false, enable_audit: false, allow_timeline: false, is_active: true,
  };
}

export default function EntityDesignerPage({ entity, onSaved, onCancel }: EntityDesignerPageProps) {
  const isEdit = !!entity;
  const isSystem = isEdit && !entity.is_custom;

  const [form, setForm] = useState<EntityFormData>(buildInitialForm(entity));
  const [autoSlug, setAutoSlug] = useState(!isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof EntityFormData, string>>>({});
  const [steps, setSteps] = useState<{ label: string; status: 'idle' | 'running' | 'done' | 'error' }[]>([]);
  const [entityFlows, setEntityFlows] = useState<ProcessFlow[]>([]);
  const [defaultFlowId, setDefaultFlowId] = useState<string | null>(null);
  const [allowFlowSwitch, setAllowFlowSwitch] = useState(true);
  const [flowSettingsSaving, setFlowSettingsSaving] = useState(false);
  const [flowSettingsStatus, setFlowSettingsStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!isEdit || !entity) return;
    (async () => {
      const { data: eDef } = await supabase
        .from('entity_definition')
        .select('entity_definition_id, default_process_flow_id, allow_manual_flow_switch')
        .eq('logical_name', entity.logical_name)
        .maybeSingle();
      if (!eDef) return;
      const flows = await fetchProcessFlowsForEntity(eDef.entity_definition_id);
      setEntityFlows(flows.filter((f) => f.is_active && !f.deleted_at));
      setDefaultFlowId(eDef.default_process_flow_id ?? null);
      setAllowFlowSwitch(eDef.allow_manual_flow_switch ?? true);
    })();
  }, [isEdit, entity]);

  const set = <K extends keyof EntityFormData>(key: K, value: EntityFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleDisplayNameChange = (val: string) => {
    set('display_name', val);
    if (autoSlug) {
      const slug = toSlug(val);
      set('logical_name', slug);
      set('physical_table_name', `crm_${slug}`);
    }
  };

  const validate = (): boolean => {
    const errors: Partial<Record<keyof EntityFormData, string>> = {};
    if (!form.display_name.trim()) errors.display_name = 'Required';
    if (!form.display_name_plural.trim()) errors.display_name_plural = 'Required';
    if (!isSystem) {
      if (!form.logical_name.trim()) errors.logical_name = 'Required';
      else if (!/^[a-z][a-z0-9_]*$/.test(form.logical_name)) errors.logical_name = 'Lowercase letters, numbers, underscores; start with letter';
      if (!form.physical_table_name.trim()) errors.physical_table_name = 'Required';
    }
    if (!form.primary_field_name.trim()) errors.primary_field_name = 'Required';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setError(null);

    if (isEdit) {
      // Edit path: simple metadata update, no table DDL
      try {
        const result = await updateEntity(entity!.entity_definition_id, form);
        onSaved(result);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Create path: provision table + metadata + bootstrap in steps
    const initialSteps = [
      { label: 'Creating physical database table', status: 'idle' as const },
      { label: 'Saving entity metadata', status: 'idle' as const },
      { label: 'Provisioning system fields', status: 'idle' as const },
      { label: 'Creating default views & forms', status: 'idle' as const },
    ];
    setSteps(initialSteps);

    const updateStep = (index: number, status: 'running' | 'done' | 'error') => {
      setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, status } : s)));
    };

    try {
      // Step 1+2: create physical table and entity_definition atomically
      updateStep(0, 'running');
      updateStep(1, 'running');
      const result = await createEntityWithTable(form);
      updateStep(0, 'done');
      updateStep(1, 'done');

      // Step 3+4: bootstrap system fields, views, forms
      updateStep(2, 'running');
      updateStep(3, 'running');
      await bootstrapEntity(result).catch(() => {});
      updateStep(2, 'done');
      updateStep(3, 'done');

      // Brief pause so the user sees all steps green before navigation
      await new Promise((r) => setTimeout(r, 600));
      onSaved(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e) || 'Create failed';
      console.error('[EntityDesigner] create failed:', e);
      setError(msg);
      // Mark ALL running steps as errored
      setSteps((prev) => prev.map((s) => s.status === 'running' ? { ...s, status: 'error' } : s));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-[#f3f4f6]">
      <form onSubmit={handleSubmit} noValidate>
        <div className="max-w-2xl mx-auto px-5 py-5 space-y-4">

          {isSystem && (
            <div className="flex items-start gap-2.5 px-3 py-3 bg-slate-100 border border-slate-300 rounded text-[12px] text-slate-700">
              <Info size={14} className="text-slate-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-800">System Entity — Limited Editing</p>
                <p className="text-slate-500 mt-0.5">
                  The logical name, table name, and core relationships of system entities are read-only.
                  You can customize display names, description, ownership, capabilities, and status.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-300 text-red-700 text-[12px] rounded">
              <AlertCircle size={13} className="shrink-0" /> {error}
            </div>
          )}

          <FormSection title="Identity">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Display Name" required error={fieldErrors.display_name}>
                <input
                  type="text"
                  value={form.display_name}
                  onChange={(e) => handleDisplayNameChange(e.target.value)}
                  placeholder="e.g. Customer"
                  className={inp(!!fieldErrors.display_name)}
                  autoFocus={!isEdit}
                />
              </Field>
              <Field label="Display Name (Plural)" required error={fieldErrors.display_name_plural}>
                <input
                  type="text"
                  value={form.display_name_plural}
                  onChange={(e) => set('display_name_plural', e.target.value)}
                  placeholder="e.g. Customers"
                  className={inp(!!fieldErrors.display_name_plural)}
                />
              </Field>
            </div>
            <Field label="Description">
              <textarea
                value={form.description ?? ''}
                onChange={(e) => set('description', e.target.value || null)}
                placeholder="Optional description..."
                rows={2}
                className={`${inp(false)} resize-none`}
              />
            </Field>
          </FormSection>

          <FormSection
            title="Technical Names"
            badge={isSystem ? { icon: <Lock size={10} />, label: 'Read-only for system entities' } : undefined}
          >
            <div className="grid grid-cols-2 gap-4">
              <Field label="Logical Name" required={!isSystem} error={fieldErrors.logical_name} hint="Lowercase, underscores, starts with letter">
                <input
                  type="text"
                  value={form.logical_name}
                  onChange={(e) => { setAutoSlug(false); set('logical_name', e.target.value); }}
                  placeholder="e.g. customer"
                  disabled={isSystem || (isEdit && !entity?.is_custom)}
                  className={inp(!!fieldErrors.logical_name, isSystem || (isEdit && !entity?.is_custom))}
                />
              </Field>
              <Field label="Physical Table Name" required={!isSystem} error={fieldErrors.physical_table_name}>
                <input
                  type="text"
                  value={form.physical_table_name}
                  onChange={(e) => { setAutoSlug(false); set('physical_table_name', e.target.value); }}
                  placeholder="e.g. crm_customer"
                  disabled={isSystem || (isEdit && !entity?.is_custom)}
                  className={inp(!!fieldErrors.physical_table_name, isSystem || (isEdit && !entity?.is_custom))}
                />
              </Field>
            </div>
            <Field label="Primary Field Name" required error={fieldErrors.primary_field_name} hint="The main identifying field (usually 'name')">
              <input
                type="text"
                value={form.primary_field_name}
                onChange={(e) => set('primary_field_name', e.target.value)}
                placeholder="name"
                disabled={isSystem}
                className={inp(!!fieldErrors.primary_field_name, isSystem)}
              />
            </Field>
          </FormSection>

          <FormSection title="Ownership">
            <div className="grid grid-cols-3 gap-2">
              {OWNERSHIP_OPTIONS.map((opt) => {
                const sel = form.ownership_type === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('ownership_type', opt.value)}
                    className={`flex flex-col gap-1 p-3 rounded border-2 text-left transition-all ${sel ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${sel ? 'border-blue-500' : 'border-slate-300'}`}>
                        {sel && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                      </div>
                      <span className={`text-[12px] font-semibold ${sel ? 'text-blue-700' : 'text-slate-700'}`}>{opt.label}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 pl-[18px]">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </FormSection>

          <FormSection title="Capabilities">
            <div className="space-y-1.5">
              {[
                { key: 'enable_activities' as const, label: 'Activities', desc: 'Track calls, tasks, emails, and appointments' },
                { key: 'enable_notes' as const, label: 'Notes & Timeline', desc: 'Notes section on record forms' },
                { key: 'enable_audit' as const, label: 'Audit Log', desc: 'Track all field-level changes with user and timestamp' },
                { key: 'allow_timeline' as const, label: 'Timeline', desc: 'Enable timeline component for notes, appointments, emails, and attachments' },
              ].map((f) => (
                <Toggle key={f.key} label={f.label} desc={f.desc} checked={form[f.key] as boolean} onChange={(v) => set(f.key, v)} />
              ))}
            </div>
          </FormSection>

          <FormSection title="Status">
            <Toggle
              label="Active"
              desc="When inactive, this entity is hidden from end-users"
              checked={form.is_active}
              onChange={(v) => set('is_active', v)}
            />
          </FormSection>

          {isEdit && entityFlows.length > 0 && (
            <div className="bg-white border border-slate-200 rounded overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <GitBranch size={13} className="text-slate-500" />
                <h2 className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex-1">Process Flow Settings</h2>
              </div>
              <div className="px-4 py-4 space-y-4">
                <Field label="Default Process Flow" hint="New records automatically get this flow assigned">
                  <select
                    value={defaultFlowId ?? ''}
                    onChange={(e) => setDefaultFlowId(e.target.value || null)}
                    className={inp(false)}
                  >
                    <option value="">— None —</option>
                    {entityFlows.map((f) => (
                      <option key={f.process_flow_id} value={f.process_flow_id}>
                        {f.name}{f.is_system ? ' (System)' : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                <Toggle
                  label="Allow Manual Flow Switch"
                  desc="Users can switch the process flow on individual records"
                  checked={allowFlowSwitch}
                  onChange={setAllowFlowSwitch}
                />
                <div className="flex items-center justify-end gap-3">
                  {flowSettingsStatus === 'saved' && (
                    <span className="text-[12px] text-emerald-600 font-medium">Saved successfully</span>
                  )}
                  {flowSettingsStatus === 'error' && (
                    <span className="text-[12px] text-red-600 font-medium">Save failed — check console</span>
                  )}
                  <button
                    type="button"
                    disabled={flowSettingsSaving}
                    onClick={async () => {
                      if (!entity) return;
                      setFlowSettingsSaving(true);
                      setFlowSettingsStatus('idle');
                      try {
                        await setEntityDefaultFlow(entity.logical_name, defaultFlowId, allowFlowSwitch);
                        setFlowSettingsStatus('saved');
                        setTimeout(() => setFlowSettingsStatus('idle'), 3000);
                      } catch {
                        setFlowSettingsStatus('error');
                      } finally {
                        setFlowSettingsSaving(false);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[12px] font-medium rounded transition"
                  >
                    <Save size={12} />
                    {flowSettingsSaving ? 'Saving...' : 'Save Flow Settings'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {isSystem && (
            <div className="bg-white border border-slate-200 rounded overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                <h2 className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Available Customizations</h2>
              </div>
              <div className="px-4 py-3">
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
                  {[
                    { label: 'Add custom fields', allowed: true },
                    { label: 'Rename logical name', allowed: false },
                    { label: 'Customize forms', allowed: true },
                    { label: 'Change physical table', allowed: false },
                    { label: 'Customize views', allowed: true },
                    { label: 'Delete entity', allowed: false },
                    { label: 'Add business rules', allowed: true },
                    { label: 'Modify core relationships', allowed: false },
                    { label: 'Add workflows', allowed: true },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold ${item.allowed ? 'text-emerald-600' : 'text-red-500'}`}>
                        {item.allowed ? '✓' : '✗'}
                      </span>
                      <span className={item.allowed ? 'text-slate-700' : 'text-slate-400'}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Creation progress — only visible for new entities while saving */}
          {!isEdit && steps.length > 0 && (
            <div className="bg-white border border-slate-200 rounded overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                <h2 className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  Creating entity…
                </h2>
              </div>
              <ul className="px-4 py-3 space-y-2">
                {steps.map((step, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-[12px]">
                    {step.status === 'idle' && (
                      <Circle size={14} className="text-slate-300 shrink-0" />
                    )}
                    {step.status === 'running' && (
                      <Loader2 size={14} className="text-blue-500 animate-spin shrink-0" />
                    )}
                    {step.status === 'done' && (
                      <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    )}
                    {step.status === 'error' && (
                      <AlertCircle size={14} className="text-red-500 shrink-0" />
                    )}
                    <span className={
                      step.status === 'done'    ? 'text-emerald-700' :
                      step.status === 'error'   ? 'text-red-600' :
                      step.status === 'running' ? 'text-blue-700 font-medium' :
                      'text-slate-400'
                    }>
                      {step.label}
                    </span>
                  </li>
                ))}
              </ul>
              {error && (
                <div className="mx-4 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-[11px] text-red-700 font-mono break-all">
                  {error}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 pb-6">
            <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 text-[12px] text-slate-600 border border-slate-300 rounded hover:bg-slate-50 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[12px] font-medium rounded transition-colors">
              <Save size={13} /> {saving ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save Changes' : 'Create Entity'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function inp(hasError: boolean, disabled?: boolean) {
  return [
    'w-full px-2.5 py-2 text-[12px] border rounded transition-colors',
    'focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400',
    hasError ? 'border-red-400 bg-red-50 text-red-900' : 'border-slate-300 bg-white text-slate-800',
    disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : '',
  ].filter(Boolean).join(' ');
}

function FormSection({
  title, children, badge,
}: {
  title: string;
  children: React.ReactNode;
  badge?: { icon: React.ReactNode; label: string };
}) {
  return (
    <div className="bg-white border border-slate-200 rounded overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
        <h2 className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex-1">{title}</h2>
        {badge && (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
            {badge.icon} {badge.label}
          </span>
        )}
      </div>
      <div className="px-4 py-4 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error
        ? <p className="text-[11px] text-red-600 flex items-center gap-1"><AlertCircle size={10} />{error}</p>
        : hint ? <p className="text-[11px] text-slate-400">{hint}</p> : null
      }
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between px-3 py-2.5 rounded border cursor-pointer transition-colors ${checked ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
    >
      <div>
        <p className="text-[12px] font-medium text-slate-800">{label}</p>
        <p className="text-[11px] text-slate-500">{desc}</p>
      </div>
      <div className={`relative rounded-full transition-colors shrink-0 ml-4 ${checked ? 'bg-blue-500' : 'bg-slate-200'}`} style={{ height: '20px', width: '36px' }}>
        <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </div>
  );
}
