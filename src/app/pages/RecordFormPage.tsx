import FilterSelect from '../components/FilterSelect';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChevronLeft,
  Save,
  Loader2,
  AlertCircle,
  Check,
  CheckCircle2,
  Info,
  AlertTriangle,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Star,
  Lock,
  UserCheck,
  X,
  ChevronUp,
  LogIn,
  Trophy,
  XCircle,
  SaveAll,
  ShieldAlert,
  RefreshCw,
  Zap,
  ArrowRight,
  ArrowLeft,
  Link2,
  Plus,
  Trash2,
  Share2,
  Building2,
  User,
  UserPlus,
  Target,
  Ticket,
  Factory,
  Globe,
  Coins,
  Megaphone,
  Radio,
  Package,
  Boxes,
  LayoutTemplate,
} from 'lucide-react';
import type { AppEntity, AppModule } from '../types';
import { ENTITY_LOGICAL_NAME } from '../types';
import type { DesignerLayout, DesignerTab, DesignerSection } from '../../types/form';
import type { RecordData, FieldMapping } from '../services/recordService';
import type { BusinessRule } from '../../types/businessRule';
import type { FormRuleState } from '../services/businessRulesEngine';
import {
  fetchRecord,
  fetchDefaultForm,
  fetchFormById,
  fetchSelectableMainForms,
  fetchEntityRules,
  fetchTimelineItems,
  saveRecord,
  getEntityPK,
  getEntityTable,
  clearFieldMappingCache,
  getDefaultStatusForState,
  getEntityDefinitionId,
} from '../services/recordService';
import type { TimelineItem, SelectableForm } from '../services/recordService';
import { getAllowedFormIds, isFlowAllowed } from '../services/permissionService';
import { evaluateRules, applyRuleStateToValues, getRuleMessages } from '../services/businessRulesEngine';
import type { ProcessRuleContext, RuleRuntime } from '../services/businessRulesEngine';
import { useCurrentUserName } from '../hooks/useCurrentUserName';
import { mergeStageVisibilityIntoRuleState } from '../services/stageValidationService';
import { runStageAutomations } from '../services/stageAutomationService';
import { resolveProcessFlowForRecord, loadProcessFlowById, invalidateFlowCacheById, resolveRuntimePath, filterLoadedFlowForEntity, getEntityFormIdForFlow } from '../services/processFlowEngine';
import type { LoadedProcessFlow } from '../services/processFlowEngine';
import { fetchProcessFlowsForEntity, switchRecordProcessFlow, updateRecordActiveStage } from '../../services/processFlowService';
import type { ProcessFlow } from '../../types/processFlow';
import { supabase } from '../../lib/supabase';
import FormField, { PRODUCT_PICKER_SENTINEL, pickLookupLabel } from '../components/form/FormField';
import FormSubgrid from '../components/form/FormSubgrid';
import OpportunityContactsPanel from '../components/form/OpportunityContactsPanel';
import FieldHistoryPanel from '../components/form/FieldHistoryPanel';
import ProcessStageBar from '../components/ProcessStageBar';
import { usePermissions } from '../context/PermissionContext';
import { pinRecord, unpinRecord, isRecordPinned, removeRecentItem, removePinnedRecord } from '../services/recentPinsService';
import { fetchCrmUsers, updateRowFields } from '../services/listService';
import { fetchCurrencies, fetchBaseCurrency, getCurrencyById, hasCurrencyLock, isStatusLocked, type CurrencyRecord } from '../services/currencyService';
import ChangeCurrencyModal from '../components/form/ChangeCurrencyModal';
import { FormDensityProvider, useFormDensity, densityStyles } from '../context/FormDensityContext';
import { useToast, toFriendlyError } from '../context/ToastContext';
import QualifyLeadModal from '../components/form/QualifyLeadModal';
import ReQualifyLeadModal from '../components/form/ReQualifyLeadModal';
import ReopenLeadModal from '../components/form/ReopenLeadModal';
import ConvertProspectModal, { ConversionSuccessPrompt } from '../components/form/ConvertProspectModal';
import { isProspectConverted as checkProspectConverted, isProspectActive as checkProspectActive, getConvertedLeadId, convertProspectToLead } from '../services/prospectConversionService';
import type { ConversionResult } from '../services/prospectConversionService';
import { DisqualifyReasonModal } from '../components/ProcessStageBar';
import DuplicateWarningModal from '../components/form/DuplicateWarningModal';
import TransformRecordModal from '../components/form/TransformRecordModal';
import CloseOpportunityModal from '../components/form/CloseOpportunityModal';
import ReopenOpportunityModal from '../components/form/ReopenOpportunityModal';
import ShareRecordModal from '../components/ShareRecordModal';
import TimelinePanel from '../components/form/TimelinePanel';
import DocumentsTab from '../components/DocumentsTab';
import { entityDocumentsTabEnabled } from '../../services/documentLocationService';
import { fetchRulesForEntity, getRulesForManualTrigger } from '../services/recordTransformationEngine';
import type { RecordTransformationRule } from '../../types/recordTransformation';
import { fetchLifecycleRules, fetchFormAccessRules, evaluateFormAccess, getVisibleCommands, isCreationBlocked } from '../services/lifecycleRuleEngine';
import type { FormAccessLevel } from '../../types/digitalRule';
import type { DigitalRule } from '../../types/digitalRule';
import { checkForDuplicates } from '../services/duplicateCheckingEngine';
import type { DuplicateMatch } from '../services/duplicateCheckingEngine';
import { checkDeleteRules, executeDelete } from '../services/deleteService';
import type { StageViolationEvent, MissingFormField } from '../components/ProcessStageBar';
import { fetchRelationshipsForEntity } from '../../services/relationshipService';
import { checkRecordShareAccess } from '../services/recordShareService';
import type { SharePermissions } from '../services/recordShareService';
import { resolveBorrowedLabels, borrowedTypeIsLabelResolved } from '../services/borrowedFieldResolver';

const ENTITY_CHOICE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  industrycode: [
    { value: 'technology', label: 'Technology' },
    { value: 'finance', label: 'Finance' },
    { value: 'healthcare', label: 'Healthcare' },
    { value: 'manufacturing', label: 'Manufacturing' },
    { value: 'retail', label: 'Retail' },
    { value: 'education', label: 'Education' },
    { value: 'government', label: 'Government' },
    { value: 'nonprofit', label: 'Non-Profit' },
    { value: 'other', label: 'Other' },
  ],
  stagecode: [
    { value: 'qualify', label: 'Qualify' },
    { value: 'develop', label: 'Develop' },
    { value: 'propose', label: 'Propose' },
    { value: 'close', label: 'Close' },
    { value: 'won', label: 'Won' },
    { value: 'lost', label: 'Lost' },
  ],
  prioritycode: [
    { value: 'low', label: 'Low' },
    { value: 'normal', label: 'Normal' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' },
  ],
  casetypecode: [
    { value: 'question', label: 'Question' },
    { value: 'problem', label: 'Problem' },
    { value: 'request', label: 'Request' },
  ],
  leadsourcecode: [
    { value: 'web', label: 'Web' },
    { value: 'referral', label: 'Referral' },
    { value: 'event', label: 'Event' },
    { value: 'email', label: 'Email Campaign' },
    { value: 'social', label: 'Social Media' },
    { value: 'other', label: 'Other' },
  ],
};

const FIELD_OPTION_SET_MAP: Record<string, string> = {
  countrycode: 'country_codes',
  leadsourcecode: 'lead_source',
};

const ENTITY_NEW_DEFAULTS: Partial<Record<AppEntity, Record<string, unknown>>> = {
  leads:         { state_code: '1', status_reason: '1' },
  accounts:      { state_code: '1', status_reason: '1' },
  contacts:      { state_code: '1', status_reason: '1' },
  opportunities: { state_code: '1', status_reason: '1' },
  tickets:       { state_code: '1', status_reason: '1' },
};

// Display-only singular labels for the new-record page title. These entities use
// singular logical names as their route slug, so the generic entity.slice(0, -1)
// fallback over-trims them (e.g. "currency" -> "currenc"). This map only fixes the
// displayed title; routing, forms, and record-creation behavior are unchanged.
const NEW_RECORD_ENTITY_LABELS: Record<string, string> = {
  currency:   'Currency',
  currencies: 'Currency',
  industry:   'Industry',
  industries: 'Industry',
  country:    'Country',
  countries:  'Country',
  campaign:   'Campaign',
  campaigns:  'Campaign',
  source:     'Source',
  sources:    'Source',
  crm_source: 'Source',
  product:          'Product',
  products:         'Product',
  product_family:   'Product_Family',
  product_families: 'Product_Family',
};


const HISTORY_TAB_ID = 'history_tab__field_history';

function normalizeLayout(raw: unknown): DesignerLayout | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return { tabs: raw as DesignerTab[] };
  if (typeof raw === 'object' && 'tabs' in (raw as object) && Array.isArray((raw as DesignerLayout).tabs)) return raw as DesignerLayout;
  return null;
}

const ENTITY_SUBGRID_TABS: Record<AppEntity, { label: string; configKey: string }[]> = {
  accounts: [],
  contacts: [
    { label: 'Tickets', configKey: 'ticket_contact' },
  ],
  leads: [],
  opportunities: [],
  tickets: [],
};

const SYSTEM_READONLY_FIELDS = new Set([
  'accountnumber',
  'ticketnumber',
  'createdon',
  'modifiedon',
]);

const ENTITY_SLUG_MAP: Record<string, AppEntity> = {
  contacts: 'contacts',
  opportunities: 'opportunities',
  tickets: 'tickets',
  accounts: 'accounts',
  leads: 'leads',
};

/** Maps entity logical_name (DB) → entity slug used in ENTITY_META / LOOKUP_SEARCH_CONFIG */
const ENTITY_LOGICAL_TO_SLUG: Record<string, string> = {
  account:      'accounts',
  contact:      'contacts',
  lead:         'leads',
  opportunity:  'opportunities',
  ticket:       'tickets',
  crm_user:     'users',
  prospect:     'prospect',
};

/** Static fallback map for well-known lookup fields (logical_name → entity slug).
 *  At runtime this is merged with DB-sourced values in lookupEntitySlugMap. */
const LOOKUP_FIELD_ENTITY_SLUG: Record<string, string> = {
  parentcustomerid: 'accounts',
  parentaccountid:  'accounts',
  parentcontactid:  'contacts',
  customerid:       'accounts',
  contactid:        'contacts',
  contact:          'contacts',
  accountid:        'accounts',
  opportunityid:    'opportunities',
  ownerid:          'users',
};

/** Maps logical field names to their physical column names for lookup value resolution */
const LOOKUP_LOGICAL_TO_PHYSICAL: Record<string, string> = {
  parentcustomerid: 'account_id',
  parentaccountid:  'account_id',
  parentcontactid:  'primary_contact_id',
  customerid:       'account_id',
  contactid:        'contact_id',
  accountid:        'account_id',
  opportunityid:    'opportunity_id',
  ownerid:          'owner_id',
  productid:        'product_id',
  contact:          'contact_id',
};

const LOOKUP_FETCH_CONFIG: Record<string, { table: string; pk: string; labelField: string }> = {
  accounts:         { table: 'account',        pk: 'account_id',        labelField: 'account_name' },
  contacts:         { table: 'contact',        pk: 'contact_id',        labelField: 'full_name' },
  leads:            { table: 'lead',           pk: 'lead_id',           labelField: 'full_name' },
  opportunities:    { table: 'opportunity',    pk: 'opportunity_id',    labelField: 'topic' },
  users:            { table: 'crm_user',       pk: 'user_id',          labelField: 'email' },
  account:          { table: 'account',        pk: 'account_id',        labelField: 'account_name' },
  contact:          { table: 'contact',        pk: 'contact_id',        labelField: 'full_name' },
  lead:             { table: 'lead',           pk: 'lead_id',           labelField: 'full_name' },
  opportunity:      { table: 'opportunity',    pk: 'opportunity_id',    labelField: 'topic' },
  crm_user:         { table: 'crm_user',       pk: 'user_id',          labelField: 'email' },
  country:          { table: 'country',        pk: 'country_id',        labelField: 'name' },
  industry:         { table: 'industry',       pk: 'industry_id',       labelField: 'name' },
  business_unit:    { table: 'business_unit',  pk: 'business_unit_id',  labelField: 'name' },
  product_family:   { table: 'product_family', pk: 'family_id',         labelField: 'name' },
  product:          { table: 'product',        pk: 'product_id',        labelField: 'name' },
  products:         { table: 'product',        pk: 'product_id',        labelField: 'name' },
  sources:          { table: 'crm_source',     pk: 'source_id',         labelField: 'name' },
  crm_source:       { table: 'crm_source',     pk: 'source_id',         labelField: 'name' },
  source:           { table: 'crm_source',     pk: 'source_id',         labelField: 'name' },
  campaign:         { table: 'campaign',       pk: 'campaign_id',       labelField: 'name' },
  campaigns:        { table: 'campaign',       pk: 'campaign_id',       labelField: 'name' },
  event:            { table: 'event',          pk: 'event_id',          labelField: 'name' },
  events:           { table: 'event',          pk: 'event_id',          labelField: 'name' },
  security_role:    { table: 'security_role',  pk: 'role_id',           labelField: 'name' },
  security_roles:   { table: 'security_role',  pk: 'role_id',           labelField: 'name' },
  team:             { table: 'team',           pk: 'team_id',           labelField: 'name' },
  teams:            { table: 'team',           pk: 'team_id',           labelField: 'name' },
  currency:         { table: 'currency',       pk: 'currency_id',       labelField: 'name' },
  currencies:       { table: 'currency',       pk: 'currency_id',       labelField: 'name' },
};

const LOOKUP_PK_OVERRIDES: Record<string, string> = {
  product_family: 'family_id',
  line_of_business: 'lob_id',
  crm_user: 'user_id',
  security_role: 'role_id',
  crm_source: 'source_id',
  marketing_email: 'email_id',
};

const dynamicLookupCache: Record<string, { table: string; pk: string; labelField: string } | null> = {};

async function resolveLookupFetchConfig(entitySlug: string): Promise<{ table: string; pk: string; labelField: string } | null> {
  if (LOOKUP_FETCH_CONFIG[entitySlug]) return LOOKUP_FETCH_CONFIG[entitySlug];
  if (entitySlug in dynamicLookupCache) return dynamicLookupCache[entitySlug];

  const logicalName = entitySlug.replace(/s$/, '');
  const { data } = await supabase
    .from('entity_definition')
    .select('physical_table_name, primary_field_name')
    .or(`logical_name.eq.${entitySlug},logical_name.eq.${logicalName}`)
    .maybeSingle();

  if (!data?.physical_table_name) {
    dynamicLookupCache[entitySlug] = null;
    return null;
  }

  const table = data.physical_table_name;
  const cfg = {
    table,
    pk: LOOKUP_PK_OVERRIDES[table] ?? `${table}_id`,
    labelField: data.primary_field_name ?? 'name',
  };
  dynamicLookupCache[entitySlug] = cfg;
  return cfg;
}

async function fetchLookupLabels(
  record: RecordData,
  slugMap: Record<string, string>,
  physicalMap?: Record<string, string>,
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  const tasks: Promise<void>[] = [];
  const seen = new Set<string>();

  const resolveId = (fieldName: string) =>
    record[fieldName]
    ?? record[physicalMap?.[fieldName] ?? '']
    ?? record[LOOKUP_LOGICAL_TO_PHYSICAL[fieldName] ?? ''];

  for (const [fieldName, entitySlug] of Object.entries(slugMap)) {
    const id = resolveId(fieldName);
    if (!id || typeof id !== 'string') continue;

    tasks.push(
      resolveLookupFetchConfig(entitySlug).then(async (cfg) => {
        if (!cfg) return;
        const cacheKey = `${cfg.table}:${id}`;
        if (seen.has(cacheKey)) return;
        seen.add(cacheKey);

        // Select the whole row so an empty primary label can fall back to any other
        // name-like column. Never fall back to the id itself — a GUID is not a label,
        // and setting it would block the on-demand resolver in FormField.
        const { data } = await supabase
          .from(cfg.table)
          .select('*')
          .eq(cfg.pk, id)
          .maybeSingle();

        if (data) {
          const label = pickLookupLabel(data as Record<string, unknown>, cfg.labelField);
          if (!label) return;
          for (const [fn, es] of Object.entries(slugMap)) {
            if (es === entitySlug) {
              const fid = resolveId(fn);
              if (fid === id) results[fn] = label;
            }
          }
        }
      })
    );
  }

  await Promise.all(tasks);
  return results;
}

/** A borrowed field to resolve at render time: read one column from a related row. */
interface BorrowedSpec {
  controlId: string;
  table: string;
  pk: string;
  fkColumn: string;
  fieldPhysicalColumn: string;
  fieldDefinitionId: string;
  fieldTypeName: string | null;
}

/** Collect every read-only borrowed-field control declared anywhere in the layout. */
function collectBorrowedSpecs(layout: DesignerLayout | null): BorrowedSpec[] {
  if (!layout) return [];
  const specs: BorrowedSpec[] = [];
  for (const tab of layout.tabs) {
    for (const section of tab.sections) {
      for (const control of section.controls) {
        const b = control.borrowed_field_config;
        if (control.control_type === 'field' && b && b.related_table_name && b.fk_physical_column) {
          specs.push({
            controlId: control.id,
            table: b.related_table_name,
            pk: b.related_pk || `${b.related_table_name}_id`,
            fkColumn: b.fk_physical_column,
            fieldPhysicalColumn: b.field_physical_column,
            fieldDefinitionId: b.field_definition_id,
            fieldTypeName: b.field_type_name,
          });
        }
      }
    }
  }
  return specs;
}

/**
 * Resolve borrowed-field values by following each control's FK on the current record
 * to its related row and reading the borrowed column. Batches by (table, fk) so several
 * borrowed columns from the same related record cost a single query. Returns a map
 * keyed by control id. Failures are swallowed per-group (blank field, never a crash).
 */
async function fetchBorrowedFieldValues(
  specs: BorrowedSpec[],
  record: RecordData,
): Promise<Record<string, unknown>> {
  if (specs.length === 0) return {};
  const groups = new Map<string, { table: string; pk: string; fkColumn: string; specs: BorrowedSpec[] }>();
  for (const s of specs) {
    const key = `${s.table}::${s.fkColumn}`;
    if (!groups.has(key)) groups.set(key, { table: s.table, pk: s.pk, fkColumn: s.fkColumn, specs: [] });
    groups.get(key)!.specs.push(s);
  }

  const result: Record<string, unknown> = {};
  await Promise.all(
    [...groups.values()].map(async (g) => {
      const fkVal = record[g.fkColumn];
      if (fkVal == null || fkVal === '') return;
      const cols = [...new Set(g.specs.map((s) => s.fieldPhysicalColumn))];
      const { data } = await supabase
        .from(g.table)
        .select([g.pk, ...cols].join(', '))
        .eq(g.pk, fkVal as string)
        .maybeSingle();
      if (!data) return;
      const row = data as unknown as Record<string, unknown>;
      for (const s of g.specs) {
        result[s.controlId] = row[s.fieldPhysicalColumn] ?? null;
      }
    }),
  );

  // Turn coded values (choice/boolean/lookup) into their display labels so the form
  // shows "Branch"/"Yes"/"Acme Corp" instead of "1"/true/a GUID. Non-coded types
  // (text/number/date/…) are left as their raw value and formatted by FormField.
  const labels = await resolveBorrowedLabels(
    specs.map((s) => ({
      controlId: s.controlId,
      fieldDefinitionId: s.fieldDefinitionId,
      fieldTypeName: s.fieldTypeName,
      rawValue: result[s.controlId],
    })),
  );
  for (const [controlId, label] of Object.entries(labels)) result[controlId] = label;

  return result;
}

interface RuleMessageBannerProps {
  ruleState: FormRuleState;
}

