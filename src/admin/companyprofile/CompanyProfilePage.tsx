import { useState, useEffect, useCallback, useRef } from 'react';
import { Building2, Save, Upload, Loader2, X } from 'lucide-react';
import { useToast } from '../../app/context/ToastContext';
import {
  fetchCompanyProfile,
  saveCompanyProfile,
  fetchCountries,
  fetchIndustries,
  uploadCompanyLogo,
  DEFAULT_COMPANY_PROFILE,
  COMPANY_SIZE_OPTIONS,
  STATUS_OPTIONS,
  type CompanyProfile,
  type LookupOption,
} from '../../services/companyProfileService';

export default function CompanyProfilePage() {
  const { showSuccess, showError } = useToast();
  const [form, setForm] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [countries, setCountries] = useState<LookupOption[]>([]);
  const [industries, setIndustries] = useState<LookupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profile, c, i] = await Promise.all([
        fetchCompanyProfile(),
        fetchCountries(),
        fetchIndustries(),
      ]);
      setForm(profile);
      setCountries(c);
      setIndustries(i);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showError('Please choose an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showError('Logo must be 2 MB or smaller.');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadCompanyLogo(file);
      set('logo_url', url);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.company_name.trim()) {
      showError('Company name is required.');
      return;
    }
    setSaving(true);
    try {
      await saveCompanyProfile(form);
      showSuccess('Company profile saved');
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const letter = (form.logo_letter.trim() || form.company_name.trim().charAt(0) || 'M').slice(0, 2);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">

        {/* FORM */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden self-start">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <Building2 size={15} className="text-gray-400" />
            <span className="text-sm font-semibold text-gray-800">Company Profile</span>
          </div>

          <div className="p-5 space-y-5">
            {/* Logo + Company name */}
            <div className="flex items-start gap-4">
              <div className="shrink-0">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Logo</label>
                <div className="relative w-20 h-20 rounded-xl border border-gray-200 bg-gray-50 grid place-items-center overflow-hidden">
                  {form.logo_url ? (
                    <img src={form.logo_url} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <div
                      className="w-full h-full grid place-items-center font-extrabold text-2xl text-white"
                      style={{ background: 'linear-gradient(135deg,#4f8cff,#22d3ee)' }}
                    >
                      {letter}
                    </div>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-white/70 grid place-items-center">
                      <Loader2 size={18} className="text-blue-600 animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                  >
                    <Upload size={12} />
                    Upload
                  </button>
                  {form.logo_url && (
                    <button
                      type="button"
                      onClick={() => set('logo_url', null)}
                      disabled={uploading}
                      className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50"
                    >
                      <X size={12} />
                      Remove
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoSelect}
                  className="hidden"
                />
              </div>

              <div className="flex-1">
                <Field label="Company name" hint="Shown on the login screen and in the app header.">
                  <input
                    value={form.company_name}
                    onChange={(e) => set('company_name', e.target.value)}
                    placeholder="Monty CRM"
                    maxLength={60}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </Field>
              </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
              <Field label="Industry" hint="From the shared Industry list.">
                <Select value={form.industry_id ?? ''} onChange={(v) => set('industry_id', v || null)}>
                  <option value="">— Select —</option>
                  {industries.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Country" hint="From the shared Country list.">
                <Select value={form.country_id ?? ''} onChange={(v) => set('country_id', v || null)}>
                  <option value="">— Select —</option>
                  {countries.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Website" hint="">
                <input
                  value={form.website}
                  onChange={(e) => set('website', e.target.value)}
                  placeholder="https://example.com"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </Field>

              <Field label="Phone" hint="">
                <input
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="+1 555 000 0000"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </Field>

              <Field label="Email" hint="">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="info@example.com"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </Field>

              <Field label="Company size" hint="">
                <Select value={form.company_size} onChange={(v) => set('company_size', v)}>
                  <option value="">— Select —</option>
                  {COMPANY_SIZE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s} employees</option>
                  ))}
                </Select>
              </Field>

              <Field label="Primary contact" hint="">
                <input
                  value={form.primary_contact}
                  onChange={(e) => set('primary_contact', e.target.value)}
                  placeholder="Full name"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </Field>

              <Field label="Owner" hint="">
                <input
                  value={form.owner}
                  onChange={(e) => set('owner', e.target.value)}
                  placeholder="Account owner"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </Field>

              <Field label="Status" hint="">
                <Select value={form.status} onChange={(v) => set('status', v)}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* Login branding */}
            <div className="pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
              <Field label="Tagline" hint="Small uppercase text under the company name on the login screen.">
                <input
                  value={form.tagline}
                  onChange={(e) => set('tagline', e.target.value)}
                  placeholder="Sales Hub"
                  maxLength={40}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </Field>

              <Field label="Logo letter" hint="Fallback badge shown when no logo image is set.">
                <input
                  value={form.logo_letter}
                  onChange={(e) => set('logo_letter', e.target.value)}
                  placeholder="M"
                  maxLength={2}
                  className="w-20 text-sm text-center font-bold border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </Field>
            </div>

            <div className="pt-1 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving || uploading}
                className="flex items-center gap-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
              >
                <Save size={14} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => setForm(DEFAULT_COMPANY_PROFILE)}
                disabled={saving || uploading}
                className="text-sm font-medium text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
              >
                Reset to default
              </button>
            </div>
          </div>
        </div>

        {/* PREVIEW */}
        <div className="self-start">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">Login preview</p>
          <div className="rounded-xl overflow-hidden border border-[#0d1520] shadow-sm bg-gradient-to-br from-[#05070d] via-[#0b1530] to-[#05070d] p-6">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-[13px] grid place-items-center font-extrabold text-[19px] text-white shrink-0 overflow-hidden"
                style={{
                  background: form.logo_url ? '#0b1530' : 'linear-gradient(135deg,#4f8cff,#22d3ee)',
                  boxShadow: '0 8px 24px rgba(79,140,255,.5), inset 0 1px 0 rgba(255,255,255,.4)',
                }}
              >
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  letter
                )}
              </div>
              <div className="min-w-0">
                <div className="text-white font-bold text-[15px] leading-tight truncate">
                  {form.company_name.trim() || 'Monty CRM'}
                </div>
                <div className="text-[10px] tracking-[0.22em] uppercase text-slate-400 mt-1 truncate">
                  {form.tagline.trim() || 'Sales Hub'}
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed mt-3 px-1">
            The logo, company name, and tagline appear on the login screen. Returning
            users see updated branding immediately; a brand-new browser shows it right
            after the first page load.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
    >
      {children}
    </select>
  );
}
