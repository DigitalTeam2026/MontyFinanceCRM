import { supabase } from '../lib/supabase';
import type { EntityDefinition } from '../types/entity';

interface FieldTypeIds {
  text: string;
  datetime: string | null;
  lookup: string | null;
  choice: string | null;
}

async function getFieldTypeIds(): Promise<FieldTypeIds> {
  const { data } = await supabase
    .from('field_type')
    .select('field_type_id, name')
    .in('name', ['text', 'datetime', 'lookup', 'choice']);
  const map: Record<string, string> = {};
  for (const r of data ?? []) map[(r as { name: string; field_type_id: string }).name] = (r as { name: string; field_type_id: string }).field_type_id;
  return {
    text: map['text'] ?? '',
    datetime: map['datetime'] ?? null,
    lookup: map['lookup'] ?? null,
    choice: map['choice'] ?? null,
  };
}

async function getCrmUserEntityId(): Promise<string | null> {
  const { data } = await supabase
    .from('entity_definition')
    .select('entity_definition_id')
    .eq('logical_name', 'crm_user')
    .maybeSingle();
  return (data as { entity_definition_id: string } | null)?.entity_definition_id ?? null;
}

async function ensureSystemFields(
  entityId: string,
  primaryField: string,
  ft: FieldTypeIds,
  crmUserEntityId: string | null,
): Promise<Record<string, string>> {
  const { data: existing } = await supabase
    .from('field_definition')
    .select('field_definition_id, logical_name')
    .eq('entity_definition_id', entityId);

  const existingMap = new Map<string, string>(
    (existing ?? []).map((r: { logical_name: string; field_definition_id: string }) => [r.logical_name, r.field_definition_id])
  );

  const toInsert: Record<string, unknown>[] = [];

  // Ensure createdon
  if (!existingMap.has('createdon')) {
    toInsert.push({
      entity_definition_id: entityId,
      field_type_id: ft.datetime ?? ft.text,
      logical_name: 'createdon',
      display_name: 'Created On',
      physical_column_name: 'created_at',
      is_required: false, is_searchable: false, is_sortable: true, is_filterable: true,
      is_custom: false, is_system: true, is_deletable: false, is_schema_editable: false,
      is_managed: true, is_active: true, sort_order: 900,
    });
  }

  // Ensure modifiedon
  if (!existingMap.has('modifiedon')) {
    toInsert.push({
      entity_definition_id: entityId,
      field_type_id: ft.datetime ?? ft.text,
      logical_name: 'modifiedon',
      display_name: 'Modified On',
      physical_column_name: 'modified_at',
      is_required: false, is_searchable: false, is_sortable: true, is_filterable: true,
      is_custom: false, is_system: true, is_deletable: false, is_schema_editable: false,
      is_managed: true, is_active: true, sort_order: 910,
    });
  }

  // Ensure createdby
  if (!existingMap.has('createdby')) {
    toInsert.push({
      entity_definition_id: entityId,
      field_type_id: ft.lookup ?? ft.text,
      lookup_entity_id: crmUserEntityId,
      logical_name: 'createdby',
      display_name: 'Created By',
      physical_column_name: 'created_by',
      is_required: false, is_searchable: false, is_sortable: false, is_filterable: true,
      is_custom: false, is_system: true, is_deletable: false, is_schema_editable: false,
      is_managed: true, is_active: true, sort_order: 950,
    });
  }

  // Ensure modifiedby
  if (!existingMap.has('modifiedby')) {
    toInsert.push({
      entity_definition_id: entityId,
      field_type_id: ft.lookup ?? ft.text,
      lookup_entity_id: crmUserEntityId,
      logical_name: 'modifiedby',
      display_name: 'Modified By',
      physical_column_name: 'modified_by',
      is_required: false, is_searchable: false, is_sortable: false, is_filterable: true,
      is_custom: false, is_system: true, is_deletable: false, is_schema_editable: false,
      is_managed: true, is_active: true, sort_order: 960,
    });
  }

  // Ensure ownerid
  if (!existingMap.has('ownerid')) {
    toInsert.push({
      entity_definition_id: entityId,
      field_type_id: ft.lookup ?? ft.text,
      lookup_entity_id: crmUserEntityId,
      logical_name: 'ownerid',
      display_name: 'Owner',
      physical_column_name: 'owner_id',
      is_required: false, is_searchable: false, is_sortable: false, is_filterable: true,
      is_custom: false, is_system: true, is_deletable: false, is_schema_editable: false,
      is_managed: false, is_active: true, sort_order: 920,
    });
  }

  // Ensure statecode field (displayed as "Status")
  if (!existingMap.has('statecode')) {
    toInsert.push({
      entity_definition_id: entityId,
      field_type_id: ft.choice ?? ft.text,
      logical_name: 'statecode',
      display_name: 'Status',
      physical_column_name: 'state_code',
      description: 'Admin-manageable parent state category',
      is_required: false, is_searchable: false, is_sortable: true, is_filterable: true,
      is_custom: false, is_system: true, is_deletable: false, is_schema_editable: false,
      is_managed: true, is_active: true, sort_order: 935,
      config_json: { is_statecode_field: true },
    });
  }

  // Ensure statusreason field
  if (!existingMap.has('statusreason')) {
    toInsert.push({
      entity_definition_id: entityId,
      field_type_id: ft.choice ?? ft.text,
      logical_name: 'statusreason',
      display_name: 'Status Reason',
      physical_column_name: 'status_reason',
      description: 'Detailed reason linked to statecode',
      is_required: false, is_searchable: false, is_sortable: true, is_filterable: true,
      is_custom: false, is_system: true, is_deletable: false, is_schema_editable: false,
      is_managed: true, is_active: true, sort_order: 940,
      config_json: { is_statusreason_field: true },
    });
  }

  // Ensure primary field is marked system
  if (existingMap.has(primaryField)) {
    await supabase
      .from('field_definition')
      .update({ is_system: true, is_deletable: false, is_schema_editable: false })
      .eq('field_definition_id', existingMap.get(primaryField)!)
      .eq('is_system', false);
  }

  // Ensure primary name field exists
  if (!existingMap.has(primaryField)) {
    toInsert.push({
      entity_definition_id: entityId,
      field_type_id: ft.text,
      logical_name: primaryField,
      display_name: 'Name',
      physical_column_name: primaryField,
      is_required: true, is_searchable: true, is_sortable: true, is_filterable: true,
      is_custom: false, is_system: true, is_deletable: false, is_schema_editable: false,
      is_managed: false, is_active: true, sort_order: 10,
    });
  }

  if (toInsert.length > 0) {
    await supabase.from('field_definition').insert(toInsert);
  }

  // Re-fetch to get all field IDs
  const { data: allFields } = await supabase
    .from('field_definition')
    .select('field_definition_id, logical_name')
    .eq('entity_definition_id', entityId);

  const result: Record<string, string> = {};
  for (const r of allFields ?? []) {
    result[(r as { logical_name: string; field_definition_id: string }).logical_name] =
      (r as { logical_name: string; field_definition_id: string }).field_definition_id;
  }
  return result;
}

