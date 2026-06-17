/**
 * Customization module registry (client side).
 *
 * The single list of publishable component types. Drives the pending-change
 * summary, the publish dialog grouping, and the per-component "Unpublished"
 * indicators. Adding a new publishable module = adding one entry here.
 *
 * MUST stay in sync with the server registry in
 * supabase/migrations/20260615130000_publish_customizations.sql
 * (the change-log trigger table list + build_customization_snapshot()).
 */

export interface CustomizationModule {
  /** Stable key — matches `component_type` written by the change-log trigger. */
  key: string;
  /** Human label shown in the dialog / badges. */
  label: string;
  /** Physical tables that make up this component (for reference/snapshot). */
  tables: string[];
  /** Admin Studio module id to navigate to when opening the component. */
  moduleRoute?: string;
}

export const CUSTOMIZATION_MODULES: CustomizationModule[] = [
  { key: 'forms', label: 'Forms', moduleRoute: 'forms',
    tables: ['form_definition', 'form_tab', 'form_section', 'form_control', 'form_script', 'form_event_handler', 'subgrid_definition'] },
  { key: 'entities', label: 'Tables', moduleRoute: 'entities', tables: ['entity_definition'] },
  { key: 'fields', label: 'Columns', moduleRoute: 'fields', tables: ['field_definition'] },
  { key: 'views', label: 'Views', moduleRoute: 'views', tables: ['view_definition', 'view_column'] },
  { key: 'rules', label: 'Business Rules', moduleRoute: 'rules', tables: ['business_rule'] },
  { key: 'processflows', label: 'Business Process Flows', moduleRoute: 'processflows',
    tables: ['process_flow', 'process_stage', 'process_flow_transition'] },
  { key: 'navigation', label: 'Navigation', moduleRoute: 'navigation', tables: ['nav_area', 'nav_group', 'nav_item'] },
  { key: 'optionsets', label: 'Option Sets', tables: ['option_set', 'option_set_value'] },
  { key: 'status', label: 'Status & Status Reason', tables: ['statecode_definition', 'status_reason_definition'] },
  { key: 'relationships', label: 'Relationships', moduleRoute: 'relationships', tables: ['relationship_definition'] },
  { key: 'leadqualification', label: 'Lead Qualification',
    tables: ['lead_qualification_rule', 'lead_qualification_field_mapping'] },
  { key: 'workflows', label: 'Workflows', moduleRoute: 'workflows', tables: ['workflow_definition', 'workflow_step'] },
  { key: 'digitalrules', label: 'Digital Rules', moduleRoute: 'digitalrules',
    tables: ['digital_rule', 'digital_rule_condition', 'digital_rule_action'] },
];

const BY_KEY = new Map(CUSTOMIZATION_MODULES.map((m) => [m.key, m]));

export function moduleLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

export function moduleRoute(key: string): string | undefined {
  return BY_KEY.get(key)?.moduleRoute;
}
