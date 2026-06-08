import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, X, Building2, Users, UserPlus, Loader2, ArrowRight, Clock, Target, Ticket, Filter } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { AppEntity, AppModule } from '../types';

export interface GlobalSearchResult {
  id: string;
  entity: AppEntity;
  module: AppModule;
  label: string;
  sublabel?: string;
  badge?: string;
}

interface GlobalSearchProps {
  onNavigate: (entity: AppEntity, module: AppModule, id: string) => void;
  onClose: () => void;
  userId: string;
}

const ENTITY_META: Record<string, { icon: React.ReactNode; color: string; entity: AppEntity; module: AppModule; label: string }> = {
  accounts: {
    icon: <Building2 size={13} />,
    color: 'text-blue-600 bg-blue-50',
    entity: 'accounts',
    module: 'sales',
    label: 'Account',
  },
  contacts: {
    icon: <Users size={13} />,
    color: 'text-teal-600 bg-teal-50',
    entity: 'contacts',
    module: 'sales',
    label: 'Contact',
  },
  leads: {
    icon: <UserPlus size={13} />,
    color: 'text-emerald-600 bg-emerald-50',
    entity: 'leads',
    module: 'sales',
    label: 'Lead',
  },
  opportunities: {
    icon: <Target size={13} />,
    color: 'text-orange-600 bg-orange-50',
    entity: 'opportunities',
    module: 'sales',
    label: 'Opportunity',
  },
  tickets: {
    icon: <Ticket size={13} />,
    color: 'text-rose-600 bg-rose-50',
    entity: 'tickets',
    module: 'support',
    label: 'Ticket',
  },
};

type EntityFilter = 'all' | AppEntity;

const ENTITY_FILTERS: { key: EntityFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'leads', label: 'Leads' },
  { key: 'opportunities', label: 'Opps' },
  { key: 'tickets', label: 'Tickets' },
];

async function searchAccounts(query: string): Promise<GlobalSearchResult[]> {
  const { data } = await supabase
    .from('account')
    .select('account_id, account_name, industry')
    .ilike('account_name', `%${query}%`)
    .eq('is_deleted', false)
    .limit(4);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.account_id as string,
    entity: 'accounts' as AppEntity,
    module: 'sales' as AppModule,
    label: r.account_name as string,
    sublabel: r.industry as string | undefined,
    badge: 'Account',
  }));
}

async function searchContacts(query: string): Promise<GlobalSearchResult[]> {
  const { data } = await supabase
    .from('contact')
    .select('contact_id, first_name, last_name, email, account:account_id(name)')
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
    .eq('is_deleted', false)
    .limit(4);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.contact_id as string,
    entity: 'contacts' as AppEntity,
    module: 'sales' as AppModule,
    label: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || (r.email as string),
    sublabel: (r.account as { name?: string } | null)?.name ?? (r.email as string | undefined),
    badge: 'Contact',
  }));
}

async function searchLeads(query: string): Promise<GlobalSearchResult[]> {
  const { data } = await supabase
    .from('lead')
    .select('lead_id, full_name, company_name, email')
    .or(`full_name.ilike.%${query}%,company_name.ilike.%${query}%,email.ilike.%${query}%`)
    .eq('is_deleted', false)
    .limit(4);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.lead_id as string,
    entity: 'leads' as AppEntity,
    module: 'sales' as AppModule,
    label: (r.full_name as string) || (r.email as string),
    sublabel: r.company_name as string | undefined,
    badge: 'Lead',
  }));
}

async function searchOpportunities(query: string): Promise<GlobalSearchResult[]> {
  const { data } = await supabase
    .from('opportunity')
    .select('opportunity_id, name, account:account_id(name), estimated_value, currency:currency_id(code)')
    .ilike('name', `%${query}%`)
    .eq('is_deleted', false)
    .limit(4);
  return (data ?? []).map((r: Record<string, unknown>) => {
    const val = r.estimated_value as number | null;
    const currencyCode = (r.currency as { code?: string } | null)?.code ?? 'USD';
    const formatted = val != null
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val)
      : undefined;
    return {
      id: r.opportunity_id as string,
      entity: 'opportunities' as AppEntity,
      module: 'sales' as AppModule,
      label: r.name as string,
      sublabel: [(r.account as { name?: string } | null)?.name, formatted].filter(Boolean).join(' · '),
      badge: 'Opportunity',
    };
  });
}

async function searchTickets(query: string): Promise<GlobalSearchResult[]> {
  const { data } = await supabase
    .from('ticket')
    .select('ticket_id, title, account:account_id(name)')
    .ilike('title', `%${query}%`)
    .eq('is_deleted', false)
    .limit(4);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.ticket_id as string,
    entity: 'tickets' as AppEntity,
    module: 'support' as AppModule,
    label: r.title as string,
    sublabel: (r.account as { name?: string } | null)?.name,
    badge: 'Ticket',
  }));
}

function scoreResult(result: GlobalSearchResult, query: string): number {
  const q = query.toLowerCase();
  const label = result.label.toLowerCase();
  const sub = (result.sublabel ?? '').toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  if (sub.startsWith(q)) return 40;
  if (sub.includes(q)) return 20;
  return 10;
}

