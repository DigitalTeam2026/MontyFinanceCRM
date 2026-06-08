import { ChevronRight } from 'lucide-react';

interface StudioHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  actions?: React.ReactNode;
}

export default function StudioHeader({ title, subtitle, onBack, backLabel, actions }: StudioHeaderProps) {
  return (
    <div className="h-11 bg-white border-b border-slate-200 px-5 flex items-center gap-2 shrink-0">
      {onBack && (
        <>
          <button
            onClick={onBack}
            className="text-[12px] text-blue-600 hover:text-blue-700 font-medium transition-colors whitespace-nowrap"
          >
            {backLabel ?? 'Back'}
          </button>
          <ChevronRight size={11} className="text-slate-400 shrink-0" />
        </>
      )}
      <div className="flex-1 min-w-0 flex items-baseline gap-2.5">
        <h1 className="text-[13px] font-semibold text-slate-800 truncate leading-none">{title}</h1>
        {subtitle && (
          <p className="text-[11px] text-slate-400 truncate hidden sm:block">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