async function ensureDefaultViews(
  entityId: string,
  pluralName: string,
  fieldIds: Record<string, string>,
  primaryField: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from('view_definition')
    .select('view_id, name')
    .eq('entity_definition_id', entityId)
    .eq('is_system', true);

  const existingNames = new Set((existing ?? []).map((v: { name: string }) => v.name));

  const viewsToCreate: Array<{
    name: string;
    description: string;
    is_default: boolean;
    filter_json: unknown;
  }> = [];

  if (!existingNames.has('Active Records')) {
    viewsToCreate.push({
      name: 'Active Records',
      description: `Shows only active ${pluralName.toLowerCase()}.`,
      is_default: true,
      filter_json: {
        id: 'root', operator: 'AND',
        conditions: [{ id: 'c1', field_logical_name: 'statecode', field_display_name: 'Status', field_type_name: 'choice', operator: 'eq', value: '1' }],
        groups: [],
      },
    });
  }

  if (!existingNames.has('Inactive Records')) {
    viewsToCreate.push({
      name: 'Inactive Records',
      description: `Shows only inactive ${pluralName.toLowerCase()}.`,
      is_default: false,
      filter_json: {
        id: 'root', operator: 'AND',
        conditions: [{ id: 'c1', field_logical_name: 'statecode', field_display_name: 'Status', field_type_name: 'choice', operator: 'eq', value: '2' }],
        groups: [],
      },
    });
  }

  if (!existingNames.has('All Records')) {
    viewsToCreate.push({
      name: 'All Records',
      description: `Shows all ${pluralName.toLowerCase()} records.`,
      is_default: false,
      filter_json: null,
    });
  }

  for (const v of viewsToCreate) {
    const { data: newView } = await supabase
      .from('view_definition')
      .insert({
        entity_definition_id: entityId,
        name: v.name,
        view_type: 'public',
        description: v.description,
        is_default: v.is_default,
        is_active: true,
        is_system: true,
        is_deletable: false,
        filter_json: v.filter_json,
        sort_json: [{ field_logical_name: 'created_at', field_display_name: 'Created On', direction: 'desc', order: 0 }],
      })
      .select('view_id')
      .single();

    if (newView) {
      await seedViewColumns((newView as { view_id: string }).view_id, fieldIds, primaryField);
    }
  }

  // For existing system views with no columns, seed them too
  for (const v of existing ?? []) {
    const vTyped = v as { view_id: string; name: string };
    const { count } = await supabase
      .from('view_column')
      .select('view_column_id', { count: 'exact', head: true })
      .eq('view_id', vTyped.view_id);
    if ((count ?? 0) === 0) {
      await seedViewColumns(vTyped.view_id, fieldIds, primaryField);
    }
  }
}

