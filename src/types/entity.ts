export type OwnershipType = 'user' | 'team' | 'organization';

export interface EntityDefinition {
  entity_definition_id: string;
  logical_name: string;
  display_name: string;
  display_name_plural: string;
  physical_table_name: string;
  primary_field_name: string;
  description: string | null;
  icon_name: string | null;
  ownership_type: OwnershipType;
  enable_activities: boolean;
  enable_notes: boolean;
  enable_audit: boolean;
  allow_timeline: boolean;
  documents_enabled: boolean;
  is_activity: boolean;
  show_in_navigation: boolean;
  is_custom: boolean;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  modified_at: string;
}

export type EntityFormData = Omit<
  EntityDefinition,
  'entity_definition_id' | 'created_at' | 'modified_at' | 'deleted_at' | 'is_custom'
> & { allow_timeline: boolean };
