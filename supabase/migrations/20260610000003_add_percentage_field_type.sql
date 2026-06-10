-- Replace the duplicate 'whole_number' field type (display_name = 'Whole Number')
-- with a 'Percentage' type. The 'number' type remains the canonical Whole Number.
-- Percentage values are stored as numeric decimals and displayed with a % symbol.

UPDATE field_type
SET
  display_name = 'Percentage',
  description  = 'Numeric value displayed with a % symbol; supports decimal percentages'
WHERE name = 'whole_number';
