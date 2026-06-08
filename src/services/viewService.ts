import { supabase } from '../lib/supabase';
import type { ViewDefinition, ViewColumn, FilterGroup, SortDefinition } from '../types/view';

export interface ViewShare {
  view_sharing_id: string;
  view_id: string;
  shared_with_user_id: string | null;
  shared_with_team_id: string | null;
  permission_level: 'read' | 'write';
  created_by: string | null;
  created_at: string;
  user_email?: string | null;
  team_name?: string | null;
}

export interface ViewColumnInput {
  field_definition_id: string;
  label_override: string | null;
  width: number | null;
  is_sortable: boolean;
  display_order: number;
  relationship_definition_id?: string | null;
}

export async function fetchViewsForEntity(entityId: string): Promise<ViewDefinition[]> {
  const { data, error } = await supabase
    .from('view_definition')
    .select('*')
    .eq('entity_definition_id', entityId)
    .is('deleted_at', null)
    .order('view_type')
    .order('name');
  if (error) throw error;
  return data as ViewDefinition[];
}

export async function fetchViewById(viewId: string): Promise<ViewDefinition> {
  const { data, error } = await supabase
    .from('view_definition')
    .select('*')
    .eq('view_id', viewId)
    .single();
  if (error) throw error;
  return data as ViewDefinition;
}

export async function fetchViewColumns(viewId: string): Promise<ViewColumn[]> {
  const { data, error } = await supabase
    .from('view_column')
    .select(`
      *,
      field_definition(
        logical_name,
        display_name,
        physical_column_name,
        field_type(name),
        option_set_id,
        config_json,
        lookup_entity:entity_definition!lookup_entity_id(
          physical_table_name,
          primary_field_name
        )
      ),
      relationship_definition(
        relationship_definition_id,
        display_name,
        target_entity_id,
        target_entity:entity_definition!target_entity_id(logical_name, display_name, physical_table_name),
        lookup_field:field_definition!source_lookup_field_id(physical_column_name)
      )
    `)
    .eq('view_id', viewId)
    .order('display_order');
  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => {
    const fd = row.field_definition as Record<string, unknown> | null;
    const ft = fd?.field_type as Record<string, unknown> | null;
    const le = fd?.lookup_entity as Record<string, unknown> | null;
    const rd = row.relationship_definition as Record<string, unknown> | null;
    const re = rd?.target_entity as Record<string, unknown> | null;
    const lf = rd?.lookup_field as Record<string, unknown> | null;
    return {
      view_column_id: row.view_column_id,
      view_id: row.view_id,
      field_definition_id: row.field_definition_id,
      field_logical_name: fd?.logical_name as string | undefined,
      field_display_name: fd?.display_name as string | undefined,
      field_physical_column: fd?.physical_column_name as string | undefined,
      field_type_name: ft?.name as string | undefined,
      option_set_name: fd?.option_set_id as string | undefined,
      inline_choices: ((fd?.config_json as Record<string, unknown> | null)?.choices as { value: string; label: string }[] | undefined) ?? undefined,
      lookup_table: le?.physical_table_name as string | undefined,
      // crm_user primary_field_name is 'full_name' but filter/display uses email
      lookup_label_field: le?.physical_table_name === 'crm_user'
        ? 'email'
        : le?.primary_field_name as string | undefined,
      display_order: row.display_order,
      width: row.width as number | null,
      is_sortable: row.is_sortable as boolean,
      label_override: row.label_override as string | null,
      is_hidden: row.is_hidden as boolean,
      relationship_definition_id: row.relationship_definition_id as string | null,
      related_entity_logical_name: re?.logical_name as string | undefined,
      related_entity_display_name: re?.display_name as string | undefined,
      related_table_name: re?.physical_table_name as string | undefined,
      fk_physical_column: lf?.physical_column_name as string | undefined,
      relationship_display_name: rd?.display_name as string | undefined,
    } as ViewColumn;
  });
}

