import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Trash2, Star, StarOff, Save, ChevronDown,
  Info, Plus, X, AlertTriangle, Tag, ShieldCheck,
  ArrowLeftRight, CheckCircle2, ToggleLeft, ToggleRight,
  Link2, Building2, Loader2, GripVertical, ListChecks, Pencil, Check,
} from 'lucide-react';
import SearchableSelect from '../../app/components/SearchableSelect';
import type { ProcessStage, ProcessStageFormData, ProcessStageField, StageType, StageCategory } from '../../types/processFlow';
import { STAGE_TYPE_META, STAGE_CATEGORIES } from '../../types/processFlow';
import type { EntityDefinition } from '../../types/entity';
import type { FieldDefinition } from '../../types/field';
import ConfirmDialog from '../components/ConfirmDialog';
import { fetchRelationshipsForEntity } from '../../services/relationshipService';
import type { RelationshipDefinitionWithEntities } from '../../types/relationship';
import { fetchFieldsForEntity } from '../../services/fieldService';
import {
  fetchStageFields,
  addStageField,
  updateStageField,
  deleteStageField,
  reorderStageFields,
} from '../../services/processFlowService';

interface StageEditorPanelProps {
  stage: ProcessStage;
  isDefault: boolean;
  isSystem: boolean;
  entities: EntityDefinition[];
  primaryEntityId: string;
  previousStageEntityId: string | null;
  onUpdate: (updates: Partial<ProcessStageFormData>) => Promise<void>;
  onDelete: () => Promise<void>;
  onSetDefault: () => Promise<void>;
}

const PRESET_COLORS = [
  '#6b7280', '#3b82f6', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6',
];

