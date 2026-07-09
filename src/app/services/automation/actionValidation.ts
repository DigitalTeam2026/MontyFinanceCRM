// Per-action config validation for Power Automation. Pure + shared between the
// Admin Studio editor (pre-save feedback) and the server worker (enforcement at
// execution time). Returns an array of human-readable problems ([] = valid).

import type {
  AutomationActionType, AutomationRuleAction, SendEmailConfig, UpdateFieldConfig, ListRowsConfig,
} from '../../../types/automationRule';

export function validateActionConfig(
  type: AutomationActionType,
  config: Record<string, unknown>,
): string[] {
  switch (type) {
    case 'send_email':
      return validateSendEmail(config as unknown as SendEmailConfig);
    case 'update_field':
      return validateUpdateField(config as unknown as UpdateFieldConfig);
    case 'list_rows':
      return validateListRows(config as unknown as ListRowsConfig);
    case 'generate_document':
      return [];
    default:
      return [`Unknown action type: ${type}`];
  }
}

function validateSendEmail(c: SendEmailConfig): string[] {
  const errs: string[] = [];
  const staticTo = Array.isArray(c.to_static) ? c.to_static : [];
  const fieldTo = Array.isArray(c.to_fields) ? c.to_fields : [];
  const hasTokenTo = !!(c.to && String(c.to).trim()) || !!(c.cc && String(c.cc).trim());
  if (staticTo.length === 0 && fieldTo.length === 0 && !hasTokenTo) {
    errs.push('At least one recipient (address, record field, or token) is required.');
  }
  for (const addr of staticTo) {
    if (typeof addr !== 'string' || !addr.includes('@')) errs.push(`Invalid email address: ${String(addr)}`);
  }
  if (!c.subject || !String(c.subject).trim()) errs.push('Subject is required.');
  if (!c.body || !String(c.body).trim()) errs.push('Body is required.');
  return errs;
}

function validateUpdateField(c: UpdateFieldConfig): string[] {
  const errs: string[] = [];
  if (!c.field) errs.push('Target field is required.');
  if (c.target === 'related' && !c.related_lookup_field) {
    errs.push('A lookup field is required when updating a related record.');
  }
  return errs;
}

function validateListRows(c: ListRowsConfig): string[] {
  const errs: string[] = [];
  if (!c.step_name || !String(c.step_name).trim()) errs.push('Step name is required.');
  else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.step_name)) errs.push('Step name must be a simple identifier (letters, digits, underscore).');
  if (!c.source_table) errs.push('Source table is required.');
  for (const f of c.filters ?? []) {
    if (!f.field) errs.push('Every filter needs a field.');
  }
  return errs;
}

// ── Cross-action token / step validation ─────────────────────────────────────

const TOKEN_RE = /{{\s*([\s\S]+?)\s*}}/g;
const JOIN_RE = /^join\(\s*([\w]+)\s*,\s*(?:(['"])([\s\S]*?)\2|([^)]*?))\s*\)$/;

/** Collect the token expressions used in an action's config (deep string scan). */
function tokensInConfig(config: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      let m: RegExpExecArray | null;
      TOKEN_RE.lastIndex = 0;
      while ((m = TOKEN_RE.exec(v))) out.push(m[1].trim());
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(config);
  return out;
}

export interface StepMeta {
  /** name -> the columns that step returns ([] means "all", so any column is allowed). */
  columns: string[];
}

/**
 * Validate step-output token usage across an ordered action list:
 *  - a {{steps.<name>...}} reference must point at an EARLIER list_rows step;
 *  - a join(col, sep) column must exist in that step's returned columns;
 *  - the join separator must be non-empty.
 * Returns problems as "Action N: <message>".
 */
export function validateRuleTokens(actions: AutomationRuleAction[]): string[] {
  const problems: string[] = [];
  const stepsSoFar = new Map<string, StepMeta>();

  actions.forEach((action, idx) => {
    const label = `Action ${idx + 1} (${action.action_type})`;

    // Check this action's token references against steps defined BEFORE it.
    for (const expr of tokensInConfig(action.config)) {
      if (!expr.startsWith('steps.')) continue;
      const rest = expr.slice('steps.'.length);
      const dot = rest.indexOf('.');
      const name = dot === -1 ? rest : rest.slice(0, dot);
      const op = dot === -1 ? '' : rest.slice(dot + 1);
      const step = stepsSoFar.get(name);
      if (!step) {
        problems.push(`${label}: references step "${name}" which is not defined by an earlier List rows action.`);
        continue;
      }
      const jm = op.match(JOIN_RE);
      if (jm) {
        const col = jm[1];
        const sep = jm[3] !== undefined ? jm[3] : jm[4] ?? '';
        if (!sep) problems.push(`${label}: join separator for step "${name}" must be non-empty.`);
        if (step.columns.length > 0 && !step.columns.includes(col)) {
          problems.push(`${label}: step "${name}" does not return column "${col}".`);
        }
      }
    }

    // Register this step so later actions can reference it.
    if (action.action_type === 'list_rows') {
      const cfg = action.config as unknown as ListRowsConfig;
      if (cfg.step_name) stepsSoFar.set(cfg.step_name, { columns: Array.isArray(cfg.columns) ? cfg.columns : [] });
    }
  });

  return problems;
}
