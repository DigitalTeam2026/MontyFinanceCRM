import { useState, useEffect } from 'react';
import { X, Building2, User, Briefcase, AlertTriangle, CheckCircle2, Loader2, ChevronRight, Info, ShieldAlert, Link2Off, RefreshCw, PlusCircle, Ban } from 'lucide-react';
import type { LeadQualificationRule } from '../../../types/leadQualification';
import type { RecordData } from '../../services/recordService';
import type { QualifyLeadPreview, EntityDuplicateWarning, ExistingOpportunity } from '../../services/leadQualificationEngine';
import {
  buildQualifyPreview,
  executeQualifyLead,
  shouldPromptUser,
  getDefaultSelections,
  isCreationForced,
  isCreationDisabled,
} from '../../services/leadQualificationEngine';
import type { LoadedProcessFlow } from '../../services/processFlowEngine';
import { batchResolveLookupLabels, isUUID, formatBoolean, formatDate } from '../../services/displayResolver';

interface Props {
  leadId: string;
  leadValues: RecordData;
  userId: string;
  processFlow?: LoadedProcessFlow | null;
  onSuccess: (result: { accountId: string | null; contactId: string | null; opportunityId: string | null }) => void;
  onCancel: () => void;
}

interface FieldPreviewRowProps {
  label: string;
  value: unknown;
  displayValue?: string | null;
}

function FieldPreviewRow({ label, value, displayValue }: FieldPreviewRowProps) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const shown = displayValue || String(value);
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-[11px] text-slate-500 w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-[12px] text-slate-800 font-medium break-words">{shown}</span>
    </div>
  );
}

interface DuplicateWarningBannerProps {
  warning: EntityDuplicateWarning;
}

