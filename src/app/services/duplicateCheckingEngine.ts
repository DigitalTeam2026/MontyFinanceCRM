import { supabase } from '../../lib/supabase';
import type { AppEntity } from '../types';
import type { RecordData } from './recordService';
import type { DuplicateDetectionRule, FuzzyMatchField } from '../../types/duplicateDetection';
import { fetchDuplicateRulesByEntity } from '../../services/duplicateDetectionService';

export interface DuplicateMatch {
  recordId: string;
  recordLabel: string;
  entityName: string;
  matchedFields: { fieldName: string; value: string; matchType: 'exact' | 'fuzzy'; score?: number }[];
  ruleName: string;
  behavior: 'warn' | 'block';
}

export interface DuplicateCheckResult {
  hasMatches: boolean;
  mustBlock: boolean;
  matches: DuplicateMatch[];
}

const ENTITY_TABLE: Record<string, string> = {
  accounts:      'account',
  contacts:      'contact',
  leads:         'lead',
  opportunities: 'opportunity',
  tickets:       'ticket',
};

const ENTITY_PK: Record<string, string> = {
  accounts:      'account_id',
  contacts:      'contact_id',
  leads:         'lead_id',
  opportunities: 'opportunity_id',
  tickets:       'ticket_id',
};

const ENTITY_LABEL: Record<string, string> = {
  accounts:      'name',
  contacts:      'full_name',
  leads:         'full_name',
  opportunities: 'name',
  tickets:       'title',
};

const ENTITY_LOGICAL_NAME: Record<string, string> = {
  accounts:      'account',
  contacts:      'contact',
  leads:         'lead',
  opportunities: 'opportunity',
  tickets:       'ticket',
};

// Maps logical CRM field names (stored in duplicate rules) to physical DB column names per entity
const LOGICAL_TO_PHYSICAL: Record<string, Record<string, string>> = {
  contact: {
    firstname:           'first_name',
    lastname:            'last_name',
    fullname:            'full_name',
    emailaddress1:       'email',
    telephone1:          'business_phone',
    mobilephone:         'mobile_phone',
    jobtitle:            'job_title',
    address1_city:       'city',
    address1_line1:      'address_line1',
    address1_country:    'country_code',
    address1_postalcode: 'postal_code',
    description:         'description',
  },
  account: {
    name:                'account_name',
    telephone1:          'phone',
    websiteurl:          'website',
    industrycode:        'industry',
    address1_city:       'city',
    address1_line1:      'address_line1',
    address1_country:    'country_code',
    address1_postalcode: 'postal_code',
    description:         'description',
  },
  lead: {
    firstname:           'first_name',
    lastname:            'last_name',
    fullname:            'full_name',
    emailaddress1:       'email',
    telephone1:          'phone',
    mobilephone:         'mobile_phone',
    companyname:         'company_name',
    jobtitle:            'job_title',
    websiteurl:          'website',
    industrycode:        'industry',
    address1_city:       'city',
    address1_line1:      'address_line1',
    address1_country:    'country_code',
    description:         'description',
  },
  opportunity: {
    name:               'topic',
    description:        'description',
    estimatedvalue:     'estimated_value',
    closeprobability:   'probability',
    leadsourcecode:     'lead_source',
    parentaccountid:    'account_id',
  },
};

function toPhysical(logicalName: string, entityLogicalName: string): string {
  return LOGICAL_TO_PHYSICAL[entityLogicalName]?.[logicalName] ?? logicalName;
}

function normalize(val: unknown): string {
  if (val == null) return '';
  return String(val).trim().toLowerCase().replace(/\s+/g, ' ');
}

function similarityScore(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const longer = na.length > nb.length ? na : nb;
  const shorter = na.length > nb.length ? nb : na;
  const longerLength = longer.length;
  if (longerLength === 0) return 1;

  const distance = levenshtein(longer, shorter);
  return (longerLength - distance) / longerLength;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[m][n];
}

async function fetchCandidates(
  tableName: string,
  pkColumn: string,
  entityLogicalName: string,
  currentRecordId: string | null,
  exactFields: string[],
  values: RecordData
): Promise<RecordData[]> {
  const orParts: string[] = [];

  for (const logicalField of exactFields) {
    const physField = toPhysical(logicalField, entityLogicalName);
    // Accept value keyed by either the logical name or physical name
    const val = values[physField] ?? values[logicalField];
    if (val == null || String(val).trim() === '') continue;
    orParts.push(`${physField}.ilike.${String(val).trim()}`);
  }

  if (orParts.length === 0) return [];

  let query = supabase
    .from(tableName)
    .select('*')
    .is('is_deleted', false)
    .limit(50);

  if (currentRecordId) {
    query = query.neq(pkColumn, currentRecordId);
  }

  query = query.or(orParts.join(','));

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as RecordData[];
}

