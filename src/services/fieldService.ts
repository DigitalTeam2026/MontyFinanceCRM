import { supabase } from '../lib/supabase';
import type {
  FieldDefinition, FieldFormData, FieldType, ChoiceOption, CalculationConfig, CalcResultType,
} from '../types/field';

// A calculated column's physical type is driven by the chosen result type.
const CALC_RESULT_SQL_TYPE: Record<CalcResultType, string> = {
  number: 'decimal',
  currency: 'currency',
  date: 'date',
  boolean: 'boolean',
  text: 'text',
  choice: 'text',
};

/** SQL field-type name to provision the physical column with for a given field. */
function resolveColumnTypeName(form: FieldFormData, fieldTypeName: string): string {
  if (fieldTypeName !== 'calculated') return fieldTypeName;
  const calc = (form.config_json as { calculation?: CalculationConfig } | null)?.calculation;
  const rt = calc?.resultType ?? 'text';
  return CALC_RESULT_SQL_TYPE[rt] ?? 'text';
}

/** Ensure the calculation trigger is attached to the entity's table (best-effort). */
async function ensureCalcTrigger(table: string): Promise<void> {
  try { await supabase.rpc('ensure_calc_trigger', { p_table: table }); } catch { /* non-fatal */ }
}

export async function fetchFieldTypes(): Promise<FieldType[]> {
  const { data, error } = await supabase
    .from('field_type')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data as FieldType[];
}

export async function fetchFieldsForEntity(entityId: string): Promise<FieldDefinition[]> {
  const { data, error } = await supabase
    .from('field_definition')
    .select('*, field_type(*), lookup_entity:entity_definition!lookup_entity_id(physical_table_name, primary_field_name)')
    .eq('entity_definition_id', entityId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('display_name', { ascending: true });
  if (error) throw error;
  return data as FieldDefinition[];
}

async function resolveEntityTable(entityDefinitionId: string): Promise<string | null> {
  const { data } = await supabase
    .from('entity_definition')
    .select('physical_table_name')
    .eq('entity_definition_id', entityDefinitionId)
    .maybeSingle();
  return data?.physical_table_name ?? null;
}

async function addPhysicalColumn(
  table: string,
  column: string,
  fieldTypeName: string
): Promise<void> {
  const { data, error } = await supabase.rpc('add_custom_field_column', {
    p_table: table,
    p_column: column,
    p_type: fieldTypeName,
  });
  if (error) throw new Error(`Failed to create database column: ${error.message}`);
  const result = data as { ok: boolean; error?: string } | null;
  if (result && !result.ok) throw new Error(result.error ?? 'Failed to create database column');
}

export async function createField(
  form: FieldFormData,
  inlineChoices: ChoiceOption[],
  fieldTypes: FieldType[]
): Promise<FieldDefinition> {
  const payload = buildPayload(form, inlineChoices);

  // Resolve the physical table for this entity so we can ALTER TABLE
  const table = await resolveEntityTable(payload.entity_definition_id);
  if (!table) throw new Error('Could not resolve entity table');

  // The physical column name is the logical name (user-chosen schema name)
  const physicalColumn = payload.logical_name;

  // Get the field type name for SQL type mapping
  const fieldType = fieldTypes.find((t) => t.field_type_id === payload.field_type_id);
  const fieldTypeName = fieldType?.name ?? 'text';
  // For calculated fields the physical column type follows the chosen result type.
  const columnTypeName = resolveColumnTypeName(form, fieldTypeName);
  const isCalculated = fieldTypeName === 'calculated';

  // Check if a soft-deleted field with the same logical_name exists for this entity
  const { data: existing } = await supabase
    .from('field_definition')
    .select('field_definition_id, physical_column_name')
    .eq('entity_definition_id', payload.entity_definition_id)
    .eq('logical_name', payload.logical_name)
    .not('deleted_at', 'is', null)
    .maybeSingle();

  if (existing) {
    // Ensure the physical column exists (may have been dropped or field was JSONB previously)
    await addPhysicalColumn(table, physicalColumn, columnTypeName);

    const { data, error } = await supabase
      .from('field_definition')
      .update({
        ...payload,
        is_custom: true,
        physical_column_name: physicalColumn,
        deleted_at: null,
        is_active: true,
        modified_at: new Date().toISOString(),
      })
      .eq('field_definition_id', existing.field_definition_id)
      .select('*, field_type(*)')
      .single();
    if (error) throw error;
    if (isCalculated) await ensureCalcTrigger(table);
    return data as FieldDefinition;
  }

  // Create the physical column first — metadata only becomes active after column exists
  await addPhysicalColumn(table, physicalColumn, columnTypeName);

  const { data, error } = await supabase
    .from('field_definition')
    .insert({
      ...payload,
      is_custom: true,
      physical_column_name: physicalColumn,
    })
    .select('*, field_type(*)')
    .single();
  if (error) throw error;
  if (isCalculated) await ensureCalcTrigger(table);
  return data as FieldDefinition;
}

export async function updateField(
  id: string,
  form: FieldFormData,
  inlineChoices: ChoiceOption[]
): Promise<FieldDefinition> {
  const payload = buildPayload(form, inlineChoices);
  const { data, error } = await supabase
    .from('field_definition')
    .update({ ...payload, modified_at: new Date().toISOString() })
    .eq('field_definition_id', id)
    .select('*, field_type(*)')
    .single();
  if (error) throw error;
  const saved = data as FieldDefinition;
  // Make sure the calculation trigger is attached to this entity's table.
  if (saved.field_type?.name === 'calculated') {
    const table = await resolveEntityTable(saved.entity_definition_id);
    if (table) await ensureCalcTrigger(table);
  }
  return saved;
}

export async function softDeleteField(id: string): Promise<void> {
  const { error } = await supabase
    .from('field_definition')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('field_definition_id', id);
  if (error) throw error;
}

function buildPayload(form: FieldFormData, inlineChoices: ChoiceOption[]) {
  const { inline_choices, ...rest } = form;
  return {
    ...rest,
    config_json:
      inlineChoices.length > 0 ? { choices: inlineChoices } : rest.config_json ?? null,
  };
}
