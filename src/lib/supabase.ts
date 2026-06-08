import { createClient } from '@supabase/supabase-js';
import type { PostgrestError } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'crm-auth-token',
  },
});

/** Returns true if the error indicates the session has expired or the user is unauthorized. */
export function isAuthError(error: PostgrestError | Error | null | undefined): boolean {
  if (!error) return false;
  if ('code' in error && (error.code === '42501' || error.code === 'PGRST301')) return true;
  if ('status' in error && (error as { status?: number }).status === 403) return true;
  if ('message' in error && typeof error.message === 'string') {
    const msg = error.message.toLowerCase();
    if (msg.includes('jwt expired') || msg.includes('invalid claim') || msg.includes('permission denied')) return true;
  }
  return false;
}

/** Signs out and reloads the page when a session error is detected. */
export async function handleAuthError(error: PostgrestError | Error | null | undefined): Promise<boolean> {
  if (!isAuthError(error)) return false;
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    await supabase.auth.signOut();
    window.location.reload();
    return true;
  }
  const { error: refreshErr } = await supabase.auth.refreshSession();
  if (refreshErr) {
    await supabase.auth.signOut();
    window.location.reload();
    return true;
  }
  return false;
}
