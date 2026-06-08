import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Save, CheckCircle2,
  GitMerge, Info, Settings2, Shield,
} from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import type { MergeCandidate, MergeDecision, FieldSelection } from '../../types/mergeCenter';
import { CANDIDATE_STATUS_META, COMMON_RELATIONS, KNOWN_ENTITIES_MERGE } from '../../types/mergeCenter';
import {
  fetchMergeCandidateWithDecision,
  upsertMergeDecision,
  executeMerge,
  updateCandidateStatus,
  appendAuditEntries,
} from '../../services/mergeCenterService';
import MergeComparePanel, { type FieldRow } from './MergeComparePanel';
import { supabase } from '../../lib/supabase';
import ConfirmDialog from '../components/ConfirmDialog';

interface Props {
  candidate: MergeCandidate;
  onBack: () => void;
  onResolved: (candidate: MergeCandidate) => void;
}

const DEMO_FIELDS: Record<string, FieldRow[]> = {
  account:     [
    { field_name: 'name',              display_name: 'Account Name',    value_a: null, value_b: null },
    { field_name: 'accountnumber',     display_name: 'Account Number',  value_a: null, value_b: null },
    { field_name: 'telephone1',        display_name: 'Phone',           value_a: null, value_b: null },
    { field_name: 'emailaddress1',     display_name: 'Email',           value_a: null, value_b: null },
    { field_name: 'address1_city',     display_name: 'City',            value_a: null, value_b: null },
    { field_name: 'address1_country',  display_name: 'Country',         value_a: null, value_b: null },
    { field_name: 'websiteurl',        display_name: 'Website',         value_a: null, value_b: null },
  ],
  contact:     [
    { field_name: 'fullname',          display_name: 'Full Name',       value_a: null, value_b: null },
    { field_name: 'emailaddress1',     display_name: 'Email',           value_a: null, value_b: null },
    { field_name: 'telephone1',        display_name: 'Phone',           value_a: null, value_b: null },
    { field_name: 'jobtitle',          display_name: 'Job Title',       value_a: null, value_b: null },
    { field_name: 'address1_city',     display_name: 'City',            value_a: null, value_b: null },
  ],
  lead:        [
    { field_name: 'fullname',          display_name: 'Full Name',       value_a: null, value_b: null },
    { field_name: 'companyname',       display_name: 'Company',         value_a: null, value_b: null },
    { field_name: 'emailaddress1',     display_name: 'Email',           value_a: null, value_b: null },
    { field_name: 'telephone1',        display_name: 'Phone',           value_a: null, value_b: null },
  ],
  opportunity: [
    { field_name: 'name',              display_name: 'Opportunity Name', value_a: null, value_b: null },
    { field_name: 'estimatedvalue',    display_name: 'Est. Value',      value_a: null, value_b: null },
    { field_name: 'stagecode',         display_name: 'Stage',           value_a: null, value_b: null },
  ],
};

function seedDemoValues(rows: FieldRow[], labelA: string, labelB: string): FieldRow[] {
  return rows.map((r, i) => ({
    ...r,
    value_a: i === 0 ? labelA : (i % 3 === 0 ? null : `${r.display_name} from A`),
    value_b: i === 0 ? labelB : (i % 2 === 0 ? null : `${r.display_name} from B`),
  }));
}

function buildDefaultSelections(masterSide: 'a' | 'b', rows: FieldRow[]): Record<string, FieldSelection> {
  const out: Record<string, FieldSelection> = {};
  rows.forEach((r) => {
    const aHasValue = !!r.value_a;
    const bHasValue = !!r.value_b;
    if (masterSide === 'a') {
      out[r.field_name] = { source: aHasValue ? 'master' : bHasValue ? 'loser' : 'master' };
    } else {
      out[r.field_name] = { source: bHasValue ? 'master' : aHasValue ? 'loser' : 'master' };
    }
  });
  return out;
}

