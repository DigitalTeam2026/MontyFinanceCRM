/**
 * Publication service (Admin Studio side).
 *
 * Thin wrapper over the publish/validate/rollback RPCs and the publication +
 * change-log tables created by 20260615130000_publish_customizations.sql.
 */
import { supabase } from '../../lib/supabase';
import { moduleLabel } from './customizationRegistry';

export interface PendingSummary {
  total: number;
  /** component_type -> count of pending changes. */
  byComponent: Record<string, number>;
  groups: { key: string; label: string; count: number }[];
}

export interface ValidationIssue {
  component_type: string;
  component_id?: string;
  component_label?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface PublicationRecord {
  publication_id: string;
  customization_version: number;
  publication_status: string;
  published_at: string;
  published_by: string | null;
  change_count: number;
  component_summary: Record<string, number>;
  validation_results: ValidationIssue[];
  error_details: unknown;
  previous_version: number | null;
  rolled_back_from: number | null;
}

export interface PublishResult {
  version: number;
  previous_version: number | null;
  change_count: number;
  component_summary: Record<string, number>;
  warnings: ValidationIssue[];
}

export type PublishErrorKind = 'version_conflict' | 'validation_failed' | 'not_authorized' | 'unknown';

export class PublishError extends Error {
  kind: PublishErrorKind;
  issues?: ValidationIssue[];
  constructor(kind: PublishErrorKind, message: string, issues?: ValidationIssue[]) {
    super(message);
    this.kind = kind;
    this.issues = issues;
  }
}

/**
 * Whether the current user may publish. Mirrors the server's
 * security.can_publish_customizations(): system admin OR a role holding the
 * `__publish_customizations__` privilege. The publish RPC enforces this
 * server-side regardless — this is only for hiding/disabling the UI.
 */
export async function canPublishCustomizations(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: cu } = await supabase
    .from('crm_user')
    .select('is_system_admin')
    .eq('user_id', user.id)
    .maybeSingle();
  if (cu?.is_system_admin) return true;

  const { data: roles } = await supabase
    .from('user_security_role')
    .select('role_id')
    .eq('user_id', user.id);
  const roleIds = (roles ?? []).map((r) => (r as { role_id: string }).role_id);
  if (roleIds.length === 0) return false;

  const { data: priv } = await supabase
    .from('role_privilege')
    .select('privilege_id')
    .in('role_id', roleIds)
    .eq('entity_name', '__publish_customizations__')
    .eq('can_write', true)
    .limit(1);
  return (priv ?? []).length > 0;
}

/** Latest published customization version (0 if none). */
export async function getLatestVersion(): Promise<number> {
  const { data } = await supabase
    .from('customization_publication')
    .select('customization_version')
    .order('customization_version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.customization_version as number | undefined) ?? 0;
}

/** Count pending (unpublished) changes grouped by component type. */
export async function getPendingSummary(): Promise<PendingSummary> {
  const { data, error } = await supabase
    .from('customization_change_log')
    .select('component_type')
    .is('published_version', null);
  if (error) throw error;

  const byComponent: Record<string, number> = {};
  for (const r of (data ?? []) as { component_type: string }[]) {
    byComponent[r.component_type] = (byComponent[r.component_type] ?? 0) + 1;
  }
  const groups = Object.entries(byComponent)
    .map(([key, count]) => ({ key, label: moduleLabel(key), count }))
    .sort((a, b) => b.count - a.count);
  return { total: (data ?? []).length, byComponent, groups };
}

/** Run server-side validation without publishing. */
export async function runValidation(): Promise<ValidationIssue[]> {
  const { data, error } = await supabase.rpc('validate_customizations');
  if (error) throw error;
  return (data ?? []) as ValidationIssue[];
}

function classifyPublishError(message: string): PublishError {
  if (message.includes('version_conflict')) {
    return new PublishError('version_conflict', 'Another administrator published changes while you were editing. Reload and review before publishing again.');
  }
  if (message.includes('not_authorized') || message.includes('42501')) {
    return new PublishError('not_authorized', 'You do not have permission to publish customizations.');
  }
  if (message.includes('validation_failed')) {
    let issues: ValidationIssue[] | undefined;
    const idx = message.indexOf('[');
    if (idx >= 0) {
      try { issues = JSON.parse(message.slice(idx)) as ValidationIssue[]; } catch { /* ignore */ }
    }
    return new PublishError('validation_failed', 'Validation failed. Resolve the listed problems before publishing.', issues);
  }
  return new PublishError('unknown', message);
}

/** Publish all pending customizations as a single atomic version. */
export async function publishAll(baseVersion: number): Promise<PublishResult> {
  const { data, error } = await supabase.rpc('publish_all_customizations', { p_base_version: baseVersion });
  if (error) throw classifyPublishError(error.message ?? String(error));
  return data as PublishResult;
}

/** Publication history (newest first). */
export async function getHistory(limit = 50): Promise<PublicationRecord[]> {
  const { data, error } = await supabase
    .from('customization_publication')
    .select('*')
    .order('customization_version', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PublicationRecord[];
}

/** Re-publish a prior version's snapshot as a new version. */
export async function rollbackTo(version: number): Promise<{ version: number }> {
  const { data, error } = await supabase.rpc('rollback_customization_to', { p_version: version });
  if (error) throw classifyPublishError(error.message ?? String(error));
  return data as { version: number };
}
