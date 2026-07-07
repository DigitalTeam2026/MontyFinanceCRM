import { useState, useEffect, useMemo } from 'react';
import { X, Link, ChevronRight, ChevronLeft, AlertCircle, Loader2, Search, Plus } from 'lucide-react';
import type { RelationshipDefinitionWithEntities } from '../../types/relationship';
import type { BorrowedFieldConfig } from '../../types/form';
import type { FieldDefinition } from '../../types/field';
import { fetchRelationshipsForEntity } from '../../services/relationshipService';
import { fetchFieldsForEntity } from '../../services/fieldService';
import { supabase } from '../../lib/supabase';

interface RelatedFieldPickerModalProps {
  /** entity_definition_id of the form's entity (the source of the N:1 relationship) */
  entityId: string;
  onConfirm: (config: BorrowedFieldConfig, label: string) => void;
  onClose: () => void;
}

type Step = 'relationship' | 'field';

/**
 * Two-step picker that adds a read-only field borrowed from a related entity onto a
 * form — mirrors the "Add Columns → Related" flow used for list views. Step 1 picks
 * an N:1 relationship where this entity is the source (has the FK); step 2 picks any
 * column on the related entity. The result is a BorrowedFieldConfig resolved at render
 * time by following the FK.
 */
export default function RelatedFieldPickerModal({
  entityId,
  onConfirm,
  onClose,
}: RelatedFieldPickerModalProps) {
  const [step, setStep] = useState<Step>('relationship');
  const [relationships, setRelationships] = useState<RelationshipDefinitionWithEntities[]>([]);
  const [loadingRels, setLoadingRels] = useState(true);

  const [selectedRel, setSelectedRel] = useState<RelationshipDefinitionWithEntities | null>(null);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [search, setSearch] = useState('');
  const [confirming, setConfirming] = useState(false);

  // Load relationships for this entity on mount
  useEffect(() => {
    setLoadingRels(true);
    fetchRelationshipsForEntity(entityId)
      .then(setRelationships)
      .catch(() => setRelationships([]))
      .finally(() => setLoadingRels(false));
  }, [entityId]);

  // Borrowed scalar fields only make sense over N:1 lookups FROM this entity
  // (this record points at exactly one related record via the FK).
  const candidates = useMemo(
    () => relationships.filter(
      (r) => r.source_entity_id === entityId && r.relationship_type === 'N:1',
    ),
    [relationships, entityId],
  );

  const handleSelectRelationship = async (rel: RelationshipDefinitionWithEntities) => {
    setSelectedRel(rel);
    setStep('field');
    setSearch('');
    setLoadingFields(true);
    try {
      const f = await fetchFieldsForEntity(rel.target_entity_id);
      setFields(f);
    } catch {
      setFields([]);
    } finally {
      setLoadingFields(false);
    }
  };

  const handlePickField = async (field: FieldDefinition) => {
    if (!selectedRel || confirming) return;
    setConfirming(true);
    try {
      // Resolve the FK physical column on THIS entity (same fallback the subgrid picker uses).
      let fkColumn = selectedRel.lookup_field_physical_column ?? '';
      if (!fkColumn && selectedRel.source_lookup_field_id) {
        const { data } = await supabase
          .from('field_definition')
          .select('physical_column_name')
          .eq('field_definition_id', selectedRel.source_lookup_field_id)
          .maybeSingle();
        fkColumn = (data as { physical_column_name: string } | null)?.physical_column_name ?? '';
      }

      // Resolve the related entity's physical table + primary key column.
      let table = selectedRel.target_entity_table_name ?? '';
      let pk = '';
      const { data: ent } = await supabase
        .from('entity_definition')
        .select('physical_table_name, primary_key_column')
        .eq('entity_definition_id', selectedRel.target_entity_id)
        .maybeSingle();
      if (ent) {
        table = (ent as { physical_table_name?: string }).physical_table_name ?? table;
        pk = (ent as { primary_key_column?: string }).primary_key_column ?? '';
      }
      if (!pk) pk = `${table}_id`;

      const config: BorrowedFieldConfig = {
        relationship_definition_id: selectedRel.relationship_definition_id,
        related_entity_id: selectedRel.target_entity_id,
        related_table_name: table,
        related_pk: pk,
        fk_physical_column: fkColumn,
        field_definition_id: field.field_definition_id,
        field_logical_name: field.logical_name,
        field_physical_column: field.physical_column_name ?? field.logical_name,
        field_type_name: field.field_type?.name ?? null,
      };
      const label = `${selectedRel.target_entity_display_name}: ${field.display_name}`;
      onConfirm(config, label);
    } finally {
      setConfirming(false);
    }
  };

  const filteredFields = useMemo(() => {
    const q = search.toLowerCase();
    return fields.filter(
      (f) =>
        f.display_name.toLowerCase().includes(q) ||
        f.logical_name.toLowerCase().includes(q),
    );
  }, [fields, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[82vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Link size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Add Related Field</p>
              <p className="text-[11px] text-slate-400">
                {step === 'relationship'
                  ? 'Step 1 of 2 — Choose related table'
                  : 'Step 2 of 2 — Choose a column (added read-only)'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Step 1: Relationship */}
          {step === 'relationship' && (
            loadingRels ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="animate-spin text-blue-400" />
              </div>
            ) : candidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <AlertCircle size={32} className="text-slate-200 mb-3" />
                <p className="text-sm font-medium text-slate-500">No related tables found</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  This entity has no N:1 lookup relationships. Add a lookup field pointing to
                  another entity, or create one in the Relationship Designer.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 mb-3">
                  Select a related table. Shows N:1 relationships where this entity points at one related record.
                </p>
                {candidates.map((rel) => {
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
                        <p className="text-sm font-semibold text-slate-700">{rel.target_entity_display_name}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {rel.display_name}
                          {fkInfo && <span className="text-slate-300"> · {fkInfo}</span>}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-400 shrink-0 transition-colors" />
                    </button>
                  );
                })}
              </div>
            )
          )}

          {/* Step 2: Field */}
          {step === 'field' && selectedRel && (
            <>
              <button
                onClick={() => { setStep('relationship'); setSelectedRel(null); setSearch(''); }}
                className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-[12px] text-slate-600 transition-colors"
              >
                <ChevronLeft size={13} />
                <span className="font-medium text-slate-700">{selectedRel.target_entity_display_name}</span>
                <span className="text-slate-400">— pick a column</span>
              </button>

              <div className="relative mb-3">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search fields..."
                  className="w-full pl-7 pr-3 py-2 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>

              {loadingFields ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-blue-400" />
                </div>
              ) : filteredFields.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-6">No fields found.</p>
              ) : (
                <div className="space-y-1">
                  {filteredFields.map((field) => (
                    <button
                      key={field.field_definition_id}
                      onClick={() => handlePickField(field)}
                      disabled={confirming}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-colors text-left group disabled:opacity-50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-slate-700 truncate">{field.display_name}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">
                          {field.field_type?.name ?? field.logical_name}
                        </p>
                      </div>
                      <Plus size={13} className="text-blue-400 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
                    </button>
                  ))}
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
              else { setStep('relationship'); setSelectedRel(null); setSearch(''); }
            }}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-white transition-colors"
          >
            {step === 'relationship' ? 'Cancel' : 'Back'}
          </button>
          <p className="text-[11px] text-slate-400">
            Added fields are always read-only.
          </p>
        </div>
      </div>
    </div>
  );
}
