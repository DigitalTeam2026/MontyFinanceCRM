import { Plus } from 'lucide-react';
import type { WorkflowStep, WorkflowStepType } from '../../types/workflow';
import type { FieldDefinition } from '../../types/field';
import StepNode from './StepNode';
import StepConfigPanel from './StepConfigPanel';

let stepCtr = 0;
const newStepId = () => `step_${Date.now()}_${stepCtr++}`;

const DEFAULT_STEP_NAMES: Record<WorkflowStepType, string> = {
  update_record:     'Update Record',
  assign_record:     'Assign Record',
  send_notification: 'Send Notification',
  create_record:     'Create Record',
  condition:         'Condition',
  wait:              'Wait',
  webhook:           'Call Webhook',
};

interface FlowCanvasProps {
  steps: WorkflowStep[];
  workflowId: string;
  fields: FieldDefinition[];
  onStepsChange: (steps: WorkflowStep[]) => void;
}

export default function FlowCanvas({ steps, workflowId, fields, onStepsChange }: FlowCanvasProps) {
  const selectedId = steps.length > 0 ? null : null;

  const handleSelectStep = (stepId: string | null) => {
    onStepsChange(steps.map((s) => ({ ...s, _selected: s.workflow_step_id === stepId } as WorkflowStep)));
  };

  const selectedStep = (steps as (WorkflowStep & { _selected?: boolean })[]).find((s) => s._selected) ?? null;

  const addStep = (afterIndex: number, type: WorkflowStepType = 'update_record') => {
    const newStep: WorkflowStep = {
      workflow_step_id: newStepId(),
      workflow_id: workflowId,
      step_type: type,
      name: DEFAULT_STEP_NAMES[type],
      label: null,
      description: null,
      step_order: afterIndex + 1,
      config_json: {},
      next_step_id: null,
      next_step_on_false: null,
      position_x: 0,
      position_y: (afterIndex + 1) * 120,
    };
    const updated = [
      ...steps.slice(0, afterIndex + 1),
      newStep,
      ...steps.slice(afterIndex + 1),
    ].map((s, i) => ({ ...s, step_order: i }));
    onStepsChange(updated);
    setTimeout(() => handleSelectStep(newStep.workflow_step_id), 10);
  };

  const deleteStep = (stepId: string) => {
    const updated = steps
      .filter((s) => s.workflow_step_id !== stepId)
      .map((s, i) => ({ ...s, step_order: i }));
    onStepsChange(updated);
    if (selectedStep?.workflow_step_id === stepId) handleSelectStep(null);
  };

  const moveStep = (fromIndex: number, toIndex: number) => {
    const updated = [...steps];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    onStepsChange(updated.map((s, i) => ({ ...s, step_order: i })));
  };

  const updateStep = (updatedStep: WorkflowStep) => {
    onStepsChange(steps.map((s) => s.workflow_step_id === updatedStep.workflow_step_id ? { ...updatedStep } : s));
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,#e2e8f0_1px,transparent_0)] [background-size:24px_24px]">
        <div className="flex flex-col items-center py-8 px-4 min-h-full">
          {steps.length === 0 ? (
            <EmptyCanvas onAdd={() => addStep(-1)} />
          ) : (
            <>
              {steps.map((step, index) => (
                <StepNode
                  key={step.workflow_step_id}
                  step={step}
                  index={index}
                  isSelected={(step as WorkflowStep & { _selected?: boolean })._selected ?? false}
                  isFirst={index === 0}
                  isLast={index === steps.length - 1}
                  onSelect={() => handleSelectStep(
                    (step as WorkflowStep & { _selected?: boolean })._selected ? null : step.workflow_step_id
                  )}
                  onDelete={() => deleteStep(step.workflow_step_id)}
                  onAddAfter={() => addStep(index)}
                  onMoveUp={() => moveStep(index, index - 1)}
                  onMoveDown={() => moveStep(index, index + 1)}
                />
              ))}
              <div className="mt-2">
                <AddStepButton onAdd={() => addStep(steps.length - 1)} />
              </div>
            </>
          )}
        </div>
      </div>

      {selectedStep && (
        <StepConfigPanel
          step={selectedStep}
          fields={fields}
          onUpdate={(updated) => updateStep(updated)}
          onClose={() => handleSelectStep(null)}
        />
      )}
    </div>
  );
}

function EmptyCanvas({ onAdd }: { onAdd: () => void }) {
  const QUICK_STEPS: { type: WorkflowStepType; label: string; color: string }[] = [
    { type: 'update_record',     label: 'Update Record',     color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { type: 'assign_record',     label: 'Assign Record',     color: 'bg-teal-50 border-teal-200 text-teal-700' },
    { type: 'send_notification', label: 'Send Notification', color: 'bg-amber-50 border-amber-200 text-amber-700' },
    { type: 'create_record',     label: 'Create Record',     color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  ];

  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center max-w-md">
      <div className="w-16 h-16 rounded-2xl bg-white border-2 border-dashed border-slate-300 flex items-center justify-center mb-4 shadow-sm">
        <Plus size={24} className="text-slate-400" />
      </div>
      <h3 className="text-sm font-semibold text-slate-700 mb-1">No steps yet</h3>
      <p className="text-xs text-slate-400 mb-6 max-w-xs">
        Add steps to build your automation flow. Steps execute in order from top to bottom.
      </p>
      <div className="grid grid-cols-2 gap-2 w-full mb-4">
        {QUICK_STEPS.map(({ type, label, color }) => (
          <button
            key={type}
            onClick={onAdd}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border rounded-xl transition-all hover:shadow-sm ${color}`}
          >
            <Plus size={11} />
            {label}
          </button>
        ))}
      </div>
      <button
        onClick={onAdd}
        className="text-xs text-slate-500 hover:text-blue-600 font-medium"
      >
        Or add any step type →
      </button>
    </div>
  );
}

function AddStepButton({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-blue-600 bg-white border-2 border-dashed border-blue-200 rounded-2xl hover:border-blue-400 hover:bg-blue-50 transition-all shadow-sm"
    >
      <Plus size={13} />
      Add Step
    </button>
  );
}
