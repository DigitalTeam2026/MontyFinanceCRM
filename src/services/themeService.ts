import { supabase } from '../lib/supabase';

/** Fallback theme used before any preference is loaded/saved. */
export const DEFAULT_THEME_COLOR = '#f7f8fa';

/** Sentinel theme value that turns on full system-wide dark mode (not just the top bar). */
export const DARK_THEME = 'dark';

/** A selectable, named theme shown in the picker. */
export interface ThemeOption {
  name: string;
  color: string;
}

/** Curated "top popular" themes offered in the sidebar theme picker. */
export const POPULAR_THEMES: ThemeOption[] = [
  { name: 'Dark Mode',     color: DARK_THEME },
  { name: 'Default',       color: '#f7f8fa' },
  { name: 'Pure White',    color: '#ffffff' },
  { name: 'Midnight Navy', color: '#0a1d36' },
  { name: 'Monty Blue',    color: '#163b6e' },
  { name: 'Royal Blue',    color: '#0f2a5e' },
  { name: 'Charcoal',      color: '#1e2328' },
  { name: 'Emerald',       color: '#0a3622' },
  { name: 'Plum',          color: '#2d1b3d' },
];

const cacheKey = (userId: string) => `monty.theme.${userId}`;

/**
 * Last-known theme read synchronously from localStorage for an instant first
 * paint, before the per-user value arrives from the database.
 */
export function getCachedTheme(userId: string): string {
  try {
    return localStorage.getItem(cacheKey(userId)) || DEFAULT_THEME_COLOR;
  } catch {
    return DEFAULT_THEME_COLOR;
  }
}

function cacheTheme(userId: string, color: string): void {
  try {
    localStorage.setItem(cacheKey(userId), color);
  } catch { /* ignore quota/availability errors */ }
}

/** Fetch the signed-in user's saved theme, refreshing the local cache. */
export async function fetchUserTheme(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('user_theme_pref')
    .select('theme_color')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.theme_color) return getCachedTheme(userId);
  cacheTheme(userId, data.theme_color);
  return data.theme_color;
}

/** Persist the user's chosen theme (per-user) and refresh the local cache. */
export async function saveUserTheme(userId: string, color: string): Promise<void> {
  cacheTheme(userId, color);
  await supabase
    .from('user_theme_pref')
    .upsert(
      { user_id: userId, theme_color: color, modified_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
}
