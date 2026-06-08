import { supabase } from '../lib/supabase';
import type {
  LeadQualificationRule,
  LeadQualificationRuleFormData,
  LeadQualificationFieldMapping,
  TargetEntity,
} from '../types/leadQualification';

// ─── Rules ────────────────────────────────────────────────────────────────────

export async function fetchQualificationRules(): Promise<LeadQualificationRule[]> {
  const { data, error } = await supabase
    .from('lead_qualification_rule')
    .select('*')
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('name');
  if (error) throw error;
  return (data ?? []) as LeadQualificationRule[];
}

export async function fetchQualificationRuleWithMappings(ruleId: string): Promise<LeadQualificationRule> {
  const { data: rule, error: rErr } = await supabase
    .from('lead_qualification_rule')
    .select('*')
    .eq('lead_qualification_rule_id', ruleId)
    .is('deleted_at', null)
    .single();
  if (rErr) throw rErr;

  const { data: mappings, error: mErr } = await supabase
    .from('lead_qualification_field_mapping')
    .select('*')
    .eq('lead_qualification_rule_id', ruleId)
    .order('target_entity')
    .order('display_order');
  if (mErr) throw mErr;

  return { ...(rule as LeadQualificationRule), mappings: (mappings ?? []) as LeadQualificationFieldMapping[] };
}

export async function createQualificationRule(payload: LeadQualificationRuleFormData): Promise<LeadQualificationRule> {
  if (payload.is_default) {
    await supabase
      .from('lead_qualification_rule')
      .update({ is_default: false })
      .eq('is_default', true);
  }
  const { data, error } = await supabase
    .from('lead_qualification_rule')
    .insert({ ...payload, is_system: false })
    .select()
    .single();
  if (error) throw error;
  return data as LeadQualificationRule;
}

export async function updateQualificationRule(
  ruleId: string,
  updates: Partial<LeadQualificationRuleFormData>
): Promise<LeadQualificationRule> {
  if (updates.is_default) {
    await supabase
      .from('lead_qualification_rule')
      .update({ is_default: false })
      .neq('lead_qualification_rule_id', ruleId)
      .eq('is_default', true);
  }
  const { data, error } = await supabase
    .from('lead_qualification_rule')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('lead_qualification_rule_id', ruleId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Qualification rule not found or update not permitted');
  return data as LeadQualificationRule;
}

export async function toggleQualificationRule(ruleId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('lead_qualification_rule')
    .update({ is_active: isActive, modified_at: new Date().toISOString() })
    .eq('lead_qualification_rule_id', ruleId);
  if (error) throw error;
}

export async function softDeleteQualificationRule(ruleId: string): Promise<void> {
  const { error } = await supabase.rpc('soft_delete_qualification_rule', { p_rule_id: ruleId });
  if (error) throw error;
}

export async function cloneQualificationRule(rule: LeadQualificationRule): Promise<LeadQualificationRule> {
  const { lead_qualification_rule_id, created_at, modified_at, deleted_at, is_system, is_default, mappings, ...rest } = rule;
  const { data, error } = await supabase
    .from('lead_qualification_rule')
    .insert({ ...rest, name: `${rest.name} (Copy)`, is_system: false, is_default: false })
    .select()
    .single();
  if (error) throw error;

  const newRule = data as LeadQualificationRule;

  if (mappings && mappings.length > 0) {
    const newMappings = mappings.map(({ lead_qualification_field_mapping_id, lead_qualification_rule_id: _, created_at: _c, ...m }) => ({
      ...m,
      lead_qualification_rule_id: newRule.lead_qualification_rule_id,
    }));
    await supabase.from('lead_qualification_field_mapping').insert(newMappings);
  }

  return newRule;
}

// ─── Field Mappings ───────────────────────────────────────────────────────────

export async function fetchMappingsForRule(ruleId: string): Promise<LeadQualificationFieldMapping[]> {
  const { data, error } = await supabase
    .from('lead_qualification_field_mapping')
    .select('*')
    .eq('lead_qualification_rule_id', ruleId)
    .order('target_entity')
    .order('display_order');
  if (error) throw error;
  return (data ?? []) as LeadQualificationFieldMapping[];
}

export async function upsertMapping(
  ruleId: string,
  mapping: Omit<LeadQualificationFieldMapping, 'lead_qualification_field_mapping_id' | 'lead_qualification_rule_id' | 'created_at'>
): Promise<LeadQualificationFieldMapping> {
  const { data, error } = await supabase
    .from('lead_qualification_field_mapping')
    .insert({ ...mapping, lead_qualification_rule_id: ruleId })
    .select()
    .single();
  if (error) throw error;
  return data as LeadQualificationFieldMapping;
}

export async function updateMapping(
  mappingId: string,
  patch: Partial<Pick<LeadQualificationFieldMapping, 'lead_field' | 'target_field' | 'is_required' | 'display_order' | 'transform'>>
): Promise<LeadQualificationFieldMapping> {
  const { data, error } = await supabase
    .from('lead_qualification_field_mapping')
    .update(patch)
    .eq('lead_qualification_field_mapping_id', mappingId)
    .select()
    .single();
  if (error) throw error;
  return data as LeadQualificationFieldMapping;
}

export async function deleteMapping(mappingId: string): Promise<void> {
  const { error } = await supabase
    .from('lead_qualification_field_mapping')
    .delete()
    .eq('lead_qualification_field_mapping_id', mappingId);
  if (error) throw error;
}

export async function replaceMappingsForTarget(
  ruleId: string,
  targetEntity: TargetEntity,
  mappings: Omit<LeadQualificationFieldMapping, 'lead_qualification_field_mapping_id' | 'lead_qualification_rule_id' | 'created_at'>[]
): Promise<LeadQualificationFieldMapping[]> {
  await supabase
    .from('lead_qualification_field_mapping')
    .delete()
    .eq('lead_qualification_rule_id', ruleId)
    .eq('target_entity', targetEntity);

  if (mappings.length === 0) return [];

  const { data, error } = await supabase
    .from('lead_qualification_field_mapping')
    .insert(mappings.map((m) => ({ ...m, lead_qualification_rule_id: ruleId })))
    .select();
  if (error) throw error;
  return (data ?? []) as LeadQualificationFieldMapping[];
}
