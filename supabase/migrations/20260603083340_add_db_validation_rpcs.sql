/*
  # Database Validation RPCs

  1. New Functions
    - `validate_field_column_alignment` — returns all active field_definition rows annotated
      with whether the physical column actually exists in the database. Classifies each row
      as: 'ok', 'broken' (column missing), 'no_table' (table missing), or 'jsonb' (custom_fields).
    - `admin_add_missing_column` — SECURITY DEFINER; runs ALTER TABLE … ADD COLUMN for a
      missing physical column. Only callable by authenticated users. Validates input to
      prevent SQL injection.

  2. Security
    - Both functions are in the `security` schema and granted only to `authenticated`.
    - `admin_add_missing_column` restricts column names to [a-z0-9_] and SQL types to an
      allow-list to prevent injection.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. validate_field_column_alignment
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION security.validate_field_column_alignment()
RETURNS TABLE (
  entity_name          text,
  logical_name         text,
  physical_table_name  text,
  table_exists         boolean,
  field_definition_id  uuid,
  field_name           text,
  field_logical_name   text,
  physical_column_name text,
  field_type_name      text,
  is_custom            boolean,
  storage_type         text,
  column_exists        boolean,
  status               text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, security
AS $$
  SELECT
    e.display_name                           AS entity_name,
    e.logical_name                           AS logical_name,
    e.physical_table_name                    AS physical_table_name,
    EXISTS (
      SELECT 1 FROM information_schema.tables t
      WHERE t.table_schema = 'public'
        AND t.table_name = e.physical_table_name
    )                                        AS table_exists,
    f.field_definition_id                    AS field_definition_id,
    f.display_name                           AS field_name,
    f.logical_name                           AS field_logical_name,
    f.physical_column_name                   AS physical_column_name,
    COALESCE(ft.name, 'unknown')             AS field_type_name,
    f.is_custom                              AS is_custom,
    CASE
      WHEN f.physical_column_name LIKE 'custom_fields.%' THEN 'JSONB_CUSTOM'
      WHEN f.physical_column_name IS NULL                THEN 'NO_MAPPING'
      ELSE 'PHYSICAL_COLUMN'
    END                                      AS storage_type,
    CASE
      WHEN f.physical_column_name LIKE 'custom_fields.%' THEN TRUE
      WHEN f.physical_column_name IS NULL                THEN NULL
      ELSE EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name   = e.physical_table_name
          AND c.column_name  = f.physical_column_name
      )
    END                                      AS column_exists,
    CASE
      WHEN f.physical_column_name LIKE 'custom_fields.%' THEN 'jsonb'
      WHEN NOT EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_name = e.physical_table_name
      ) THEN 'no_table'
      WHEN f.physical_column_name IS NOT NULL
        AND f.physical_column_name NOT LIKE 'custom_fields.%'
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public'
            AND c.table_name   = e.physical_table_name
            AND c.column_name  = f.physical_column_name
        ) THEN 'broken'
      ELSE 'ok'
    END                                      AS status
  FROM field_definition f
  JOIN entity_definition e ON e.entity_definition_id = f.entity_definition_id
  LEFT JOIN field_type ft   ON ft.field_type_id       = f.field_type_id
  WHERE f.is_active = TRUE
    AND f.physical_column_name IS NOT NULL
  ORDER BY e.display_name, f.display_name;
$$;

GRANT EXECUTE ON FUNCTION security.validate_field_column_alignment() TO authenticated;
REVOKE EXECUTE ON FUNCTION security.validate_field_column_alignment() FROM anon, public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. admin_add_missing_column
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION security.admin_add_missing_column(
  p_table    text,
  p_column   text,
  p_sql_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security
AS $$
DECLARE
  v_allowed_types text[] := ARRAY[
    'text', 'integer', 'bigint', 'numeric', 'boolean',
    'date', 'timestamptz', 'time', 'uuid', 'text[]', 'jsonb'
  ];
BEGIN
  -- Validate table name
  IF p_table !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table;
  END IF;

  -- Validate column name
  IF p_column !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid column name: %', p_column;
  END IF;

  -- Validate SQL type against allow-list
  IF NOT (p_sql_type = ANY(v_allowed_types)) THEN
    RAISE EXCEPTION 'Unsupported SQL type: %', p_sql_type;
  END IF;

  -- Verify table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) THEN
    RAISE EXCEPTION 'Table does not exist: %', p_table;
  END IF;

  -- Skip if column already exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = p_table
      AND column_name  = p_column
  ) THEN
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I %s',
    p_table, p_column, p_sql_type
  );
END;
$$;

GRANT EXECUTE ON FUNCTION security.admin_add_missing_column(text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION security.admin_add_missing_column(text, text, text) FROM anon, public;