function checkExactMatch(
  candidate: RecordData,
  exactFields: string[],
  values: RecordData,
  entityLogicalName: string
): { matched: boolean; matchedFields: DuplicateMatch['matchedFields'] } {
  const matchedFields: DuplicateMatch['matchedFields'] = [];

  for (const logicalField of exactFields) {
    const physField = toPhysical(logicalField, entityLogicalName);
    // Accept value from either key form
    const inputVal = normalize(values[physField] ?? values[logicalField]);
    const candidateVal = normalize(candidate[physField] ?? candidate[logicalField]);
    if (inputVal && candidateVal && inputVal === candidateVal) {
      matchedFields.push({ fieldName: physField, value: String(values[physField] ?? values[logicalField]), matchType: 'exact' });
    }
  }

  const populatedExactFields = exactFields.filter((f) => {
    const physF = toPhysical(f, entityLogicalName);
    return normalize(values[physF] ?? values[f]).length > 0;
  });

  if (populatedExactFields.length > 0 && matchedFields.length < populatedExactFields.length) {
    return { matched: false, matchedFields: [] };
  }

  return { matched: matchedFields.length > 0, matchedFields };
}

function checkFuzzyMatch(
  candidate: RecordData,
  fuzzyFields: FuzzyMatchField[],
  values: RecordData,
  entityLogicalName: string
): DuplicateMatch['matchedFields'] {
  const matchedFields: DuplicateMatch['matchedFields'] = [];

  for (const { field: logicalField, threshold } of fuzzyFields) {
    const physField = toPhysical(logicalField, entityLogicalName);
    const inputVal = normalize(values[physField] ?? values[logicalField]);
    const candidateVal = normalize(candidate[physField] ?? candidate[logicalField]);
    if (!inputVal || !candidateVal) continue;
    const score = similarityScore(inputVal, candidateVal);
    if (score >= threshold / 100) {
      matchedFields.push({ fieldName: physField, value: String(values[physField] ?? values[logicalField]), matchType: 'fuzzy', score: Math.round(score * 100) });
    }
  }

  return matchedFields;
}

export async function checkForDuplicates(
  entity: AppEntity,
  values: RecordData,
  currentRecordId: string | null,
  isCreate: boolean
): Promise<DuplicateCheckResult> {
  const logicalName = ENTITY_LOGICAL_NAME[entity];
  const tableName = ENTITY_TABLE[entity];
  const pkColumn = ENTITY_PK[entity];
  const labelField = ENTITY_LABEL[entity];

  if (!logicalName || !tableName || !pkColumn) {
    return { hasMatches: false, mustBlock: false, matches: [] };
  }

  let rules: DuplicateDetectionRule[];
  try {
    rules = await fetchDuplicateRulesByEntity(logicalName);
  } catch {
    return { hasMatches: false, mustBlock: false, matches: [] };
  }

  const activeRules = rules.filter((r) => {
    if (!r.is_active) return false;
    if (isCreate && !r.run_on_create) return false;
    if (!isCreate && !r.run_on_update) return false;
    return true;
  });

  if (activeRules.length === 0) {
    return { hasMatches: false, mustBlock: false, matches: [] };
  }

  const allMatches: DuplicateMatch[] = [];

  for (const rule of activeRules) {
    const exactFields = rule.exact_match_fields ?? [];
    const fuzzyFields = rule.fuzzy_match_fields ?? [];

    if (exactFields.length === 0 && fuzzyFields.length === 0) continue;

    const candidates = await fetchCandidates(
      tableName,
      pkColumn,
      logicalName,
      currentRecordId,
      exactFields,
      values
    );

    for (const candidate of candidates) {
      const exactResult = exactFields.length > 0
        ? checkExactMatch(candidate, exactFields, values, logicalName)
        : { matched: true, matchedFields: [] as DuplicateMatch['matchedFields'] };

      if (!exactResult.matched && exactFields.length > 0) continue;

      const fuzzyMatched = checkFuzzyMatch(candidate, fuzzyFields, values, logicalName);

      const combinedFields = [...exactResult.matchedFields, ...fuzzyMatched];
      if (combinedFields.length === 0) continue;

      const alreadyAdded = allMatches.some(
        (m) => m.recordId === String(candidate[pkColumn])
      );
      if (alreadyAdded) continue;

      allMatches.push({
        recordId: String(candidate[pkColumn]),
        recordLabel: String(candidate[labelField] ?? candidate['name'] ?? candidate['full_name'] ?? 'Unnamed'),
        entityName: entity,
        matchedFields: combinedFields,
        ruleName: rule.name,
        behavior: rule.behavior,
      });
    }
  }

  return {
    hasMatches: allMatches.length > 0,
    mustBlock: allMatches.some((m) => m.behavior === 'block'),
    matches: allMatches,
  };
}
