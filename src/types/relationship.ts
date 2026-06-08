export type RelationshipType = '1:N' | 'N:1' | 'N:N';
export type RelationshipStorageType = 'lookup' | 'junction';

export interface RelationshipDefinition {
  relationship_definition_id: string;
  name: string;
  display_name: string;
  reverse_display_name: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: RelationshipType;
  relationship_storage_type: RelationshipStorageType;
  source_lookup_field_id: string | null;
  junction_table: string | null;
  junction_source_fk: string | null;
  junction_target_fk: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  modified_at: string;
  // joined
  source_entity_name?: string;
  target_entity_name?: string;
  lookup_field_display_name?: string;
  lookup_field_physical_column?: string;
}

export interface RelationshipDefinitionWithEntities extends RelationshipDefinition {
  source_entity_display_name: string;
  target_entity_display_name: string;
  /** Physical table name of the target entity (e.g. "account") */
  target_entity_table_name?: string;
}

export type RelationshipFormData = {
  name: string;
  display_name: string;
  reverse_display_name: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: RelationshipType;
  relationship_storage_type: RelationshipStorageType;
  source_lookup_field_id: string | null;
  junction_table: string | null;
  junction_source_fk: string | null;
  junction_target_fk: string | null;
  is_active: boolean;
};
