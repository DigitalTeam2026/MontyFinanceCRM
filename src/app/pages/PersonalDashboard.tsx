import { useState, useEffect } from 'react';
import { ChevronDown, Briefcase, TrendingUp, Zap, Users, User, Package, Loader2, X, InboxIcon } from 'lucide-react';
import type { AppEntity } from '../types';
import { supabase } from '../../lib/supabase';

interface EntityCard {
  id: string;
  entity: AppEntity;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  count: number;
  countLoading: boolean;
  color: string;
  lightColor: string;
  hoverColor: string;
}

interface ExpandedState {
  cardId: string;
  itemsLoading: boolean;
  items: Record<string, unknown>[];
  selectedStatus?: string;
}

const ENTITY_CARDS: Omit<EntityCard, 'count' | 'countLoading'>[] = [
  {
    id: 'my-accounts',
    entity: 'accounts',
    label: 'My Accounts',
    shortLabel: 'Accounts',
    icon: <Briefcase size={24} />,
    color: '#0078D4',
    lightColor: '#E7F3FF',
    hoverColor: '#106EBE',
  },
  {
    id: 'my-leads',
    entity: 'leads',
    label: 'My Leads',
    shortLabel: 'Leads',
    icon: <TrendingUp size={24} />,
    color: '#FFB900',
    lightColor: '#FFF4CE',
    hoverColor: '#D99E00',
  },
  {
    id: 'my-opportunities',
    entity: 'opportunities',
    label: 'My Opportunities',
    shortLabel: 'Opportunities',
    icon: <Zap size={24} />,
    color: '#107C10',
    lightColor: '#E7F5E1',
    hoverColor: '#0B6A0B',
  },
  {
    id: 'my-contacts',
    entity: 'contacts',
    label: 'My Contacts',
    shortLabel: 'Contacts',
    icon: <Users size={24} />,
    color: '#8764B8',
    lightColor: '#F3F0FF',
    hoverColor: '#6B5B95',
  },
  {
    id: 'products',
    entity: 'product',
    label: 'Products/Services',
    shortLabel: 'Products',
    icon: <Package size={24} />,
    color: '#DA3B01',
    lightColor: '#FFE7DB',
    hoverColor: '#B52E00',
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
    { key: 'account_name', label: 'Account Name' },
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
    { key: 'topic', label: 'Opportunity' },
    { key: 'stage', label: 'Stage' },
    { key: 'estimated_value', label: 'Value' },
  ],
  contacts: [
    { key: 'first_name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'job_title', label: 'Title' },
  ],
  product: [
    { key: 'name', label: 'Product Name' },
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

const STATUS_FILTERS: Record<AppEntity, string[]> = {
  leads: ['Open', 'Qualified', 'Disqualified'],
  opportunities: ['Open', 'Closed Won', 'Closed Lost'],
  accounts: [],
  contacts: [],
  product: [],
  tickets: [],
  product_family: [],
};

interface PersonalDashboardProps {
  userId: string;
}

export default function PersonalDashboard({ userId }: PersonalDashboardProps) {
  const [entityCards, setEntityCards] = useState<EntityCard[]>([]);
  const [expandedCard, setExpandedCard] = useState<ExpandedState | null>(null);

  useEffect(() => {
    const initCards = ENTITY_CARDS.map((cfg) => ({
      ...cfg,
      count: 0,
      countLoading: true,
    }));
    setEntityCards(initCards);
    loadCardCounts();
  }, [userId]);

  const loadCardCounts = async () => {
    try {
      const counts: Record<string, number> = {};

      for (const cfg of ENTITY_CARDS) {
        const table = TABLE_MAP[cfg.entity];
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('owner_id', userId);

        if (!error) {
          counts[cfg.id] = count || 0;
        }
      }

      setEntityCards((prev) =>
        prev.map((card) => ({
          ...card,
          count: counts[card.id] || 0,
          countLoading: false,
        }))
      );
    } catch (error) {
      console.error('Error loading card counts:', error);
      setEntityCards((prev) => prev.map((card) => ({ ...card, countLoading: false })));
    }
  };

  const loadCardItems = async (cardId: string) => {
    const card = entityCards.find((c) => c.id === cardId);
    if (!card) return;

    try {
      const table = TABLE_MAP[card.entity];
      let query = supabase
        .from(table)
        .select('*')
        .eq('owner_id', userId)
        .limit(100)
        .order('created_at', { ascending: false });

      if (expandedCard?.cardId === cardId && expandedCard.selectedStatus) {
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
      console.error('Error loading card items:', error);
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

  const handleStatusFilter = (status: string) => {
    if (expandedCard) {
      const newStatus = expandedCard.selectedStatus === status ? undefined : status;
      setExpandedCard((prev) =>
        prev ? { ...prev, selectedStatus: newStatus, itemsLoading: true, items: [] } : null
      );

      if (expandedCard.cardId) {
        setTimeout(() => {
          loadCardItemsWithStatus(expandedCard.cardId, newStatus);
        }, 0);
      }
    }
  };

  const loadCardItemsWithStatus = async (cardId: string, status?: string) => {
    const card = entityCards.find((c) => c.id === cardId);
    if (!card) return;

    try {
      const table = TABLE_MAP[card.entity];
      let query = supabase
        .from(table)
        .select('*')
        .eq('owner_id', userId)
        .limit(100)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('state_code', status);
      }

      const { data, error } = await query;

      if (!error) {
        setExpandedCard((prev) =>
          prev && prev.cardId === cardId
            ? { ...prev, itemsLoading: false, items: data || [], selectedStatus: status }
            : null
        );
      }
    } catch (error) {
      console.error('Error loading items:', error);
      setExpandedCard((prev) => (prev ? { ...prev, itemsLoading: false } : null));
    }
  };

  const getDisplayValue = (item: Record<string, unknown>, key: string): string => {
    const value = item[key];
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') {
      return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
      });
    }
    return String(value);
  };

  const renderEmptyState = (card: EntityCard) => (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 24px',
        color: 'var(--muted)',
      }}
    >
      <InboxIcon size={48} style={{ color: card.color, opacity: 0.2, margin: '0 auto 16px', display: 'block' }} />
      <p style={{ fontSize: '14px', fontWeight: '500', margin: '0 0 8px 0', color: 'var(--text)' }}>
        No {card.shortLabel.toLowerCase()} found
      </p>
      <p style={{ fontSize: '12px', margin: 0, color: 'var(--muted)' }}>
        {expandedCard?.selectedStatus
          ? `No records with status "${expandedCard.selectedStatus}"`
          : 'Create records to see them here'}
      </p>
    </div>
  );

  const renderTable = (items: Record<string, unknown>[], card: EntityCard) => {
    const columns = DISPLAY_COLUMNS[card.entity] || [];

    if (items.length === 0) {
      return renderEmptyState(card);
    }

    return (
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '13px',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: 'left',
                    padding: '12px 16px',
                    fontWeight: '600',
                    fontSize: '13px',
                    color: 'var(--text)',
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr
                key={idx}
                style={{
                  borderBottom: '1px solid var(--border)',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'var(--surface-2)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent';
                }}
              >
                {columns.map((col) => (
                  <td
                    key={`${idx}-${col.key}`}
                    style={{
                      padding: '12px 16px',
                      color: 'var(--text)',
                    }}
                  >
                    {getDisplayValue(item, col.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        backgroundColor: 'var(--surface-2)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '24px 32px',
          backgroundColor: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <h1 style={{ fontSize: '28px', fontWeight: '600', color: 'var(--text)', margin: '0 0 8px 0' }}>
          Dashboard
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--muted)', margin: 0 }}>
          Track your sales pipeline and key metrics at a glance
        </p>
      </div>

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px',
        }}
      >
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
          {/* KPI Cards Section */}
          <div style={{ marginBottom: '32px' }}>
            <h2
              style={{
                fontSize: '16px',
                fontWeight: '600',
                color: 'var(--text)',
                marginBottom: '16px',
                margin: '0 0 16px 0',
              }}
            >
              My Records
            </h2>

            {/* Horizontal Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px',
                marginBottom: '24px',
              }}
            >
              {entityCards.map((card) => {
                const isExpanded = expandedCard?.cardId === card.id;

                return (
                  <button
                    key={card.id}
                    onClick={() => handleCardClick(card.id)}
                    style={{
                      background: card.lightColor,
                      border: `1px solid ${isExpanded ? card.color : 'var(--border)'}`,
                      borderRadius: '8px',
                      padding: '16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      textAlign: 'left',
                      boxShadow: isExpanded
                        ? `0 2px 8px rgba(0, 0, 0, 0.1), 0 0 0 2px ${card.lightColor}`
                        : '0 1px 3px rgba(0, 0, 0, 0.08)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isExpanded) {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = card.lightColor;
                        (e.currentTarget as HTMLButtonElement).style.borderColor = card.color;
                        (e.currentTarget as HTMLButtonElement).style.boxShadow =
                          '0 2px 8px rgba(0, 0, 0, 0.12)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isExpanded) {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = card.lightColor;
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                        (e.currentTarget as HTMLButtonElement).style.boxShadow =
                          '0 1px 3px rgba(0, 0, 0, 0.08)';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <div
                        style={{
                          padding: '10px',
                          borderRadius: '6px',
                          background: card.color,
                          color: 'var(--surface)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {card.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <h3
                          style={{
                            fontSize: '14px',
                            fontWeight: '600',
                            color: 'var(--text)',
                            margin: 0,
                          }}
                        >
                          {card.shortLabel}
                        </h3>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 4px 0' }}>
                          Records
                        </p>
                        <p
                          style={{
                            fontSize: '28px',
                            fontWeight: '700',
                            color: card.color,
                            margin: 0,
                          }}
                        >
                          {card.countLoading ? (
                            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                          ) : (
                            card.count
                          )}
                        </p>
                      </div>
                      <ChevronDown
                        size={18}
                        style={{
                          color: card.color,
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.3s ease',
                          flexShrink: 0,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expanded Content */}
          {expandedCard && (
            <div
              style={{
                backgroundColor: 'var(--surface)',
                borderRadius: '8px',
                border: `1px solid var(--border)`,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                overflow: 'hidden',
                animation: 'slideDown 0.3s ease',
              }}
            >
              {/* Card Header */}
              <div
                style={{
                  padding: '16px 24px',
                  borderBottom: `1px solid var(--border)`,
                  backgroundColor: 'var(--surface-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', margin: 0 }}>
                  {entityCards.find((c) => c.id === expandedCard.cardId)?.label || 'Records'}
                </h3>
                <button
                  onClick={() => setExpandedCard(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--muted)',
                    fontSize: '20px',
                    padding: '4px 8px',
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Status Filters */}
              {(() => {
                const card = entityCards.find((c) => c.id === expandedCard.cardId);
                const statusOptions = card ? STATUS_FILTERS[card.entity] : [];

                return statusOptions.length > 0 ? (
                  <div
                    style={{
                      padding: '16px 24px',
                      borderBottom: `1px solid var(--border)`,
                      backgroundColor: 'var(--surface-2)',
                    }}
                  >
                    <p
                      style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: 'var(--text)',
                        marginBottom: '12px',
                        margin: '0 0 12px 0',
                      }}
                    >
                      Filter by Status
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {statusOptions.map((status) => (
                        <button
                          key={status}
                          onClick={() => handleStatusFilter(status)}
                          style={{
                            padding: '6px 16px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '500',
                            border:
                              expandedCard.selectedStatus === status
                                ? `2px solid ${card?.color}`
                                : `1px solid var(--border)`,
                            background:
                              expandedCard.selectedStatus === status
                                ? card?.color
                                : 'var(--surface)',
                            color:
                              expandedCard.selectedStatus === status
                                ? 'var(--surface)'
                                : 'var(--text)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (expandedCard.selectedStatus !== status) {
                              (e.currentTarget as HTMLButtonElement).style.borderColor =
                                card?.color;
                              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                                card?.lightColor;
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (expandedCard.selectedStatus !== status) {
                              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                              (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--surface)';
                            }
                          }}
                        >
                          {status}
                        </button>
                      ))}
                      {expandedCard.selectedStatus && (
                        <button
                          onClick={() => handleStatusFilter('')}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            cursor: 'pointer',
                            color: 'var(--muted)',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Table Content */}
              <div
                style={{
                  maxHeight: '500px',
                  overflowY: 'auto',
                  padding: '0',
                }}
              >
                {expandedCard.itemsLoading ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '48px 24px',
                    }}
                  >
                    <Loader2
                      size={24}
                      style={{
                        color: entityCards.find((c) => c.id === expandedCard.cardId)?.color,
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                  </div>
                ) : (
                  (() => {
                    const card = entityCards.find((c) => c.id === expandedCard.cardId);
                    return card ? renderTable(expandedCard.items, card) : null;
                  })()
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        /* Custom scrollbar */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: #C8C6C4;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #A6A6A6;
        }
      `}</style>
    </div>
  );
}
