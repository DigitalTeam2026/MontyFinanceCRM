import { supabase } from '../../lib/supabase';
import type { AppEntity, AppModule } from '../types';

export interface RecentItem {
  id: string;
  entity: AppEntity;
  module: AppModule;
  record_id: string;
  record_label: string;
  viewed_at: string;
}

export interface PinnedRecord {
  id: string;
  entity: AppEntity;
  module: AppModule;
  record_id: string;
  record_label: string;
  pinned_at: string;
}

const MAX_RECENT = 10;

export async function trackRecentItem(
  userId: string,
  entity: AppEntity,
  module: AppModule,
  record_id: string,
  record_label: string,
): Promise<void> {
  await supabase.from('recent_items').upsert(
    { user_id: userId, entity, module, record_id, record_label, viewed_at: new Date().toISOString() },
    { onConflict: 'user_id,entity,record_id' },
  );

  const { data: rows } = await supabase
    .from('recent_items')
    .select('id, viewed_at')
    .eq('user_id', userId)
    .order('viewed_at', { ascending: false });

  if (rows && rows.length > MAX_RECENT) {
    const toDelete = rows.slice(MAX_RECENT).map((r) => r.id);
    await supabase.from('recent_items').delete().in('id', toDelete);
  }
}

export async function fetchRecentItems(userId: string): Promise<RecentItem[]> {
  const { data } = await supabase
    .from('recent_items')
    .select('id, entity, module, record_id, record_label, viewed_at')
    .eq('user_id', userId)
    .order('viewed_at', { ascending: false })
    .limit(MAX_RECENT);

  return (data ?? []) as RecentItem[];
}

export async function fetchPinnedRecords(userId: string): Promise<PinnedRecord[]> {
  const { data } = await supabase
    .from('pinned_records')
    .select('id, entity, module, record_id, record_label, pinned_at')
    .eq('user_id', userId)
    .order('pinned_at', { ascending: false });

  return (data ?? []) as PinnedRecord[];
}

export async function pinRecord(
  userId: string,
  entity: AppEntity,
  module: AppModule,
  record_id: string,
  record_label: string,
): Promise<void> {
  await supabase.from('pinned_records').upsert(
    { user_id: userId, entity, module, record_id, record_label, pinned_at: new Date().toISOString() },
    { onConflict: 'user_id,entity,record_id' },
  );
}

export async function unpinRecord(
  userId: string,
  entity: AppEntity,
  record_id: string,
): Promise<void> {
  await supabase
    .from('pinned_records')
    .delete()
    .eq('user_id', userId)
    .eq('entity', entity)
    .eq('record_id', record_id);
}

export async function removeRecentItem(
  userId: string,
  entity: AppEntity,
  record_id: string,
): Promise<void> {
  await supabase
    .from('recent_items')
    .delete()
    .eq('user_id', userId)
    .eq('entity', entity)
    .eq('record_id', record_id);
}

export async function removePinnedRecord(
  userId: string,
  entity: AppEntity,
  record_id: string,
): Promise<void> {
  await supabase
    .from('pinned_records')
    .delete()
    .eq('user_id', userId)
    .eq('entity', entity)
    .eq('record_id', record_id);
}

export async function clearRecentItems(userId: string): Promise<void> {
  await supabase.from('recent_items').delete().eq('user_id', userId);
}

export async function isRecordPinned(
  userId: string,
  entity: AppEntity,
  record_id: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('pinned_records')
    .select('id')
    .eq('user_id', userId)
    .eq('entity', entity)
    .eq('record_id', record_id)
    .maybeSingle();

  return !!data;
}
