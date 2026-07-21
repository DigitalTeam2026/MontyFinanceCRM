import { supabase } from '../lib/supabase';
import type {
  FieldDefinition, FieldFormData, FieldType, ChoiceOption, CalculationConfig, CalcResultType,
} from '../types/field';
import { reloadPostgrestSchema } from './schemaService';

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
  // No entity bound yet (e.g. a flow whose table is picked later) → no fields.
  if (!entityId) return [];
  const { data, error } = await supabase
    .from('field_definition')
    .select('*, field_type(*), lookup_entity:entity_definition!lookup_entity_id(physical_table_name, primary_field_name, primary_key_column)')
    .eq('entity_definition_id', entityId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('display_name', { ascending: true });
  if (error) throw error;
  return data as FieldDefinition[];
}

/**
 * How many column-secured (is_secured) fields each entity has, keyed by
 * entity_definition_id. Entities with none are absent from the map.
 * Used by the column-security editor so it only offers securable columns.
 */
export async function fetchSecuredFieldCountsByEntity(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('field_definition')
    .select('entity_definition_id')
    .eq('is_secured', true)
    .eq('is_active', true)
    .is('deleted_at', null);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { entity_definition_id: string }[]) {
    counts[row.entity_definition_id] = (counts[row.entity_definition_id] ?? 0) + 1;
  }
  return counts;
}

// ── Column reconciliation ──────────────────────────────────────────────────────
// CRM metadata (field_definition) is the source of truth, but physical tables can
// drift ahead of it (e.g. a migration adds a column without a field_definition).
// These helpers reconcile the live schema into metadata generically for ANY entity.

export interface ReconcileResult {
  ok: boolean;
  entityId: string;
  logicalName: string;
  physicalTableName: string;
  dbColumnCount: number;
  metadataCount: number;
  created: { column: string; display_name: string; field_type: string; is_lookup: boolean }[];
}

export interface DbColumnInfo {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  ordinal_position: number;
  has_metadata: boolean;
}

/** Read-only diff: every physical column of the entity's table + whether metadata maps it. */
export async function fetchEntityDbColumns(entityId: string): Promise<DbColumnInfo[]> {
  const { data, error } = await supabase.rpc('get_entity_db_columns', { p_entity_id: entityId });
  if (error) throw error;
  return (data ?? []) as DbColumnInfo[];
}

/** Create missing field_definition records from the live schema. Idempotent + non-destructive. */
export async function reconcileEntityColumns(entityId: string): Promise<ReconcileResult> {
  const { data, error } = await supabase.rpc('reconcile_entity_columns', { p_entity_id: entityId });
  if (error) throw error;
  const r = data as {
    ok: boolean; error?: string; entity_id: string; logical_name: string;
    physical_table_name: string; db_column_count: number; metadata_count: number;
    created: ReconcileResult['created'];
  } | null;
  if (!r || !r.ok) throw new Error(r?.error ?? 'Column reconciliation failed');
  return {
    ok: true,
    entityId: r.entity_id,
    logicalName: r.logical_name,
    physicalTableName: r.physical_table_name,
    dbColumnCount: r.db_column_count,
    metadataCount: r.metadata_count,
    created: r.created ?? [],
  };
}

/**
 * Load every column for the Admin Studio grid: reconcile the live schema into
 * metadata first (so orphaned physical columns become visible), then read the
 * metadata that remains the source of truth. Reconciliation is best-effort —
 * if the caller lacks admin rights it is skipped and metadata is shown as-is.
 *
 * `reconcile: false` skips the mutation and only loads + logs the current diff.
 */
