import FilterSelect from '../../app/components/FilterSelect';
import { Plus, Trash2, X } from 'lucide-react';
import SearchableSelect from '../../app/components/SearchableSelect';
import type { WorkflowStep, WorkflowStepType, WorkflowStepConfig } from '../../types/workflow';
import type { FieldDefinition } from '../../types/field';
import { STEP_META, STEP_ICONS_MAP } from './stepIconsMap';

let ctr = 0;
const uid = () => `i_${Date.now()}_${ctr++}`;

interface StepConfigPanelProps {
  step: WorkflowStep;
  fields: FieldDefinition[];
  onUpdate: (step: WorkflowStep) => void;
  onClose: () => void;
}

export default function StepConfigPanel({ step, fields, onUpdate, onClose }: StepConfigPanelProps) {
  const meta = STEP_META[step.step_type];
  const setConfig = (cfg: WorkflowStepConfig) => onUpdate({ ...step, config_json: cfg });
  const cfg = step.config_json as Record<string, unknown>;

  return (
    <div className="w-80 bg-white border-l border-slate-200 flex flex-col h-full overflow-hidden shadow-md">
      <div className={`px-4 py-3.5 border-b border-slate-100 flex items-center gap-3 ${meta.bg}`}>
        <div className={`p-1.5 rounded-lg bg-white/60 ${meta.color}`}>
          {STEP_ICONS_MAP[step.step_type]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-800">{meta.label}</p>
          <p className="text-[10px] text-slate-500 truncate">{meta.desc}</p>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
          <X size={14} />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-slate-100 space-y-2.5">
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Step Name
          </label>
          <input
            type="text"
            value={step.label || step.name}
            onChange={(e) => onUpdate({ ...step, label: e.target.value, name: e.target.value })}
            className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Description (optional)
          </label>
          <input
            type="text"
            value={step.description ?? ''}
            onChange={(e) => onUpdate({ ...step, description: e.target.value })}
            placeholder="Briefly describe what this step does..."
            className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Step Type
          </label>
          <div className="relative">
            <FilterSelect
              value={step.step_type}
              onChange={(e) => onUpdate({
                ...step,
                step_type: e.target.value as WorkflowStepType,
                config_json: {},
              })}
              className="w-full appearance-none text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400 pr-7"
            >
              {(Object.keys(STEP_META) as WorkflowStepType[]).map((t) => (
                <option key={t} value={t}>{STEP_META[t].label}</option>
              ))}
            </FilterSelect>
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Configuration</p>
        {step.step_type === 'update_record' && (
          <UpdateRecordForm config={cfg} fields={fields} onChange={setConfig} />
        )}
        {step.step_type === 'assign_record' && (
          <AssignRecordForm config={cfg} onChange={setConfig} />
        )}
        {step.step_type === 'send_notification' && (
          <SendNotificationForm config={cfg} onChange={setConfig} />
        )}
        {step.step_type === 'create_record' && (
          <CreateRecordForm config={cfg} fields={fields} onChange={setConfig} />
        )}
        {step.step_type === 'condition' && (
          <ConditionForm config={cfg} fields={fields} onChange={setConfig} />
        )}
        {step.step_type === 'wait' && (
          <WaitForm config={cfg} onChange={setConfig} />
        )}
        {step.step_type === 'webhook' && (
          <WebhookForm config={cfg} onChange={setConfig} />
        )}
      </div>
    </div>
  );
}

function UpdateRecordForm({
  config,
  fields,
  onChange,
}: {
  config: Record<string, unknown>;
  fields: FieldDefinition[];
  onChange: (c: WorkflowStepConfig) => void;
}) {
  type FieldUpdate = { id: string; field_logical_name: string; field_display_name: string; value_type: string; value: string };
  const updates: FieldUpdate[] = (config.field_updates as FieldUpdate[]) ?? [];

  const add = () =>
    onChange({
      ...config,
      field_updates: [...updates, { id: uid(), field_logical_name: fields[0]?.logical_name ?? '', field_display_name: fields[0]?.display_name ?? '', value_type: 'static', value: '' }],
    });

  const remove = (id: string) =>
    onChange({ ...config, field_updates: updates.filter((u) => u.id !== id) });

  const set = (id: string, patch: Partial<FieldUpdate>) =>
    onChange({ ...config, field_updates: updates.map((u) => u.id === id ? { ...u, ...patch } : u) });

  return (
    <div className="space-y-2">
      {updates.map((u) => (
        <div key={u.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <FieldSelect fields={fields} value={u.field_logical_name} onChange={(ln, dn) => set(u.id, { field_logical_name: ln, field_display_name: dn })} />
            <button onClick={() => remove(u.id)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 size={11} /></button>
          </div>
          <div className="flex gap-1.5">
            <FilterSelect value={u.value_type} onChange={(e) => set(u.id, { value_type: e.target.value })} className="text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none w-24">
              <option value="static">Static</option>
              <option value="field_ref">From Field</option>
              <option value="formula">Formula</option>
            </FilterSelect>
            <input type="text" value={u.value} onChange={(e) => set(u.id, { value: e.target.value })} placeholder="Value..." className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300" />
          </div>
        </div>
      ))}
      <AddButton label="Add Field Update" onClick={add} />
    </div>
  );
}

function AssignRecordForm({ config, onChange }: { config: Record<string, unknown>; onChange: (c: WorkflowStepConfig) => void }) {
  const assignTo = (config.assign_to as string) ?? 'owner';
  return (
    <div className="space-y-3">
      <SelectField label="Assign To" value={assignTo} onChange={(v) => onChange({ ...config, assign_to: v })}>
        <option value="owner">Record Owner (self-assign)</option>
        <option value="user">Specific User</option>
        <option value="team">Specific Team</option>
        <option value="field_value">Value from Field</option>
      </SelectField>
      {assignTo === 'user' && (
        <TextField label="User ID" value={(config.user_id as string) ?? ''} onChange={(v) => onChange({ ...config, user_id: v })} placeholder="User ID or email..." />
      )}
      {assignTo === 'team' && (
        <TextField label="Team ID" value={(config.team_id as string) ?? ''} onChange={(v) => onChange({ ...config, team_id: v })} placeholder="Team ID..." />
      )}
      {assignTo === 'field_value' && (
        <TextField label="Field Reference" value={(config.field_ref as string) ?? ''} onChange={(v) => onChange({ ...config, field_ref: v })} placeholder="logical_name of lookup field..." />
      )}
    </div>
  );
}

function SendNotificationForm({ config, onChange }: { config: Record<string, unknown>; onChange: (c: WorkflowStepConfig) => void }) {
  type Recipient = { id: string; type: string; label: string };
  const recipients: Recipient[] = (config.recipients as Recipient[]) ?? [];
  const channel = (config.channel as string) ?? 'in_app';

  const addRecipient = () =>
    onChange({ ...config, recipients: [...recipients, { id: uid(), type: 'owner', label: 'Record Owner' }] });

  const removeRecipient = (id: string) =>
    onChange({ ...config, recipients: recipients.filter((r) => r.id !== id) });

  const RECIPIENT_TYPES = [
    { value: 'owner', label: 'Record Owner' },
    { value: 'creator', label: 'Record Creator' },
    { value: 'specific_user', label: 'Specific User' },
    { value: 'field_ref', label: 'From Field' },
  ];

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Channel</label>
        <div className="flex rounded-xl overflow-hidden border border-slate-200">
          {(['in_app', 'email'] as const).map((c) => (
            <button key={c} onClick={() => onChange({ ...config, channel: c })} className={`flex-1 py-2 text-xs font-semibold transition-colors ${channel === c ? 'bg-blue-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
              {c === 'in_app' ? 'In-App' : 'Email'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Recipients</label>
        <div className="space-y-1.5">
          {recipients.map((r) => (
            <div key={r.id} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
              <FilterSelect value={r.type} onChange={(e) => {
                const t = RECIPIENT_TYPES.find((x) => x.value === e.target.value);
                onChange({ ...config, recipients: recipients.map((x) => x.id === r.id ? { ...x, type: e.target.value, label: t?.label ?? e.target.value } : x) });
              }} className="flex-1 text-[10px] bg-transparent border-0 focus:outline-none">
                {RECIPIENT_TYPES.map((rt) => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
              </FilterSelect>
              <button onClick={() => removeRecipient(r.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={11} /></button>
            </div>
          ))}
        </div>
        <AddButton label="Add Recipient" onClick={addRecipient} />
      </div>

      {channel === 'email' && (
        <TextField label="Subject" value={(config.subject as string) ?? ''} onChange={(v) => onChange({ ...config, subject: v })} placeholder="Email subject..." />
      )}

      <div>
        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Message Body</label>
        <textarea
          value={(config.body as string) ?? ''}
          onChange={(e) => onChange({ ...config, body: e.target.value })}
          placeholder="Use {{field_name}} for dynamic values..."
          rows={4}
          className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300 resize-none"
        />
      </div>
    </div>
  );
}

function CreateRecordForm({ config, fields, onChange }: { config: Record<string, unknown>; fields: FieldDefinition[]; onChange: (c: WorkflowStepConfig) => void }) {
  type Mapping = { id: string; target_field: string; target_field_display_name: string; source_type: string; source_value: string };
  const mappings: Mapping[] = (config.field_mappings as Mapping[]) ?? [];

  const addMapping = () =>
    onChange({ ...config, field_mappings: [...mappings, { id: uid(), target_field: '', target_field_display_name: '', source_type: 'static', source_value: '' }] });

  const removeMapping = (id: string) =>
    onChange({ ...config, field_mappings: mappings.filter((m) => m.id !== id) });

  const setMapping = (id: string, patch: Partial<Mapping>) =>
    onChange({ ...config, field_mappings: mappings.map((m) => m.id === id ? { ...m, ...patch } : m) });

  return (
    <div className="space-y-3">
      <TextField label="Target Entity (logical name)" value={(config.target_entity_logical_name as string) ?? ''} onChange={(v) => onChange({ ...config, target_entity_logical_name: v })} placeholder="e.g. task, follow_up" />
      <div>
        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Field Mappings</label>
        <div className="space-y-1.5">
          {mappings.map((m) => (
            <div key={m.id} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input type="text" value={m.target_field} onChange={(e) => setMapping(m.id, { target_field: e.target.value })} placeholder="Target field..." className="flex-1 text-[10px] border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none" />
                <button onClick={() => removeMapping(m.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={11} /></button>
              </div>
              <div className="flex gap-1.5">
                <FilterSelect value={m.source_type} onChange={(e) => setMapping(m.id, { source_type: e.target.value })} className="text-[10px] border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none w-24">
                  <option value="static">Static</option>
                  <option value="field_ref">From Field</option>
                  <option value="current_user">Current User</option>
                </FilterSelect>
                {m.source_type !== 'current_user' && (
                  m.source_type === 'field_ref' ? (
                    <FieldSelect fields={fields} value={m.source_value} onChange={(ln) => setMapping(m.id, { source_value: ln })} />
                  ) : (
                    <input type="text" value={m.source_value} onChange={(e) => setMapping(m.id, { source_value: e.target.value })} placeholder="Value..." className="flex-1 text-[10px] border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none placeholder:text-slate-300" />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
        <AddButton label="Add Mapping" onClick={addMapping} />
      </div>
    </div>
  );
}

function ConditionForm({ config, fields, onChange }: { config: Record<string, unknown>; fields: FieldDefinition[]; onChange: (c: WorkflowStepConfig) => void }) {
  type Cond = { id: string; field: string; operator: string; value: string };
  const conditions: Cond[] = (config.conditions as Cond[]) ?? [];

  const add = () =>
    onChange({ ...config, conditions: [...conditions, { id: uid(), field: fields[0]?.logical_name ?? '', operator: 'eq', value: '' }] });

  const remove = (id: string) =>
    onChange({ ...config, conditions: conditions.filter((c) => c.id !== id) });

  const set = (id: string, patch: Partial<Cond>) =>
    onChange({ ...config, conditions: conditions.map((c) => c.id === id ? { ...c, ...patch } : c) });

  const OPERATORS = ['eq', 'neq', 'contains', 'gt', 'lt', 'is_null', 'is_not_null'];

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-slate-400">If ALL conditions are true, the TRUE path is followed.</p>
      {conditions.map((c) => (
        <div key={c.id} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <FieldSelect fields={fields} value={c.field} onChange={(ln) => set(c.id, { field: ln })} />
            <button onClick={() => remove(c.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={11} /></button>
          </div>
          <div className="flex gap-1.5">
            <FilterSelect value={c.operator} onChange={(e) => set(c.id, { operator: e.target.value })} className="text-[10px] border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none">
              {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
            </FilterSelect>
            {!['is_null', 'is_not_null'].includes(c.operator) && (
              <input type="text" value={c.value} onChange={(e) => set(c.id, { value: e.target.value })} placeholder="Value..." className="flex-1 text-[10px] border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none placeholder:text-slate-300" />
            )}
          </div>
        </div>
      ))}
      <AddButton label="Add Condition" onClick={add} />
    </div>
  );
}

function WaitForm({ config, onChange }: { config: Record<string, unknown>; onChange: (c: WorkflowStepConfig) => void }) {
  const waitType = (config.wait_type as string) ?? 'duration';
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Wait Type</label>
        <div className="flex rounded-xl overflow-hidden border border-slate-200">
          {(['duration', 'until_field'] as const).map((t) => (
            <button key={t} onClick={() => onChange({ ...config, wait_type: t })} className={`flex-1 py-2 text-xs font-semibold transition-colors ${waitType === t ? 'bg-blue-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
              {t === 'duration' ? 'Duration' : 'Until Field Date'}
            </button>
          ))}
        </div>
      </div>
      {waitType === 'duration' && (
        <div className="flex gap-2">
          <input type="number" min={1} value={(config.duration_value as number) ?? 1} onChange={(e) => onChange({ ...config, duration_value: parseInt(e.target.value) || 1 })} className="w-20 text-xs border border-slate-200 rounded-lg px-2 py-2 bg-slate-50 focus:outline-none" />
          <FilterSelect value={(config.duration_unit as string) ?? 'hours'} onChange={(e) => onChange({ ...config, duration_unit: e.target.value })} className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-2 bg-slate-50 focus:outline-none">
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </FilterSelect>
        </div>
      )}
      {waitType === 'until_field' && (
        <TextField label="Date Field (logical name)" value={(config.field_ref as string) ?? ''} onChange={(v) => onChange({ ...config, field_ref: v })} placeholder="e.g. follow_up_date" />
      )}
    </div>
  );
}

function WebhookForm({ config, onChange }: { config: Record<string, unknown>; onChange: (c: WorkflowStepConfig) => void }) {
  type Header = { id: string; key: string; value: string };
  const headers: Header[] = (config.headers as Header[]) ?? [];

  const addHeader = () => onChange({ ...config, headers: [...headers, { id: uid(), key: '', value: '' }] });
  const removeHeader = (id: string) => onChange({ ...config, headers: headers.filter((h) => h.id !== id) });
  const setHeader = (id: string, patch: Partial<Header>) => onChange({ ...config, headers: headers.map((h) => h.id === id ? { ...h, ...patch } : h) });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <SelectField label="Method" value={(config.method as string) ?? 'POST'} onChange={(v) => onChange({ ...config, method: v })}>
          {['GET', 'POST', 'PUT', 'PATCH'].map((m) => <option key={m} value={m}>{m}</option>)}
        </SelectField>
      </div>
      <TextField label="URL" value={(config.url as string) ?? ''} onChange={(v) => onChange({ ...config, url: v })} placeholder="https://..." />
      <div>
        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Headers</label>
        <div className="space-y-1.5">
          {headers.map((h) => (
            <div key={h.id} className="flex items-center gap-1.5">
              <input type="text" value={h.key} onChange={(e) => setHeader(h.id, { key: e.target.value })} placeholder="Key" className="w-24 text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 focus:outline-none" />
              <input type="text" value={h.value} onChange={(e) => setHeader(h.id, { value: e.target.value })} placeholder="Value" className="flex-1 text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 focus:outline-none" />
              <button onClick={() => removeHeader(h.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={11} /></button>
            </div>
          ))}
        </div>
        <AddButton label="Add Header" onClick={addHeader} />
      </div>
      <div>
        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Body Template (JSON)</label>
        <textarea value={(config.body_template as string) ?? ''} onChange={(e) => onChange({ ...config, body_template: e.target.value })} rows={4} placeholder='{"record_id": "{{id}}", "status": "{{status}}"}' className="w-full text-xs font-mono border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300 resize-none" />
      </div>
    </div>
  );
}

function FieldSelect({ fields, value, onChange }: { fields: FieldDefinition[]; value: string; onChange: (ln: string, dn?: string) => void }) {
  return (
    <SearchableSelect
      options={fields.map((f) => ({ value: f.logical_name, label: f.display_name }))}
      value={value}
      onChange={(v) => { const f = fields.find((x) => x.logical_name === v); onChange(v, f?.display_name); }}
      placeholder="Select field…"
      className="flex-1"
      heightClass="h-8"
    />
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-300" />
    </div>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="flex-1">
      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</label>
      <div className="relative">
        <FilterSelect value={value} onChange={(e) => onChange(e.target.value)} className="w-full appearance-none text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400 pr-7">
          {children}
        </FilterSelect>
        </div>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 text-[10px] font-medium border-2 border-dashed border-slate-300 rounded-xl text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
      <Plus size={11} /> {label}
    </button>
  );
}
