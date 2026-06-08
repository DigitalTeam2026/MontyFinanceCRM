import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Save, AlertTriangle,
  Building2, User, Briefcase, Star, StarOff,
  ToggleLeft, ToggleRight, ShieldCheck, GitMerge,
  Package, ArrowRight,
} from 'lucide-react';
import SearchableSelect from '../../app/components/SearchableSelect';
import { useToast } from '../../app/context/ToastContext';
import type {
  LeadQualificationRule,
  LeadQualificationRuleFormData,
  LeadQualificationFieldMapping,
  CreationMode,
  RequalificationBehavior,
} from '../../types/leadQualification';
import { CREATION_MODE_META, REQUALIFICATION_BEHAVIOR_META } from '../../types/leadQualification';
import type { ProcessFlow } from '../../types/processFlow';
import {
  updateQualificationRule,
  fetchQualificationRuleWithMappings,
  replaceMappingsForTarget,
} from '../../services/leadQualificationService';
import { fetchProcessFlows } from '../../services/processFlowService';
import { fetchEntities } from '../../services/entityService';
import { fetchFieldsForEntity } from '../../services/fieldService';
import FieldMappingPanel from './FieldMappingPanel';
import type { FieldOption } from './FieldMappingPanel';

interface Props {
  rule: LeadQualificationRule;
  onBack: () => void;
  onUpdated: (rule: LeadQualificationRule) => void;
}

type MappingTab = 'account' | 'contact' | 'opportunity';

