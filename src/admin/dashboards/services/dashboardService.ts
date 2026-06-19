import { supabase } from '../../../lib/supabase';
import type {
  Dashboard, DashboardDefinition, DashboardPage, DashboardVisual, DashboardFilter,
  DashboardMeasure, DashboardTheme, DashboardPermission, DashboardListRow,
  DashboardSemanticFilter, DashboardFilterMapping, DashboardVisualFilterBinding,
} from '../types/dashboard';

// Until 20260617150000_dashboard_semantic_filters.sql is applied these relations
// are absent; treat that one Postgres error as "feature not provisioned yet".
const MISSING_RELATION = '42P01';
const isMissingRelation = (e: unknown): boolean =>
  !!e && typeof e === 'object' && (e as { code?: string }).code === MISSING_RELATION;

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ── List ─────────────────────────────────────────────────────────────────────
export async function fetchDashboards(): Promise<DashboardListRow[]> {
  const { data, error } = await supabase
    .from('dashboard')
    .select('*, primary_entity:entity_definition!primary_entity_id(display_name)')
    .is('deleted_at', null)
    .order('modified_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => {
    const row = d as Dashboard & { primary_entity?: { display_name?: string } | null };
    return { ...row, primary_entity_name: row.primary_entity?.display_name ?? null };
  });
}

export async function fetchDashboard(id: string): Promise<Dashboard> {
  const { data, error } = await supabase
    .from('dashboard').select('*').eq('dashboard_id', id).is('deleted_at', null).single();
  if (error) throw error;
  return data as Dashboard;
}

// ── Full definition (pages + visuals + filters + measures) ────────────────────
export async function fetchDefinition(id: string): Promise<DashboardDefinition> {
  const [dash, pages, visuals, filters, measures] = await Promise.all([
    fetchDashboard(id),
    supabase.from('dashboard_page').select('*').eq('dashboard_id', id).order('page_order'),
    supabase.from('dashboard_visual').select('*').eq('dashboard_id', id),
    supabase.from('dashboard_filter').select('*').eq('dashboard_id', id),
    supabase.from('dashboard_measure').select('*').eq('dashboard_id', id).order('name'),
  ]);
  for (const r of [pages, visuals, filters, measures]) if (r.error) throw r.error;

  // Global semantic filters — tolerate the tables not existing yet (pre-migration).
  const [sem, maps, binds] = await Promise.all([
    supabase.from('dashboard_semantic_filter').select('*').eq('dashboard_id', id),
    supabase.from('dashboard_filter_mapping').select('*').eq('dashboard_id', id),
    supabase.from('dashboard_visual_filter_binding').select('*').eq('dashboard_id', id),
  ]);
  for (const r of [sem, maps, binds]) if (r.error && !isMissingRelation(r.error)) throw r.error;

  return {
    dashboard: dash,
    pages: (pages.data ?? []) as DashboardPage[],
    visuals: (visuals.data ?? []) as DashboardVisual[],
    filters: (filters.data ?? []) as DashboardFilter[],
    measures: (measures.data ?? []) as DashboardMeasure[],
    semanticFilters: (sem.data ?? []) as DashboardSemanticFilter[],
    filterMappings: (maps.data ?? []) as DashboardFilterMapping[],
    visualBindings: (binds.data ?? []) as DashboardVisualFilterBinding[],
  };
}

// ── Create / update / delete ──────────────────────────────────────────────────
export interface DashboardCreateInput {
  name: string;
  description?: string;
  dashboard_type: Dashboard['dashboard_type'];
  primary_entity_id?: string | null;
  default_date_field_id?: string | null;
  default_date_range?: Dashboard['default_date_range'];
  business_unit_id?: string | null;
  theme_id?: string | null;
  refresh_interval?: Dashboard['refresh_interval'];
  status?: Dashboard['status'];
}

export async function createDashboard(input: DashboardCreateInput): Promise<Dashboard> {
  // owner_id / created_by / modified_by default to auth.uid() in the DB.
  const { data, error } = await supabase
    .from('dashboard')
    .insert({
      name: input.name,
      description: input.description ?? '',
      dashboard_type: input.dashboard_type,
      primary_entity_id: input.primary_entity_id ?? null,
      default_date_field_id: input.default_date_field_id ?? null,
      default_date_range: input.default_date_range ?? 'this_month',
      business_unit_id: input.business_unit_id ?? null,
      theme_id: input.theme_id ?? null,
      refresh_interval: input.refresh_interval ?? 'manual',
      status: input.status ?? 'draft',
    })
    .select()
    .single();
  if (error) throw error;
  const dash = data as Dashboard;
  // Seed a default page so the designer opens onto a canvas.
  await supabase.from('dashboard_page').insert({
    dashboard_id: dash.dashboard_id, name: 'Page 1', display_name: 'Page 1',
    page_order: 0, is_default: true,
  });
  return dash;
}

