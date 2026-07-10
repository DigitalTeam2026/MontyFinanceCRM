import { supabase } from '../../lib/supabase';
import type { LeadQualificationRule, LeadQualificationFieldMapping, CreationMode, RequalificationBehavior } from '../../types/leadQualification';
import type { RecordData } from './recordService';
import { getDefaultStatusForState } from './recordService';
import { ENTITY_DEFINITION_ID } from '../types';
import { checkForDuplicates } from './duplicateCheckingEngine';
import type { DuplicateMatch } from './duplicateCheckingEngine';
import type { LoadedProcessFlow } from './processFlowEngine';
import { buildStageEntityContext } from './processFlowEngine';
import { copyTimelineEntries } from './timelineService';

export interface ExistingOpportunity {
  opportunity_id: string;
  topic: string | null;
  state_code: string | null;
  estimated_value: number | null;
  created_at: string;
}

export interface QualifyLeadOptions {
  leadId: string;
  leadValues: RecordData;
  userId: string;
  createAccount: boolean;
  createContact: boolean;
  createOpportunity: boolean;
  /** When re-qualifying, the resolved behavior for the opportunity */
  requalOpportunityAction?: 'update_existing' | 'create_new' | 'do_nothing';
  /** When updating existing, which opportunity to update */
  updateOpportunityId?: string | null;
  /** If provided, will wire the created opportunity into the same cross-entity flow. */
  processFlow?: LoadedProcessFlow | null;
}

export interface QualifyLeadResult {
  accountId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  skippedAccount: boolean;
  skippedContact: boolean;
  skippedOpportunity: boolean;
}

export interface EntityDuplicateWarning {
  entity: 'account' | 'contact' | 'opportunity';
  matches: DuplicateMatch[];
  mustBlock: boolean;
}

export interface QualifyLeadPreview {
  rule: LeadQualificationRule;
  accountValues: RecordData;
  contactValues: RecordData;
  opportunityValues: RecordData;
  missingRequired: { entity: string; field: string }[];
  duplicateWarnings: EntityDuplicateWarning[];
  hasLinkedAccount: boolean;
  existingOpportunities: ExistingOpportunity[];
  isRequalification: boolean;
  requalificationBehavior: RequalificationBehavior;
}

// ── Physical column lookup maps (logical → physical) ──────────────────────────

const LEAD_LOGICAL_TO_PHYSICAL: Record<string, string> = {
  firstname: 'first_name',
  lastname: 'last_name',
  emailaddress1: 'email',
  telephone1: 'phone',
  mobilephone: 'mobile_phone',
  companyname: 'company_name',
  jobtitle: 'job_title',
  description: 'description',
  websiteurl: 'website',
  industrycode: 'industry',
  address1_line1: 'address_line1',
  address1_city: 'city',
  address1_stateorprovince: 'state_province',
  address1_postalcode: 'postal_code',
  address1_country: 'country_code',
  estimatedvalue: 'estimated_value',
  leadsourcecode: 'lead_source',
  productid: 'product_id',
  accountid: 'account_id',
  contact: 'contact_id',
  contactid: 'contact_id',
  topic: 'topic',
  currencyid: 'currency_id',
};

const ACCOUNT_LOGICAL_TO_PHYSICAL: Record<string, string> = {
  name: 'account_name',
  telephone1: 'phone',
  websiteurl: 'website',
  industrycode: 'industry',
  address1_city: 'city',
  address1_line1: 'address_line1',
  address1_country: 'country_code',
  description: 'description',
};

const CONTACT_LOGICAL_TO_PHYSICAL: Record<string, string> = {
  firstname: 'first_name',
  lastname: 'last_name',
  fullname: 'full_name',
  emailaddress1: 'email',
  telephone1: 'business_phone',
  mobilephone: 'mobile_phone',
  jobtitle: 'job_title',
  address1_city: 'city',
  address1_line1: 'address_line1',
  address1_country: 'country_code',
  description: 'description',
};

