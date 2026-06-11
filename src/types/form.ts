export type FormType = 'main' | 'quick_create' | 'quick_view';

export type ControlType =
  | 'field'
  | 'subgrid'
  | 'spacer'
  | 'separator'
  | 'label'
  | 'timeline'
  | 'documents';

export type EventType = 'onLoad' | 'onSave' | 'onChange' | 'onTabChange';

export interface FormDefinition {
  form_id: string;
  entity_definition_id: string;
  name: string;
  form_type: FormType;
  description: string | null;
  is_default: boolean;
  is_system: boolean;
  is_deletable: boolean;
  is_active: boolean;
  is_published: boolean;
  published_at: string | null;
  layout_json: DesignerLayout | null;
  deleted_at: string | null;
  created_at: string;
  modified_at: string;
}

export interface FormTab {
  tab_id: string;
  form_id: string;
  name: string;
  label: string;
  display_order: number;
  is_visible: boolean;
}

export interface FormSection {
  section_id: string;
  form_id: string;
  tab_id: string | null;
  tab_name: string;
  section_name: string;
  description: string | null;
  columns: number;
  display_order: number;
  is_visible: boolean;
  is_collapsed: boolean;
}

export interface FormControl {
  control_id: string;
  section_id: string;
  field_definition_id: string | null;
  control_type: ControlType;
  label_override: string | null;
  display_order: number;
  column_span: number;
  is_visible: boolean;
  is_readonly: boolean;
  is_required_override: boolean;
  custom_css_class: string | null;
  config_json: Record<string, unknown> | null;
}

export interface SubgridDefinition {
  subgrid_id: string;
  form_section_id: string;
  related_entity_definition_id: string;
  relationship_field: string;
  name: string;
  view_id: string | null;
  display_order: number;
  rows_to_show: number;
  is_visible: boolean;
  allow_create: boolean;
  allow_associate: boolean;
}

export interface FormScript {
  script_id: string;
  form_id: string;
  name: string;
  script_type: 'js_library' | 'inline';
  source_url: string | null;
  body: string | null;
  display_order: number;
  is_active: boolean;
}

export interface FormEventHandler {
  handler_id: string;
  form_id: string;
  event_type: EventType;
  field_logical_name: string | null;
  function_name: string;
  pass_execution_context: boolean;
  is_active: boolean;
  display_order: number;
}

export interface DesignerTab {
  id: string;
  name: string;
  label: string;
  display_order: number;
  is_visible: boolean;
  sections: DesignerSection[];
}

export interface DesignerSection {
  id: string;
  name: string;
  label: string;
  columns: 1 | 2;
  /**
   * Width of the section within the tab's row grid:
   * 2 (or undefined) = full row; 1 = half row, so two half sections sit side by side.
   */
  column_span?: 1 | 2;
  display_order: number;
  is_visible: boolean;
  is_collapsed: boolean;
  controls: DesignerControl[];
}

/** Configuration stored per lookup field on the form designer. */
export interface LookupConfig {
  /** entity_definition_id of the target entity (e.g. Contact's ID) */
  target_entity_id: string;
  /** view_id of the default view to use when opening the lookup picker */
  default_view_id: string | null;
  /** logical_name of another field already on the form to filter this lookup by */
  filter_by_field_logical_name: string | null;
  /**
   * Physical FK column on the target entity that joins to the filter-by field.
   * e.g. "contact.accountid" — stored as just "accountid"
   */
  filter_fk_column: string | null;
  /** relationship_definition_id that describes the filter relationship */
  filter_relationship_id: string | null;
}

export interface DesignerControl {
  id: string;
  control_type: ControlType;
  field_definition_id: string | null;
  field_logical_name: string | null;
  field_display_name: string | null;
  field_type_name: string | null;
  label_override: string | null;
  column_span: 1 | 2;
  /** In a 2-column section: which column this control starts in (1 = left, 2 = right). */
  column_position?: 1 | 2;
  is_visible: boolean;
  is_readonly: boolean;
  is_required_override: boolean;
  subgrid_config: SubgridConfig | null;
  lookup_entity_slug?: string | null;
  /** Lookup-specific configuration. Only set when field_type_name === 'lookup'. */
  lookup_config?: LookupConfig | null;
  /** Field definition config_json — enriched at runtime for calculated fields. */
  config_json?: Record<string, unknown> | null;
}

export interface SubgridConfig {
  related_entity_id: string;
  related_entity_name: string;
  relationship_field: string;
  rows_to_show: number;
  allow_create: boolean;
  allow_associate: boolean;
  relationship_definition_id?: string | null;
  view_id?: string | null;
  quick_create_form_id?: string | null;
}

export interface DesignerLayout {
  tabs: DesignerTab[];
}

export type SelectionTarget =
  | { type: 'tab'; tabId: string }
  | { type: 'section'; tabId: string; sectionId: string }
  | { type: 'control'; tabId: string; sectionId: string; controlId: string }
  | null;
