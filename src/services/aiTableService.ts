// src/services/aiTableService.ts
// "Create a table with AI" — provisioning half of the feature.
//
//  applyAiTable(spec, on) → provisions a table spec end-to-end through the SAME
//                           services the manual designer uses: create the entity +
//                           physical table, bootstrap system fields/views/main form,
//                           create each column (with its physical DB column), then
//                           add those columns to the default main form so it isn't
//                           empty.
//
// The spec itself is produced in-system by ../admin/entities/aiTableParser.ts — a
// browser-side prompt parser. Nothing here calls an external AI service, so no API
// key is required; everything runs inside the system.

import { supabase } from '../lib/supabase';
import type { EntityDefinition, EntityFormData } from '../types/entity';
import type { ChoiceOption, FieldFormData, FieldType, FieldDefinition } from '../types/field';
import { createEntityWithTable } from './entityService';
import { bootstrapEntity } from './bootstrapEntityService';
import { createField, fetchFieldTypes } from './fieldService';
import { invalidateAllMetadataCaches } from '../app/services/metadata/cacheBus';

export type AiTableFieldType =
  | 'text' | 'long_text' | 'whole_number' | 'decimal' | 'currency'
  | 'date' | 'datetime' | 'boolean' | 'email' | 'phone' | 'url' | 'choice';

export interface AiTableField {
  display_name: string;
  logical_name: string;
  type: AiTableFieldType;
  required: boolean;
  description: string | null;
  choices?: string[];
}

export interface AiTableSpec {
  display_name: string;
  display_name_plural: string;
  logical_name: string;
  physical_table_name: string;
  primary_field_label: string;
  description: string | null;
  ownership_type: 'user' | 'team' | 'organization';
  fields: AiTableField[];
}

// Steps surfaced to the modal so the user sees progress while we provision.
export type ApplyStep =
  | 'entity'      // create table + metadata
  | 'bootstrap'   // system fields, views, default forms
  | 'fields'      // create each AI column
  | 'form';       // add the columns to the main form

export interface ApplyProgress {
  step: ApplyStep;
  status: 'running' | 'done';
  detail?: string;
}

/** Build a full FieldFormData for one AI column, defaulting everything createField needs. */
function toFieldForm(
  entityId: string,
  fieldTypeId: string,
  f: AiTableField,
  sortOrder: number,
): { form: FieldFormData; choices: ChoiceOption[] } {
  const choices: ChoiceOption[] =
    f.type === 'choice' && f.choices
      ? f.choices.map((label, i) => ({ value: String(i + 1), label, sort_order: i }))
      : [];

  const form: FieldFormData = {
    entity_definition_id: entityId,
    field_type_id: fieldTypeId,
    lookup_entity_id: null,
    logical_name: f.logical_name,
    display_name: f.display_name,
    physical_column_name: f.logical_name,
    description: f.description,
    placeholder: null,
    default_value: null,
    max_length: null,
    min_value: null,
    max_value: null,
    is_required: f.required,
    is_searchable: f.type === 'text' || f.type === 'long_text' || f.type === 'email',
    is_sortable: true,
    is_filterable: true,
    is_active: true,
    is_secured: false,
    sort_order: sortOrder,
    validation_rules: null,
    inline_choices: choices,
    config_json: null,
  };
  return { form, choices };
}

/** Append the freshly-created columns to the entity's default main form's General section. */
async function addFieldsToMainForm(entityId: string, created: FieldDefinition[]): Promise<void> {
  if (created.length === 0) return;

  const { data: form } = await supabase
    .from('form_definition')
    .select('form_id, layout_json')
    .eq('entity_definition_id', entityId)
    .eq('form_type', 'main')
    .eq('is_system', true)
    .maybeSingle();

  if (!form) return;
  const layout = (form as { form_id: string; layout_json: unknown }).layout_json as {
    tabs?: Array<{ id?: string; sections?: Array<{ id?: string; controls?: unknown[] }> }>;
  } | null;
  if (!layout?.tabs?.length) return;

  // The bootstrap layout puts the primary field in tab_general → sec_main.
  const generalTab = layout.tabs.find((t) => t.id === 'tab_general') ?? layout.tabs[0];
  const section = generalTab.sections?.find((s) => s.id === 'sec_main') ?? generalTab.sections?.[0];
  if (!section) return;
  if (!Array.isArray(section.controls)) section.controls = [];

  for (const fd of created) {
    const typeName = fd.field_type?.name ?? 'text';
    section.controls.push({
      id: `ctrl_${fd.logical_name}`,
      control_type: 'field',
      field_definition_id: fd.field_definition_id,
      field_logical_name: fd.logical_name,
      field_display_name: fd.display_name,
      field_type_name: typeName,
      label_override: null,
      column_span: typeName === 'long_text' ? 2 : 1,
      is_visible: true,
      is_readonly: false,
      is_required_override: fd.is_required,
      subgrid_config: null,
    });
  }

  await supabase
    .from('form_definition')
    .update({ layout_json: layout })
    .eq('form_id', (form as { form_id: string }).form_id);
}

