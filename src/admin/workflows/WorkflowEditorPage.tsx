import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Save,
  RefreshCw,
  Zap,
  Settings,
  CheckCircle2,
  PlayCircle,
  PauseCircle,
  Database,
  X,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type { WorkflowDefinition, WorkflowStep, WorkflowTriggerType, WorkflowTriggerConditions } from '../../types/workflow';
import { TRIGGER_META } from '../../types/workflow';
import type { FieldDefinition } from '../../types/field';
import type { EntityDefinition } from '../../types/entity';
import { fetchFieldsForEntity } from '../../services/fieldService';
import { fetchEntities } from '../../services/entityService';
import { fetchStepsForWorkflow, saveWorkflow, saveAllSteps } from '../../services/workflowService';
import FilterSelect from '../../app/components/FilterSelect';
import FlowCanvas from './FlowCanvas';
import WorkflowFilterConditions from './WorkflowFilterConditions';

type Tab = 'trigger' | 'flow' | 'settings';

interface WorkflowEditorPageProps {
  workflow: WorkflowDefinition;
  onBack: () => void;
  onWorkflowUpdate: (w: WorkflowDefinition) => void;
}

export default function WorkflowEditorPage({ workflow: initWf, onBack, onWorkflowUpdate }: WorkflowEditorPageProps) {
  const { showSuccess, showError } = useToast();
  const [wf, setWf] = useState<WorkflowDefinition>(initWf);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('flow');

  useEffect(() => {
    Promise.all([
      fetchFieldsForEntity(wf.entity_definition_id),
      fetchStepsForWorkflow(wf.workflow_id),
      fetchEntities().catch(() => [] as EntityDefinition[]),
    ])
      .then(([f, s, ents]) => {
        setFields(f);
        setSteps(s);
        setEntities(ents);
      })
      .catch((e) => showError(e.message))
      .finally(() => setLoading(false));
  }, [wf.workflow_id, wf.entity_definition_id]);

  const mark = () => setDirty(true);
  const entity = entities.find((e) => e.entity_definition_id === wf.entity_definition_id) ?? null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const [updated] = await Promise.all([
        saveWorkflow(wf.workflow_id, {
          name: wf.name,
          description: wf.description,
          entity_definition_id: wf.entity_definition_id,
          trigger_type: wf.trigger_type,
          trigger_conditions: wf.trigger_conditions,
          is_active: wf.is_active,
        }),
        saveAllSteps(wf.workflow_id, cleanSteps(steps)),
      ]);
      setWf(updated);
      onWorkflowUpdate(updated);
      setDirty(false);
      showSuccess('Workflow saved');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'trigger',  label: 'Trigger',  icon: <Zap size={13} /> },
    { id: 'flow',     label: 'Flow',     icon: <PlayCircle size={13} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={13} /> },
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50">
      <div className="h-12 bg-white border-b border-slate-200 px-4 flex items-center gap-3 shrink-0 shadow-sm">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft size={13} /> Workflows
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2">
          <Zap size={13} className="text-blue-500" />
          <input
            type="text"
            value={wf.name}
            onChange={(e) => { setWf((w) => ({ ...w, name: e.target.value })); mark(); }}
            className="text-sm font-semibold text-slate-800 border-0 bg-transparent focus:outline-none min-w-0"
          />
        </div>
        <div className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${wf.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
          <CheckCircle2 size={10} />
          {wf.is_active ? 'Active' : 'Draft'}
        </div>
        <div
          className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${entity ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'}`}
          title={entity ? `This workflow runs on the ${entity.display_name} table` : 'No table is bound to this workflow'}
        >
          <Database size={10} />
          {entity ? entity.display_name : 'No table bound'}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {dirty && <span className="text-[10px] text-amber-500">Unsaved changes</span>}
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 transition-colors"
          >
            <Save size={12} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-0.5 px-4 bg-white border-b border-slate-200 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5 py-1.5">
          <span className="text-[10px] text-slate-400">{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'trigger' && (
          <div className="h-full overflow-y-auto p-6 max-w-lg mx-auto w-full">
            <TriggerPanel wf={wf} fields={fields} entities={entities} onChange={(w) => { setWf(w); mark(); }} />
          </div>
        )}
        {activeTab === 'flow' && (
          <FlowCanvas
            steps={steps}
            workflowId={wf.workflow_id}
            fields={fields}
            entities={entities}
            onStepsChange={(s) => { setSteps(s); mark(); }}
          />
        )}
        {activeTab === 'settings' && (
          <div className="h-full overflow-y-auto p-6 max-w-lg mx-auto w-full">
            <SettingsPanel wf={wf} onChange={(w) => { setWf(w); mark(); }} />
          </div>
        )}
      </div>
    </div>
  );
}