export async function updateDashboard(id: string, updates: Partial<Dashboard>): Promise<Dashboard> {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from('dashboard')
    .update({ ...updates, modified_by: uid, modified_at: new Date().toISOString() })
    .eq('dashboard_id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Dashboard;
}

// ── Org-wide default ("for all users") ────────────────────────────────────────
// Marks one dashboard as the org-wide default shown on every user's Sales
// Dashboard. A partial unique index allows only one default at a time, so clear
// the existing one first (two-step to avoid transiently violating the index).
export async function setDefaultDashboard(id: string): Promise<void> {
  const uid = await currentUserId();
  const { error: clearErr } = await supabase
    .from('dashboard')
    .update({ is_default: false, modified_by: uid })
    .eq('is_default', true)
    .neq('dashboard_id', id);
  if (clearErr) throw clearErr;
  const { error } = await supabase
    .from('dashboard')
    .update({ is_default: true, modified_by: uid })
    .eq('dashboard_id', id);
  if (error) throw error;
}

export async function clearDefaultDashboard(id: string): Promise<void> {
  const uid = await currentUserId();
  const { error } = await supabase
    .from('dashboard')
    .update({ is_default: false, modified_by: uid })
    .eq('dashboard_id', id);
  if (error) throw error;
}

// Resolve the org-wide default dashboard's full definition for the runtime
// viewer. Prefers a published default; returns null when none is configured.
export async function fetchDefaultDashboardDefinition(): Promise<DashboardDefinition | null> {
  const { data, error } = await supabase
    .from('dashboard')
    .select('dashboard_id, status')
    .eq('is_default', true)
    .is('deleted_at', null)
    .order('status', { ascending: false }) // 'published' sorts after 'draft' → desc puts it first
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return fetchDefinition((data as { dashboard_id: string }).dashboard_id);
}

export async function softDeleteDashboard(id: string): Promise<void> {
  const uid = await currentUserId();
  const { error } = await supabase
    .from('dashboard')
    .update({ deleted_at: new Date().toISOString(), modified_by: uid })
    .eq('dashboard_id', id);
  if (error) throw error;
}

export async function duplicateDashboard(id: string): Promise<Dashboard> {
  const def = await fetchDefinition(id);
  const clone = await createDashboardFromDefinition(def, `${def.dashboard.name} (Copy)`);
  return clone;
}

// ── Sharing scope (used by Duplicate → "who is this for?") ───────────────────────
// user            → personal, owner-only
// business_unit   → my BU
// child           → my BU + all descendant BUs
// parent          → my BU + all ancestor BUs
// organization    → everyone (single organization permission row)
export type DuplicateScope = 'user' | 'business_unit' | 'child' | 'parent' | 'organization';

const ORG_PRINCIPAL = '00000000-0000-0000-0000-000000000000';

async function userBusinessUnitId(): Promise<string | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const { data } = await supabase.from('crm_user').select('business_unit_id').eq('user_id', uid).maybeSingle();
  return (data as { business_unit_id?: string } | null)?.business_unit_id ?? null;
}

async function businessUnitTree(): Promise<{ id: string; parent: string | null }[]> {
  const { data } = await supabase.from('business_unit').select('business_unit_id, parent_business_unit_id');
  return (data ?? []).map((b) => {
    const r = b as { business_unit_id: string; parent_business_unit_id: string | null };
    return { id: r.business_unit_id, parent: r.parent_business_unit_id ?? null };
  });
}

function descendantBuIds(root: string, tree: { id: string; parent: string | null }[]): string[] {
  const out = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of tree) if (n.parent && out.has(n.parent) && !out.has(n.id)) { out.add(n.id); changed = true; }
  }
  return [...out];
}
function ancestorBuIds(start: string, tree: { id: string; parent: string | null }[]): string[] {
  const byId = new Map(tree.map((n) => [n.id, n]));
  const out = new Set([start]);
  let cur = byId.get(start);
  while (cur?.parent && !out.has(cur.parent)) { out.add(cur.parent); cur = byId.get(cur.parent); }
  return [...out];
}

