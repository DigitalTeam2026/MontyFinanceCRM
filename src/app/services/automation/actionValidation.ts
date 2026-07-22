// Per-action config validation for Power Automation. Pure + shared between the
// Admin Studio editor (pre-save feedback) and the server worker (enforcement at
// execution time). Returns an array of human-readable problems ([] = valid).

import type {
  AutomationActionType, AutomationRuleAction, SendEmailConfig, UpdateFieldConfig, ListRowsConfig, GetRowConfig,
  ExportViewEmailConfig, RelatedExportEmailConfig, SendDocumentsEmailConfig, CreateRelatedRecordConfig,
  UpdateRelatedRecordConfig, SwitchConfig,
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
    case 'get_row':
      return validateGetRow(config as unknown as GetRowConfig);
    case 'generate_document':
      return [];
    case 'export_view_email':
      return validateExportViewEmail(config as unknown as ExportViewEmailConfig);
    case 'related_export_email':
      return validateRelatedExportEmail(config as unknown as RelatedExportEmailConfig);
    case 'send_documents_email':
      return validateSendDocumentsEmail(config as unknown as SendDocumentsEmailConfig);
    case 'create_related_record':
      return validateCreateRelated(config as unknown as CreateRelatedRecordConfig);
    case 'update_related_record':
      return validateUpdateRelated(config as unknown as UpdateRelatedRecordConfig);
    case 'condition':
      return validateCondition(config as unknown as { left?: string; operator?: string });
    case 'switch':
      return validateSwitch(config as unknown as SwitchConfig);
    default:
      return [`Unknown action type: ${type}`];
  }
}

function validateCondition(c: { left?: string; operator?: string }): string[] {
  const errs: string[] = [];
  if (!c.left || !String(c.left).trim()) errs.push('The condition needs a left-hand value (a field or token to compare).');
  if (!c.operator) errs.push('Pick a comparison operator.');
  return errs;
}

function validateSwitch(c: SwitchConfig): string[] {
  const errs: string[] = [];
  if (!c.on || !String(c.on).trim()) errs.push('The switch needs a value to switch On (a field or token).');
  const cases = Array.isArray(c.cases) ? c.cases : [];
  if (cases.length === 0) errs.push('Add at least one case.');
  if (cases.some((cs) => !cs || String(cs.value ?? '').trim() === '')) errs.push('Every case needs a value to match.');
  return errs;
}

function validateMappings(mappings: { target_field?: string; mode?: string; value?: string }[] | undefined): string[] {
  const errs: string[] = [];
  const list = Array.isArray(mappings) ? mappings : [];
  if (list.length === 0) errs.push('Add at least one field to set.');
  for (const m of list) {
    if (!m.target_field) errs.push('Every mapping needs a target field.');
    else if (m.mode === 'field' && !m.value) errs.push(`Mapping for "${m.target_field}" needs a source field.`);
  }
  return errs;
}

function validateMatch(c: { target_entity?: string; match_field?: string; link_field_physical?: string; match_mode?: string; match_value?: string }, verb: string): string[] {
  const errs: string[] = [];
  if (!c.target_entity) errs.push(`Pick the table to ${verb}.`);
  if (!c.match_field && !c.link_field_physical) errs.push('Pick the match field (which column links to the trigger record).');
  if ((c.match_mode === 'field' || c.match_mode === 'static') && !c.match_value) {
    errs.push('The match value is required (a source field or a value).');
  }
  return errs;
}

function validateCreateRelated(c: CreateRelatedRecordConfig): string[] {
  return [...validateMatch(c, 'insert into'), ...validateMappings(c.mappings)];
}

function validateUpdateRelated(c: UpdateRelatedRecordConfig): string[] {
  return [...validateMatch(c, 'update'), ...validateMappings(c.mappings)];
}

function hasRecipient(c: { to?: string; cc?: string; to_user_ids?: string[] }): boolean {
  return !!(c.to && String(c.to).trim()) ||
    !!(c.cc && String(c.cc).trim()) ||
    (Array.isArray(c.to_user_ids) && c.to_user_ids.length > 0);
}

