export type CreationMode = 'always' | 'optional' | 'never';
export type RequalificationBehavior = 'update_existing' | 'create_new' | 'ask_user' | 'do_nothing';
export type TargetEntity = 'account' | 'contact' | 'opportunity';

export interface LeadQualificationRule {
  lead_qualification_rule_id: string;
  name: string;
  description: string;
  is_active: boolean;
  is_default: boolean;
  is_system: boolean;

  create_account: CreationMode;
  check_duplicate_account: boolean;

  create_contact: CreationMode;
  check_duplicate_contact: boolean;

  create_opportunity: CreationMode;
  requalification_behavior: RequalificationBehavior;
  default_process_flow_id: string | null;
  inherit_line_of_business: boolean;
  inherit_products: boolean;

  created_at: string;
  modified_at: string;
  deleted_at: string | null;

  mappings?: LeadQualificationFieldMapping[];
}

export interface LeadQualificationFieldMapping {
  lead_qualification_field_mapping_id: string;
  lead_qualification_rule_id: string;
  target_entity: TargetEntity;
  lead_field: string;
  target_field: string;
  is_required: boolean;
  transform: unknown;
  display_order: number;
  created_at: string;
}

export interface LeadQualificationRuleFormData {
  name: string;
  description: string;
  is_active: boolean;
  is_default: boolean;

  create_account: CreationMode;
  check_duplicate_account: boolean;

  create_contact: CreationMode;
  check_duplicate_contact: boolean;

  create_opportunity: CreationMode;
  requalification_behavior: RequalificationBehavior;
  default_process_flow_id: string | null;
  inherit_line_of_business: boolean;
  inherit_products: boolean;
}

export const CREATION_MODE_META: Record<CreationMode, { label: string; description: string; color: string; bg: string }> = {
  always:   { label: 'Always',   description: 'Created automatically during qualification',     color: '#059669', bg: '#d1fae5' },
  optional: { label: 'Optional', description: 'User chooses at qualification time',             color: '#2563eb', bg: '#dbeafe' },
  never:    { label: 'Never',    description: 'Not created — skip this target entity entirely', color: '#6b7280', bg: '#f3f4f6' },
};

export const REQUALIFICATION_BEHAVIOR_META: Record<RequalificationBehavior, { label: string; description: string }> = {
  update_existing: { label: 'Update Existing', description: 'Update the existing related Opportunity with mapped fields' },
  create_new:      { label: 'Create New',      description: 'Create a new Opportunity alongside existing ones' },
  ask_user:        { label: 'Ask User',        description: 'Show a dialog letting the user choose at re-qualification time' },
  do_nothing:      { label: 'Do Nothing',      description: 'Skip Opportunity creation/update during re-qualification' },
};

export const TARGET_ENTITY_LABELS: Record<TargetEntity, string> = {
  account:     'Account',
  contact:     'Contact',
  opportunity: 'Opportunity',
};

export const LEAD_FIELD_SUGGESTIONS: string[] = [
  'firstname', 'lastname', 'fullname', 'emailaddress1', 'telephone1', 'mobilephone',
  'companyname', 'jobtitle', 'subject', 'description',
  'websiteurl', 'industrycode',
  'address1_line1', 'address1_city', 'address1_stateorprovince', 'address1_postalcode', 'address1_country',
  'estimatedvalue', 'estimatedclosedate',
  'leadsourcecode', 'qualificationcomments',
];

export const TARGET_FIELD_SUGGESTIONS: Record<TargetEntity, string[]> = {
  account: [
    'name', 'telephone1', 'fax', 'websiteurl', 'industrycode',
    'address1_line1', 'address1_city', 'address1_stateorprovince', 'address1_postalcode', 'address1_country',
    'description', 'accountnumber',
  ],
  contact: [
    'firstname', 'lastname', 'fullname', 'emailaddress1', 'telephone1', 'mobilephone',
    'jobtitle', 'department',
    'address1_line1', 'address1_city', 'address1_stateorprovince', 'address1_postalcode', 'address1_country',
    'description',
  ],
  opportunity: [
    'name', 'description', 'estimatedvalue', 'estimatedclosedate',
    'closeprobability', 'leadsourcecode', 'qualificationcomments',
  ],
};