const OPPORTUNITY_LOGICAL_TO_PHYSICAL: Record<string, string> = {
  name: 'topic',
  topic: 'topic',
  description: 'description',
  estimatedclosedate: 'estimated_close_date',
  estimatedvalue: 'estimated_value',
  parentaccountid: 'account_id',
  parentcontactid: 'primary_contact_id',
  productid: 'product_id',
  currencyid: 'currency_id',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function leadHasLinkedAccount(leadValues: RecordData): boolean {
  return !!(leadValues['account_id']);
}

function getLeadPhysical(leadValues: RecordData, logicalName: string): unknown {
  if (logicalName === 'subject') {
    const company = leadValues['company_name'];
    if (company) return `Opportunity - ${company}`;
    const fn = leadValues['first_name'] ?? '';
    const ln = leadValues['last_name'] ?? '';
    const name = [fn, ln].filter(Boolean).join(' ');
    if (name) return `Opportunity - ${name}`;
    return null;
  }
  const physCol = LEAD_LOGICAL_TO_PHYSICAL[logicalName] ?? logicalName;
  return leadValues[physCol] ?? leadValues[logicalName] ?? null;
}

function buildPhysicalRecord(
  mappings: LeadQualificationFieldMapping[],
  targetEntity: 'account' | 'contact' | 'opportunity',
  leadValues: RecordData,
  logicalToPhysical: Record<string, string>
): RecordData {
  const knownPhysical = new Set(Object.values(logicalToPhysical));
  const result: RecordData = {};
  const entityMappings = mappings.filter((m) => m.target_entity === targetEntity);
  for (const m of entityMappings) {
    const val = getLeadPhysical(leadValues, m.lead_field);
    if (val === null || val === undefined) continue;
    const physCol = logicalToPhysical[m.target_field];
    if (!physCol && !knownPhysical.has(m.target_field)) continue;
    result[physCol ?? m.target_field] = val;
  }
  return result;
}

export async function fetchExistingOpportunities(leadId: string): Promise<ExistingOpportunity[]> {
  const { data } = await supabase
    .from('opportunity')
    .select('opportunity_id, topic, state_code, estimated_value, created_at')
    .eq('originating_lead_id', leadId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  return (data ?? []) as ExistingOpportunity[];
}

export async function fetchDefaultQualificationRule(): Promise<LeadQualificationRule | null> {
  const { data: rule } = await supabase
    .from('lead_qualification_rule')
    .select('*')
    .is('deleted_at', null)
    .eq('is_active', true)
    .eq('is_default', true)
    .maybeSingle();

  if (!rule) {
    const { data: fallback } = await supabase
      .from('lead_qualification_rule')
      .select('*')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (!fallback) return null;
    return fallback as LeadQualificationRule;
  }

  return rule as LeadQualificationRule;
}

export async function buildQualifyPreview(
  leadValues: RecordData,
  leadId?: string,
): Promise<QualifyLeadPreview | null> {
  const rule = await fetchDefaultQualificationRule();
  if (!rule) return null;

  const { data: mappings } = await supabase
    .from('lead_qualification_field_mapping')
    .select('*')
    .eq('lead_qualification_rule_id', rule.lead_qualification_rule_id)
    .order('target_entity')
    .order('display_order');

  const allMappings = (mappings ?? []) as LeadQualificationFieldMapping[];

  const accountValues = buildPhysicalRecord(allMappings, 'account', leadValues, ACCOUNT_LOGICAL_TO_PHYSICAL);
  const contactValues = buildPhysicalRecord(allMappings, 'contact', leadValues, CONTACT_LOGICAL_TO_PHYSICAL);
  const opportunityValues = buildPhysicalRecord(allMappings, 'opportunity', leadValues, OPPORTUNITY_LOGICAL_TO_PHYSICAL);
  // Reflect the lead's inherited lookups in the preview, mirroring executeQualifyLead
  // (a newly-created account/contact would replace these at execution time).
  if (leadValues['account_id']) opportunityValues['account_id'] = leadValues['account_id'];
  if (leadValues['contact_id']) opportunityValues['primary_contact_id'] = leadValues['contact_id'];
  if (!opportunityValues['product_id'] && leadValues['product_id']) {
    opportunityValues['product_id'] = leadValues['product_id'];
  }

  const missingRequired: { entity: string; field: string }[] = [];
  for (const m of allMappings) {
    if (!m.is_required) continue;
    const val = getLeadPhysical(leadValues, m.lead_field);
    if (val === null || val === undefined || String(val).trim() === '') {
      missingRequired.push({ entity: m.target_entity, field: m.target_field });
    }
  }

  const duplicateWarnings: EntityDuplicateWarning[] = [];

  const [accountDupes, contactDupes] = await Promise.all([
    Object.keys(accountValues).length > 0
      ? checkForDuplicates('accounts', accountValues, null, true).catch(() => null)
      : Promise.resolve(null),
    Object.keys(contactValues).length > 0
      ? checkForDuplicates('contacts', contactValues, null, true).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (accountDupes?.hasMatches) {
    duplicateWarnings.push({ entity: 'account', matches: accountDupes.matches, mustBlock: accountDupes.mustBlock });
  }
  if (contactDupes?.hasMatches) {
    duplicateWarnings.push({ entity: 'contact', matches: contactDupes.matches, mustBlock: contactDupes.mustBlock });
  }

  const existingOpportunities = leadId ? await fetchExistingOpportunities(leadId) : [];
  const isRequalification = existingOpportunities.length > 0;

  return {
    rule,
    accountValues,
    contactValues,
    opportunityValues,
    missingRequired,
    duplicateWarnings,
    hasLinkedAccount: leadHasLinkedAccount(leadValues),
    existingOpportunities,
    isRequalification,
    requalificationBehavior: rule.requalification_behavior ?? 'ask_user',
  };
}

export async function executeQualifyLead(opts: QualifyLeadOptions): Promise<QualifyLeadResult> {
  const { leadId, leadValues, userId, createAccount, createContact, createOpportunity, requalOpportunityAction, updateOpportunityId, processFlow } = opts;

  if (!leadHasLinkedAccount(leadValues)) {
    throw new Error('This lead must be linked to an Account before it can be qualified.');
  }

  const rule = await fetchDefaultQualificationRule();
  if (!rule) throw new Error('No active qualification rule found.');

  const { data: mappings } = await supabase
    .from('lead_qualification_field_mapping')
    .select('*')
    .eq('lead_qualification_rule_id', rule.lead_qualification_rule_id)
    .order('target_entity')
    .order('display_order');

  const allMappings = (mappings ?? []) as LeadQualificationFieldMapping[];

  // Resolve the first opportunity-side stage in a cross-entity flow (if present)
  let oppFlowId: string | null = null;
  let oppFirstStageId: string | null = null;
  if (processFlow) {
    const ctx = buildStageEntityContext(processFlow);
    const primaryEntityId = processFlow.flow.entity_definition_id;
    // Find the first stage that belongs to a different entity (the opp side)
    const firstOppStage = processFlow.activeStages.find(
      (s) => ctx.get(s.stage_key) !== primaryEntityId,
    );
    if (firstOppStage) {
      oppFlowId = processFlow.flow.process_flow_id;
      oppFirstStageId = firstOppStage.process_stage_id;
    }
  }

  // Find the stage to advance the lead to after qualification.
  // This is the first stage after the qualification-category stage (by display_order),
  // typically a terminal_success stage like "Qualified".
  let postQualifyStageKey: string | null = null;
  let postQualifyStageId: string | null = null;
  if (processFlow) {
    const ctx = buildStageEntityContext(processFlow);
    const primaryEntityId = processFlow.flow.entity_definition_id;
    // Include all stages (active + terminal) that belong to the lead entity
    const leadStages = processFlow.stages
      .filter((s) => ctx.get(s.stage_key) === primaryEntityId)
      .sort((a, b) => a.display_order - b.display_order);
    const qualifyIdx = leadStages.findIndex((s) => s.stage_category === 'qualification');
    if (qualifyIdx !== -1 && qualifyIdx + 1 < leadStages.length) {
      const next = leadStages[qualifyIdx + 1];
      postQualifyStageKey = next.stage_key;
      postQualifyStageId = next.process_stage_id;
    } else {
      // No qualification stage found — fall back to first terminal_success stage
      const terminal = leadStages.find((s) => s.stage_type === 'terminal_success');
      if (terminal) {
        postQualifyStageKey = terminal.stage_key;
        postQualifyStageId = terminal.process_stage_id;
      }
    }
  }

  // Resolve the lead's current process stage ID so we can persist it on the lead record.
  // Prefer active_process_stage_id (always reliable) over the stage_field value,
  // since some entities (e.g. lead) have no physical stage column.
  let leadCurrentStageId: string | null = postQualifyStageId;
  if (!leadCurrentStageId && processFlow) {
    const byActiveId = leadValues['active_process_stage_id']
      ? (processFlow.stageById.get(String(leadValues['active_process_stage_id'])) ?? null)
      : null;
    if (byActiveId) {
      leadCurrentStageId = byActiveId.process_stage_id;
    } else {
      const leadStageKey = String(leadValues[processFlow.flow.stage_field] ?? '');
      const currentStage = leadStageKey ? (processFlow.stageByKey.get(leadStageKey) ?? null) : null;
      leadCurrentStageId = currentStage?.process_stage_id ?? null;
    }
  }

  let accountId: string | null = null;
  let contactId: string | null = null;
  let opportunityId: string | null = null;
  const skippedAccount = !createAccount;
  const skippedContact = !createContact;
  const skippedOpportunity = !createOpportunity;

  if (createAccount) {
    const accountPhys = buildPhysicalRecord(allMappings, 'account', leadValues, ACCOUNT_LOGICAL_TO_PHYSICAL);
    // Ensure account_name (NOT NULL) is always populated
    if (!accountPhys['account_name']) {
      accountPhys['account_name'] =
        (leadValues['company_name'] as string | null) ??
        (`${leadValues['first_name'] ?? ''} ${leadValues['last_name'] ?? ''}`.trim() || 'New Account');
    }
    const { data, error } = await supabase
      .from('account')
      .insert({ ...accountPhys, created_by: userId, owner_id: userId, owner_type: 'user', state_code: '1' })
      .select('account_id')
      .single();
    if (error) throw new Error(`Failed to create Account: ${error.message}`);
    accountId = data.account_id as string;
  }

  if (createContact) {
    const contactPhys = buildPhysicalRecord(allMappings, 'contact', leadValues, CONTACT_LOGICAL_TO_PHYSICAL);
    if (accountId) contactPhys['account_id'] = accountId;
    const { data, error } = await supabase
      .from('contact')
      .insert({ ...contactPhys, created_by: userId, owner_id: userId, owner_type: 'user', state_code: '1' })
      .select('contact_id')
      .single();
    if (error) throw new Error(`Failed to create Contact: ${error.message}`);
    contactId = data.contact_id as string;
  }

  if (createOpportunity) {
    const oppPhys = buildPhysicalRecord(allMappings, 'opportunity', leadValues, OPPORTUNITY_LOGICAL_TO_PHYSICAL);
    // Carry the lead's linked lookups onto the opportunity BY ID. A newly-created
    // account/contact wins; otherwise fall back to the record already linked on the
    // lead. This mirrors what already worked for Product (via the field mapping) and
    // fixes Account/Contact showing blank when no new record is created — a lookup
    // column needs the related row's id, never the name a field mapping might copy.
    const resolvedAccountId = accountId ?? (leadValues['account_id'] as string | null) ?? null;
    if (resolvedAccountId) oppPhys['account_id'] = resolvedAccountId;
    const resolvedContactId = contactId ?? (leadValues['contact_id'] as string | null) ?? null;
    if (resolvedContactId) oppPhys['primary_contact_id'] = resolvedContactId;
    // Inherit the lead's product only when a mapping didn't already set one.
    if (!oppPhys['product_id'] && leadValues['product_id']) {
      oppPhys['product_id'] = leadValues['product_id'];
    }

    if (requalOpportunityAction === 'update_existing' && updateOpportunityId) {
      const updatePayload: Record<string, unknown> = { ...oppPhys, modified_at: new Date().toISOString(), modified_by: userId };
      const { error } = await supabase
        .from('opportunity')
        .update(updatePayload)
        .eq('opportunity_id', updateOpportunityId);
      if (error) throw new Error(`Failed to update Opportunity: ${error.message}`);
      opportunityId = updateOpportunityId;
    } else if (requalOpportunityAction !== 'do_nothing') {
      oppPhys['originating_lead_id'] = leadId;
      if (oppFlowId) oppPhys['active_process_flow_id'] = oppFlowId;
      if (oppFirstStageId) oppPhys['active_process_stage_id'] = oppFirstStageId;

      const { data, error } = await supabase
        .from('opportunity')
        .insert({ ...oppPhys, created_by: userId, owner_id: userId, owner_type: 'user', state_code: '1' })
        .select('opportunity_id')
        .single();
      if (error) throw new Error(`Failed to create Opportunity: ${error.message}`);
      opportunityId = data.opportunity_id as string;

      // Carry the lead's timeline (notes, appointments, emails, attachments) onto the
      // brand-new opportunity so they surface in its timeline too. Best-effort: a copy
      // failure must not fail an otherwise-successful qualification.
      try {
        await copyTimelineEntries('lead', leadId, 'opportunity', opportunityId);
      } catch (copyErr) {
        console.warn('Failed to copy lead timeline to opportunity:', copyErr);
      }
    }
  }

  const leadDefId = ENTITY_DEFINITION_ID['leads'];
  const qualifiedStatus = leadDefId ? await getDefaultStatusForState(leadDefId, 2) : null;
  const qualifiedStateValue = qualifiedStatus?.stateValue ?? 2;
  const qualifiedReasonValue = qualifiedStatus?.reasonValue ?? 4;

  const { error: leadUpdateErr } = await supabase
    .from('lead')
    .update({
      state_code: String(qualifiedStateValue), status_reason: String(qualifiedReasonValue),
      is_qualified: true,
      modified_at: new Date().toISOString(),
      modified_by: userId,
      ...(processFlow && postQualifyStageKey ? { [processFlow.flow.stage_field]: postQualifyStageKey } : {}),
      ...(leadCurrentStageId ? { active_process_stage_id: leadCurrentStageId } : {}),
      ...(accountId ? { qualified_account_id: accountId } : {}),
      ...(contactId ? { qualified_contact_id: contactId } : {}),
      ...(opportunityId ? { qualified_opportunity_id: opportunityId } : {}),
    })
    .eq('lead_id', leadId);
  if (leadUpdateErr) throw new Error(`Failed to update lead status: ${leadUpdateErr.message}`);

  return { accountId, contactId, opportunityId, skippedAccount, skippedContact, skippedOpportunity };
}

export function shouldPromptUser(rule: LeadQualificationRule): boolean {
  return (
    rule.create_account === 'optional' ||
    rule.create_contact === 'optional' ||
    rule.create_opportunity === 'optional'
  );
}

export function getDefaultSelections(rule: LeadQualificationRule): {
  createAccount: boolean;
  createContact: boolean;
  createOpportunity: boolean;
} {
  return {
    createAccount: rule.create_account !== 'never',
    createContact: rule.create_contact !== 'never',
    createOpportunity: rule.create_opportunity !== 'never',
  };
}

export function isCreationForced(mode: CreationMode): boolean {
  return mode === 'always';
}

export function isCreationDisabled(mode: CreationMode): boolean {
  return mode === 'never';
}