export async function loadEntityColumns(
  entityId: string,
  opts: { reconcile?: boolean } = {},
): Promise<{ fields: FieldDefinition[]; reconcile: ReconcileResult | null }> {
  const doReconcile = opts.reconcile !== false;

  let reconcile: ReconcileResult | null = null;
  if (doReconcile) {
    try {
      reconcile = await reconcileEntityColumns(entityId);
    } catch (e) {
      console.warn('[Columns] reconcile skipped:', e instanceof Error ? e.message : e);
    }
  }

  const fields = await fetchFieldsForEntity(entityId);

  // Diagnostic diff (best-effort) — surfaces any column still unmatched after reconcile
  // (engine-internal columns are intentionally excluded from metadata).
  let unmatched: string[] = [];
  let dbColumnCount = reconcile?.dbColumnCount;
  try {
    const dbCols = await fetchEntityDbColumns(entityId);
    dbColumnCount = dbCols.length;
    unmatched = dbCols.filter((c) => !c.has_metadata).map((c) => c.column_name);
  } catch { /* introspection is non-fatal */ }

  console.info('[Columns] entity load', {
    entityId,
    logicalName: reconcile?.logicalName,
    physicalTableName: reconcile?.physicalTableName,
    dbColumnCount,
    metadataColumnCount: fields.length,
    created: reconcile?.created.map((c) => c.column) ?? [],
    unmatched,
  });

  return { fields, reconcile };
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
  // The column now exists in Postgres but the Data API (PostgREST) won't see it until
  // its schema cache reloads — without this, writes to the new column are silently
  // dropped / rejected. Best-effort; the runtime also self-heals on a stale-cache error.
  await reloadPostgrestSchema();
}

/** Best-effort rollback of a physical column created during a failed createField(). */
async function dropPhysicalColumn(table: string, column: string): Promise<void> {
  try { await supabase.rpc('drop_field_column', { p_table: table, p_column: column }); }
  catch { /* rollback is best-effort */ }
}

/**
 * Whether the entity's physical column holds any data (at least one non-null value).
 * Used by the field editor to lock the data type once a column is populated —
 * changing a type under existing data would corrupt or fail to convert it.
 * Counts every row (including soft-deleted) because the physical value is still there.
 * Returns false for JSONB-mapped columns (physical_column_name like 'x.y') and on any error.
 */
