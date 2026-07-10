import FilterSelect from '../FilterSelect';
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, Clock } from 'lucide-react';
import type { AppEntity } from '../../types';
import { fetchFieldHistory, getAppEntityDefinitionId, type FieldChangeEntry } from '../../services/recordService';
import { loadEntityFieldCodeMeta, resolveFieldCode } from '../../services/fieldCodeResolver';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../../lib/supabase';
import { getInitials } from '../../utils/initials';

interface Props {
  entity: AppEntity;
  recordId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 20;
const LONG_TEXT = 52;

const HIDDEN_FIELDS = new Set([
  'modifiedon', 'modified_on', 'modified_at',
  'custom_fields',
  'currency_locked', 'currency_lock_reason',
]);

// Lookup tables whose resolved records are navigable as CRM record routes.
const NAVIGABLE_SLUG: Record<string, string> = {
  account: 'account',
  contact: 'contact',
  lead: 'lead',
  opportunity: 'opportunity',
  product: 'product',
};

function buildRecordUrl(slug: string, id: string): string {
  return `${window.location.pathname}${window.location.search}#/record/${slug}/${id}`;
}

function formatLabel(fieldName: string): string {
  if (fieldName === '__currency__') return 'Currency Change';
  if (fieldName === '__currency_change_reason__') return 'Currency Change Reason';
  if (fieldName === '__cleared_by_currency_change__') return 'Cleared by Currency Change';
  return fieldName
    .replace(/_id$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayValue(v: string, resolvedNames: Record<string, string>, codeLabel?: string): string {
  // A resolved choice/statecode/statusreason label always wins over the raw code.
  if (codeLabel) return codeLabel;
  if (v === 'true') return 'Yes';
  if (v === 'false') return 'No';
  if (UUID_RE.test(v) && resolvedNames[v]) return resolvedNames[v];
  try {
    const parsed = JSON.parse(v);
    if (typeof parsed === 'object') return JSON.stringify(parsed);
  } catch { /* not JSON */ }
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return new Date(v).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
  return v;
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

function getDayLabel(ts: string): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Deterministic per-user hue so each user keeps a stable avatar color across themes.
function avatarColor(seed: string | null): string {
  if (!seed) return 'var(--muted)';
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 55% 45%)`;
}

function csvCell(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

interface SaveGroup {
  saveKey: string;
  changedAt: string;
  changedBy: string | null;
  userName: string;
  fields: FieldChangeEntry[];
}

export default function FieldHistoryPanel({ entity, recordId }: Props) {
  const { showError } = useToast();
  const [entries, setEntries] = useState<FieldChangeEntry[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
  const [resolvedEntity, setResolvedEntity] = useState<Record<string, string>>({});
  // choice / statecode / statusreason codes resolved to labels, keyed by `${field_name}::${value}`.
  const [codeLabels, setCodeLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterField, setFilterField] = useState<string>('');
  const [dateRange, setDateRange] = useState<'today' | 'last7' | 'last30' | 'all'>('last30');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hist = await fetchFieldHistory(entity, recordId);
      const cleaned = hist.filter((e) => !HIDDEN_FIELDS.has(e.field_name));
      setEntries(cleaned);

      // Resolve choice / statecode / statusreason codes → labels for this entity's fields
      // so old→new values never show a raw "1"/"2" (on screen and in the CSV export).
      const nextCodeLabels: Record<string, string> = {};
      try {
        const entDefId = await getAppEntityDefinitionId(entity);
        if (entDefId) {
          const codeMeta = await loadEntityFieldCodeMeta(entDefId);
          await Promise.all(cleaned.map(async (e) => {
            for (const val of [e.old_value, e.new_value]) {
              if (val == null || val === '') continue;
              const key = `${e.field_name}::${val}`;
              if (nextCodeLabels[key] !== undefined) continue;
              const lbl = await resolveFieldCode(codeMeta, e.field_name, val);
              if (lbl) nextCodeLabels[key] = lbl;
            }
          }));
        }
      } catch { /* non-fatal — fall back to raw codes */ }
      setCodeLabels(nextCodeLabels);

      // Resolve changing users to display names.
      const userIds = [...new Set(cleaned.map((e) => e.changed_by).filter((id): id is string => !!id))];
      const map: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data } = await supabase.rpc('fn_get_user_display_map', { p_user_ids: userIds });
        for (const row of (data ?? []) as { user_id: string; display_name: string }[]) {
          map[row.user_id] = row.display_name;
        }
      }
      setUserMap(map);

      // Resolve UUID-looking old/new values to human labels + originating entity.
      const uuids = new Set<string>();
      for (const e of cleaned) {
        if (e.old_value && UUID_RE.test(e.old_value)) uuids.add(e.old_value);
        if (e.new_value && UUID_RE.test(e.new_value)) uuids.add(e.new_value);
      }
      if (uuids.size > 0) {
        const names: Record<string, string> = {};
        const owner: Record<string, string> = {};
        const lookupTables = ['product', 'contact', 'account', 'lead', 'opportunity', 'crm_user', 'currency', 'country', 'crm_source', 'product_family', 'line_of_business'];
        for (const table of lookupTables) {
          const remaining = [...uuids].filter((id) => !names[id]);
          if (remaining.length === 0) break;
          const pkCol = table === 'crm_user' ? 'user_id'
            : table === 'product_family' ? 'family_id'
            : table === 'line_of_business' ? 'lob_id'
            : table === 'crm_source' ? 'source_id'
            : `${table}_id`;
          const nameCol = table === 'crm_user' ? 'email'
            : table === 'contact' ? 'full_name'
            : table === 'lead' ? 'full_name'
            : table === 'currency' ? 'code'
            : 'name';
          const { data } = await supabase
            .from(table)
            .select(`${pkCol}, ${nameCol}`)
            .in(pkCol, remaining)
            .limit(remaining.length);
          for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
            const id = String(row[pkCol] ?? '');
            const label = String(row[nameCol] ?? '');
            if (id && label) { names[id] = label; owner[id] = table; }
          }
        }
        setResolvedNames(names);
        setResolvedEntity(owner);
      } else {
        setResolvedNames({});
        setResolvedEntity({});
      }
    } catch {
      const msg = 'Unable to load field history. Please try again.';
      setError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  }, [entity, recordId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filterField, dateRange]);

  const allFields = Array.from(new Set(entries.map((e) => e.field_name))).sort();

  const rangeFrom = (() => {
    if (dateRange === 'all') return 0;
    const now = Date.now();
    if (dateRange === 'today') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    if (dateRange === 'last7') return now - 7 * 86400000;
    return now - 30 * 86400000;
  })();

  const filtered = entries.filter((e) => {
    if (filterField && e.field_name !== filterField) return false;
    if (rangeFrom && new Date(e.changed_at).getTime() < rangeFrom) return false;
    return true;
  });

  const groups: SaveGroup[] = (() => {
    const map = new Map<string, FieldChangeEntry[]>();
    for (const e of filtered) {
      const key = `${e.changed_at}__${e.changed_by}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).map(([key, fields]) => ({
      saveKey: key,
      changedAt: fields[0].changed_at,
      changedBy: fields[0].changed_by,
      userName: fields[0].changed_by ? (userMap[fields[0].changed_by] ?? 'Unknown user') : 'System',
      fields,
    }));
  })();

