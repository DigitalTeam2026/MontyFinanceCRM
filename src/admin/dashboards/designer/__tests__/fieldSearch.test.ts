import { describe, it, expect } from 'vitest';
import type { FieldDefinition } from '../../../../types/field';
import { fieldSearchText } from '../PropertyControls';
import { optionMatchesSearch, normalizeSearch } from '../../../../app/components/FilterSelect';

/**
 * Regression coverage for the field-selector search bug: a field option renders a
 * custom component, so FilterSelect couldn't derive its searchable text and every
 * query returned "No results found". The fix routes a `data-search` string
 * (fieldSearchText) into FilterSelect's separator-insensitive matcher. These tests
 * lock both pieces together against the confirmed "Source" entity scenario.
 */

function field(partial: Partial<FieldDefinition> & { display_name: string; physical_column_name: string }): FieldDefinition {
  return {
    field_definition_id: `id-${partial.physical_column_name}`,
    entity_definition_id: 'src',
    field_type_id: 'ft',
    lookup_entity_id: null,
    logical_name: partial.physical_column_name,
    description: null,
    placeholder: null,
    default_value: null,
    max_length: null,
    min_value: null,
    max_value: null,
    is_required: false,
    is_searchable: true,
    is_sortable: true,
    is_filterable: true,
    is_custom: false,
    is_system: true,
    is_deletable: false,
    is_schema_editable: false,
    is_active: true,
    sort_order: 0,
    is_secured: false,
    validation_rules: null,
    config_json: null,
    deleted_at: null,
    created_at: '',
    modified_at: '',
    field_type: { field_type_id: 'ft', name: 'text', display_name: 'Text', description: null, sort_order: 0 },
    lookup_entity: null,
    ...partial,
  };
}

// The "Source" entity fields from the bug report.
const SOURCE_FIELDS: FieldDefinition[] = [
  field({ display_name: 'Name', physical_column_name: 'name' }),
  field({ display_name: 'Description', physical_column_name: 'description', field_type: { field_type_id: 'ft', name: 'textarea', display_name: 'Multiline Text', description: null, sort_order: 0 } }),
  field({ display_name: 'Created On', physical_column_name: 'created_on', field_type: { field_type_id: 'ft', name: 'datetime', display_name: 'Date and Time', description: null, sort_order: 0 } }),
  field({ display_name: 'Modified On', physical_column_name: 'modified_on', field_type: { field_type_id: 'ft', name: 'datetime', display_name: 'Date and Time', description: null, sort_order: 0 } }),
  field({ display_name: 'Status', physical_column_name: 'status', field_type: { field_type_id: 'ft', name: 'choice', display_name: 'Choice', description: null, sort_order: 0 } }),
  field({ display_name: 'Status Reason', physical_column_name: 'status_reason', field_type: { field_type_id: 'ft', name: 'choice', display_name: 'Choice', description: null, sort_order: 0 } }),
];

/** Mirror of how FilterSelect filters: match each field's data-search text. */
function searchFields(query: string, entityLabel = 'Source'): FieldDefinition[] {
  return SOURCE_FIELDS.filter((f) => optionMatchesSearch(fieldSearchText(f, entityLabel), query));
}

const labelsFor = (query: string) => searchFields(query).map((f) => f.display_name);

describe('normalizeSearch', () => {
  it('strips case, spaces, underscores and dashes', () => {
    expect(normalizeSearch('Status Reason')).toBe('statusreason');
    expect(normalizeSearch('status_reason')).toBe('statusreason');
    expect(normalizeSearch('STATUS-REASON')).toBe('statusreason');
    expect(normalizeSearch('  Created On  ')).toBe('createdon');
  });
});

describe('field-selector search (Source entity)', () => {
  it('the original bug: typing "name" still returns Name', () => {
    expect(labelsFor('name')).toContain('Name');
  });

  it('search is case-insensitive', () => {
    expect(labelsFor('NAME')).toContain('Name');
    expect(labelsFor('Name')).toContain('Name');
  });

  it('matches by description label', () => {
    expect(labelsFor('description')).toEqual(['Description']);
  });

  it('matches "created" and "createdon" to Created On', () => {
    expect(labelsFor('created')).toContain('Created On');
    expect(labelsFor('createdon')).toContain('Created On');
    expect(labelsFor('created on')).toContain('Created On');
  });

  it('"status" returns both Status and Status Reason', () => {
    expect(labelsFor('status')).toEqual(['Status', 'Status Reason']);
  });

  it('"statusreason", "status reason", "status_reason" and "STATUS REASON" all return Status Reason', () => {
    for (const q of ['statusreason', 'status reason', 'status_reason', 'STATUS REASON']) {
      expect(labelsFor(q)).toContain('Status Reason');
    }
  });

  it('matches by physical/logical column name', () => {
    expect(labelsFor('status_reason')).toContain('Status Reason');
    expect(labelsFor('created_on')).toContain('Created On');
  });

  it('matches by friendly type label (e.g. "Text" finds Name)', () => {
    expect(labelsFor('text')).toContain('Name');
  });

  it('matches by entity label', () => {
    expect(labelsFor('source')).toHaveLength(SOURCE_FIELDS.length);
  });

  it('empty / whitespace-only search returns all fields', () => {
    expect(searchFields('')).toHaveLength(SOURCE_FIELDS.length);
    expect(searchFields('   ')).toHaveLength(SOURCE_FIELDS.length);
  });

  it('no match yields zero results (not a stale list)', () => {
    expect(labelsFor('zzz-not-a-field')).toEqual([]);
  });

  it('clearing the search restores the full list', () => {
    expect(labelsFor('zzz')).toEqual([]);
    expect(searchFields('')).toHaveLength(SOURCE_FIELDS.length);
  });

  it('special characters do not throw and simply do not match', () => {
    expect(() => labelsFor('(*&^%$#@')).not.toThrow();
    expect(labelsFor('(*&^%$#@')).toEqual([]);
  });
});

describe('fieldSearchText', () => {
  it('includes label, logical/physical name, type and entity tokens', () => {
    const text = fieldSearchText(SOURCE_FIELDS[5], 'Source');
    expect(text).toContain('Status Reason');
    expect(text).toContain('status_reason');
    expect(text).toContain('Choice');
    expect(text).toContain('Source');
  });
});
