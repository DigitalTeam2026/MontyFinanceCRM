import { supabase } from '../lib/supabase';
import type { Dashboard, DashboardInput, DashboardWidget, DashboardWidgetInput } from '../types/dashboard';

export async function fetchDashboards(): Promise<Dashboard[]> {
  const { data, error } = await supabase
    .from('dashboard')
    .select('*')
    .is('deleted_at', null)
    .order('module')
    .order('is_system', { ascending: false })
    .order('name');
  if (error) throw error;
  return data as Dashboard[];
}

export async function fetchDashboardWithWidgets(dashboardId: string): Promise<{
  dashboard: Dashboard;
  widgets: DashboardWidget[];
}> {
  const [dashRes, widgetRes] = await Promise.all([
    supabase.from('dashboard').select('*').eq('dashboard_id', dashboardId).single(),
    supabase
      .from('dashboard_widget')
      .select('*')
      .eq('dashboard_id', dashboardId)
      .order('sort_order'),
  ]);
  if (dashRes.error) throw dashRes.error;
  if (widgetRes.error) throw widgetRes.error;
  return {
    dashboard: dashRes.data as Dashboard,
    widgets: widgetRes.data as DashboardWidget[],
  };
}

export async function createDashboard(input: DashboardInput): Promise<Dashboard> {
  const { data, error } = await supabase
    .from('dashboard')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as Dashboard;
}

export async function updateDashboard(
  dashboardId: string,
  updates: Partial<DashboardInput>
): Promise<Dashboard> {
  const { data, error } = await supabase
    .from('dashboard')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('dashboard_id', dashboardId)
    .select()
    .single();
  if (error) throw error;
  return data as Dashboard;
}

export async function deleteDashboard(dashboardId: string): Promise<void> {
  const { error } = await supabase
    .from('dashboard')
    .update({ deleted_at: new Date().toISOString() })
    .eq('dashboard_id', dashboardId);
  if (error) throw error;
}

export async function cloneDashboard(dashboardId: string, newName: string): Promise<Dashboard> {
  const { dashboard, widgets } = await fetchDashboardWithWidgets(dashboardId);

  const { dashboard_id: _id, created_at: _ca, modified_at: _ma, deleted_at: _da,
    created_by: _cb, ...rest } = dashboard;

  const cloned = await createDashboard({
    ...rest,
    name: newName,
    is_system: false,
    is_deletable: true,
    is_active: false,
    is_default: false,
  });

  if (widgets.length > 0) {
    const clonedWidgets: DashboardWidgetInput[] = widgets.map(({ widget_id: _wid, ...w }) => ({
      ...w,
      dashboard_id: cloned.dashboard_id,
    }));
    const { error } = await supabase.from('dashboard_widget').insert(clonedWidgets);
    if (error) throw error;
  }

  return cloned;
}

export async function upsertWidgets(
  dashboardId: string,
  widgets: DashboardWidgetInput[]
): Promise<DashboardWidget[]> {
  await supabase.from('dashboard_widget').delete().eq('dashboard_id', dashboardId);
  if (widgets.length === 0) return [];
  const { data, error } = await supabase
    .from('dashboard_widget')
    .insert(widgets)
    .select();
  if (error) throw error;
  return data as DashboardWidget[];
}

export async function addWidget(widget: DashboardWidgetInput): Promise<DashboardWidget> {
  const { data, error } = await supabase
    .from('dashboard_widget')
    .insert(widget)
    .select()
    .single();
  if (error) throw error;
  return data as DashboardWidget;
}

export async function updateWidget(
  widgetId: string,
  updates: Partial<DashboardWidgetInput>
): Promise<DashboardWidget> {
  const { data, error } = await supabase
    .from('dashboard_widget')
    .update(updates)
    .eq('widget_id', widgetId)
    .select()
    .single();
  if (error) throw error;
  return data as DashboardWidget;
}

export async function deleteWidget(widgetId: string): Promise<void> {
  const { error } = await supabase.from('dashboard_widget').delete().eq('widget_id', widgetId);
  if (error) throw error;
}