/** Set a dashboard's type + share permissions for the chosen scope. */
export async function applyDashboardScope(dashboardId: string, scope: DuplicateScope): Promise<void> {
  const type: Dashboard['dashboard_type'] =
    scope === 'user' ? 'personal' : scope === 'organization' ? 'system' : 'business_unit';
  await updateDashboard(dashboardId, { dashboard_type: type });

  if (scope === 'user') return; // owner-only — no extra permission rows

  if (scope === 'organization') {
    const { error } = await supabase.from('dashboard_permission').upsert(
      { dashboard_id: dashboardId, principal_type: 'organization', principal_id: ORG_PRINCIPAL, can_read: true, can_export: true },
      { onConflict: 'dashboard_id,principal_type,principal_id' },
    );
    if (error) throw error;
    return;
  }

  const myBu = await userBusinessUnitId();
  if (!myBu) throw new Error('Your account has no business unit, so it cannot be shared at a business-unit scope.');
  const tree = await businessUnitTree();
  const ids = scope === 'child' ? descendantBuIds(myBu, tree)
    : scope === 'parent' ? ancestorBuIds(myBu, tree) : [myBu];
  const rows = ids.map((id) => ({
    dashboard_id: dashboardId, principal_type: 'business_unit', principal_id: id, can_read: true, can_export: true,
  }));
  if (rows.length) {
    const { error } = await supabase.from('dashboard_permission').upsert(rows, { onConflict: 'dashboard_id,principal_type,principal_id' });
    if (error) throw error;
  }
}

export async function duplicateDashboardWithScope(id: string, scope: DuplicateScope): Promise<Dashboard> {
  const clone = await duplicateDashboard(id);
  await applyDashboardScope(clone.dashboard_id, scope);
  return clone;
}

// ── Persist the whole definition (designer Save) ──────────────────────────────
// Diff-based: upsert incoming rows, delete rows no longer present.
export async function saveDefinition(def: DashboardDefinition): Promise<void> {
  const id = def.dashboard.dashboard_id;
  const uid = await currentUserId();

  await updateDashboard(id, {
    name: def.dashboard.name,
    description: def.dashboard.description,
    theme_id: def.dashboard.theme_id,
    refresh_interval: def.dashboard.refresh_interval,
    default_date_range: def.dashboard.default_date_range,
    default_date_field_id: def.dashboard.default_date_field_id,
    primary_entity_id: def.dashboard.primary_entity_id,
  });

  // Pages
  await reconcileRows('dashboard_page', 'dashboard_page_id', id,
    def.pages.map((p) => ({ ...p, dashboard_id: id })));
  // Visuals
  await reconcileRows('dashboard_visual', 'dashboard_visual_id', id,
    def.visuals.map((v) => ({ ...v, dashboard_id: id })));
  // Filters
  await reconcileRows('dashboard_filter', 'dashboard_filter_id', id,
    def.filters.map((f) => ({ ...f, dashboard_id: id })));
  // Measures
  await reconcileRows('dashboard_measure', 'dashboard_measure_id', id,
    def.measures.map((m) => ({ ...m, dashboard_id: id })));

  // Global semantic filters (best-effort: skip cleanly if tables not provisioned).
  // Order matters: filters first (parent), then mappings + bindings (children).
  await reconcileOptional('dashboard_semantic_filter', 'dashboard_semantic_filter_id', id,
    (def.semanticFilters ?? []).map((s) => ({ ...s, dashboard_id: id })));
  await reconcileOptional('dashboard_filter_mapping', 'dashboard_filter_mapping_id', id,
    (def.filterMappings ?? []).map((m) => ({ ...m, dashboard_id: id })));
  await reconcileOptional('dashboard_visual_filter_binding', 'dashboard_visual_filter_binding_id', id,
    (def.visualBindings ?? []).map((b) => ({ ...b, dashboard_id: id })));

  void uid;
}

// Like reconcileRows but tolerates the table not existing yet (pre-migration).
async function reconcileOptional(
  table: string, pk: string, dashboardId: string, rows: Record<string, unknown>[],
): Promise<void> {
  try {
    await reconcileRows(table, pk, dashboardId, rows);
  } catch (e) {
    if (!isMissingRelation(e)) throw e;
  }
}