export default function MergeEditorPage({ candidate: initCandidate, onBack, onResolved }: Props) {
  const { showSuccess, showError } = useToast();
  const [candidate, setCandidate] = useState<MergeCandidate>(initCandidate);
  const [decision, setDecision] = useState<MergeDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'compare' | 'relations' | 'notes'>('compare');

  const [masterSide, setMasterSide] = useState<'a' | 'b'>('a');
  const [fieldRows, setFieldRows] = useState<FieldRow[]>([]);
  const [fieldSelections, setFieldSelections] = useState<Record<string, FieldSelection>>({});
  const [selectedRelations, setSelectedRelations] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [dirty, setDirty] = useState(false);

  const availableRelations = COMMON_RELATIONS[candidate.entity_logical_name] ?? [];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const full = await fetchMergeCandidateWithDecision(candidate.merge_candidate_id);
      setCandidate(full);

      const templateRows = DEMO_FIELDS[full.entity_logical_name] ?? [];
      const seeded = seedDemoValues(templateRows, full.record_a_label, full.record_b_label);
      setFieldRows(seeded);

      if (full.decision) {
        setDecision(full.decision);
        const isMasterA = full.decision.master_record_id === full.record_a_id;
        setMasterSide(isMasterA ? 'a' : 'b');
        setFieldSelections(full.decision.field_selections ?? buildDefaultSelections('a', seeded));
        setSelectedRelations(full.decision.reparent_relations ?? availableRelations);
        setNotes(full.decision.notes ?? '');
      } else {
        setMasterSide('a');
        setFieldSelections(buildDefaultSelections('a', seeded));
        setSelectedRelations(availableRelations);
      }
    } finally { setLoading(false); }
  }, [candidate.merge_candidate_id]);

  useEffect(() => { load(); }, [load]);

  const handleMasterSideChange = (side: 'a' | 'b') => {
    setMasterSide(side);
    setFieldSelections(buildDefaultSelections(side, fieldRows));
    setDirty(true);
  };

  const handleFieldSelection = (field: string, sel: FieldSelection) => {
    setFieldSelections((prev) => ({ ...prev, [field]: sel }));
    setDirty(true);
  };

  const toggleRelation = (rel: string) => {
    setSelectedRelations((prev) =>
      prev.includes(rel) ? prev.filter((r) => r !== rel) : [...prev, rel]
    );
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const masterId = masterSide === 'a' ? candidate.record_a_id : candidate.record_b_id;
      const loserId  = masterSide === 'a' ? candidate.record_b_id : candidate.record_a_id;
      const saved = await upsertMergeDecision({
        merge_candidate_id: candidate.merge_candidate_id,
        master_record_id: masterId,
        loser_record_id: loserId,
        field_selections: fieldSelections,
        reparent_relations: selectedRelations,
        notes: notes || undefined,
      });
      setDecision(saved);
      await updateCandidateStatus(candidate.merge_candidate_id, 'in_review');
      setCandidate((prev) => ({ ...prev, status: 'in_review' }));
      setDirty(false);
      showSuccess('Decision saved');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const handleExecute = async () => {
    setShowConfirm(false);
    setExecuting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? 'unknown';

      if (!decision) {
        await handleSave();
      }

      const masterId = masterSide === 'a' ? candidate.record_a_id : candidate.record_b_id;
      const loserId  = masterSide === 'a' ? candidate.record_b_id : candidate.record_a_id;

      const auditEntries = [
        ...fieldRows.map((r) => ({
          merge_decision_id: decision?.merge_decision_id ?? '',
          entity_logical_name: candidate.entity_logical_name,
          master_record_id: masterId,
          loser_record_id: loserId,
          change_type: 'field_merged' as const,
          field_name: r.field_name,
          old_value: masterSide === 'a' ? r.value_a : r.value_b,
          new_value: fieldSelections[r.field_name]?.source === 'master'
            ? (masterSide === 'a' ? r.value_a : r.value_b)
            : (masterSide === 'a' ? r.value_b : r.value_a),
          source_record: fieldSelections[r.field_name]?.source ?? 'master',
          performed_by: userId,
        })),
        {
          merge_decision_id: decision?.merge_decision_id ?? '',
          entity_logical_name: candidate.entity_logical_name,
          master_record_id: masterId,
          loser_record_id: loserId,
          change_type: 'record_retired' as const,
          performed_by: userId,
        },
        ...selectedRelations.map((rel) => ({
          merge_decision_id: decision?.merge_decision_id ?? '',
          entity_logical_name: candidate.entity_logical_name,
          master_record_id: masterId,
          loser_record_id: loserId,
          change_type: 'relation_reparented' as const,
          relation_name: rel,
          performed_by: userId,
        })),
      ];

      if (decision) {
        await executeMerge(decision.merge_decision_id, candidate.merge_candidate_id, userId);
        await appendAuditEntries(auditEntries.filter((e) => e.merge_decision_id));
      }

      const updated = { ...candidate, status: 'merged' as const };
      setCandidate(updated);
      onResolved(updated);
      showSuccess('Merge executed');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Merge failed');
    } finally { setExecuting(false); }
  };

  const isMerged = candidate.status === 'merged';
  const statusMeta = CANDIDATE_STATUS_META[candidate.status];
  const entityLabel = KNOWN_ENTITIES_MERGE.find((e) => e.logical_name === candidate.entity_logical_name)?.display_name ?? candidate.entity_logical_name;

  const tabs = [
    { key: 'compare' as const,   label: 'Compare Fields' },
    { key: 'relations' as const, label: `Related Records (${selectedRelations.length}/${availableRelations.length})` },
    { key: 'notes' as const,     label: 'Notes' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft size={14} />Candidates
          </button>
          <span className="text-gray-200">·</span>
          <div>
            <div className="flex items-center gap-2">
              <GitMerge size={13} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-900">
                {candidate.record_a_label} <span className="text-gray-300 mx-1">vs</span> {candidate.record_b_label}
              </span>
              <span
                style={{ color: statusMeta.color }}
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusMeta.bg} ${statusMeta.border}`}>
                {statusMeta.label}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">{entityLabel} · {candidate.similarity_score !== null ? Math.round(candidate.similarity_score * 100) + '% similar' : 'manual'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && !isMerged && (
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:border-gray-400 disabled:opacity-50 transition-colors">
              <Save size={12} />{saving ? 'Saving...' : 'Save Draft'}
            </button>
          )}
          {!isMerged && (
            <button onClick={() => setShowConfirm(true)} disabled={executing || saving || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              <GitMerge size={12} />{executing ? 'Merging...' : 'Execute Merge'}
            </button>
          )}
        </div>
      </div>

      {isMerged && (
        <div className="mx-5 mt-3 flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Merge completed</p>
            <p className="text-xs text-emerald-700 mt-0.5">These records have been merged. The loser record has been archived and related records reparented.</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-gray-200 bg-white px-5">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === tab.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-5 py-6">
          {loading ? (
            <div className="text-sm text-gray-400 text-center py-12">Loading...</div>
          ) : (
            <>
              {activeTab === 'compare' && (
                <MergeComparePanel
                  candidate={candidate}
                  masterSide={masterSide}
                  fieldRows={fieldRows}
                  fieldSelections={fieldSelections}
                  onMasterSideChange={handleMasterSideChange}
                  onFieldSelectionChange={handleFieldSelection}
                  disabled={isMerged}
                />
              )}

              {activeTab === 'relations' && (
                <RelationsPanel
                  entity={candidate.entity_logical_name}
                  availableRelations={availableRelations}
                  selectedRelations={selectedRelations}
                  onToggle={toggleRelation}
                  disabled={isMerged}
                />
              )}

              {activeTab === 'notes' && (
                <NotesPanel
                  notes={notes}
                  onChange={(v) => { setNotes(v); setDirty(true); }}
                  disabled={isMerged}
                />
              )}
            </>
          )}
        </div>
      </div>

      {showConfirm && (
        <ConfirmDialog
          title="Execute Merge"
          message={`This will permanently merge "${candidate.record_b_label}" into "${candidate.record_a_label}" based on your field selections. The loser record will be archived and its related records reparented to the master. This action cannot be undone.`}
          confirmLabel="Execute Merge"
          onConfirm={handleExecute}
          onCancel={() => setShowConfirm(false)}
          loading={executing}
          destructive
        />
      )}
    </div>
  );
}

// ─── Relations Panel ──────────────────────────────────────────────────────────

function RelationsPanel({ entity, availableRelations, selectedRelations, onToggle, disabled }: {
  entity: string;
  availableRelations: string[];
  selectedRelations: string[];
  onToggle: (rel: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-5">
        <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Select which related record types should be reparented from the loser record to the master record.
          All selected relation types will be moved; unselected ones will remain attached to the loser
          record until it is fully archived.
        </p>
      </div>

      {availableRelations.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No common relations configured for {entity}.</p>
      ) : (
        <div className="space-y-2">
          {availableRelations.map((rel) => {
            const selected = selectedRelations.includes(rel);
            return (
              <button key={rel} onClick={() => !disabled && onToggle(rel)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 text-left transition-all ${
                  selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                } ${disabled ? 'pointer-events-none' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                  }`}>
                    {selected && <CheckCircle2 size={10} className="text-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 capitalize">{rel}</p>
                    <p className="text-[10px] text-gray-400">Reparent all {rel} from loser → master</p>
                  </div>
                </div>
                {selected && (
                  <span className="text-[10px] font-semibold text-blue-600 bg-blue-100 border border-blue-200 rounded px-1.5 py-0.5">Will reparent</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Notes Panel ──────────────────────────────────────────────────────────────

function NotesPanel({ notes, onChange, disabled }: { notes: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-5">
        <Settings2 size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Add any notes about this merge decision — why you chose this master record,
          any exceptions made, or context for future reviewers.
        </p>
      </div>
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={8}
        placeholder="Optional notes about this merge decision..."
        className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-gray-50"
      />
    </div>
  );
}
