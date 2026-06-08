import { useEffect, useState } from 'react';
import { Save, X, Info, Lock } from 'lucide-react';
import type {
  RelationshipDefinitionWithEntities,
  RelationshipFormData,
  RelationshipType,
  RelationshipStorageType,
} from '../../types/relationship';
import type { EntityDefinition } from '../../types/entity';
import type { FieldDefinition } from '../../types/field';
import { createRelationship, updateRelationship } from '../../services/relationshipService';
import { fetchEntities } from '../../services/entityService';
import { supabase } from '../../lib/supabase';

interface RelationshipEditorPageProps {
  relationship?: RelationshipDefinitionWithEntities;
  onSaved: () => void;
  onCancel: () => void;
}

const EMPTY_FORM: RelationshipFormData = {
  name: '',
  display_name: '',
  reverse_display_name: '',
  source_entity_id: '',
  target_entity_id: '',
  relationship_type: '1:N',
  relationship_storage_type: 'lookup',
  source_lookup_field_id: null,
  junction_table: null,
  junction_source_fk: null,
  junction_target_fk: null,
  is_active: true,
};

const TYPE_OPTIONS: { value: RelationshipType; label: string; hint: string }[] = [
  { value: '1:N', label: 'One-to-Many (1:N)', hint: 'One source record links to many target records' },
  { value: 'N:1', label: 'Many-to-One (N:1)', hint: 'Many source records link to one target record' },
  { value: 'N:N', label: 'Many-to-Many (N:N)', hint: 'Records on both sides link to many records on the other' },
];

function toMachineName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 _]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');
}