async function seedViewColumns(
  viewId: string,
  fieldIds: Record<string, string>,
  primaryField: string,
): Promise<void> {
  const cols: Array<{ view_id: string; field_definition_id: string; display_order: number; is_sortable: boolean; is_hidden: boolean }> = [];
  let order = 0;

  if (fieldIds[primaryField]) {
    cols.push({ view_id: viewId, field_definition_id: fieldIds[primaryField], display_order: order, is_sortable: true, is_hidden: false });
    order += 10;
  }
  if (fieldIds['statecode']) {
    cols.push({ view_id: viewId, field_definition_id: fieldIds['statecode'], display_order: order, is_sortable: true, is_hidden: false });
    order += 10;
  }
  if (fieldIds['ownerid']) {
    cols.push({ view_id: viewId, field_definition_id: fieldIds['ownerid'], display_order: order, is_sortable: false, is_hidden: false });
    order += 10;
  }
  if (fieldIds['createdon']) {
    cols.push({ view_id: viewId, field_definition_id: fieldIds['createdon'], display_order: order, is_sortable: true, is_hidden: false });
    order += 10;
  }
  if (fieldIds['modifiedon']) {
    cols.push({ view_id: viewId, field_definition_id: fieldIds['modifiedon'], display_order: order, is_sortable: true, is_hidden: false });
  }

  if (cols.length > 0) {
    await supabase.from('view_column').insert(cols);
  }
}

