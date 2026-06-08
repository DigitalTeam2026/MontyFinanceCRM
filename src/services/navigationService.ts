import { supabase } from '../lib/supabase';

export interface NavArea {
  nav_area_id: string;
  name: string;
  display_label: string;
  icon_name: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  is_deletable: boolean;
  deleted_at: string | null;
  created_at: string;
  modified_at: string;
}

export interface NavGroup {
  nav_group_id: string;
  nav_area_id: string;
  name: string;
  display_label: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  is_deletable: boolean;
  created_at: string;
  modified_at: string;
}

export interface NavItem {
  nav_item_id: string;
  nav_group_id: string;
  entity_name: string | null;
  display_label: string;
  icon_name: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  is_deletable: boolean;
  role_visibility: string[] | null;
  created_at: string;
  modified_at: string;
}

export interface NavTree {
  areas: NavArea[];
  groups: NavGroup[];
  items: NavItem[];
}

export async function fetchFullNavTree(): Promise<NavTree> {
  const [areasRes, groupsRes, itemsRes] = await Promise.all([
    supabase.from('nav_area').select('*').is('deleted_at', null).order('sort_order'),
    supabase.from('nav_group').select('*').order('sort_order'),
    supabase.from('nav_item').select('*').order('sort_order'),
  ]);
  if (areasRes.error) throw areasRes.error;
  if (groupsRes.error) throw groupsRes.error;
  if (itemsRes.error) throw itemsRes.error;
  return {
    areas: areasRes.data as NavArea[],
    groups: groupsRes.data as NavGroup[],
    items: itemsRes.data as NavItem[],
  };
}

export async function fetchNavAreas(): Promise<NavArea[]> {
  const { data, error } = await supabase
    .from('nav_area')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order');
  if (error) throw error;
  return data as NavArea[];
}

export async function createNavArea(payload: { name: string; display_label: string; icon_name: string; sort_order: number }): Promise<NavArea> {
  const { data, error } = await supabase
    .from('nav_area')
    .insert({ ...payload, is_system: false, is_deletable: true })
    .select()
    .single();
  if (error) throw error;
  return data as NavArea;
}

export async function updateNavArea(id: string, updates: Partial<Pick<NavArea, 'display_label' | 'icon_name' | 'sort_order' | 'is_active'>>): Promise<NavArea> {
  const { data, error } = await supabase
    .from('nav_area')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('nav_area_id', id)
    .select()
    .single();
  if (error) throw error;
  return data as NavArea;
}

export async function softDeleteNavArea(id: string): Promise<void> {
  const { error } = await supabase
    .from('nav_area')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('nav_area_id', id);
  if (error) throw error;
}

export async function fetchNavGroups(areaId: string): Promise<NavGroup[]> {
  const { data, error } = await supabase
    .from('nav_group')
    .select('*')
    .eq('nav_area_id', areaId)
    .order('sort_order');
  if (error) throw error;
  return data as NavGroup[];
}

export async function createNavGroup(payload: { nav_area_id: string; name: string; display_label: string; sort_order: number }): Promise<NavGroup> {
  const { data, error } = await supabase
    .from('nav_group')
    .insert({ ...payload, is_system: false, is_deletable: true })
    .select()
    .single();
  if (error) throw error;
  return data as NavGroup;
}

export async function updateNavGroup(id: string, updates: Partial<Pick<NavGroup, 'display_label' | 'sort_order' | 'is_active' | 'nav_area_id'>>): Promise<NavGroup> {
  const { data, error } = await supabase
    .from('nav_group')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('nav_group_id', id)
    .select()
    .single();
  if (error) throw error;
  return data as NavGroup;
}

export async function deleteNavGroup(id: string): Promise<void> {
  const { error } = await supabase.from('nav_group').delete().eq('nav_group_id', id);
  if (error) throw error;
}

export async function fetchNavItems(groupId: string): Promise<NavItem[]> {
  const { data, error } = await supabase
    .from('nav_item')
    .select('*')
    .eq('nav_group_id', groupId)
    .order('sort_order');
  if (error) throw error;
  return data as NavItem[];
}

export async function createNavItem(payload: Omit<NavItem, 'nav_item_id' | 'created_at' | 'modified_at' | 'is_system' | 'is_deletable'>): Promise<NavItem> {
  const { data, error } = await supabase
    .from('nav_item')
    .insert({ ...payload, is_system: false, is_deletable: true })
    .select()
    .single();
  if (error) throw error;
  return data as NavItem;
}

export async function updateNavItem(id: string, updates: Partial<Omit<NavItem, 'nav_item_id' | 'created_at' | 'modified_at' | 'is_system' | 'is_deletable'>>): Promise<NavItem> {
  const { data, error } = await supabase
    .from('nav_item')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('nav_item_id', id)
    .select()
    .single();
  if (error) throw error;
  return data as NavItem;
}

export async function deleteNavItem(id: string): Promise<void> {
  const { error } = await supabase.from('nav_item').delete().eq('nav_item_id', id);
  if (error) throw error;
}

export async function reorderNavAreas(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id, i) =>
      supabase
        .from('nav_area')
        .update({ sort_order: i, modified_at: new Date().toISOString() })
        .eq('nav_area_id', id)
    )
  );
}

export async function reorderNavGroups(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id, i) =>
      supabase
        .from('nav_group')
        .update({ sort_order: i, modified_at: new Date().toISOString() })
        .eq('nav_group_id', id)
    )
  );
}

export async function reorderNavItems(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id, i) =>
      supabase
        .from('nav_item')
        .update({ sort_order: i, modified_at: new Date().toISOString() })
        .eq('nav_item_id', id)
    )
  );
}