// Upsert provided rows and delete any existing row (for this dashboard) whose id
// is not in the incoming set.
async function reconcileRows(
  table: string, pk: string, dashboardId: string, rows: Record<string, unknown>[],
): Promise<void> {
  const incomingIds = rows.map((r) => r[pk]).filter(Boolean) as string[];

  // Delete removed rows
  const del = supabase.from(table).delete().eq('dashboard_id', dashboardId);
  if (incomingIds.length) del.not(pk, 'in', `(${incomingIds.join(',')})`);
  const { error: delErr } = await del;
  if (delErr) throw delErr;

  if (!rows.length) return;
  // Strip DB-managed audit columns. created_at/modified_at default to now() and
  // modified_at is refreshed by a BEFORE UPDATE trigger, so the client must never
  // send them. Critically, DB-loaded rows (select *) carry these keys while
  // freshly-created rows do not — PostgREST rejects an upsert array whose objects
  // have mismatched keys with a 400 ("All object keys must match"). Removing them
  // normalizes every row to the same shape.
  const clean = rows.map((r) => {
    const { created_at, modified_at, ...rest } = r;
    void created_at; void modified_at;
    return rest;
  });
  const { error: upErr } = await supabase.from(table).upsert(clean, { onConflict: pk });
  if (upErr) throw upErr;
}

// ── Build a brand-new dashboard (+ children) from a definition (import / dup) ──
export async function createDashboardFromDefinition(
  def: DashboardDefinition, name?: string,
): Promise<Dashboard> {
  const dash = await createDashboard({
    name: name ?? def.dashboard.name,
    description: def.dashboard.description,
    dashboard_type: def.dashboard.dashboard_type,
    primary_entity_id: def.dashboard.primary_entity_id,
    default_date_field_id: def.dashboard.default_date_field_id,
    default_date_range: def.dashboard.default_date_range,
    business_unit_id: def.dashboard.business_unit_id,
    theme_id: def.dashboard.theme_id,
    refresh_interval: def.dashboard.refresh_interval,
    status: 'draft',
  });

  // Remove the auto-seeded page; we re-create the imported ones with fresh ids.
  await supabase.from('dashboard_page').delete().eq('dashboard_id', dash.dashboard_id);

  // Remap page ids so visuals/filters keep their page association.
  const pageIdMap = new Map<string, string>();
  for (const p of def.pages) {
    const { data, error } = await supabase.from('dashboard_page').insert({
      dashboard_id: dash.dashboard_id,
      name: p.name, display_name: p.display_name, page_order: p.page_order,
      icon: p.icon, is_default: p.is_default, is_hidden: p.is_hidden,
      background_config: p.background_config, canvas_config: p.canvas_config,
    }).select('dashboard_page_id').single();
    if (error) throw error;
    pageIdMap.set(p.dashboard_page_id, (data as { dashboard_page_id: string }).dashboard_page_id);
  }

  if (def.visuals.length) {
    const rows = def.visuals.map((v) => ({
      dashboard_id: dash.dashboard_id,
      dashboard_page_id: pageIdMap.get(v.dashboard_page_id) ?? null,
      visual_type: v.visual_type, title: v.title,
      x: v.x, y: v.y, width: v.width, height: v.height,
      min_width: v.min_width, min_height: v.min_height, z_index: v.z_index,
      is_visible: v.is_visible, is_locked: v.is_locked,
      query_config: v.query_config, data_config: v.data_config,
      format_config: v.format_config, interaction_config: v.interaction_config,
      filter_config: v.filter_config,
    })).filter((r) => r.dashboard_page_id);
    if (rows.length) {
      const { error } = await supabase.from('dashboard_visual').insert(rows);
      if (error) throw error;
    }
  }

  if (def.measures.length) {
    const { error } = await supabase.from('dashboard_measure').insert(
      def.measures.map((m) => ({
        dashboard_id: dash.dashboard_id, name: m.name, display_name: m.display_name,
        data_type: m.data_type, expression_config: m.expression_config, format_config: m.format_config,
      })),
    );
    if (error) throw error;
  }

  return dash;
}

// ── Publish / unpublish / versioning ──────────────────────────────────────────
export async function publishDashboard(id: string): Promise<Dashboard> {
  const def = await fetchDefinition(id);
  const { data: maxRow } = await supabase
    .from('dashboard_version').select('version_number')
    .eq('dashboard_id', id).order('version_number', { ascending: false }).limit(1).maybeSingle();
  const nextVersion = ((maxRow as { version_number?: number } | null)?.version_number ?? 0) + 1;
  const uid = await currentUserId();

  const { data: ver, error: vErr } = await supabase.from('dashboard_version').insert({
    dashboard_id: id, version_number: nextVersion, definition_json: def,
    status: 'published', published_on: new Date().toISOString(), published_by: uid,
  }).select('dashboard_version_id').single();
  if (vErr) throw vErr;

  return updateDashboard(id, {
    status: 'published',
    published_version_id: (ver as { dashboard_version_id: string }).dashboard_version_id,
  });
}

