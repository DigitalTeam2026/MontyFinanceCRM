import { supabase } from '../lib/supabase';

/** Theme keys — each maps to a `[data-theme="…"]` block in index.css. */
export type ThemeKey =
  | 'monty-light'
  | 'slate-dark'
  | 'monty-dark'
  | 'graphite'
  | 'ocean'
  | 'forest'
  | 'rose-gold'
  | 'blossom'
  | 'lavender'
  | 'pearl'
  | 'white';

/** Default theme, applied before any preference loads and on reset. */
export const DEFAULT_THEME: ThemeKey = 'monty-light';

/** Themes that flip the whole app to dark surfaces (drive the `dark` class). */
const DARK_THEMES = new Set<ThemeKey>(['slate-dark', 'monty-dark', 'forest']);

/** A selectable, named theme shown in the picker. */
export interface ThemeOption {
  key: ThemeKey;
  name: string;
  /** Preview dot color — surface for light themes, sidebar for dark ones. */
  swatch: string;
  /** Optional swatch border override (e.g. a near-white swatch needs a visible edge). */
  swatchBorder?: string;
  /** Whether this theme has a dark sidebar (so the picker dot needs no border). */
  dark: boolean;
}

/** The selectable themes, in menu order (light section first, then dark). */
export const THEMES: ThemeOption[] = [
  { key: 'monty-light', name: 'Monty Light', swatch: '#FFFFFF', dark: false },
  { key: 'white',       name: 'White',       swatch: '#FFFFFF', swatchBorder: '#EAEAEA', dark: false },
  { key: 'pearl',       name: 'Pearl',       swatch: '#3B82F6', dark: false },
  { key: 'rose-gold',   name: 'Rose Gold',   swatch: '#B76E79', dark: false },
  { key: 'blossom',     name: 'Blossom',     swatch: '#D6336C', dark: false },
  { key: 'lavender',    name: 'Lavender',    swatch: '#7C5CDB', dark: false },
  { key: 'graphite',    name: 'Graphite',    swatch: '#1B1B1F', dark: true },
  { key: 'ocean',       name: 'Ocean',       swatch: '#0C3B5E', dark: true },
  { key: 'monty-dark',  name: 'Monty Dark',  swatch: '#111A30', dark: true },
  { key: 'slate-dark',  name: 'Slate Dark',  swatch: '#13161F', dark: true },
  { key: 'forest',      name: 'Forest',      swatch: '#14201A', dark: true },
];

const THEME_KEYS = new Set<string>(THEMES.map((t) => t.key));

/**
 * Coerce any stored value to a valid theme key. Migrates the pre-token presets:
 * the old `dark` sentinel maps to Slate Dark; every old light color preset maps
 * to the default Monty Light.
 */
export function normalizeTheme(stored: string | null | undefined): ThemeKey {
  if (!stored) return DEFAULT_THEME;
  if (THEME_KEYS.has(stored)) return stored as ThemeKey;
  if (stored === 'dark') return 'slate-dark';
  return DEFAULT_THEME;
}

/**
 * Apply a theme to the document: set `data-theme` (drives the token blocks) and
 * toggle the `dark` class (drives the neutral-utility override layer).
 */
export function applyTheme(key: ThemeKey): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', key);
  root.classList.toggle('dark', DARK_THEMES.has(key));
}

const cacheKey = (userId: string) => `monty.theme.${userId}`;

/**
 * Last-known theme read synchronously from localStorage for an instant first
 * paint, before the per-user value arrives from the database.
 */
export function getCachedTheme(userId: string): ThemeKey {
  try {
    return normalizeTheme(localStorage.getItem(cacheKey(userId)));
  } catch {
    return DEFAULT_THEME;
  }
}

function cacheTheme(userId: string, key: ThemeKey): void {
  try {
    localStorage.setItem(cacheKey(userId), key);
  } catch { /* ignore quota/availability errors */ }
}

/** Fetch the signed-in user's saved theme, refreshing the local cache. */
export async function fetchUserTheme(userId: string): Promise<ThemeKey> {
  const { data, error } = await supabase
    .from('user_theme_pref')
    .select('theme_color')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.theme_color) return getCachedTheme(userId);
  const key = normalizeTheme(data.theme_color);
  cacheTheme(userId, key);
  return key;
}

/** Persist the user's chosen theme (per-user) and refresh the local cache. */
export async function saveUserTheme(userId: string, key: ThemeKey): Promise<void> {
  cacheTheme(userId, key);
  await supabase
    .from('user_theme_pref')
    .upsert(
      { user_id: userId, theme_color: key, modified_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
}