export default function QualificationRuleEditorPage({ rule, onBack, onUpdated }: Props) {
  const { showSuccess, showError } = useToast();
  const [form, setForm] = useState<LeadQualificationRuleFormData>(toForm(rule));
  const [mappings, setMappings] = useState<LeadQualificationFieldMapping[]>([]);
  const [processFlows, setProcessFlows] = useState<ProcessFlow[]>([]);
  const [mappingTab, setMappingTab] = useState<MappingTab>('account');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingMappings, setLoadingMappings] = useState(true);
  const [leadFields, setLeadFields] = useState<FieldOption[]>([]);
  const [targetFieldMap, setTargetFieldMap] = useState<Record<MappingTab, FieldOption[]>>({
    account: [], contact: [], opportunity: [],
  });

  function toForm(r: LeadQualificationRule): LeadQualificationRuleFormData {
    return {
      name: r.name,
      description: r.description,
      is_active: r.is_active,
      is_default: r.is_default,
      create_account: r.create_account,
      check_duplicate_account: r.check_duplicate_account,
      create_contact: r.create_contact,
      check_duplicate_contact: r.check_duplicate_contact,
      create_opportunity: r.create_opportunity,
      requalification_behavior: r.requalification_behavior,
      default_process_flow_id: r.default_process_flow_id,
      inherit_line_of_business: r.inherit_line_of_business,
      inherit_products: r.inherit_products,
    };
  }

  const loadData = useCallback(async () => {
    setLoadingMappings(true);
    try {
      const [full, flows, entities] = await Promise.all([
        fetchQualificationRuleWithMappings(rule.lead_qualification_rule_id),
        fetchProcessFlows(),
        fetchEntities(),
      ]);
      setMappings(full.mappings ?? []);
      setProcessFlows(flows.filter((f) => f.is_active));

      const entityMap = new Map(entities.map((e) => [e.logical_name, e.entity_definition_id]));
      const toOptions = (entityName: string): Promise<FieldOption[]> => {
        const id = entityMap.get(entityName);
        if (!id) return Promise.resolve([]);
        return fetchFieldsForEntity(id).then((fields) =>
          fields
            .filter((f) => f.is_active)
            .map((f) => ({ logical_name: f.logical_name, display_name: f.display_name }))
        );
      };

      const [lf, af, cf, of] = await Promise.all([
        toOptions('lead'),
        toOptions('account'),
        toOptions('contact'),
        toOptions('opportunity'),
      ]);
      setLeadFields(lf);
      setTargetFieldMap({ account: af, contact: cf, opportunity: of });
    } finally {
      setLoadingMappings(false);
    }
  }, [rule.lead_qualification_rule_id]);

  useEffect(() => {
    setForm(toForm(rule));
    setDirty(false);
    loadData();
  }, [rule.lead_qualification_rule_id]);

  const set = <K extends keyof LeadQualificationRuleFormData>(key: K, value: LeadQualificationRuleFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleMappingsChange = (newMappings: LeadQualificationFieldMapping[]) => {
    setMappings(newMappings);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showError('Name is required.'); return; }
    setSaving(true);
    try {
      const updated = await updateQualificationRule(rule.lead_qualification_rule_id, form);
      await Promise.all((['account', 'contact', 'opportunity'] as const).map((entity) => {
        const entityMappings = mappings
          .filter((m) => m.target_entity === entity)
          .map(({ lead_qualification_field_mapping_id, lead_qualification_rule_id, created_at, ...rest }) => rest);
        return replaceMappingsForTarget(rule.lead_qualification_rule_id, entity, entityMappings);
      }));
      onUpdated(updated);
      setDirty(false);
      showSuccess('Rule saved');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const mappingTabEntities: { key: MappingTab; label: string; icon: React.ReactNode; mode: CreationMode }[] = [
    { key: 'account',     label: 'Account',     icon: <Building2 size={12} />, mode: form.create_account },
    { key: 'contact',     label: 'Contact',     icon: <User size={12} />,      mode: form.create_contact },
    { key: 'opportunity', label: 'Opportunity', icon: <Briefcase size={12} />, mode: form.create_opportunity },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft size={14} />Rules
          </button>
          <span className="text-gray-200">·</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">{form.name || 'Untitled Rule'}</span>
              {form.is_default && <Star size={11} className="text-amber-400 fill-amber-400" />}
              {rule.is_system && <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0">system</span>}
            </div>
          </div>
        </div>
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save size={12} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-5 py-6 space-y-8">

          {/* ── Identity ──────────────────────────────────── */}
          <Section title="Identity">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Rule Name <span className="text-red-500">*</span></label>
                <input
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  rows={2}
                  placeholder="Describe when this rule should be used..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div className="flex flex-col gap-2.5">
                <Toggle label="Active" description="Rule is available during qualification" checked={form.is_active} onChange={(v) => set('is_active', v)} />
                <Toggle
                  label="Default Rule"
                  description="Used when no rule is explicitly selected"
                  checked={form.is_default}
                  onChange={(v) => set('is_default', v)}
                  icon={form.is_default ? <Star size={12} className="text-amber-400 fill-amber-400" /> : <StarOff size={12} className="text-gray-400" />}
                />
              </div>
            </div>
          </Section>

          {/* ── Target Creation ────────────────────────────── */}
          <Section title="Target Record Creation" subtitle="Choose what gets created — and whether the user decides">
            <div className="grid grid-cols-1 gap-4">
              <CreationCard
                icon={<Building2 size={16} className="text-blue-600" />}
                label="Account"
                mode={form.create_account}
                onModeChange={(m) => set('create_account', m)}
                showDupCheck
                dupCheck={form.check_duplicate_account}
                onDupCheckChange={(v) => set('check_duplicate_account', v)}
              />
              <CreationCard
                icon={<User size={16} className="text-emerald-600" />}
                label="Contact"
                mode={form.create_contact}
                onModeChange={(m) => set('create_contact', m)}
                showDupCheck
                dupCheck={form.check_duplicate_contact}
                onDupCheckChange={(v) => set('check_duplicate_contact', v)}
              />
              <CreationCard
                icon={<Briefcase size={16} className="text-amber-600" />}
                label="Opportunity"
                mode={form.create_opportunity}
                onModeChange={(m) => set('create_opportunity', m)}
              />
            </div>
          </Section>

          {/* ── Opportunity Settings ───────────────────────── */}
          {form.create_opportunity !== 'never' && (
            <Section title="Opportunity Settings" subtitle="Configure what the created Opportunity inherits">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Default Pipeline (Process Flow)</label>
                  <div className="flex items-center gap-2">
                    <GitMerge size={14} className="text-gray-400 flex-shrink-0" />
                    <SearchableSelect
                      options={[
                        { value: '', label: 'None — user selects at qualification time' },
                        ...processFlows.map((f) => ({ value: f.process_flow_id, label: f.name })),
                      ]}
                      value={form.default_process_flow_id ?? ''}
                      onChange={(v) => set('default_process_flow_id', v || null)}
                      placeholder="None — user selects at qualification time"
                      className="flex-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Re-qualification Behavior</label>
                  <p className="text-[10px] text-gray-400 mb-2">When a previously qualified lead is re-qualified and an existing Opportunity is found</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(REQUALIFICATION_BEHAVIOR_META) as RequalificationBehavior[]).map((key) => {
                      const meta = REQUALIFICATION_BEHAVIOR_META[key];
                      const selected = form.requalification_behavior === key;
                      return (
                        <button
                          key={key}
                          onClick={() => set('requalification_behavior', key)}
                          className={`text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                            selected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                        >
                          <p className={`text-xs font-semibold ${selected ? 'text-blue-700' : 'text-gray-800'}`}>{meta.label}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{meta.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Toggle
                    label="Inherit Line of Business"
                    description="Copy the Lead's line of business to the Opportunity"
                    checked={form.inherit_line_of_business}
                    onChange={(v) => set('inherit_line_of_business', v)}
                  />
                  <Toggle
                    label="Inherit Products"
                    description="Copy associated products from the Lead to the Opportunity"
                    checked={form.inherit_products}
                    onChange={(v) => set('inherit_products', v)}
                    icon={<Package size={12} className="text-gray-400" />}
                  />
                </div>
              </div>
            </Section>
          )}

          {/* ── Field Mappings ─────────────────────────────── */}
          <Section
            title="Field Mappings"
            subtitle="Map Lead fields to the fields on each target entity"
          >
            {loadingMappings ? (
              <div className="text-xs text-gray-400 py-4">Loading mappings...</div>
            ) : (
              <div>
                {/* Tab bar */}
                <div className="flex items-center gap-0 border-b border-gray-200 mb-4">
                  {mappingTabEntities.map((t) => {
                    const meta = CREATION_MODE_META[t.mode];
                    const tabMappingCount = mappings.filter((m) => m.target_entity === t.key).length;
                    return (
                      <button
                        key={t.key}
                        onClick={() => setMappingTab(t.key)}
                        className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                          mappingTab === t.key
                            ? 'border-blue-600 text-blue-700'
                            : 'border-transparent text-gray-400 hover:text-gray-700'
                        }`}
                      >
                        {t.icon}
                        {t.label}
                        <span
                          className="text-[10px] rounded-full px-1.5 py-0 font-medium"
                          style={{ backgroundColor: meta.bg, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                        {tabMappingCount > 0 && (
                          <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0">{tabMappingCount}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Arrow legend */}
                <div className="flex items-center gap-2 mb-3 text-[10px] text-gray-400">
                  <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">lead_field</span>
                  <ArrowRight size={11} />
                  <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{mappingTab}_field</span>
                </div>

                <FieldMappingPanel
                  targetEntity={mappingTab}
                  mappings={mappings}
                  onChange={handleMappingsChange}
                  leadFields={leadFields}
                  targetFields={targetFieldMap[mappingTab]}
                />
              </div>
            )}
          </Section>

          {rule.is_system && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800">System Rule</p>
                <p className="text-xs text-amber-700 mt-0.5">This system-provided rule cannot be deleted, but all settings and mappings can be customized.</p>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2 pb-6">
            {dirty && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Save size={14} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-900 mb-1">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 mb-4">{subtitle}</p>}
      {children}
    </div>
  );
}

function Toggle({ label, description, checked, onChange, icon }: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all w-full ${
        checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      <div className="flex-shrink-0">
        {checked
          ? <ToggleRight size={18} className="text-blue-600" />
          : <ToggleLeft size={18} className="text-gray-400" />
        }
      </div>
      {icon && <div className="flex-shrink-0">{icon}</div>}
      <div>
        <p className="text-xs font-semibold text-gray-800">{label}</p>
        {description && <p className="text-[10px] text-gray-400 mt-0">{description}</p>}
      </div>
    </button>
  );
}

function CreationCard({ icon, label, mode, onModeChange, showDupCheck, dupCheck, onDupCheckChange }: {
  icon: React.ReactNode;
  label: string;
  mode: CreationMode;
  onModeChange: (m: CreationMode) => void;
  showDupCheck?: boolean;
  dupCheck?: boolean;
  onDupCheckChange?: (v: boolean) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">{icon}</div>
        <span className="text-sm font-bold text-gray-900">{label}</span>
      </div>
      <div className="flex items-center gap-2 mb-3">
        {(['always', 'optional', 'never'] as CreationMode[]).map((m) => {
          const meta = CREATION_MODE_META[m];
          return (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold border-2 transition-all ${
                mode === m ? 'border-blue-500' : 'border-gray-200 hover:border-gray-300'
              }`}
              style={mode === m ? { backgroundColor: meta.bg, color: meta.color, borderColor: meta.color } : {}}
            >
              {meta.label}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-400 mb-3">{CREATION_MODE_META[mode].description}</p>
      {showDupCheck && mode !== 'never' && (
        <button
          onClick={() => onDupCheckChange?.(!dupCheck)}
          className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border transition-colors w-full ${
            dupCheck ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
          }`}
        >
          <ShieldCheck size={12} className={dupCheck ? 'text-emerald-500' : 'text-gray-300'} />
          {dupCheck ? 'Duplicate check enabled' : 'Duplicate check disabled'}
        </button>
      )}
    </div>
  );
}
