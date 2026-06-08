import { Pencil, UserCheck, Bell, FilePlus, GitBranch, Clock, Globe } from 'lucide-react';
import type { WorkflowStepType } from '../../types/workflow';
import { STEP_META as _STEP_META } from '../../types/workflow';

export { STEP_META } from '../../types/workflow';

export const STEP_ICONS_MAP: Record<WorkflowStepType, React.ReactNode> = {
  update_record:     <Pencil size={14} />,
  assign_record:     <UserCheck size={14} />,
  send_notification: <Bell size={14} />,
  create_record:     <FilePlus size={14} />,
  condition:         <GitBranch size={14} />,
  wait:              <Clock size={14} />,
  webhook:           <Globe size={14} />,
};