function validateRelatedExportEmail(c: RelatedExportEmailConfig): string[] {
  const errs: string[] = [];
  const cols = Array.isArray(c.columns) ? c.columns.filter((x) => x && x.source_id && x.field) : [];
  if (cols.length === 0) errs.push('Add at least one column to the report.');
  const childCount = (Array.isArray(c.sources) ? c.sources : []).filter((s) => s.kind === 'child').length;
  if (childCount > 1) errs.push('Only one child list (row-expanding source) is supported.');
  if (!hasRecipient(c)) errs.push('At least one recipient (address, user, or token) is required.');
  return errs;
}

function validateSendDocumentsEmail(c: SendDocumentsEmailConfig): string[] {
  const errs: string[] = [];
  if (c.source === 'other') {
    if (!c.source_entity) errs.push('Pick the entity whose documents you want to attach.');
    if (!c.source_record_id || !String(c.source_record_id).trim()) {
      errs.push('The record id to read documents from is required (pick a token or type an id).');
    }
  }
  if (c.source === 'folder' && !(c.folder_path && String(c.folder_path).trim())) {
    errs.push('Type the folder path to take the files from.');
  }
  if (c.selection === 'filter' && !(c.name_value && String(c.name_value).trim())) {
    errs.push('Filtering by name needs something to match on.');
  }
  if (!hasRecipient(c) && !c.send_to_owner) {
    errs.push('At least one recipient (address, user, owner, or token) is required.');
  }
  if (!c.subject || !String(c.subject).trim()) errs.push('Subject is required.');
  if (c.max_files != null && (Number(c.max_files) < 1 || Number(c.max_files) > 50)) {
    errs.push('Max files must be between 1 and 50.');
  }
  if (c.max_total_mb != null && Number(c.max_total_mb) <= 0) {
    errs.push('The total size limit must be greater than 0 MB.');
  }
  return errs;
}

function validateExportViewEmail(c: ExportViewEmailConfig): string[] {
  const errs: string[] = [];
  if (!c.view_id) errs.push('A view to export is required.');
  const hasRecipient =
    !!(c.to && String(c.to).trim()) ||
    !!(c.cc && String(c.cc).trim()) ||
    (Array.isArray(c.to_user_ids) && c.to_user_ids.length > 0);
  if (!hasRecipient) errs.push('At least one recipient (address, user, or token) is required.');
  return errs;
}

function validateSendEmail(c: SendEmailConfig): string[] {
  const errs: string[] = [];
  const staticTo = Array.isArray(c.to_static) ? c.to_static : [];
  const fieldTo = Array.isArray(c.to_fields) ? c.to_fields : [];
  const hasTokenTo = !!(c.to && String(c.to).trim()) || !!(c.cc && String(c.cc).trim());
  if (staticTo.length === 0 && fieldTo.length === 0 && !hasTokenTo && !c.send_to_owner) {
    errs.push('At least one recipient (address, record field, owner, or token) is required.');
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

function validateGetRow(c: GetRowConfig): string[] {
  const errs: string[] = [];
  if (!c.step_name || !String(c.step_name).trim()) errs.push('Step name is required.');
  else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.step_name)) errs.push('Step name must be a simple identifier (letters, digits, underscore).');
  if (!c.source_table) errs.push('Source table is required.');
  if (c.match_value == null || String(c.match_value).trim() === '') errs.push('The id/value to look up is required.');
  return errs;
}

// ── Cross-action token / step validation ─────────────────────────────────────

const TOKEN_RE = /{{\s*([\s\S]+?)\s*}}/g;
const JOIN_RE = /^join\(\s*([\w]+)\s*,\s*(?:(['"])([\s\S]*?)\2|([^)]*?))\s*\)$/;
const FIRST_RE = /^first\(\s*([\w]+)\s*\)$/;
const RAW_RE = /^raw\(\s*([\w]+)\s*\)$/;

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
      const fm = op.match(FIRST_RE) ?? op.match(RAW_RE);
      if (fm && step.columns.length > 0 && !step.columns.includes(fm[1])) {
        problems.push(`${label}: step "${name}" does not return column "${fm[1]}".`);
      }
    }

    // Register this step so later actions can reference it.
    if (action.action_type === 'list_rows' || action.action_type === 'get_row') {
      const cfg = action.config as unknown as ListRowsConfig | GetRowConfig;
      if (cfg.step_name) stepsSoFar.set(cfg.step_name, { columns: Array.isArray(cfg.columns) ? cfg.columns : [] });
    }
  });

  return problems;
}
