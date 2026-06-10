import { Search, Bell } from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { AppEntity, AppModule } from '../types';
import { useNotifications } from '../context/NotificationContext';
import { getInitials } from '../utils/initials';
import NotificationPanel from './NotificationPanel';

const ENTITY_META: Record<AppEntity, { label: string; plural: string }> = {
  accounts:      { label: 'Account',     plural: 'Accounts' },
  contacts:      { label: 'Contact',     plural: 'Contacts' },
  leads:         { label: 'Lead',        plural: 'Leads' },
  opportunities: { label: 'Opportunity', plural: 'Opportunities' },
  tickets:       { label: 'Ticket',      plural: 'Tickets' },
};

const MODULE_LABELS: Record<AppModule, string> = {
  sales:     'Sales',
  marketing: 'Marketing',
  support:   'Support',
};

interface AppHeaderProps {
  module: AppModule;
  entity: AppEntity;
  search: string;
  onSearchChange: (v: string) => void;
  onGlobalSearch?: () => void;
  onNotificationNavigate?: (module: AppModule, entity: AppEntity, id: string) => void;
  /** Logged-in user's display name + email — used for the avatar initials. */
  userName?: string;
  userEmail?: string;
}

export default function AppHeader({
  module, entity, search, onSearchChange, onGlobalSearch, onNotificationNavigate,
  userName, userEmail,
}: AppHeaderProps) {
  const fallbackLabel = entity.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const meta = ENTITY_META[entity] ?? { label: fallbackLabel, plural: fallbackLabel };
  const { unreadCount } = useNotifications();
  const [draft, setDraft] = useState(search);
  const [notifOpen, setNotifOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft('');
  }, [entity]);

  const handleChange = (v: string) => {
    setDraft(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => onSearchChange(v), 320);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === '/' && !draft) {
      e.preventDefault();
      onGlobalSearch?.();
    }
  };

  const handleNotifNavigate = useCallback((m: AppModule, ent: AppEntity, id: string) => {
    setNotifOpen(false);
    onNotificationNavigate?.(m, ent, id);
  }, [onNotificationNavigate]);

  return (
    <header className="h-[44px] flex items-center px-4 gap-3 shrink-0 relative" style={{ background: 'var(--sidebar-bg)' }}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 min-w-0 shrink-0">
        <span className="text-[11px] text-white/50 font-medium">
          {MODULE_LABELS[module]}
        </span>
        <span className="text-white/25 text-[11px]">/</span>
        <h1 className="text-[13px] font-semibold text-white truncate">{meta.plural}</h1>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 flex-1 justify-center">
        <div className="relative w-full max-w-[520px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={`Search ${meta.plural.toLowerCase()}...`}
            className="w-full h-[28px] pl-8 pr-3 text-[12px] rounded text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-[#3b82f6] focus:border-[#3b82f6] transition"
            style={{ background: 'var(--header-input-bg)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--header-input-border)' }}
          />
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Env pill */}
        <span
          className="px-2 py-0.5 text-[10px] font-semibold text-white/70 rounded"
          style={{ background: 'var(--header-input-bg)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--header-input-border)' }}
        >
          PROD
        </span>

        {onGlobalSearch && (
          <button
            onClick={onGlobalSearch}
            title="Global search (Ctrl+K)"
            className="w-[30px] h-[30px] flex items-center justify-center rounded-sm text-white/50 hover:text-white transition-colors"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--header-hover-bg)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <Search size={14} />
          </button>
        )}


        {/* Notification bell */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className={`relative w-[30px] h-[30px] flex items-center justify-center rounded-sm transition-colors ${
              notifOpen
                ? 'text-white'
                : 'text-white/50 hover:text-white'
            }`}
            title="Notifications"
            style={notifOpen ? { background: 'var(--header-hover-bg)' } : undefined}
            onMouseEnter={(e) => { if (!notifOpen) e.currentTarget.style.background = 'var(--header-hover-bg)'; }}
            onMouseLeave={(e) => { if (!notifOpen) e.currentTarget.style.background = 'transparent'; }}
          >
            <Bell size={14} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center text-[8px] font-bold text-white bg-[#e04040] rounded-full">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <NotificationPanel
              onClose={() => setNotifOpen(false)}
              onNavigate={handleNotifNavigate}
            />
          )}
        </div>

        {/* Avatar — initials from the logged-in user's display name */}
        <div
          className="w-6 h-6 rounded-full bg-[#2b6cb0] flex items-center justify-center shrink-0 ml-1"
          title={userName || userEmail || 'User'}
        >
          <span className="text-[9px] font-bold text-white">
            {getInitials(userName, userEmail)}
          </span>
        </div>
      </div>
    </header>
  );
}
