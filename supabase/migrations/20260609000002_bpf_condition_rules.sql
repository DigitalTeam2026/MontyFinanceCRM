/*
  # BPF Condition — compound AND/OR rule groups

  Adds `condition_rules` (jsonb) to `process_stage` so a Condition component can hold
  multiple rules combined with AND/OR and nested groups, instead of a single
  field/operator/value.

  Shape (a group; rules are leaves or nested groups):
    {
      "logic": "AND" | "OR",
      "rules": [
        { "field": "...", "operator": "eq", "value": "..." },
        { "logic": "OR", "rules": [ ... ] }
      ]
    }

  Backward compatible: when `condition_rules` is null/empty the engine falls back to the
  existing condition_field / condition_operator / condition_value single rule. The first
  leaf rule is also mirrored into those columns on save so older readers keep working.
*/

ALTER TABLE process_stage
  ADD COLUMN IF NOT EXISTS condition_rules jsonb;
