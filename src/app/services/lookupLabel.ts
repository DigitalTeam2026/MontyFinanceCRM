// Shared lookup-label resolution used by both the grid (gridResolver) and the
// column filter popover (ColumnFilterDropdown) so they always display/search the
// SAME field. When a lookup table's primary field is empty (e.g. lead.name is
// blank but lead.topic is populated) these fallbacks fill the gap.

export const LOOKUP_LABEL_FALLBACKS: Record<string, string[]> = {
  lead: ['topic', 'company_name', 'email'],
  contact: ['email', 'business_phone'],
};

const hasValue = (v: unknown): boolean =>
  v != null && (typeof v !== 'string' || v.trim() !== '');

/** Pick the first non-empty value among the primary field then the fallbacks. */
export function pickLookupLabel(
  row: Record<string, unknown>,
  primaryField: string,
  fallbacks: string[] = [],
): string {
  if (hasValue(row[primaryField])) return String(row[primaryField]);
  for (const f of fallbacks) {
    if (hasValue(row[f])) return String(row[f]);
  }
  return '';
}

/** The distinct columns to SELECT/search for a lookup: primary first, then any
 *  fallbacks not already included. */
export function lookupLabelColumns(primaryField: string, table: string): string[] {
  const fallbacks = LOOKUP_LABEL_FALLBACKS[table] ?? [];
  return [...new Set([primaryField, ...fallbacks])].filter(Boolean);
}