export default function StageEditorPanel({
  stage, isDefault, isSystem, entities, primaryEntityId, previousStageEntityId,
  onUpdate, onDelete, onSetDefault,
}: StageEditorPanelProps) {
  const [form, setForm] = useState<ProcessStageFormData>({
    name: stage.name,
    description: stage.description,
    stage_key: stage.stage_key,
    display_order: stage.display_order,
    stage_color: stage.stage_color,
    stage_type: stage.stage_type,
    stage_category: stage.stage_category ?? 'general',
    is_default: stage.is_default,
    probability: stage.probability,
    allow_backward_movement: stage.allow_backward_movement ?? true,
    requires_entry_approval: stage.requires_entry_approval ?? false,
    requires_exit_approval: stage.requires_exit_approval ?? false,
    entry_rules: stage.entry_rules ?? [],
    exit_rules: stage.exit_rules ?? [],
    target_entity_id: stage.target_entity_id ?? null,
    target_relationship_name: stage.target_relationship_name ?? '',
    relationship_definition_id: stage.relationship_definition_id ?? null,
    create_linked_record: stage.create_linked_record ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showEntryRules, setShowEntryRules] = useState(false);
  const [showExitRules, setShowExitRules] = useState(false);
  const [relationships, setRelationships] = useState<RelationshipDefinitionWithEntities[]>([]);
  const [loadingRel, setLoadingRel] = useState(false);

  // Steps (process_stage_fields)
  const [stepsOpen, setStepsOpen] = useState(true);
  const [steps, setSteps] = useState<ProcessStageField[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [addingStep, setAddingStep] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragOverIndex = useRef<number | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState('');

  // Entity fields for the step picker
  const [entityFields, setEntityFields] = useState<FieldDefinition[]>([]);
  const [entityFieldsLoading, setEntityFieldsLoading] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [newStepLabel, setNewStepLabel] = useState('');

  useEffect(() => {
    const inherited = previousStageEntityId ?? primaryEntityId;
    if (!form.target_entity_id || form.target_entity_id === inherited) {
      setRelationships([]);
      return;
    }
    setLoadingRel(true);
    // Load active relationship_definitions where source = inherited entity, target = selected entity
    fetchRelationshipsForEntity(inherited)
      .then((rels) => {
        // Filter to relationships from inherited entity to the target entity, lookup mode only
        const relevant = rels.filter(
          (r) =>
            r.source_entity_id === inherited &&
            r.target_entity_id === form.target_entity_id &&
            r.relationship_storage_type === 'lookup'
        );
        setRelationships(relevant);
      })
      .catch(() => setRelationships([]))
      .finally(() => setLoadingRel(false));
  }, [form.target_entity_id, primaryEntityId, previousStageEntityId]);

  useEffect(() => {
    setForm({
      name: stage.name,
      description: stage.description,
      stage_key: stage.stage_key,
      display_order: stage.display_order,
      stage_color: stage.stage_color,
      stage_type: stage.stage_type,
      stage_category: stage.stage_category ?? 'general',
      is_default: stage.is_default,
      probability: stage.probability,
      allow_backward_movement: stage.allow_backward_movement ?? true,
      requires_entry_approval: stage.requires_entry_approval ?? false,
      requires_exit_approval: stage.requires_exit_approval ?? false,
      entry_rules: stage.entry_rules ?? [],
      exit_rules: stage.exit_rules ?? [],
      target_entity_id: stage.target_entity_id ?? null,
      target_relationship_name: stage.target_relationship_name ?? '',
      relationship_definition_id: stage.relationship_definition_id ?? null,
      create_linked_record: stage.create_linked_record ?? false,
    });
    setDirty(false);
  }, [stage.process_stage_id]);

  const loadSteps = useCallback(() => {
    setStepsLoading(true);
    fetchStageFields(stage.process_stage_id)
      .then(setSteps)
      .catch(() => setSteps([]))
      .finally(() => setStepsLoading(false));
  }, [stage.process_stage_id]);

  useEffect(() => { loadSteps(); }, [loadSteps]);

  // Load entity fields for the step picker
  const effectiveEntityId = form.target_entity_id ?? previousStageEntityId ?? primaryEntityId;
  useEffect(() => {
    if (!effectiveEntityId) return;
    setEntityFieldsLoading(true);
    fetchFieldsForEntity(effectiveEntityId)
      .then((fields) => setEntityFields(fields.filter((f) => f.is_active && !f.deleted_at)))
      .catch(() => setEntityFields([]))
      .finally(() => setEntityFieldsLoading(false));
  }, [effectiveEntityId]);

  const handleAddStep = async () => {
    if (!selectedFieldId) return;
    const field = entityFields.find((f) => f.field_definition_id === selectedFieldId);
    if (!field) return;
    setAddingStep(true);
    try {
      const nextOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.display_order)) + 10 : 10;
      const label = newStepLabel.trim() || null;
      const created = await addStageField(
        stage.process_stage_id,
        stage.process_flow_id,
        field.logical_name,
        nextOrder,
        label ?? undefined
      );
      setSteps((prev) => [...prev, created]);
      setSelectedFieldId('');
      setNewStepLabel('');
    } finally {
      setAddingStep(false);
    }
  };

  const handleToggleRequired = async (field: ProcessStageField) => {
    const updated = { is_required: !field.is_required };
    setSteps((prev) => prev.map((s) => s.psf_id === field.psf_id ? { ...s, ...updated } : s));
    await updateStageField(field.psf_id, updated);
  };

  const handleToggleReadonly = async (field: ProcessStageField) => {
    const updated = { is_readonly: !field.is_readonly };
    setSteps((prev) => prev.map((s) => s.psf_id === field.psf_id ? { ...s, ...updated } : s));
    await updateStageField(field.psf_id, updated);
  };

  const handleDeleteStep = async (fieldId: string) => {
    setSteps((prev) => prev.filter((s) => s.psf_id !== fieldId));
    await deleteStageField(fieldId);
  };

  const startEditLabel = (step: ProcessStageField) => {
    setEditingStepId(step.psf_id);
    // Pre-fill with the current custom label, or the field's default display name
    const defaultLabel = entityFields.find((f) => f.logical_name === step.field_logical_name)?.display_name ?? '';
    setEditingLabelValue(step.display_label ?? defaultLabel);
  };

  const commitEditLabel = async (psfId: string) => {
    const label = editingLabelValue.trim() || null;
    setSteps((prev) => prev.map((s) => s.psf_id === psfId ? { ...s, display_label: label } : s));
    setEditingStepId(null);
    await updateStageField(psfId, { display_label: label });
  };

  const cancelEditLabel = () => setEditingStepId(null);

  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragEnter = (index: number) => { dragOverIndex.current = index; };
  const handleDragEnd = async () => {
    if (dragIndex === null || dragOverIndex.current === null || dragIndex === dragOverIndex.current) {
      setDragIndex(null);
      dragOverIndex.current = null;
      return;
    }
    const reordered = [...steps];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dragOverIndex.current, 0, moved);
    const withOrder = reordered.map((s, i) => ({ ...s, display_order: (i + 1) * 10 }));
    setSteps(withOrder);
    setDragIndex(null);
    dragOverIndex.current = null;
    await reorderStageFields(withOrder.map((s) => ({ psf_id: s.psf_id, display_order: s.display_order })));
  };

  const set = <K extends keyof ProcessStageFormData>(key: K, value: ProcessStageFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(form);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const isTerminal = form.stage_type !== 'active';
  const inheritedEntityId = previousStageEntityId ?? primaryEntityId;
  const isEntityBoundary = form.target_entity_id != null && form.target_entity_id !== inheritedEntityId;
  const isCrossEntity = form.target_entity_id != null && form.target_entity_id !== primaryEntityId;
  const targetEntity = entities.find((e) => e.entity_definition_id === (form.target_entity_id ?? inheritedEntityId));
  const otherEntities = entities.filter((e) => e.entity_definition_id !== inheritedEntityId);

  return (
    <div className="h-full flex flex-col">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: form.stage_color }}
          />
          <span className="text-sm font-semibold text-gray-800">{form.name || 'Unnamed Stage'}</span>
          {isDefault && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
              Default
            </span>
          )}
          {isCrossEntity && (
            <span className="flex items-center gap-1 text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-medium">
              <Link2 size={10} />
              {targetEntity?.display_name ?? 'Linked Entity'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isDefault && (
            <button
              onClick={onSetDefault}
              title="Set as default stage"
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-amber-600 transition-colors px-2 py-1 rounded hover:bg-amber-50"
            >
              <StarOff size={13} />
              Set Default
            </button>
          )}
          {isDefault && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 px-2 py-1">
              <Star size={13} />
              Default Stage
            </span>
          )}
          {!isSystem && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
            >
              <Trash2 size={13} />
              Delete
            </button>
          )}
          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save size={12} />
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-5 space-y-5">
        {/* Basic info */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Stage Identity</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Stage Key</label>
              <input
                value={form.stage_key}
                onChange={(e) => set('stage_key', e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
              <p className="text-xs text-gray-400 mt-1">
                Unique identifier stored in the stage field of the entity record
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
          </div>
        </section>

        {/* Cross-Entity Configuration */}
        <section className="border border-teal-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-teal-50 border-b border-teal-200">
            <Link2 size={13} className="text-teal-600" />
            <h4 className="text-xs font-semibold text-teal-800 uppercase tracking-wide">Entity Context</h4>
            {isCrossEntity && (
              <span className="ml-auto text-xs text-teal-600 font-medium bg-teal-100 px-2 py-0.5 rounded">
                {isEntityBoundary ? 'Boundary' : 'Inherited'}
              </span>
            )}
          </div>
          <div className="p-4 space-y-3 bg-white">
            {previousStageEntityId && previousStageEntityId !== primaryEntityId && !isEntityBoundary && (
              <div className="flex items-start gap-2 p-3 bg-teal-50 border border-teal-200 rounded-lg">
                <Info size={12} className="text-teal-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-teal-800 leading-relaxed">
                  This stage inherits the <strong>{entities.find(e => e.entity_definition_id === inheritedEntityId)?.display_name}</strong> context
                  from the previous stage. No relationship configuration is needed — the record is already established.
                </p>
              </div>
            )}

            {(!previousStageEntityId || previousStageEntityId === primaryEntityId) && !isEntityBoundary && (
              <p className="text-xs text-gray-500 leading-relaxed">
                This stage operates on the <strong>{entities.find(e => e.entity_definition_id === primaryEntityId)?.display_name}</strong> record.
                Switch the target entity below to move this stage into a linked record context.
              </p>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Target Entity</label>
              <SearchableSelect
                options={[
                  {
                    value: inheritedEntityId,
                    label: `${entities.find(e => e.entity_definition_id === inheritedEntityId)?.display_name ?? 'Current context'} (inherited)`,
                  },
                  ...otherEntities.map((ent) => ({ value: ent.entity_definition_id, label: ent.display_name })),
                ]}
                value={form.target_entity_id ?? inheritedEntityId}
                onChange={(v) => {
                  set('target_entity_id', v || null);
                  set('target_relationship_name', '');
                  set('relationship_definition_id', null);
                }}
                placeholder="Select entity..."
              />
              <p className="text-xs text-gray-400 mt-1">
                Switching entity here creates an entity boundary — the flow will navigate to the linked record.
              </p>
            </div>

            {isEntityBoundary && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Relationship
                  </label>
                  {loadingRel ? (
                    <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-400">
                      <Loader2 size={13} className="animate-spin" />
                      Loading relationships…
                    </div>
                  ) : (
                    <SearchableSelect
                      options={[
                        { value: '', label: 'None' },
                        ...relationships.map((r) => ({
                          value: r.relationship_definition_id,
                          label: r.display_name + (r.lookup_field_physical_column ? ` (${r.lookup_field_physical_column})` : ''),
                        })),
                      ]}
                      value={form.relationship_definition_id ?? ''}
                      onChange={(relId) => {
                        set('relationship_definition_id', relId || null);
                        if (relId) {
                          const rel = relationships.find(r => r.relationship_definition_id === relId);
                          set('target_relationship_name', rel?.lookup_field_physical_column ?? '');
                        } else {
                          set('target_relationship_name', '');
                        }
                      }}
                      placeholder="None"
                    />
                  )}
                  {!loadingRel && relationships.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <AlertTriangle size={11} />
                      No registered relationships found from{' '}
                      <strong>{entities.find(e => e.entity_definition_id === inheritedEntityId)?.display_name}</strong>{' '}
                      to <strong>{targetEntity?.display_name}</strong>.
                      Register the relationship in the Relationships section first.
                    </p>
                  )}
                  {!loadingRel && relationships.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      The relationship that links the{' '}
                      <strong>{targetEntity?.display_name}</strong> record back to the{' '}
                      <strong>{entities.find(e => e.entity_definition_id === inheritedEntityId)?.display_name}</strong>.
                      Select <em>None</em> for standalone linked records.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl">
                  <Building2 size={13} className="text-gray-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">Auto-create linked record</p>
                    <p className="text-[10px] text-gray-400 leading-snug">
                      When entering this stage, automatically create a {targetEntity?.display_name ?? 'linked'} record if one doesn't exist yet
                    </p>
                  </div>
                  <button
                    onClick={() => set('create_linked_record', !form.create_linked_record)}
                    className="flex-shrink-0 text-gray-300 hover:text-teal-600 transition-colors"
                  >
                    {form.create_linked_record
                      ? <ToggleRight size={22} className="text-teal-600" />
                      : <ToggleLeft size={22} />}
                  </button>
                </div>

                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <Info size={12} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    When advancing to this stage, the flow will navigate to the{' '}
                    <strong>{targetEntity?.display_name}</strong> record linked via the selected relationship.
                    Subsequent stages on the same entity inherit this context automatically.
                  </p>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Appearance */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Appearance</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Color</label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => set('stage_color', color)}
                    className={`w-7 h-7 rounded-full transition-all ${
                      form.stage_color === color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
                <div className="flex items-center gap-2 ml-1">
                  <input
                    type="color"
                    value={form.stage_color}
                    onChange={(e) => set('stage_color', e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border border-gray-200"
                    title="Custom color"
                  />
                  <span className="text-xs font-mono text-gray-400">{form.stage_color}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stage type */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Stage Type</h4>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(STAGE_TYPE_META) as StageType[]).map((type) => {
              const meta = STAGE_TYPE_META[type];
              return (
                <button
                  key={type}
                  onClick={() => set('stage_type', type)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    form.stage_type === type
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                    <span className="text-xs font-semibold text-gray-800">{meta.label}</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-snug">{meta.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Stage Category */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Tag size={12} />
            Stage Category
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {STAGE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => set('stage_category', cat.id as StageCategory)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                  form.stage_category === cat.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </section>

        {/* Movement & Approval Gates */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <ShieldCheck size={12} />
            Movement &amp; Approval Gates
          </h4>
          <div className="space-y-2">
            <GateRow
              label="Allow Backward Movement"
              description="When off, records cannot re-enter this stage once passed"
              icon={<ArrowLeftRight size={13} className="text-blue-500" />}
              checked={form.allow_backward_movement}
              onChange={(v) => set('allow_backward_movement', v)}
            />
            <GateRow
              label="Requires Entry Approval"
              description="An approver must approve before entering this stage"
              icon={<CheckCircle2 size={13} className="text-emerald-500" />}
              checked={form.requires_entry_approval}
              onChange={(v) => set('requires_entry_approval', v)}
            />
            <GateRow
              label="Requires Exit Approval"
              description="An approver must approve before leaving this stage"
              icon={<ShieldCheck size={13} className="text-amber-500" />}
              checked={form.requires_exit_approval}
              onChange={(v) => set('requires_exit_approval', v)}
            />
          </div>
        </section>

        {/* Probability (for active stages) */}
        {!isTerminal && (
          <section>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Win Probability
              <span className="ml-1 text-gray-400 font-normal normal-case">(optional, for opportunities)</span>
            </h4>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.probability ?? 0}
                onChange={(e) => set('probability', parseInt(e.target.value))}
                className="flex-1 h-2 accent-blue-600"
              />
              <div className="w-14 flex-shrink-0">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.probability ?? ''}
                  onChange={(e) => set('probability', e.target.value === '' ? null : parseInt(e.target.value))}
                  placeholder="—"
                  className="w-full px-2 py-1 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <span className="text-sm text-gray-500">%</span>
            </div>
          </section>
        )}

        {/* Stage Steps */}
        <section className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setStepsOpen((v) => !v)}
            className="flex items-center justify-between w-full px-4 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ListChecks size={13} className="text-gray-500" />
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Stage Steps</span>
              {steps.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{steps.length}</span>
              )}
            </div>
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${stepsOpen ? 'rotate-180' : ''}`} />
          </button>

          {stepsOpen && (
            <div className="bg-white">
              {stepsLoading ? (
                <div className="flex items-center gap-2 px-4 py-4 text-xs text-gray-400">
                  <Loader2 size={13} className="animate-spin" /> Loading steps…
                </div>
              ) : (
                <>
                  {steps.length === 0 ? (
                    <div className="flex items-center gap-2 px-4 py-4 text-xs text-gray-400">
                      <Info size={13} />
                      No steps configured — add fields to show in this stage's BPF bar.
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {steps.map((step, idx) => {
                        const isEditing = editingStepId === step.psf_id;
                        const fieldDef = entityFields.find((f) => f.logical_name === step.field_logical_name);
                        const resolvedLabel = step.display_label ?? fieldDef?.display_name ?? step.field_logical_name;
                        const hasCustomLabel = !!step.display_label && step.display_label !== fieldDef?.display_name;
                        return (
                          <li
                            key={step.psf_id}
                            draggable={!isEditing}
                            onDragStart={() => !isEditing && handleDragStart(idx)}
                            onDragEnter={() => handleDragEnter(idx)}
                            onDragOver={(e) => e.preventDefault()}
                            onDragEnd={handleDragEnd}
                            className={`flex items-center gap-2 px-3 py-2.5 group transition-colors ${
                              dragIndex === idx ? 'opacity-40 bg-blue-50' : 'hover:bg-gray-50'
                            }`}
                          >
                            <GripVertical size={13} className={`flex-shrink-0 transition-colors ${isEditing ? 'text-gray-200' : 'text-gray-300 group-hover:text-gray-400 cursor-grab'}`} />

                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                              {isEditing ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    autoFocus
                                    value={editingLabelValue}
                                    onChange={(e) => setEditingLabelValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') commitEditLabel(step.psf_id);
                                      if (e.key === 'Escape') cancelEditLabel();
                                    }}
                                    placeholder={fieldDef?.display_name ?? step.field_logical_name}
                                    className="flex-1 min-w-0 px-2 py-0.5 text-xs border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                                  />
                                  <button onClick={() => commitEditLabel(step.psf_id)} className="text-blue-500 hover:text-blue-700 flex-shrink-0"><Check size={13} /></button>
                                  <button onClick={cancelEditLabel} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X size={13} /></button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-xs font-medium text-gray-800 truncate">{resolvedLabel}</span>
                                  {hasCustomLabel && (
                                    <span className="text-[10px] text-blue-400 flex-shrink-0" title="Custom label">custom</span>
                                  )}
                                  <button
                                    onClick={() => startEditLabel(step)}
                                    className="flex-shrink-0 text-gray-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100 ml-0.5"
                                    title="Edit display label"
                                  >
                                    <Pencil size={11} />
                                  </button>
                                </div>
                              )}
                              <span className="text-[10px] text-gray-400 font-mono truncate">{step.field_logical_name}</span>
                            </div>

                            <button
                              onClick={() => handleToggleRequired(step)}
                              title={step.is_required ? 'Required — click to make optional' : 'Optional — click to make required'}
                              className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded border transition-colors ${
                                step.is_required
                                  ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                                  : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                              }`}
                            >
                              Req
                            </button>
                            <button
                              onClick={() => handleToggleReadonly(step)}
                              title={step.is_readonly ? 'Read-only — click to make editable' : 'Editable — click to make read-only'}
                              className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded border transition-colors ${
                                step.is_readonly
                                  ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100'
                                  : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                              }`}
                            >
                              R/O
                            </button>
                            <button
                              onClick={() => handleDeleteStep(step.psf_id)}
                              className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                              title="Remove step"
                            >
                              <X size={13} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* Add step — field picker + optional custom label */}
                  <div className="px-3 py-3 border-t border-gray-100 space-y-2">
                    <div className="flex items-center gap-2">
                      <SearchableSelect
                        options={entityFields
                          .filter((f) => !steps.some((s) => s.field_logical_name === f.logical_name))
                          .map((f) => ({ value: f.field_definition_id, label: f.display_name }))}
                        value={selectedFieldId}
                        onChange={(v) => {
                          setSelectedFieldId(v);
                          const field = entityFields.find((f) => f.field_definition_id === v);
                          setNewStepLabel(field?.display_name ?? '');
                        }}
                        placeholder={entityFieldsLoading ? 'Loading fields…' : '— Select a field —'}
                        disabled={entityFieldsLoading}
                        className="flex-1 min-w-0"
                        heightClass="h-8"
                      />
                    </div>
                    {selectedFieldId && (
                      <div className="flex items-center gap-2">
                        <input
                          value={newStepLabel}
                          onChange={(e) => setNewStepLabel(e.target.value)}
                          placeholder="Display label (optional — defaults to field name)"
                          className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-gray-300"
                        />
                        <button
                          onClick={handleAddStep}
                          disabled={!selectedFieldId || addingStep}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                        >
                          {addingStep ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                          Add
                        </button>
                      </div>
                    )}
                    {!selectedFieldId && (
                      <button
                        onClick={handleAddStep}
                        disabled={!selectedFieldId || addingStep}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {addingStep ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                        Add Step
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* Entry rules */}
        <section>
          <button
            onClick={() => setShowEntryRules(!showEntryRules)}
            className="flex items-center justify-between w-full text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 hover:text-gray-700 transition-colors"
          >
            <span>
              Entry Rules
              {form.entry_rules.length > 0 && (
                <span className="ml-2 text-blue-600 font-semibold normal-case">({form.entry_rules.length})</span>
              )}
            </span>
            <ChevronDown size={14} className={`transition-transform ${showEntryRules ? 'rotate-180' : ''}`} />
          </button>
          {!showEntryRules && (
            <p className="text-xs text-gray-400">
              Conditions that must be met before entering this stage
            </p>
          )}
          {showEntryRules && (
            <RuleEditor
              rules={form.entry_rules}
              onChange={(rules) => set('entry_rules', rules)}
              placeholder="e.g. revenue > 10000"
            />
          )}
        </section>

        {/* Exit rules */}
        <section>
          <button
            onClick={() => setShowExitRules(!showExitRules)}
            className="flex items-center justify-between w-full text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 hover:text-gray-700 transition-colors"
          >
            <span>
              Exit Rules
              {form.exit_rules.length > 0 && (
                <span className="ml-2 text-blue-600 font-semibold normal-case">({form.exit_rules.length})</span>
              )}
            </span>
            <ChevronDown size={14} className={`transition-transform ${showExitRules ? 'rotate-180' : ''}`} />
          </button>
          {!showExitRules && (
            <p className="text-xs text-gray-400">
              Conditions that must be met before leaving this stage
            </p>
          )}
          {showExitRules && (
            <RuleEditor
              rules={form.exit_rules}
              onChange={(rules) => set('exit_rules', rules)}
              placeholder="e.g. close_date is set"
            />
          )}
        </section>

        {isSystem && (
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              This is a system stage. Name, key, color and rules can be customized,
              but it cannot be deleted.
            </p>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Stage"
          message={`Delete "${stage.name}"? Any transitions referencing this stage will also be removed.`}
          confirmLabel="Delete Stage"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={deleting}
          destructive
        />
      )}
    </div>
  );
}

// ─── Gate Row ─────────────────────────────────────────────────────────────────

interface GateRowProps {
  label: string;
  description: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function GateRow({ label, description, icon, checked, onChange }: GateRowProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-white border border-gray-200 rounded-xl">
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-800">{label}</p>
        <p className="text-[10px] text-gray-400 leading-snug">{description}</p>
      </div>
      <button onClick={() => onChange(!checked)} className="flex-shrink-0 text-gray-300 hover:text-blue-600 transition-colors">
        {checked ? <ToggleRight size={22} className="text-blue-600" /> : <ToggleLeft size={22} />}
      </button>
    </div>
  );
}

// ─── Simple Rule Editor ───────────────────────────────────────────────────────

interface RuleEditorProps {
  rules: { field: string; operator: string; value: string | number | boolean | null }[];
  onChange: (rules: { field: string; operator: string; value: string | number | boolean | null }[]) => void;
  placeholder?: string;
}

const OPERATORS = ['equals', 'not_equals', 'is_set', 'is_not_set', 'greater_than', 'less_than', 'contains'];

function RuleEditor({ rules, onChange }: RuleEditorProps) {
  const addRule = () =>
    onChange([...rules, { field: '', operator: 'is_set', value: null }]);

  const removeRule = (i: number) =>
    onChange(rules.filter((_, idx) => idx !== i));

  const updateRule = (i: number, key: string, value: string) =>
    onChange(rules.map((r, idx) => idx === i ? { ...r, [key]: value } : r));

  return (
    <div className="mt-2 space-y-2">
      {rules.length === 0 ? (
        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <Info size={13} className="text-gray-400" />
          <span className="text-xs text-gray-400">No rules — stage can be entered/exited freely</span>
        </div>
      ) : (
        rules.map((rule, i) => (
          <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
            <input
              value={rule.field}
              onChange={(e) => updateRule(i, 'field', e.target.value)}
              placeholder="field name"
              className="flex-1 px-2 py-1 text-xs font-mono border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <select
              value={rule.operator}
              onChange={(e) => updateRule(i, 'operator', e.target.value)}
              className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {OPERATORS.map((op) => (
                <option key={op} value={op}>{op.replace(/_/g, ' ')}</option>
              ))}
            </select>
            {rule.operator !== 'is_set' && rule.operator !== 'is_not_set' && (
              <input
                value={rule.value as string ?? ''}
                onChange={(e) => updateRule(i, 'value', e.target.value)}
                placeholder="value"
                className="w-24 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            )}
            <button onClick={() => removeRule(i)} className="text-gray-400 hover:text-red-500 transition-colors">
              <X size={13} />
            </button>
          </div>
        ))
      )}
      <button
        onClick={addRule}
        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
      >
        <Plus size={12} />
        Add condition
      </button>
    </div>
  );
}