export async function unpublishDashboard(id: string): Promise<Dashboard> {
  return updateDashboard(id, { status: 'draft', published_version_id: null });
}

export async function fetchVersions(id: string) {
  const { data, error } = await supabase
    .from('dashboard_version').select('dashboard_version_id, version_number, status, published_on, published_by, created_at')
    .eq('dashboard_id', id).order('version_number', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function restoreVersion(id: string, versionId: string): Promise<void> {
  const { data, error } = await supabase
    .from('dashboard_version').select('definition_json').eq('dashboard_version_id', versionId).single();
  if (error) throw error;
  const def = (data as { definition_json: DashboardDefinition }).definition_json;
  // Restore into the live draft (keep the same dashboard id).
  def.dashboard.dashboard_id = id;
  for (const p of def.pages) p.dashboard_id = id;
  for (const v of def.visuals) v.dashboard_id = id;
  await saveDefinition(def);
}

// ── Export / import JSON ───────────────────────────────────────────────────────
export async function exportDefinition(id: string): Promise<string> {
  const def = await fetchDefinition(id);
  return JSON.stringify(def, null, 2);
}

export async function importDefinition(json: string): Promise<Dashboard> {
  const def = JSON.parse(json) as DashboardDefinition;
  if (!def.dashboard || !Array.isArray(def.pages)) throw new Error('Invalid dashboard definition file.');
  return createDashboardFromDefinition(def, `${def.dashboard.name} (Imported)`);
}

// ── Themes ─────────────────────────────────────────────────────────────────────
export async function fetchThemes(): Promise<DashboardTheme[]> {
  const { data, error } = await supabase
    .from('dashboard_theme').select('*').order('is_system', { ascending: false }).order('name');
  if (error) throw error;
  return (data ?? []) as DashboardTheme[];
}

export async function saveTheme(theme: Partial<DashboardTheme>): Promise<DashboardTheme> {
  if (theme.theme_id) {
    const { data, error } = await supabase.from('dashboard_theme')
      .update({ name: theme.name, theme_config: theme.theme_config })
      .eq('theme_id', theme.theme_id).select().single();
    if (error) throw error;
    return data as DashboardTheme;
  }
  const { data, error } = await supabase.from('dashboard_theme')
    .insert({ name: theme.name, theme_config: theme.theme_config, is_system: false })
    .select().single();
  if (error) throw error;
  return data as DashboardTheme;
}

export async function deleteTheme(themeId: string): Promise<void> {
  const { error } = await supabase.from('dashboard_theme').delete().eq('theme_id', themeId);
  if (error) throw error;
}

// ── Permissions ────────────────────────────────────────────────────────────────
export async function fetchPermissions(dashboardId: string): Promise<DashboardPermission[]> {
  const { data, error } = await supabase
    .from('dashboard_permission').select('*').eq('dashboard_id', dashboardId);
  if (error) throw error;
  return (data ?? []) as DashboardPermission[];
}

export async function savePermission(p: Partial<DashboardPermission>): Promise<void> {
  const { error } = await supabase.from('dashboard_permission').upsert(p, {
    onConflict: 'dashboard_id,principal_type,principal_id',
  });
  if (error) throw error;
}

export async function deletePermission(permissionId: string): Promise<void> {
  const { error } = await supabase
    .from('dashboard_permission').delete().eq('dashboard_permission_id', permissionId);
  if (error) throw error;
}

// ── Per-user runtime state ──────────────────────────────────────────────────────
export async function loadUserState(dashboardId: string) {
  const { data } = await supabase
    .from('dashboard_user_state').select('*').eq('dashboard_id', dashboardId).maybeSingle();
  return data ?? null;
}

export async function saveUserState(
  dashboardId: string, state: { saved_filters?: unknown; selected_page_id?: string; layout_preferences?: unknown },
): Promise<void> {
  await supabase.from('dashboard_user_state').upsert(
    { dashboard_id: dashboardId, ...state, last_opened_on: new Date().toISOString() },
    { onConflict: 'dashboard_id,user_id' },
  );
}