function buildMainFormLayout(
  primaryField: string,
  primaryFdId: string,
  displayName: string,
  fieldIds: Record<string, string> = {},
): unknown {
  const systemControls: unknown[] = [];
  if (fieldIds['createdon']) {
    systemControls.push({
      id: 'ctrl_createdon', control_type: 'field',
      field_definition_id: fieldIds['createdon'], field_logical_name: 'createdon',
      field_display_name: 'Created On', field_type_name: 'datetime',
      label_override: null, column_span: 1, display_order: 0,
      is_visible: true, is_readonly: true, is_required_override: false, subgrid_config: null,
    });
  }
  if (fieldIds['modifiedon']) {
    systemControls.push({
      id: 'ctrl_modifiedon', control_type: 'field',
      field_definition_id: fieldIds['modifiedon'], field_logical_name: 'modifiedon',
      field_display_name: 'Modified On', field_type_name: 'datetime',
      label_override: null, column_span: 1, display_order: 1,
      is_visible: true, is_readonly: true, is_required_override: false, subgrid_config: null,
    });
  }
  if (fieldIds['createdby']) {
    systemControls.push({
      id: 'ctrl_createdby', control_type: 'field',
      field_definition_id: fieldIds['createdby'], field_logical_name: 'createdby',
      field_display_name: 'Created By', field_type_name: 'lookup',
      label_override: null, column_span: 1, display_order: 2,
      is_visible: true, is_readonly: true, is_required_override: false, subgrid_config: null,
    });
  }
  if (fieldIds['modifiedby']) {
    systemControls.push({
      id: 'ctrl_modifiedby', control_type: 'field',
      field_definition_id: fieldIds['modifiedby'], field_logical_name: 'modifiedby',
      field_display_name: 'Modified By', field_type_name: 'lookup',
      label_override: null, column_span: 1, display_order: 3,
      is_visible: true, is_readonly: true, is_required_override: false, subgrid_config: null,
    });
  }

  return {
    tabs: [
      {
        id: 'tab_general',
        name: 'general',
        label: 'General',
        display_order: 0,
        is_visible: true,
        sections: [
          {
            id: 'sec_main',
            name: 'main_info',
            label: `${displayName} Information`,
            columns: 2,
            display_order: 0,
            is_visible: true,
            is_collapsed: false,
            controls: [
              {
                id: 'ctrl_primary',
                control_type: 'field',
                field_definition_id: primaryFdId,
                field_logical_name: primaryField,
                field_display_name: 'Name',
                field_type_name: 'text',
                label_override: null,
                column_span: 2,
                is_visible: true,
                is_readonly: false,
                is_required_override: true,
                subgrid_config: null,
              },
            ],
          },
        ],
      },
      {
        id: 'tab_system',
        name: 'system_info',
        label: 'System',
        display_order: 99,
        is_visible: true,
        sections: [
          {
            id: 'sec_system',
            name: 'system_fields',
            label: 'System Information',
            columns: 2,
            display_order: 0,
            is_visible: true,
            is_collapsed: true,
            controls: systemControls,
          },
        ],
      },
    ],
  };
}

function buildQuickCreateLayout(primaryField: string, primaryFdId: string): unknown {
  return {
    tabs: [
      {
        id: 'tab_main',
        name: 'main',
        label: 'Details',
        display_order: 0,
        is_visible: true,
        sections: [
          {
            id: 'sec_qc',
            name: 'quick_create',
            label: 'Essential Information',
            columns: 1,
            display_order: 0,
            is_visible: true,
            is_collapsed: false,
            controls: [
              {
                id: 'ctrl_qc_primary',
                control_type: 'field',
                field_definition_id: primaryFdId,
                field_logical_name: primaryField,
                field_display_name: 'Name',
                field_type_name: 'text',
                label_override: null,
                column_span: 1,
                is_visible: true,
                is_readonly: false,
                is_required_override: true,
                subgrid_config: null,
              },
            ],
          },
        ],
      },
    ],
  };
}

function buildQuickViewLayout(primaryField: string, primaryFdId: string, displayName: string): unknown {
  return {
    tabs: [
      {
        id: 'tab_summary',
        name: 'summary',
        label: 'Summary',
        display_order: 0,
        is_visible: true,
        sections: [
          {
            id: 'sec_qv',
            name: 'quick_view',
            label: `${displayName} Details`,
            columns: 1,
            display_order: 0,
            is_visible: true,
            is_collapsed: false,
            controls: [
              {
                id: 'ctrl_qv_primary',
                control_type: 'field',
                field_definition_id: primaryFdId,
                field_logical_name: primaryField,
                field_display_name: 'Name',
                field_type_name: 'text',
                label_override: null,
                column_span: 1,
                is_visible: true,
                is_readonly: true,
                is_required_override: false,
                subgrid_config: null,
              },
            ],
          },
        ],
      },
    ],
  };
}

