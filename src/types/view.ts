export type ViewType = 'public' | 'personal' | 'system';

export type FilterOperator =
  | 'eq' | 'neq'
  | 'contains' | 'not_contains' | 'begins_with' | 'ends_with'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'is_null' | 'is_not_null'
  | 'in' | 'not_in'
  | 'between';

export type FilterGroupOperator = 'AND' | 'OR';

export interface FilterCondition {
  id: string;
  field_logical_name: string;
  field_display_name: string;
  field_type_name: string;
  operator: FilterOperator;
  value: string | string[] | null;
  value2?: string | null;
}

export interface FilterGroup {
  id: string;
  operator: FilterGroupOperator;
  conditions: FilterCondition[];
  groups: FilterGroup[];
}

export interface SortDefinition {
  field_logical_name: string;
  field_display_name: string;
  direction: 'asc' | 'desc';
  order: number;
}

export interface ViewColumn {
  view_column_id: string;
  view_id: string;
  field_definition_id: string;
  field_logical_name?: string;
  field_display_name?: string;
  field_type_name?: string;
  display_order: number;
  width: number | null;
  is_sortable: boolean;
  label_override: string | null;
  is_hidden: boolean;
  /** Physical DB column name for the field (e.g. "website", "account_name") */
  field_physical_column?: string;
  /** For lookup/owner fields: target table name (e.g. "account") */
  lookup_table?: string;
  /** For lookup/owner fields: primary display field on target table (e.g. "account_name") */
  lookup_label_field?: string;
  /** Per-view override of which lookup field the filter searches/displays by.
   *  NULL = use entity primary field + fallbacks. */
  lookup_label_field_override?: string | null;
  /** For choice/option-set fields: the option_set.name used to load options */
  option_set_name?: string;
  /** For inline-choice fields: choices stored directly in config_json */
  inline_choices?: { value: string; label: string }[];
  /** Set when this column comes from a related entity via a lookup relationship */
  relationship_definition_id?: string | null;
  related_entity_logical_name?: string;
  related_entity_display_name?: string;
  /** Physical table name of the related entity (e.g. "account") */
  related_table_name?: string;
  /** Physical FK column on the source table joining to the related table (e.g. "account_id") */
  fk_physical_column?: string;
  relationship_display_name?: string;
}

export interface ViewDefinition {
  view_id: string;
  entity_definition_id: string;
  name: string;
  view_type: ViewType;
  description: string | null;
  filter_json: FilterGroup | null;
  sort_json: SortDefinition[] | null;
  quick_find_fields: string[];
  column_config: ViewColumn[] | null;
  is_default: boolean;
  is_system: boolean;
  is_deletable: boolean;
  is_active: boolean;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
  modified_at: string;
}

export const OPERATORS_BY_TYPE: Record<string, FilterOperator[]> = {
  text: ['eq', 'neq', 'contains', 'not_contains', 'begins_with', 'ends_with', 'is_null', 'is_not_null'],
  textarea: ['contains', 'not_contains', 'is_null', 'is_not_null'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'],
  whole_number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'],
  decimal: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'],
  currency: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'],
  date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'],
  datetime: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'],
  boolean: ['eq', 'is_null', 'is_not_null'],
  lookup: ['eq', 'neq', 'is_null', 'is_not_null'],
  choice: ['eq', 'neq', 'in', 'not_in', 'is_null', 'is_not_null'],
  multi_choice: ['in', 'not_in', 'is_null', 'is_not_null'],
  email: ['eq', 'neq', 'contains', 'begins_with', 'is_null', 'is_not_null'],
  phone: ['eq', 'contains', 'is_null', 'is_not_null'],
  url: ['eq', 'contains', 'is_null', 'is_not_null'],
};

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'Equals',
  neq: 'Not Equals',
  contains: 'Contains',
  not_contains: 'Does Not Contain',
  begins_with: 'Begins With',
  ends_with: 'Ends With',
  gt: 'Greater Than',
  gte: 'Greater Than or Equal',
  lt: 'Less Than',
  lte: 'Less Than or Equal',
  is_null: 'Is Empty',
  is_not_null: 'Is Not Empty',
  in: 'In',
  not_in: 'Not In',
  between: 'Between',
};