export async function fieldColumnHasData(table: string, column: string): Promise<boolean> {
  if (!table || !column || column.includes('.')) return false;
  try {
    const { count, error } = await supabase
      .from(table)
      .select(column, { count: 'exact', head: true })
      .not(column, 'is', null);
    if (error) throw error;
    return (count ?? 0) > 0;
  } catch (e) {
    console.warn('[Columns] has-data check failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Whether a physical column already exists on the entity's table (pre-creation check). */
async function columnExists(entityId: string, column: string): Promise<boolean> {
  try {
    const cols = await fetchEntityDbColumns(entityId);
    return cols.some((c) => c.column_name === column);
  } catch { return false; }
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

  // Create the physical column first — metadata only becomes active after column exists.
  // Track whether the column pre-existed so a metadata failure only rolls back a column
  // we actually created in this call (never drops a column that already held data).
  const preExisted = await columnExists(payload.entity_definition_id, physicalColumn);
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
  if (error) {
    // Metadata insert failed — roll back the just-created (empty) physical column so the
    // database and CRM metadata don't drift. Then surface a clear, combined error.
    if (!preExisted) await dropPhysicalColumn(table, physicalColumn);
    throw new Error(
      `Column metadata could not be saved${preExisted ? '' : ' (physical column rolled back)'}: ${error.message}`,
    );
  }
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

/**
 * Reclassify a field as custom or system. Converting to custom also makes it
 * deletable and schema-editable (so it behaves like a user-created column);
 * converting back to system locks those off. Metadata-only — no schema change.
 */
export async function setFieldClassification(id: string, isCustom: boolean): Promise<void> {
  const { error } = await supabase
    .from('field_definition')
    .update({
      is_custom: isCustom,
      is_system: !isCustom,
      is_deletable: isCustom,
      is_schema_editable: isCustom,
      modified_at: new Date().toISOString(),
    })
    .eq('field_definition_id', id);
  if (error) throw error;
}

/**
 * Delete a column: drop the physical database column AND remove its metadata.
 *
 * Order matters — drop the physical column first so we never end up with metadata
 * pointing at a column we failed to remove. The metadata is soft-deleted (deleted_at)
 * so the create flow can still resurrect a same-named field later. JSONB-stored
 * custom fields (physical_column_name like 'custom_fields.x') have no real column to
 * drop and are skipped.
 */
export async function softDeleteField(field: FieldDefinition): Promise<void> {
  const phys = field.physical_column_name;
  const isPhysicalColumn = !!phys && !phys.includes('.');

  if (isPhysicalColumn) {
    const table = await resolveEntityTable(field.entity_definition_id);
    if (table) {
      const { data, error } = await supabase.rpc('drop_field_column', {
        p_table: table,
        p_column: phys,
        // Deliberate user delete: cascade so the column's own dependents
        // (FK, indexes, and any WHEN-clause trigger like the product-access
        // validator) are removed with it. The create-flow rollback path below
        // deliberately omits this and keeps the safe non-cascade default.
        p_cascade: true,
      });
      if (error) throw new Error(`Failed to drop database column: ${error.message}`);
      const r = data as { ok: boolean; error?: string } | null;
      if (r && !r.ok) throw new Error(r.error ?? 'Failed to drop database column');
    }
  }

  const { error } = await supabase
    .from('field_definition')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('field_definition_id', field.field_definition_id);
  if (error) throw error;
}

/**
 * System Health repair — re-create the physical database column for a field whose
 * metadata exists but whose column is missing ("Fields with no database column").
 * The column type is taken from the field's own type, then the API schema cache is
 * reloaded. Additive and safe to re-run (add_custom_field_column is IF NOT EXISTS).
 */
export async function recreateFieldColumn(fieldId: string): Promise<void> {
  const { data, error } = await supabase
    .from('field_definition')
    .select('physical_column_name, entity_definition_id, field_type:field_type(name)')
    .eq('field_definition_id', fieldId)
    .single();
  if (error) throw error;
  const field = data as {
    physical_column_name: string | null;
    entity_definition_id: string;
    field_type: { name: string } | null;
  };
  const phys = field.physical_column_name;
  if (!phys || phys.includes('.')) {
    throw new Error('Field has no physical column to create (JSONB or unmapped)');
  }
  const table = await resolveEntityTable(field.entity_definition_id);
  if (!table) throw new Error('Could not resolve entity table');
  // Calculated columns need a concrete result type; fall back to text for safety.
  const typeName = field.field_type?.name === 'calculated' ? 'text' : field.field_type?.name ?? 'text';
  await addPhysicalColumn(table, phys, typeName);
}

/**
 * System Health repair — remove a broken field_definition whose physical column is
 * missing (typically a malformed field whose column was never created). Best-effort
 * drops the column if it somehow exists, then soft-deletes the metadata so the orphan
 * field disappears from the CRM (deleted_at keeps a same-named field re-creatable).
 */
export async function deleteFieldById(fieldId: string): Promise<void> {
  const { data, error } = await supabase
    .from('field_definition')
    .select('physical_column_name, entity_definition_id')
    .eq('field_definition_id', fieldId)
    .single();
  if (error) throw error;
  const field = data as { physical_column_name: string | null; entity_definition_id: string };
  const phys = field.physical_column_name;
  if (phys && !phys.includes('.')) {
    const table = await resolveEntityTable(field.entity_definition_id);
    if (table) await dropPhysicalColumn(table, phys); // best-effort; column may not exist
  }
  const { data: updated, error: delErr } = await supabase
    .from('field_definition')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('field_definition_id', fieldId)
    .select('field_definition_id');
  if (delErr) throw delErr;
  // No error but no row returned means RLS filtered the update (e.g. the session is
  // not a system admin). Surface it instead of a misleading success toast.
  if (!updated || updated.length === 0) {
    throw new Error('Field was not deleted — you may not have administrator permission.');
  }
}

function buildPayload(form: FieldFormData, inlineChoices: ChoiceOption[]) {
  const { inline_choices, ...rest } = form;
  return {
    ...rest,
    config_json:
      inlineChoices.length > 0 ? { choices: inlineChoices } : rest.config_json ?? null,
  };
}
