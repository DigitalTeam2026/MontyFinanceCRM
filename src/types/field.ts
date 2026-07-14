export interface FieldType {
  field_type_id: string;
  name: string;
  display_name: string;
  description: string | null;
  sort_order: number;
}

export interface ValidationRules {
  min_length?: number;
  max_length?: number;
  min_value?: number;
  max_value?: number;
  regex_pattern?: string;
  regex_message?: string;
  custom_message?: string;
}

export interface ChoiceOption {
  value: string;
  label: string;
  color?: string;
  /** Optional SVG icon stored inline as a data URI (data:image/svg+xml;...). Shown next to the label in views. */
  icon?: string;
  sort_order: number;
}

export interface FieldDefinition {
  field_definition_id: string;
  entity_definition_id: string;
  field_type_id: string;
  lookup_entity_id: string | null;
  logical_name: string;
  display_name: string;
  physical_column_name: string;
  description: string | null;
  placeholder: string | null;
  default_value: string | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  is_required: boolean;
  is_searchable: boolean;
  is_sortable: boolean;
  is_filterable: boolean;
  is_custom: boolean;
  is_system: boolean;
  is_deletable: boolean;
  is_schema_editable: boolean;
  is_active: boolean;
  sort_order: number;
  is_secured: boolean;
  validation_rules: ValidationRules | null;
  config_json: Record<string, unknown> | null;
  deleted_at: string | null;
  created_at: string;
  modified_at: string;
  field_type?: FieldType;
  lookup_entity?: {
    physical_table_name: string;
    primary_field_name: string;
    primary_key_column?: string | null;
  } | null;
}

// ── Legacy numeric token formula (still read for backward compatibility) ───────
export type CalcToken =
  | { type: 'field'; fieldName: string; displayName: string }
  | { type: 'operator'; op: '+' | '-' | '*' | '/' }
  | { type: 'number'; value: number };

export interface CalcFormula {
  tokens: CalcToken[];
}

// ── Dynamics-365-style IF / THEN / ELSE calculation definition (v2) ────────────

/** Data type the calculated column produces — drives the physical column type. */
export type CalcResultType = 'text' | 'number' | 'currency' | 'date' | 'boolean' | 'choice';

export type CalcOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'starts_with' | 'ends_with'
  | 'is_empty' | 'is_not_empty';

export type CalcArithOp = '+' | '-' | '*' | '/';

/**
 * Supported formula functions. Date/time functions only — arithmetic
 * (Add/Subtract/Multiply/Divide) is expressed with CalcArithOp operators between
 * operands, which is nicer UX than nesting Add(a, b). New functions can be added
 * here and to CALC_FUNCTIONS in calcEngine.ts + the server evaluator.
 */
export type CalcFunction = 'DiffInDays' | 'DiffInHours' | 'DiffInMinutes' | 'Now' | 'Today';

/** One condition row: <field> <operator> <value>. */
export interface CalcConditionRow {
  id: string;
  field: string;        // source field logical name (form values are keyed by logical name)
  column: string;       // source field physical column (DB rows are keyed by physical name)
  fieldType: string;    // 'text' | 'number' | 'currency' | 'date' | 'boolean' | 'choice' | …
  displayName: string;
  operator: CalcOperator;
  value: string;        // raw string; coerced by fieldType at evaluation (unused for is_empty/is_not_empty)
}

export interface CalcConditionGroup {
  logic: 'and' | 'or';
  rows: CalcConditionRow[];
}

/**
 * A single operand in a result expression. Recursive: a `function` operand's
 * parameters are themselves operands, so formulas nest arbitrarily
 * (e.g. DiffInDays(startApprovalOn, Now())).
 */
export type CalcOperand =
  | { kind: 'field'; field: string; column: string; fieldType: string; displayName: string }
  | { kind: 'value'; value: string }
  | { kind: 'function'; fn: CalcFunction; args: CalcOperand[] };

/** Result expression: operands folded left-to-right with arithmetic operators (numeric results only). */
export interface CalcExpression {
  operands: CalcOperand[];     // length >= 1
  operators: CalcArithOp[];    // length = operands.length - 1 (meaningful only for numeric/currency)
}

/** One IF/ELSE-IF/ELSE branch. The first branch whose condition matches wins. */
export interface CalcBranch {
  id: string;
  isDefault: boolean;            // true => ELSE branch (condition ignored)
  condition: CalcConditionGroup;
  result: CalcExpression;
}

export interface CalculationConfig {
  version: 2;
  resultType: CalcResultType;
  branches: CalcBranch[];
}

export type FieldFormData = {
  entity_definition_id: string;
  field_type_id: string;
  lookup_entity_id: string | null;
  logical_name: string;
  display_name: string;
  physical_column_name: string;
  description: string | null;
  placeholder: string | null;
  default_value: string | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  is_required: boolean;
  is_searchable: boolean;
  is_sortable: boolean;
  is_filterable: boolean;
  is_active: boolean;
  is_secured: boolean;
  sort_order: number;
  validation_rules: ValidationRules | null;
  inline_choices: ChoiceOption[];
  config_json?: Record<string, unknown> | null;
};
