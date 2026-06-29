// Pure helpers for the workflow record actions — no Supabase import, so they can
// be unit-tested in isolation. Used by workflowActions.ts.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { resolveSoftDeleteMode } from '../components/lookupSoftDelete';

// Accept a real array/object as-is, or parse a JSON string (the Designer's generic
// param editor stores every value as text). Non-JSON strings pass through unchanged.
export function coerceJson(v: any): any {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!t || (t[0] !== '{' && t[0] !== '[')) return v;
  try { return JSON.parse(t); } catch { return v; }
}

// Apply list/delete filters onto a Supabase query builder. Accepts an array of
// { field, op, value } or a plain { field: value } object (object = equals).
export function applyFilters(query: any, filters: any): any {
  filters = coerceJson(filters);   // Designer passes params as strings; accept JSON text too
  if (!filters) return query;
  const arr = Array.isArray(filters)
    ? filters
    : Object.entries(filters).map(([field, value]) => ({ field, op: 'eq', value }));
  for (const f of arr) {
    const field = f.field;
    const op = f.op || 'eq';
    const value = f.value;
    if (!field) continue;
    switch (op) {
      case 'eq':           query = query.eq(field, value); break;
      case 'neq':
      case 'not_equals':   query = query.neq(field, value); break;
      case 'gt':
      case 'greater_than': query = query.gt(field, value); break;
      case 'gte':          query = query.gte(field, value); break;
      case 'lt':
      case 'less_than':    query = query.lt(field, value); break;
      case 'lte':          query = query.lte(field, value); break;
      case 'like':         query = query.like(field, value); break;
      case 'ilike':
      case 'contains':     query = query.ilike(field, `%${value}%`); break;
      case 'in':           query = query.in(field, Array.isArray(value) ? value : String(value).split(',').map((s) => s.trim())); break;
      case 'is_empty':     query = query.is(field, null); break;
      default:             query = query.eq(field, value);
    }
  }
  return query;
}

// The column + value to write for a soft delete on `table` (or an explicit field).
export function softDeletePatch(table: string, softField?: string): { field: string; value: unknown } {
  if (softField) {
    return { field: softField, value: softField === 'deleted_at' ? new Date().toISOString() : true };
  }
  const mode = resolveSoftDeleteMode(table);
  if (mode === 'none') throw new Error(`delete_record: ${table} has no soft-delete column — use a hard delete (omit soft) or pass softField.`);
  if (mode === 'deleted_at') return { field: 'deleted_at', value: new Date().toISOString() };
  if (mode === 'is_active') return { field: 'is_active', value: false };
  return { field: 'is_deleted', value: true };
}
