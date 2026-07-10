import { supabase } from '../lib/supabase';
import type { AutomationEmailAccount } from '../types/automationRule';

// Power Automation — sender mailboxes the send_email action can send AS.
// CRUD over the `automation_email_account` table via the generic API proxy.

/** Full rows (incl. credentials) — for the Email accounts admin screen. */
export async function fetchEmailAccounts(): Promise<AutomationEmailAccount[]> {
  const { data, error } = await supabase
    .from('automation_email_account')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AutomationEmailAccount[];
}

/** Lightweight options (no secrets) — for the "Send from" flow picker. */
export interface EmailAccountOption {
  account_id: string;
  name: string;
  from_address: string;
  is_default: boolean;
  enabled: boolean;
}

export async function fetchEmailAccountOptions(): Promise<EmailAccountOption[]> {
  const { data, error } = await supabase
    .from('automation_email_account')
    .select('account_id, name, from_address, is_default, enabled')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as EmailAccountOption[];
}

export type EmailAccountInput = Pick<
  AutomationEmailAccount,
  'name' | 'from_address' | 'tenant_id' | 'client_id' | 'client_secret' | 'is_default' | 'enabled'
>;

/** Only one account may be the default; clear the flag on the others first. */
async function clearOtherDefaults(exceptId?: string): Promise<void> {
  const q = supabase.from('automation_email_account').update({ is_default: false }).eq('is_default', true);
  if (exceptId) q.neq('account_id', exceptId);
  await q;
}

export async function createEmailAccount(input: EmailAccountInput): Promise<AutomationEmailAccount> {
  if (input.is_default) await clearOtherDefaults();
  const { data, error } = await supabase
    .from('automation_email_account')
    .insert({ provider: 'graph', ...input })
    .select()
    .single();
  if (error) throw error;
  return data as AutomationEmailAccount;
}

export async function updateEmailAccount(
  accountId: string,
  updates: Partial<EmailAccountInput>,
): Promise<void> {
  if (updates.is_default) await clearOtherDefaults(accountId);
  const { error } = await supabase
    .from('automation_email_account')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('account_id', accountId);
  if (error) throw error;
}

export async function deleteEmailAccount(accountId: string): Promise<void> {
  const { error } = await supabase
    .from('automation_email_account')
    .delete()
    .eq('account_id', accountId);
  if (error) throw error;
}
