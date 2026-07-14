// src/admin/entities/aiTableParser.ts
// In-system "AI" table builder — a deterministic, browser-side parser that turns a
// plain-language prompt into a table spec (names + typed columns). NO external API
// and no API key: it works entirely inside the system, mirroring the business-rule
// prompt parser in ../rules/aiRuleParser.ts.
//
// It is intentionally heuristic (like the rule parser): it reads the phrasing,
// infers a sensible column type from keywords, pulls choice options out of
// parentheses, and best-effort names everything. The user always previews and can
// edit the table afterwards.

import type { AiTableSpec, AiTableField, AiTableFieldType } from '../../services/aiTableService';

export interface TableParseResult {
  spec: AiTableSpec;
  warnings: string[];
}

export interface TableParseError {
  message: string;
  suggestions: string[];
}

export function isTableParseError(r: TableParseResult | TableParseError): r is TableParseError {
  return 'message' in r && !('spec' in r);
}

// Physical columns the create-table RPC provisions + the logical names bootstrap
// gives its system fields. A parsed field whose logical_name matches one of these
// would duplicate / corrupt a real system column, so it's skipped. Kept tight to
// the ACTUAL system columns — generic words like "status" or "type" are allowed
// (they become brand-new columns, distinct from the built-in Status/state_code).
const RESERVED = new Set([
  'name', 'id',
  'owner_type', 'owner_id', 'ownerid', 'business_unit_id',
  'state_code', 'statecode', 'status_reason', 'statusreason',
  'custom_fields', 'is_deleted', 'deleted_at', 'version_no',
  'created_at', 'createdon', 'created_by', 'createdby',
  'modified_at', 'modifiedon', 'modified_by', 'modifiedby',
]);

const MAX_FIELDS = 20;

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length <= 2 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
    .trim();
}

function pluralize(s: string): string {
  if (!s) return s;
  if (/[^aeiou]y$/i.test(s)) return s.replace(/y$/i, 'ies');
  if (/(s|x|z|ch|sh)$/i.test(s)) return `${s}es`;
  return `${s}s`;
}

// ── Column type inference ───────────────────────────────────────────────────────
// Ordered keyword rules; the first match wins. Deliberately conservative — anything
// unrecognized falls back to single-line text.
const TYPE_RULES: { re: RegExp; type: AiTableFieldType }[] = [
  { re: /\b(date\s*(?:and|&|\/)?\s*time|datetime|timestamp)\b/i, type: 'datetime' },
  { re: /\b(date|dob|birth\s*day|deadline|due|expiry|expiration)\b/i, type: 'date' },
  { re: /\b(e-?mail)\b/i, type: 'email' },
  { re: /\b(phone|mobile|telephone|\btel\b|fax|whatsapp)\b/i, type: 'phone' },
  { re: /\b(url|website|web\s*site|web\s*page|link|homepage)\b/i, type: 'url' },
  { re: /\b(yes\s*\/?\s*no|true\s*\/?\s*false|boolean|flag|auto[-\s]?renew|is[-\s]|has[-\s]|enabled|active\b)\b/i, type: 'boolean' },
  { re: /\b(amount|price|cost|salary|revenue|budget|\bfee\b|balance|payment|currency|money|\bsum\b|total\s*value|annual\s*value)\b/i, type: 'currency' },
  { re: /\b(rate|percent|percentage|ratio|score|rating|weight|height|latitude|longitude|average|decimal)\b/i, type: 'decimal' },
  { re: /\b(number\s+of|count|quantity|\bqty\b|\bage\b|years?|months?|days?|\bterm\b|bedrooms?|bathrooms?|units?|stock|footage|square\s*(?:feet|foot|meters?|metres?)|whole\s*number|integer)\b/i, type: 'whole_number' },
  { re: /\b(notes?|description|comments?|details?|address|summary|remarks?|\bbio\b|message|multi[-\s]?line|paragraph)\b/i, type: 'long_text' },
];

function inferType(phrase: string): AiTableFieldType {
  for (const r of TYPE_RULES) if (r.re.test(phrase)) return r.type;
  return 'text';
}

// Split a comma/and list WITHOUT breaking on commas that sit inside parentheses
// (choice options like "(Draft, Submitted, Approved)").
function splitFieldList(text: string): string[] {
  const SENTINEL = '';
  const protectedText = text.replace(/\(([^)]*)\)/g, (m) => m.replace(/,/g, SENTINEL));
  return protectedText
    .split(/\s*,\s*|\s+and\s+/i)
    .map((s) => s.replace(new RegExp(SENTINEL, 'g'), ',').trim())
    .filter(Boolean);
}

