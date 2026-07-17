// src/admin/automationrules/aiFlowParser.ts
// In-system "AI" flow builder for Power Automation — a deterministic, browser-side
// parser that turns a plain-language prompt into a flow spec (trigger + ordered
// actions). NO external API and no API key: it runs entirely inside the system,
// mirroring ../rules/aiRuleParser.ts and ../entities/aiTableParser.ts.
//
// It is heuristic on purpose: it reads the phrasing, resolves field / choice names
// against the selected table, and drafts the common flows (email on a status
// change, generate + email an export, update a field). The user always previews
// and edits every step afterwards, so "good draft" beats "perfect".

import type { FieldDefinition, ChoiceOption } from '../../types/field';
import type { AiFlowSpec } from '../../services/automationRuleService';
import type {
  AutomationOperator, AutomationTriggerEvent, AutomationCondition,
  AutomationActionType, AutomationRunAfter, AutomationActionConfig,
} from '../../types/automationRule';

export interface FlowParseResult { spec: AiFlowSpec; warnings: string[]; table_logical_name: string }
export interface FlowParseError { message: string; suggestions: string[] }

export function isFlowParseError(r: FlowParseResult | FlowParseError): r is FlowParseError {
  return 'message' in r && !('spec' in r);
}

const norm = (s: string) => s.toLowerCase().replace(/[_\-\s]+/g, ' ').trim();

// Find the field whose name appears in the text; prefer the LONGEST display-name
// match so "status reason" wins over "status" when both are present.
function findField(text: string, fields: FieldDefinition[]): FieldDefinition | null {
  const n = norm(text);
  let best: FieldDefinition | null = null;
  let bestLen = 0;
  for (const f of fields) {
    for (const cand of [f.display_name, f.logical_name]) {
      const nc = norm(cand);
      if (nc && n.includes(nc) && nc.length > bestLen) { best = f; bestLen = nc.length; }
    }
  }
  return best;
}

function choiceOptions(f: FieldDefinition): ChoiceOption[] {
  const cfg = f.config_json as { choices?: ChoiceOption[] } | null;
  return cfg?.choices ?? [];
}

// Resolve a spoken choice label ("Won") to its stored value for a choice field.
function resolveChoiceValue(f: FieldDefinition | null, label: string): { value: string; warned: boolean } {
  if (!f) return { value: label, warned: false };
  const type = f.field_type?.name ?? 'text';
  if (type !== 'choice' && type !== 'multi_choice') return { value: label, warned: false };
  const n = norm(label);
  for (const c of choiceOptions(f)) if (norm(c.label) === n) return { value: c.value, warned: false };
  for (const c of choiceOptions(f)) if (norm(c.label).includes(n) || n.includes(norm(c.label))) return { value: c.value, warned: false };
  return { value: label, warned: choiceOptions(f).length > 0 };
}

