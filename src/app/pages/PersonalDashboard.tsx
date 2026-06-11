import { useState, useEffect } from 'react';
import { ChevronDown, Users, TrendingUp, User, Briefcase, Package, Loader2, X } from 'lucide-react';
import type { AppEntity } from '../types';
import { supabase } from '../../lib/supabase';

interface DashboardCard {
  id: string;
  entity: AppEntity;
  label: string;
  icon: React.ReactNode;
  count: number;
  countLoading: boolean;
  color: string;
  accentColor: string;
  gradientFrom: string;
  gradientTo: string;
}

interface ExpandedCardState {
  cardId: string;
  itemsLoading: boolean;
  items: Record<string, unknown>[];
  selectedStatus?: string;
}

const CARD_CONFIG: Omit<DashboardCard, 'count' | 'countLoading'>[] = [
  {
    id: 'my-accounts',
    entity: 'accounts',
    label: 'My Accounts',
    icon: <Briefcase size={24} />,
    color: '#2563eb',
    accentColor: '#1e40af',
    gradientFrom: 'from-blue-50',
    gradientTo: 'to-blue-100',
  },
  {
    id: 'my-leads',
    entity: 'leads',
    label: 'My Leads',
    icon: <TrendingUp size={24} />,
    color: '#f59e0b',
    accentColor: '#d97706',
    gradientFrom: 'from-amber-50',
    gradientTo: 'to-amber-100',
  },
  {
    id: 'my-opportunities',
    entity: 'opportunities',
    label: 'My Opportunities',
    icon: <Users size={24} />,
    color: '#10b981',
    accentColor: '#059669',
    gradientFrom: 'from-emerald-50',
    gradientTo: 'to-emerald-100',
  },
  {
    id: 'my-contacts',
    entity: 'contacts',
    label: 'My Contacts',
    icon: <User size={24} />,
    color: '#8b5cf6',
    accentColor: '#7c3aed',
    gradientFrom: 'from-violet-50',
    gradientTo: 'to-violet-100',
  },
  {
    id: 'products',
    entity: 'product',
    label: 'Products/Services',
    icon: <Package size={24} />,
    color: '#ec4899',
    accentColor: '#be185d',
    gradientFrom: 'from-pink-50',
    gradientTo: 'to-pink-100',
  },
];

const TABLE_MAP: Record<AppEntity, string> = {
  accounts: 'account',
  contacts: 'contact',
  leads: 'lead',
  opportunities: 'opportunity',
  tickets: 'ticket',
  product_family: 'product_family',
  product: 'product',
};

