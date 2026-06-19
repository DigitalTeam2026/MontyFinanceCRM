import { useState, useEffect } from 'react';
import { Loader2, LayoutDashboard } from 'lucide-react';
import { createDashboard, savePermission, fetchPrincipalOptions } from './services/dashboardService';
import { fetchThemes } from './services/dashboardService';
import type { PrincipalOption } from './services/dashboardService';
import { fetchEntities } from '../../services/entityService';
import type { EntityDefinition } from '../../types/entity';
import type { DashboardTheme, DashboardType, DefaultDateRange, RefreshInterval } from './types/dashboard';
import { DASHBOARD_TYPES, DEFAULT_DATE_RANGES, REFRESH_INTERVALS } from './types/dashboard';
import { useToast, toFriendlyError } from '../../app/context/ToastContext';
import FilterSelect from '../../app/components/FilterSelect';

interface Props {
  onCreated: (id: string) => void;
  onCancel: () => void;
}

export default function DashboardCreatePage({ onCreated, onCancel }: Props) {
  const { showSuccess, showError } = useToast();
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [themes, setThemes] = useState<DashboardTheme[]>([]);
  const [businessUnits, setBusinessUnits] = useState<PrincipalOption[]>([]);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<DashboardType>('system');
  const [entityId, setEntityId] = useState('');
  const [businessUnitId, setBusinessUnitId] = useState('');
  const [dateRange, setDateRange] = useState<DefaultDateRange>('this_month');
  const [refresh, setRefresh] = useState<RefreshInterval>('manual');
  const [themeId, setThemeId] = useState('');

  useEffect(() => {
    fetchEntities().then(setEntities).catch(() => {});
    fetchPrincipalOptions('business_unit').then(setBusinessUnits).catch(() => {});
    fetchThemes().then((t) => {
      setThemes(t);
      const dark = t.find((x) => x.name === 'CRM Dark');
      if (dark) setThemeId(dark.theme_id);
    }).catch(() => {});
  }, []);

  const submit = async () => {
    if (!name.trim()) { showError('Dashboard name is required.'); return; }
    setSaving(true);
    try {
      const dash = await createDashboard({
        name: name.trim(),
        description: description.trim(),
        dashboard_type: type,
        primary_entity_id: entityId || null,
        business_unit_id: businessUnitId || null,
        default_date_range: dateRange,
        refresh_interval: refresh,
        theme_id: themeId || null,
        status: 'draft',
      });
      // Picking a business unit also grants that BU read access, so everyone in it
      // can open the dashboard from their switcher. Fine-tune later via Share…
      if (businessUnitId) {
        await savePermission({
          dashboard_id: dash.dashboard_id, principal_type: 'business_unit', principal_id: businessUnitId,
          can_read: true, can_export: true, can_write: false, can_delete: false, can_publish: false, can_share: false,
        }).catch(() => {});
      }
      showSuccess('Dashboard created.');
      onCreated(dash.dashboard_id);
    } catch (e) {
      showError(toFriendlyError(e));
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
            <LayoutDashboard size={16} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-slate-800">New Dashboard</h2>
            <p className="text-[12px] text-slate-500">Define the dashboard, then design it on the canvas.</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <Field label="Dashboard Name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
              placeholder="e.g. Sales and Marketing Overview"
              className="w-full px-3 py-1.5 text-[13px] border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </Field>

          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full px-3 py-1.5 text-[13px] border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Dashboard Type" required>
              <FilterSelect value={type} onChange={(e) => setType(e.target.value as DashboardType)}
                className="w-full px-3 py-1.5 text-[13px] border border-slate-300 rounded">
                {DASHBOARD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </FilterSelect>
            </Field>
            <Field label="Primary Entity">
              <FilterSelect value={entityId} onChange={(e) => setEntityId(e.target.value)}
                className="w-full px-3 py-1.5 text-[13px] border border-slate-300 rounded">
                <option value="">— None —</option>
                {entities.map((en) => <option key={en.entity_definition_id} value={en.entity_definition_id}>{en.display_name}</option>)}
              </FilterSelect>
            </Field>
          </div>

          <Field label="Business Unit">
            <FilterSelect value={businessUnitId} onChange={(e) => setBusinessUnitId(e.target.value)} forceSearch
              className="w-full px-3 py-1.5 text-[13px] border border-slate-300 rounded">
              <option value="">— None (private to you until shared) —</option>
              {businessUnits.map((bu) => <option key={bu.id} value={bu.id}>{bu.label}</option>)}
            </FilterSelect>
            <p className="mt-1 text-[11px] text-slate-400">Everyone in the chosen unit can view it. You can change who has access anytime from the dashboard list → Share….</p>
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Default Date Range">
              <FilterSelect value={dateRange} onChange={(e) => setDateRange(e.target.value as DefaultDateRange)}
                className="w-full px-3 py-1.5 text-[13px] border border-slate-300 rounded">
                {DEFAULT_DATE_RANGES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </FilterSelect>
            </Field>
            <Field label="Auto-Refresh">
              <FilterSelect value={refresh} onChange={(e) => setRefresh(e.target.value as RefreshInterval)}
                className="w-full px-3 py-1.5 text-[13px] border border-slate-300 rounded">
                {REFRESH_INTERVALS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </FilterSelect>
            </Field>
            <Field label="Theme">
              <FilterSelect value={themeId} onChange={(e) => setThemeId(e.target.value)}
                className="w-full px-3 py-1.5 text-[13px] border border-slate-300 rounded">
                {themes.map((t) => <option key={t.theme_id} value={t.theme_id}>{t.name}</option>)}
              </FilterSelect>
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} disabled={saving}
            className="px-4 py-1.5 text-[12px] text-slate-600 border border-slate-300 rounded hover:bg-white disabled:opacity-50">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-60">
            {saving && <Loader2 size={13} className="animate-spin" />} Create &amp; Design
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-slate-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