function RuleMessageBanner({ ruleState }: RuleMessageBannerProps) {
  const messages = getRuleMessages(ruleState);
  if (messages.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {messages.map((msg, i) => {
        const isError = msg.level === 'error';
        const isWarn = msg.level === 'warning';
        return (
          <div
            key={i}
            className={`flex items-start gap-2 px-3 py-2.5 rounded-md text-[12px] border ${
              isError
                ? 'bg-red-50 border-red-200 text-red-700'
                : isWarn
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-blue-50 border-blue-200 text-blue-700'
            }`}
          >
            {isError ? <AlertCircle size={13} className="mt-0.5 shrink-0" /> : isWarn ? <AlertTriangle size={13} className="mt-0.5 shrink-0" /> : <Info size={13} className="mt-0.5 shrink-0" />}
            <span>{msg.text}</span>
            {msg.blocksSave && (
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide opacity-70">Blocks Save</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RecommendationsPanel({ ruleState }: { ruleState: FormRuleState }) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const recs = ruleState.recommendations;
  const visible = recs.filter((_, i) => !dismissed.has(i));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {recs.map((rec, i) => {
        if (dismissed.has(i)) return null;
        return (
          <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-md border border-cyan-200 bg-cyan-50">
            <Info size={13} className="mt-0.5 shrink-0 text-cyan-600" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-cyan-800">{rec.title}</p>
              {rec.description && <p className="text-[11px] text-cyan-700 mt-0.5">{rec.description}</p>}
            </div>
            <button
              onClick={() => setDismissed((prev) => new Set([...prev, i]))}
              className="text-cyan-400 hover:text-cyan-600 transition shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

interface StageGateBannerProps {
  stageLabel: string;
  fieldErrors: Record<string, string>;
  values: RecordData;
  onFieldClick: (field: string) => void;
  onDismiss: () => void;
}

function StageGateBanner({ stageLabel, fieldErrors, values, onFieldClick, onDismiss }: StageGateBannerProps) {
  const pendingFields = Object.entries(fieldErrors).filter(([field]) => {
    const v = values[field];
    return v == null || String(v).trim() === '';
  });
  if (pendingFields.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-red-100">
        <div className="flex items-center gap-2">
          <AlertCircle size={14} className="text-red-500 shrink-0 mt-px" />
          <div>
            <p className="text-[12px] font-semibold text-red-800">
              Complete required fields to advance to {stageLabel}
            </p>
            <p className="text-[10px] text-red-600 mt-0.5">
              {pendingFields.length} item{pendingFields.length !== 1 ? 's' : ''} remaining — fields will highlight as you fill them in
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="p-0.5 rounded hover:bg-red-100 text-red-400 hover:text-red-600 transition shrink-0"
        >
          <X size={12} />
        </button>
      </div>
      <div className="px-4 py-2.5 flex flex-wrap gap-1.5">
        {pendingFields.map(([field, label]) => (
          <button
            key={field}
            onClick={() => onFieldClick(field)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white border border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300 transition"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            {label.replace(/ is required.*/, '')}
          </button>
        ))}
      </div>
    </div>
  );
}

function getSectionPrefKey(userId: string, entityName: string, sectionId: string) {
  return `crm_section_collapsed_v2::${userId}::${entityName}::${sectionId}`;
}

function readSectionPref(userId: string, entityName: string, sectionId: string, defaultVal: boolean): boolean {
  try {
    const raw = localStorage.getItem(getSectionPrefKey(userId, entityName, sectionId));
    if (raw === null) return defaultVal;
    return raw === '1';
  } catch {
    return defaultVal;
  }
}

function writeSectionPref(userId: string, entityName: string, sectionId: string, collapsed: boolean) {
  try {
    localStorage.setItem(getSectionPrefKey(userId, entityName, sectionId), collapsed ? '1' : '0');
  } catch {
  }
}

interface CollapsibleSectionProps {
  section: DesignerSection;
  values: RecordData;
  ruleState: FormRuleState;
  onChange: (field: string, val: unknown) => void;
  validationErrors: Record<string, string>;
  recordId: string | null;
  userId: string;
  entityName: string;
  formReadonly: boolean;
  onOpenRecord: (entity: AppEntity, id: string) => void;
  lookupLabels: Record<string, string>;
  onViewAll?: (entitySlug: string, fkColumn: string, parentId: string, contextLabel: string) => void;
  recordTitle: string;
  currencySymbol?: string;
  fieldOptionSetMap: Record<string, string>;
  fieldInlineChoicesMap: Record<string, { value: string; label: string }[]>;
  fieldRequiredMap: Record<string, boolean>;
  subgridRelDefMap?: Map<string, string>;
  onLookupLabelChange?: (fieldLogicalName: string, label: string) => void;
  entityDefinitionId?: string;
  /** Maps field logical_name → entity slug for lookup fields (DB-driven) */
  lookupEntitySlugMap?: Record<string, string>;
  /** Maps field logical_name → physical_column_name (all field types, DB-driven). Used to
   *  fall back to the physical-keyed value when translateToLogical didn't emit a logical key. */
  logicalToPhysicalMap?: Record<string, string>;
  subgridRefreshCounter?: number;
  fieldConfigMap?: Record<string, Record<string, unknown>>;
  /** Maps field logical_name → live field type name from field_definition. Overrides the
   *  control's layout-snapshotted field_type_name so a field's type change (e.g. datetime→date)
   *  takes effect on the form without re-placing it on the layout. */
  fieldTypeMap?: Record<string, string>;
  /** Read-only values borrowed from related entities, keyed by control id. */
  borrowedValues?: Record<string, unknown>;
  /** Accounts-only Dynamics-style presentation (flat white sections). */
  isRedesign?: boolean;
}

function CollapsibleSection({
  section,
  values,
  ruleState,
  onChange,
  validationErrors,
  recordId,
  userId,
  entityName,
  formReadonly,
  onOpenRecord,
  lookupLabels,
  onViewAll,
  recordTitle,
  currencySymbol,
  fieldOptionSetMap,
  fieldInlineChoicesMap,
  fieldRequiredMap,
  subgridRelDefMap,
  onLookupLabelChange,
  entityDefinitionId,
  lookupEntitySlugMap,
  logicalToPhysicalMap,
  subgridRefreshCounter,
  fieldConfigMap,
  fieldTypeMap,
  borrowedValues,
  isRedesign = false,
}: CollapsibleSectionProps) {
  const { getFieldRestriction, getEntityPrivilege } = usePermissions();
  const { density } = useFormDensity();
  const ds = densityStyles[density];
  const [collapsed, setCollapsed] = useState(() =>
    readSectionPref(userId, entityName, section.id, section.is_collapsed)
  );

  const handleToggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      writeSectionPref(userId, entityName, section.id, next);
      return next;
    });
  };

  const visibleControls = section.controls.filter((c) => {
    const rs = ruleState.fields[c.field_logical_name ?? ''];
    const fr = c.field_logical_name ? getFieldRestriction(entityName, c.field_logical_name) : null;
    return c.is_visible !== false && !(rs?.isHidden) && !(fr?.is_hidden);
  });

  if (section.is_visible === false) return null;

  const containerCls = isRedesign
    ? 'bg-white border border-[#e7eaf1] rounded-md shadow-sm'
    : 'border border-slate-200 rounded-lg overflow-hidden mb-3';
  const headerCls = isRedesign
    ? 'w-full flex items-center justify-between px-4 py-2.5 border-b border-[#eef1f6] hover:bg-[#f9fafc] transition-colors text-left'
    : `w-full flex items-center justify-between ${ds.sectionHeader} bg-slate-50 hover:bg-slate-100 transition-colors text-left`;
  const headerTextCls = isRedesign
    ? 'text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider'
    : `${ds.sectionHeaderText} font-semibold text-slate-600`;
  const bodyCls = isRedesign
    ? `px-4 py-3 grid gap-x-4 gap-y-3 ${section.columns === 2 ? 'grid-cols-2' : 'grid-cols-1'}`
    : `${ds.sectionPadding} grid ${ds.sectionGap} ${section.columns === 2 ? 'grid-cols-2' : 'grid-cols-1'}`;

  return (
    <div className={containerCls}>
      <button
        onClick={handleToggle}
        className={headerCls}
      >
        <span className={headerTextCls}>{section.label}</span>
        {collapsed ? (
          <ChevronRightIcon size={13} className="text-slate-400" />
        ) : (
          <ChevronDown size={13} className="text-slate-400" />
        )}
      </button>

      {!collapsed && (
        <div className={bodyCls}>
          {visibleControls.map((control) => {
            const rs = ruleState.fields[control.field_logical_name ?? ''];

            if (control.control_type === 'subgrid' && control.subgrid_config) {
              if (!recordId) return null;
              const configKey = control.subgrid_config.related_entity_name;

              if (configKey === 'opportunity_contacts') {
                return (
                  <div key={control.id} className={`${control.column_span === 2 ? 'col-span-2' : ''}`}>
                    <OpportunityContactsPanel
                      opportunityId={recordId}
                      userId={userId}
                      readonly={formReadonly}
                      onOpenContact={(contactId) => onOpenRecord('contacts' as AppEntity, contactId)}
                    />
                  </div>
                );
              }

              {
                const relDefKey = `${control.subgrid_config.related_entity_name}__${control.subgrid_config.relationship_field}`;
                const resolvedRelDefId = subgridRelDefMap?.get(relDefKey) ?? control.subgrid_config.relationship_definition_id ?? null;
                return (
                  <div key={control.id} className={`${control.column_span === 2 ? 'col-span-2' : ''}`}>
                    <FormSubgrid
                      configKey={configKey}
                      relationshipDefinitionId={resolvedRelDefId}
                      viewId={control.subgrid_config.view_id ?? null}
                      quickCreateFormId={control.subgrid_config.quick_create_form_id ?? null}
                      parentId={recordId ?? ''}
                      parentLabel={recordTitle ?? undefined}
                      userId={userId}
                      rowsToShow={control.subgrid_config.rows_to_show || 8}
                      allowCreate={control.subgrid_config.allow_create && !formReadonly}
                      allowDelete={!formReadonly}
                      getEntityPrivilege={getEntityPrivilege}
                      displayLabel={control.label_override ?? control.field_display_name ?? undefined}
                      onOpenRecord={(slug, id) => {
                        const ent = ENTITY_SLUG_MAP[slug];
                        if (ent) onOpenRecord(ent, id);
                      }}
                      onViewAll={onViewAll ? (slug, fk, pid) => onViewAll(slug, fk, pid, recordTitle) : undefined}
                      refreshTrigger={subgridRefreshCounter}
                    />
                  </div>
                );
              }
            }

            if (control.control_type === 'timeline') {
              if (!recordId) return null;
              return (
                <div key={control.id} className="col-span-2">
                  <TimelinePanel
                    entityName={entityName}
                    recordId={recordId}
                    userId={userId}
                    readonly={formReadonly}
                  />
                </div>
              );
            }

            if (control.control_type === 'documents') {
              if (!recordId) return null;
              return (
                <div key={control.id} className="col-span-2">
                  <DocumentsTab entityType={entityName} recordId={recordId} />
                </div>
              );
            }

            if (control.control_type === 'separator') {
              return (
                <div key={control.id} className="col-span-2 border-t border-slate-100 my-1" />
              );
            }

            if (control.control_type === 'label') {
              return (
                <div key={control.id} className={control.column_span === 2 ? 'col-span-2' : ''}>
                  <p className="text-[12px] font-semibold text-slate-500">
                    {control.label_override ?? control.field_display_name}
                  </p>
                </div>
              );
            }

            // Read-only field borrowed from a related entity: value follows the FK and is
            // resolved into borrowedValues[control.id]. Always read-only; never saved back.
            if (control.control_type === 'field' && control.borrowed_field_config) {
              const raw = borrowedValues?.[control.id];
              const displayVal = raw == null ? '' : raw;
              // Coded types (lookup/choice/boolean/status) are already resolved to a display
              // label in borrowedValues (see resolveBorrowedLabels) — render them as plain
              // read-only text so the label shows instead of the raw code/GUID.
              const rawType = control.borrowed_field_config.field_type_name ?? 'text';
              const displayType = borrowedTypeIsLabelResolved(rawType) ? 'text' : rawType;
              const borrowedControl = { ...control, field_type_name: displayType };
              return (
                <div key={control.id} data-field={control.field_logical_name ?? control.id}>
                  <FormField
                    control={borrowedControl}
                    value={displayVal}
                    onChange={onChange}
                    isReadonly={true}
                    isRequired={false}
                    errorMessage={null}
                    ruleMessage={null}
                    currencySymbol={currencySymbol}
                    formValues={values}
                    entityDefinitionId={entityDefinitionId}
                  />
                </div>
              );
            }

            if (control.control_type === 'field' && control.field_logical_name) {
              const fr = getFieldRestriction(entityName, control.field_logical_name);
              // System-generated fields (account/ticket number, created/modified on) are
              // meaningless before the first save — hide only those on the New form. Owner is
              // NOT in this set: it is a normal, editable lookup driven purely by metadata.
              const isSystemAutoField = SYSTEM_READONLY_FIELDS.has(control.field_logical_name ?? '');
              if (isSystemAutoField && !recordId) return null;
              // The control's field_type_name is snapshotted into the layout when the field is
              // placed. Override it with the live type from field_definition so a later type
              // change (e.g. datetime→date) renders the right input without re-placing the field.
              const liveType = fieldTypeMap?.[control.field_logical_name];
              const typedControl = liveType && liveType !== control.field_type_name
                ? { ...control, field_type_name: liveType }
                : control;
              const lookupSlug = typedControl.field_type_name === 'lookup'
                ? ((lookupEntitySlugMap ?? LOOKUP_FIELD_ENTITY_SLUG)[control.field_logical_name] ?? LOOKUP_FIELD_ENTITY_SLUG[control.field_logical_name] ?? null)
                : null;
              const baseEnriched = lookupSlug
                ? { ...typedControl, lookup_entity_slug: lookupSlug }
                : typedControl;
              const fieldCfg = control.field_logical_name ? (fieldConfigMap?.[control.field_logical_name] ?? null) : null;
              const enrichedControl = fieldCfg ? { ...baseEnriched, config_json: fieldCfg } : baseEnriched;
              // Generic value binding: prefer the logical key, then fall back to the physical
              // column key. translateToLogical exposes both when a field_definition maps them, but
              // the fallback also covers a field whose mapping was momentarily stale (e.g. owner's
              // owner_id). Works for EVERY field — no per-field owner special-case.
              const physCol = logicalToPhysicalMap?.[control.field_logical_name];
              const fieldValue = values[control.field_logical_name]
                ?? (physCol ? values[physCol] : undefined)
                ?? '';
              return (
                <div key={control.id} data-field={control.field_logical_name}>
                  <FormField
                    control={enrichedControl}
                    value={fieldValue}
                    onChange={onChange}
                    isHidden={rs?.isHidden || fr.is_hidden}
                    isReadonly={isSystemAutoField || rs?.isReadonly || control.is_readonly || fr.is_readonly || formReadonly}
                    isPermissionLocked={fr.is_readonly && !fr.is_masked && !rs?.isReadonly && !control.is_readonly && !formReadonly}
                    isMasked={fr.is_masked}
                    isRequired={rs?.isRequired || control.is_required_override || !!fieldRequiredMap[control.field_logical_name ?? '']}
                    errorMessage={validationErrors[control.field_logical_name] ?? null}
                    ruleMessage={rs?.message ?? null}
                    choiceOptions={ENTITY_CHOICE_OPTIONS[control.field_logical_name ?? ''] ?? fieldInlineChoicesMap[control.field_logical_name ?? '']}
                    filteredOptions={rs?.filteredOptions ?? null}
                    optionSetName={fieldOptionSetMap[control.field_logical_name ?? '']}
                    onOpenRecord={lookupSlug ? (slug, id) => {
                      const ent = ENTITY_SLUG_MAP[slug];
                      if (ent) onOpenRecord(ent, id);
                    } : undefined}
                    lookupLabel={lookupLabels[control.field_logical_name] ?? undefined}
                    onLookupLabelChange={onLookupLabelChange}
                    currencySymbol={currencySymbol}
                    lookupConfig={typedControl.field_type_name === 'lookup' ? (control.lookup_config ?? null) : null}
                    formValues={values}
                    entityDefinitionId={entityDefinitionId}
                  />
                </div>
              );
            }

            return null;
          })}
        </div>
      )}
    </div>
  );
}

interface SubgridTabPanel {
  label: string;
  configKey: string;
}

interface RecordFormPageProps {
  module: AppModule;
  entity: AppEntity;
  recordId: string | null;
  userId: string;
  /**
   * Form to load instead of the entity's default. Set by the create flow's form
   * chooser (and by the in-page switcher). When null, the default-form resolution
   * applies. Honoured only outside of an active process flow.
   */
  formIdOverride?: string | null;
  /** Tab to reopen on mount (restored from the URL after a refresh). */
  initialTab?: string;
  /** Fired whenever the active tab changes, so the URL can track it. */
  onTabChange?: (tabId: string) => void;
  onBack: () => void;
  onNavigate?: (entity: AppEntity, id: string) => void;
  onRecordLoaded?: (id: string, label: string) => void;
  onViewAll?: (entitySlug: string, fkColumn: string, parentId: string, contextLabel: string) => void;
  /** Start a new record. Pass a form_id to reuse it (Save & New keeps the loaded form). */
  onNewRecord?: (formId?: string | null) => void;
  creationBlocked?: boolean;
  creationBlockedMessage?: string | null;
  creationControlRules?: import('../../types/digitalRule').DigitalRule[];
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const FORM_TAB_PREFIX = 'form_tab__';
const RELATED_TAB_PREFIX = 'related_tab__';
// Synthetic tab (not stored in layout_json) shown for any entity that has an
// active Document Location configured in Admin Studio.
const DOCUMENTS_TAB_ID = 'documents_tab__record_documents';

const ENTITY_LABEL_FIELD: Record<AppEntity, string> = {
  accounts: 'name',
  contacts: 'lastname',
  leads: 'lastname',
  opportunities: 'topic',
  tickets: 'title',
};

const STATUS_REASON_COLOR_RULES: Record<string, string> = {
  active: 'emerald', qualified: 'emerald', won: 'emerald', resolved: 'emerald', converted: 'emerald',
  new: 'blue', open: 'blue',
  contacted: 'amber', 'in progress': 'amber', pending: 'orange',
  disqualified: 'slate', inactive: 'slate', cancelled: 'slate', closed: 'slate',
  lost: 'red',
};

function inferStatusColor(label: string): string {
  return STATUS_REASON_COLOR_RULES[label.toLowerCase()] ?? 'slate';
}

const STATUS_COLOR_MAP: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
  blue:    'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  amber:   'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  orange:  'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
  red:     'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
  slate:   'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200',
};

interface StatusDropdownProps {
  entityDefinitionId: string | undefined;
  statecodeValue: string;
  value: string;
  onChange: (val: string) => void;
  readonly: boolean;
}

function StatusDropdown({ entityDefinitionId, statecodeValue, value, onChange, readonly }: StatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [options, setOptions] = useState<{ value: string; label: string; color: string }[]>([]);

  useEffect(() => {
    if (!entityDefinitionId) return;
    let cancelled = false;
    supabase
      .from('status_reason_definition')
      .select('reason_value, display_label, color, sort_order, statecode_definition(state_value)')
      .eq('entity_definition_id', entityDefinitionId)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (cancelled) return;
        const filtered = (data ?? []).filter((r) => {
          if (!statecodeValue) return true;
          const sd = r.statecode_definition as { state_value: number } | null;
          return sd ? String(sd.state_value) === statecodeValue : true;
        });
        setOptions(
          filtered.map((r) => ({
            value: String(r.reason_value),
            label: r.display_label,
            color: inferStatusColor(r.display_label),
          })),
        );
      });
    return () => { cancelled = true; };
  }, [entityDefinitionId, statecodeValue]);

  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!current && !value) return null;

  const color = current?.color ?? 'slate';
  const colorCls = STATUS_COLOR_MAP[color] ?? STATUS_COLOR_MAP.slate;

  if (readonly || options.length === 0) {
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${colorCls}`}>
        {current?.label ?? value}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition ${colorCls}`}
      >
        {current?.label ?? value}
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden min-w-[130px]">
          {options.map((opt) => {
            const oc = STATUS_COLOR_MAP[opt.color] ?? STATUS_COLOR_MAP.slate;
            return (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium hover:bg-slate-50 transition ${opt.value === value ? 'bg-slate-50' : ''}`}
              >
                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${oc}`}>
                  {opt.label}
                </span>
                {opt.value === value && <CheckCircle2 size={11} className="ml-auto text-blue-500" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface AssignPopoverProps {
  users: { id: string; email: string }[];
  currentOwnerId?: string;
  onAssign: (userId: string) => void;
  onClose: () => void;
}

function AssignPopover({ users, currentOwnerId, onAssign, onClose }: AssignPopoverProps) {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const filtered = users.filter((u) => !search || u.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} className="absolute top-full right-0 mt-2 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl w-64 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-100">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Assign Owner</p>
        <input
          autoFocus
          type="text"
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      <div className="max-h-52 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-[12px] text-slate-400 text-center">No users found</p>
        ) : filtered.map((u) => (
          <button
            key={u.id}
            onClick={() => { onAssign(u.id); onClose(); }}
            className={`w-full text-left px-3 py-2 text-[12px] hover:bg-slate-50 transition flex items-center gap-2 ${u.id === currentOwnerId ? 'font-semibold text-blue-700' : 'text-slate-700'}`}
          >
            <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center justify-center shrink-0 uppercase">
              {u.email[0]}
            </div>
            <span className="truncate">{u.email}</span>
            {u.id === currentOwnerId && <CheckCircle2 size={11} className="ml-auto text-blue-500 shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function RecordFormPage({
  entity,
  recordId,
  userId,
  formIdOverride = null,
  initialTab,
  onTabChange,
  onBack,
  onNavigate,
  onRecordLoaded,
  onViewAll,
  onNewRecord,
  creationBlocked,
  creationBlockedMessage,
  creationControlRules = [],
}: RecordFormPageProps) {
  const { getEntityPrivilege, getSectionRestriction, getActionRestriction, permissions, isRecordAccessible, ready: permissionsReady } = usePermissions();
  const { showError } = useToast();

  const isNewRecord = !recordId;
  useEffect(() => {
    if (isNewRecord && creationBlocked) {
      showError(creationBlockedMessage ?? 'Manual creation is not allowed for this entity.');
      onBack();
    }
  }, [isNewRecord, creationBlocked]);

  const entityName = ENTITY_LOGICAL_NAME[entity] ?? entity;
  const entityPriv = getEntityPrivilege(entityName);
  const canRead = entityPriv.can_read;
  const canCreate = entityPriv.can_create && !creationBlocked;
  const canCloseWon = !getActionRestriction(entityName, 'close_won').is_denied;
  const canCloseLost = !getActionRestriction(entityName, 'close_lost').is_denied;
  const canQualify = !getActionRestriction(entityName, 'qualify').is_denied;
  const canResolve = !getActionRestriction(entityName, 'resolve').is_denied;

  const getEntityPrivilegeWithCreationControl = useCallback((eName: string) => {
    const base = getEntityPrivilege(eName);
    if (isCreationBlocked(creationControlRules, eName).blocked) {
      return { ...base, can_create: false };
    }
    return base;
  }, [getEntityPrivilege, creationControlRules]);

  const [layout, setLayout] = useState<DesignerLayout | null>(null);
  const [values, setValues] = useState<RecordData>({});
  const [savedValues, setSavedValues] = useState<RecordData>({});
  // Share permissions for the currently open record (null = not a shared record).
  // Must be declared before the canWrite/canDelete/canAssign/canShare derivations.
  const [sharePerms, setSharePerms] = useState<SharePermissions | null>(null);

  // Access-level gating for write/delete/assign.
  // Record-level access checks require knowing the record owner. Until owner_id is
  // available in values (new records, freshly saved records, records still loading),
  // optimistically allow access to avoid a readonly flash. Once owner_id is known,
  // enforce the user's access level scope (user/BU/org).
  //
  // Share permissions are merged with role permissions: a user gains an action if
  // EITHER the role grants it OR the record was explicitly shared with that action.
  // Read-only shares (can_read only) must NOT grant write/delete/assign/share.
  const recordOwnerId = (values.owner_id as string | null) ?? null;
  const ownerResolved = recordOwnerId !== null;
  const roleCanWrite = entityPriv.can_write && (
    permissions.isSystemAdmin || !ownerResolved || isRecordAccessible(entityPriv.write_access_level, recordOwnerId)
  );
  const roleCanDelete = entityPriv.can_delete && (
    permissions.isSystemAdmin || !ownerResolved || isRecordAccessible(entityPriv.delete_access_level, recordOwnerId)
  );
  const roleCanAssign = entityPriv.can_assign && (
    permissions.isSystemAdmin || !ownerResolved || isRecordAccessible(entityPriv.assign_access_level, recordOwnerId)
  );
  const roleCanShare = entityPriv.can_share && (
    permissions.isSystemAdmin || !ownerResolved || isRecordAccessible(entityPriv.share_access_level, recordOwnerId)
  );
  // Merge: role-scoped check OR explicit share permission — each action independent.
  const canWrite  = roleCanWrite  || (sharePerms?.can_write  ?? false);
  const canDelete = roleCanDelete || (sharePerms?.can_delete ?? false);
  const canAssign = roleCanAssign || (sharePerms?.can_assign ?? false);
  const canShare  = roleCanShare  || (sharePerms?.can_share  ?? false);
  const [rules, setRules] = useState<BusinessRule[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [activeTabId, setActiveTabId] = useState<string>('');
  // Whether this entity has the Documents tab enabled (Admin Studio toggle).
  const [documentsEnabled, setDocumentsEnabled] = useState(false);
  // Guards the one-time restore of `initialTab` (from the URL) on first layout load.
  const initialTabRestoredRef = useRef(false);
  const [isPinned, setIsPinned] = useState(false);
  const [crmUsers, setCrmUsers] = useState<{ id: string; email: string }[]>([]);
  const [lookupLabels, setLookupLabels] = useState<Record<string, string>>({});
  // Read-only values borrowed from related entities, keyed by control id. Resolved by
  // following each borrowed control's FK on the current record — see collectBorrowedSpecs.
  const [borrowedValues, setBorrowedValues] = useState<Record<string, unknown>>({});
  const borrowedSpecs = useMemo(() => collectBorrowedSpecs(layout), [layout]);
  // Only re-query when a borrowed control's FK value actually changes (not on every keystroke).
  const borrowedFkSignature = useMemo(
    () => borrowedSpecs.map((s) => `${s.controlId}=${String(values[s.fkColumn] ?? '')}`).join('|'),
    [borrowedSpecs, values],
  );
  useEffect(() => {
    if (borrowedSpecs.length === 0) { setBorrowedValues({}); return; }
    let cancelled = false;
    void fetchBorrowedFieldValues(borrowedSpecs, values).then((v) => { if (!cancelled) setBorrowedValues(v); });
    return () => { cancelled = true; };
    // values is intentionally excluded — borrowedFkSignature captures the FK inputs we depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrowedSpecs, borrowedFkSignature]);
  const [showAssignPopover, setShowAssignPopover] = useState(false);
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([]);
  const [baseCurrency, setBaseCurrency] = useState<CurrencyRecord | null>(null);
  const [fieldOptionSetMap, setFieldOptionSetMap] = useState<Record<string, string>>({});
  const [fieldInlineChoicesMap, setFieldInlineChoicesMap] = useState<Record<string, { value: string; label: string }[]>>({});
  const [fieldTypeMap, setFieldTypeMap] = useState<Record<string, string>>({});
  // Logged-in user's display name, for the `current_user` business-rule value
  // source when it targets a text field (falls back to their email).
  const currentUserDisplayName = useCurrentUserName(userId);
  const [fieldRequiredMap, setFieldRequiredMap] = useState<Record<string, boolean>>({});
  const [fieldConfigMap, setFieldConfigMap] = useState<Record<string, Record<string, unknown>>>({});
  // Maps field logical_name -> entity slug for lookup fields (built from DB on load)
  const [lookupEntitySlugMap, setLookupEntitySlugMap] = useState<Record<string, string>>(LOOKUP_FIELD_ENTITY_SLUG);
  // Maps field logical_name -> physical_column_name for lookup fields (built from DB on load)
  const [lookupPhysicalMap, setLookupPhysicalMap] = useState<Record<string, string>>({});
  // Authoritative logical<->physical map for THIS form, built from the live field_definition
  // load below. Passed into fetchRecord/saveRecord so every field the form rendered loads and
  // saves against its real column even if recordService's shared TTL cache is momentarily stale.
  // This is the metadata-source-of-truth guarantee — no per-field code needed for new fields.
  const [fieldMapping, setFieldMapping] = useState<FieldMapping | null>(null);
  const fieldMappingRef = useRef<FieldMapping | null>(null);
  fieldMappingRef.current = fieldMapping;
  const [showChangeCurrencyModal, setShowChangeCurrencyModal] = useState(false);
  const [processFlow, setProcessFlow] = useState<LoadedProcessFlow | null>(null);
  const [entityDefId, setEntityDefId] = useState<string | null>(null);
  const [availableFlows, setAvailableFlows] = useState<ProcessFlow[]>([]);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  // Main forms this user is allowed to use for the entity — powers the in-page
  // form switcher when editing/viewing an existing record (loaded below).
  const [selectableForms, setSelectableForms] = useState<SelectableForm[]>([]);
  const [savedNewRecordId, setSavedNewRecordId] = useState<string | null>(null);
  // committedInsertIdRef holds the PK from a successful INSERT and is NEVER cleared
  // on re-renders. This prevents a second Save from running as INSERT after a first
  // Save already created the record (race between prop update and ref reset).
  const committedInsertIdRef = useRef<string | null>(null);
  const resolvedRecordId = recordId ?? savedNewRecordId;
  const baseFormReadonly = resolvedRecordId ? !canWrite : !canCreate;
  const [relatedRecordLabel, setRelatedRecordLabel] = useState<string | null>(null);
  const [showQualifyModal, setShowQualifyModal] = useState(false);
  const [showReQualifyModal, setShowReQualifyModal] = useState(false);
  const [showDisqualifyModal, setShowDisqualifyModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteCheckLoading, setDeleteCheckLoading] = useState(false);
  const [deleteRuleMessages, setDeleteRuleMessages] = useState<string[]>([]);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [transformationRules, setTransformationRules] = useState<RecordTransformationRule[]>([]);
  const [activeTransformationRule, setActiveTransformationRule] = useState<RecordTransformationRule | null>(null);
  const [lifecycleRules, setLifecycleRules] = useState<DigitalRule[]>([]);
  const [formAccessRules, setFormAccessRules] = useState<DigitalRule[]>([]);
  const [showCloseOppModal, setShowCloseOppModal] = useState<'won' | 'lost' | null>(null);
  const [showReopenOppModal, setShowReopenOppModal] = useState(false);
  const [showConvertProspectModal, setShowConvertProspectModal] = useState(false);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([]);
  const [duplicateMustBlock, setDuplicateMustBlock] = useState(false);
  const [stageGateErrors, setStageGateErrors] = useState<{
    stageKey: string;
    stageLabel: string;
    fieldErrors: Record<string, string>;
    missingFromForm: MissingFormField[];
  } | null>(null);
  const pendingSaveValuesRef = useRef<RecordData | null>(null);
  const pendingCloseAfterSaveRef = useRef(false);
  const assignBtnRef = useRef<HTMLDivElement>(null);
  const isSavingRef = useRef(false);
  const resolvedRecordIdRef = useRef<string | null>(recordId);
  const pendingNewAfterSaveRef = useRef(false);
  const ruleStateRef = useRef<typeof ruleState | null>(null);
  const lookupLabelsRef = useRef<Record<string, string>>({});
  const layoutRef = useRef<typeof layout>(null);
  const valuesRef = useRef<RecordData>({});
  const rulesRef = useRef<BusinessRule[]>([]);
  const activeFormIdRef = useRef<string | null>(null);
  const processFlowRef = useRef<LoadedProcessFlow | null>(null);
  const ruleRuntimeRef = useRef<RuleRuntime>({});
  const skipNextLoadAllRef = useRef(false);
  const suppressNextLoadingRef = useRef(false);
  // Monotonic load generation — discards results from a stale loadAll when the
  // user switches records/entities before an in-flight load resolves.
  const loadGenRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    // When recordId prop becomes a real ID (e.g., after a new record was saved and
    // the parent updated the URL), keep committedInsertIdRef so doSave continues to
    // call UPDATE. Only clear it when navigating to a genuinely new blank form.
    if (recordId) {
      resolvedRecordIdRef.current = recordId;
      // If we just transitioned from new→record (committedInsertIdRef already holds
      // this same pk), keep savedNewRecordId in sync but don't wipe sharePerms or
      // other state — the form is already showing the saved record.
      if (committedInsertIdRef.current === recordId) {
        // Already handled inside doSave; nothing to reset here.
      } else {
        // Navigating to a different existing record — clear insert ref and share perms.
        committedInsertIdRef.current = null;
        setSharePerms(null);
      }
      setSavedNewRecordId(null);
    } else {
      // Navigating to a new/blank form — full reset.
      committedInsertIdRef.current = null;
      setSavedNewRecordId(null);
      resolvedRecordIdRef.current = null;
      setSharePerms(null);
      setValues({});
      setSavedValues({});
      setValidationErrors({});
      setSaveStatus('idle');
      setTimeline([]);
      setLookupLabels({});
      setIsPinned(false);
      setProcessFlow(null);
      setDuplicateMatches([]);
      setStageGateErrors(null);
      isSavingRef.current = false;
      hasLoadedOnceRef.current = false;
      pendingSaveValuesRef.current = null;
      pendingNewAfterSaveRef.current = false;
      pendingCloseAfterSaveRef.current = false;
    }
  }, [recordId]);

  const relatedSubgrids: SubgridTabPanel[] = ENTITY_SUBGRID_TABS[entity] ?? [];
  const [subgridRelDefMap, setSubgridRelDefMap] = useState<Map<string, string>>(new Map());
  const [subgridRefreshCounter, setSubgridRefreshCounter] = useState(0);
  const [leadHasRelatedOpp, setLeadHasRelatedOpp] = useState(false);

  const checkLeadHasRelatedOpp = useCallback(async (leadId?: string) => {
    const id = leadId ?? resolvedRecordIdRef.current;
    if (entity !== 'leads' || !id) { setLeadHasRelatedOpp(false); return; }
    const { count } = await supabase
      .from('opportunity')
      .select('opportunity_id', { count: 'exact', head: true })
      .eq('originating_lead_id', id)
      .eq('is_deleted', false);
    setLeadHasRelatedOpp((count ?? 0) > 0);
  }, [entity]);

  const activeCurrency = useMemo(() => {
    const currencyId = values.currency_id as string | null | undefined;
    return getCurrencyById(currencies, currencyId) ?? baseCurrency ?? undefined;
  }, [values.currency_id, currencies, baseCurrency]);

  const stateCodeVal = String(values.state_code ?? values.statecode ?? '');
  const statusReasonVal = String(values.status_reason ?? values.statusreason ?? '');
  // Kept for banner display — NOT used for readonly logic anymore (replaced by Digital Rules below)
  const isQualifiedLead = entity === 'leads' && stateCodeVal === '2';
  const isDisqualifiedLead = entity === 'leads' && stateCodeVal === '3';

  // Digital Rule evaluation: on_form_load rules control form access.
  // Falls back to hardcoded lead closed states while rules are still loading (prevents editable flash).
  const formAccessResult = useMemo((): { level: FormAccessLevel; message: string | null } | null => {
    if (formAccessRules.length > 0) {
      return evaluateFormAccess(formAccessRules, values as Record<string, unknown>);
    }
    // Fallback until rules load: replicate the previous hardcoded behavior
    if (isQualifiedLead || isDisqualifiedLead) {
      return { level: 'read_only', message: null };
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formAccessRules, stateCodeVal]);

  const formAccessApplied = formAccessResult !== null &&
    (formAccessResult.level === 'read_only' || formAccessResult.level === 'not_allow');
  const formReadonly = baseFormReadonly || formAccessApplied;
  const isCurrencyLocked =
    hasCurrencyLock(entity) &&
    (!!values.currency_locked || isStatusLocked(entity, stateCodeVal));
  const currencyLockReason = (values.currency_lock_reason as string | null | undefined) ??
    (isStatusLocked(entity, stateCodeVal) ? 'status_threshold' : null);
  const isSystemAdmin = permissions.isSystemAdmin;

  const processContext = useMemo((): ProcessRuleContext | undefined => {
    if (!processFlow) return undefined;
    const stageKey = String(values[processFlow.flow.stage_field] ?? '');
    const currentStage = stageKey
      ? (processFlow.stageByKey.get(stageKey) ?? null)
      : values['active_process_stage_id']
        ? (processFlow.stageById.get(String(values['active_process_stage_id'])) ?? null)
        : null;
    return {
      processFlowId:    processFlow.flow.process_flow_id,
      processFlowName:  processFlow.flow.name,
      currentStageId:   currentStage?.process_stage_id ?? null,
      currentStageName: currentStage?.name ?? null,
      stageCategory:    currentStage?.stage_category ?? null,
    };
  }, [processFlow, values]);

  // Runtime values the engine resolves at evaluation time (current user, field
  // types) — used by the `current_user` value source.
  const ruleRuntime: RuleRuntime = useMemo(
    () => ({ currentUserId: userId, currentUserName: currentUserDisplayName, fieldTypes: fieldTypeMap }),
    [userId, currentUserDisplayName, fieldTypeMap]
  );

  const ruleState: FormRuleState = useMemo(
    () => mergeStageVisibilityIntoRuleState(entity, values, evaluateRules(rules, values, activeFormId, processContext, lookupLabels, ruleRuntime), processFlow),
    [entity, rules, values, processFlow, activeFormId, processContext, lookupLabels, ruleRuntime]
  );

  ruleRuntimeRef.current = ruleRuntime;
  ruleStateRef.current = ruleState;
  lookupLabelsRef.current = lookupLabels;
  layoutRef.current = layout;
  valuesRef.current = values;
  rulesRef.current = rules;
  activeFormIdRef.current = activeFormId;
  processFlowRef.current = processFlow;

  useEffect(() => {
    if (!loading) {
      setValues((prev) => {
        const currentRules = rulesRef.current;
        const currentActiveFormId = activeFormIdRef.current;
        const currentProcessFlow = processFlowRef.current;

        const buildCtx = (vals: RecordData): ProcessRuleContext | undefined => {
          if (!currentProcessFlow) return undefined;
          const sk = String(vals[currentProcessFlow.flow.stage_field] ?? '');
          const st = sk
            ? (currentProcessFlow.stageByKey.get(sk) ?? null)
            : vals['active_process_stage_id']
              ? (currentProcessFlow.stageById.get(String(vals['active_process_stage_id'])) ?? null)
              : null;
          return {
            processFlowId:    currentProcessFlow.flow.process_flow_id,
            processFlowName:  currentProcessFlow.flow.name,
            currentStageId:   st?.process_stage_id ?? null,
            currentStageName: st?.name ?? null,
            stageCategory:    st?.stage_category ?? null,
          };
        };

        const currentLookupLabels = lookupLabelsRef.current;
        const freshRuleState = mergeStageVisibilityIntoRuleState(
          entity, prev, evaluateRules(currentRules, prev, currentActiveFormId, buildCtx(prev), currentLookupLabels, ruleRuntimeRef.current), currentProcessFlow,
        );
        const protectedStageFields = currentProcessFlow ? [currentProcessFlow.flow.stage_field] : undefined;
        const patch1 = applyRuleStateToValues(freshRuleState, prev, protectedStageFields);
        if (!patch1) return prev;

        const cascadeState = mergeStageVisibilityIntoRuleState(
          entity, patch1, evaluateRules(currentRules, patch1, currentActiveFormId, buildCtx(patch1), currentLookupLabels, ruleRuntimeRef.current), currentProcessFlow,
        );
        const patch2 = applyRuleStateToValues(cascadeState, patch1, protectedStageFields);
        return patch2 ?? patch1;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleState]);

  const isDirty = useMemo(() => {
    if (!resolvedRecordId) return false;
    return JSON.stringify(values) !== JSON.stringify(savedValues);
  }, [values, savedValues, resolvedRecordId]);

  // ── Process-flow access enforcement ──────────────────────────────────────────
  // A flow (and any form it loads) is applied only when the user's role(s) allow
  // it. Deny → treat as no flow. Declared before loadAll so it can gate there too;
  // depends on the stable `permissions` object.
  const gateFlow = useCallback((pf: LoadedProcessFlow | null): LoadedProcessFlow | null => {
    if (!pf) return null;
    return isFlowAllowed(permissions, pf.flow.process_flow_id) ? pf : null;
  }, [permissions]);

  const filterAllowedFlows = useCallback((flows: ProcessFlow[]): ProcessFlow[] =>
    flows.filter((f) => f.is_active && !f.deleted_at && isFlowAllowed(permissions, f.process_flow_id)),
  [permissions]);

  const loadAll = useCallback(async (gen: number) => {
    if (skipNextLoadAllRef.current) {
      skipNextLoadAllRef.current = false;
      return;
    }
    clearFieldMappingCache(entity);
    const suppressLoading = suppressNextLoadingRef.current;
    suppressNextLoadingRef.current = false;
    if (!suppressLoading) setLoading(true);
    try {
      const entityLogical = ENTITY_LOGICAL_NAME[entity] ?? entity;
      const resolvedEntityDefId = await getEntityDefinitionId(entityLogical);
      const [formDef, rulesData, usersData, currencyList, base, fieldDefsRes, entityRelationships] = await Promise.all([
        formIdOverride ? fetchFormById(formIdOverride) : fetchDefaultForm(entity),
        fetchEntityRules(entity),
        fetchCrmUsers(),
        fetchCurrencies(),
        fetchBaseCurrency(),
        resolvedEntityDefId
          ? supabase
              .from('field_definition')
              .select('logical_name, physical_column_name, config_json, is_required, field_type:field_type_id(name), lookup_entity_id, lookup_entity:entity_definition!lookup_entity_id(logical_name, physical_table_name)')
              .eq('entity_definition_id', resolvedEntityDefId)
              .eq('is_active', true)
          : Promise.resolve({ data: [] }),
        resolvedEntityDefId
          ? fetchRelationshipsForEntity(resolvedEntityDefId)
          : Promise.resolve([]),
      ]);
      // Discard if a newer load started while we were awaiting (record switch)
      if (gen !== loadGenRef.current) return;

      setCrmUsers(usersData);
      setCurrencies(currencyList);
      setBaseCurrency(base);
      // Make the entity definition id available immediately — including for brand-new
      // records — so the Status / Status Reason controls can load their option sets and
      // be selectable on the New form (previously this was only set when editing an
      // existing record, so status reason couldn't be chosen until after the first save).
      if (resolvedEntityDefId) setEntityDefId(resolvedEntityDefId);

      // Build (targetEntityLogical_fkColumn) → relationship_definition_id map for subgrid resolution
      const relDefMap = new Map<string, string>();
      for (const rel of (entityRelationships ?? [])) {
        if (rel.relationship_storage_type === 'lookup' && rel.lookup_field_physical_column) {
          const key = `${rel.target_entity_name ?? ''}__${rel.lookup_field_physical_column}`;
          relDefMap.set(key, rel.relationship_definition_id);
        }
      }
      setSubgridRelDefMap(relDefMap);

      const osMap: Record<string, string> = { ...FIELD_OPTION_SET_MAP };
      const inlineMap: Record<string, { value: string; label: string }[]> = {};
      const ftMap: Record<string, string> = {};
      const reqMap: Record<string, boolean> = {};
      const cfgMap: Record<string, Record<string, unknown>> = {};
      // Start with the hardcoded fallbacks, then override with DB-sourced slugs
      const slugMap: Record<string, string> = { ...LOOKUP_FIELD_ENTITY_SLUG };
      const physMap: Record<string, string> = {};
      // Complete logical<->physical map for EVERY field on this entity (all types), used as the
      // authoritative override for load/save so any field placed on the form binds to its column.
      // Seed logical→physical with the static fallbacks (e.g. ownerid→owner_id) so well-known
      // lookups still SAVE even when they lack an explicit field_definition row; live
      // field_definition rows below override any seed. p2l (physical→logical) is left to the
      // field_definition loop only — the static map is many-logical-to-one-physical, so seeding
      // p2l could pick a wrong canonical name; the value-binding physical fallback covers load.
      const l2p: Record<string, string> = { ...LOOKUP_LOGICAL_TO_PHYSICAL };
      const p2l: Record<string, string> = {};
      type FDRow = { logical_name: string; physical_column_name?: string | null; config_json: Record<string, unknown> | null; is_required?: boolean; field_type?: { name: string } | null; lookup_entity_id?: string | null; lookup_entity?: { logical_name: string; physical_table_name: string } | null };
      for (const fd of ((fieldDefsRes as { data: FDRow[] | null }).data ?? [])) {
        if (!fd.logical_name) continue;
        const cfg = fd.config_json;
        if (cfg && typeof cfg === 'object') cfgMap[fd.logical_name] = cfg;
        if (fd.field_type?.name) ftMap[fd.logical_name] = fd.field_type.name;
        if (fd.is_required) reqMap[fd.logical_name] = true;
        // Authoritative mapping for ALL field types (skip virtual custom_fields-backed fields,
        // matching recordService.getFieldMapping's exclusion).
        if (fd.physical_column_name && !fd.physical_column_name.startsWith('custom_fields')) {
          l2p[fd.logical_name] = fd.physical_column_name;
          if (!p2l[fd.physical_column_name]) p2l[fd.physical_column_name] = fd.logical_name;
        }
        if (fd.field_type?.name === 'lookup') {
          if (fd.lookup_entity?.logical_name) {
            const targetLogical = fd.lookup_entity.logical_name;
            const slug = ENTITY_LOGICAL_TO_SLUG[targetLogical] ?? targetLogical;
            slugMap[fd.logical_name] = slug;
          }
          if (fd.physical_column_name && fd.physical_column_name !== fd.logical_name) {
            physMap[fd.logical_name] = fd.physical_column_name;
          }
        }
        if (!cfg) continue;
        const control = cfg.control as string | undefined;
        if (control === 'product_picker') {
          osMap[fd.logical_name] = PRODUCT_PICKER_SENTINEL;
        } else {
          const osName = cfg.option_set_name as string | undefined;
          if (osName) osMap[fd.logical_name] = osName;
        }
        const inlineChoices = cfg.choices as { value: string; label: string }[] | undefined;
        if (Array.isArray(inlineChoices) && inlineChoices.length > 0) {
          inlineMap[fd.logical_name] = inlineChoices;
        }
      }
      setFieldOptionSetMap(osMap);
      setFieldInlineChoicesMap(inlineMap);
      setFieldTypeMap(ftMap);
      setFieldRequiredMap(reqMap);
      setFieldConfigMap(cfgMap);
      setLookupEntitySlugMap(slugMap);
      setLookupPhysicalMap(physMap);
      const builtMapping: FieldMapping = { logicalToPhysical: l2p, physicalToLogical: p2l };
      setFieldMapping(builtMapping);
      fieldMappingRef.current = builtMapping;

      setRules(rulesData);

      const applyForm = (fd: FormDefinition | null, source: string) => {
        if (!fd?.layout_json) return;
        const normalized = normalizeLayout(fd.layout_json);
        if (!normalized) return;
        setLayout(normalized);
        setActiveFormId(fd.form_id ?? null);
        if (normalized.tabs.length > 0) {
          setActiveTabId(FORM_TAB_PREFIX + normalized.tabs[0].id);
        }
        // Dev-only: flag any field control whose logical name has no field_definition — such a
        // field can neither load nor save (req. #9). Skips system status/stage controls which are
        // backed by definition tables, not field_definition rows.
        if (import.meta.env?.DEV) {
          const SYSTEM_CONTROL_FIELDS = new Set(['statecode', 'statuscode', 'statusreason', 'reason', 'stage', 'stagecode']);
          for (const tab of normalized.tabs) {
            for (const section of tab.sections) {
              for (const c of section.controls) {
                const ln = c.field_logical_name;
                if (c.control_type !== 'field' || !ln) continue;
                if (SYSTEM_CONTROL_FIELDS.has(ln) || ftMap[ln]) continue;
                console.warn(
                  `[RecordFormPage] Form "${source}" for "${entity}" has control "${ln}" with no ` +
                  `field_definition — it will not load or save. Add/publish the field in Admin Studio.`,
                );
              }
            }
          }
        }
      };

      const applyFlowForm = async (pf: LoadedProcessFlow | null) => {
        if (!pf) return;
        const entityFormId = await getEntityFormIdForFlow(pf.flow.process_flow_id, entityLogical);
        const formIdToLoad = entityFormId ?? pf.flow.form_id;
        if (formIdToLoad) {
          const flowForm = await fetchFormById(formIdToLoad);
          applyForm(flowForm, 'process_flow');
        }
      };

      applyForm(formDef, 'default');

      if (!recordId) {
        const pf = gateFlow(await resolveProcessFlowForRecord(entityLogical, null));
        setProcessFlow(pf);
        // The user's explicit form choice (from the chooser) wins over a flow's
        // default form; only fall back to the flow form when no override is set.
        if (!formIdOverride) await applyFlowForm(pf);
        // Resolve the default Status + Status Reason for a brand-new record so both are
        // populated and selectable immediately on the New form — no save or "activate"
        // step required. State value 1 is the first active state for every entity
        // ("Open" for leads / opportunities / prospects, "Active" for the generic
        // entities). Entities without a statecode definition (e.g. reference data) resolve
        // to null and simply get no status default. This supersedes the legacy hardcoded
        // per-entity map so the behavior is consistent across ALL entities.
        let statusDefaults: Record<string, unknown> = {};
        if (resolvedEntityDefId) {
          try {
            const def = await getDefaultStatusForState(resolvedEntityDefId, 1);
            if (def) {
              // Seed BOTH the logical (state_code/status_reason) and physical
              // (statecode/statusreason) aliases so the New form shows the default
              // Status + Status Reason pre-selected regardless of which name the
              // field control reads (FormField keys off statecode/statusreason).
              // Without the physical aliases the reason dropdown rendered empty, so
              // users had to re-pick a reason and save twice. Extra keys are dropped
              // by translateToPhysical, so this is safe across all entities.
              statusDefaults = {
                state_code: String(def.stateValue),
                statecode: String(def.stateValue),
                status_reason: String(def.reasonValue),
                statusreason: String(def.reasonValue),
              };
            }
          } catch { /* non-fatal: fall back to no status default */ }
        }
        if (gen !== loadGenRef.current) return;
        const defaults = { ...(ENTITY_NEW_DEFAULTS[entity] ?? {}), ...statusDefaults };
        setValues((prev) => {
          const base = { ...defaults };
          if (pf && pf.activeStages.length > 0) {
            const stageField = pf.flow.stage_field;
            if (!base[stageField]) {
              base[stageField] = pf.activeStages[0].stage_key;
            }
          }
          if (pf) {
            base['active_process_flow_id'] = pf.flow.process_flow_id;
            const firstStage = pf.activeStages[0];
            if (firstStage) base['active_process_stage_id'] = firstStage.process_stage_id;
          }
          return base;
        });
      }

      if (!recordId && hasCurrencyLock(entity) && base) {
        setValues((prev) => {
          if (prev.currency_id !== undefined) return prev;
          return { ...prev, currency_id: base.currency_id };
        });
      }

      if (recordId) {
        let record: RecordData;
        try {
          record = await fetchRecord(entity, recordId, builtMapping);
        } catch {
          if (userId && recordId) {
            removeRecentItem(userId, entity, recordId).catch(() => {});
            removePinnedRecord(userId, entity, recordId).catch(() => {});
          }
          showError('This record no longer exists and has been removed.');
          onBack();
          return;
        }

        try {
          const [tl, pinned] = await Promise.all([
            fetchTimelineItems(entity, recordId),
            isRecordPinned(userId, entity, recordId),
          ]);
          setTimeline(tl);
          setIsPinned(pinned);
        } catch { /* non-fatal */ }

        try {
          const pf = gateFlow(await resolveProcessFlowForRecord(entityLogical, record));
          setProcessFlow(pf);
          await applyFlowForm(pf);
        } catch { /* non-fatal: BPF resolution failure should not block the form */ }

        try {
          if (resolvedEntityDefId) {
            setEntityDefId(resolvedEntityDefId);
            const flows = await fetchProcessFlowsForEntity(resolvedEntityDefId);
            setAvailableFlows(filterAllowedFlows(flows));
          }
        } catch { /* non-fatal */ }

        // Discard if a newer load started while fetching this record
        if (gen !== loadGenRef.current) return;
        setValues(record);
        setSavedValues(record);
        const labelField = ENTITY_LABEL_FIELD[entity];
        const label = String(record[labelField] ?? '');
        if (label) onRecordLoaded?.(recordId, label);
        // All lookup labels — including owner — resolve generically via the DB-sourced
        // slug map + resolveLookupFetchConfig (ownerid → users → crm_user.email). No
        // per-field owner special-case.
        fetchLookupLabels(record, slugMap, physMap).then((labels) => {
          if (gen !== loadGenRef.current) return;
          setLookupLabels(labels);
        });
        checkLeadHasRelatedOpp(recordId);

        // Load share permissions so read-only shares render the form as read-only
        // and only grant the specific actions the share explicitly allows.
        checkRecordShareAccess(entityLogical, recordId)
          .then((perms) => {
            if (gen !== loadGenRef.current) return;
            const hasAnyShare = perms.can_read || perms.can_write || perms.can_delete || perms.can_assign || perms.can_share;
            setSharePerms(hasAnyShare ? perms : null);
          })
          .catch(() => { /* non-fatal: if RPC fails, fall back to role-only perms */ });
      }
    } finally {
      hasLoadedOnceRef.current = true;
      // Only the most recent load controls the spinner
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [entity, recordId, formIdOverride, gateFlow, filterAllowedFlows]);

  useEffect(() => {
    // Do not run ANY data/metadata load (incl. fetchRecord) before authorization
    // is confirmed. New record requires can_create; existing requires can_read.
    if (!permissionsReady) return;
    const authorized = isNewRecord ? canCreate : canRead;
    if (!authorized) { setLoading(false); return; }
    const gen = ++loadGenRef.current;
    loadAll(gen);
  }, [loadAll, permissionsReady, isNewRecord, canCreate, canRead]);

  // Report the active tab upward so the URL can track it across a refresh.
  useEffect(() => {
    if (activeTabId) onTabChange?.(activeTabId);
  }, [activeTabId, onTabChange]);

  // Load the forms this user may switch between while creating/viewing/editing a
  // record. Only the entity's MAIN forms allowed by the user's role(s) qualify.
  useEffect(() => {
    if (!permissionsReady) { setSelectableForms([]); return; }
    let cancelled = false;
    fetchSelectableMainForms(entity)
      .then((forms) => {
        if (cancelled) return;
        const allowedSet = getAllowedFormIds(permissions, entity); // null = all (system admin)
        setSelectableForms(allowedSet === null ? forms : forms.filter((f) => allowedSet.has(f.form_id)));
      })
      .catch(() => { if (!cancelled) setSelectableForms([]); });
    return () => { cancelled = true; };
  }, [entity, recordId, permissionsReady, permissions]);

  // Switch the visible form layout in place (existing record only). Swaps the
  // layout/active form without reloading record data.
  const handleSwitchForm = useCallback(async (formId: string) => {
    if (!formId || formId === activeFormId) return;
    const fd = await fetchFormById(formId);
    if (!fd?.layout_json) return;
    const normalized = normalizeLayout(fd.layout_json);
    if (!normalized) return;
    setLayout(normalized);
    setActiveFormId(fd.form_id ?? null);
    if (normalized.tabs.length > 0) setActiveTabId(FORM_TAB_PREFIX + normalized.tabs[0].id);
  }, [activeFormId]);

  // Detect whether the Documents tab is enabled for this entity (Admin Studio toggle).
  useEffect(() => {
    let cancelled = false;
    entityDocumentsTabEnabled(entityName)
      .then((on) => { if (!cancelled) setDocumentsEnabled(on); })
      .catch(() => { if (!cancelled) setDocumentsEnabled(false); });
    return () => { cancelled = true; };
  }, [entityName]);

  // Auto-select the first form tab when layout loads but activeTabId doesn't match any tab
  useEffect(() => {
    if (!layout) return;
    const tabs = layout.tabs?.filter((t) => t.is_visible !== false) ?? [];
    if (tabs.length === 0) return;

    // One-time: restore the tab carried in the URL once the layout is available,
    // taking precedence over the default first-tab selection. Honored only when
    // the restored tab is valid for the loaded layout; otherwise falls through.
    if (!initialTabRestoredRef.current) {
      initialTabRestoredRef.current = true;
      if (initialTab) {
        const validFormTab =
          initialTab.startsWith(FORM_TAB_PREFIX) &&
          tabs.some((t) => initialTab === FORM_TAB_PREFIX + t.id);
        const validOtherTab =
          initialTab === HISTORY_TAB_ID || initialTab.startsWith(RELATED_TAB_PREFIX);
        if (validFormTab || validOtherTab) {
          setActiveTabId(initialTab);
          return;
        }
      }
    }

    const isForm = activeTabId.startsWith(FORM_TAB_PREFIX);
    if (isForm) {
      const matchesTab = tabs.some((t) => activeTabId === FORM_TAB_PREFIX + t.id);
      if (matchesTab) return;
    }
    if (activeTabId === HISTORY_TAB_ID) return;
    if (activeTabId === DOCUMENTS_TAB_ID) return;
    if (activeTabId.startsWith(RELATED_TAB_PREFIX)) return;
    setActiveTabId(FORM_TAB_PREFIX + tabs[0].id);
  }, [layout, activeTabId, initialTab]);

  // Re-resolve flow+form when the product field changes (lead/opportunity only).
  // This must fully reinitialize the BPF instance: persist the switch to the DB,
  // reset stage state, and reload the form so Next/Previous Stage work immediately.
  const productId = (values['product_id'] ?? values['productid']) as string | null | undefined;
  useEffect(() => {
    if (!hasLoadedOnceRef.current) return;
    if (entity !== 'leads' && entity !== 'opportunities') return;
    const currentRecordId = resolvedRecordIdRef.current;
    const entityLogical = ENTITY_LOGICAL_NAME[entity] ?? entity;
    // Exclude active_process_flow_id so the resolver uses product-based logic
    // instead of returning the currently-assigned (old) flow.
    const currentRecord = { ...values, product_id: productId ?? null, active_process_flow_id: null };
    resolveProcessFlowForRecord(entityLogical, currentRecord).then(async (pf) => {
      if (!pf) return;
      // Skip auto-switching into a flow the user's role isn't allowed to use.
      if (!isFlowAllowed(permissions, pf.flow.process_flow_id)) return;
      const currentPfId = processFlowRef.current?.flow.process_flow_id;
      if (pf.flow.process_flow_id === currentPfId) return;

      const firstStage = pf.activeStages.find((s) => s.component_type !== 'condition');
      if (!firstStage) return;

      // Invalidate old flow cache to prevent stale data
      if (currentPfId) invalidateFlowCacheById(currentPfId);

      // Persist the BPF switch to the database so stage navigation uses the new instance
      if (currentRecordId) {
        try {
          const table = await getEntityTable(entity);
          const pk = await getEntityPK(entity);
          await switchRecordProcessFlow(table, pk, currentRecordId, pf.flow.process_flow_id, firstStage.process_stage_id);
        } catch {
          // Best-effort: UI will still reflect the new flow; next save will persist
        }
      }

      // Update local state with the new flow and reset stage to the first stage
      setProcessFlow(pf);
      setValues((prev) => ({
        ...prev,
        active_process_flow_id: pf.flow.process_flow_id,
        [pf.flow.stage_field]: firstStage.stage_key,
        active_process_stage_id: firstStage.process_stage_id,
        bpf_is_finished: false,
      }));

      // Load the entity-specific or flow-level form if configured, else reload the entity default
      const entityFormId = await getEntityFormIdForFlow(pf.flow.process_flow_id, entityLogical);
      const formIdToLoad = entityFormId ?? pf.flow.form_id;
      if (formIdToLoad) {
        const flowForm = await fetchFormById(formIdToLoad);
        const normalizedFlow = normalizeLayout(flowForm?.layout_json);
        if (normalizedFlow) {
          setLayout(normalizedFlow);
          setActiveFormId(flowForm!.form_id ?? null);
          if (normalizedFlow.tabs.length > 0) {
            setActiveTabId(FORM_TAB_PREFIX + normalizedFlow.tabs[0].id);
          }
        }
      } else {
        const defaultForm = await fetchDefaultForm(entity);
        const normalizedDefault = normalizeLayout(defaultForm?.layout_json);
        if (normalizedDefault) {
          setLayout(normalizedDefault);
          setActiveFormId(defaultForm!.form_id ?? null);
          if (normalizedDefault.tabs.length > 0) {
            setActiveTabId(FORM_TAB_PREFIX + normalizedDefault.tabs[0].id);
          }
        }
      }

      // Refresh available flows list
      const { data: eDef } = await supabase
        .from('entity_definition')
        .select('entity_definition_id')
        .eq('logical_name', entityLogical)
        .maybeSingle();
      if (eDef) {
        const flows = await fetchProcessFlowsForEntity(eDef.entity_definition_id);
        setAvailableFlows(filterAllowedFlows(flows));
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // Fetch label for related record (lead → opportunity, opportunity → lead)
  useEffect(() => {
    setRelatedRecordLabel(null);
    let cancelled = false;
    const qualifiedOppId = values['qualified_opportunity_id'] as string | null | undefined;
    const originatingLeadId = values['originating_lead_id'] as string | null | undefined;
    if (entity === 'leads' && qualifiedOppId) {
      supabase.from('opportunity').select('topic').eq('opportunity_id', qualifiedOppId).maybeSingle()
        .then(({ data }) => { if (!cancelled && data) setRelatedRecordLabel(data.topic ?? null); });
    } else if (entity === 'opportunities' && originatingLeadId) {
      supabase.from('lead').select('first_name, last_name').eq('lead_id', originatingLeadId).maybeSingle()
        .then(({ data }) => { if (!cancelled && data) setRelatedRecordLabel([data.first_name, data.last_name].filter(Boolean).join(' ') || null); });
    }
    return () => { cancelled = true; };
  }, [entity, values['qualified_opportunity_id'], values['originating_lead_id']]);

  useEffect(() => {
    const sourceEntity = entity === 'leads' ? 'lead' : entity === 'opportunities' ? 'opportunity' : entity === 'contacts' ? 'contact' : entity === 'accounts' ? 'account' : (entity === 'prospect' || entity === 'prospects') ? 'prospect' : null;
    if (!sourceEntity || !recordId) return;
    fetchRulesForEntity(sourceEntity).then(allRules => {
      setTransformationRules(getRulesForManualTrigger(allRules));
    }).catch(() => {});
    fetchLifecycleRules(sourceEntity).then(setLifecycleRules).catch(() => {});
    fetchFormAccessRules(sourceEntity).then(setFormAccessRules).catch(() => {});
  }, [entity, recordId]);

  const handleChange = useCallback((field: string, val: unknown) => {
    setValues((prev) => {
      let next = { ...prev, [field]: val };
      if (field === 'firstname' || field === 'lastname') {
        const fn = String(field === 'firstname' ? val : (prev.firstname ?? ''));
        const ln = String(field === 'lastname'  ? val : (prev.lastname  ?? ''));
        next.full_name = [fn, ln].filter(Boolean).join(' ');
      }
      if (field === 'stage' && 'stagecode' in prev) next.stagecode = val;
      if (field === 'stagecode' && 'stage' in prev) next.stage = val;
      if (field === 'state_code' && 'statecode' in prev) next.statecode = val;
      if (field === 'statecode' && 'state_code' in prev) next.state_code = val;
      if (field === 'status_reason' && 'statusreason' in prev) next.statusreason = val;
      if (field === 'statusreason' && 'status_reason' in prev) next.status_reason = val;
      const buildCtx = (vals: RecordData): ProcessRuleContext | undefined => {
        if (!processFlow) return undefined;
        const sk = String(vals[processFlow.flow.stage_field] ?? '');
        const st = sk
          ? (processFlow.stageByKey.get(sk) ?? null)
          : vals['active_process_stage_id']
            ? (processFlow.stageById.get(String(vals['active_process_stage_id'])) ?? null)
            : null;
        return {
          processFlowId:    processFlow.flow.process_flow_id,
          processFlowName:  processFlow.flow.name,
          currentStageId:   st?.process_stage_id ?? null,
          currentStageName: st?.name ?? null,
          stageCategory:    st?.stage_category ?? null,
        };
      };
      const currentLookupLabels = lookupLabelsRef.current;
      const pass1State = mergeStageVisibilityIntoRuleState(
        entity, next, evaluateRules(rules, next, activeFormId, buildCtx(next), currentLookupLabels, ruleRuntimeRef.current), processFlow,
      );
      const protectedStageFields = processFlow ? [processFlow.flow.stage_field] : undefined;
      const patch1 = applyRuleStateToValues(pass1State, next, protectedStageFields);
      if (patch1) {
        next = patch1;
        const pass2State = mergeStageVisibilityIntoRuleState(
          entity, next, evaluateRules(rules, next, activeFormId, buildCtx(next), currentLookupLabels, ruleRuntimeRef.current), processFlow,
        );
        const patch2 = applyRuleStateToValues(pass2State, next, protectedStageFields);
        if (patch2) next = patch2;
      }
      return next;
    });
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      delete next['__rule_block__'];
      return next;
    });
  }, [entity, rules, activeFormId, processFlow]);

  const handleStageViolation = useCallback((event: StageViolationEvent) => {
    if (!layout) return;
    const missingFields = new Set(event.missingFromForm.map((m) => m.field));
    const fieldErrors: Record<string, string> = {};
    for (const v of event.violations) {
      if (v.reason === 'required' && !missingFields.has(v.field)) {
        fieldErrors[v.field] = `${v.label} is required to advance to ${event.stageLabel}`;
      }
    }
    setStageGateErrors({
      stageKey: event.stageKey,
      stageLabel: event.stageLabel,
      fieldErrors,
      missingFromForm: event.missingFromForm,
    });
    const firstFieldName = Object.keys(fieldErrors)[0];
    if (!firstFieldName) return;
    for (const tab of layout.tabs) {
      for (const section of tab.sections) {
        const found = section.controls.find((c) => c.field_logical_name === firstFieldName);
        if (found) {
          setActiveTabId(FORM_TAB_PREFIX + tab.id);
          return;
        }
      }
    }
  }, [layout]);

  const handleFieldNavigate = useCallback((field: string) => {
    if (!layout) return;
    for (const tab of layout.tabs) {
      for (const section of tab.sections) {
        const found = section.controls.find((c) => c.field_logical_name === field);
        if (found) {
          setActiveTabId(FORM_TAB_PREFIX + tab.id);
          setTimeout(() => {
            const el = document.querySelector(`[data-field="${field}"]`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              const input = el.querySelector('input,textarea,select') as HTMLElement | null;
              input?.focus();
            }
          }, 80);
          return;
        }
      }
    }
  }, [layout]);

  useEffect(() => {
    if (!stageGateErrors) return;
    const allFilled = Object.keys(stageGateErrors.fieldErrors).every((field) => {
      const v = values[field];
      return v != null && String(v).trim() !== '';
    });
    const allMissingFilled = stageGateErrors.missingFromForm.every(({ field }) => {
      const v = values[field];
      return v != null && String(v).trim() !== '';
    });
    if (allFilled && allMissingFilled) {
      setStageGateErrors(null);
    }
  }, [values, stageGateErrors]);

  const refreshFullRecord = useCallback(async (rid?: string) => {
    const currentId = rid ?? resolvedRecordIdRef.current;
    if (!currentId) return;
    const entityLogical = ENTITY_LOGICAL_NAME[entity] ?? entity;
    const [record, tl, rulesData] = await Promise.all([
      fetchRecord(entity, currentId, fieldMappingRef.current),
      fetchTimelineItems(entity, currentId),
      fetchEntityRules(entity),
    ]);
    const pf = gateFlow(await resolveProcessFlowForRecord(entityLogical, record).catch(() => null));
    const labels = await fetchLookupLabels(record, lookupEntitySlugMap, lookupPhysicalMap);
    setValues(record);
    setSavedValues(record);
    setTimeline(tl);
    if (pf) setProcessFlow(pf);
    if (rulesData) setRules(rulesData);
    setLookupLabels(labels);
    setSubgridRefreshCounter((c) => c + 1);
    checkLeadHasRelatedOpp(currentId);
  }, [entity, lookupEntitySlugMap, crmUsers, checkLeadHasRelatedOpp, gateFlow]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStageChangeAsync = useCallback(async (fromStage: string, toStage: string, finished = false, completedStageIds?: string[]) => {
    const currentRecordId = resolvedRecordIdRef.current;
    if (!currentRecordId || formReadonly) return;
    setStageGateErrors(null);
    // Capture the prior finished/completed state so a failed transition can be rolled back to
    // exactly what it was. Never derive the rollback from `finished` — see catch below.
    const prevFinished = Boolean(valuesRef.current['bpf_is_finished']);
    const prevCompleted = valuesRef.current['completed_stage_ids'];
    // completed_stage_ids is only patched when the caller passes a new set (forward advance /
    // finish). Previous / auto-init / terminal pass nothing and must leave it untouched.
    const completedPatch = completedStageIds ? { completed_stage_ids: completedStageIds } : {};
    // Optimistically apply finished flag (and completed set) immediately so the bar updates instantly
    setValues((prev) => ({ ...prev, bpf_is_finished: finished, ...completedPatch }));
    const currentPf = processFlowRef.current;
    const stageField = currentPf?.flow.stage_field;
    try {
      // 1. Persist the STAGE CHANGE FIRST and authoritatively (active_process_stage_id via the
      // RPC, plus the stage_field/completed columns). Doing this before the full-record save means
      // a Previous/Next move can never be lost just because some edited field fails to save — the
      // earlier ordering ran doSave first, so a field-save error skipped the stage write and the
      // bar snapped back to the previously-saved stage.
      if (currentPf) {
        const newStage = currentPf.stageByKey.get(toStage);
        if (newStage) {
          const table = await getEntityTable(entity);
          const pk = await getEntityPK(entity);
          await updateRecordActiveStage(table, pk, currentRecordId, newStage.process_stage_id, finished);
          // The RPC only sets active_process_stage_id; also persist the stage_field key (and the
          // completed set when provided) so refreshFullRecord doesn't revert the bar.
          if (stageField) {
            await updateRowFields(entity, currentRecordId, { [stageField]: toStage, ...completedPatch }, userId);
          } else if (completedStageIds) {
            await updateRowFields(entity, currentRecordId, { ...completedPatch }, userId);
          }
          setValues((prev) => ({ ...prev, active_process_stage_id: newStage.process_stage_id, bpf_is_finished: finished, ...completedPatch, ...(stageField ? { [stageField]: toStage } : {}) }));
        }
      }

      // 2. Save the rest of the form (the user's field edits). The stage is already committed, so
      // even if this throws the move sticks. Drop the stale active_process_stage_id from the
      // payload — the RPC above is the sole authority for it; writing the old value here would
      // race the RPC. Explicitly set the stage_field to toStage (onChange only queues state).
      const { active_process_stage_id: _staleActiveStage, ...restValues } = valuesRef.current;
      const savePayload = {
        ...restValues,
        ...(stageField ? { [stageField]: toStage } : {}),
        bpf_is_finished: finished,
        ...completedPatch,
      };
      await doSave(savePayload);

      if (!finished) {
        const result = await runStageAutomations(entity, fromStage, toStage, valuesRef.current);
        if (Object.keys(result.fieldPatches).length > 0) {
          setValues((prev) => ({ ...prev, ...result.fieldPatches }));
        }
      }
      await refreshFullRecord();
    } catch (err) {
      console.error('handleStageChangeAsync ERROR:', err);
      // Revert optimistic update on error by RESTORING the previous value — not by
      // negating `finished`. Negating it meant a failed non-finish change (finished=false)
      // flipped bpf_is_finished to true and the bar falsely showed "Completed". A failed
      // transition must never auto-complete the BPF; it must leave the state untouched.
      setValues((prev) => ({ ...prev, bpf_is_finished: prevFinished, completed_stage_ids: prevCompleted }));
    }
  }, [entity, formReadonly, refreshFullRecord]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSwitchFlow = useCallback(async (targetFlowId: string) => {
    const currentRecordId = resolvedRecordIdRef.current;
    if (!currentRecordId || formReadonly) return;
    // Block switching into a flow the user's role isn't allowed to use.
    if (!isFlowAllowed(permissions, targetFlowId)) return;
    try {
      const entityLogical = ENTITY_LOGICAL_NAME[entity] ?? entity;
      invalidateFlowCacheById(targetFlowId);
      const newPf = await loadProcessFlowById(targetFlowId);
      if (!newPf) return;
      const firstStage = newPf.activeStages[0];
      if (!firstStage) return;
      const table = await getEntityTable(entity);
      const pk = await getEntityPK(entity);
      await switchRecordProcessFlow(table, pk, currentRecordId, targetFlowId, firstStage.process_stage_id);
      setProcessFlow(newPf);
      setValues((prev) => ({
        ...prev,
        [newPf.flow.stage_field]: firstStage.stage_key,
        active_process_flow_id: targetFlowId,
        active_process_stage_id: firstStage.process_stage_id,
      }));

      // Reload the form mapped to the new BPF
      const entityFormId = await getEntityFormIdForFlow(targetFlowId, entityLogical);
      const formIdToLoad = entityFormId ?? newPf.flow.form_id;
      if (formIdToLoad) {
        const flowForm = await fetchFormById(formIdToLoad);
        const normalized = normalizeLayout(flowForm?.layout_json);
        if (normalized) {
          setLayout(normalized);
          setActiveFormId(flowForm!.form_id ?? null);
          if (normalized.tabs.length > 0) {
            setActiveTabId(FORM_TAB_PREFIX + normalized.tabs[0].id);
          }
        }
      } else {
        const defaultForm = await fetchDefaultForm(entity);
        const normalized = normalizeLayout(defaultForm?.layout_json);
        if (normalized) {
          setLayout(normalized);
          setActiveFormId(defaultForm!.form_id ?? null);
          if (normalized.tabs.length > 0) {
            setActiveTabId(FORM_TAB_PREFIX + normalized.tabs[0].id);
          }
        }
      }

      const { data: eDef } = await supabase
        .from('entity_definition')
        .select('entity_definition_id')
        .eq('logical_name', entityLogical)
        .maybeSingle();
      if (eDef) {
        const flows = await fetchProcessFlowsForEntity(eDef.entity_definition_id);
        setAvailableFlows(filterAllowedFlows(flows));
      }
    } catch {
    }
  }, [entity, formReadonly, permissions, filterAllowedFlows]);

  // Auto-save disabled: users must explicitly click Save.

  const validate = (): boolean => {
    if (!layout) return true;
    const errors: Record<string, string> = {};

    if (ruleState.blockSave) {
      const blockingMsg = getRuleMessages(ruleState).find((m) => m.blocksSave);
      if (blockingMsg) {
        errors['__rule_block__'] = blockingMsg.text;
      }
    }

    for (const tab of layout.tabs) {
      for (const section of tab.sections) {
        for (const control of section.controls) {
          if (control.control_type !== 'field' || !control.field_logical_name) continue;
          const rs = ruleState.fields[control.field_logical_name];
          if (rs?.isHidden) continue;
          const isRequired = rs?.isRequired || control.is_required_override || !!fieldRequiredMap[control.field_logical_name ?? ''];
          if (isRequired) {
            const v = values[control.field_logical_name];
            const isEmpty = v == null
              || (Array.isArray(v) ? (v as unknown[]).length === 0 : String(v).trim() === '');
            if (isEmpty) {
              errors[control.field_logical_name] =
                `${control.label_override ?? control.field_display_name} is required`;
            }
          }
        }
      }
    }

    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstField = Object.keys(errors).find((k) => k !== '__rule_block__');
      if (firstField) {
        for (const tab of layout.tabs) {
          for (const section of tab.sections) {
            const found = section.controls.find((c) => c.field_logical_name === firstField);
            if (found) {
              setActiveTabId(FORM_TAB_PREFIX + tab.id);
              break;
            }
          }
        }
      }
      return false;
    }
    return true;
  };

  const doSave = async (saveValues: RecordData, opts?: { preserveStatusFields?: boolean }) => {
    isSavingRef.current = true;

    // Normalize status fields: keep logical names for translateToPhysical mapping
    if (!opts?.preserveStatusFields) {
      // Merge physical aliases back into logical names (translateToPhysical expects logical)
      if (saveValues.state_code !== undefined && saveValues.statecode === undefined) {
        saveValues.statecode = saveValues.state_code;
      }
      delete saveValues.state_code;
      if (saveValues.status_reason !== undefined && saveValues.statusreason === undefined) {
        saveValues.statusreason = saveValues.status_reason;
      }
      delete saveValues.status_reason;
      if (entity !== 'leads') delete saveValues.is_qualified;
    }

    // Validate statusreason against statecode for all entities.
    // state_value / reason_value are numeric columns, so only proceed when the
    // values parse to finite numbers — otherwise the query would send
    // state_value=eq.NaN and PostgREST rejects it with a 400.
    if (entityDefId && (saveValues.statecode !== undefined || saveValues.statusreason !== undefined)) {
      const scNum = Number(saveValues.statecode);
      const srNum = Number(saveValues.statusreason);
      const hasSc = saveValues.statecode != null && saveValues.statecode !== '' && Number.isFinite(scNum);
      const hasSr = saveValues.statusreason != null && saveValues.statusreason !== '' && Number.isFinite(srNum);
      if (hasSc && hasSr) {
        const { data: scDef } = await supabase
          .from('statecode_definition')
          .select('statecode_id')
          .eq('entity_definition_id', entityDefId)
          .eq('state_value', scNum)
          .maybeSingle();
        if (scDef) {
          const { data: validReason } = await supabase
            .from('status_reason_definition')
            .select('reason_value')
            .eq('entity_definition_id', entityDefId)
            .eq('statecode_id', scDef.statecode_id)
            .eq('reason_value', srNum)
            .eq('is_active', true)
            .maybeSingle();
          if (!validReason) {
            const defaults = await getDefaultStatusForState(entityDefId, scNum);
            if (defaults) {
              saveValues = { ...saveValues, statusreason: String(defaults.reasonValue) };
            }
          }
        }
      } else if (hasSc && !hasSr) {
        const defaults = await getDefaultStatusForState(entityDefId, scNum);
        if (defaults) {
          saveValues = { ...saveValues, statusreason: String(defaults.reasonValue) };
        }
      }
    }

    setSaveStatus('saving');
    const closeAfter = pendingCloseAfterSaveRef.current;
    const newAfter = pendingNewAfterSaveRef.current;
    pendingCloseAfterSaveRef.current = false;
    pendingNewAfterSaveRef.current = false;
    try {
      // Use committedInsertIdRef as the authoritative record ID. This ref is set
      // immediately after a successful INSERT and is never cleared by re-renders,
      // ensuring subsequent Saves always call UPDATE on the same record.
      const effectiveId = committedInsertIdRef.current ?? resolvedRecordIdRef.current;
      const saved = await saveRecord(entity, effectiveId, saveValues, userId, fieldMappingRef.current);
      const pkCol = await getEntityPK(entity);
      const pk = saved[pkCol] as string | undefined;
      const isNew = !effectiveId;
      if (pk && isNew) {
        committedInsertIdRef.current = pk;
        resolvedRecordIdRef.current = pk;
        setSavedNewRecordId(pk);
        const labelField = ENTITY_LABEL_FIELD[entity];
        const label = String(saved[labelField] ?? '');
        if (label) onRecordLoaded?.(pk, label);
        const entityLogical = ENTITY_LOGICAL_NAME[entity] ?? entity;
        const [rawPf, rulesData, tl, pinned] = await Promise.all([
          resolveProcessFlowForRecord(entityLogical, saved),
          fetchEntityRules(entity),
          fetchTimelineItems(entity, pk),
          isRecordPinned(userId, entity, pk),
        ]);
        // Apply the flow (and its linked form) only if the user's role allows it.
        const pf = gateFlow(rawPf);
        setProcessFlow(pf);

        // Persist process flow fields to DB for the new record so the stage bar
        // has a valid currentStageKey on the next load and after navigation.
        if (pf && pk) {
          const firstStage = pf.activeStages[0];
          const flowPatch: Record<string, unknown> = {
            active_process_flow_id: pf.flow.process_flow_id,
          };
          if (firstStage) {
            flowPatch.active_process_stage_id = firstStage.process_stage_id;
            flowPatch[pf.flow.stage_field] = firstStage.stage_key;
          }
          await updateRowFields(entity, pk, flowPatch, userId);
          // Reflect in local state immediately so the bar renders correctly
          setValues((prev) => ({ ...prev, ...flowPatch }));
        }

        // Switch to the entity-specific or flow-level form if configured
        if (pf) {
          const entityFormId = await getEntityFormIdForFlow(pf.flow.process_flow_id, entityLogical);
          const formIdToLoad = entityFormId ?? pf.flow.form_id;
          if (formIdToLoad) {
            const flowForm = await fetchFormById(formIdToLoad);
            const normalizedSwitchForm = normalizeLayout(flowForm?.layout_json);
            if (normalizedSwitchForm) {
              setLayout(normalizedSwitchForm);
              setActiveFormId(flowForm!.form_id ?? null);
              if (normalizedSwitchForm.tabs.length > 0) {
                setActiveTabId(FORM_TAB_PREFIX + normalizedSwitchForm.tabs[0].id);
              }
            }
          }
        }
        const { data: eDef2 } = await supabase
          .from('entity_definition')
          .select('entity_definition_id')
          .eq('logical_name', entityLogical)
          .maybeSingle();
        if (eDef2) {
          setEntityDefId(eDef2.entity_definition_id);
          const flows = await fetchProcessFlowsForEntity(eDef2.entity_definition_id);
          setAvailableFlows(filterAllowedFlows(flows));
        }
        setRules(rulesData);
        setTimeline(tl);
        setIsPinned(pinned);
        hasLoadedOnceRef.current = true;
        setLoading(false);
        skipNextLoadAllRef.current = true;
        suppressNextLoadingRef.current = true;
        onNavigate?.(entity, pk);
      }
      // Create-only: row was created but is not readable back (no can_read).
      // Confirm success and return to the list rather than opening a record the
      // user cannot view.
      if (isNew && !pk) {
        setSaveStatus('saved');
        setTimeout(() => onBack(), 700);
        return;
      }
      setValues((prev) => {
        const merged = { ...prev };
        for (const key of Object.keys(saved)) {
          if (prev[key] === saveValues[key]) {
            merged[key] = saved[key];
          }
        }
        return merged;
      });
      setSavedValues(saved);
      fetchLookupLabels(saved, lookupEntitySlugMap, lookupPhysicalMap).then((labels) => {
        setLookupLabels(labels);
      });
      setSaveStatus('saved');
      if (closeAfter) {
        setTimeout(() => onBack(), 600);
      } else if (newAfter && onNewRecord) {
        // Save & New reuses the currently loaded form (no chooser re-prompt).
        const keepFormId = activeFormIdRef.current;
        setTimeout(() => onNewRecord(keepFormId), 600);
      } else {
        if (!isNew && pk) {
          fetchTimelineItems(entity, pk).then(setTimeline).catch(() => {});
          setSubgridRefreshCounter((c) => c + 1);
        }
        setTimeout(() => setSaveStatus('idle'), 2500);
      }
    } catch (e) {
      // Surface the full PostgREST error so the real cause (code/message/details/hint)
      // is visible in the console, not just the friendly toast.
      const pg = e as { code?: string; message?: string; details?: string; hint?: string };
      console.error('saveRecord failed:', {
        code: pg?.code,
        message: pg?.message,
        details: pg?.details,
        hint: pg?.hint,
        raw: e,
      });
      setSaveStatus('error');
      showError(toFriendlyError(e, 'Unable to save the record. Please try again.'));
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      isSavingRef.current = false;
    }
  };

  const handleSave = async () => {
    if (isSavingRef.current) return;
    if (!validate()) return;

    const isCreate = !resolvedRecordIdRef.current;
    try {
      const dupResult = await checkForDuplicates(entity, values, resolvedRecordIdRef.current, isCreate);
      if (dupResult.hasMatches) {
        pendingSaveValuesRef.current = values;
        setDuplicateMatches(dupResult.matches);
        setDuplicateMustBlock(dupResult.mustBlock);
        return;
      }
    } catch {
    }

    await doSave({ ...values });
  };

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  const formReadonlyRef = useRef(formReadonly);
  formReadonlyRef.current = formReadonly;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!formReadonlyRef.current) handleSaveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const getTabErrorCount = (tab: DesignerTab): number => {
    let count = 0;
    const mergedErrors = { ...validationErrors, ...(stageGateErrors?.fieldErrors ?? {}) };
    for (const section of tab.sections) {
      for (const control of section.controls) {
        if (!control.field_logical_name || control.control_type !== 'field') continue;
        const v = values[control.field_logical_name];
        const isEmpty = v == null || String(v).trim() === '';
        // Count post-validation errors
        if (mergedErrors[control.field_logical_name] && isEmpty) {
          count++;
          continue;
        }
        // Proactively count required-but-empty fields (before save attempt)
        if (isEmpty && Object.keys(mergedErrors).length === 0) {
          const rs = ruleState.fields[control.field_logical_name];
          if (rs?.isHidden) continue;
          const isRequired = rs?.isRequired || control.is_required_override || !!fieldRequiredMap[control.field_logical_name];
          if (isRequired) count++;
        }
      }
    }
    return count;
  };

  const getRecordTitle = (): string => {
    if (!resolvedRecordId) return 'New Record';
    const checks = [
      values.name, values.topic, values.title, values.subject,
    ];
    for (const v of checks) {
      if (v) return String(v);
    }
    const fn = String(values.first_name ?? '');
    const ln = String(values.last_name ?? '');
    if (fn || ln) return [fn, ln].filter(Boolean).join(' ');
    return 'Record';
  };

  const handleOpenRecord = (ent: AppEntity, id: string) => {
    if (onNavigate) onNavigate(ent, id);
  };

  const handleTogglePin = async () => {
    if (!recordId) return;
    const labelField = ENTITY_LABEL_FIELD[entity];
    const label = String(values[labelField] ?? '');
    try {
      if (isPinned) {
        await unpinRecord(userId, entity, recordId);
        setIsPinned(false);
      } else {
        await pinRecord(userId, entity, module, recordId, label);
        setIsPinned(true);
      }
    } catch (e) {
      showError(toFriendlyError(e, 'Unable to update pin. Please try again.'));
    }
  };

  const handleAssign = async (assignUserId: string) => {
    if (!recordId) return;
    try {
      await updateRowFields(entity, recordId, { owner_id: assignUserId }, userId);
      await refreshFullRecord();
    } catch (e) {
      showError(toFriendlyError(e, 'Unable to reassign the record. Please try again.'));
    }
  };

  const handleCurrencyChangeComplete = async (_newCurrencyId: string, _clearedFields: string[]) => {
    setShowChangeCurrencyModal(false);
    await refreshFullRecord();
  };

  const handleSaveAndClose = async () => {
    if (isSavingRef.current) return;
    if (!validate()) return;

    const isCreate = !resolvedRecordIdRef.current;
    try {
      const dupResult = await checkForDuplicates(entity, values, resolvedRecordIdRef.current, isCreate);
      if (dupResult.hasMatches) {
        pendingSaveValuesRef.current = values;
        pendingCloseAfterSaveRef.current = true;
        setDuplicateMatches(dupResult.matches);
        setDuplicateMustBlock(dupResult.mustBlock);
        return;
      }
    } catch {
    }

    pendingCloseAfterSaveRef.current = true;
    await doSave({ ...values });
  };

  const handleSaveAndNew = async () => {
    if (isSavingRef.current) return;
    if (!validate()) return;

    const isCreate = !resolvedRecordIdRef.current;
    try {
      const dupResult = await checkForDuplicates(entity, values, resolvedRecordIdRef.current, isCreate);
      if (dupResult.hasMatches) {
        pendingSaveValuesRef.current = values;
        pendingNewAfterSaveRef.current = true;
        setDuplicateMatches(dupResult.matches);
        setDuplicateMustBlock(dupResult.mustBlock);
        return;
      }
    } catch {
    }

    pendingNewAfterSaveRef.current = true;
    await doSave({ ...values });
  };

  const handleConvertProspect = () => {
    if (!resolvedRecordId) return;
    setShowConvertProspectModal(true);
  };

  const handleConvertProspectSuccess = async (result: ConversionResult) => {
    setShowConvertProspectModal(false);
    if (!resolvedRecordId) return;
    setSaveStatus('saving');
    try {
      await refreshFullRecord();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (e) {
      setSaveStatus('error');
      showError(toFriendlyError(e, 'Prospect converted, but failed to refresh the record.'));
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
    setConversionResult(result);
  };

  const handleQualify = async () => {
    if (!resolvedRecordId) return;

    // 1. Run form validation (required fields visible on form)
    if (!validate()) return;

    const pf = processFlowRef.current;
    if (pf && pf.activeStages.length > 0) {
      const stageField = pf.flow.stage_field;
      const currentStageKey = String(valuesRef.current[stageField] ?? '');
      // Filter to only this entity's stages (e.g. lead-side of a cross-entity flow)
      const pfForEntity = filterLoadedFlowForEntity(pf, entityDefId);
      // Use runtime-resolved path so conditional branches are respected
      const activeStages = resolveRuntimePath(pfForEntity, valuesRef.current);
      const lastActiveStage = activeStages[activeStages.length - 1];

      // 2. BPF final-stage check: must be on last stage OR bpf_is_finished
      const bpfFinished = Boolean(valuesRef.current['bpf_is_finished']);
      if (lastActiveStage && !bpfFinished && currentStageKey !== lastActiveStage.stage_key) {
        showError('Cannot qualify this Lead until the Business Process Flow reaches the final stage.');
        return;
      }

      // 3. BPF required fields check across all active stages
      const stageIds = activeStages.map((s) => s.process_stage_id);
      const { data: bpfFields } = await supabase
        .from('process_stage_fields')
        .select('field_logical_name, display_label, is_required, process_stage_id')
        .in('process_stage_id', stageIds)
        .eq('is_required', true);

      if (bpfFields && bpfFields.length > 0) {
        const missing: string[] = [];
        for (const bf of bpfFields) {
          const val = values[bf.field_logical_name];
          if (val == null || String(val).trim() === '') {
            const label = bf.display_label || bf.field_logical_name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
            missing.push(label);
          }
        }
        if (missing.length > 0) {
          showError(`Cannot qualify: the following BPF fields are required — ${missing.join(', ')}`);
          return;
        }
      }
    }

    // If a prior opportunity exists, show dialog asking to update or create new
    const existingOppId = valuesRef.current['qualified_opportunity_id'] as string | null | undefined;
    if (existingOppId) {
      setShowReQualifyModal(true);
      return;
    }

    setShowQualifyModal(true);
  };

  const handleQualifySuccess = async (result: { accountId: string | null; contactId: string | null; opportunityId: string | null }) => {
    setShowQualifyModal(false);
    setShowReQualifyModal(false);
    if (!resolvedRecordId) return;
    setSaveStatus('saving');
    try {
      await refreshFullRecord();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (e) {
      setSaveStatus('error');
      showError(toFriendlyError(e, 'Lead qualified, but failed to refresh the record.'));
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
    if (result.opportunityId) {
      handleOpenRecord('opportunities', result.opportunityId);
    }
  };

  const handleDisqualifyLead = async (reason: string, statusReasonValue?: string) => {
    if (!resolvedRecordIdRef.current) return;
    const { count } = await supabase
      .from('opportunity')
      .select('opportunity_id', { count: 'exact', head: true })
      .eq('originating_lead_id', resolvedRecordIdRef.current)
      .eq('is_deleted', false);
    if ((count ?? 0) > 0) {
      showError('This Lead cannot be disqualified because it already has related Opportunities.');
      return;
    }
    setSaveStatus('saving');
    try {
      const updated = {
        ...values,
        statecode: '3', statusreason: statusReasonValue ?? '5',
        state_code: undefined, status_reason: undefined,
        disqualify_reason: reason,
        disqualified_at: new Date().toISOString(),
        disqualified_by: userId,
      };
      await saveRecord(entity, resolvedRecordIdRef.current, updated, userId, fieldMappingRef.current);
      await refreshFullRecord();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (e) {
      setSaveStatus('error');
      showError(toFriendlyError(e, 'Unable to disqualify the lead. Please try again.'));
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleReopenLead = async (reason: string, statusReasonValue?: number) => {
    if (!resolvedRecordIdRef.current) return;
    setSaveStatus('saving');
    try {
      let openStatusReason = statusReasonValue != null ? String(statusReasonValue) : '1';
      if (statusReasonValue == null && entityDefId) {
        const defaults = await getDefaultStatusForState(entityDefId, 1);
        if (defaults) openStatusReason = String(defaults.reasonValue);
      }

      const updated = {
        ...values,
        statecode: '1', statusreason: openStatusReason,
        state_code: undefined, status_reason: undefined,
        reopen_reason: reason,
        reopened_at: new Date().toISOString(),
        reopened_by: userId,
        is_qualified: false,
        qualified_opportunity_id: null,
        qualified_contact_id: null,
        qualified_account_id: null,
        disqualify_reason: null,
        disqualified_at: null,
        disqualified_by: null,
      };
      await saveRecord(entity, resolvedRecordIdRef.current, updated, userId, fieldMappingRef.current);
      await refreshFullRecord();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (e) {
      setSaveStatus('error');
      showError(toFriendlyError(e, 'Unable to reopen the lead. Please try again.'));
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleCloseWon = () => {
    const pf = processFlowRef.current;
    if (pf) {
      const bpfRaw = values['bpf_is_finished'];
      const bpfFinished = bpfRaw === true || bpfRaw === 'true' || bpfRaw === 1;
      if (!bpfFinished) {
        showError('Cannot close as Won until the Business Process Flow is finished. Please complete the final stage and click Finish first.');
        return;
      }
    }
    setShowCloseOppModal('won');
  };
  const handleCloseLost = () => { setShowCloseOppModal('lost'); };

  const handleCloseOppConfirm = async (closingFields: Record<string, unknown>) => {
    if (!recordId) return;
    setShowCloseOppModal(null);
    setSaveStatus('saving');
    try {
      const updated = { ...values, ...closingFields, state_code: undefined, status_reason: undefined };
      await saveRecord(entity, recordId, updated, userId, fieldMappingRef.current);
      await refreshFullRecord();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (e) {
      setSaveStatus('error');
      showError(toFriendlyError(e, 'Unable to close the opportunity. Please try again.'));
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleReopenOpp = () => { setShowReopenOppModal(true); };

  const handleReopenOppConfirm = async (fields: Record<string, unknown>) => {
    if (!recordId) return;
    setShowReopenOppModal(false);
    setSaveStatus('saving');
    try {
      const updated = { ...values, ...fields, state_code: undefined, status_reason: undefined };
      await saveRecord(entity, recordId, updated, userId, fieldMappingRef.current);
      await refreshFullRecord();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (e) {
      setSaveStatus('error');
      showError(toFriendlyError(e, 'Unable to reopen the opportunity. Please try again.'));
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleDeleteClick = async () => {
    if (!resolvedRecordId) return;
    setDeleteRuleMessages([]);
    setDeleteCheckLoading(true);
    setShowDeleteModal(true);
    try {
      const check = await checkDeleteRules(entity, [resolvedRecordId]);
      if (check.blocked) {
        setDeleteRuleMessages(check.block_messages ?? ['Delete is blocked by a Digital Rule.']);
      } else if (check.requires_confirmation) {
        setDeleteRuleMessages(check.confirmation_messages);
      }
    } catch { /* fallback to standard confirmation */ }
    finally { setDeleteCheckLoading(false); }
  };

  const handleDeleteConfirm = async () => {
    if (!resolvedRecordId) return;
    setDeleteBusy(true);
    try {
      const result = await executeDelete(entity, [resolvedRecordId], true);
      if (result.success) {
        await removeRecentItem(userId, entity, resolvedRecordId);
        await removePinnedRecord(userId, entity, resolvedRecordId);
        setShowDeleteModal(false);
        onBack();
      } else {
        showError(result.error ?? 'Delete failed. Please try again.');
      }
    } catch (e) {
      showError(toFriendlyError(e, 'Delete failed. Please try again.'));
    } finally {
      setDeleteBusy(false);
    }
  };

  if (loading && !hasLoadedOnceRef.current) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 size={20} className="text-blue-500 animate-spin" />
      </div>
    );
  }

  // Default-deny route guard. New record requires can_create; existing requires
  // can_read. This blocks direct-URL access, not just hidden buttons.
  if (permissionsReady && (isNewRecord ? !canCreate : !canRead)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 gap-4 p-8">
        <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
          <Lock size={24} className="text-red-400" />
        </div>
        <div className="text-center">
          <h2 className="text-[16px] font-semibold text-slate-700 mb-1">Access Denied</h2>
          <p className="text-[13px] text-slate-500 max-w-sm">
            {isNewRecord
              ? 'You do not have permission to create this record. Contact your administrator to request access.'
              : 'You do not have permission to view this record. Contact your administrator to request access.'}
          </p>
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
        >
          <ChevronLeft size={14} />
          Go Back
        </button>
      </div>
    );
  }

  const formTabs = layout?.tabs?.filter((t) => t.is_visible !== false) ?? [];
  let isFormTab = activeTabId.startsWith(FORM_TAB_PREFIX);
  const activeFormTabId = isFormTab ? activeTabId.slice(FORM_TAB_PREFIX.length) : null;
  const isDocumentsTab = activeTabId === DOCUMENTS_TAB_ID;
  const activeRelatedKey = !isFormTab && activeTabId !== HISTORY_TAB_ID && !isDocumentsTab ? activeTabId.slice(RELATED_TAB_PREFIX.length) : null;
  let currentFormTab = formTabs.find((t) => t.id === activeFormTabId);

  // Defensive: if no tab matches (layout changed, stale activeTabId) auto-select the first form tab
  if (!currentFormTab && !activeRelatedKey && activeTabId !== HISTORY_TAB_ID && !isDocumentsTab && formTabs.length > 0) {
    isFormTab = true;
    currentFormTab = formTabs[0];
  }


  const isHistoryTab = activeTabId === HISTORY_TAB_ID;
  // Show the auto Documents tab when configured, unless the form designer already
  // placed a 'documents' control somewhere in the layout (avoid duplication).
  const layoutHasDocumentsControl = !!layout?.tabs?.some((t) =>
    t.sections?.some((s) => s.controls?.some((c) => c.control_type === 'documents'))
  );
  const showDocumentsTab = documentsEnabled && !layoutHasDocumentsControl;

  return (
    <FormDensityProvider>
    <RecordFormInner
      entity={entity}
      recordId={resolvedRecordId}
      recordLoaded={!loading && hasLoadedOnceRef.current}
      isRedesign={true}
      formReadonly={formReadonly}
      canCreate={canCreate}
      canWrite={canWrite}
      canDelete={canDelete}
      canAssign={canAssign}
      canShare={canShare}
      canCloseWon={canCloseWon}
      canCloseLost={canCloseLost}
      canQualify={canQualify}
      canResolve={canResolve}
      values={values}
      saveStatus={saveStatus}
      isDirty={isDirty}
      isPinned={isPinned}
      crmUsers={crmUsers}
      showAssignPopover={showAssignPopover}
      assignBtnRef={assignBtnRef}
      formTabs={formTabs}
      activeTabId={activeTabId}
      selectableForms={selectableForms}
      activeFormId={activeFormId}
      onSwitchForm={handleSwitchForm}
      currentFormTab={currentFormTab}
      isFormTab={isFormTab}
      isHistoryTab={isHistoryTab}
      showDocumentsTab={showDocumentsTab}
      activeRelatedKey={activeRelatedKey}
      relatedSubgrids={relatedSubgrids}
      ruleState={ruleState}
      validationErrors={validationErrors}
      timeline={timeline}
      userId={userId}
      entityName={entityName}
      onBack={onBack}
      onSave={handleSave}
      onSaveAndClose={handleSaveAndClose}
      onSaveAndNew={handleSaveAndNew}
      onQualify={handleQualify}
      onQualifyFromStageBar={handleQualify}
      onDisqualifyLead={handleDisqualifyLead}
      onDisqualifyLeadClick={() => setShowDisqualifyModal(true)}
      onReopenLead={() => setShowReopenModal(true)}
      onCloseWon={handleCloseWon}
      onCloseLost={handleCloseLost}
      onReopenOpportunity={handleReopenOpp}
      onConvertProspect={handleConvertProspect}
      lifecycleRules={lifecycleRules}
      onTogglePin={handleTogglePin}
      onAssign={handleAssign}
      onSetShowAssignPopover={setShowAssignPopover}
      onChangeTab={setActiveTabId}
      onChange={handleChange}
      onStageChangeAsync={handleStageChangeAsync}
      onOpenRecord={handleOpenRecord}
      getRecordTitle={getRecordTitle}
      getTabErrorCount={getTabErrorCount}
      lookupLabels={lookupLabels}
      layout={layout}
      onViewAll={onViewAll}
      currencies={currencies}
      activeCurrency={activeCurrency}
      isCurrencyLocked={isCurrencyLocked}
      currencyLockReason={currencyLockReason}
      isSystemAdmin={isSystemAdmin}
      showChangeCurrencyModal={showChangeCurrencyModal}
      onOpenChangeCurrencyModal={() => setShowChangeCurrencyModal(true)}
      onCloseChangeCurrencyModal={() => setShowChangeCurrencyModal(false)}
      onCurrencyChangeComplete={handleCurrencyChangeComplete}
      fieldOptionSetMap={fieldOptionSetMap}
      fieldInlineChoicesMap={fieldInlineChoicesMap}
      fieldTypeMap={fieldTypeMap}
      fieldRequiredMap={fieldRequiredMap}
      processFlow={processFlow}
      entityDefId={entityDefId}
      availableFlows={availableFlows}
      onSwitchFlow={handleSwitchFlow}
      stageGateErrors={stageGateErrors}
      onStageViolation={handleStageViolation}
      onFieldNavigate={handleFieldNavigate}
      onClearStageGateErrors={() => setStageGateErrors(null)}
      transformationRules={transformationRules}
      onTransform={rule => setActiveTransformationRule(rule)}
      relatedRecordLabel={relatedRecordLabel}
      subgridRelDefMap={subgridRelDefMap}
      onLookupLabelChange={(fieldLogicalName, label) =>
        setLookupLabels((prev) => ({ ...prev, [fieldLogicalName]: label }))
      }
      lookupEntitySlugMap={lookupEntitySlugMap}
      logicalToPhysicalMap={fieldMapping?.logicalToPhysical}
      borrowedValues={borrowedValues}
      onNewRecord={onNewRecord}
      onDelete={handleDeleteClick}
      onRefresh={() => { void refreshFullRecord(); }}
      subgridRefreshCounter={subgridRefreshCounter}
      leadHasRelatedOpp={leadHasRelatedOpp}
      roleCanWrite={roleCanWrite}
      sharePerms={sharePerms}
      formAccessResult={formAccessResult}
      fieldConfigMap={fieldConfigMap}
    />
    {activeTransformationRule && resolvedRecordId && (
      <TransformRecordModal
        rule={activeTransformationRule}
        sourceRecordId={resolvedRecordId}
        sourceEntity={entity === 'leads' ? 'lead' : entity === 'opportunities' ? 'opportunity' : entity === 'contacts' ? 'contact' : 'account'}
        sourceValues={values}
        userId={userId}
        onSuccess={async () => {
          setActiveTransformationRule(null);
          await refreshFullRecord();
        }}
        onCancel={() => setActiveTransformationRule(null)}
      />
    )}
    {showConvertProspectModal && resolvedRecordId && (
      <ConvertProspectModal
        prospectId={resolvedRecordId}
        prospectValues={values}
        userId={userId}
        onSuccess={handleConvertProspectSuccess}
        onCancel={() => setShowConvertProspectModal(false)}
      />
    )}
    {conversionResult && (
      <ConversionSuccessPrompt
        result={conversionResult}
        onOpenLead={(leadId) => {
          setConversionResult(null);
          handleOpenRecord('leads', leadId);
        }}
        onDismiss={() => setConversionResult(null)}
      />
    )}
    {showQualifyModal && resolvedRecordId && (
      <QualifyLeadModal
        leadId={resolvedRecordId}
        leadValues={values}
        userId={userId}
        processFlow={processFlow}
        onSuccess={handleQualifySuccess}
        onCancel={() => { setShowQualifyModal(false); setValues(savedValues); }}
      />
    )}
    {showReQualifyModal && resolvedRecordId && (
      <ReQualifyLeadModal
        leadId={resolvedRecordId}
        leadValues={values}
        userId={userId}
        processFlow={processFlow}
        existingOpportunityId={String(values['qualified_opportunity_id'] ?? '')}
        onSuccess={handleQualifySuccess}
        onCancel={() => setShowReQualifyModal(false)}
      />
    )}
    {showDisqualifyModal && resolvedRecordId && entityDefId && (
      <DisqualifyReasonModal
        entityDefinitionId={entityDefId}
        onConfirm={({ reason, statusReasonValue }) => { setShowDisqualifyModal(false); handleDisqualifyLead(reason, statusReasonValue); }}
        onCancel={() => setShowDisqualifyModal(false)}
      />
    )}
    {showReopenModal && resolvedRecordId && (
      <ReopenLeadModal
        disqualifyReason={values.disqualify_reason as string | null | undefined}
        disqualifiedAt={values.disqualified_at as string | null | undefined}
        entityDefId={entityDefId}
        isQualified={isQualifiedLead}
        onConfirm={({ reason, statusReasonValue }) => { setShowReopenModal(false); handleReopenLead(reason, statusReasonValue); }}
        onCancel={() => setShowReopenModal(false)}
      />
    )}
    {duplicateMatches.length > 0 && (
      <DuplicateWarningModal
        matches={duplicateMatches}
        mustBlock={duplicateMustBlock}
        onSaveAnyway={() => {
          const sv = pendingSaveValuesRef.current;
          setDuplicateMatches([]);
          pendingSaveValuesRef.current = null;
          if (sv) doSave({ ...sv });
        }}
        onCancel={() => {
          setDuplicateMatches([]);
          pendingSaveValuesRef.current = null;
          pendingCloseAfterSaveRef.current = false;
          pendingNewAfterSaveRef.current = false;
        }}
        onOpenRecord={(entityName, recordId) => {
          handleOpenRecord(entityName as import('../types').AppEntity, recordId);
        }}
      />
    )}
    {showDeleteModal && resolvedRecordId && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={() => !deleteBusy && setShowDeleteModal(false)} />
        <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md mx-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-[14px] font-semibold text-slate-800">Confirm Delete</h2>
            <button onClick={() => !deleteBusy && setShowDeleteModal(false)} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
              <X size={15} />
            </button>
          </div>
          <div className="px-5 py-4 space-y-4">
            {deleteCheckLoading ? (
              <div className="flex items-center justify-center py-6 gap-2">
                <Loader2 size={16} className="animate-spin text-slate-400" />
                <span className="text-[12px] text-slate-500">Checking delete rules...</span>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                  <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <p className="text-[12px] text-red-700">
                      You are about to delete this record. This action cannot be undone.
                    </p>
                    {deleteRuleMessages.map((msg, i) => (
                      <p key={i} className="text-[12px] text-red-600 font-medium">{msg}</p>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button onClick={() => setShowDeleteModal(false)} disabled={deleteBusy} className="px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-100 rounded-md transition disabled:opacity-50">Cancel</button>
                  <button
                    onClick={handleDeleteConfirm}
                    disabled={deleteBusy}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition"
                  >
                    {deleteBusy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )}
    {showCloseOppModal && recordId && (
      <CloseOpportunityModal
        mode={showCloseOppModal}
        values={values}
        entityDefId={entityDefId}
        onConfirm={handleCloseOppConfirm}
        onCancel={() => setShowCloseOppModal(null)}
      />
    )}
    {showReopenOppModal && recordId && (
      <ReopenOpportunityModal
        previousState={String(values.state_code ?? values.statecode ?? '') === '2' ? 'won' : 'lost'}
        entityDefId={entityDefId}
        onConfirm={handleReopenOppConfirm}
        onCancel={() => setShowReopenOppModal(false)}
      />
    )}
    </FormDensityProvider>
  );
}

interface RecordFormInnerProps {
  entity: AppEntity;
  recordId: string | null;
  recordLoaded: boolean;
  formReadonly: boolean;
  canCreate: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canAssign: boolean;
  canShare: boolean;
  canCloseWon: boolean;
  canCloseLost: boolean;
  canQualify: boolean;
  canResolve: boolean;
  values: RecordData;
  saveStatus: SaveStatus;
  isDirty: boolean;
  isPinned: boolean;
  crmUsers: { id: string; email: string }[];
  showAssignPopover: boolean;
  assignBtnRef: React.RefObject<HTMLDivElement>;
  formTabs: DesignerTab[];
  activeTabId: string;
  selectableForms: SelectableForm[];
  activeFormId: string | null;
  onSwitchForm: (formId: string) => void;
  currentFormTab: DesignerTab | undefined;
  isFormTab: boolean;
  isHistoryTab: boolean;
  showDocumentsTab: boolean;
  activeRelatedKey: string | null;
  relatedSubgrids: SubgridTabPanel[];
  ruleState: FormRuleState;
  validationErrors: Record<string, string>;
  timeline: TimelineItem[];
  userId: string;
  entityName: string;
  onBack: () => void;
  onSave: () => void;
  onSaveAndClose: () => void;
  onSaveAndNew: () => void;
  onQualify: () => void;
  onQualifyFromStageBar: () => void;
  onDisqualifyLead: (reason: string, statusReasonValue?: string) => void;
  onDisqualifyLeadClick: () => void;
  onReopenLead: () => void;
  onCloseWon: () => void;
  onCloseLost: () => void;
  onReopenOpportunity: () => void;
  onConvertProspect: () => void;
  lifecycleRules: DigitalRule[];
  onTogglePin: () => void;
  onAssign: (userId: string) => void;
  onSetShowAssignPopover: (v: boolean) => void;
  onChangeTab: (id: string) => void;
  onChange: (field: string, val: unknown) => void;
  onStageChangeAsync: (fromStage: string, toStage: string, finished?: boolean, completedStageIds?: string[]) => Promise<void>;
  onOpenRecord: (entity: AppEntity, id: string) => void;
  getRecordTitle: () => string;
  getTabErrorCount: (tab: DesignerTab) => number;
  lookupLabels: Record<string, string>;
  layout: DesignerLayout | null;
  onViewAll?: (entitySlug: string, fkColumn: string, parentId: string, contextLabel: string) => void;
  currencies: CurrencyRecord[];
  activeCurrency: CurrencyRecord | undefined;
  isCurrencyLocked: boolean;
  currencyLockReason: string | null | undefined;
  isSystemAdmin: boolean;
  showChangeCurrencyModal: boolean;
  onOpenChangeCurrencyModal: () => void;
  onCloseChangeCurrencyModal: () => void;
  onCurrencyChangeComplete: (newCurrencyId: string, clearedFields: string[]) => void;
  fieldOptionSetMap: Record<string, string>;
  fieldInlineChoicesMap: Record<string, { value: string; label: string }[]>;
  fieldTypeMap: Record<string, string>;
  fieldRequiredMap: Record<string, boolean>;
  processFlow: LoadedProcessFlow | null;
  entityDefId: string | null;
  availableFlows?: ProcessFlow[];
  onSwitchFlow?: (flowId: string) => void;
  stageGateErrors: {
    stageKey: string;
    stageLabel: string;
    fieldErrors: Record<string, string>;
    missingFromForm: MissingFormField[];
  } | null;
  onStageViolation: (event: StageViolationEvent) => void;
  onFieldNavigate: (field: string) => void;
  onClearStageGateErrors: () => void;
  transformationRules: RecordTransformationRule[];
  onTransform: (rule: RecordTransformationRule) => void;
  relatedRecordLabel: string | null;
  subgridRelDefMap: Map<string, string>;
  onLookupLabelChange: (fieldLogicalName: string, label: string) => void;
  lookupEntitySlugMap: Record<string, string>;
  logicalToPhysicalMap?: Record<string, string>;
  onNewRecord?: (formId?: string | null) => void;
  onDelete?: () => void;
  onRefresh?: () => void;
  subgridRefreshCounter: number;
  leadHasRelatedOpp: boolean;
  roleCanWrite: boolean;
  sharePerms: SharePermissions | null;
  formAccessResult: { level: FormAccessLevel; message: string | null } | null;
  isRedesign?: boolean;
  fieldConfigMap?: Record<string, Record<string, unknown>>;
  borrowedValues?: Record<string, unknown>;
}

function ReadOnlyBanner({ reason }: { reason: 'write' | 'create' | 'share-read' }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const message = reason === 'share-read'
    ? 'This record was shared with you for viewing only. You do not have permission to edit, save, or delete it.'
    : reason === 'write'
    ? 'You have read-only access to this record. Your security role does not include write permission for this entity.'
    : 'You cannot create new records. Your security role does not include create permission for this entity.';

  return (
    <div className="shrink-0 flex items-start gap-3 px-5 py-2.5 bg-amber-50 border-b border-amber-200">
      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
        <div className="w-5 h-5 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center">
          <Lock size={10} className="text-amber-600" />
        </div>
        <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide whitespace-nowrap">Read Only</span>
      </div>
      <p className="text-[12px] text-amber-700 leading-relaxed flex-1">{message}</p>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-amber-400 hover:text-amber-700 hover:bg-amber-100 transition mt-0.5"
        title="Dismiss"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function DisqualifyReasonBanner({
  reason,
  disqualifiedAt,
  onReopen,
}: {
  reason?: string | null;
  disqualifiedAt?: string | null;
  onReopen?: () => void;
}) {
  const formattedDate = disqualifiedAt
    ? new Date(disqualifiedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : null;

  return (
    <div className="shrink-0 flex items-center gap-3 px-5 py-3 bg-slate-100 border-b-2 border-slate-300">
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-6 h-6 rounded-full bg-slate-300 border border-slate-400 flex items-center justify-center">
          <XCircle size={13} className="text-slate-600" />
        </div>
        <span className="text-[12px] font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">Disqualified</span>
      </div>
      <div className="w-px h-4 bg-slate-300 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-slate-600">
          {reason ? (
            <>
              <span className="font-semibold">Reason:</span> {reason}
              {formattedDate && <span className="text-slate-400 ml-2">· {formattedDate}</span>}
            </>
          ) : (
            <>This lead was disqualified{formattedDate ? ` on ${formattedDate}` : ''}. All fields are read-only.</>
          )}
        </p>
      </div>
      {onReopen && (
        <button
          onClick={onReopen}
          className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[12px] font-semibold border border-blue-300 bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm transition"
        >
          <RefreshCw size={12} />
          Reactivate
        </button>
      )}
    </div>
  );
}

function RecordFormInner({
  entity, recordId, recordLoaded, formReadonly, canCreate, canWrite, canDelete, canAssign, canShare, canCloseWon, canCloseLost, canQualify, canResolve,
  values, saveStatus, isDirty,
  isPinned, crmUsers, showAssignPopover, assignBtnRef, formTabs,
  activeTabId, selectableForms, activeFormId, onSwitchForm, currentFormTab, isFormTab, isHistoryTab, showDocumentsTab, activeRelatedKey,
  relatedSubgrids, ruleState, validationErrors, timeline, userId, entityName,
  onBack, onSave, onSaveAndClose, onSaveAndNew, onQualify, onQualifyFromStageBar, onDisqualifyLead, onDisqualifyLeadClick, onReopenLead, onCloseWon, onCloseLost, onReopenOpportunity, onConvertProspect, lifecycleRules,
  onTogglePin, onAssign, onSetShowAssignPopover, onChangeTab,
  onChange, onStageChangeAsync, onOpenRecord, getRecordTitle, getTabErrorCount, lookupLabels, onViewAll,
  layout, currencies, activeCurrency, isCurrencyLocked, currencyLockReason, isSystemAdmin,
  showChangeCurrencyModal, onOpenChangeCurrencyModal, onCloseChangeCurrencyModal, onCurrencyChangeComplete,
  fieldOptionSetMap, fieldInlineChoicesMap, fieldTypeMap, fieldRequiredMap, processFlow, entityDefId, availableFlows = [], onSwitchFlow,
  stageGateErrors, onStageViolation, onFieldNavigate, onClearStageGateErrors,
  transformationRules, onTransform, relatedRecordLabel, subgridRelDefMap, onLookupLabelChange, lookupEntitySlugMap,
  logicalToPhysicalMap,
  onNewRecord, onDelete, onRefresh, subgridRefreshCounter, leadHasRelatedOpp,
  roleCanWrite, sharePerms, formAccessResult, isRedesign = false, fieldConfigMap, borrowedValues,
}: RecordFormInnerProps) {
  const { density } = useFormDensity();
  const { getSectionRestriction, getEntityPrivilege } = usePermissions();
  const innerStateCode = String(values.state_code ?? values.statecode ?? '');
  const isLeadQualified = entity === 'leads' && innerStateCode === '2';
  const isLeadDisqualified = entity === 'leads' && innerStateCode === '3';
  const isLeadActive = entity === 'leads' && innerStateCode === '1';
  const leadHasLinkedOpp = entity === 'leads' && (leadHasRelatedOpp || !!(values['qualified_opportunity_id']));
  // isOppWon/isOppLost retained only for banner display; readonly behavior driven by formAccessResult
  const isOppWon = entity === 'opportunities' && innerStateCode === '2';
  const isOppLost = entity === 'opportunities' && innerStateCode === '3';
  // Prospect conversion state
  const isProspectEntity = entity === 'prospect' || entity === 'prospects';
  const isProspectConvertedRecord = isProspectEntity && checkProspectConverted(values);
  const convertedLeadId = isProspectEntity ? getConvertedLeadId(values) : null;

  // Contact form uses a softer professional-blue accent (icon/buttons/active tab)
  // while leaving the Account redesign's stronger blue untouched.
  const isContact = entity === 'contacts';

  // Display-only singular label for the redesigned (accounts) header, e.g. "Account".
  const redesignNewTitle = (() => {
    const base = NEW_RECORD_ENTITY_LABELS[entity] ?? (entity.endsWith('s') ? entity.slice(0, -1) : entity);
    return base.charAt(0).toUpperCase() + base.slice(1);
  })();

  // Per-entity header icon for the redesigned record header (presentation only).
  // Keyword matching tolerates singular/plural and logical-name variants.
  const redesignEntityIcon = (() => {
    const e = String(entity).toLowerCase();
    // Core CRM entities
    if (e === 'contacts' || e === 'contact') return <User size={15} />;
    if (e === 'leads' || e === 'lead') return <UserPlus size={15} />;
    if (e === 'opportunities' || e === 'opportunity') return <Target size={15} />;
    if (e === 'tickets' || e === 'ticket' || e === 'cases' || e === 'case') return <Ticket size={15} />;
    if (e === 'accounts' || e === 'account') return <Building2 size={15} />;
    // Catalog / reference entities — distinct, professional icons
    if (e.includes('product') && e.includes('famil')) return <Boxes size={15} />;
    if (e.includes('product')) return <Package size={15} />;
    if (e.includes('industr')) return <Factory size={15} />;
    if (e.includes('countr') || e.includes('nation')) return <Globe size={15} />;
    if (e.includes('currenc')) return <Coins size={15} />;
    if (e.includes('campaign')) return <Megaphone size={15} />;
    if (e.includes('source')) return <Radio size={15} />;
    return <Building2 size={15} />;
  })();

  // Currency selector / lock indicator — shared so it stays available in the
  // redesigned header too (not shown for leads/accounts or entities without a currency field).
  const currencyChip = (entity !== 'leads' && entity !== 'accounts' && entity !== 'opportunities' && currencies.length > 0 && values.currency_id !== undefined) ? (
    <div className="shrink-0 flex items-center gap-1">
      {isCurrencyLocked ? (
        <>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold ${
              currencyLockReason === 'status_threshold'
                ? 'bg-orange-50 border border-orange-200 text-orange-700'
                : 'bg-slate-100 border border-slate-200 text-slate-600'
            }`}
            title={
              currencyLockReason === 'status_threshold'
                ? 'Currency locked by status threshold — record has passed a business process milestone'
                : 'Currency is locked — monetary values have been saved'
            }
          >
            <Lock size={10} className={currencyLockReason === 'status_threshold' ? 'text-orange-400' : 'text-slate-400'} />
            {activeCurrency?.code ?? '—'}
            {currencyLockReason === 'status_threshold' && (
              <span className="text-orange-500 text-[9px] font-medium">Status</span>
            )}
          </span>
          {isSystemAdmin && recordId && !formReadonly && (
            <button
              onClick={onOpenChangeCurrencyModal}
              title="Change record currency (admin)"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition"
            >
              <ShieldAlert size={10} />
              Change
            </button>
          )}
        </>
      ) : formReadonly ? (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-600">
          {activeCurrency?.code ?? '—'}
        </span>
      ) : (
        <div className="flex items-center gap-1">
          <FilterSelect
            value={String(values.currency_id ?? '')}
            onChange={(e) => onChange('currency_id', e.target.value)}
            className="text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            title="Select record currency (will lock after first monetary save)"
          >
            {currencies.map((c) => (
              <option key={c.currency_id} value={c.currency_id}>
                {c.code} ({c.symbol})
              </option>
            ))}
          </FilterSelect>
          <span title="Currency will lock once a monetary value is saved" className="text-slate-300 cursor-help">
            <RefreshCw size={10} className="text-slate-400" />
          </span>
        </div>
      )}
    </div>
  ) : null;

  const lifecycleCommands = useMemo(
    () => getVisibleCommands(lifecycleRules, values).filter((cmd) => {
      // Convert-to-Lead is only valid while the Prospect is Active.
      // Hide it once the Prospect is converted or inactive, regardless of how
      // the Digital Rule's visibility conditions happen to be configured.
      if (cmd.rule.trigger_event === 'convert_prospect') {
        return checkProspectActive(values) && !checkProspectConverted(values);
      }
      return true;
    }),
    [lifecycleRules, values]
  );

  // TEMP DIAGNOSTICS — explains why the Convert-to-Lead button is shown/hidden.
  // Remove once the Prospect conversion command-bar behaviour is confirmed in prod.
  useEffect(() => {
    if (entity !== 'prospect' && entity !== 'prospects') return;
    const convertRule = lifecycleRules.find((r) => r.trigger_event === 'convert_prospect');
    // eslint-disable-next-line no-console
    console.debug('Prospect conversion visibility', {
      entity,
      recordId,
      prospectStatus: values.state_code ?? values.statecode,
      prospectStatusReason: values.status_reason,
      convertedLeadId: values.converted_lead_id ?? null,
      isActive: checkProspectActive(values),
      isConverted: checkProspectConverted(values),
      rulesLoaded: lifecycleRules.length,
      matchingRule: convertRule?.digital_rule_id ?? null,
      isVisible: lifecycleCommands.some((c) => c.rule.trigger_event === 'convert_prospect'),
    });
  }, [entity, recordId, values, lifecycleRules, lifecycleCommands]);

  const isAtCloseStage = useMemo(() => {
    if (!processFlow || entity !== 'opportunities') return false;
    const stageKey = String(values[processFlow.flow.stage_field] ?? '');
    const activeStages = processFlow.activeStages;
    const terminalStages = processFlow.terminalStages;
    if (terminalStages.length === 0) return false;
    const lastActive = activeStages[activeStages.length - 1];
    return lastActive?.stage_key === stageKey;
  }, [processFlow, values, entity]);

  const [closeLostOpen, setCloseLostOpen] = useState(false);
  const closeLostRef = useRef<HTMLDivElement>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!closeLostOpen) return;
    const handler = (e: MouseEvent) => {
      if (closeLostRef.current && !closeLostRef.current.contains(e.target as Node)) {
        setCloseLostOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [closeLostOpen]);

  return (
    <div className={`flex-1 flex flex-col overflow-hidden${isRedesign ? '' : ' bg-slate-50'}${isRedesign && isContact ? ' mc-rd-contact' : ''}`} style={isRedesign ? { background: 'var(--app-bg)', fontFamily: "'Plus Jakarta Sans','Inter',system-ui,sans-serif" } : undefined}>
      {isRedesign && (
        <style>{`
          /* Primary Save — restrained professional blue, consistent states */
          .rd-save-btn{border-radius:6px !important;box-shadow:0 1px 2px rgba(15,23,42,.08) !important;}
          .rd-save-btn:hover:not(:disabled){filter:brightness(0.94);}
          .rd-save-btn:active:not(:disabled){filter:brightness(0.88);box-shadow:inset 0 1px 2px rgba(15,23,42,.18) !important;}
          .rd-save-btn:focus-visible{outline:none !important;box-shadow:0 0 0 3px rgba(37,99,235,.35) !important;}
          /* Neutral command buttons — subtle borders, consistent states */
          .mc-cmd-neutral{border-radius:6px !important;}
          .mc-cmd-neutral:hover:not(:disabled){background:#f8fafc !important;border-color:#cbd5e1 !important;}
          .mc-cmd-neutral:active:not(:disabled){background:#f1f5f9 !important;box-shadow:inset 0 1px 2px rgba(15,23,42,.08) !important;}
          .mc-cmd-neutral:focus-visible{outline:none !important;border-color:#93b4f5 !important;box-shadow:0 0 0 3px rgba(37,99,235,.18) !important;}
          /* Compact, clean Dynamics-style fields (scoped to the account form only) */
          .mc-rd-form input:not([type=checkbox]):not([type=radio]):not([type=file]),
          .mc-rd-form select,
          .mc-rd-form textarea{
            border-color:#dbe1ec;
            border-radius:6px;
          }
          .mc-rd-form input:not([type=checkbox]):not([type=radio]):not([type=file]):hover:not(:disabled),
          .mc-rd-form select:hover:not(:disabled),
          .mc-rd-form textarea:hover:not(:disabled){
            border-color:#c2cbdb;
          }
          .mc-rd-form input:focus,
          .mc-rd-form select:focus,
          .mc-rd-form textarea:focus{
            border-color:#3b6fff;
            box-shadow:0 0 0 2px rgba(59,111,255,.15);
          }
          /* Contact form: softer professional-blue accent (higher specificity overrides) */
          .mc-rd-contact .mc-rd-form input:focus,
          .mc-rd-contact .mc-rd-form select:focus,
          .mc-rd-contact .mc-rd-form textarea:focus{
            border-color:#3f5e9e;
            box-shadow:0 0 0 2px rgba(63,94,158,.15);
          }
          .mc-rd-contact .rd-save-btn:focus-visible{box-shadow:0 0 0 3px rgba(63,94,158,.32) !important;}
        `}</style>
      )}
      {/* ── Sticky Header ── */}
      <div className="shrink-0 shadow-sm bg-white border-b border-[#e7eaf1]">
        {!isRedesign && <div style={{ height: 3, background: 'linear-gradient(135deg,#3b6fff,#22d3ee)' }} />}
        {/* Top bar: breadcrumb + title + actions */}
        <div className={`${isRedesign ? 'px-5 py-2.5' : 'px-5 py-2.5'} flex items-center gap-3`}>
          {/* Back */}
          <button
            onClick={onBack}
            className={`flex items-center gap-1 text-[12px] transition shrink-0 group ${isRedesign ? 'text-[#64748b] hover:text-[#2563eb]' : 'text-[#6b7280] hover:text-[#3b6fff]'}`}
          >
            <ChevronLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className={`shrink-0 ${isRedesign ? 'h-7 w-px bg-[#e5e9f0]' : 'h-8 w-px bg-[#e7eaf1]'}`} />

          {/* Record name + entity label + metadata chips */}
          {isRedesign ? (
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 border border-[#dde4f0]"
                style={{ background: '#eef3fb', color: '#3f5e9e' }}
              >
                {redesignEntityIcon}
              </div>
              <div className="min-w-0 leading-tight">
                <p className="text-[10px] font-semibold text-[#94a3b8] tracking-wide uppercase leading-none mb-1">
                  {redesignNewTitle}
                </p>
                <h1 className="text-[16px] font-semibold text-[#1f2937] truncate leading-tight">
                  {recordId ? getRecordTitle() : `New ${redesignNewTitle}`}
                </h1>
              </div>
              {currencyChip}
            </div>
          ) : (
          <div className="flex-1 min-w-0">
            <p className="text-[9px] text-[#3b6fff] font-semibold tracking-widest uppercase leading-none mb-0.5">
              {recordId ? entity.slice(0, -1) : `New ${NEW_RECORD_ENTITY_LABELS[entity] ?? entity.slice(0, -1)}`}
            </p>
            <h1 className="text-[15px] font-bold text-[#111827] truncate leading-tight mb-1.5">
              {getRecordTitle()}
            </h1>
            {/* Metadata chips row — left aligned (currency only; owner+status moved to header right) */}
            <div className="flex items-center gap-2 flex-wrap">
              {currencyChip}
            </div>
          </div>
          )}

          {/* Right-side actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Owner chip — moved to header right */}
            {recordId && crmUsers.length > 0 && (
              <div className="shrink-0">
                {(() => {
                  const ownerId = String(values.owner_id ?? '');
                  const ownerUser = crmUsers.find((u) => u.id === ownerId);
                  const ownerEmail = ownerUser?.email ?? lookupLabels['ownerid'] ?? null;
                  const initials = ownerEmail ? ownerEmail.split('@')[0].slice(0, 2).toUpperCase() : '?';
                  const shortName = ownerEmail ? ownerEmail.split('@')[0] : 'Unassigned';
                  return canAssign && !formReadonly ? (
                    <button
                      onClick={() => onSetShowAssignPopover(!showAssignPopover)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-[#e7eaf1] bg-[#f7f9fc] hover:bg-[#eff6ff] hover:border-[#3b6fff] transition group"
                      title="Click to reassign"
                    >
                      <span
                        className="w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 uppercase text-white"
                        style={{ background: 'linear-gradient(135deg,#3b6fff,#22d3ee)' }}
                      >
                        {initials}
                      </span>
                      <span className="text-[11px] font-medium truncate max-w-[100px] text-[#374151] group-hover:text-[#3b6fff]">{shortName}</span>
                      <UserCheck size={10} className="shrink-0 text-[#9ca3af] group-hover:text-[#3b6fff]" />
                    </button>
                  ) : (
                    <span className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-[#e7eaf1] bg-[#f7f9fc]">
                      <span
                        className="w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 uppercase text-white"
                        style={{ background: 'linear-gradient(135deg,#3b6fff,#22d3ee)' }}
                      >
                        {initials}
                      </span>
                      <span className="text-[11px] truncate max-w-[100px] text-[#374151] font-medium">{shortName}</span>
                    </span>
                  );
                })()}
              </div>
            )}

            {/* View Only badge */}
            {formReadonly && !(entity === 'leads' && (isLeadDisqualified || isLeadQualified)) && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                <Lock size={11} />
                <span>View Only</span>
              </div>
            )}

            {/* Close */}
            <button
              onClick={onBack}
              title="Close"
              className="flex items-center justify-center w-7 h-7 rounded-md transition text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#374151]"
            >
              <X size={15} />
            </button>
          </div>
        </div>

      {/* ── Command Bar ── */}
      {!formReadonly && (
        <div className={`${isRedesign ? 'px-5' : 'px-4'} py-1.5 flex items-center gap-1.5 shrink-0 bg-white border-b border-[#e7eaf1]`}>
          {/* Save */}
          <button
            onClick={onSave}
            disabled={saveStatus === 'saving'}
            className="rd-save-btn flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition border disabled:opacity-60"
            style={
              saveStatus === 'saved'
                ? { background: 'color-mix(in srgb, var(--success) 15%, transparent)', color: 'var(--success)', borderColor: 'color-mix(in srgb, var(--success) 40%, transparent)' }
                : saveStatus === 'error'
                ? { background: 'color-mix(in srgb, var(--danger) 15%, transparent)', color: 'var(--danger)', borderColor: 'color-mix(in srgb, var(--danger) 40%, transparent)' }
                : { background: 'var(--primary)', color: 'var(--primary-text)', borderColor: 'transparent' }}
          >
            {saveStatus === 'saving' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : saveStatus === 'saved' ? (
              <CheckCircle2 size={12} />
            ) : saveStatus === 'error' ? (
              <AlertCircle size={12} />
            ) : (
              <Save size={12} />
            )}
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Error' : 'Save'}
          </button>

          {/* Save & Close */}
          <button
            onClick={onSaveAndClose}
            disabled={saveStatus === 'saving'}
            className="mc-cmd-neutral flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition disabled:opacity-60"
          >
            <SaveAll size={12} />
            Save &amp; Close
          </button>

          {canCreate && onNewRecord && (
            <button
              onClick={onSaveAndNew}
              disabled={saveStatus === 'saving'}
              className="mc-cmd-neutral flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition disabled:opacity-60"
            >
              <RefreshCw size={12} />
              Save &amp; New
            </button>
          )}

          {/* Refresh — reloads the saved record (no-op on an unsaved new record) */}
          {recordId && onRefresh && (
            <button
              onClick={onRefresh}
              disabled={saveStatus === 'saving'}
              title="Refresh"
              className="mc-cmd-neutral flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition disabled:opacity-60"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          )}

          {/* Auto-save indicator */}
          {recordId && (
            <div className="flex items-center gap-1.5 ml-1">
              {saveStatus === 'saving' ? (
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <Loader2 size={10} className="animate-spin" />
                  Auto-saving…
                </span>
              ) : saveStatus === 'saved' ? (
                <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--success)' }}>
                  <CheckCircle2 size={10} />
                  All changes saved
                </span>
              ) : isDirty ? (
                <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--warn-text)' }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--warn-text)' }} />
                  Unsaved changes
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">
                  No changes
                </span>
              )}
            </div>
          )}

          {/* Validation Error Summary */}
          {Object.keys(validationErrors).length > 0 && (
            <div className="flex items-center gap-1.5 ml-2 px-2.5 py-1 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle size={11} className="text-red-500 shrink-0" />
              <span className="text-[11px] text-red-600 font-medium">
                {Object.keys(validationErrors).length} field{Object.keys(validationErrors).length > 1 ? 's' : ''} need attention
              </span>
            </div>
          )}

          {/* Divider */}
          <div className="h-5 w-px bg-slate-200 mx-1" />

          {/* Assign */}
          {recordId && canWrite && canAssign && crmUsers.length > 0 && (
            <div ref={assignBtnRef} className="relative">
              <button
                onClick={() => onSetShowAssignPopover(!showAssignPopover)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition"
              >
                <UserCheck size={12} />
                Assign
              </button>
              {showAssignPopover && (
                <AssignPopover
                  users={crmUsers}
                  currentOwnerId={String(values.owner_id ?? '')}
                  onAssign={onAssign}
                  onClose={() => onSetShowAssignPopover(false)}
                />
              )}
            </div>
          )}

          {/* Share */}
          {recordId && canShare && (
            <>
              <div className="h-5 w-px bg-slate-200 mx-1" />
              <button
                onClick={() => setShareOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition"
              >
                <Share2 size={12} />
                Share
              </button>
            </>
          )}

          {/* Delete */}
          {recordId && canDelete && onDelete && (
            <>
              <div className="h-5 w-px bg-slate-200 mx-1" />
              <button
                onClick={onDelete}
                disabled={saveStatus === 'saving'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border border-red-200 bg-white text-red-600 hover:bg-red-50 hover:border-red-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </>
          )}

          {/* Lifecycle Rule commands — driven by Digital Rules configuration */}
          {recordId && lifecycleCommands.map((cmd) => {
            // Hide "Close as Won" until the Business Process Flow is finished.
            if (cmd.rule.trigger_event === 'close_opportunity_won' && processFlow) {
              const bpfRaw = values['bpf_is_finished'];
              const bpfFinished = bpfRaw === true || bpfRaw === 'true' || bpfRaw === 1;
              if (!bpfFinished) return null;
            }
            const handleClick = () => {
              const t = cmd.rule.trigger_event;
              if (t === 'qualify_lead') { onQualify(); return; }
              if (t === 'reactivate_lead') { onReopenLead(); return; }
              if (t === 'close_opportunity_won') { onCloseWon(); return; }
              if (t === 'close_opportunity_lost') { onCloseLost(); return; }
              if (t === 'reopen_opportunity') { onReopenOpportunity(); return; }
              if (t === 'convert_prospect') { onConvertProspect(); return; }
            };
            const isQualifyDisabled = cmd.rule.trigger_event === 'qualify_lead' && !values['account_id'];
            const iconMap: Record<string, React.ReactNode> = {
              LogIn: <LogIn size={12} />, Trophy: <Trophy size={12} />,
              XCircle: <XCircle size={12} />, RefreshCw: <RefreshCw size={12} />,
              Zap: <Zap size={12} />, UserCheck: <UserCheck size={12} />,
            };
            const toneStyle: Record<string, React.CSSProperties> = {
              emerald: { background: 'color-mix(in srgb, var(--success) 12%, transparent)', color: 'var(--success)', borderColor: 'color-mix(in srgb, var(--success) 45%, transparent)' },
              red:     { background: 'color-mix(in srgb, var(--danger) 12%, transparent)',  color: 'var(--danger)',  borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)' },
              blue:    { background: 'color-mix(in srgb, var(--link) 12%, transparent)',    color: 'var(--link)',    borderColor: 'color-mix(in srgb, var(--link) 45%, transparent)' },
              amber:   { background: 'var(--warn-bg)', color: 'var(--warn-text)', borderColor: 'color-mix(in srgb, var(--warn-text) 45%, transparent)' },
            };
            return (
              <span key={cmd.rule.digital_rule_id} className="contents">
                <div className="h-5 w-px bg-slate-200 mx-1" />
                <div className="relative group">
                  <button
                    onClick={handleClick}
                    disabled={saveStatus === 'saving' || isQualifyDisabled}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border transition disabled:opacity-50 disabled:cursor-not-allowed"
                    style={toneStyle[cmd.style] ?? toneStyle.blue}
                  >
                    {iconMap[cmd.icon] ?? <Zap size={12} />}
                    {cmd.label}
                  </button>
                  {isQualifyDisabled && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 px-3 py-2 bg-slate-800 text-white text-[11px] rounded-lg shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 text-center leading-snug">
                      Link this lead to an Account before qualifying
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                    </div>
                  )}
                </div>
              </span>
            );
          })}

          {/* Lead: Disqualify — stays as a direct action (not part of lifecycle rules) */}
          {entity === 'leads' && recordId && canWrite && isLeadActive && !leadHasLinkedOpp && (
            <>
              <div className="h-5 w-px bg-slate-200 mx-1" />
              <button
                onClick={onDisqualifyLeadClick}
                disabled={saveStatus === 'saving'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)', borderColor: 'color-mix(in srgb, var(--danger) 45%, transparent)' }}
              >
                <XCircle size={12} />
                Disqualify
              </button>
            </>
          )}

          {/* Transformation Rules: action buttons for manual trigger rules */}
          {recordId && transformationRules.length > 0 && transformationRules.map(rule => (
            <span key={rule.record_transformation_rule_id} className="contents">
              <div className="h-5 w-px bg-slate-200 mx-1" />
              <button
                onClick={() => onTransform(rule)}
                disabled={saveStatus === 'saving'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'color-mix(in srgb, var(--link) 12%, transparent)', color: 'var(--link)', borderColor: 'color-mix(in srgb, var(--link) 45%, transparent)' }}
              >
                <Zap size={12} />
                {rule.button_label || rule.name}
              </button>
            </span>
          ))}
        </div>
      )}

      </div>

      {recordId && processFlow && (
        <ProcessStageBar
          processFlow={processFlow}
          entityDefId={entityDefId}
          values={values}
          recordLoaded={recordLoaded}
          onChange={onChange}
          onStageChangeAsync={onStageChangeAsync}
          onQualifyLead={entity === 'leads' && canQualify && !!values['account_id'] && isLeadActive ? onQualifyFromStageBar : undefined}
          onDisqualifyLead={entity === 'leads' && canWrite && isLeadActive && !leadHasLinkedOpp ? onDisqualifyLead : undefined}
          isReadonly={formReadonly}
          layout={layout}
          ruleState={ruleState}
          stageEnteredAt={values.modified_at as string | null | undefined}
          availableFlows={availableFlows}
          allowFlowSwitch={!formReadonly && !!onSwitchFlow}
          onSwitchFlow={onSwitchFlow}
          onStageViolation={onStageViolation}
          onFieldNavigate={onFieldNavigate}
          fieldTypeMap={fieldTypeMap}
          lookupLabels={lookupLabels}
        />
      )}

      {/* Permission / share read-only banner — shown only when formReadonly is NOT from a Digital Rule */}
      {formReadonly && recordId && !formAccessResult && (
        <ReadOnlyBanner reason={
          sharePerms?.can_read && !sharePerms.can_write && !roleCanWrite
            ? 'share-read'
            : !canWrite
            ? 'write'
            : 'create'
        } />
      )}

      {/* Lead Disqualified banner — driven by Digital Rule (replaces hardcoded check) */}
      {entity === 'leads' && isLeadDisqualified && recordId && formAccessResult && formAccessResult.level !== 'allow_edit' && (
        <DisqualifyReasonBanner
          reason={values.disqualify_reason as string | null | undefined}
          disqualifiedAt={values.disqualified_at as string | null | undefined}
          onReopen={canWrite ? onReopenLead : undefined}
        />
      )}

      {/* Lead Qualified banner — driven by Digital Rule */}
      {entity === 'leads' && isLeadQualified && recordId && formAccessResult && formAccessResult.level !== 'allow_edit' && (
        <div className="shrink-0 flex items-center gap-3 px-5 py-2.5 bg-emerald-50 border-b border-emerald-100">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-5 h-5 rounded-full bg-emerald-200 border border-emerald-300 flex items-center justify-center">
              <Check size={11} className="text-emerald-700" />
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide whitespace-nowrap">Qualified</span>
          </div>
          <p className="text-[12px] text-emerald-700 flex-1 min-w-0 truncate">
            {formAccessResult.message ?? 'This lead has been qualified and is now read-only. Reactivate to edit and qualify again.'}
          </p>
          {canWrite && formAccessResult.level !== 'not_allow' && (
            <button
              onClick={onReopenLead}
              disabled={saveStatus === 'saving'}
              className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12px] font-semibold border border-blue-300 bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} />
              Reactivate
            </button>
          )}
        </div>
      )}

      {/* Opportunity Won/Lost banner — driven by Digital Rule */}
      {entity === 'opportunities' && (isOppWon || isOppLost) && recordId && formAccessResult && formAccessResult.level !== 'allow_edit' && (
        <div className="shrink-0 flex items-center gap-3 px-5 py-2.5 border-b" style={{ background: `color-mix(in srgb, var(${isOppWon ? '--success' : '--danger'}) 12%, transparent)`, borderColor: `color-mix(in srgb, var(${isOppWon ? '--success' : '--danger'}) 30%, transparent)` }}>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-5 h-5 rounded-full flex items-center justify-center border" style={{ background: `color-mix(in srgb, var(${isOppWon ? '--success' : '--danger'}) 22%, transparent)`, borderColor: `color-mix(in srgb, var(${isOppWon ? '--success' : '--danger'}) 40%, transparent)` }}>
              {isOppWon ? <Trophy size={11} style={{ color: 'var(--success)' }} /> : <XCircle size={11} style={{ color: 'var(--danger)' }} />}
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: `var(${isOppWon ? '--success' : '--danger'})` }}>
              {isOppWon ? 'Won' : 'Lost'}
            </span>
          </div>
          <p className="text-[12px] flex-1 min-w-0 truncate" style={{ color: `var(${isOppWon ? '--success' : '--danger'})` }}>
            {formAccessResult.message ?? `This opportunity is closed (${isOppWon ? 'Won' : 'Lost'}) and is read-only. Reopen to edit.`}
          </p>
          {canWrite && formAccessResult.level !== 'not_allow' && (
            <button
              onClick={onReopenOpportunity}
              disabled={saveStatus === 'saving'}
              className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12px] font-semibold border border-blue-300 bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} />
              Reopen
            </button>
          )}
        </div>
      )}

      {/* Prospect Converted banner */}
      {isProspectConvertedRecord && recordId && formAccessResult && formAccessResult.level !== 'allow_edit' && (
        <div className="shrink-0 flex items-center gap-3 px-5 py-2.5 bg-emerald-50 border-b border-emerald-100">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-5 h-5 rounded-full bg-emerald-200 border border-emerald-300 flex items-center justify-center">
              <LogIn size={10} className="text-emerald-700" />
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide whitespace-nowrap">Converted</span>
          </div>
          <p className="text-[12px] text-emerald-700 flex-1 min-w-0 truncate">
            {formAccessResult.message ?? 'This Prospect has been converted to a Lead and is now read-only.'}
          </p>
          {convertedLeadId && (
            <button
              onClick={() => onOpenRecord('leads', convertedLeadId)}
              className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12px] font-semibold border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 shadow-sm transition"
            >
              <Link2 size={12} />
              Open Lead
            </button>
          )}
        </div>
      )}

      {/* not_allow blocked banner — shown regardless of entity when a Digital Rule sets not_allow */}
      {formAccessResult?.level === 'not_allow' && recordId && !(entity === 'leads' && (isLeadQualified || isLeadDisqualified)) && !(entity === 'opportunities' && (isOppWon || isOppLost)) && !(isProspectConvertedRecord) && (
        <div className="shrink-0 flex items-center gap-3 px-5 py-2.5 bg-amber-50 border-b border-amber-200">
          <ShieldAlert size={15} className="text-amber-600 shrink-0" />
          <p className="text-[12px] text-amber-800 flex-1 min-w-0">
            {formAccessResult.message ?? 'Editing is not allowed for this record.'}
          </p>
        </div>
      )}

      {/* Prospect → converted Lead navigation */}
      {isProspectEntity && convertedLeadId && (
        <button
          onClick={() => onOpenRecord('leads', convertedLeadId)}
          className="flex items-center gap-2 px-5 py-2 bg-emerald-50 border-b border-emerald-100 text-emerald-700 hover:bg-emerald-100 transition w-full text-left group"
        >
          <Link2 size={12} className="shrink-0 text-emerald-500" />
          <span className="text-[11px] font-medium">Converted Lead</span>
          <ArrowRight size={12} className="ml-auto shrink-0 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}

      {/* Related record navigation: lead → qualified opportunity, opportunity → originating lead */}
      {entity === 'leads' && values['qualified_opportunity_id'] && (
        <button
          onClick={() => onOpenRecord('opportunities', String(values['qualified_opportunity_id']))}
          className="flex items-center gap-2 px-5 py-2 bg-emerald-50 border-b border-emerald-100 text-emerald-700 hover:bg-emerald-100 transition w-full text-left group"
        >
          <Link2 size={12} className="shrink-0 text-emerald-500" />
          <span className="text-[11px] font-medium">Qualified Opportunity</span>
          {relatedRecordLabel && (
            <span className="text-[11px] text-emerald-600 font-semibold truncate">{relatedRecordLabel}</span>
          )}
          <ArrowRight size={12} className="ml-auto shrink-0 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}

      {entity === 'opportunities' && values['originating_lead_id'] && (
        <button
          onClick={() => onOpenRecord('leads', String(values['originating_lead_id']))}
          className="flex items-center gap-2 px-5 py-2 bg-sky-50 border-b border-sky-100 text-sky-700 hover:bg-sky-100 transition w-full text-left group"
        >
          <ArrowLeft size={12} className="shrink-0 text-sky-400 group-hover:-translate-x-0.5 transition-transform" />
          <Link2 size={12} className="shrink-0 text-sky-500" />
          <span className="text-[11px] font-medium">Originating Lead</span>
          {relatedRecordLabel && (
            <span className="text-[11px] text-sky-600 font-semibold truncate">{relatedRecordLabel}</span>
          )}
        </button>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className={`flex gap-0 shrink-0 overflow-x-auto ${isRedesign ? 'px-5 bg-white border-b border-[#e7eaf1]' : 'px-6 bg-white border-b border-slate-200'}`}>
            {formTabs
              .filter((tab) => {
                if (recordId) return true;
                const allControls = tab.sections.flatMap((s) => s.controls);
                const onlySubgrids = allControls.length > 0 && allControls.every((c) => c.control_type === 'subgrid');
                return !onlySubgrids;
              })
              .map((tab) => {
              const tabId = FORM_TAB_PREFIX + tab.id;
              const isActive = activeTabId === tabId;
              const hasPostValidationErrors = Object.keys({ ...validationErrors, ...(stageGateErrors?.fieldErrors ?? {}) }).length > 0;
              const errCount = (!isActive || hasPostValidationErrors) ? getTabErrorCount(tab) : 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => onChangeTab(tabId)}
                  className={`relative flex items-center gap-1.5 ${isRedesign ? 'px-3 py-2 text-[12px]' : 'px-4 py-2.5 text-[13px]'} font-medium border-b-2 whitespace-nowrap transition-colors shrink-0 ${
                    isActive
                      ? isRedesign
                        ? 'border-[#2563eb] text-[#2563eb]'
                        : 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {tab.label}
                  {errCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">
                      {errCount}
                    </span>
                  )}
                </button>
              );
            })}

            {recordId && (
              <>
                <div className="w-px bg-slate-100 my-2 mx-1 shrink-0" />
                <button
                  onClick={() => onChangeTab(HISTORY_TAB_ID)}
                  className={`relative flex items-center gap-1.5 ${isRedesign ? 'px-3 py-2 text-[12px]' : 'px-4 py-2.5 text-[13px]'} font-medium border-b-2 whitespace-nowrap transition-colors shrink-0 ${
                    isHistoryTab
                      ? isRedesign
                        ? 'border-[#2563eb] text-[#2563eb]'
                        : 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  Field History
                </button>
                {showDocumentsTab && (
                  <button
                    onClick={() => onChangeTab(DOCUMENTS_TAB_ID)}
                    className={`relative flex items-center gap-1.5 ${isRedesign ? 'px-3 py-2 text-[12px]' : 'px-4 py-2.5 text-[13px]'} font-medium border-b-2 whitespace-nowrap transition-colors shrink-0 ${
                      activeTabId === DOCUMENTS_TAB_ID
                        ? isRedesign
                          ? 'border-[#2563eb] text-[#2563eb]'
                          : 'border-blue-500 text-blue-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    Documents
                  </button>
                )}
                {relatedSubgrids.map((sg) => {
                  const tabId = RELATED_TAB_PREFIX + sg.configKey;
                  const isActive = activeTabId === tabId;
                  return (
                    <button
                      key={sg.configKey}
                      onClick={() => onChangeTab(tabId)}
                      className={`relative flex items-center gap-1.5 ${isRedesign ? 'px-3 py-2 text-[12px]' : 'px-4 py-2.5 text-[13px]'} font-medium border-b-2 whitespace-nowrap transition-colors shrink-0 ${
                        isActive
                          ? isRedesign
                            ? 'border-[#2563eb] text-[#2563eb]'
                            : 'border-blue-500 text-blue-600'
                          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {sg.label}
                    </button>
                  );
                })}
              </>
            )}
          </div>

          <div className={`flex-1 overflow-y-auto ${isRedesign ? 'px-5 py-4' : 'p-6'}`}>
            {isFormTab && currentFormTab && stageGateErrors && (
              <StageGateBanner
                stageLabel={stageGateErrors.stageLabel}
                fieldErrors={stageGateErrors.fieldErrors}
                values={values}
                onFieldClick={onFieldNavigate}
                onDismiss={onClearStageGateErrors}
              />
            )}
            {isFormTab && currentFormTab && (
              <div className={isRedesign ? 'mc-rd-form w-full space-y-3' : 'contents'}>
                <RuleMessageBanner ruleState={ruleState} />
                <RecommendationsPanel ruleState={ruleState} />
                {currentFormTab.sections
                  .filter((section) => !getSectionRestriction(entityName, section.id).is_hidden)
                  .map((section) => (
                    <CollapsibleSection
                      key={section.id}
                      section={section}
                      values={values}
                      ruleState={ruleState}
                      onChange={onChange}
                      validationErrors={{ ...validationErrors, ...(stageGateErrors?.fieldErrors ?? {}) }}
                      recordId={recordId}
                      userId={userId}
                      entityName={entityName}
                      formReadonly={formReadonly}
                      onOpenRecord={onOpenRecord}
                      lookupLabels={lookupLabels}
                      onViewAll={onViewAll}
                      recordTitle={getRecordTitle()}
                      currencySymbol={activeCurrency?.symbol}
                      fieldOptionSetMap={fieldOptionSetMap}
                      fieldInlineChoicesMap={fieldInlineChoicesMap}
                      fieldRequiredMap={fieldRequiredMap}
                      subgridRelDefMap={subgridRelDefMap}
                      onLookupLabelChange={onLookupLabelChange}
                      entityDefinitionId={entityDefId ?? undefined}
                      lookupEntitySlugMap={lookupEntitySlugMap}
                      logicalToPhysicalMap={logicalToPhysicalMap}
                      subgridRefreshCounter={subgridRefreshCounter}
                      fieldConfigMap={fieldConfigMap}
                      fieldTypeMap={fieldTypeMap}
                      borrowedValues={borrowedValues}
                      isRedesign={isRedesign}
                    />
                  ))}
              </div>
            )}

            {isHistoryTab && recordId && (
              <div className="p-4 max-w-3xl mx-auto w-full">
                <FieldHistoryPanel entity={entity} recordId={recordId} />
              </div>
            )}

            {activeTabId === DOCUMENTS_TAB_ID && recordId && (
              <div className="w-full">
                <DocumentsTab entityType={entityName} recordId={recordId} />
              </div>
            )}

            {!isFormTab && !isHistoryTab && activeRelatedKey && recordId && (
              <FormSubgrid
                configKey={activeRelatedKey}
                parentId={recordId}
                userId={userId}
                rowsToShow={25}
                allowCreate={!formReadonly}
                allowDelete={!formReadonly}
                getEntityPrivilege={getEntityPrivilegeWithCreationControl}
                onOpenRecord={(slug, id) => {
                  const ent = ENTITY_SLUG_MAP[slug];
                  if (ent) onOpenRecord(ent, id);
                }}
                onViewAll={onViewAll ? (slug, fk, pid) => onViewAll(slug, fk, pid, getRecordTitle()) : undefined}
                refreshTrigger={subgridRefreshCounter}
              />
            )}

            {!currentFormTab && isFormTab && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <p className="text-[13px]">No form layout configured.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showChangeCurrencyModal && recordId && (
        <ChangeCurrencyModal
          entity={entity}
          recordId={recordId}
          userId={userId}
          currencies={currencies}
          currentCurrency={activeCurrency}
          currentValues={values}
          lockReason={currencyLockReason}
          onClose={onCloseChangeCurrencyModal}
          onComplete={onCurrencyChangeComplete}
        />
      )}
      {shareOpen && recordId && (
        <ShareRecordModal
          entity={entity}
          recordId={recordId}
          recordLabel={getRecordTitle()}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}
