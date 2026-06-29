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
  Braces,
  ScrollText,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type { WorkflowDefinition } from '../../types/workflow';
import type { EntityDefinition } from '../../types/entity';
import { fetchEntities } from '../../services/entityService';
import { saveWorkflow } from '../../services/workflowService';
import FlowBuilder from './FlowBuilder';
import WorkflowRunsPanel from './WorkflowRuns';

type Tab = 'designer' | 'json' | 'runs' | 'settings';

interface WorkflowEditorPageProps {
  workflow: WorkflowDefinition;
  onBack: () => void;
  onWorkflowUpdate: (w: WorkflowDefinition) => void;
}

export default function WorkflowEditorPage({ workflow: initWf, onBack, onWorkflowUpdate }: WorkflowEditorPageProps) {
  const { showSuccess, showError } = useToast();
  const [wf, setWf] = useState<WorkflowDefinition>(initWf);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('designer');

  useEffect(() => {
    fetchEntities()
      .then((ents) => setEntities(ents))
      .catch((e) => showError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const mark = () => setDirty(true);
  const entity = entities.find((e) => e.entity_definition_id === wf.entity_definition_id) ?? null;

  // In the v2 model the table and step count live inside the flow definition.
  const def = (wf.definition ?? null) as { trigger?: { entity?: string }; steps?: unknown[] } | null;
  const triggerEntity = def?.trigger?.entity || entity?.logical_name || '';
  const stepCount = def?.steps?.length ?? 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await saveWorkflow(wf.workflow_id, {
        name: wf.name,
        description: wf.description,
        entity_definition_id: wf.entity_definition_id,
        trigger_type: wf.trigger_type,
        trigger_conditions: wf.trigger_conditions,
        is_active: wf.is_active,
        definition: wf.definition ?? null,
      });
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
    { id: 'designer', label: 'Designer',    icon: <Braces size={13} /> },
    { id: 'json',     label: 'Flow JSON',   icon: <Braces size={13} /> },
    { id: 'runs',     label: 'Run history', icon: <ScrollText size={13} /> },
    { id: 'settings', label: 'Settings',    icon: <Settings size={13} /> },
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
          className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${triggerEntity ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}
          title={triggerEntity ? `Trigger table: ${triggerEntity}` : 'No trigger table set — choose one in the Designer'}
        >
          <Database size={10} />
          {triggerEntity || 'No trigger table'}
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
          <span className="text-[10px] text-slate-400">{stepCount} step{stepCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'designer' && (
          <div className="h-full overflow-y-auto p-6">
            <FlowBuilder
              entityName={entity?.logical_name ?? ''}
              entities={entities}
              definition={wf.definition ?? null}
              onChange={(def) => { setWf((w) => ({ ...w, definition: def })); mark(); }}
            />
          </div>
        )}
        {activeTab === 'json' && (
          <div className="h-full overflow-y-auto p-6">
            <FlowJsonEditor
              entityName={entity?.logical_name ?? ''}
              definition={wf.definition ?? null}
              onChange={(def) => { setWf((w) => ({ ...w, definition: def })); mark(); }}
            />
          </div>
        )}
        {activeTab === 'runs' && (
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto">
              <WorkflowRunsPanel workflowId={wf.workflow_id} />
            </div>
          </div>
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

function FlowJsonEditor({
  entityName,
  definition,
  onChange,
}: {
  entityName: string;
  definition: Record<string, unknown> | null;
  onChange: (def: Record<string, unknown> | null) => void;
}) {
  const [text, setText] = useState(() => (definition ? JSON.stringify(definition, null, 2) : ''));
  const [error, setError] = useState<string | null>(null);

  const apply = (raw: string) => {
    setText(raw);
    if (!raw.trim()) { setError(null); onChange(null); return; }
    try {
      const parsed = JSON.parse(raw);
      setError(null);
      onChange(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  const insertTemplate = () => {
    const tpl = {
      enabled: true,
      trigger: { type: 'record.updated', entity: entityName || 'opportunity', conditions: [{ field: 'stage', op: 'changed' }] },
      steps: [
        { type: 'initialize_variable', name: 'count', varType: 'Integer', value: 0 },
        { type: 'action', id: 'rows', action: 'list_records', params: { entity: 'lead', filters: [], limit: 50 } },
        {
          type: 'apply_to_each', id: 'each', items: '{{steps.rows}}',
          do: [
            { type: 'increment_variable', name: 'count', by: 1 },
            { type: 'action', id: 'mail', action: 'send_email', params: { recipientId: "@{item('owner_id')}", subject: "Please review: @{item('lastname')}", body: 'A record needs your attention.' } },
          ],
        },
        { type: 'terminate', status: 'Succeeded', message: "Notified owners of @{variables('count')} records" },
      ],
    };
    apply(JSON.stringify(tpl, null, 2));
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs font-bold text-slate-600">Flow JSON</p>
          <p className="text-[10px] text-slate-400">Nested flow {'{ enabled, trigger, steps }'} — the same definition the Designer edits. Save to persist; toggle Active in Settings.</p>
        </div>
        {!text.trim() && (
          <button type="button" onClick={insertTemplate} className="text-[11px] font-medium text-blue-600 hover:underline shrink-0">Insert starter template</button>
        )}
      </div>
      <textarea
        value={text}
        onChange={(e) => apply(e.target.value)}
        spellCheck={false}
        rows={24}
        placeholder='{ "enabled": true, "trigger": { "type": "record.updated", "entity": "opportunity" }, "steps": [] }'
        className={`w-full font-mono text-[11px] border rounded-xl px-3 py-2.5 bg-slate-50 focus:outline-none focus:ring-1 resize-y ${error ? 'border-rose-300 focus:ring-rose-400' : 'border-slate-200 focus:ring-blue-400'}`}
      />
      {error ? (
        <p className="text-[11px] text-rose-600 mt-1">JSON error: {error}</p>
      ) : text.trim() ? (
        <p className="text-[11px] text-emerald-600 mt-1">Valid JSON — Save to apply.</p>
      ) : (
        <p className="text-[11px] text-slate-400 mt-1">Empty = no flow configured on this workflow.</p>
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

