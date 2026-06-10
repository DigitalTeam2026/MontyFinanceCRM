import { supabase } from '../lib/supabase';

export interface CompanyProfile {
  company_name: string;
  tagline: string;
  logo_letter: string;
  logo_url: string | null;
  industry_id: string | null;
  country_id: string | null;
  website: string;
  phone: string;
  email: string;
  company_size: string;
  primary_contact: string;
  owner: string;
  status: string;
}

/** Branding/details shown before any company profile has been configured. */
export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  company_name: 'Monty CRM',
  tagline: 'Sales Hub',
  logo_letter: 'M',
  logo_url: null,
  industry_id: null,
  country_id: null,
  website: '',
  phone: '',
  email: '',
  company_size: '',
  primary_contact: '',
  owner: '',
  status: 'Active',
};

/** Preset employee-count ranges for the Company Size dropdown. */
export const COMPANY_SIZE_OPTIONS = ['1–10', '11–50', '51–200', '201–500', '501–1000', '1000+'];

/** Fixed lifecycle states for the Status dropdown. */
export const STATUS_OPTIONS = ['Active', 'Inactive'];

/** A single option for the Country / Industry reference dropdowns. */
export interface LookupOption {
  id: string;
  name: string;
}

const CACHE_KEY = 'crm-company-profile';

/** Merge a partial (cache or row) onto the defaults so every field is present. */
function normalize(p: Partial<CompanyProfile>): CompanyProfile {
  return {
    company_name: p.company_name || DEFAULT_COMPANY_PROFILE.company_name,
    tagline: p.tagline || DEFAULT_COMPANY_PROFILE.tagline,
    logo_letter: p.logo_letter || DEFAULT_COMPANY_PROFILE.logo_letter,
    logo_url: p.logo_url ?? null,
    industry_id: p.industry_id ?? null,
    country_id: p.country_id ?? null,
    website: p.website ?? '',
    phone: p.phone ?? '',
    email: p.email ?? '',
    company_size: p.company_size ?? '',
    primary_contact: p.primary_contact ?? '',
    owner: p.owner ?? '',
    status: p.status || DEFAULT_COMPANY_PROFILE.status,
  };
}

/**
 * Last-known profile read synchronously from localStorage, falling back to the
 * defaults. Used by the login screen for an instant first paint before the
 * fresh values arrive from the database.
 */
export function getCachedCompanyProfile(): CompanyProfile {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT_COMPANY_PROFILE;
    return normalize(JSON.parse(raw) as Partial<CompanyProfile>);
  } catch {
    return DEFAULT_COMPANY_PROFILE;
  }
}

function cacheCompanyProfile(profile: CompanyProfile): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore quota/availability errors */
  }
}

/** Fetch the company profile from the database and refresh the local cache. */
export async function fetchCompanyProfile(): Promise<CompanyProfile> {
  const { data, error } = await supabase
    .from('company_profile')
    .select(
      'company_name, tagline, logo_letter, logo_url, industry_id, country_id, website, phone, email, company_size, primary_contact, owner, status'
    )
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) return getCachedCompanyProfile();

  const profile = normalize(data as Partial<CompanyProfile>);
  cacheCompanyProfile(profile);
  return profile;
}

/** Persist company profile changes from Admin Studio and refresh the local cache. */
export async function saveCompanyProfile(profile: CompanyProfile): Promise<void> {
  const payload = {
    company_name: profile.company_name.trim(),
    tagline: profile.tagline.trim(),
    logo_letter: profile.logo_letter.trim(),
    logo_url: profile.logo_url,
    industry_id: profile.industry_id,
    country_id: profile.country_id,
    website: profile.website.trim(),
    phone: profile.phone.trim(),
    email: profile.email.trim(),
    company_size: profile.company_size,
    primary_contact: profile.primary_contact.trim(),
    owner: profile.owner.trim(),
    status: profile.status,
    modified_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('company_profile').update(payload).eq('id', 1);
  if (error) throw error;
  cacheCompanyProfile(normalize(payload));
}

/** Country options sourced from the shared `country` reference table. */
export async function fetchCountries(): Promise<LookupOption[]> {
  const { data, error } = await supabase
    .from('country')
    .select('country_id, name')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.country_id as string, name: r.name as string }));
}

/** Industry options sourced from the shared `industry` reference table. */
export async function fetchIndustries(): Promise<LookupOption[]> {
  const { data, error } = await supabase
    .from('industry')
    .select('industry_id, name')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.industry_id as string, name: r.name as string }));
}

/** Upload a logo image to the public `company-assets` bucket and return its URL. */
export async function uploadCompanyLogo(file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `logo/company-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('company-assets')
    .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from('company-assets').getPublicUrl(path);
  return data.publicUrl;
}