async function ensureDefaultForms(
  entityId: string,
  displayName: string,
  primaryField: string,
  fieldIds: Record<string, string>,
  allFieldIds: Record<string, string>,
): Promise<void> {
  const primaryFdId = fieldIds[primaryField] ?? '';

  const { data: existing } = await supabase
    .from('form_definition')
    .select('form_id, form_type')
    .eq('entity_definition_id', entityId)
    .eq('is_system', true);

  const existingTypes = new Set((existing ?? []).map((f: { form_type: string }) => f.form_type));

  const formsToCreate: Array<{
    form_type: string;
    name: string;
    description: string;
    layout_json: unknown;
  }> = [];

  if (!existingTypes.has('main')) {
    formsToCreate.push({
      form_type: 'main',
      name: `${displayName} Main Form`,
      description: `Primary data entry and editing form for ${displayName} records.`,
      layout_json: buildMainFormLayout(primaryField, primaryFdId, displayName, allFieldIds),
    });
  } else if (primaryFdId) {
    // If main form exists but has no layout_json, inject it
    const emptyMain = (existing ?? []).find((f: { form_type: string }) => f.form_type === 'main');
    if (emptyMain) {
      const { data: formData } = await supabase
        .from('form_definition')
        .select('layout_json')
        .eq('form_id', (emptyMain as { form_id: string }).form_id)
        .maybeSingle();
      if (!formData || !(formData as { layout_json: unknown }).layout_json) {
        await supabase
          .from('form_definition')
          .update({ layout_json: buildMainFormLayout(primaryField, primaryFdId, displayName, allFieldIds) })
          .eq('form_id', (emptyMain as { form_id: string }).form_id);
      }
    }
  }

  if (!existingTypes.has('quick_create')) {
    formsToCreate.push({
      form_type: 'quick_create',
      name: `${displayName} Quick Create`,
      description: `Lightweight creation form with essential fields for ${displayName}.`,
      layout_json: buildQuickCreateLayout(primaryField, primaryFdId),
    });
  }

  if (!existingTypes.has('quick_view')) {
    formsToCreate.push({
      form_type: 'quick_view',
      name: `${displayName} Quick View`,
      description: `Read-only summary panel for ${displayName} records.`,
      layout_json: buildQuickViewLayout(primaryField, primaryFdId, displayName),
    });
  }

  for (const f of formsToCreate) {
    await supabase.from('form_definition').insert({
      entity_definition_id: entityId,
      name: f.name,
      form_type: f.form_type,
      description: f.description,
      is_default: true,
      is_active: true,
      is_published: true,
      is_system: true,
      is_deletable: false,
      layout_json: f.layout_json,
    });
  }
}

/**
 * Provisions all default CRM system infrastructure for an entity:
 * - System fields: createdon, modifiedon, ownerid, status (+ ensures primary field is marked system)
 * - Default views: Active, Inactive, All — each with default columns
 * - Default forms: Main Form, Quick Create Form, Quick View Form — each with primary field in layout
 *
 * Idempotent — safe to call multiple times; only creates what is missing.
 */
export async function bootstrapEntity(entity: EntityDefinition): Promise<void> {
  const [ft, crmUserEntityId] = await Promise.all([
    getFieldTypeIds(),
    getCrmUserEntityId(),
  ]);

  const primaryField = entity.primary_field_name ?? 'name';
  const fieldIds = await ensureSystemFields(entity.entity_definition_id, primaryField, ft, crmUserEntityId);

  await Promise.all([
    ensureDefaultViews(entity.entity_definition_id, entity.display_name_plural, fieldIds, primaryField),
    ensureDefaultForms(entity.entity_definition_id, entity.display_name, primaryField, fieldIds, fieldIds),
  ]);
}
