import { useState, useEffect } from 'react';
import { X, LayoutGrid, Link, ChevronRight, AlertCircle, Loader2, FileText, Zap } from 'lucide-react';
import type { RelationshipDefinitionWithEntities } from '../../types/relationship';
import type { ViewDefinition } from '../../types/view';
import type { SubgridConfig } from '../../types/form';
import { fetchViewsForEntity } from '../../services/viewService';
import { fetchQuickCreateFormsForEntity } from '../../services/formService';
import { fetchRelationshipsForEntity } from '../../services/relationshipService';
import { supabase } from '../../lib/supabase';

interface SubgridPickerModalProps {
  entityId: string;
  onConfirm: (config: SubgridConfig, label: string) => void;
  onClose: () => void;
}

type Step = 'relationship' | 'view' | 'quick_create';

interface QuickCreateFormOption {
  form_id: string;
  name: string;
}

export default function SubgridPickerModal({
  entityId,
  onConfirm,
  onClose,
}: SubgridPickerModalProps) {
  const [step, setStep] = useState<Step>('relationship');
  const [selectedRel, setSelectedRel] = useState<RelationshipDefinitionWithEntities | null>(null);

  const [relationships, setRelationships] = useState<RelationshipDefinitionWithEntities[]>([]);
  const [loadingRels, setLoadingRels] = useState(true);

  const [views, setViews] = useState<ViewDefinition[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [loadingViews, setLoadingViews] = useState(false);

  const [quickCreateForms, setQuickCreateForms] = useState<QuickCreateFormOption[]>([]);
  const [selectedQuickCreateFormId, setSelectedQuickCreateFormId] = useState<string | null>(null);
  const [loadingQCForms, setLoadingQCForms] = useState(false);

  const [targetEntityId, setTargetEntityId] = useState<string | null>(null);

  // Load all relationships for this entity on mount
  useEffect(() => {
    setLoadingRels(true);
    fetchRelationshipsForEntity(entityId)
      .then(setRelationships)
      .catch(() => setRelationships([]))
      .finally(() => setLoadingRels(false));
  }, [entityId]);

  // Subgrids show child records — only 1:N where current entity is the parent (source)
  const subgridCandidates = relationships.filter(
    (r) => r.source_entity_id === entityId && r.relationship_type === '1:N'
  );

  const handleSelectRelationship = async (rel: RelationshipDefinitionWithEntities) => {
    setSelectedRel(rel);
    setLoadingViews(true);
    setStep('view');
    setSelectedViewId(null);
    setSelectedQuickCreateFormId(null);
    setQuickCreateForms([]);

    const relTargetEntityId = rel.target_entity_id;
    setTargetEntityId(relTargetEntityId);

    try {
      const v = await fetchViewsForEntity(relTargetEntityId);
      setViews(v.filter((vd) => vd.is_active && !vd.deleted_at));
    } catch {
      setViews([]);
    } finally {
      setLoadingViews(false);
    }
  };

  const handleGoToQuickCreate = async () => {
    if (!targetEntityId) return;
    setStep('quick_create');
    if (quickCreateForms.length === 0) {
      setLoadingQCForms(true);
      try {
        const forms = await fetchQuickCreateFormsForEntity(targetEntityId);
        setQuickCreateForms(forms);
      } catch {
        setQuickCreateForms([]);
      } finally {
        setLoadingQCForms(false);
      }
    }
  };

  const handleConfirm = async () => {
    if (!selectedRel) return;

    let fkColumn = selectedRel.lookup_field_physical_column ?? '';
    if (!fkColumn && selectedRel.source_lookup_field_id) {
      const { data } = await supabase
        .from('field_definition')
        .select('physical_column_name')
        .eq('field_definition_id', selectedRel.source_lookup_field_id)
        .maybeSingle();
      fkColumn = (data as { physical_column_name: string } | null)?.physical_column_name ?? '';
    }

    const relatedEntityName = selectedRel.target_entity_name ?? '';
    const relatedEntityId = selectedRel.target_entity_id;

    const config: SubgridConfig = {
      related_entity_id: relatedEntityId,
      related_entity_name: relatedEntityName,
      relationship_field: fkColumn,
      relationship_definition_id: selectedRel.relationship_definition_id,
      rows_to_show: 8,
      allow_create: true,
      allow_associate: false,
      view_id: selectedViewId ?? undefined,
      quick_create_form_id: selectedQuickCreateFormId ?? undefined,
    };

    const label = selectedRel.display_name || selectedRel.reverse_display_name || relatedEntityName;
    onConfirm(config, label);
  };

  const stepLabel = {
    relationship: 'Step 1 of 3 — Choose related table',
    view: 'Step 2 of 3 — Choose default view',
    quick_create: 'Step 3 of 3 — Choose Quick Create form',
  }[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[82vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <LayoutGrid size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Add Subgrid</p>
              <p className="text-[11px] text-slate-400">{stepLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-5 py-2.5 border-b border-slate-100 bg-slate-50">
          <StepDot active={step === 'relationship'} done={step === 'view' || step === 'quick_create'} label="Related Table" />
          <div className="flex-1 h-px bg-slate-200 mx-2" />
          <StepDot active={step === 'view'} done={step === 'quick_create'} label="Default View" />
          <div className="flex-1 h-px bg-slate-200 mx-2" />
          <StepDot active={step === 'quick_create'} done={false} label="Quick Create" />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* Step 1: Relationship */}
          {step === 'relationship' && (
            <>
              {loadingRels ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-blue-400" />
                </div>
              ) : subgridCandidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <AlertCircle size={32} className="text-slate-200 mb-3" />
                  <p className="text-sm font-medium text-slate-500">No 1:N relationships found</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    Add a lookup field on a child entity pointing to this entity, or create a
                    1:N relationship in the Relationship Designer.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 mb-3">
                    Select a related table to display as a subgrid. Shows 1:N relationships where this entity is the parent.
                  </p>
                  {subgridCandidates.map((rel) => {
                    const relatedName = rel.target_entity_display_name;
                    const fkInfo = rel.lookup_field_display_name
                      ? `via ${rel.lookup_field_display_name}`
                      : rel.lookup_field_physical_column
                      ? `via ${rel.lookup_field_physical_column}`
                      : '';

                    return (
                      <button
                        key={rel.relationship_definition_id}
                        onClick={() => handleSelectRelationship(rel)}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left group"
                      >
                        <div className="w-9 h-9 rounded-lg bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center shrink-0 transition-colors">
                          <Link size={16} className="text-slate-500 group-hover:text-blue-600 transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-700">{relatedName}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {rel.display_name}
                            {fkInfo && <span className="text-slate-300"> · {fkInfo}</span>}
                          </p>
                          <p className="text-[10px] font-mono text-slate-300 mt-0.5">{rel.target_entity_name}</p>
                        </div>
                        <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-400 shrink-0 transition-colors" />
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Step 2: View */}
          {step === 'view' && selectedRel && (
            <>
              <RelBreadcrumb rel={selectedRel} onReset={() => { setStep('relationship'); setSelectedRel(null); }} />

              {loadingViews ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-blue-400" />
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 mb-3">
                    Choose a view to define which columns and filters appear in the subgrid.
                    Leave as default to use the entity's default view.
                  </p>

                  <SelectionCard
                    selected={selectedViewId === null}
                    onClick={() => setSelectedViewId(null)}
                    icon={<LayoutGrid size={14} />}
                    title="Use Default View"
                    subtitle="Automatically uses the entity's default view"
                  />

                  {views.map((v) => (
                    <SelectionCard
                      key={v.view_id}
                      selected={selectedViewId === v.view_id}
                      onClick={() => setSelectedViewId(v.view_id)}
                      icon={<LayoutGrid size={14} />}
                      title={v.name}
                      subtitle={`${v.view_type} view`}
                      badge={v.is_default ? 'Default' : undefined}
                    />
                  ))}

                  {views.length === 0 && (
                    <p className="text-xs text-slate-400 italic text-center py-4">
                      No views defined — the default system view will be used.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Step 3: Quick Create Form */}
          {step === 'quick_create' && selectedRel && (
            <>
              <RelBreadcrumb rel={selectedRel} onReset={() => { setStep('relationship'); setSelectedRel(null); }} />

              {loadingQCForms ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-blue-400" />
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 mb-3">
                    Choose a Quick Create form to display when users click "+ New" in the subgrid.
                    Leave as none to use a simple name-only inline create.
                  </p>

                  <SelectionCard
                    selected={selectedQuickCreateFormId === null}
                    onClick={() => setSelectedQuickCreateFormId(null)}
                    icon={<Zap size={14} />}
                    title="Simple Quick Create"
                    subtitle="Shows a minimal inline name field"
                  />

                  {quickCreateForms.map((f) => (
                    <SelectionCard
                      key={f.form_id}
                      selected={selectedQuickCreateFormId === f.form_id}
                      onClick={() => setSelectedQuickCreateFormId(f.form_id)}
                      icon={<FileText size={14} />}
                      title={f.name}
                      subtitle="Quick Create form"
                    />
                  ))}

                  {quickCreateForms.length === 0 && (
                    <p className="text-xs text-slate-400 italic text-center py-4">
                      No Quick Create forms defined for this entity.
                      You can create one in the Form Designer with type "Quick Create".
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <button
            onClick={() => {
              if (step === 'relationship') onClose();
              else if (step === 'view') setStep('relationship');
              else if (step === 'quick_create') setStep('view');
            }}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-white transition-colors"
          >
            {step === 'relationship' ? 'Cancel' : 'Back'}
          </button>

          {step === 'view' && (
            <button
              onClick={handleGoToQuickCreate}
              disabled={!selectedRel}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              Next
              <ChevronRight size={14} />
            </button>
          )}

          {step === 'quick_create' && (
            <button
              onClick={handleConfirm}
              disabled={!selectedRel}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <LayoutGrid size={14} />
              Add Subgrid
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RelBreadcrumb({
  rel, onReset,
}: {
  rel: RelationshipDefinitionWithEntities;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
      <Link size={13} className="text-blue-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-blue-800 truncate">{rel.display_name}</p>
        <p className="text-[11px] text-blue-500">{rel.target_entity_display_name}</p>
      </div>
      <button
        onClick={onReset}
        className="text-[11px] text-blue-600 hover:text-blue-800 font-medium shrink-0"
      >
        Change
      </button>
    </div>
  );
}

function SelectionCard({
  selected, onClick, icon, title, subtitle, badge,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
        selected
          ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selected ? 'bg-blue-100' : 'bg-slate-100'}`}>
        <span className={selected ? 'text-blue-600' : 'text-slate-400'}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-semibold ${selected ? 'text-blue-700' : 'text-slate-700'}`}>{title}</p>
          {badge && (
            <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
              {badge}
            </span>
          )}
        </div>
        {subtitle && <p className="text-[11px] text-slate-400 capitalize">{subtitle}</p>}
      </div>
      {selected && (
        <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
          <span className="text-white text-[8px] font-bold">✓</span>
        </div>
      )}
    </button>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
        done ? 'bg-emerald-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'
      }`}>
        {done ? '✓' : active ? '●' : '○'}
      </div>
      <span className={`text-[10px] font-medium ${active ? 'text-slate-700' : done ? 'text-emerald-600' : 'text-slate-400'}`}>
        {label}
      </span>
    </div>
  );
}