  const visible = groups.slice(0, visibleCount);
  const hasMore = groups.length > visibleCount;

  const exportCsv = () => {
    const header = ['Date', 'User', 'Field', 'Old Value', 'New Value'];
    const lines = [header.map(csvCell).join(',')];
    for (const e of filtered) {
      const user = e.changed_by ? (userMap[e.changed_by] ?? 'Unknown user') : 'System';
      lines.push([
        formatTimestamp(e.changed_at),
        user,
        formatLabel(e.field_name),
        e.old_value === null ? '' : displayValue(e.old_value, resolvedNames, codeLabels[`${e.field_name}::${e.old_value}`]),
        e.new_value === null ? '' : displayValue(e.new_value, resolvedNames, codeLabels[`${e.field_name}::${e.new_value}`]),
      ].map(csvCell).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `field-history-${recordId}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  };

  const selectStyle: React.CSSProperties = {
    fontSize: 12.5,
    color: 'var(--text)',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '7px 12px',
  };
  const iconBtnStyle: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 13,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 9, color: 'var(--text)' }}>
          <Clock size={17} style={{ color: 'var(--muted)' }} />
          Field Change History
        </h2>
        <span
          style={{
            fontSize: 11, fontWeight: 600,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--muted)', padding: '1px 8px', borderRadius: 6,
          }}
        >
          {filtered.length} change{filtered.length !== 1 ? 's' : ''}
        </span>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <FilterSelect value={filterField} onChange={(e) => setFilterField(e.target.value)} style={selectStyle}>
            <option value="">All fields</option>
            {allFields.map((f) => (
              <option key={f} value={f}>{formatLabel(f)}</option>
            ))}
          </FilterSelect>
          <FilterSelect value={dateRange} onChange={(e) => setDateRange(e.target.value as typeof dateRange)} style={selectStyle}>
            <option value="today">Today</option>
            <option value="last7">Last 7 days</option>
            <option value="last30">Last 30 days</option>
            <option value="all">All time</option>
          </FilterSelect>
          <button onClick={load} style={iconBtnStyle} title="Refresh" aria-label="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
          </button>
          <button onClick={exportCsv} style={iconBtnStyle} title="Export CSV" aria-label="Export CSV" disabled={filtered.length === 0}>
            <Download size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px 26px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 0', color: 'var(--muted)' }}>
            <RefreshCw size={14} className="animate-spin" />
            <span style={{ fontSize: 13 }}>Loading history…</span>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: 'var(--danger)' }}>{error}</div>
        ) : groups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
            <Clock size={28} style={{ color: 'var(--border)', marginBottom: 10 }} />
            <p style={{ fontSize: 13 }}>No changes recorded yet.</p>
          </div>
        ) : (
          <>
            {(() => {
              const seenDays = new Set<string>();
              return visible.map((group, idx) => {
                const dayLabel = getDayLabel(group.changedAt);
                const showDay = !seenDays.has(dayLabel);
                if (showDay) seenDays.add(dayLabel);
                const next = visible[idx + 1];
                const showLine = !!next && getDayLabel(next.changedAt) === dayLabel;
                return (
                  <div key={group.saveKey}>
                    {showDay && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: idx === 0 ? '0 0 14px' : '18px 0 14px' }}>
                        <b style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase' }}>
                          {dayLabel}
                        </b>
                        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                      </div>
                    )}

                    <div style={{ position: 'relative', display: 'flex', gap: 14, paddingBottom: 18 }}>
                      {showLine && (
                        <div style={{ position: 'absolute', left: 16, top: 38, bottom: 0, width: 2, background: 'var(--border)' }} />
                      )}
                      <div
                        style={{
                          width: 33, height: 33, borderRadius: '50%',
                          background: avatarColor(group.changedBy),
                          color: 'hsl(0 0% 100%)', fontSize: 11, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, zIndex: 1,
                        }}
                        title={group.userName}
                      >
                        {group.changedBy ? getInitials(group.userName) : 'SY'}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                          <b style={{ fontSize: 13, color: 'var(--text)' }}>{group.userName}</b>
                          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                            changed {group.fields.length} field{group.fields.length !== 1 ? 's' : ''}
                          </span>
                          <time style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted)' }}>
                            {formatTimestamp(group.changedAt)}
                          </time>
                        </div>

                        {group.fields.map((entry) => (
                          <FieldRow
                            key={entry.log_id}
                            entry={entry}
                            resolvedNames={resolvedNames}
                            resolvedEntity={resolvedEntity}
                            codeLabels={codeLabels}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}

            {hasMore && (
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                style={{
                  display: 'block', margin: '6px auto 0', padding: '8px 16px',
                  fontSize: 12.5, fontWeight: 600, color: 'var(--link)',
                  background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                Load older changes
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FieldRow({
  entry,
  resolvedNames,
  resolvedEntity,
  codeLabels,
}: {
  entry: FieldChangeEntry;
  resolvedNames: Record<string, string>;
  resolvedEntity: Record<string, string>;
  codeLabels: Record<string, string>;
}) {
  return (
    <div
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '10px 14px',
        marginBottom: 8,
        display: 'grid',
        gridTemplateColumns: '150px 1fr',
        gap: '4px 16px',
        alignItems: 'center',
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--muted)', textTransform: 'uppercase' }}>
        {formatLabel(entry.field_name)}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
        <HistoryValue raw={entry.old_value} side="old" resolvedNames={resolvedNames} resolvedEntity={resolvedEntity} codeLabel={entry.old_value != null ? codeLabels[`${entry.field_name}::${entry.old_value}`] : undefined} />
        <span style={{ color: 'var(--muted)' }}>→</span>
        <HistoryValue raw={entry.new_value} side="new" resolvedNames={resolvedNames} resolvedEntity={resolvedEntity} codeLabel={entry.new_value != null ? codeLabels[`${entry.field_name}::${entry.new_value}`] : undefined} />
      </div>
    </div>
  );
}

function HistoryValue({
  raw,
  side,
  resolvedNames,
  resolvedEntity,
  codeLabel,
}: {
  raw: string | null;
  side: 'old' | 'new';
  resolvedNames: Record<string, string>;
  resolvedEntity: Record<string, string>;
  codeLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (raw === null || raw === '') {
    return <span style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: 12 }}>empty</span>;
  }

  const isOld = side === 'old';
  const accent = isOld ? 'var(--danger)' : 'var(--success)';
  const box: React.CSSProperties = {
    color: accent,
    background: `color-mix(in srgb, ${accent} 12%, transparent)`,
    border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
    borderRadius: 6,
    padding: '3px 10px',
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12.5,
    maxWidth: '100%',
  };

  // Lookup reference → link to the record (navigable entities only). A resolved
  // choice/statecode/statusreason label takes precedence over lookup handling.
  if (!codeLabel && UUID_RE.test(raw) && resolvedNames[raw]) {
    const label = resolvedNames[raw];
    const slug = NAVIGABLE_SLUG[resolvedEntity[raw] ?? ''];
    const linkStyle: React.CSSProperties = {
      ...box,
      fontFamily: 'inherit',
      fontWeight: 600,
      textDecoration: isOld ? 'line-through' : 'none',
    };
    if (slug) {
      return (
        <a href={buildRecordUrl(slug, raw)} style={{ ...linkStyle, cursor: 'pointer' }} title={`Open ${label}`}>
          {label}
        </a>
      );
    }
    return <span style={linkStyle}>{label}</span>;
  }

  const text = displayValue(raw, resolvedNames, codeLabel);
  const isLong = text.length > LONG_TEXT;
  const shown = isLong && !expanded ? text.slice(0, LONG_TEXT) + '…' : text;

  return (
    <span
      onClick={isLong ? () => setExpanded((v) => !v) : undefined}
      title={isLong ? (expanded ? 'Click to collapse' : 'Click to expand') : undefined}
      style={{
        ...box,
        textDecoration: isOld ? 'line-through' : 'none',
        cursor: isLong ? 'pointer' : 'default',
        whiteSpace: expanded ? 'normal' : 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: 'inline-block',
        wordBreak: expanded ? 'break-word' : 'normal',
      }}
    >
      {shown}
    </span>
  );
}
