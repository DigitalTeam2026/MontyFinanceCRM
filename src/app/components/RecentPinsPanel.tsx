import { useEffect, useState, useCallback } from 'react';
import { Clock, Star, ChevronDown, ChevronRight, Building2, Users, UserPlus, Target, Ticket, X } from 'lucide-react';
import type { AppEntity, AppModule } from '../types';
import {
  fetchRecentItems,
  fetchPinnedRecords,
  clearRecentItems,
  type RecentItem,
  type PinnedRecord,
} from '../services/recentPinsService';

const ENTITY_ICONS: Record<AppEntity, React.ReactNode> = {
  accounts: <Building2 size={11} />,
  contacts: <Users size={11} />,
  leads: <UserPlus size={11} />,
  opportunities: <Target size={11} />,
  tickets: <Ticket size={11} />,
};

interface RecentPinsPanelProps {
  userId: string;
  onNavigate: (module: AppModule, entity: AppEntity, recordId: string) => void;
  refreshKey?: number;
}

interface SectionProps {
  label: string;
  icon: React.ReactNode;
  items: Array<{ id: string; entity: AppEntity; module: AppModule; record_id: string; record_label: string }>;
  onNavigate: (module: AppModule, entity: AppEntity, recordId: string) => void;
  defaultOpen?: boolean;
  onClear?: () => void;
}

function Section({ label, icon, items, onNavigate, defaultOpen = true, onClear }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase text-[#9ca3af] hover:text-[#374151] transition-colors"
          style={{ letterSpacing: '0.8px' }}
        >
          <span className="text-[#9ca3af]">{icon}</span>
          <span className="flex-1 text-left">{label}</span>
          {open ? <ChevronDown size={10} className="text-[#9ca3af]" /> : <ChevronRight size={10} className="text-[#9ca3af]" />}
        </button>
        {onClear && (
          <button
            onClick={onClear}
            title="Clear recent"
            className="pr-3 pl-1 py-1.5 text-[#9ca3af] hover:text-[#374151] transition-colors"
          >
            <X size={11} />
          </button>
        )}
      </div>

      {open && (
        <div className="pb-1">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.module, item.entity, item.record_id)}
              title={item.record_label}
              className="w-full flex items-center gap-2 text-[11px] text-[#374151] transition-colors group"
              style={{ padding: '4px 14px' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#eceef1';
                e.currentTarget.style.color = '#1f2937';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#374151';
              }}
            >
              <span className="text-[#9ca3af] shrink-0">
                {ENTITY_ICONS[item.entity]}
              </span>
              <span className="truncate text-left">{item.record_label || item.record_id}</span>
              <span className="ml-auto text-[9px] text-[#9ca3af] shrink-0 capitalize">{item.entity.slice(0, 4)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RecentPinsPanel({ userId, onNavigate, refreshKey }: RecentPinsPanelProps) {
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [pinned, setPinned] = useState<PinnedRecord[]>([]);

  const load = useCallback(async () => {
    const [r, p] = await Promise.all([
      fetchRecentItems(userId),
      fetchPinnedRecords(userId),
    ]);
    setRecent(r);
    setPinned(p);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const handleClearRecent = useCallback(async () => {
    await clearRecentItems(userId);
    setRecent([]);
  }, [userId]);

  if (recent.length === 0 && pinned.length === 0) return null;

  return (
    <div className="pt-1 space-y-0.5" style={{ borderTop: '1px solid var(--border)' }}>
      <Section
        label="Pinned"
        icon={<Star size={10} />}
        items={pinned}
        onNavigate={onNavigate}
        defaultOpen={true}
      />
      <Section
        label="Recent"
        icon={<Clock size={10} />}
        items={recent}
        onNavigate={onNavigate}
        defaultOpen={true}
        onClear={handleClearRecent}
      />
    </div>
  );
}