function DuplicateWarningBanner({ warning }: DuplicateWarningBannerProps) {
  const isBlock = warning.mustBlock;
  return (
    <div className={`mt-2 rounded-lg border p-2.5 ${isBlock ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-start gap-1.5">
        <ShieldAlert size={12} className={`shrink-0 mt-0.5 ${isBlock ? 'text-red-500' : 'text-amber-600'}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-semibold ${isBlock ? 'text-red-700' : 'text-amber-700'}`}>
            {isBlock ? 'Duplicate detected — creation blocked' : 'Potential duplicate detected'}
          </p>
          <p className={`text-[10px] mt-0.5 ${isBlock ? 'text-red-600' : 'text-amber-600'}`}>
            {isBlock
              ? 'This record cannot be created because an identical record already exists.'
              : 'A similar record already exists. You may still proceed, but this may create a duplicate.'}
          </p>
          <div className="mt-1.5 space-y-1">
            {warning.matches.slice(0, 3).map((m) => (
              <div key={m.recordId} className={`text-[10px] px-2 py-1 rounded ${isBlock ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                <span className="font-medium">{m.recordLabel}</span>
                {m.matchedFields.length > 0 && (
                  <span className="ml-1 opacity-75">
                    — matched on {m.matchedFields.map((f) => f.fieldName.replace(/_/g, ' ')).join(', ')}
                  </span>
                )}
              </div>
            ))}
            {warning.matches.length > 3 && (
              <p className={`text-[10px] ${isBlock ? 'text-red-500' : 'text-amber-500'}`}>
                +{warning.matches.length - 3} more match{warning.matches.length - 3 !== 1 ? 'es' : ''}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface EntityCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  mode: 'always' | 'optional' | 'never';
  checked: boolean;
  onToggle: () => void;
  fields: RecordData;
  fieldLabels: Record<string, string>;
  resolvedDisplayValues: Record<string, string>;
  missingRequired: string[];
  duplicateWarning?: EntityDuplicateWarning;
  disabled?: boolean;
}

function EntityCard({
  icon, title, subtitle, mode, checked, onToggle, fields, fieldLabels, resolvedDisplayValues, missingRequired, duplicateWarning, disabled,
}: EntityCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isOptional = mode === 'optional';
  const isNever = mode === 'never';
  const hasDuplicateBlock = duplicateWarning?.mustBlock && checked;

  const filledCount = Object.values(fields).filter((v) => v !== null && v !== undefined && String(v).trim() !== '').length;
  const hasFields = filledCount > 0;

  return (
    <div className={`rounded-xl border transition-all ${
      isNever
        ? 'border-slate-100 bg-slate-50 opacity-60'
        : hasDuplicateBlock
        ? 'border-red-200 bg-red-50/30 shadow-sm'
        : checked
        ? 'border-blue-200 bg-blue-50/40 shadow-sm'
        : 'border-slate-200 bg-white'
    }`}>
      <div className="flex items-start gap-3 p-3.5">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
          isNever ? 'bg-slate-100 text-slate-400' :
          hasDuplicateBlock ? 'bg-red-100 text-red-500' :
          checked ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'
        }`}>
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-slate-800">{title}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  mode === 'always'   ? 'bg-emerald-100 text-emerald-700' :
                  mode === 'optional' ? 'bg-blue-100 text-blue-700' :
                                        'bg-slate-100 text-slate-500'
                }`}>
                  {mode === 'always' ? 'Auto' : mode === 'optional' ? 'Optional' : 'Skip'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
            </div>

            {isOptional && !disabled && (
              <button
                type="button"
                onClick={onToggle}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
                  checked ? 'bg-blue-500' : 'bg-slate-300'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  checked ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            )}
            {mode === 'always' && !hasDuplicateBlock && (
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
            )}
          </div>

          {missingRequired.length > 0 && checked && (
            <div className="mt-2 flex items-start gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span className="text-[11px]">
                Missing required fields: {missingRequired.join(', ')}. These will be left blank.
              </span>
            </div>
          )}

          {duplicateWarning && checked && (
            <DuplicateWarningBanner warning={duplicateWarning} />
          )}

          {hasFields && checked && !isNever && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 transition"
            >
              <ChevronRight size={12} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
              {expanded ? 'Hide' : 'Preview'} {filledCount} mapped field{filledCount !== 1 ? 's' : ''}
            </button>
          )}

          {expanded && hasFields && checked && (
            <div className="mt-2 bg-white border border-slate-100 rounded-lg px-3 py-1.5 divide-y divide-slate-50">
              {Object.entries(fields).map(([col, val]) => (
                <FieldPreviewRow
                  key={col}
                  label={fieldLabels[col] ?? col.replace(/_/g, ' ')}
                  value={val}
                  displayValue={resolvedDisplayValues[col] ?? null}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ACCOUNT_FIELD_LABELS: Record<string, string> = {
  account_name: 'Company Name', phone: 'Phone', website: 'Website', industry: 'Industry',
  city: 'City', address_line1: 'Address', country: 'Country', description: 'Description',
  country_id: 'Country', industry_id: 'Industry', owner_id: 'Owner', currency_id: 'Currency',
};

const CONTACT_FIELD_LABELS: Record<string, string> = {
  first_name: 'First Name', last_name: 'Last Name', full_name: 'Full Name',
  email: 'Email', business_phone: 'Business Phone', mobile_phone: 'Mobile',
  job_title: 'Job Title', city: 'City', address_line1: 'Address', country: 'Country',
  account_id: 'Account', country_id: 'Country', owner_id: 'Owner', currency_id: 'Currency',
};

const OPPORTUNITY_FIELD_LABELS: Record<string, string> = {
  topic: 'Topic', description: 'Description', estimated_value: 'Est. Value',
  estimated_close_date: 'Close Date', probability: 'Probability', lead_source: 'Lead Source',
  account_id: 'Account', primary_contact_id: 'Contact', currency_id: 'Currency',
  product_id: 'Product', owner_id: 'Owner', source_id: 'Lead Source',
};

const LOOKUP_COLUMN_ENTITY: Record<string, string> = {
  account_id: 'account', primary_contact_id: 'contact', contact_id: 'contact',
  currency_id: 'currency', product_id: 'product', owner_id: 'crm_user',
  country_id: 'country', industry_id: 'industry', source_id: 'sources',
};

async function resolvePreviewDisplayValues(
  values: RecordData,
): Promise<Record<string, string>> {
  const display: Record<string, string> = {};
  const lookupBatches = new Map<string, { cols: string[]; ids: string[] }>();

  for (const [col, val] of Object.entries(values)) {
    if (!val || !isUUID(val)) {
      if (typeof val === 'boolean') display[col] = formatBoolean(val);
      else if (val && /^\d{4}-\d{2}-\d{2}/.test(String(val))) display[col] = formatDate(val);
      continue;
    }
    const entitySlug = LOOKUP_COLUMN_ENTITY[col];
    if (!entitySlug) continue;
    if (!lookupBatches.has(entitySlug)) lookupBatches.set(entitySlug, { cols: [], ids: [] });
    const batch = lookupBatches.get(entitySlug)!;
    batch.cols.push(col);
    batch.ids.push(String(val));
  }

  await Promise.all(
    [...lookupBatches.entries()].map(async ([slug, { cols, ids }]) => {
      const labels = await batchResolveLookupLabels(slug, ids);
      for (const col of cols) {
        const id = String(values[col]);
        if (labels[id]) display[col] = labels[id];
      }
    }),
  );

  return display;
}

interface RequalificationPanelProps {
  behavior: string;
  existingOpportunities: ExistingOpportunity[];
  action: 'update_existing' | 'create_new' | 'do_nothing';
  selectedOppId: string | null;
  onActionChange: (a: 'update_existing' | 'create_new' | 'do_nothing') => void;
  onOppSelect: (id: string) => void;
  opportunityValues: RecordData;
  fieldLabels: Record<string, string>;
  resolvedDisplayValues: Record<string, string>;
}

function RequalificationPanel({
  behavior, existingOpportunities, action, selectedOppId,
  onActionChange, onOppSelect, opportunityValues, fieldLabels, resolvedDisplayValues,
}: RequalificationPanelProps) {
  const isAskUser = behavior === 'ask_user';
  const [showMapped, setShowMapped] = useState(false);
  const filledCount = Object.values(opportunityValues).filter((v) => v !== null && v !== undefined && String(v).trim() !== '').length;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 shadow-sm">
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-amber-100 text-amber-600">
            <Briefcase size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-slate-800">Opportunity</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                Re-qualification
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              This lead already has {existingOpportunities.length} related opportunit{existingOpportunities.length === 1 ? 'y' : 'ies'}.
            </p>
          </div>
        </div>

        {isAskUser && (
          <div className="mt-3 space-y-1.5">
            <ActionOption
              icon={<RefreshCw size={12} />}
              label="Update existing opportunity"
              description="Apply mapped fields to the selected opportunity below"
              selected={action === 'update_existing'}
              onClick={() => { onActionChange('update_existing'); if (!selectedOppId && existingOpportunities.length > 0) onOppSelect(existingOpportunities[0].opportunity_id); }}
            />
            <ActionOption
              icon={<PlusCircle size={12} />}
              label="Create new opportunity"
              description="Create an additional opportunity linked to this lead"
              selected={action === 'create_new'}
              onClick={() => onActionChange('create_new')}
            />
            <ActionOption
              icon={<Ban size={12} />}
              label="Do nothing"
              description="Skip opportunity creation and update"
              selected={action === 'do_nothing'}
              onClick={() => onActionChange('do_nothing')}
            />
          </div>
        )}

        {!isAskUser && (
          <div className="mt-2 text-[11px] text-slate-600 bg-white border border-slate-100 rounded-lg px-3 py-2">
            {behavior === 'update_existing' && 'The existing opportunity will be updated with the mapped lead fields.'}
            {behavior === 'create_new' && 'A new opportunity will be created alongside the existing ones.'}
            {behavior === 'do_nothing' && 'No opportunity will be created or updated.'}
          </div>
        )}

        {action === 'update_existing' && existingOpportunities.length > 1 && (
          <div className="mt-2.5">
            <p className="text-[11px] font-medium text-slate-600 mb-1.5">Select opportunity to update:</p>
            <div className="space-y-1">
              {existingOpportunities.map((opp) => (
                <label
                  key={opp.opportunity_id}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition text-[12px] ${
                    selectedOppId === opp.opportunity_id
                      ? 'border-blue-300 bg-blue-50 text-slate-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="opp-select"
                    checked={selectedOppId === opp.opportunity_id}
                    onChange={() => onOppSelect(opp.opportunity_id)}
                    className="accent-blue-600"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{opp.topic ?? 'Untitled'}</span>
                    <span className="ml-2 text-slate-400">
                      {new Date(opp.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {action === 'update_existing' && existingOpportunities.length === 1 && (
          <div className="mt-2 text-[11px] text-slate-600 bg-white border border-slate-100 rounded-lg px-3 py-2">
            Updating: <span className="font-medium">{existingOpportunities[0].topic ?? 'Untitled'}</span>
          </div>
        )}

        {action !== 'do_nothing' && filledCount > 0 && (
          <button
            type="button"
            onClick={() => setShowMapped((v) => !v)}
            className="mt-2 flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 transition"
          >
            <ChevronRight size={12} className={`transition-transform ${showMapped ? 'rotate-90' : ''}`} />
            {showMapped ? 'Hide' : 'Preview'} {filledCount} mapped field{filledCount !== 1 ? 's' : ''}
          </button>
        )}

        {showMapped && action !== 'do_nothing' && (
          <div className="mt-2 bg-white border border-slate-100 rounded-lg px-3 py-1.5 divide-y divide-slate-50">
            {Object.entries(opportunityValues).map(([col, val]) => (
              <FieldPreviewRow
                key={col}
                label={fieldLabels[col] ?? col.replace(/_/g, ' ')}
                value={val}
                displayValue={resolvedDisplayValues[col] ?? null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionOption({ icon, label, description, selected, onClick }: {
  icon: React.ReactNode; label: string; description: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg border text-left transition ${
        selected
          ? 'border-blue-300 bg-blue-50 shadow-sm'
          : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <div className={`mt-0.5 ${selected ? 'text-blue-600' : 'text-slate-400'}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-[12px] font-medium ${selected ? 'text-blue-800' : 'text-slate-700'}`}>{label}</p>
        <p className={`text-[10px] mt-0.5 ${selected ? 'text-blue-600' : 'text-slate-400'}`}>{description}</p>
      </div>
      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
        selected ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
      }`}>
        {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
      </div>
    </button>
  );
}

export default function QualifyLeadModal({ leadId, leadValues, userId, processFlow, onSuccess, onCancel }: Props) {
  const [preview, setPreview] = useState<QualifyLeadPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createAccount, setCreateAccount] = useState(true);
  const [createContact, setCreateContact] = useState(true);
  const [createOpportunity, setCreateOpportunity] = useState(false);

  const [requalAction, setRequalAction] = useState<'update_existing' | 'create_new' | 'do_nothing'>('update_existing');
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);

  const [accountDisplay, setAccountDisplay] = useState<Record<string, string>>({});
  const [contactDisplay, setContactDisplay] = useState<Record<string, string>>({});
  const [oppDisplay, setOppDisplay] = useState<Record<string, string>>({});

  useEffect(() => {
    buildQualifyPreview(leadValues, leadId)
      .then((p) => {
        if (p) {
          const defaults = getDefaultSelections(p.rule);
          setCreateAccount(defaults.createAccount);
          setCreateContact(defaults.createContact);
          setCreateOpportunity(defaults.createOpportunity);

          if (p.isRequalification && p.existingOpportunities.length > 0) {
            const behavior = p.requalificationBehavior;
            if (behavior === 'update_existing') {
              setRequalAction('update_existing');
              setSelectedOppId(p.existingOpportunities[0].opportunity_id);
            } else if (behavior === 'create_new') {
              setRequalAction('create_new');
            } else if (behavior === 'do_nothing') {
              setRequalAction('do_nothing');
              setCreateOpportunity(false);
            } else {
              setRequalAction('update_existing');
              setSelectedOppId(p.existingOpportunities[0].opportunity_id);
            }
          }

          setPreview(p);
        }
      })
      .catch(() => setError('Failed to load qualification settings.'))
      .finally(() => setLoading(false));
  }, [leadValues, leadId]);

  useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    Promise.all([
      resolvePreviewDisplayValues(preview.accountValues),
      resolvePreviewDisplayValues(preview.contactValues),
      resolvePreviewDisplayValues(preview.opportunityValues),
    ]).then(([acct, cont, opp]) => {
      if (cancelled) return;
      setAccountDisplay(acct);
      setContactDisplay(cont);
      setOppDisplay(opp);
    });
    return () => { cancelled = true; };
  }, [preview]);

  const rule = preview?.rule;

  const accountMissing = preview?.missingRequired.filter((m) => m.entity === 'account').map((m) => m.field) ?? [];
  const contactMissing = preview?.missingRequired.filter((m) => m.entity === 'contact').map((m) => m.field) ?? [];
  const oppMissing = preview?.missingRequired.filter((m) => m.entity === 'opportunity').map((m) => m.field) ?? [];

  const accountDupeWarning = preview?.duplicateWarnings.find((w) => w.entity === 'account');
  const contactDupeWarning = preview?.duplicateWarnings.find((w) => w.entity === 'contact');

  const noLinkedAccount = preview ? !preview.hasLinkedAccount : false;

  const isBlocked =
    noLinkedAccount ||
    (createAccount && accountDupeWarning?.mustBlock) ||
    (createContact && contactDupeWarning?.mustBlock);

  const isReqal = preview?.isRequalification ?? false;
  const existingOpps = preview?.existingOpportunities ?? [];
  const showRequalPanel = isReqal && existingOpps.length > 0 && (preview?.requalificationBehavior === 'ask_user' || preview?.requalificationBehavior === 'update_existing');

  const handleConfirm = async () => {
    if (!preview || isBlocked) return;
    setSubmitting(true);
    setError(null);
    try {
      const effectiveCreateOpp = isReqal
        ? (requalAction !== 'do_nothing' && createOpportunity)
        : createOpportunity;

      const result = await executeQualifyLead({
        leadId,
        leadValues,
        userId,
        createAccount,
        createContact,
        createOpportunity: effectiveCreateOpp,
        requalOpportunityAction: isReqal ? requalAction : undefined,
        updateOpportunityId: requalAction === 'update_existing' ? selectedOppId : null,
        processFlow,
      });
      onSuccess(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unexpected error occurred.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">Qualify Lead</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              {rule ? `Using rule: ${rule.name}` : 'Preparing qualification...'}
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-blue-500" />
            </div>
          )}

          {!loading && !preview && (
            <div className="text-center py-10 text-slate-500 text-sm">
              No active qualification rule is configured. Please set one up in Admin Settings.
            </div>
          )}

          {!loading && preview && rule && (
            <div className="space-y-3">
              {noLinkedAccount && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-[12px] text-red-700">
                  <Link2Off size={13} className="shrink-0 mt-0.5 text-red-500" />
                  <div>
                    <p className="font-semibold">Account required before qualifying</p>
                    <p className="mt-0.5 text-red-600">
                      This lead must be linked to an Account first. Open the lead, set the Account field, save, then qualify.
                    </p>
                  </div>
                </div>
              )}

              {!noLinkedAccount && (
                <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3 text-[12px] text-slate-600">
                  <Info size={13} className="shrink-0 text-blue-500 mt-0.5" />
                  <span>
                    The following records will be created from this lead's data. Toggle optional items on or off.
                  </span>
                </div>
              )}

              {!noLinkedAccount && (
                <>
                  <EntityCard
                    icon={<Building2 size={16} />}
                    title="Account"
                    subtitle="Company / organisation record"
                    mode={rule.create_account}
                    checked={createAccount}
                    onToggle={() => setCreateAccount((v) => !v)}
                    fields={preview.accountValues}
                    fieldLabels={ACCOUNT_FIELD_LABELS}
                    resolvedDisplayValues={accountDisplay}
                    missingRequired={accountMissing}
                    duplicateWarning={accountDupeWarning}
                    disabled={isCreationForced(rule.create_account) || isCreationDisabled(rule.create_account)}
                  />

                  <EntityCard
                    icon={<User size={16} />}
                    title="Contact"
                    subtitle="Individual person record"
                    mode={rule.create_contact}
                    checked={createContact}
                    onToggle={() => setCreateContact((v) => !v)}
                    fields={preview.contactValues}
                    fieldLabels={CONTACT_FIELD_LABELS}
                    resolvedDisplayValues={contactDisplay}
                    missingRequired={contactMissing}
                    duplicateWarning={contactDupeWarning}
                    disabled={isCreationForced(rule.create_contact) || isCreationDisabled(rule.create_contact)}
                  />

                  {isReqal && existingOpps.length > 0 ? (
                    <RequalificationPanel
                      behavior={preview.requalificationBehavior}
                      existingOpportunities={existingOpps}
                      action={requalAction}
                      selectedOppId={selectedOppId}
                      onActionChange={setRequalAction}
                      onOppSelect={setSelectedOppId}
                      opportunityValues={preview.opportunityValues}
                      fieldLabels={OPPORTUNITY_FIELD_LABELS}
                      resolvedDisplayValues={oppDisplay}
                    />
                  ) : (
                    <EntityCard
                      icon={<Briefcase size={16} />}
                      title="Opportunity"
                      subtitle="Sales opportunity record (originating lead will be set to this lead)"
                      mode={rule.create_opportunity}
                      checked={createOpportunity}
                      onToggle={() => setCreateOpportunity((v) => !v)}
                      fields={preview.opportunityValues}
                      fieldLabels={OPPORTUNITY_FIELD_LABELS}
                      resolvedDisplayValues={oppDisplay}
                      missingRequired={oppMissing}
                      disabled={isCreationForced(rule.create_opportunity) || isCreationDisabled(rule.create_opportunity)}
                    />
                  )}

                  {shouldPromptUser(rule) && !isReqal && (
                    <p className="text-[11px] text-slate-400 text-center pt-1">
                      Items marked "Always" are required and cannot be skipped.
                    </p>
                  )}
                </>
              )}

              {isBlocked && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-[12px] text-red-700">
                  <ShieldAlert size={13} className="shrink-0 mt-0.5 text-red-500" />
                  <span>
                    Qualification is blocked because one or more records would create a duplicate. Deselect the affected records or resolve the existing duplicates first.
                  </span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-[12px] text-red-700">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && preview && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2 text-[13px] font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting || !!isBlocked}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-[13px] font-medium rounded-lg hover:bg-emerald-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Qualifying...
                </>
              ) : (
                'Confirm & Qualify'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
