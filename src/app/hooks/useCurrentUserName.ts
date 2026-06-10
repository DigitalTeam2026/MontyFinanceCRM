import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

/**
 * Loads the logged-in user's display name (crm_user.full_name) for avatar
 * initials. Refreshes immediately after login (userId changes) and live-updates
 * if the user's profile name is edited, via a realtime subscription on the row.
 */
export function useCurrentUserName(userId?: string | null): string {
  const [name, setName] = useState('');

  useEffect(() => {
    if (!userId) { setName(''); return; }
    let active = true;

    supabase
      .from('crm_user')
      .select('full_name')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => { if (active) setName((data?.full_name ?? '').trim()); });

    const channel = supabase
      .channel(`crm_user_avatar_${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'crm_user', filter: `user_id=eq.${userId}` },
        (payload) => {
          const fn = (payload.new as { full_name?: string | null } | null)?.full_name;
          if (active && fn !== undefined) setName((fn ?? '').trim());
        }
      )
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [userId]);

  return name;
}
