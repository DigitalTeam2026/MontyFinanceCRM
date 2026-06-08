import { supabase } from '../../lib/supabase';
import type { AppEntity } from '../types';

export type ActivityType = 'note' | 'email' | 'call' | 'task';
export type ActivityStatus = 'open' | 'completed';
export type ActivityDirection = 'inbound' | 'outbound';

export interface Activity {
  activity_id: string;
  activity_type: ActivityType;
  subject: string | null;
  body: string | null;
  status: ActivityStatus;
  direction: ActivityDirection | null;
  duration_minutes: number | null;
  due_date: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  regarding_entity: string;
  regarding_id: string;
  owner_id: string | null;
  is_deleted: boolean;
  is_pinned: boolean;
  created_at: string;
  modified_at: string;
}

export type ActivityInput = Omit<
  Activity,
  'activity_id' | 'is_deleted' | 'created_at' | 'modified_at'
>;

const ENTITY_SLUG_MAP: Record<AppEntity, string> = {
  accounts: 'account',
  contacts: 'contact',
  leads: 'lead',
  opportunities: 'opportunity',
  tickets: 'ticket',
};

export async function fetchActivities(
  entity: AppEntity,
  recordId: string,
  types?: ActivityType[]
): Promise<Activity[]> {
  const regardingEntity = ENTITY_SLUG_MAP[entity];

  let query = supabase
    .from('activity_log')
    .select('activity_id, activity_type, subject, body, status, direction, duration_minutes, due_date, scheduled_at, completed_at, regarding_entity, regarding_id, owner_id, is_deleted, is_pinned, created_at, modified_at')
    .eq('regarding_entity', regardingEntity)
    .eq('regarding_id', recordId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(200);

  if (types && types.length > 0) {
    query = query.in('activity_type', types);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Activity[];
}

export async function createActivity(
  entity: AppEntity,
  recordId: string,
  input: Omit<ActivityInput, 'regarding_entity' | 'regarding_id'>,
  userId: string
): Promise<Activity> {
  const regardingEntity = ENTITY_SLUG_MAP[entity];

  const { data, error } = await supabase
    .from('activity_log')
    .insert({
      ...input,
      regarding_entity: regardingEntity,
      regarding_id: recordId,
      owner_id: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Activity;
}

export async function updateActivity(
  activityId: string,
  updates: Partial<Pick<Activity, 'body' | 'subject' | 'status' | 'completed_at' | 'due_date' | 'duration_minutes'>>
): Promise<Activity> {
  const { data, error } = await supabase
    .from('activity_log')
    .update({ ...updates, modified_at: new Date().toISOString() })
    .eq('activity_id', activityId)
    .select()
    .single();

  if (error) throw error;
  return data as Activity;
}

export async function deleteActivity(activityId: string): Promise<void> {
  const { error } = await supabase
    .from('activity_log')
    .update({ is_deleted: true, modified_at: new Date().toISOString() })
    .eq('activity_id', activityId);

  if (error) throw error;
}

export async function completeTask(activityId: string): Promise<Activity> {
  return updateActivity(activityId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
  });
}

export async function togglePinActivity(activityId: string, pinned: boolean): Promise<Activity> {
  const { data, error } = await supabase
    .from('activity_log')
    .update({ is_pinned: pinned, modified_at: new Date().toISOString() })
    .eq('activity_id', activityId)
    .select()
    .single();

  if (error) throw error;
  return data as Activity;
}
