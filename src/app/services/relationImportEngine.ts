import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { getTableColumns, filterToExistingColumns } from './recordService';
import { parseExcelFile, downloadWorkbook } from './importEngine';

export { downloadWorkbook };

// ---------------------------------------------------------------------------
// Generic importer for N:N "relations" (junction) tables.
//
// Unlike the per-entity Excel importer, this targets a relationship_definition
// whose storage type is 'junction'. It reads the junction table + the two FK
// columns from metadata, then resolves each end of every row to a real record
// id by matching on the entity's primary (name) field first, falling back to a
// `legacy_id` column when present. This makes it reusable for every product's
// relations table — no per-product code.
// ---------------------------------------------------------------------------

// System / audit columns that are never part of the import template.
const SYSTEM_COLS = new Set([
  'created_at', 'created_by', 'modified_at', 'modified_by',
  'createdon', 'modifiedon', 'createdby', 'modifiedby',
  'owner_id', 'owner_type', 'owning_business_unit',
  'is_deleted', 'deleted_at', 'version_no', 'id',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JunctionRelationshipOption {
  relationshipDefinitionId: string;
  name: string;
  displayName: string;
  junctionTable: string;
  sourceEntityLabel: string;
  targetEntityLabel: string;
}

export interface EntityEndMeta {
  entityId: string;
  table: string;
  pk: string;
  nameField: string;
  label: string;
  hasLegacyId: boolean;
}

export interface JunctionExtraColumn {
  column: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
}

export interface JunctionImportConfig {
  relationshipDefinitionId: string;
  displayName: string;
  junctionTable: string;
  junctionPk: string | null;
  sourceFk: string;
  targetFk: string;
  source: EntityEndMeta;
  target: EntityEndMeta;
  extraColumns: JunctionExtraColumn[];
}

export interface RelationValidationError {
  row: number;
  column: string;
  message: string;
}

export interface RelationPreviewRow {
  rowIndex: number;
  sourceKey: string;
  targetKey: string;
  resolved: Record<string, unknown>;
  errors: RelationValidationError[];
  isValid: boolean;
  isDuplicate: boolean;
}

export interface RelationImportResult {
  created: number;
  skipped: number;
  failed: number;
  errors: RelationValidationError[];
}

// ---------------------------------------------------------------------------
// List selectable junction relationships
// ---------------------------------------------------------------------------

export async function listJunctionRelationships(): Promise<JunctionRelationshipOption[]> {
  const { data, error } = await supabase
    .from('relationship_definition')
    .select(`
      relationship_definition_id, name, display_name,
      junction_table, junction_source_fk, junction_target_fk,
      source_entity:entity_definition!source_entity_id(display_name),
      target_entity:entity_definition!target_entity_id(display_name)
    `)
    .eq('relationship_storage_type', 'junction')
    .eq('is_active', true)
    .not('junction_table', 'is', null)
    .order('display_name', { ascending: true });

  if (error) throw error;

  const out: JunctionRelationshipOption[] = [];
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    if (!row.junction_table || !row.junction_source_fk || !row.junction_target_fk) continue;
    const src = row.source_entity as { display_name: string } | null;
    const tgt = row.target_entity as { display_name: string } | null;
    out.push({
      relationshipDefinitionId: row.relationship_definition_id as string,
      name: row.name as string,
      displayName: row.display_name as string,
      junctionTable: row.junction_table as string,
      sourceEntityLabel: src?.display_name ?? '',
      targetEntityLabel: tgt?.display_name ?? '',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Resolve a full import config for one junction relationship
// ---------------------------------------------------------------------------

async function resolveEntityEnd(entityId: string): Promise<EntityEndMeta> {
  const { data, error } = await supabase
    .from('entity_definition')
    .select('physical_table_name, primary_field_name, primary_key_column, display_name')
    .eq('entity_definition_id', entityId)
    .maybeSingle();
  if (error || !data) throw new Error('Cannot resolve entity for relationship end');

  const table = data.physical_table_name as string;
  const pk = (data.primary_key_column as string | null)
    ?? `${table.replace(/^crm_/, '')}_id`;
  const cols = await getTableColumns(table);

  return {
    entityId,
    table,
    pk,
    nameField: (data.primary_field_name as string | null) || 'name',
    label: (data.display_name as string | null) || table,
    hasLegacyId: cols.has('legacy_id'),
  };
}

export async function resolveJunctionImportConfig(
  relationshipDefinitionId: string,
): Promise<JunctionImportConfig> {
  const { data, error } = await supabase
    .from('relationship_definition')
    .select(`
      relationship_definition_id, display_name,
      junction_table, junction_source_fk, junction_target_fk,
      source_entity_id, target_entity_id
    `)
    .eq('relationship_definition_id', relationshipDefinitionId)
    .maybeSingle();

  if (error || !data) throw new Error('Relationship not found');
  const junctionTable = data.junction_table as string | null;
  const sourceFk = data.junction_source_fk as string | null;
  const targetFk = data.junction_target_fk as string | null;
  if (!junctionTable || !sourceFk || !targetFk) {
    throw new Error('This relationship is not a junction (N:N) relationship.');
  }

  const [source, target, junctionCols, pkData] = await Promise.all([
    resolveEntityEnd(data.source_entity_id as string),
    resolveEntityEnd(data.target_entity_id as string),
    getTableColumns(junctionTable),
    supabase.rpc('get_table_pk_column', { p_table: junctionTable }),
  ]);

  const junctionPk = (pkData.data as string | null) ?? null;

  // Pull field metadata for the junction's own columns when the junction table
  // is itself a registered entity — gives us proper labels / types / required.
  const fieldMeta = await fetchJunctionFieldMeta(junctionTable);

  const reserved = new Set<string>([
    sourceFk, targetFk, ...SYSTEM_COLS,
    ...(junctionPk ? [junctionPk] : []),
  ]);

  const extraColumns: JunctionExtraColumn[] = [];
  for (const col of junctionCols) {
    if (reserved.has(col)) continue;
    const meta = fieldMeta.get(col);
    extraColumns.push({
      column: col,
      label: meta?.label ?? prettify(col),
      fieldType: meta?.fieldType ?? 'text',
      isRequired: meta?.isRequired ?? false,
    });
  }

  return {
    relationshipDefinitionId,
    displayName: data.display_name as string,
    junctionTable,
    junctionPk,
    sourceFk,
    targetFk,
    source,
    target,
    extraColumns,
  };
}

async function fetchJunctionFieldMeta(
  junctionTable: string,
): Promise<Map<string, { label: string; fieldType: string; isRequired: boolean }>> {
  const map = new Map<string, { label: string; fieldType: string; isRequired: boolean }>();
  const { data: ent } = await supabase
    .from('entity_definition')
    .select('entity_definition_id')
    .eq('physical_table_name', junctionTable)
    .maybeSingle();
  if (!ent) return map;

  const { data: fields } = await supabase
    .from('field_definition')
    .select('physical_column_name, display_name, is_required, field_type:field_type_id(name)')
    .eq('entity_definition_id', ent.entity_definition_id)
    .eq('is_active', true);

  for (const f of (fields ?? []) as Record<string, unknown>[]) {
    const col = f.physical_column_name as string | null;
    if (!col) continue;
    map.set(col, {
      label: (f.display_name as string | null) || prettify(col),
      fieldType: ((f.field_type as { name?: string } | null)?.name ?? 'text').toLowerCase(),
      isRequired: (f.is_required as boolean | null) ?? false,
    });
  }
  return map;
}

function prettify(col: string): string {
  return col.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Key resolver — name first, legacy_id fallback
// ---------------------------------------------------------------------------

interface KeyResolver {
  byName: Map<string, string>;
  byLegacy: Map<string, string>;
  ambiguousNames: Set<string>;
}

async function buildKeyResolver(end: EntityEndMeta): Promise<KeyResolver> {
  const selectCols = [end.pk, end.nameField, ...(end.hasLegacyId ? ['legacy_id'] : [])];
  // De-dupe in case nameField === pk
  const uniqueCols = [...new Set(selectCols)];

  const { data, error } = await supabase
    .from(end.table)
    .select(uniqueCols.join(', '))
    .limit(100000);
  if (error) throw new Error(`Failed to load ${end.label} records: ${error.message}`);

  const byName = new Map<string, string>();
  const byLegacy = new Map<string, string>();
  const ambiguousNames = new Set<string>();

  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    const id = String(r[end.pk]);
    const nameVal = r[end.nameField];
    if (nameVal != null && String(nameVal).trim() !== '') {
      const k = String(nameVal).trim().toLowerCase();
      if (byName.has(k) && byName.get(k) !== id) ambiguousNames.add(k);
      else byName.set(k, id);
    }
    if (end.hasLegacyId) {
      const legacyVal = r['legacy_id'];
      if (legacyVal != null && String(legacyVal).trim() !== '') {
        byLegacy.set(String(legacyVal).trim().toLowerCase(), id);
      }
    }
  }
  return { byName, byLegacy, ambiguousNames };
}

function resolveKey(
  resolver: KeyResolver,
  raw: string,
): { id?: string; error?: string } {
  const k = raw.trim().toLowerCase();
  if (!k) return { error: 'empty value' };

  const ambiguous = resolver.ambiguousNames.has(k);
  if (!ambiguous && resolver.byName.has(k)) return { id: resolver.byName.get(k) };
  if (resolver.byLegacy.has(k)) return { id: resolver.byLegacy.get(k) };
  if (ambiguous) {
    return { error: `"${raw}" matches multiple records by name — use the legacy ID instead.` };
  }
  return { error: `No matching record found for "${raw}".` };
}

// ---------------------------------------------------------------------------
// Template generation
// ---------------------------------------------------------------------------

export function generateRelationTemplate(config: JunctionImportConfig): XLSX.WorkBook {
  const sourceHeader = `${config.source.label} *`;
  const targetHeader = `${config.target.label} *`;
  const extraHeaders = config.extraColumns.map((c) => (c.isRequired ? `${c.label} *` : c.label));
  const headers = [sourceHeader, targetHeader, ...extraHeaders];

  const wb = XLSX.utils.book_new();

  const dataSheet = XLSX.utils.aoa_to_sheet([headers]);
  dataSheet['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 18) }));

  // Dropdowns for known boolean junction columns.
  config.extraColumns.forEach((col, idx) => {
    if (['boolean', 'twooptions', 'two_options'].includes(col.fieldType)) {
      const colLetter = XLSX.utils.encode_col(idx + 2);
      (dataSheet as any)['!dataValidation'] = (dataSheet as any)['!dataValidation'] ?? [];
      (dataSheet as any)['!dataValidation'].push({
        type: 'list',
        sqref: `${colLetter}2:${colLetter}10000`,
        formula1: '"Yes,No"',
      });
    }
  });

  XLSX.utils.book_append_sheet(wb, dataSheet, 'Import Relations');

  const srcKeyHint = config.source.hasLegacyId ? 'name or legacy ID' : 'name';
  const tgtKeyHint = config.target.hasLegacyId ? 'name or legacy ID' : 'name';
  const instructions: string[][] = [
    [`Relation Import: ${config.displayName}`],
    [`Junction table: ${config.junctionTable}`],
    [''],
    ['Instructions:'],
    [`1. ${config.source.label}: enter the ${srcKeyHint} of the existing record.`],
    [`2. ${config.target.label}: enter the ${tgtKeyHint} of the existing record.`],
    ['3. Both ends must already exist in the CRM (import them first).'],
    ['4. Records are matched by name first, then by legacy ID if a name is ambiguous.'],
    ['5. Existing links (same pair) are detected and skipped automatically.'],
    ['6. Required columns are marked with * in the header.'],
  ];
  if (config.extraColumns.length > 0) {
    instructions.push([''], ['Additional columns:']);
    for (const col of config.extraColumns) {
      instructions.push([`  ${col.label}${col.isRequired ? ' (REQUIRED)' : ''} — ${col.fieldType}`]);
    }
  }
  const instrSheet = XLSX.utils.aoa_to_sheet(instructions);
  instrSheet['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, instrSheet, 'Instructions');

  return wb;
}

// ---------------------------------------------------------------------------
// Parse + validate + resolve
// ---------------------------------------------------------------------------

export async function parseRelationFile(file: File): Promise<Record<string, unknown>[]> {
  return parseExcelFile(file);
}

async function fetchExistingPairs(config: JunctionImportConfig): Promise<Set<string>> {
  const set = new Set<string>();
  const { data } = await supabase
    .from(config.junctionTable)
    .select(`${config.sourceFk}, ${config.targetFk}`)
    .limit(200000);
  for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
    const s = r[config.sourceFk];
    const t = r[config.targetFk];
    if (s != null && t != null) set.add(`${s}|${t}`);
  }
  return set;
}

function coerceExtra(
  col: JunctionExtraColumn,
  raw: unknown,
  rowIndex: number,
  errors: RelationValidationError[],
): unknown {
  if (raw == null || String(raw).trim() === '') {
    if (col.isRequired) {
      errors.push({ row: rowIndex, column: col.label, message: 'Required value is empty' });
    }
    return null;
  }
  const str = String(raw).trim();
  switch (col.fieldType) {
    case 'boolean': case 'twooptions': case 'two_options': {
      const lower = str.toLowerCase();
      if (['yes', 'true', '1'].includes(lower)) return true;
      if (['no', 'false', '0'].includes(lower)) return false;
      errors.push({ row: rowIndex, column: col.label, message: `"${str}" is not valid — use Yes or No` });
      return null;
    }
    case 'number': case 'integer': case 'whole_number': case 'decimal': case 'currency': {
      const n = Number(str.replace(/[,$]/g, ''));
      if (isNaN(n)) {
        errors.push({ row: rowIndex, column: col.label, message: `"${str}" is not a valid number` });
        return null;
      }
      return ['integer', 'whole_number'].includes(col.fieldType) ? Math.round(n) : n;
    }
    case 'date': case 'datetime': {
      const d = raw instanceof Date ? raw : new Date(str);
      if (isNaN(d.getTime())) {
        errors.push({ row: rowIndex, column: col.label, message: `"${str}" is not a valid date` });
        return null;
      }
      return d.toISOString();
    }
    default:
      return str;
  }
}

export async function validateAndResolveRelations(
  rows: Record<string, unknown>[],
  config: JunctionImportConfig,
): Promise<RelationPreviewRow[]> {
  const [srcResolver, tgtResolver, existingPairs] = await Promise.all([
    buildKeyResolver(config.source),
    buildKeyResolver(config.target),
    fetchExistingPairs(config),
  ]);

  // Header → field mapping (tolerant of the trailing " *").
  const sourceHeaders = new Set([config.source.label, `${config.source.label} *`]);
  const targetHeaders = new Set([config.target.label, `${config.target.label} *`]);
  const extraByHeader = new Map<string, JunctionExtraColumn>();
  for (const col of config.extraColumns) {
    extraByHeader.set(col.label, col);
    extraByHeader.set(`${col.label} *`, col);
  }

  const preview: RelationPreviewRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const errors: RelationValidationError[] = [];
    const resolved: Record<string, unknown> = {};
    let sourceKey = '';
    let targetKey = '';

    for (const [header, value] of Object.entries(raw)) {
      if (sourceHeaders.has(header)) sourceKey = String(value ?? '').trim();
      else if (targetHeaders.has(header)) targetKey = String(value ?? '').trim();
      else {
        const col = extraByHeader.get(header);
        if (col) {
          const v = coerceExtra(col, value, i + 1, errors);
          if (v !== null) resolved[col.column] = v;
        }
      }
    }

    let srcId: string | undefined;
    let tgtId: string | undefined;

    if (!sourceKey) {
      errors.push({ row: i + 1, column: config.source.label, message: 'Required value is empty' });
    } else {
      const res = resolveKey(srcResolver, sourceKey);
      if (res.id) { srcId = res.id; resolved[config.sourceFk] = res.id; }
      else errors.push({ row: i + 1, column: config.source.label, message: res.error ?? 'Unresolved' });
    }

    if (!targetKey) {
      errors.push({ row: i + 1, column: config.target.label, message: 'Required value is empty' });
    } else {
      const res = resolveKey(tgtResolver, targetKey);
      if (res.id) { tgtId = res.id; resolved[config.targetFk] = res.id; }
      else errors.push({ row: i + 1, column: config.target.label, message: res.error ?? 'Unresolved' });
    }

    const isDuplicate = !!srcId && !!tgtId && existingPairs.has(`${srcId}|${tgtId}`);

    preview.push({
      rowIndex: i + 1,
      sourceKey,
      targetKey,
      resolved,
      errors,
      isValid: errors.length === 0,
      isDuplicate,
    });
  }

  return preview;
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

export async function executeRelationImport(
  config: JunctionImportConfig,
  previewRows: RelationPreviewRow[],
  userId: string,
): Promise<RelationImportResult> {
  const result: RelationImportResult = { created: 0, skipped: 0, failed: 0, errors: [] };

  const importable = previewRows.filter((r) => r.isValid && !r.isDuplicate);
  result.skipped = previewRows.filter((r) => r.isValid && r.isDuplicate).length;
  if (importable.length === 0) return result;

  const cols = await getTableColumns(config.junctionTable);
  const stamp: Record<string, unknown> = {};
  if (cols.has('created_by')) stamp.created_by = userId;
  if (cols.has('owner_id')) stamp.owner_id = userId;
  if (cols.has('owner_type')) stamp.owner_type = 'user';

  const CHUNK = 200;
  for (let i = 0; i < importable.length; i += CHUNK) {
    const slice = importable.slice(i, i + CHUNK);
    const payloads = slice.map((r) => filterToExistingColumns({ ...r.resolved, ...stamp }, cols));

    const { error } = await supabase.from(config.junctionTable).insert(payloads);
    if (!error) {
      result.created += slice.length;
      continue;
    }

    // Chunk failed — retry per-row to isolate which rows are bad.
    for (const r of slice) {
      const payload = filterToExistingColumns({ ...r.resolved, ...stamp }, cols);
      const { error: rowErr } = await supabase.from(config.junctionTable).insert(payload);
      if (rowErr) {
        result.failed++;
        result.errors.push({ row: r.rowIndex, column: '', message: rowErr.message });
      } else {
        result.created++;
      }
    }
  }

  return result;
}
