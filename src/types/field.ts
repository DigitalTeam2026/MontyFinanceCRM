export interface FieldType {
  field_type_id: string;
  name: string;
  display_name: string;
  description: string | null;
  sort_order: number;
}

export interface ValidationRules {
  min_length?: number;
  max_length?: number;
  min_value?: number;
  max_value?: number;
  regex_pattern?: string;
  regex_message?: string;
  custom_message?: string;
}

export interface ChoiceOption {
  value: string;
  label: string;
  color?: string;
  sort_order: number;
}

export interface FieldDefinition {
  field_definition_id: string;
  entity_definition_id: string;
  field_type_id: string;
  lookup_entity_id: string | null;
  logical_name: string;
  display_name: string;
  physical_column_name: string;
  description: string | null;
  placeholder: string | null;
  default_value: string | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  is_required: boolean;
  is_searchable: boolean;
  is_sortable: boolean;
  is_filterable: boolean;
  is_custom: boolean;
  is_system: boolean;
  is_deletable: boolean;
  is_schema_editable: boolean;
  is_active: boolean;
  sort_order: number;
  is_secured: boolean;
  validation_rules: ValidationRules | null;
  config_json: Record<string, unknown> | null;
  deleted_at: string | null;
  created_at: string;
  modified_at: string;
  field_type?: FieldType;
  lookup_entity?: {
    physical_table_name: string;
    primary_field_name: string;
  } | null;
}

export type FieldFormData = {
  entity_definition_id: string;
  field_type_id: string;
  lookup_entity_id: string | null;
  logical_name: string;
  display_name: string;
  physical_column_name: string;
  description: string | null;
  placeholder: string | null;
  default_value: string | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  is_required: boolean;
  is_searchable: boolean;
  is_sortable: boolean;
  is_filterable: boolean;
  is_active: boolean;
  is_secured: boolean;
  sort_order: number;
  validation_rules: ValidationRules | null;
  inline_choices: ChoiceOption[];
};
