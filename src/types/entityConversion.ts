// Shared types for the generalised entity-conversion system
// (Prospect → Lead today; any source → target in future).
//
// Backed by the DB tables:
//   • entity_conversion_rule
//   • entity_conversion_field_mapping
// (see migration 20260612160000_prospect_lead_conversion.sql)

export type ConversionMappingType =
  | 'direct'
  | 'lookup'
  | 'choice'
  | 'default_value'
  | 'boolean'
  | 'date'
  | 'number'
  | 'currency';

export interface EntityConversionRule {
  entity_conversion_rule_id: string;
  name: string;
  description: string | null;
  source_entity: string;   // logical_name, e.g. 'prospect'
  target_entity: string;   // logical_name, e.g. 'lead'
  trigger_event: string;   // e.g. 'convert_prospect'
  is_active: boolean;
  is_default: boolean;
  is_system: boolean;
  created_at: string;
  modified_at: string;
  deleted_at?: string | null;
  mappings?: EntityConversionFieldMapping[];
}

export interface EntityConversionFieldMapping {
  entity_conversion_field_mapping_id: string;
  entity_conversion_rule_id: string;
  source_field: string;                 // physical column on the source table
  target_field: string;                 // physical column on the target table
  mapping_type: ConversionMappingType;
  default_value: string | null;
  lookup_match_field: string | null;    // alternate key on the lookup target (iso_code, name, email…)
  is_required: boolean;
  display_order: number;
  created_at?: string;
}

// Editable subset of the rule (excludes system / timestamp columns)
export interface EntityConversionRuleFormData {
  name: string;
  description: string;
  is_active: boolean;
  is_default: boolean;
}

// UI metadata describing each mapping type
export const MAPPING_TYPE_META: Record<ConversionMappingType, { label: string; description: string }> = {
  direct:        { label: 'Direct',        description: 'Copy the value as-is from source to target' },
  lookup:        { label: 'Lookup',        description: 'Copy a lookup GUID, or match on an alternate key (ISO code, name, email)' },
  choice:        { label: 'Choice',        description: 'Copy a choice / option-set code' },
  default_value: { label: 'Default Value', description: 'Always set a fixed value (ignores the source field)' },
  boolean:       { label: 'Boolean',       description: 'Normalise Yes/No / true/false values' },
  date:          { label: 'Date',          description: 'Copy a date / datetime value' },
  number:        { label: 'Number',        description: 'Copy a numeric value' },
  currency:      { label: 'Currency',      description: 'Copy a monetary value' },
};

export const MAPPING_TYPE_OPTIONS: { value: ConversionMappingType; label: string }[] =
  (Object.keys(MAPPING_TYPE_META) as ConversionMappingType[]).map((k) => ({
    value: k,
    label: MAPPING_TYPE_META[k].label,
  }));