export default function RelationshipEditorPage({
  relationship,
  onSaved,
  onCancel,
}: RelationshipEditorPageProps) {
  const isNew = !relationship;
  const isSystem = relationship?.is_system ?? false;

  const [form, setForm] = useState<RelationshipFormData>(
    relationship
      ? {
          name: relationship.name,
          display_name: relationship.display_name,
          reverse_display_name: relationship.reverse_display_name,
          source_entity_id: relationship.source_entity_id,
          target_entity_id: relationship.target_entity_id,
          relationship_type: relationship.relationship_type,
          relationship_storage_type: relationship.relationship_storage_type,
          source_lookup_field_id: relationship.source_lookup_field_id,
          junction_table: relationship.junction_table,
          junction_source_fk: relationship.junction_source_fk,
          junction_target_fk: relationship.junction_target_fk,
          is_active: relationship.is_active,
        }
      : EMPTY_FORM
  );

  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [lookupFields, setLookupFields] = useState<FieldDefinition[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [loadingFields, setLoadingFields] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);

  useEffect(() => {
    fetchEntities()
      .then((list) => setEntities(list.filter((e) => e.is_active)))
      .catch(() => {})
      .finally(() => setLoadingEntities(false));
  }, []);

  // Load eligible lookup fields when source entity or storage type changes
  useEffect(() => {
    if (
      form.relationship_storage_type !== 'lookup' ||
      !form.source_entity_id ||
      !form.target_entity_id
    ) {
      setLookupFields([]);
      return;
    }

    setLoadingFields(true);

    // For 1:N: the FK is on the target entity pointing back to source
    // For N:1: the FK is on the source entity pointing to target
    const entityToQuery =
      form.relationship_type === '1:N' ? form.target_entity_id : form.source_entity_id;
    const lookupTarget =
      form.relationship_type === '1:N' ? form.source_entity_id : form.target_entity_id;

    supabase
      .from('field_definition')
      .select('field_definition_id, display_name, physical_column_name, lookup_entity_id, field_type:field_type_id(name)')
      .eq('entity_definition_id', entityToQuery)
      .is('deleted_at', null)
      .then(({ data }) => {
        // filter to lookup fields pointing to the right entity
        const lookups = (data ?? []).filter((f: FieldDefinition & { field_type?: { name: string } }) => {
          return (
            f.field_type?.name === 'lookup' &&
            f.lookup_entity_id === lookupTarget
          );
        });
        setLookupFields(lookups as unknown as FieldDefinition[]);
      })
      .finally(() => setLoadingFields(false));
  }, [form.source_entity_id, form.target_entity_id, form.relationship_type, form.relationship_storage_type]);

  const setField = <K extends keyof RelationshipFormData>(key: K, value: RelationshipFormData[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };

      // Auto-derive storage type from relationship type
      if (key === 'relationship_type') {
        next.relationship_storage_type = value === 'N:N' ? 'junction' : 'lookup';
        next.source_lookup_field_id = null;
        next.junction_table = null;
        next.junction_source_fk = null;
        next.junction_target_fk = null;
      }

      // Auto-generate name from display_name if not manually edited
      if (key === 'display_name' && !nameTouched) {
        next.name = toMachineName(value as string);
      }

      // Clear field picker if entities change
      if (key === 'source_entity_id' || key === 'target_entity_id') {
        next.source_lookup_field_id = null;
      }

      return next;
    });
  };

  const validate = (): string | null => {
    if (!form.name.trim()) return 'Machine name is required.';
    if (!form.display_name.trim()) return 'Display name is required.';
    if (!form.source_entity_id) return 'Source entity is required.';
    if (!form.target_entity_id) return 'Target entity is required.';
    if (form.source_entity_id === form.target_entity_id) return 'Source and target entities must be different.';
    if (form.relationship_storage_type === 'lookup' && !form.source_lookup_field_id) {
      return 'A lookup field must be selected for lookup-type relationships.';
    }
    if (form.relationship_storage_type === 'junction') {
      if (!form.junction_table?.trim()) return 'Junction table name is required.';
      if (!form.junction_source_fk?.trim()) return 'Junction source FK column is required.';
      if (!form.junction_target_fk?.trim()) return 'Junction target FK column is required.';
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await createRelationship(form);
      } else {
        await updateRelationship(relationship!.relationship_definition_id, form);
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const sourceEntity = entities.find((e) => e.entity_definition_id === form.source_entity_id);
  const targetEntity = entities.find((e) => e.entity_definition_id === form.target_entity_id);

  const lookupHint = form.relationship_type === '1:N'
    ? `Select a lookup field on "${targetEntity?.display_name ?? 'target entity'}" that points back to "${sourceEntity?.display_name ?? 'source entity'}"`
    : `Select a lookup field on "${sourceEntity?.display_name ?? 'source entity'}" that points to "${targetEntity?.display_name ?? 'target entity'}"`;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f3f4f6]">
      {/* Action bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 shrink-0">
        {isSystem ? (
          <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
            <Lock size={13} className="text-slate-400" />
            System relationships are read-only
          </div>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium rounded transition-colors disabled:opacity-50"
          >
            <Save size={13} /> {saving ? 'Saving…' : 'Save Relationship'}
          </button>
        )}
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-[12px] text-slate-700 rounded transition-colors"
        >
          <X size={13} /> Cancel
        </button>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-auto px-4 py-4">
        {error && (
          <div className="mb-4 px-3 py-2 bg-red-50 border border-red-300 text-red-700 text-[12px] rounded">
            {error}
          </div>
        )}

        {isSystem && (
          <div className="mb-4 flex items-start gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded text-[12px] text-slate-600">
            <Info size={14} className="text-slate-400 mt-0.5 shrink-0" />
            <span>
              This is a system relationship. Its metadata is shown for reference and cannot be modified.
              The two-step flow for registering new relationships: (1) create a lookup field in <strong>Fields</strong>,
              then (2) register it here as a new custom relationship.
            </span>
          </div>
        )}

        <div className="max-w-2xl space-y-5">

          {/* Names */}
          <Section title="Identity">
            <FormRow label="Display Name" required>
              <input
                type="text"
                value={form.display_name}
                onChange={(e) => setField('display_name', e.target.value)}
                disabled={isSystem}
                placeholder="e.g. Account → Contacts"
                className="w-full px-2.5 py-1.5 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
              />
            </FormRow>
            <FormRow label="Reverse Display Name">
              <input
                type="text"
                value={form.reverse_display_name}
                onChange={(e) => setField('reverse_display_name', e.target.value)}
                disabled={isSystem}
                placeholder="e.g. Contact's Account"
                className="w-full px-2.5 py-1.5 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
              />
            </FormRow>
            <FormRow label="Machine Name" required hint="Lowercase letters, numbers, and underscores only">
              <input
                type="text"
                value={form.name}
                onChange={(e) => {
                  setNameTouched(true);
                  setField('name', toMachineName(e.target.value));
                }}
                disabled={isSystem || !isNew}
                placeholder="e.g. account_contacts"
                className="w-full px-2.5 py-1.5 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 font-mono disabled:bg-slate-50 disabled:text-slate-400"
              />
              {!isNew && !isSystem && (
                <p className="mt-1 text-[10px] text-slate-400">Machine name cannot be changed after creation.</p>
              )}
            </FormRow>
          </Section>

          {/* Entities & type */}
          <Section title="Entities & Type">
            <FormRow label="Relationship Type" required>
              <div className="space-y-1.5">
                {TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-2.5 p-2.5 rounded border cursor-pointer transition-colors ${
                      form.relationship_type === opt.value
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    } ${isSystem ? 'cursor-default opacity-70' : ''}`}
                  >
                    <input
                      type="radio"
                      name="relationship_type"
                      value={opt.value}
                      checked={form.relationship_type === opt.value}
                      onChange={() => !isSystem && setField('relationship_type', opt.value as RelationshipType)}
                      disabled={isSystem}
                      className="mt-0.5 shrink-0"
                    />
                    <div>
                      <span className="text-[12px] font-semibold text-slate-700">{opt.label}</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">{opt.hint}</p>
                    </div>
                  </label>
                ))}
              </div>
            </FormRow>

            <FormRow label="Source Entity" required>
              {loadingEntities ? (
                <div className="text-[11px] text-slate-400">Loading entities…</div>
              ) : (
                <select
                  value={form.source_entity_id}
                  onChange={(e) => setField('source_entity_id', e.target.value)}
                  disabled={isSystem}
                  className="w-full px-2.5 py-1.5 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 bg-white disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">— Select entity —</option>
                  {entities.map((e) => (
                    <option key={e.entity_definition_id} value={e.entity_definition_id}>
                      {e.display_name}
                    </option>
                  ))}
                </select>
              )}
            </FormRow>

            <FormRow label="Target Entity" required>
              {loadingEntities ? (
                <div className="text-[11px] text-slate-400">Loading entities…</div>
              ) : (
                <select
                  value={form.target_entity_id}
                  onChange={(e) => setField('target_entity_id', e.target.value)}
                  disabled={isSystem}
                  className="w-full px-2.5 py-1.5 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 bg-white disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">— Select entity —</option>
                  {entities.map((e) => (
                    <option key={e.entity_definition_id} value={e.entity_definition_id}>
                      {e.display_name}
                    </option>
                  ))}
                </select>
              )}
            </FormRow>
          </Section>

          {/* Storage — lookup */}
          {form.relationship_storage_type === 'lookup' && (
            <Section title="Lookup Field">
              <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded text-[11px] text-blue-700">
                <Info size={13} className="mt-0.5 shrink-0" />
                <span>
                  {form.source_entity_id && form.target_entity_id
                    ? lookupHint
                    : 'Select source and target entities first to see eligible fields.'}
                  {' '}If the field does not exist yet, create it first in <strong>Fields</strong>.
                </span>
              </div>

              <FormRow label="Linking Field" required>
                {loadingFields ? (
                  <div className="text-[11px] text-slate-400">Loading fields…</div>
                ) : (
                  <select
                    value={form.source_lookup_field_id ?? ''}
                    onChange={(e) => setField('source_lookup_field_id', e.target.value || null)}
                    disabled={isSystem || !form.source_entity_id || !form.target_entity_id}
                    className="w-full px-2.5 py-1.5 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 bg-white disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">— Select lookup field —</option>
                    {lookupFields.map((f) => (
                      <option key={f.field_definition_id} value={f.field_definition_id}>
                        {f.display_name} ({f.physical_column_name})
                      </option>
                    ))}
                  </select>
                )}
                {!loadingFields && lookupFields.length === 0 && form.source_entity_id && form.target_entity_id && (
                  <p className="mt-1 text-[11px] text-amber-600">
                    No eligible lookup fields found. Create the lookup field in <strong>Fields</strong> first.
                  </p>
                )}
              </FormRow>
            </Section>
          )}

          {/* Storage — junction */}
          {form.relationship_storage_type === 'junction' && (
            <Section title="Junction Table">
              <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded text-[11px] text-blue-700">
                <Info size={13} className="mt-0.5 shrink-0" />
                <span>
                  For N:N relationships, provide the name of the junction table and the FK column names
                  that point to each side. The junction table must already exist in the database.
                </span>
              </div>

              <FormRow label="Junction Table" required hint="Physical table name, e.g. opportunity_contact">
                <input
                  type="text"
                  value={form.junction_table ?? ''}
                  onChange={(e) => setField('junction_table', e.target.value || null)}
                  disabled={isSystem}
                  placeholder="e.g. opportunity_contact"
                  className="w-full px-2.5 py-1.5 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 font-mono disabled:bg-slate-50 disabled:text-slate-400"
                />
              </FormRow>
              <FormRow label="Source FK Column" required hint={`FK column pointing to the source (${sourceEntity?.display_name ?? 'source'})`}>
                <input
                  type="text"
                  value={form.junction_source_fk ?? ''}
                  onChange={(e) => setField('junction_source_fk', e.target.value || null)}
                  disabled={isSystem}
                  placeholder="e.g. opportunity_id"
                  className="w-full px-2.5 py-1.5 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 font-mono disabled:bg-slate-50 disabled:text-slate-400"
                />
              </FormRow>
              <FormRow label="Target FK Column" required hint={`FK column pointing to the target (${targetEntity?.display_name ?? 'target'})`}>
                <input
                  type="text"
                  value={form.junction_target_fk ?? ''}
                  onChange={(e) => setField('junction_target_fk', e.target.value || null)}
                  disabled={isSystem}
                  placeholder="e.g. contact_id"
                  className="w-full px-2.5 py-1.5 text-[12px] border border-slate-300 rounded focus:outline-none focus:border-blue-400 font-mono disabled:bg-slate-50 disabled:text-slate-400"
                />
              </FormRow>
            </Section>
          )}

          {/* Settings */}
          <Section title="Settings">
            <FormRow label="Status">
              <label className={`flex items-center gap-2 cursor-pointer ${isSystem ? 'cursor-default' : ''}`}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => !isSystem && setField('is_active', e.target.checked)}
                  disabled={isSystem}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
                />
                <span className="text-[12px] text-slate-700">Active — visible in admin and available to engines</span>
              </label>
            </FormRow>
          </Section>

        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
        <h3 className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="px-4 py-4 space-y-3.5">{children}</div>
    </div>
  );
}

function FormRow({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 items-start">
      <div className="pt-1.5">
        <label className="text-[12px] font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {hint && <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}