function highlightMatch(text: string, q: string) {
  if (!q.trim()) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-100 text-yellow-900 rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export default function GlobalSearch({ onNavigate, onClose, userId }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [recentItems, setRecentItems] = useState<GlobalSearchResult[]>([]);
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const fetchRecent = async () => {
      const { data } = await supabase
        .from('recent_record')
        .select('*')
        .eq('user_id', userId)
        .order('visited_at', { ascending: false })
        .limit(8);
      if (!data) return;
      setRecentItems(
        data.map((r: Record<string, unknown>) => ({
          id: r.record_id as string,
          entity: r.entity_name as AppEntity,
          module: r.module_name as AppModule,
          label: r.record_label as string,
          badge: String(r.entity_name).charAt(0).toUpperCase() + String(r.entity_name).slice(0, -1),
        }))
      );
    };
    fetchRecent();
  }, [userId]);

  const doSearch = useCallback(async (q: string, filter: EntityFilter) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const searches: Promise<GlobalSearchResult[]>[] = [];
      if (filter === 'all' || filter === 'accounts') searches.push(searchAccounts(q));
      if (filter === 'all' || filter === 'contacts') searches.push(searchContacts(q));
      if (filter === 'all' || filter === 'leads') searches.push(searchLeads(q));
      if (filter === 'all' || filter === 'opportunities') searches.push(searchOpportunities(q));
      if (filter === 'all' || filter === 'tickets') searches.push(searchTickets(q));

      const allResults = await Promise.all(searches);
      const combined = allResults.flat().sort((a, b) => scoreResult(b, q) - scoreResult(a, q));
      setResults(combined);
      setSelectedIdx(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(query, entityFilter), 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, entityFilter, doSearch]);

  const filteredRecent = entityFilter === 'all'
    ? recentItems
    : recentItems.filter((r) => r.entity === entityFilter);

  const displayed = query.trim() ? results : filteredRecent;
  const isRecent = !query.trim();

  useEffect(() => {
    setSelectedIdx(0);
  }, [displayed.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, displayed.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && displayed[selectedIdx]) {
      const r = displayed[selectedIdx];
      onNavigate(r.entity, r.module, r.id);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const getBadgeStyle = (entity: AppEntity) => ENTITY_META[entity]?.color ?? 'text-slate-600 bg-slate-100';
  const getIcon = (entity: AppEntity) => ENTITY_META[entity]?.icon ?? <Search size={13} />;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" onClick={onClose} />

      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden flex flex-col"
        style={{ maxHeight: 'calc(100vh - 20vh)' }}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          <div className="flex items-center justify-center w-7 h-7 shrink-0">
            {loading
              ? <Loader2 size={15} className="text-blue-500 animate-spin" />
              : <Search size={15} className="text-slate-400" />
            }
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search accounts, contacts, leads, opportunities, tickets…"
            className="flex-1 text-[14px] text-slate-800 placeholder-slate-400 bg-transparent outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded transition"
            >
              <X size={13} />
            </button>
          )}
          <kbd className="hidden sm:flex items-center px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-100 border border-slate-200 rounded">
            ESC
          </kbd>
        </div>

        {/* Entity Filter Bar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-100 bg-slate-50/50">
          <Filter size={10} className="text-slate-400 shrink-0 mr-0.5" />
          {ENTITY_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setEntityFilter(f.key)}
              className={`px-2 py-0.5 text-[11px] font-medium rounded-full transition ${
                entityFilter === f.key
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {displayed.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              {query.trim() ? (
                <>
                  <Search size={22} className="text-slate-300" />
                  <p className="text-[13px] text-slate-400">No results for "<span className="font-medium text-slate-600">{query}</span>"</p>
                  <p className="text-[11px] text-slate-400">Try searching by name, email, or company</p>
                </>
              ) : (
                <>
                  <Clock size={22} className="text-slate-300" />
                  <p className="text-[13px] text-slate-400">No recent records</p>
                </>
              )}
            </div>
          )}

          {displayed.length > 0 && (
            <div className="py-2">
              <p className="px-4 pt-1 pb-1.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                {isRecent
                  ? <><Clock size={9} /> Recent</>
                  : <>Results ({displayed.length})</>
                }
              </p>
              {displayed.map((r, i) => (
                <button
                  key={`${r.entity}-${r.id}`}
                  onClick={() => onNavigate(r.entity, r.module, r.id)}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors duration-100 text-left cursor-pointer ${
                    i === selectedIdx ? 'bg-[#ddeeff]' : 'hover:bg-[#ebf1fa]'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${getBadgeStyle(r.entity)}`}>
                    {getIcon(r.entity)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-800 truncate">
                      {query.trim() ? highlightMatch(r.label, query) : r.label}
                    </p>
                    {r.sublabel && (
                      <p className="text-[11px] text-slate-400 truncate">
                        {query.trim() ? highlightMatch(r.sublabel, query) : r.sublabel}
                      </p>
                    )}
                  </div>

                  <span className={`shrink-0 px-1.5 py-0.5 text-[9px] font-semibold rounded uppercase tracking-wide ${getBadgeStyle(r.entity)}`}>
                    {ENTITY_META[r.entity]?.label}
                  </span>

                  {i === selectedIdx && (
                    <ArrowRight size={12} className="text-blue-500 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-mono">↑↓</kbd>
            <span>Navigate</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-mono">↵</kbd>
            <span>Open</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-mono">ESC</kbd>
            <span>Close</span>
          </div>
          <div className="ml-auto flex items-center gap-2.5 text-[10px] text-slate-400">
            {Object.entries(ENTITY_META).map(([key, meta]) => (
              <span key={key} className="flex items-center gap-1">
                <span className={`inline-flex w-4 h-4 rounded items-center justify-center ${meta.color}`}>{meta.icon}</span>
                {meta.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