function TriggerPanel({
  wf,
  fields,
  entities,
  onChange,
}: {
  wf: WorkflowDefinition;
  fields: FieldDefinition[];
  entities: EntityDefinition[];
  onChange: (w: WorkflowDefinition) => void;
}) {
  const triggers = Object.entries(TRIGGER_META) as [WorkflowTriggerType, (typeof TRIGGER_META)[WorkflowTriggerType]][];
  const conds: WorkflowTriggerConditions = wf.trigger_conditions ?? {};
  const watchFields = conds.watch_fields ?? [];
  // Only fields not already watched are offered in the "add" picker.
  const availableFields = fields.filter((f) => !watchFields.includes(f.logical_name));

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-bold text-slate-600 mb-2">Which table?</label>
        <FilterSelect
          value={wf.entity_definition_id}
          forceSearch
          onChange={(e) => {
            const newId = e.target.value;
            if (newId === wf.entity_definition_id) return;
            // Switching tables invalidates field-scoped settings; clear watch fields
            // (steps that reference old fields are left for the user to review).
            onChange({ ...wf, entity_definition_id: newId, trigger_conditions: { ...conds, watch_fields: [] } });
          }}
          className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white"
        >
          {entities.map((ent) => (
            <option key={ent.entity_definition_id} value={ent.entity_definition_id}>{ent.display_name}</option>
          ))}
        </FilterSelect>
        <p className="text-[10px] text-slate-400 mt-1">The record events that fire this workflow come from this table.</p>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-600 mb-3">When should this workflow run?</p>
        <div className="space-y-2">
          {triggers.map(([type, meta]) => (
            <div
              key={type}
              onClick={() => onChange({ ...wf, trigger_type: type })}
              className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                wf.trigger_type === type
                  ? `${meta.color} ring-2 ring-offset-1 ring-blue-300`
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${wf.trigger_type === type ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                {wf.trigger_type === type && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800">{meta.label}</p>
                <p className="text-[10px] text-slate-400">{meta.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {wf.trigger_type === 'on_update' && (
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-2">Watch Fields <span className="font-normal text-slate-400">(leave empty = any field)</span></label>

          {watchFields.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {watchFields.map((logical) => {
                const f = fields.find((x) => x.logical_name === logical);
                return (
                  <span key={logical} className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-700 border border-blue-200 rounded-full pl-2.5 pr-1 py-0.5">
                    {f?.display_name ?? logical}
                    <button
                      type="button"
                      onClick={() => onChange({ ...wf, trigger_conditions: { ...conds, watch_fields: watchFields.filter((w) => w !== logical) } })}
                      className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-blue-200 text-blue-500"
                    >
                      <X size={9} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <FilterSelect
            value=""
            forceSearch
            placeholder={availableFields.length ? 'Add a field to watch…' : 'All fields added'}
            disabled={availableFields.length === 0}
            onChange={(e) => {
              const logical = e.target.value;
              if (!logical) return;
              onChange({ ...wf, trigger_conditions: { ...conds, watch_fields: [...watchFields, logical] } });
            }}
            className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white"
          >
            <option value="">Add a field to watch…</option>
            {availableFields.map((f) => (
              <option key={f.field_definition_id} value={f.logical_name}>{f.display_name}</option>
            ))}
          </FilterSelect>
          <p className="text-[10px] text-slate-400 mt-1">The workflow fires only when one of these fields changes. Leave empty to fire on any change.</p>
        </div>
      )}

      {wf.trigger_type === 'on_status_change' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">From Status</label>
            <input type="text" value={conds.status_from ?? ''} onChange={(e) => onChange({ ...wf, trigger_conditions: { ...conds, status_from: e.target.value } })} placeholder="Any status..." className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-300" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">To Status</label>
            <input type="text" value={conds.status_to ?? ''} onChange={(e) => onChange({ ...wf, trigger_conditions: { ...conds, status_to: e.target.value } })} placeholder="e.g. closed" className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-300" />
          </div>
        </div>
      )}

      {wf.trigger_type === 'scheduled' && (
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Cron Expression</label>
          <input type="text" value={conds.schedule_cron ?? ''} onChange={(e) => onChange({ ...wf, trigger_conditions: { ...conds, schedule_cron: e.target.value } })} placeholder="e.g. 0 9 * * 1 (every Monday 9am)" className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-300" />
          <p className="text-[10px] text-slate-400 mt-1">Uses UTC. Format: minute hour day-of-month month day-of-week</p>
        </div>
      )}

      {(wf.trigger_type === 'on_create' || wf.trigger_type === 'on_update' || wf.trigger_type === 'on_status_change') && (
        <WorkflowFilterConditions
          fields={fields}
          conditions={conds.filter_conditions ?? []}
          onChange={(filter_conditions) => onChange({ ...wf, trigger_conditions: { ...conds, filter_conditions } })}
        />
      )}
    </div>
  );
}

function SettingsPanel({ wf, onChange }: { wf: WorkflowDefinition; onChange: (w: WorkflowDefinition) => void }) {
  return (
    <div className="space-y-5 max-w-md">
      <div>
        <label className="block text-xs font-bold text-slate-600 mb-1.5">Description</label>
        <textarea
          value={wf.description ?? ''}
          onChange={(e) => onChange({ ...wf, description: e.target.value })}
          rows={3}
          placeholder="Describe what this workflow does..."
          className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-300 resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-600 mb-2">Status</label>
        <button
          onClick={() => onChange({ ...wf, is_active: !wf.is_active })}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
            wf.is_active ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'
          }`}
        >
          {wf.is_active ? (
            <PlayCircle size={18} className="text-emerald-600 shrink-0" />
          ) : (
            <PauseCircle size={18} className="text-slate-400 shrink-0" />
          )}
          <div className="text-left">
            <p className={`text-xs font-semibold ${wf.is_active ? 'text-emerald-700' : 'text-slate-600'}`}>
              {wf.is_active ? 'Active — will trigger automatically' : 'Draft — will not trigger'}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Click to {wf.is_active ? 'deactivate' : 'activate'}</p>
          </div>
          <div className={`ml-auto w-9 h-5 rounded-full transition-colors relative ${wf.is_active ? 'bg-emerald-500' : 'bg-slate-200'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${wf.is_active ? 'left-4' : 'left-0.5'}`} />
          </div>
        </button>
      </div>

      {wf.run_count > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Execution Stats</p>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Total runs</span>
            <span className="font-semibold text-slate-800">{wf.run_count.toLocaleString()}</span>
          </div>
          {wf.last_triggered_at && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Last run</span>
              <span className="font-semibold text-slate-800">
                {new Date(wf.last_triggered_at).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function cleanSteps(steps: WorkflowStep[]): WorkflowStep[] {
  return steps.map((s) => {
    const clean = { ...s };
    delete (clean as Record<string, unknown>)['_selected'];
    return clean;
  });
}
