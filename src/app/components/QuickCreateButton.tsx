import { Plus, UserPlus, Target, Ticket } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type QuickCreateType = 'lead' | 'opportunity' | 'ticket';

interface QuickCreateButtonProps {
  onSelect: (type: QuickCreateType) => void;
}

const ITEMS: { type: QuickCreateType; label: string; icon: React.ReactNode; color: string }[] = [
  { type: 'lead',        label: 'Lead',        icon: <UserPlus size={13} />, color: 'text-emerald-600' },
  { type: 'opportunity', label: 'Opportunity',  icon: <Target size={13} />,  color: 'text-[var(--navy-accent)]' },
  { type: 'ticket',      label: 'Ticket',       icon: <Ticket size={13} />,  color: 'text-amber-600' },
];

export default function QuickCreateButton({ onSelect }: QuickCreateButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-[30px] h-[30px] flex items-center justify-center rounded-sm text-[#7a8ca8] hover:text-white transition-colors"
        title="Quick Create"
        onMouseEnter={(e) => { e.currentTarget.style.background = '#15294a'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <Plus size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-lg shadow-xl py-1 z-50" style={{ border: '1px solid var(--border)' }}>
          <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-400)]">
            Quick Create
          </p>
          {ITEMS.map((item) => (
            <button
              key={item.type}
              onClick={() => { setOpen(false); onSelect(item.type); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--ink-700)] hover:bg-[var(--ink-50)] transition"
            >
              <span className={item.color}>{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
