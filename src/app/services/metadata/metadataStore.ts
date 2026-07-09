/**
 * Published metadata snapshot store (Sales app only).
 *
 * Holds the latest *published* customization snapshot in memory. The Sales app
 * hydrates this once at bootstrap (and again whenever a new version is
 * published). Every metadata loader consults `getTable()` first and reads from
 * the snapshot when it is hydrated, so unpublished Admin Studio edits stay
 * invisible to end users until a Publish happens.
 *
 * IMPORTANT: this store is hydrated ONLY by the Sales bootstrap
 * (PublishedMetadataProvider). Admin Studio never hydrates it, so loaders
 * shared between the two surfaces read the live (draft) tables when running
 * inside Admin Studio and the published snapshot when running inside Sales.
 *
 * The snapshot is keyed by physical table name (the same keys the publish
 * migration's build_customization_snapshot() emits), e.g. `form_definition`,
 * `view_column`, `nav_item`, `option_set_value`.
 */

export type SnapshotTable =
  | 'form_definition' | 'form_tab' | 'form_section' | 'form_control' | 'form_script'
  | 'form_event_handler' | 'subgrid_definition' | 'entity_definition' | 'field_definition'
  | 'view_definition' | 'view_column' | 'business_rule' | 'process_flow' | 'process_stage'
  | 'process_flow_transition' | 'nav_area' | 'nav_group' | 'nav_item' | 'dashboard'
  | 'dashboard_widget' | 'dashboard_role_assignment' | 'option_set' | 'option_set_value'
  | 'statecode_definition' | 'status_reason_definition' | 'relationship_definition'
  | 'lead_qualification_rule' | 'lead_qualification_field_mapping'
  | 'automation_rule' | 'automation_rule_action'
  | 'digital_rule' | 'digital_rule_condition' | 'digital_rule_action';

type Snapshot = Partial<Record<SnapshotTable, unknown[]>>;

let snapshot: Snapshot | null = null;
let version: number | null = null;

/** Replace the in-memory snapshot. Called by the Sales bootstrap on publish. */
export function hydrateSnapshot(next: Snapshot, nextVersion: number): void {
  snapshot = next ?? {};
  version = nextVersion;
}

/** Drop the snapshot entirely (loaders fall back to live queries). */
export function clearSnapshot(): void {
  snapshot = null;
  version = null;
}

/** True once the Sales app has loaded a published snapshot. */
export function isSnapshotHydrated(): boolean {
  return snapshot !== null;
}

/** The currently loaded published customization version (or null). */
export function getSnapshotVersion(): number | null {
  return version;
}

/**
 * Rows for a snapshot table, or `null` when the store is NOT hydrated (the
 * caller must then fall back to its existing live Supabase query). An empty
 * array means "hydrated, but no rows" — the caller must NOT fall back.
 */
export function getTable<T = Record<string, unknown>>(table: SnapshotTable): T[] | null {
  if (snapshot === null) return null;
  return (snapshot[table] as T[] | undefined) ?? [];
}
