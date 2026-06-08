import { supabase } from '../../lib/supabase';

export type NotificationType = 'assignment' | 'mention' | 'workflow_alert';

export interface AppNotification {
  notification_id: string;
  recipient_id: string;
  sender_id: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  entity_name: string | null;
  record_id: string | null;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
}

export async function fetchNotifications(limit = 50): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('user_notification')
    .select('*')
    .eq('is_dismissed', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function markAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('user_notification')
    .update({ is_read: true })
    .eq('notification_id', notificationId);

  if (error) throw error;
}

export async function markAllAsRead(): Promise<void> {
  const { error } = await supabase
    .from('user_notification')
    .update({ is_read: true })
    .eq('is_read', false)
    .eq('is_dismissed', false);

  if (error) throw error;
}

export async function dismissNotification(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('user_notification')
    .update({ is_dismissed: true, is_read: true })
    .eq('notification_id', notificationId);

  if (error) throw error;
}

export async function dismissAll(): Promise<void> {
  const { error } = await supabase
    .from('user_notification')
    .update({ is_dismissed: true, is_read: true })
    .eq('is_dismissed', false);

  if (error) throw error;
}

export async function createNotification(payload: {
  recipient_id: string;
  sender_id?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  entity_name?: string | null;
  record_id?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('user_notification')
    .insert(payload);

  if (error) throw error;
}

export function parseMentions(text: string): string[] {
  const matches = text.match(/@\[([^\]]+)\]\(([^)]+)\)/g) ?? [];
  return matches.map((m) => {
    const idMatch = m.match(/\(([^)]+)\)/);
    return idMatch ? idMatch[1] : '';
  }).filter(Boolean);
}
