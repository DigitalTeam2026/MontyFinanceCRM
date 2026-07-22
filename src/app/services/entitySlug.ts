// Physical lookup table → the entity slug used in CRM routes (#/record/<slug>/<id>).
//
// Grid lookup cells are clickable: to open the referenced record we need the
// TARGET entity's slug, but a view column only carries the lookup's physical
// table (e.g. "lead"). entity_definition bridges the two — table → logical_name
// → slug. Core entities have pluralized slugs; custom entities use their logical
// name verbatim (same convention as subgrid navigation in FormSubgrid).

import { supabase } from '../../lib/supabase';
import { getTable } from './metadata/metadataStore';

/** Entity logical_name (DB) → CRM route slug. Custom entities are absent: their
 *  slug IS their logical name. */
export const ENTITY_LOGICAL_TO_SLUG: Record<string, string> = {
  account:     'accounts',
  contact:     'contacts',
  lead:        'leads',
  opportunity: 'opportunities',
  ticket:      'tickets',
  crm_user:    'users',
  prospect:    'prospect',
};

const slugByTable = new Map<string, string | null>();

/** Drop the cache after a publish (entity metadata may have changed). */
export function resetEntitySlugCache(): void {
  slugByTable.clear();
}

/** Resolve a physical table name to its CRM route slug, or null when the table
 *  has no entity_definition row (nothing to navigate to). Cached per table. */
export async function resolveEntitySlugForTable(table: string): Promise<string | null> {
  if (!table) return null;
  const cached = slugByTable.get(table);
  if (cached !== undefined) return cached;

  let logical: string | null = null;
  const ents = getTable<{ logical_name: string; physical_table_name: string }>('entity_definition');
  if (ents) {
    logical = ents.find((e) => e.physical_table_name === table)?.logical_name ?? null;
  }
  if (!logical) {
    // Not hydrated (Admin Studio) or the entity isn't in the published snapshot.
    try {
      const { data } = await supabase
        .from('entity_definition')
        .select('logical_name')
        .eq('physical_table_name', table)
        .maybeSingle();
      logical = (data?.logical_name as string | undefined) ?? null;
    } catch { /* leave unresolved — the cell stays plain text */ }
  }

  const slug = logical ? (ENTITY_LOGICAL_TO_SLUG[logical] ?? logical) : null;
  slugByTable.set(table, slug);
  return slug;
}
