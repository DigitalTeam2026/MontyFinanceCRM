import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import type { AppEntity } from '../types';
import { ENTITY_LOGICAL_NAME, ENTITY_DEFINITION_ID } from '../types';
import type { ColumnState } from '../components/ColumnCustomizer';
import {
  getEntityTable, getEntityPK, getTableColumns,
  filterToExistingColumns, saveRecord,
} from './recordService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportColumnMeta {
  key: string;
  label: string;
  physicalColumn: string;
  fieldType: string;
  isRequired: boolean;
  isReadonly: boolean;
  lookupTable?: string;
  lookupPk?: string;
  lookupLabelField?: string;
  lookupEntityId?: string;
  optionSetName?: string;
  optionSetId?: string;
  fieldDefinitionId?: string;
}

export interface ImportValidationError {
  row: number;
  column: string;
  message: string;
}

export interface ImportPreviewRow {
  rowIndex: number;
  data: Record<string, unknown>;
  resolved: Record<string, unknown>;
  errors: ImportValidationError[];
  isValid: boolean;
}

export type ImportMode = 'create' | 'update';

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: ImportValidationError[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const READONLY_FIELDS = new Set([
  'created_at', 'created_by', 'modified_at', 'modified_by',
  'createdon', 'modifiedon', 'createdby', 'modifiedby',
  'is_deleted', 'deleted_at', 'version_no',
  'account_number', 'ticket_number', 'full_name',
  'currency_locked', 'currency_lock_reason',
]);

const PK_OVERRIDES: Record<string, string> = {
  product_family: 'family_id',
  line_of_business: 'lob_id',
  crm_user: 'user_id',
  security_role: 'role_id',
};

// ---------------------------------------------------------------------------
// Column metadata resolution
// ---------------------------------------------------------------------------

export async function resolveImportColumns(
  entity: AppEntity,
  viewColumns: ColumnState[],
): Promise<ImportColumnMeta[]> {
  const entityName = ENTITY_LOGICAL_NAME[entity] ?? entity;
  const entityDefId = ENTITY_DEFINITION_ID[entity]
    ?? (await supabase
      .from('entity_definition')
      .select('entity_definition_id')
      .eq('logical_name', entityName)
      .maybeSingle()
    ).data?.entity_definition_id;

  if (!entityDefId) return [];

  const { data: fields } = await supabase
    .from('field_definition')
    .select(`
      field_definition_id, logical_name, display_name,
      physical_column_name, is_required, is_custom,
      lookup_entity_id, config_json,
      field_type:field_type_id(name)
    `)
    .eq('entity_definition_id', entityDefId)
    .eq('is_active', true);

  if (!fields) return [];

  const fieldMap = new Map<string, any>();
  for (const f of fields) {
    fieldMap.set(f.field_definition_id, f);
    fieldMap.set(f.logical_name, f);
    if (f.physical_column_name) fieldMap.set(f.physical_column_name, f);
  }

  const visibleCols = viewColumns.filter((c) => c.visible && !c.relationship_definition_id);
  const result: ImportColumnMeta[] = [];

  for (const col of visibleCols) {
    const fd = col.field_definition_id
      ? fieldMap.get(col.field_definition_id)
      : fieldMap.get(col.key);

    if (!fd) continue;

    const physCol = fd.physical_column_name ?? col.field_physical_column ?? col.key;
    const typeName = ((fd.field_type as any)?.name ?? col.type ?? 'text').toLowerCase();

    const isReadonly = READONLY_FIELDS.has(physCol)
      || READONLY_FIELDS.has(col.key)
      || physCol.endsWith('_id') && (col.key === 'id' || col.key.endsWith('_id') && !col.lookup_table && typeName !== 'lookup');

    const meta: ImportColumnMeta = {
      key: col.key,
      label: col.label,
      physicalColumn: physCol,
      fieldType: typeName,
      isRequired: fd.is_required ?? false,
      isReadonly: isReadonly && typeName !== 'lookup' && typeName !== 'owner',
      fieldDefinitionId: fd.field_definition_id,
    };

    if (typeName === 'lookup' || typeName === 'owner') {
      meta.lookupTable = col.lookup_table;
      meta.lookupLabelField = col.lookup_label_field;
      meta.lookupEntityId = fd.lookup_entity_id ?? undefined;
      if (meta.lookupTable) {
        meta.lookupPk = PK_OVERRIDES[meta.lookupTable] ?? `${meta.lookupTable}_id`;
      }
    }

    if (['optionset', 'option_set', 'choice', 'picklist', 'status'].includes(typeName) || col.option_set_name) {
      meta.optionSetName = col.option_set_name ?? (fd.config_json as any)?.option_set_name;
    }

    if (col.key === 'state_code' || col.key === 'status_reason') {
      meta.isReadonly = true;
    }

    result.push(meta);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Fetch reference data for dropdowns in template
// ---------------------------------------------------------------------------

interface RefData {
  optionSets: Record<string, { value: string; label: string }[]>;
  lookupRecords: Record<string, { id: string; label: string }[]>;
  stateCodeMap: Record<string, { value: number; label: string }[]>;
  statusReasonMap: Record<number, { value: number; label: string }[]>;
}

export async function fetchReferenceData(
  columns: ImportColumnMeta[],
  _entity: AppEntity,
): Promise<RefData> {
  const optionSets: RefData['optionSets'] = {};
  const lookupRecords: RefData['lookupRecords'] = {};
  const stateCodeMap: RefData['stateCodeMap'] = {};
  const statusReasonMap: RefData['statusReasonMap'] = {};

  const osNames = new Set<string>();
  for (const col of columns) {
    if (col.optionSetName) osNames.add(col.optionSetName);
  }

  const osPromises = [...osNames].map(async (name) => {
    const { data: os } = await supabase
      .from('option_set')
      .select('option_set_id')
      .eq('name', name)
      .maybeSingle();
    if (!os) return;
    const { data: vals } = await supabase
      .from('option_set_value')
      .select('value, display_label')
      .eq('option_set_id', os.option_set_id)
      .eq('is_active', true)
      .order('display_order');
    if (vals) {
      optionSets[name] = vals.map((v: any) => ({ value: v.value, label: v.display_label }));
    }
  });

  const lookupCols = columns.filter((c) =>
    (c.fieldType === 'lookup' || c.fieldType === 'owner') && c.lookupTable && c.lookupLabelField
  );
  const lookupPromises = lookupCols.map(async (col) => {
    const table = col.lookupTable!;
    const labelField = col.lookupLabelField!;
    const pk = col.lookupPk ?? `${table}_id`;
    let qb = supabase.from(table).select(`${pk}, ${labelField}`).limit(2000);
    if (table === 'crm_user') qb = (qb as any).eq('is_active', true);
    const { data } = await qb;
    if (data) {
      lookupRecords[col.key] = (data as any[]).map((r) => ({
        id: String(r[pk]),
        label: String(r[labelField] ?? ''),
      })).filter((r) => r.label);
    }
  });

  await Promise.all([...osPromises, ...lookupPromises]);

  return { optionSets, lookupRecords, stateCodeMap, statusReasonMap };
}

// ---------------------------------------------------------------------------
// Template generation
// ---------------------------------------------------------------------------

export function generateTemplate(
  entityLabel: string,
  viewName: string,
  columns: ImportColumnMeta[],
  refData: RefData,
): XLSX.WorkBook {
  const importable = columns.filter((c) => !c.isReadonly);
  const wb = XLSX.utils.book_new();

  // --- Data sheet ---
  const headers = importable.map((c) => c.label);
  const dataSheet = XLSX.utils.aoa_to_sheet([headers]);

  for (let i = 0; i < importable.length; i++) {
    const col = importable[i];
    const colLetter = XLSX.utils.encode_col(i);

    if (col.fieldType === 'boolean' || col.fieldType === 'twooptions' || col.fieldType === 'two_options') {
      setDropdownValidation(dataSheet, colLetter, ['Yes', 'No']);
    } else if (col.optionSetName && refData.optionSets[col.optionSetName]) {
      const labels = refData.optionSets[col.optionSetName].map((v) => v.label);
      if (labels.length > 0 && labels.length <= 250) {
        setDropdownValidation(dataSheet, colLetter, labels);
      }
    }

    if (col.fieldType === 'date' || col.fieldType === 'datetime') {
      const range = `${colLetter}2:${colLetter}10000`;
      if (!dataSheet['!cols']) dataSheet['!cols'] = [];
      dataSheet['!cols'][i] = { wch: 14 };
      applyNumberFormat(dataSheet, range, 'yyyy-mm-dd');
    }

    if (['number', 'decimal', 'integer', 'whole_number', 'currency'].includes(col.fieldType)) {
      if (!dataSheet['!cols']) dataSheet['!cols'] = [];
      dataSheet['!cols'][i] = { wch: 14 };
    }
  }

  if (!dataSheet['!cols']) dataSheet['!cols'] = [];
  for (let i = 0; i < importable.length; i++) {
    if (!dataSheet['!cols'][i]) {
      dataSheet['!cols'][i] = { wch: Math.max(importable[i].label.length + 4, 16) };
    }
  }

  XLSX.utils.book_append_sheet(wb, dataSheet, 'Import Data');

  // --- Instructions sheet ---
  const instructions: string[][] = [
    [`Import Template: ${entityLabel}`],
    [`View: ${viewName}`],
    [''],
    ['Instructions:'],
    ['1. Fill in data in the "Import Data" sheet.'],
    ['2. Required fields are marked with * in the column header.'],
    ['3. For lookup/reference fields, enter the display name (not the ID).'],
    ['4. For choice fields, use the dropdown values or refer to "Reference Data" sheet.'],
    ['5. For boolean fields, enter "Yes" or "No".'],
    ['6. For date fields, use YYYY-MM-DD format.'],
    ['7. Do not modify the column headers.'],
    [''],
    ['Column Details:'],
  ];
  for (const col of importable) {
    const req = col.isRequired ? ' (REQUIRED)' : '';
    const typeHint = getTypeHint(col);
    instructions.push([`  ${col.label}${req} — ${typeHint}`]);
  }
  const instrSheet = XLSX.utils.aoa_to_sheet(instructions);
  instrSheet['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, instrSheet, 'Instructions');

  // --- Reference Data sheet ---
  const refRows: string[][] = [['Column', 'Valid Values']];
  for (const col of importable) {
    if (col.optionSetName && refData.optionSets[col.optionSetName]) {
      for (const v of refData.optionSets[col.optionSetName]) {
        refRows.push([col.label, v.label]);
      }
    }
    if (refData.lookupRecords[col.key]) {
      for (const r of refData.lookupRecords[col.key]) {
        refRows.push([col.label, r.label]);
      }
    }
  }
  const refSheet = XLSX.utils.aoa_to_sheet(refRows);
  refSheet['!cols'] = [{ wch: 24 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, refSheet, 'Reference Data');

  // Mark required columns with * in header
  for (let i = 0; i < importable.length; i++) {
    const col = importable[i];
    if (col.isRequired) {
      const cell = dataSheet[XLSX.utils.encode_cell({ r: 0, c: i })];
      if (cell) cell.v = `${col.label} *`;
    }
  }

  return wb;
}

function getTypeHint(col: ImportColumnMeta): string {
  switch (col.fieldType) {
    case 'text': case 'textarea': case 'string': case 'email': case 'url': case 'phone':
      return 'Text';
    case 'number': case 'integer': case 'whole_number':
      return 'Whole number';
    case 'decimal': case 'currency':
      return 'Numeric value';
    case 'date': case 'datetime':
      return 'Date (YYYY-MM-DD)';
    case 'boolean': case 'twooptions': case 'two_options':
      return 'Yes or No';
    case 'lookup': case 'owner':
      return `Lookup — enter display name from ${col.lookupTable ?? 'related entity'}`;
    case 'optionset': case 'option_set': case 'choice': case 'picklist': case 'status':
      return 'Choice — see "Reference Data" sheet';
    default:
      return 'Text';
  }
}

function setDropdownValidation(sheet: XLSX.WorkSheet, colLetter: string, values: string[]) {
  if (!sheet['!dataValidation']) (sheet as any)['!dataValidation'] = [];
  const formula = `"${values.join(',').substring(0, 255)}"`;
  (sheet as any)['!dataValidation'].push({
    type: 'list',
    sqref: `${colLetter}2:${colLetter}10000`,
    formula1: formula,
  });
}

function applyNumberFormat(_sheet: XLSX.WorkSheet, _range: string, _fmt: string) {
  // xlsx library handles date formatting during cell creation
}

export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  const safeFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  const data: Uint8Array = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  const blob = new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFilename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ---------------------------------------------------------------------------
// Export for Update — downloads existing records with GUIDs pre-filled
// ---------------------------------------------------------------------------

export async function exportForUpdate(
  entity: AppEntity,
  entityLabel: string,
  viewName: string,
  viewColumns: ColumnState[],
  selectedIds?: string[],
): Promise<XLSX.WorkBook> {
  const table = await getEntityTable(entity);
  const pk = await getEntityPK(entity);
  const cols = await resolveImportColumns(entity, viewColumns);
  const importable = cols.filter((c) => !c.isReadonly);
  const refData = await fetchReferenceData(cols, entity);

  const physCols = [pk, ...([...new Set(importable.map((c) => c.physicalColumn))])];
  let query = supabase
    .from(table)
    .select(physCols.join(', '))
    .eq('is_deleted', false)
    .limit(50000);
  if (selectedIds && selectedIds.length > 0) {
    query = query.in(pk, selectedIds);
  }
  const { data: records } = await query;

  // Reverse maps for display-value resolution
  const lookupIdToLabel = new Map<string, Map<string, string>>();
  for (const col of importable) {
    if (refData.lookupRecords[col.key]?.length) {
      const m = new Map<string, string>();
      for (const r of refData.lookupRecords[col.key]) m.set(r.id, r.label);
      lookupIdToLabel.set(col.key, m);
    }
  }
  const osValueToLabel = new Map<string, Map<string, string>>();
  for (const col of importable) {
    if (col.optionSetName && refData.optionSets[col.optionSetName]) {
      const m = new Map<string, string>();
      for (const v of refData.optionSets[col.optionSetName]) m.set(String(v.value), v.label);
      osValueToLabel.set(col.key, m);
    }
  }

  const pkLabel = `${entityLabel} ID`;
  const headers = [pkLabel, ...importable.map((c) => c.label)];

  const dataRows = ((records ?? []) as unknown as Record<string, unknown>[]).map((record: Record<string, unknown>) => {
    const row: unknown[] = [record[pk]];
    for (const col of importable) {
      const raw = record[col.physicalColumn];
      if (raw == null || String(raw) === '') {
        row.push('');
      } else if (col.fieldType === 'lookup' || col.fieldType === 'owner') {
        row.push(lookupIdToLabel.get(col.key)?.get(String(raw)) ?? '');
      } else if (['boolean', 'twooptions', 'two_options'].includes(col.fieldType)) {
        row.push(raw === true || raw === 'true' || raw === 1 ? 'Yes' : 'No');
      } else if (col.optionSetName) {
        row.push(osValueToLabel.get(col.key)?.get(String(raw)) ?? String(raw));
      } else {
        row.push(raw);
      }
    }
    return row;
  });

  const wb = XLSX.utils.book_new();

  const dataSheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  dataSheet['!cols'] = [
    { wch: 38 },
    ...importable.map((c) => ({ wch: Math.max(c.label.length + 4, 16) })),
  ];
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Update Data');

  const instrSheet = XLSX.utils.aoa_to_sheet([
    [`Export for Update: ${entityLabel}`],
    [`View: ${viewName}`],
    [''],
    ['Instructions:'],
    ['1. Edit values in the "Update Data" sheet.'],
    [`2. Do NOT modify the "${pkLabel}" column — it matches records on import.`],
    ['3. Import this file using "Update existing" mode.'],
    ['4. For lookup fields, enter the display name exactly as shown.'],
    ['5. For choice fields, enter the label exactly as shown.'],
    ['6. For boolean fields, use "Yes" or "No".'],
    ['7. Leave a cell empty to clear that field\'s value on the record.'],
  ]);
  instrSheet['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, instrSheet, 'Instructions');

  return wb;
}

// ---------------------------------------------------------------------------
// Parse uploaded file
// ---------------------------------------------------------------------------

export async function parseExcelFile(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes('import')) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return rows;
}

// ---------------------------------------------------------------------------
// Validation & resolution
// ---------------------------------------------------------------------------

export async function validateAndResolve(
  rows: Record<string, unknown>[],
  columns: ImportColumnMeta[],
  refData: RefData,
  mode: ImportMode,
  matchColumn: string | null,
  entity: AppEntity,
): Promise<ImportPreviewRow[]> {
  const importable = columns.filter((c) => !c.isReadonly);

  const headerToCol = new Map<string, ImportColumnMeta>();
  for (const col of importable) {
    headerToCol.set(col.label, col);
    headerToCol.set(`${col.label} *`, col);
  }

  const lookupCaches = new Map<string, Map<string, string>>();
  for (const col of importable) {
    if (refData.lookupRecords[col.key]) {
      const m = new Map<string, string>();
      for (const r of refData.lookupRecords[col.key]) {
        m.set(r.label.toLowerCase(), r.id);
      }
      lookupCaches.set(col.key, m);
    }
  }

  const osLabelToValue = new Map<string, Map<string, string>>();
  for (const col of importable) {
    if (col.optionSetName && refData.optionSets[col.optionSetName]) {
      const m = new Map<string, string>();
      for (const v of refData.optionSets[col.optionSetName]) {
        m.set(v.label.toLowerCase(), v.value);
      }
      osLabelToValue.set(col.key, m);
    }
  }

  // '__pk__' sentinel = GUID-based matching from Export for Update
  const isPkMatch = mode === 'update' && matchColumn === '__pk__';
  let pkColumnHeader: string | null = null;
  if (isPkMatch && rows.length > 0) {
    const keys = Object.keys(rows[0]);
    pkColumnHeader = keys.find((k) => k.endsWith(' ID')) ?? keys[0] ?? null;
  }

  let existingRecordMap: Map<string, string> | null = null;
  if (mode === 'update' && matchColumn && !isPkMatch) {
    const matchCol = importable.find((c) => c.key === matchColumn || c.label === matchColumn);
    if (matchCol) {
      existingRecordMap = await buildExistingRecordMap(entity, matchCol.physicalColumn);
    }
  }

  const preview: ImportPreviewRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const errors: ImportValidationError[] = [];
    const resolved: Record<string, unknown> = {};
    const data: Record<string, unknown> = {};

    for (const [header, rawVal] of Object.entries(raw)) {
      const col = headerToCol.get(header);
      if (!col) continue;
      data[col.key] = rawVal;

      const val = rawVal == null || String(rawVal).trim() === '' ? null : rawVal;

      if (col.isRequired && val == null) {
        errors.push({ row: i + 1, column: col.label, message: 'Required field is empty' });
        continue;
      }
      if (val == null) { resolved[col.physicalColumn] = null; continue; }

      const strVal = String(val).trim();

      switch (col.fieldType) {
        case 'text': case 'textarea': case 'string': case 'email': case 'url': case 'phone':
          resolved[col.physicalColumn] = strVal;
          break;

        case 'number': case 'integer': case 'whole_number': {
          const n = Number(strVal.replace(/[,$]/g, ''));
          if (isNaN(n)) {
            errors.push({ row: i + 1, column: col.label, message: `"${strVal}" is not a valid number` });
          } else {
            resolved[col.physicalColumn] = col.fieldType === 'integer' || col.fieldType === 'whole_number' ? Math.round(n) : n;
          }
          break;
        }

        case 'decimal': case 'currency': {
          const n = Number(strVal.replace(/[,$]/g, ''));
          if (isNaN(n)) {
            errors.push({ row: i + 1, column: col.label, message: `"${strVal}" is not a valid number` });
          } else {
            resolved[col.physicalColumn] = n;
          }
          break;
        }

        case 'date': case 'datetime': {
          const d = val instanceof Date ? val : new Date(strVal);
          if (isNaN(d.getTime())) {
            errors.push({ row: i + 1, column: col.label, message: `"${strVal}" is not a valid date` });
          } else {
            resolved[col.physicalColumn] = d.toISOString();
          }
          break;
        }

        case 'boolean': case 'twooptions': case 'two_options': {
          const lower = strVal.toLowerCase();
          if (['yes', 'true', '1'].includes(lower)) resolved[col.physicalColumn] = true;
          else if (['no', 'false', '0'].includes(lower)) resolved[col.physicalColumn] = false;
          else errors.push({ row: i + 1, column: col.label, message: `"${strVal}" is not valid — use Yes or No` });
          break;
        }

        case 'lookup': case 'owner': {
          const cache = lookupCaches.get(col.key);
          if (!cache) {
            errors.push({ row: i + 1, column: col.label, message: 'Cannot resolve lookup values' });
            break;
          }
          const match = cache.get(strVal.toLowerCase());
          if (match) {
            resolved[col.physicalColumn] = match;
          } else {
            const partialMatches = [...cache.entries()].filter(([k]) => k.includes(strVal.toLowerCase()));
            if (partialMatches.length === 1) {
              resolved[col.physicalColumn] = partialMatches[0][1];
            } else if (partialMatches.length > 1) {
              errors.push({ row: i + 1, column: col.label, message: `Multiple matches found for "${strVal}". Please use the exact name.` });
            } else {
              errors.push({ row: i + 1, column: col.label, message: `No matching record found for "${strVal}"` });
            }
          }
          break;
        }

        case 'optionset': case 'option_set': case 'choice': case 'picklist': case 'status': {
          const labelMap = osLabelToValue.get(col.key);
          if (!labelMap) {
            resolved[col.physicalColumn] = strVal;
            break;
          }
          const mapped = labelMap.get(strVal.toLowerCase());
          if (mapped !== undefined) {
            resolved[col.physicalColumn] = mapped;
          } else {
            errors.push({ row: i + 1, column: col.label, message: `"${strVal}" is not a valid option. Check the Reference Data sheet.` });
          }
          break;
        }

        default:
          resolved[col.physicalColumn] = strVal;
      }
    }

    // Required column check — only for create mode (update only patches provided fields)
    if (mode === 'create') {
      for (const col of importable) {
        if (col.isRequired && !(col.key in data)) {
          const headerVariant = `${col.label} *`;
          if (!(col.label in raw) && !(headerVariant in raw)) {
            errors.push({ row: i + 1, column: col.label, message: 'Required column is missing from the file' });
          }
        }
      }
    }

    // GUID-based matching
    if (isPkMatch && pkColumnHeader) {
      const pkVal = String(raw[pkColumnHeader] ?? '').trim();
      if (!pkVal) {
        errors.push({ row: i + 1, column: pkColumnHeader, message: 'Missing record ID' });
      } else {
        resolved['__record_id__'] = pkVal;
        data['__pk__'] = pkVal;
      }
    }

    // Text-based matching
    if (mode === 'update' && matchColumn && !isPkMatch && existingRecordMap) {
      const matchCol = importable.find((c) => c.key === matchColumn || c.label === matchColumn);
      if (matchCol) {
        const matchVal = String(data[matchCol.key] ?? '').trim().toLowerCase();
        if (matchVal && !existingRecordMap.has(matchVal)) {
          errors.push({ row: i + 1, column: matchCol.label, message: 'No existing record found to update' });
        }
      }
    }

    preview.push({
      rowIndex: i + 1,
      data,
      resolved,
      errors,
      isValid: errors.length === 0,
    });
  }

  return preview;
}

async function buildExistingRecordMap(
  entity: AppEntity,
  physicalColumn: string,
): Promise<Map<string, string>> {
  const table = await getEntityTable(entity);
  const pk = await getEntityPK(entity);
  const { data } = await supabase
    .from(table)
    .select(`${pk}, ${physicalColumn}`)
    .eq('is_deleted', false)
    .limit(10000);

  const map = new Map<string, string>();
  if (data) {
    for (const r of data as unknown as Record<string, unknown>[]) {
      const val = String(r[physicalColumn] ?? '').trim().toLowerCase();
      if (val) map.set(val, String(r[pk]));
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Execute import
// ---------------------------------------------------------------------------

export async function executeImport(
  entity: AppEntity,
  previewRows: ImportPreviewRow[],
  columns: ImportColumnMeta[],
  mode: ImportMode,
  matchColumn: string | null,
  userId: string,
): Promise<ImportResult> {
  const validRows = previewRows.filter((r) => r.isValid);
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

  if (validRows.length === 0) return result;

  const isPkMatch = mode === 'update' && matchColumn === '__pk__';

  let existingMap: Map<string, string> | null = null;
  if (mode === 'update' && matchColumn && !isPkMatch) {
    const matchCol = columns.find((c) => c.key === matchColumn);
    if (matchCol) {
      existingMap = await buildExistingRecordMap(entity, matchCol.physicalColumn);
    }
  }

  const tableCols = await getTableColumns(await getEntityTable(entity));

  for (const row of validRows) {
    try {
      const payload: Record<string, unknown> = {};
      for (const [physCol, val] of Object.entries(row.resolved)) {
        if (physCol === '__record_id__') continue; // internal sentinel — not a DB column
        payload[physCol] = val;
      }

      const filtered = filterToExistingColumns(payload, tableCols);
      let recordId: string | null = null;

      if (isPkMatch) {
        recordId = String(row.resolved['__record_id__'] ?? '').trim() || null;
      } else if (existingMap && matchColumn) {
        const matchCol = columns.find((c) => c.key === matchColumn);
        if (matchCol) {
          const matchVal = String(row.data[matchCol.key] ?? '').trim().toLowerCase();
          recordId = existingMap.get(matchVal) ?? null;
        }
      }

      if (mode === 'update' && !recordId) {
        result.skipped++;
        continue;
      }

      if (mode === 'create') {
        await saveRecord(entity, null, filtered, userId);
        result.created++;
      } else if (recordId) {
        await saveRecord(entity, recordId, filtered, userId);
        result.updated++;
      } else {
        result.skipped++;
      }
    } catch (err: any) {
      result.failed++;
      result.errors.push({
        row: row.rowIndex,
        column: '',
        message: err.message ?? 'Unknown error',
      });
    }
  }

  return result;
}
