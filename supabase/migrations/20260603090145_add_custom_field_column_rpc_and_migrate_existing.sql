/*
  # Real physical columns for custom fields

  ## Summary
  This migration changes the custom field storage strategy from JSONB (`custom_fields` column)
  to real PostgreSQL columns. Every custom field now gets its own physical column on the
  entity table — the same as system fields.

  ## Changes

  ### 1. New RPC: `security.add_custom_field_column`
  - Called by the frontend when a new custom field is created
  - Runs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` with the correct SQL type
  - Maps CRM field types to PostgreSQL column types:
    - text / textarea / email / phone / url / long_text → text
    - number / whole_number → integer
    - decimal / currency / money → numeric(18,4)
    - boolean → boolean
    - date → date
    - datetime / time → timestamptz
    - choice / multi_choice / option_set / multi_option_set / calculated / autonumber / auto_number → text
    - lookup → uuid (FK reference, no hard constraint added to stay flexible)
  - Public wrapper: `public.add_custom_field_column` delegating to security schema

  ### 2. Migrate existing custom fields to real columns
  Three existing custom fields are migrated:
  - `contact.test` (calculated) → `contact.test text`
  - `event.test` (choice)       → `event.test text`
  - `lead.lead_source` (lookup)  → `lead.lead_source uuid`

  For each:
  1. Add the real column (IF NOT EXISTS)
  2. Copy existing JSONB data into the real column
  3. Remove the key from `custom_fields` JSONB
  4. Update `field_definition.physical_column_name` to the real column name

  ### Security
  - Function is SECURITY DEFINER (must write DDL as superuser-equivalent)
  - Only authenticated users can call it (via public wrapper)
  - `is_system_admin()` check prevents non-admins from altering schema
*/

-- ─── 1. RPC: add_custom_field_column ────────────────────────────────────────

CREATE OR REPLACE FUNCTION security.add_custom_field_column(
  p_table   text,
  p_column  text,
  p_type    text   -- CRM field type name e.g. 'text', 'lookup', 'boolean'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_sql_type text;
  v_sql      text;
BEGIN
  -- Admin-only guard
  IF NOT security.is_system_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'Admin access required');
  END IF;

  -- Validate table name (alphanumeric + underscore only)
  IF p_table !~ '^[a-z][a-z0-9_]*$' THEN
    RETURN json_build_object('ok', false, 'error', 'Invalid table name');
  END IF;

  -- Validate column name (alphanumeric + underscore only)
  IF p_column !~ '^[a-z][a-z0-9_]*$' THEN
    RETURN json_build_object('ok', false, 'error', 'Invalid column name');
  END IF;

  -- Map CRM field type → SQL type
  v_sql_type := CASE p_type
    WHEN 'text'             THEN 'text'
    WHEN 'textarea'         THEN 'text'
    WHEN 'long_text'        THEN 'text'
    WHEN 'email'            THEN 'text'
    WHEN 'phone'            THEN 'text'
    WHEN 'url'              THEN 'text'
    WHEN 'calculated'       THEN 'text'
    WHEN 'autonumber'       THEN 'text'
    WHEN 'auto_number'      THEN 'text'
    WHEN 'choice'           THEN 'text'
    WHEN 'multi_choice'     THEN 'text'
    WHEN 'option_set'       THEN 'text'
    WHEN 'multi_option_set' THEN 'text[]'
    WHEN 'number'           THEN 'integer'
    WHEN 'whole_number'     THEN 'integer'
    WHEN 'decimal'          THEN 'numeric(18,4)'
    WHEN 'currency'         THEN 'numeric(18,4)'
    WHEN 'boolean'          THEN 'boolean'
    WHEN 'date'             THEN 'date'
    WHEN 'datetime'         THEN 'timestamptz'
    WHEN 'time'             THEN 'timestamptz'
    WHEN 'lookup'           THEN 'uuid'
    WHEN 'file'             THEN 'text'
    WHEN 'image'            THEN 'text'
    ELSE 'text'
  END;

  -- Build and execute the DDL (identifiers are pre-validated above)
  v_sql := format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I %s', p_table, p_column, v_sql_type);
  EXECUTE v_sql;

  RETURN json_build_object('ok', true, 'column', p_column, 'sql_type', v_sql_type);
END;
$$;

REVOKE ALL ON FUNCTION security.add_custom_field_column(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION security.add_custom_field_column(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION security.add_custom_field_column(text, text, text) TO authenticated;

-- Public wrapper
CREATE OR REPLACE FUNCTION public.add_custom_field_column(
  p_table   text,
  p_column  text,
  p_type    text
)
RETURNS json
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT security.add_custom_field_column(p_table, p_column, p_type);
$$;

REVOKE ALL ON FUNCTION public.add_custom_field_column(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_custom_field_column(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_custom_field_column(text, text, text) TO authenticated;


-- ─── 2. Migrate existing custom fields ───────────────────────────────────────

-- 2a. contact.test (calculated → text)
ALTER TABLE public.contact ADD COLUMN IF NOT EXISTS test text;

UPDATE public.contact
SET test = custom_fields->>'test'
WHERE custom_fields ? 'test'
  AND custom_fields->>'test' IS NOT NULL;

UPDATE public.contact
SET custom_fields = custom_fields - 'test'
WHERE custom_fields ? 'test';

UPDATE public.field_definition
SET physical_column_name = 'test',
    modified_at = now()
WHERE logical_name = 'test'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'contact'
  )
  AND is_custom = true;


-- 2b. event.test (choice → text)
ALTER TABLE public.event ADD COLUMN IF NOT EXISTS test text;

UPDATE public.event
SET test = custom_fields->>'test'
WHERE custom_fields ? 'test'
  AND custom_fields->>'test' IS NOT NULL;

UPDATE public.event
SET custom_fields = custom_fields - 'test'
WHERE custom_fields ? 'test';

UPDATE public.field_definition
SET physical_column_name = 'test',
    modified_at = now()
WHERE logical_name = 'test'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'event'
  )
  AND is_custom = true;


-- 2c. lead.lead_source (lookup → uuid)
ALTER TABLE public.lead ADD COLUMN IF NOT EXISTS lead_source uuid;

UPDATE public.lead
SET lead_source = (custom_fields->>'lead_source')::uuid
WHERE custom_fields ? 'lead_source'
  AND custom_fields->>'lead_source' IS NOT NULL
  AND custom_fields->>'lead_source' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE public.lead
SET custom_fields = custom_fields - 'lead_source'
WHERE custom_fields ? 'lead_source';

UPDATE public.field_definition
SET physical_column_name = 'lead_source',
    modified_at = now()
WHERE logical_name = 'lead_source'
  AND entity_definition_id = (
    SELECT entity_definition_id FROM entity_definition WHERE logical_name = 'lead'
  )
  AND is_custom = true;