/**
 * Provision the whole table the AI drafted. Idempotent building blocks, but call
 * once per spec. Reports coarse progress through `onProgress` for the modal.
 * Returns the created entity plus how many columns actually landed.
 */
export async function applyAiTable(
  spec: AiTableSpec,
  onProgress?: (p: ApplyProgress) => void,
): Promise<{ entity: EntityDefinition; fieldsCreated: number; fieldErrors: string[] }> {
  const emit = (step: ApplyStep, status: 'running' | 'done', detail?: string) =>
    onProgress?.({ step, status, detail });

  // 1. Entity + physical table.
  emit('entity', 'running');
  const entityForm: EntityFormData = {
    logical_name: spec.logical_name,
    display_name: spec.display_name,
    display_name_plural: spec.display_name_plural,
    physical_table_name: spec.physical_table_name,
    primary_field_name: 'name',
    description: spec.description,
    icon_name: null,
    ownership_type: spec.ownership_type,
    enable_activities: false,
    enable_notes: false,
    enable_audit: false,
    allow_timeline: false,
    documents_enabled: false,
    is_active: true,
  };
  const entity = await createEntityWithTable(entityForm);
  emit('entity', 'done');

  // 2. System fields, default views, default (primary-only) forms.
  emit('bootstrap', 'running');
  await bootstrapEntity(entity).catch(() => {});
  emit('bootstrap', 'done');

  // Give the primary "name" field the AI's friendlier label (best-effort).
  if (spec.primary_field_label && spec.primary_field_label !== 'Name') {
    await supabase
      .from('field_definition')
      .update({ display_name: spec.primary_field_label })
      .eq('entity_definition_id', entity.entity_definition_id)
      .eq('logical_name', 'name')
      .then(() => {}, () => {});
  }

  // 3. Create each AI column (physical DB column + metadata).
  emit('fields', 'running', `0 / ${spec.fields.length}`);
  const fieldTypes: FieldType[] = await fetchFieldTypes();
  const typeIdByName = new Map(fieldTypes.map((t) => [t.name, t.field_type_id]));
  const created: FieldDefinition[] = [];
  const fieldErrors: string[] = [];

  let order = 20; // primary field sits at sort_order 10 in bootstrap
  for (const f of spec.fields) {
    const typeId = typeIdByName.get(f.type) ?? typeIdByName.get('text');
    if (!typeId) {
      fieldErrors.push(`${f.display_name}: no field type available`);
      continue;
    }
    const { form, choices } = toFieldForm(entity.entity_definition_id, typeId, f, order);
    try {
      const fd = await createField(form, choices, fieldTypes);
      created.push(fd);
    } catch (e) {
      fieldErrors.push(`${f.display_name}: ${e instanceof Error ? e.message : 'failed'}`);
    }
    order += 10;
    emit('fields', 'running', `${created.length} / ${spec.fields.length}`);
  }
  emit('fields', 'done', `${created.length} / ${spec.fields.length}`);

  // 4. Put the new columns onto the default main form.
  emit('form', 'running');
  await addFieldsToMainForm(entity.entity_definition_id, created).catch(() => {});
  emit('form', 'done');

  // New entity + fields + form exist — drop runtime metadata caches so navigation,
  // list pages, and record forms resolve them without a reload.
  invalidateAllMetadataCaches();

  return { entity, fieldsCreated: created.length, fieldErrors };
}
