import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

/**
 * Generic per-component dirty tracking. Returns the set of row primary keys
 * (`row_pk`) for a given `component_type` that have unpublished changes since
 * the last publication. Module list pages use this to show an "Unpublished"
 * chip on dirty rows — keyed only by (component_type, row_pk), so it works for
 * every module without bespoke code.
 */
export function usePendingComponentIds(componentType: string): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('customization_change_log')
        .select('row_pk')
        .eq('component_type', componentType)
        .is('published_version', null);
      if (cancelled) return;
      setIds(new Set((data ?? []).map((r) => (r as { row_pk: string | null }).row_pk).filter((x): x is string => !!x)));
    })();
    return () => { cancelled = true; };
  }, [componentType]);

  return ids;
}
