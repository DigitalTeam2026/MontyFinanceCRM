// Shared logic for turning an entity's saved view into a ColumnState[] used by
// both the entity list grid (EntityListPage) and the dashboard drill-down panel.
//
// Keeping this in one place guarantees the drill-down renders the SAME columns,
// in the same order, with the same lookup/option-set/relationship metadata as
// the list page — so cells resolve and render identically in both surfaces.

import type { AppEntity } from '../types';
import { ENTITY_COLUMNS } from './listService';
import type { ColumnState } from '../components/ColumnCustomizer';
import type { ViewColumn } from '../../types/view';

/** Default grid columns for an entity (empty for metadata-only entities like prospect). */
export function buildColumnState(entity: AppEntity): ColumnState[] {
  return (ENTITY_COLUMNS[entity] ?? []).map((c) => ({
    key: c.key,
    label: c.label,
    visible: true,
    sortable: c.sortable,
    type: c.type,
    field_definition_id: c.field_definition_id ?? null,
    field_physical_column: c.field_physical_column,
    lookup_table: c.lookup_table,
    lookup_label_field: c.lookup_label_field,
    option_set_name: c.option_set_name,
  }));
}

/** Map DB field_type.name values to the filter/render-compatible type strings. */
export function normalizeFieldType(dbTypeName: string | undefined | null): string | undefined {
  if (!dbTypeName) return undefined;
  const t = dbTypeName.toLowerCase();
  if (t === 'lookup' || t === 'owner') return 'lookup';
  if (t === 'twooptions' || t === 'boolean' || t === 'two_options') return 'boolean';
  if (t === 'optionset' || t === 'option_set' || t === 'choice' || t === 'status' || t === 'picklist') return 'badge';
  if (t === 'multi_choice') return 'multi_badge';
  if (t === 'datetime' || t === 'date') return 'date';
  if (t === 'currency' || t === 'decimal' || t === 'integer' || t === 'number' || t === 'whole_number') return 'currency';
  if (t === 'phone') return 'phone';
  if (t === 'email' || t === 'url' || t === 'text' || t === 'textarea' || t === 'string') return 'text';
  return 'text';
}

/**
 * Build ColumnState[] from a view's columns (the result of fetchViewColumns).
 * Mirrors EntityListPage.applyView so the grid and drill-down stay in lockstep.
 * When `cols` is empty, falls back to the entity's default columns.
 */
export function buildColumnStatesFromViewColumns(entity: AppEntity, cols: ViewColumn[]): ColumnState[] {
  const defaultCols = ENTITY_COLUMNS[entity] ?? [];
  if (cols.length === 0) return buildColumnState(entity);

  const defaultColByFieldId = new Map(defaultCols.map((c) => [c.field_definition_id, c]));

  let states: ColumnState[] = cols
    .filter((c) => !c.is_hidden && c.field_logical_name)
    .map((c) => {
      const isRelated = !!c.relationship_definition_id;
      const def = defaultColByFieldId.get(c.field_definition_id as string | undefined);
      let key = isRelated
        ? `rel:${c.relationship_definition_id}:${c.field_logical_name}`
        : (def?.key ?? c.field_physical_column ?? c.field_logical_name!);
      const relLabel = isRelated && c.related_entity_display_name
        ? `${c.related_entity_display_name}: ${c.field_display_name ?? c.field_logical_name}`
        : null;
      const resolvedLookupTable = c.lookup_table ?? def?.lookup_table;
      // Per-view override wins over the entity primary field for both grid display
      // and the column filter (they both read lookup_label_field).
      const resolvedLookupLabel = c.lookup_label_field_override
        ?? c.lookup_label_field ?? def?.lookup_label_field;
      let resolvedType = normalizeFieldType(c.field_type_name) ?? def?.type;
      if (resolvedType === 'lookup' && resolvedLookupTable === 'crm_user') resolvedType = 'owner';
      if (resolvedType === 'owner' && (key === 'owner_id' || key === 'ownerid')) key = 'owner_email';
      return {
        key,
        label: relLabel ?? def?.label ?? c.field_display_name ?? c.field_logical_name!,
        visible: true,
        sortable: isRelated ? false : (c.is_sortable ?? def?.sortable ?? false),
        type: resolvedType,
        field_definition_id: c.field_definition_id,
        relationship_definition_id: c.relationship_definition_id ?? null,
        related_entity_display_name: c.related_entity_display_name,
        related_table_name: c.related_table_name,
        fk_physical_column: c.fk_physical_column,
        field_physical_column: c.field_physical_column,
        lookup_table: resolvedLookupTable,
        lookup_label_field: resolvedLookupLabel,
        lookup_label_field_override: c.lookup_label_field_override ?? null,
        option_set_name: c.option_set_name,
        inline_choices: c.inline_choices,
        labelOverride: c.label_override ?? undefined,
        width: c.width,
      } as ColumnState;
    });

  // Append hidden defaults not present in view columns (so resolution still works).
  for (const def of defaultCols) {
    if (!states.find((s) => s.key === def.key)) {
      states.push({
        key: def.key,
        label: def.label,
        visible: false,
        sortable: def.sortable,
        type: def.type,
        field_definition_id: def.field_definition_id ?? null,
        field_physical_column: def.field_physical_column,
      });
    }
  }

  // Deduplicate by key — view-defined order takes precedence.
  const seen = new Set<string>();
  states = states.filter((s) => {
    if (seen.has(s.key)) return false;
    seen.add(s.key);
    return true;
  });

  return states;
}