export async function createView(payload: {
  entity_definition_id: string;
  name: string;
  view_type: string;
  description?: string | null;
  is_default?: boolean;
}): Promise<ViewDefinition> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('view_definition')
    .insert({ ...payload, is_active: true, filter_json: null, sort_json: null, created_by: user?.id ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as ViewDefinition;
}

export async function saveView(
  viewId: string,
  updates: {
    name?: string;
    description?: string | null;
    is_default?: boolean;
    filter_json?: FilterGroup | null;
    sort_json?: SortDefinition[] | null;
    quick_find_fields?: string[];
  }
): Promise<ViewDefinition> {
  const { error } = await supabase
    .from('view_definition')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('view_id', viewId);
  if (error) throw error;
  return fetchViewById(viewId);
}

export async function saveViewColumns(
  viewId: string,
  columns: ViewColumn[]
): Promise<ViewColumn[]> {
  const { error: delError } = await supabase
    .from('view_column')
    .delete()
    .eq('view_id', viewId);
  if (delError) throw delError;

  if (columns.length === 0) return [];

  const seen = new Set<string>();
  const unique = columns.filter((col) => {
    const key = `${col.field_definition_id}__${col.relationship_definition_id ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const rows = unique.map((col, idx) => ({
    view_id: viewId,
    field_definition_id: col.field_definition_id,
    display_order: idx,
    width: col.width ?? null,
    is_sortable: col.is_sortable,
    label_override: col.label_override ?? null,
    is_hidden: col.is_hidden,
    relationship_definition_id: col.relationship_definition_id ?? null,
  }));

  const { data, error } = await supabase
    .from('view_column')
    .insert(rows)
    .select();
  if (error) throw error;
  return data as ViewColumn[];
}

export async function softDeleteView(viewId: string): Promise<void> {
  const { error } = await supabase
    .from('view_definition')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('view_id', viewId);
  if (error) throw error;
}

export async function cloneView(viewId: string, newName: string): Promise<ViewDefinition> {
  const { data: source, error: fetchErr } = await supabase
    .from('view_definition')
    .select('*')
    .eq('view_id', viewId)
    .single();
  if (fetchErr) throw fetchErr;

  const {
    view_id: _id,
    created_at: _ca,
    modified_at: _ma,
    deleted_at: _da,
    created_by: _cb,
    ...rest
  } = source as ViewDefinition & { view_id: string; created_at: string; modified_at: string; deleted_at: string | null; created_by: string | null };

  const { data, error } = await supabase
    .from('view_definition')
    .insert({
      ...rest,
      name: newName,
      is_system: false,
      is_deletable: true,
      is_default: false,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ViewDefinition;
}

export async function setDefaultView(viewId: string, entityId: string): Promise<void> {
  await supabase
    .from('view_definition')
    .update({ is_default: false })
    .eq('entity_definition_id', entityId);

  const { error } = await supabase
    .from('view_definition')
    .update({ is_default: true })
    .eq('view_id', viewId);
  if (error) throw error;
}

/** Fetch all views accessible to the current user for a given entity logical name */
export async function fetchViewsForEntityLogical(entityLogicalName: string): Promise<ViewDefinition[]> {
  const { data: entityDef } = await supabase
    .from('entity_definition')
    .select('entity_definition_id')
    .eq('logical_name', entityLogicalName)
    .maybeSingle();

  if (!entityDef) return [];
  return fetchViewsForEntity(entityDef.entity_definition_id);
}

/** Fetch views accessible to the current user including shared ones */
export async function fetchAccessibleViews(entityDefinitionId: string): Promise<ViewDefinition[]> {
  const { data, error } = await supabase
    .from('view_definition')
    .select('*')
    .eq('entity_definition_id', entityDefinitionId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('view_type')
    .order('name');
  if (error) return [];
  return (data ?? []) as ViewDefinition[];
}

/** Save a new personal view for the current user with given column states */
export async function savePersonalView(payload: {
  entityDefinitionId: string;
  name: string;
  viewType: 'personal' | 'public';
  isDefault: boolean;
  columns: ViewColumnInput[];
  filterJson?: FilterGroup | null;
  sortJson?: SortDefinition[] | null;
}): Promise<ViewDefinition> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: view, error } = await supabase
    .from('view_definition')
    .insert({
      entity_definition_id: payload.entityDefinitionId,
      name: payload.name,
      view_type: payload.viewType,
      is_default: payload.isDefault,
      is_active: true,
      is_system: false,
      is_deletable: true,
      filter_json: payload.filterJson ?? null,
      sort_json: payload.sortJson ?? null,
      created_by: user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  if (payload.columns.length > 0) {
    const rows = payload.columns.map((c, i) => ({
      view_id: (view as ViewDefinition).view_id,
      field_definition_id: c.field_definition_id,
      display_order: c.display_order ?? i,
      width: c.width ?? null,
      is_sortable: c.is_sortable,
      label_override: c.label_override ?? null,
      is_hidden: false,
      relationship_definition_id: c.relationship_definition_id ?? null,
    }));
    await supabase.from('view_column').insert(rows);
  }

  if (payload.isDefault) {
    await supabase
      .from('view_definition')
      .update({ is_default: false })
      .eq('entity_definition_id', payload.entityDefinitionId)
      .neq('view_id', (view as ViewDefinition).view_id);
  }

  return view as ViewDefinition;
}

/** Update columns on an existing view */
export async function updateViewColumns(
  viewId: string,
  columns: ViewColumnInput[]
): Promise<void> {
  await supabase.from('view_column').delete().eq('view_id', viewId);
  if (columns.length === 0) return;
  const seen = new Set<string>();
  const unique = columns.filter((c) => {
    const key = `${c.field_definition_id}__${c.relationship_definition_id ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const rows = unique.map((c, i) => ({
    view_id: viewId,
    field_definition_id: c.field_definition_id,
    display_order: c.display_order ?? i,
    width: c.width ?? null,
    is_sortable: c.is_sortable,
    label_override: c.label_override ?? null,
    is_hidden: false,
    relationship_definition_id: c.relationship_definition_id ?? null,
  }));
  const { error } = await supabase.from('view_column').insert(rows);
  if (error) throw error;
}

/** Get all shares for a view */
export async function fetchViewShares(viewId: string): Promise<ViewShare[]> {
  const { data, error } = await supabase
    .from('view_sharing')
    .select('*, crm_user:shared_with_user_id(email), team:shared_with_team_id(name)')
    .eq('view_id', viewId)
    .order('created_at');
  if (error) return [];
  return (data ?? []).map((row: Record<string, unknown>) => ({
    view_sharing_id: row.view_sharing_id as string,
    view_id: row.view_id as string,
    shared_with_user_id: row.shared_with_user_id as string | null,
    shared_with_team_id: row.shared_with_team_id as string | null,
    permission_level: row.permission_level as 'read' | 'write',
    created_by: row.created_by as string | null,
    created_at: row.created_at as string,
    user_email: (row.crm_user as { email: string } | null)?.email ?? null,
    team_name: (row.team as { name: string } | null)?.name ?? null,
  }));
}

/** Add a share for a view */
export async function shareView(
  viewId: string,
  userId: string | null,
  teamId: string | null,
  permissionLevel: 'read' | 'write'
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('view_sharing').insert({
    view_id: viewId,
    shared_with_user_id: userId,
    shared_with_team_id: teamId,
    permission_level: permissionLevel,
    created_by: user?.id ?? null,
  });
  if (error) throw error;
}

/** Remove a share */
export async function removeViewShare(viewSharingId: string): Promise<void> {
  const { error } = await supabase.from('view_sharing').delete().eq('view_sharing_id', viewSharingId);
  if (error) throw error;
}

/** Rename an existing view */
export async function renameView(viewId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('view_definition')
    .update({ name, modified_at: new Date().toISOString() })
    .eq('view_id', viewId);
  if (error) throw error;
}