const DISPLAY_COLUMNS: Record<AppEntity, { key: string; label: string }[]> = {
  accounts: [
    { key: 'account_name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'website', label: 'Website' },
  ],
  leads: [
    { key: 'first_name', label: 'Name' },
    { key: 'company_name', label: 'Company' },
    { key: 'email', label: 'Email' },
    { key: 'state_code', label: 'Status' },
  ],
  opportunities: [
    { key: 'topic', label: 'Name' },
    { key: 'stage', label: 'Stage' },
    { key: 'estimated_value', label: 'Value' },
  ],
  contacts: [
    { key: 'first_name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'job_title', label: 'Job Title' },
  ],
  product: [
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code' },
  ],
  tickets: [
    { key: 'title', label: 'Subject' },
    { key: 'priority', label: 'Priority' },
  ],
  product_family: [
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code' },
  ],
};

interface PersonalDashboardProps {
  userId: string;
}

export default function PersonalDashboard({ userId }: PersonalDashboardProps) {
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [expandedCard, setExpandedCard] = useState<ExpandedCardState | null>(null);

  useEffect(() => {
    const initCards = CARD_CONFIG.map((cfg) => ({
      ...cfg,
      count: 0,
      countLoading: true,
    }));
    setCards(initCards);
    loadCounts();
  }, [userId]);

  const loadCounts = async () => {
    try {
      const counts: Record<string, number> = {};

      for (const cfg of CARD_CONFIG) {
        const table = TABLE_MAP[cfg.entity];
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('owner_id', userId);

        if (!error) {
          counts[cfg.id] = count || 0;
        }
      }

      setCards((prev) =>
        prev.map((card) => ({
          ...card,
          count: counts[card.id] || 0,
          countLoading: false,
        }))
      );
    } catch (error) {
      console.error('Error loading dashboard counts:', error);
      setCards((prev) => prev.map((card) => ({ ...card, countLoading: false })));
    }
  };

  const loadCardItems = async (cardId: string) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    try {
      const table = TABLE_MAP[card.entity];
      let query = supabase.from(table).select('*').eq('owner_id', userId).limit(50);

      if (card.entity === 'leads' && expandedCard?.cardId === cardId && expandedCard.selectedStatus) {
        query = query.eq('state_code', expandedCard.selectedStatus);
      }

      const { data, error } = await query;

      if (!error) {
        setExpandedCard({
          cardId,
          itemsLoading: false,
          items: data || [],
          selectedStatus: expandedCard?.cardId === cardId ? expandedCard.selectedStatus : undefined,
        });
      }
    } catch (error) {
      console.error('Error loading items:', error);
      setExpandedCard((prev) => (prev ? { ...prev, itemsLoading: false } : null));
    }
  };

  const handleCardClick = (cardId: string) => {
    if (expandedCard?.cardId === cardId) {
      setExpandedCard(null);
    } else {
      setExpandedCard({ cardId, itemsLoading: true, items: [] });
      loadCardItems(cardId);
    }
  };

  const handleLeadStatusFilter = (status: string) => {
    if (expandedCard?.cardId === 'my-leads') {
      setExpandedCard((prev) =>
        prev ? { ...prev, selectedStatus: prev.selectedStatus === status ? undefined : status, itemsLoading: true, items: [] } : null
      );
      const card = cards.find((c) => c.id === 'my-leads');
      if (card) {
        loadCardItems('my-leads');
      }
    }
  };

  const getDisplayValue = (item: Record<string, unknown>, key: string): string => {
    const value = item[key];
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') return value.toLocaleString();
    return String(value);
  };

  return (
    <div className="flex-1 overflow-auto flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="shrink-0 px-8 py-6 border-b" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--ink-900)' }}>
          Personal Dashboard
        </h1>
        <p className="text-sm mt-2" style={{ color: 'var(--ink-500)' }}>
          Click on any card to view your records
        </p>
      </div>

      {/* Cards Container */}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-5xl mx-auto space-y-4">
          {cards.map((card) => {
            const isExpanded = expandedCard?.cardId === card.id;
            const columns = DISPLAY_COLUMNS[card.entity] || [];

            return (
              <div key={card.id}>
                {/* Card Header */}
                <button
                  onClick={() => handleCardClick(card.id)}
                  className="w-full text-left transition-all duration-200"
                  style={{
                    background: isExpanded
                      ? `linear-gradient(135deg, ${card.color}15 0%, ${card.color}08 100%)`
                      : 'var(--surface)',
                    borderRadius: '12px',
                    border: `2px solid ${isExpanded ? card.color : 'var(--border)'}`,
                    padding: '24px',
                    boxShadow: isExpanded ? `0 8px 24px ${card.color}15` : '0 1px 3px rgba(0,0,0,0.08)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className="p-3 rounded-lg transition-transform duration-200"
                        style={{
                          background: `${card.color}15`,
                          color: card.color,
                          transform: isExpanded ? 'scale(1.1)' : 'scale(1)',
                        }}
                      >
                        {card.icon}
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold" style={{ color: 'var(--ink-900)' }}>
                          {card.label}
                        </h2>
                        <p className="text-sm mt-1" style={{ color: 'var(--ink-500)' }}>
                          {card.countLoading ? (
                            <Loader2 size={14} className="inline animate-spin" />
                          ) : (
                            <>
                              {card.count} {card.count === 1 ? 'item' : 'items'}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div
                        className="text-3xl font-bold"
                        style={{ color: card.color }}
                      >
                        {card.countLoading ? <Loader2 size={20} className="animate-spin" /> : card.count}
                      </div>
                      <ChevronDown
                        size={20}
                        style={{
                          color: card.color,
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.3s ease',
                        }}
                      />
                    </div>
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div
                    className="mt-4 rounded-lg p-6 border"
                    style={{
                      background: 'var(--surface)',
                      borderColor: card.color,
                      borderTop: `4px solid ${card.color}`,
                    }}
                  >
                    {/* Status Filter for Leads */}
                    {card.entity === 'leads' && (
                      <div className="mb-6 pb-6" style={{ borderBottom: '1px solid var(--border)' }}>
                        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--ink-700)' }}>
                          Filter by Status:
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          {['Open', 'Qualified', 'Disqualified'].map((status) => (
                            <button
                              key={status}
                              onClick={() => handleLeadStatusFilter(status)}
                              className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                              style={{
                                background:
                                  expandedCard?.selectedStatus === status
                                    ? card.color
                                    : `${card.color}10`,
                                color:
                                  expandedCard?.selectedStatus === status
                                    ? '#ffffff'
                                    : card.color,
                                border: `1px solid ${expandedCard?.selectedStatus === status ? 'transparent' : card.color}`,
                              }}
                            >
                              {status}
                            </button>
                          ))}
                          {expandedCard?.selectedStatus && (
                            <button
                              onClick={() => handleLeadStatusFilter('')}
                              className="px-3 py-2 rounded-lg text-sm transition-colors"
                              style={{
                                background: 'var(--bg)',
                                color: 'var(--ink-500)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Items List */}
                    {expandedCard.itemsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 size={24} className="animate-spin" style={{ color: card.color }} />
                      </div>
                    ) : expandedCard.items.length === 0 ? (
                      <div className="py-12 text-center">
                        <p style={{ color: 'var(--ink-500)' }}>
                          No {card.label.toLowerCase()} found
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)' }}>
                              {columns.map((col) => (
                                <th
                                  key={col.key}
                                  className="text-left py-3 px-4 font-semibold"
                                  style={{ color: 'var(--ink-700)' }}
                                >
                                  {col.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {expandedCard.items.map((item, idx) => (
                              <tr
                                key={idx}
                                style={{
                                  borderBottom: '1px solid var(--divider)',
                                  background: idx % 2 === 0 ? 'transparent' : 'var(--bg)',
                                  transition: 'background-color 0.2s',
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLTableRowElement).style.background = `${card.color}08`;
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? 'transparent' : 'var(--bg)';
                                }}
                              >
                                {columns.map((col) => (
                                  <td
                                    key={`${idx}-${col.key}`}
                                    className="py-3 px-4"
                                    style={{ color: 'var(--ink-600)' }}
                                  >
                                    {getDisplayValue(item as Record<string, unknown>, col.key)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
