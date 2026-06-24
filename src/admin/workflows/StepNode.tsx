import {
  Pencil,
  Trash2,
  Plus,
  Settings,
  AlertTriangle,
  Clock,
  Bell,
  Globe,
  GitBranch,
  UserCheck,
  FilePlus,
} from 'lucide-react';
import type { WorkflowStep, WorkflowStepType } from '../../types/workflow';
import { STEP_META } from '../../types/workflow';

const STEP_ICONS: Record<WorkflowStepType, React.ReactNode> = {
  update_record:     <Pencil size={14} />,
  assign_record:     <UserCheck size={14} />,
  send_notification: <Bell size={14} />,
  create_record:     <FilePlus size={14} />,
  delete_record:     <Trash2 size={14} />,
  condition:         <GitBranch size={14} />,
  wait:              <Clock size={14} />,
  webhook:           <Globe size={14} />,
};

interface StepNodeProps {
  step: WorkflowStep;
  index: number;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  hasError?: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onAddAfter: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export default function StepNode({
  step,
  index,
  isSelected,
  isFirst,
  isLast,
  hasError,
  onSelect,
  onDelete,
  onAddAfter,
  onMoveUp,
  onMoveDown,
}: StepNodeProps) {
  const meta = STEP_META[step.step_type];
  const isCondition = step.step_type === 'condition';
  const displayName = step.label || step.name;
  const desc = getStepSummary(step);

  return (
    <div className="relative flex flex-col items-center">
      <div
        onClick={onSelect}
        className={`w-72 rounded-2xl border-2 cursor-pointer transition-all select-none shadow-sm hover:shadow-md ${
          isSelected
            ? `${meta.bg} border-current ring-2 ring-offset-2 ring-blue-400 shadow-md`
            : `bg-white border-slate-200 hover:border-slate-300`
        } ${hasError ? 'border-red-400 ring-2 ring-red-200' : ''}`}
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl border ${isSelected ? meta.bg : 'bg-slate-50 border-slate-200'} shrink-0`}>
              <span className={isSelected ? meta.color : 'text-slate-500'}>
                {STEP_ICONS[step.step_type]}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                  isSelected ? meta.color + ' ' + meta.bg : 'text-slate-500 bg-slate-100'
                }`}>
                  {meta.group}
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                {desc || meta.desc}
              </p>
            </div>
            {hasError && <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />}
          </div>
        </div>

        <div className={`flex items-center justify-between px-4 py-2 border-t ${
          isSelected ? 'border-current/10' : 'border-slate-100'
        }`}>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
              disabled={isFirst}
              className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-slate-500 disabled:opacity-20 transition-colors"
              title="Move up"
            >
              ↑
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
              disabled={isLast}
              className="w-6 h-6 flex items-center justify-center text-slate-300 hover:text-slate-500 disabled:opacity-20 transition-colors"
              title="Move down"
            >
              ↓
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(); }}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg transition-colors ${
                isSelected
                  ? `${meta.color} ${meta.bg}`
                  : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
              }`}
            >
              <Settings size={9} />
              Configure
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 text-slate-300 hover:text-red-500 transition-colors"
              title="Delete step"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        {isCondition && (
          <div className="px-4 pb-3 flex gap-2">
            <div className="flex-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 text-center">
              True path →
            </div>
            <div className="flex-1 text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-center">
              False path →
            </div>
          </div>
        )}
      </div>

      {!isLast && (
        <div className="flex flex-col items-center my-1 relative group">
          <div className="w-px h-6 bg-slate-200" />
          <button
            onClick={(e) => { e.stopPropagation(); onAddAfter(); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-sm hover:bg-blue-700"
            title="Add step here"
          >
            <Plus size={11} />
          </button>
          <div className="w-2 h-2 rotate-45 border-r-2 border-b-2 border-slate-300 -mt-0.5" />
        </div>
      )}
    </div>
  );
}

function getStepSummary(step: WorkflowStep): string {
  const cfg = step.config_json as Record<string, unknown>;
  switch (step.step_type) {
    case 'update_record': {
      const updates = cfg.field_updates as Array<{ field_display_name: string; value: string }> | undefined;
      if (updates?.length) {
        return `Update ${updates.length} field${updates.length !== 1 ? 's' : ''}: ${updates.slice(0, 2).map((u) => u.field_display_name).join(', ')}${updates.length > 2 ? '...' : ''}`;
      }
      return '';
    }
    case 'assign_record': {
      const to = cfg.assign_to as string | undefined;
      if (to === 'user') return 'Assign to specific user';
      if (to === 'team') return 'Assign to team';
      if (to === 'field_value') return `Assign from field: ${cfg.field_ref ?? ''}`;
      return '';
    }
    case 'send_notification': {
      const channel = cfg.channel as string | undefined;
      const recips = cfg.recipients as Array<{ label: string }> | undefined;
      if (channel && recips?.length) {
        return `${channel === 'in_app' ? 'In-app' : 'Email'} to ${recips.map((r) => r.label).join(', ')}`;
      }
      return '';
    }
    case 'create_record': {
      const entity = cfg.target_entity_display_name as string | undefined;
      return entity ? `Create ${entity}` : '';
    }
    case 'condition': {
      const conds = cfg.conditions as Array<unknown> | undefined;
      return conds?.length ? `${conds.length} condition${conds.length !== 1 ? 's' : ''}` : '';
    }
    case 'wait': {
      const wt = cfg.wait_type as string | undefined;
      if (wt === 'duration') {
        return `Wait ${cfg.duration_value ?? ''} ${cfg.duration_unit ?? ''}`;
      }
      if (wt === 'until_field') return `Wait until field: ${cfg.field_ref ?? ''}`;
      return '';
    }
    case 'webhook': {
      const url = cfg.url as string | undefined;
      return url ? `${cfg.method ?? 'POST'} ${url.replace(/^https?:\/\//, '').slice(0, 40)}...` : '';
    }
    default:
      return '';
  }
}

export { STEP_ICONS };