function parseChoices(phrase: string): string[] {
  const m = phrase.match(/\(([^)]+)\)/);
  if (!m) return [];
  return m[1]
    .split(/\s*,\s*|\s*\/\s*|\s+or\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function cleanFieldName(phrase: string): string {
  return phrase
    .replace(/\([^)]*\)/g, ' ')                                            // drop options
    .replace(/^\s*(?:and|&|plus|also)\s+/i, ' ')                           // leading conjunction left by the list split
    .replace(/\b(required|mandatory|optional)\b/gi, ' ')
    .replace(/\byes\s*\/?\s*no\b/gi, ' ')
    .replace(/\btrue\s*\/?\s*false\b/gi, ' ')
    .replace(/\b(choices?|dropdown|drop-?down|pick\s?list|option\s*set|options?|select|boolean|flag)\b/gi, ' ')
    .replace(/\b(field|column)\b/gi, ' ')
    .replace(/^\s*(?:a|an|the)\s+/i, ' ')
    .replace(/[^a-zA-Z0-9 &_/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFieldPhrase(phrase: string): AiTableField | null {
  const choices = parseChoices(phrase);
  const required = /\b(required|mandatory)\b/i.test(phrase);

  const name = cleanFieldName(phrase);
  if (!name) return null;

  const type: AiTableFieldType = choices.length > 0 ? 'choice' : inferType(phrase);

  const field: AiTableField = {
    display_name: titleCase(name),
    logical_name: slug(name),
    type,
    required,
    description: null,
  };
  if (type === 'choice' && choices.length > 0) field.choices = choices.slice(0, 50);
  return field;
}

// Strip the leading verbs/articles and trailing "table"/"entity" from the part of
// the prompt before the column list, leaving just the table's subject.
function extractTableName(namePart: string): string {
  let name = namePart.trim();
  name = name.replace(/^(?:please|kindly)\s+/i, '');
  name = name.replace(/^(?:i\s+(?:want|need|would\s+like)\s+(?:to\s+)?)/i, '');
  name = name.replace(/^(?:create|make|build|add|generate|design|set\s*up)\s+/i, '');
  name = name.replace(/^(?:a|an|the|new)\s+/i, '');
  name = name.replace(/\b(?:table|entity)\b/gi, ' ');
  name = name.replace(/^(?:called|named|for|to\s+track|to\s+store|to\s+manage|of)\s+/i, '');
  name = name.replace(/["'`]/g, '');
  name = name.replace(/[.:;]+\s*$/g, '');
  name = name.replace(/\s+/g, ' ').trim();
  return name;
}

export function parseTablePrompt(prompt: string, existingNames: string[] = []): TableParseResult | TableParseError {
  const text = prompt.trim();
  if (!text) {
    return {
      message: 'Please describe the table you want to create.',
      suggestions: [
        'A loan application table with applicant name, amount, status (Draft, Submitted, Approved), and application date.',
      ],
    };
  }

  // Split the prompt into "name part" and "fields part" at the first connector.
  const connector = /\b(?:with(?:\s+the)?(?:\s+(?:columns?|fields?))?|that\s+ha(?:s|ve)|having|containing|contains|includ(?:ing|es)|has\s+the\s+following|fields?)\b\s*:?|:/i;
  const cIdx = text.search(connector);

  let namePart = text;
  let fieldsPart = '';
  if (cIdx >= 0) {
    const m = text.match(connector)!;
    namePart = text.slice(0, cIdx);
    fieldsPart = text.slice(cIdx + m[0].length);
  }

  const subject = extractTableName(namePart) || extractTableName(text) || 'New Table';
  const displayName = titleCase(subject) || 'New Table';
  let logical = slug(subject) || 'custom_table';
  if (!/^[a-z]/.test(logical)) logical = `t_${logical}`;

  // Uniquify against existing tables so create_crm_entity never collides.
  const warnings: string[] = [];
  const taken = new Set(existingNames);
  if (taken.has(logical)) {
    let i = 2;
    let candidate = `${logical}_${i}`;
    while (taken.has(candidate)) candidate = `${logical}_${++i}`;
    warnings.push(`A table named "${logical}" already exists — using "${candidate}".`);
    logical = candidate;
  }

  // Parse the columns.
  const fields: AiTableField[] = [];
  const seen = new Set<string>();
  if (fieldsPart.trim()) {
    for (const phrase of splitFieldList(fieldsPart)) {
      if (fields.length >= MAX_FIELDS) {
        warnings.push(`Only the first ${MAX_FIELDS} columns were kept.`);
        break;
      }
      const f = parseFieldPhrase(phrase);
      if (!f) continue;
      if (!f.logical_name) continue;
      if (RESERVED.has(f.logical_name)) {
        warnings.push(`"${f.display_name}" matches a built-in system column — skipped.`);
        continue;
      }
      if (seen.has(f.logical_name)) {
        warnings.push(`Duplicate column "${f.display_name}" — skipped.`);
        continue;
      }
      seen.add(f.logical_name);
      fields.push(f);
    }
  }

  if (fields.length === 0) {
    return {
      message:
        'I understood the table name but no columns. List the columns after "with", separated by commas.',
      suggestions: [
        `${displayName ? `A ${displayName.toLowerCase()} table` : 'A table'} with a name, amount, status (Open, Closed), and a date.`,
        'Tip: put choice options in parentheses, e.g. "priority (Low, Medium, High)".',
      ],
    };
  }

  const spec: AiTableSpec = {
    display_name: displayName,
    display_name_plural: pluralize(displayName),
    logical_name: logical,
    physical_table_name: `crm_${logical}`,
    primary_field_label: 'Name',
    description: null,
    ownership_type: 'user',
    fields,
  };

  return { spec, warnings };
}