const cleanValue = (s: string) =>
  s.replace(/[.．]+\s*$/g, '').replace(/^["'“”]+|["'“”]+$/g, '').trim();

// ── Trigger ─────────────────────────────────────────────────────────────────────

interface ParsedTrigger {
  trigger_event: AutomationTriggerEvent;
  field_logical_name: string | null;
  operator: AutomationOperator;
  trigger_value: unknown;
  conditions: AutomationCondition[];
  fieldDisplay: string | null;
  valueLabel: string | null;
}

const TRIGGER_OP: { re: RegExp; op: AutomationOperator }[] = [
  { re: /\bchang(?:es|ed)\s+from\s+(.+?)\s+to\s+(.+)$/i, op: 'changes_from_to' },
  { re: /\b(?:chang(?:es|ed)\s+to|is\s+set\s+to|becomes|turns?\s+to|set\s+to|moves?\s+to)\b/i, op: 'changes_to' },
  { re: /\bis\s+any\s+of\b|\bis\s+one\s+of\b|\bin\s+\(/i, op: 'is_any_of' },
  // "is updated / modified / changed / edited" = any change, NOT equals "updated".
  { re: /\bis\s+(?:updated|modified|changed|edited|changing)\b|\bchang(?:es|ed)\b/i, op: 'changed' },
  { re: /\bequals?\b|\bis\b|\b=\b/i, op: 'equals' },
];

function parseTrigger(triggerText: string, fields: FieldDefinition[], warnings: string[]): ParsedTrigger {
  const raw = triggerText.replace(/^\s*(?:when|whenever|if|once|after|on)\s+/i, '').trim();
  const lower = raw.toLowerCase();

  const created = /\b(created|is\s+created|on\s+create|newly\s+added|is\s+added|new\s+\w+\s+is\s+(?:created|added))\b/.test(lower);
  const updatedWord = /\b(updated|update|chang(?:es|ed)|modified|edited|set\s+to|becomes)\b/.test(lower);
  let trigger_event: AutomationTriggerEvent = 'update';
  if (created && updatedWord) trigger_event = 'both';
  else if (created && !updatedWord) trigger_event = 'create';

  // Locate an operator + value on a field, e.g. "status changes to Won".
  for (const { re, op } of TRIGGER_OP) {
    const m = raw.match(re);
    if (!m) continue;
    const idx = raw.search(re);
    const fieldPart = raw.slice(0, idx).trim();
    const field = findField(fieldPart, fields) ?? findField(raw, fields);
    if (!field) continue;

    if (op === 'changed') {
      return { trigger_event, field_logical_name: field.logical_name, operator: 'changed', trigger_value: null, conditions: [], fieldDisplay: field.display_name, valueLabel: null };
    }
    if (op === 'changes_from_to') {
      const from = cleanValue(m[1]); const to = cleanValue(m[2]);
      const rf = resolveChoiceValue(field, from); const rt = resolveChoiceValue(field, to);
      if (rf.warned || rt.warned) warnings.push(`Could not match an option for "${field.display_name}"; using the text as-is.`);
      return { trigger_event, field_logical_name: field.logical_name, operator: 'changes_from_to', trigger_value: `${rf.value}>${rt.value}`, conditions: [], fieldDisplay: field.display_name, valueLabel: `${from} → ${to}` };
    }
    const valuePart = cleanValue(raw.slice(idx + m[0].length));
    if (op === 'is_any_of') {
      const parts = valuePart.split(/\s*,\s*|\s+or\s+/i).map(cleanValue).filter(Boolean);
      const resolved = parts.map((p) => resolveChoiceValue(field, p).value);
      return { trigger_event, field_logical_name: field.logical_name, operator: 'is_any_of', trigger_value: resolved.join(','), conditions: [], fieldDisplay: field.display_name, valueLabel: parts.join(', ') };
    }
    const rv = resolveChoiceValue(field, valuePart);
    if (rv.warned) warnings.push(`Could not find option "${valuePart}" on ${field.display_name}; using the text as-is.`);
    return { trigger_event, field_logical_name: field.logical_name, operator: op, trigger_value: rv.value, conditions: [], fieldDisplay: field.display_name, valueLabel: valuePart };
  }

  // No field/value found — fire on any create/update.
  return { trigger_event, field_logical_name: null, operator: 'changed', trigger_value: null, conditions: [], fieldDisplay: null, valueLabel: null };
}

// ── Actions ───────────────────────────────────────────────────────────────────

interface ParsedAction { action_type: AutomationActionType; run_after: AutomationRunAfter; config: AutomationActionConfig }

function splitActionClauses(text: string): string[] {
  return text
    .split(/\s*;\s*|\s+then\s+|\s*,\s*(?:and\s+)?then\s+|\s+and\s+then\s+/i)
    .flatMap((c) => c.split(/\s+and\s+(?=(?:also\s+)?(?:email|send|notify|alert|generate|export|create|produce|update|set|change|mark|assign)\b)/i))
    .map((s) => s.trim())
    .filter(Boolean);
}

function detectRunAfter(clause: string): { runAfter: AutomationRunAfter; text: string } {
  if (/\b(if\s+(?:that|it|this)\s+fails?|on\s+failure|if\s+failed|when\s+it\s+fails)\b/i.test(clause)) {
    return { runAfter: 'failure', text: clause.replace(/\b(?:otherwise\s+)?if\s+(?:that|it|this)\s+fails?\s*,?\s*|on\s+failure\s*,?\s*|if\s+failed\s*,?\s*/i, '').trim() };
  }
  if (/\b(always|finally|in\s+any\s+case|regardless)\b/i.test(clause)) {
    return { runAfter: 'always', text: clause.replace(/\b(always|finally|in\s+any\s+case|regardless)\b\s*,?\s*/i, '').trim() };
  }
  return { runAfter: 'success', text: clause };
}

function buildEmailAction(
  clause: string, runAfter: AutomationRunAfter, trig: ParsedTrigger, tableDisplay: string,
  fields: FieldDefinition[], attachDoc: boolean,
): ParsedAction {
  const emails = (clause.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).map((e) => e.replace(/[.,;:]+$/, ''));
  const toOwner = /\b(owner|record\s+owner|assigned\s+(?:user|to))\b/i.test(clause);

  // Recipient fields: an email/user field named in the clause ("email the account manager").
  const toFields: string[] = [];
  for (const f of fields) {
    const t = f.field_type?.name ?? '';
    if ((t === 'email' || t === 'lookup') && norm(clause).includes(norm(f.display_name))) toFields.push(f.logical_name);
  }

  const subject = trig.fieldDisplay && trig.valueLabel
    ? `${tableDisplay}: ${trig.fieldDisplay} is now ${trig.valueLabel}`
    : `${tableDisplay} update`;
  const body =
    `<p>This is an automated notification about this ${tableDisplay.toLowerCase()} record.</p>` +
    (trig.fieldDisplay && trig.valueLabel ? `<p><strong>${trig.fieldDisplay}:</strong> ${trig.valueLabel}</p>` : '') +
    `<p><a href="{{record.url}}">Open the record</a></p>`;

  const config: AutomationActionConfig = {
    to_static: emails,
    to_fields: toFields,
    to: emails.join('; '),
    send_to_owner: toOwner || (emails.length === 0 && toFields.length === 0),
    subject,
    body,
    ...(attachDoc ? { attach_document: true } : {}),
    email_account_id: null,
  };
  return { action_type: 'send_email', run_after: runAfter, config };
}

function buildDocAction(clause: string, runAfter: AutomationRunAfter, tableDisplay: string): ParsedAction {
  const format: 'csv' | 'xlsx' = /\bcsv\b/i.test(clause) ? 'csv' : 'xlsx';
  const config: AutomationActionConfig = { format, filename: `${tableDisplay} Export.${format}` };
  return { action_type: 'generate_document', run_after: runAfter, config };
}

function buildUpdateAction(clause: string, runAfter: AutomationRunAfter, fields: FieldDefinition[], warnings: string[]): ParsedAction | null {
  const m = clause.match(/\b(?:set|update|change|mark|assign)\s+(?:the\s+)?(.+?)\s+(?:to|as|=)\s+(.+)$/i);
  if (!m) return null;
  const field = findField(m[1], fields);
  if (!field) { warnings.push(`Couldn't find a field for "${m[1].trim()}" — skipped an update step.`); return null; }
  const rv = resolveChoiceValue(field, cleanValue(m[2]));
  const config: AutomationActionConfig = { target: 'record', field: field.logical_name, value: rv.value };
  return { action_type: 'update_field', run_after: runAfter, config };
}

function parseActions(
  actionText: string, trig: ParsedTrigger, tableDisplay: string, fields: FieldDefinition[], warnings: string[],
): ParsedAction[] {
  const actions: ParsedAction[] = [];
  let generatedDoc = false;

  for (const clauseRaw of splitActionClauses(actionText)) {
    const { runAfter, text: clause } = detectRunAfter(clauseRaw);
    const lower = clause.toLowerCase();

    const isDoc = /\b(generate|export|produce|create|build)\b.*\b(excel|xlsx|csv|spreadsheet|report|export|file)\b/.test(lower) || /\bexport\b/.test(lower);
    const isEmail = /\b(e-?mail|notify|alert|send\b)\b/.test(lower);
    const isUpdate = /\b(set|update|change|mark|assign)\b/.test(lower) && /\b(to|as|=)\b/.test(lower);

    if (isDoc && !isEmail) {
      actions.push(buildDocAction(clause, runAfter, tableDisplay));
      generatedDoc = true;
    } else if (isEmail) {
      // "email the export" / "email it" after a doc step → attach the document.
      const attach = generatedDoc && /\b(it|the\s+(?:export|report|file|attachment|document|spreadsheet))\b/i.test(lower);
      actions.push(buildEmailAction(clause, runAfter, trig, tableDisplay, fields, attach));
    } else if (isUpdate) {
      const a = buildUpdateAction(clause, runAfter, fields, warnings);
      if (a) actions.push(a);
    } else {
      warnings.push(`Didn't recognize an action in: "${clauseRaw}".`);
    }
  }
  return actions;
}

function buildName(trig: ParsedTrigger, actions: ParsedAction[], tableDisplay: string): string {
  const first = actions[0]?.action_type;
  const verb = first === 'send_email' ? 'Email' : first === 'generate_document' ? 'Export' : first === 'update_field' ? 'Update' : 'Automate';
  if (trig.fieldDisplay && trig.valueLabel) return `${verb} when ${trig.fieldDisplay} is ${trig.valueLabel}`;
  if (trig.trigger_event === 'create') return `${verb} on new ${tableDisplay.toLowerCase()}`;
  return `${verb} on ${tableDisplay.toLowerCase()} change`;
}

export function parseFlowPrompt(
  prompt: string,
  tableLogicalName: string,
  tableDisplayName: string,
  fields: FieldDefinition[],
): FlowParseResult | FlowParseError {
  const text = prompt.trim();
  if (!text) {
    return {
      message: 'Please describe what the flow should do.',
      suggestions: ['When Status changes to Won, email sales@montyholding.com.'],
    };
  }
  if (!tableLogicalName) {
    return { message: 'Pick the table this flow runs on first.', suggestions: [] };
  }

  // Split "<trigger>, <actions>" at the first comma / "then" / colon.
  let triggerText = text;
  let actionText = '';
  const m = text.match(/^\s*(.+?)(?:,\s+|\s+then\s+|:\s+)(.+)$/i);
  if (m) { triggerText = m[1]; actionText = m[2]; }

  const warnings: string[] = [];
  const trig = parseTrigger(triggerText, fields, warnings);

  const tableDisplay = tableDisplayName || tableLogicalName;
  const actions = actionText.trim() ? parseActions(actionText, trig, tableDisplay, fields, warnings) : [];

  if (actions.length === 0) {
    return {
      message: 'I understood the trigger but not what to do. Describe an action after a comma or "then".',
      suggestions: [
        'When Status changes to Won, email sales@montyholding.com.',
        'When a record is created, generate an Excel export and email it to the owner.',
        'When Priority changes to High, notify the owner and set Escalated to Yes.',
      ],
    };
  }

  const spec: AiFlowSpec = {
    name: buildName(trig, actions, tableDisplay),
    summary: text.length > 160 ? `${text.slice(0, 157)}…` : text,
    trigger: {
      trigger_event: trig.trigger_event,
      field_logical_name: trig.field_logical_name,
      operator: trig.operator,
      trigger_value: trig.trigger_value,
      conditions: trig.conditions,
    },
    actions: actions.map((a) => ({ action_type: a.action_type, run_after: a.run_after, config: a.config })),
  };

  return { spec, warnings, table_logical_name: tableLogicalName };
}
