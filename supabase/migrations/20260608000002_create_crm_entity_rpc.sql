/*
  # Create CRM Entity RPC

  ## Overview
  Adds secure backend functions for creating, repairing, and health-checking custom CRM entity
  physical tables from Admin Studio. All DDL is executed server-side through SECURITY DEFINER
  functions with an internal admin guard — no raw SQL ever runs in the browser.

  ## Functions

  ### 1. public.set_modified_at()
  Trigger function that auto-updates `modified_at` on every UPDATE row.
  Safe to re-run (CREATE OR REPLACE).

  ### 2. public.create_crm_entity(...)
  Creates a physical PostgreSQL table + entity_definition metadata atomically.
  - Validates all identifiers (regex pattern + reserved-word blocklist)
  - Checks uniqueness of logical_name and physical_table_name in entity_definition
  - Checks the physical table does not already exist in information_schema
  - Creates the table with standard CRM columns (PK, name, ownership, state, audit, soft-delete)
  - Creates six indexes (owner, business_unit, state_code, is_deleted, created_at, name col)
  - Enables RLS with three ownership-based policies (SELECT, INSERT, UPDATE)
  - Attaches the set_modified_at trigger
  - Inserts the entity_definition row
  - Returns {ok, entity} on success or {ok, error} on failure
  - Any failure rolls back all DDL and metadata changes atomically (EXCEPTION handler)

  ### 3. public.entity_table_health(p_entity_id uuid)
  Returns JSON with table_exists flag. Used by the entity detail page to show
  the "Missing physical table" warning. Read-only; no writes.

  ### 4. public.repair_crm_entity_table(p_entity_id uuid)
  Creates the missing physical table for a custom entity using the same schema
  as create_crm_entity. Skips silently if the table already exists.
  Cannot repair system (non-custom) entities.

  ## Security
  - All four functions: SECURITY DEFINER, authenticated role, is_system_admin() guard.
  - All identifiers validated with regex before any EXECUTE to prevent SQL injection.
  - Revoked from anon.
  - Max identifier length of 40 chars enforced to keep trigger names within PostgreSQL's 63-char limit.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. set_modified_at — trigger function
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_modified_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.modified_at = now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: _crm_entity_create_table_ddl
-- Extracted so both create and repair use identical DDL
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._crm_entity_create_table_ddl(
  p_physical_table_name text,
  p_pk_col              text,
  p_primary_field_name  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security, pg_temp
AS $$
BEGIN
  -- Physical table
  EXECUTE format(
    'CREATE TABLE public.%I (
      %I               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      %I               text        NOT NULL DEFAULT '''',
      owner_type       text        NOT NULL DEFAULT ''user''
                                   CHECK (owner_type IN (''user'', ''team'')),
      owner_id         uuid        NOT NULL,
      business_unit_id uuid        REFERENCES public.business_unit(business_unit_id),
      state_code       text        NOT NULL DEFAULT ''active'',
      status_reason    text,
      custom_fields    jsonb,
      created_at       timestamptz NOT NULL DEFAULT now(),
      created_by       uuid        REFERENCES public.crm_user(user_id),
      modified_at      timestamptz NOT NULL DEFAULT now(),
      modified_by      uuid        REFERENCES public.crm_user(user_id),
      is_deleted       boolean     NOT NULL DEFAULT false,
      version_no       integer     NOT NULL DEFAULT 1
    )',
    p_physical_table_name,
    p_pk_col,
    p_primary_field_name
  );

  -- Indexes
  EXECUTE format('CREATE INDEX ON public.%I (owner_type, owner_id)',     p_physical_table_name);
  EXECUTE format('CREATE INDEX ON public.%I (business_unit_id)',         p_physical_table_name);
  EXECUTE format('CREATE INDEX ON public.%I (state_code)',               p_physical_table_name);
  EXECUTE format('CREATE INDEX ON public.%I (is_deleted)',               p_physical_table_name);
  EXECUTE format('CREATE INDEX ON public.%I (created_at)',               p_physical_table_name);
  EXECUTE format('CREATE INDEX ON public.%I (%I)', p_physical_table_name, p_primary_field_name);

  -- Row-level security
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_physical_table_name);

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
     USING (is_deleted = false
       AND crm_user_has_access(%L, %I, owner_type, owner_id))',
    'rls_' || p_physical_table_name || '_sel',
    p_physical_table_name,
    p_physical_table_name,
    p_pk_col
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
     WITH CHECK (created_by = auth.uid())',
    'rls_' || p_physical_table_name || '_ins',
    p_physical_table_name
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
     USING (crm_user_has_access(%L, %I, owner_type, owner_id))
     WITH CHECK (modified_by = auth.uid())',
    'rls_' || p_physical_table_name || '_upd',
    p_physical_table_name,
    p_physical_table_name,
    p_pk_col
  );

  -- Modified-at trigger
  EXECUTE format(
    'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
     FOR EACH ROW EXECUTE FUNCTION public.set_modified_at()',
    'trg_' || p_physical_table_name || '_modified_at',
    p_physical_table_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public._crm_entity_create_table_ddl(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._crm_entity_create_table_ddl(text, text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. create_crm_entity
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_crm_entity(
  p_logical_name        text,
  p_display_name        text,
  p_display_name_plural text,
  p_physical_table_name text,
  p_primary_field_name  text,
  p_description         text    DEFAULT NULL,
  p_icon_name           text    DEFAULT NULL,
  p_ownership_type      text    DEFAULT 'user',
  p_enable_activities   boolean DEFAULT false,
  p_enable_notes        boolean DEFAULT false,
  p_enable_audit        boolean DEFAULT false,
  p_allow_timeline      boolean DEFAULT false,
  p_is_active           boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security, pg_temp
AS $$
DECLARE
  v_reserved text[] := ARRAY[
    'all','analyse','analyze','and','any','array','as','asc','asymmetric',
    'authorization','between','binary','both','case','cast','check','collate',
    'collation','column','concurrently','constraint','create','cross',
    'current_catalog','current_date','current_role','current_schema',
    'current_time','current_timestamp','current_user','default','deferrable',
    'desc','distinct','do','else','end','except','false','fetch','for',
    'foreign','freeze','from','full','grant','group','having','ilike','in',
    'initially','inner','intersect','into','is','isnull','join','lateral',
    'leading','left','like','limit','localtime','localtimestamp','natural',
    'not','notnull','null','offset','on','only','or','order','outer',
    'overlaps','placing','primary','references','returning','right','select',
    'session_user','similar','some','symmetric','table','tablesample','then',
    'to','trailing','true','union','unique','user','using','variadic',
    'verbose','when','where','window','with','index','trigger','function',
    'procedure','view','sequence','schema','type','domain','role','database'
  ];
  v_pk_col    text;
  v_entity_id uuid;
  v_result    json;
BEGIN
  -- Admin guard
  IF NOT security.is_system_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'Admin access required');
  END IF;

  -- Validate logical_name (max 40 chars for safe trigger/policy name construction)
  IF p_logical_name !~ '^[a-z][a-z0-9_]{0,39}$' THEN
    RETURN json_build_object('ok', false, 'error',
      'Logical name must be 1–40 lowercase alphanumeric characters or underscores, starting with a letter');
  END IF;

  -- Validate physical_table_name (same constraint)
  IF p_physical_table_name !~ '^[a-z][a-z0-9_]{0,39}$' THEN
    RETURN json_build_object('ok', false, 'error',
      'Physical table name must be 1–40 lowercase alphanumeric characters or underscores, starting with a letter');
  END IF;

  -- Validate primary_field_name
  IF p_primary_field_name !~ '^[a-z][a-z0-9_]{0,62}$' THEN
    RETURN json_build_object('ok', false, 'error',
      'Primary field name must be lowercase alphanumeric/underscores, starting with a letter');
  END IF;

  -- Validate ownership_type
  IF p_ownership_type NOT IN ('user', 'team', 'organization') THEN
    RETURN json_build_object('ok', false, 'error',
      'Ownership type must be one of: user, team, organization');
  END IF;

  -- Reserved word check
  IF p_logical_name = ANY(v_reserved) THEN
    RETURN json_build_object('ok', false, 'error',
      format('"%s" is a reserved SQL keyword and cannot be used as a logical name', p_logical_name));
  END IF;
  IF p_physical_table_name = ANY(v_reserved) THEN
    RETURN json_build_object('ok', false, 'error',
      format('"%s" is a reserved SQL keyword and cannot be used as a physical table name', p_physical_table_name));
  END IF;

  -- Uniqueness: logical_name (check ALL rows — unique constraint applies even to soft-deleted)
  IF EXISTS (
    SELECT 1 FROM entity_definition
    WHERE logical_name = p_logical_name
  ) THEN
    RETURN json_build_object('ok', false, 'error',
      format('An entity with logical name "%s" already exists (including previously deleted entities)', p_logical_name));
  END IF;

  -- Uniqueness: physical_table_name (check ALL rows)
  IF EXISTS (
    SELECT 1 FROM entity_definition
    WHERE physical_table_name = p_physical_table_name
  ) THEN
    RETURN json_build_object('ok', false, 'error',
      format('An entity with physical table name "%s" already exists (including previously deleted entities)', p_physical_table_name));
  END IF;

  -- Physical table must not already exist
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_physical_table_name
  ) THEN
    RETURN json_build_object('ok', false, 'error',
      format('A database table named "%s" already exists', p_physical_table_name));
  END IF;

  -- Build PK column name: <logical_name>_id
  v_pk_col := p_logical_name || '_id';

  -- Create table, indexes, RLS, trigger (single atomic block — any failure rolls back)
  PERFORM public._crm_entity_create_table_ddl(
    p_physical_table_name, v_pk_col, p_primary_field_name
  );

  -- Insert entity_definition metadata
  INSERT INTO entity_definition (
    logical_name,
    display_name,
    display_name_plural,
    physical_table_name,
    primary_field_name,
    description,
    icon_name,
    ownership_type,
    enable_activities,
    enable_notes,
    enable_audit,
    allow_timeline,
    is_active,
    is_custom
  ) VALUES (
    p_logical_name,
    p_display_name,
    p_display_name_plural,
    p_physical_table_name,
    p_primary_field_name,
    p_description,
    p_icon_name,
    p_ownership_type,
    p_enable_activities,
    p_enable_notes,
    p_enable_audit,
    p_allow_timeline,
    p_is_active,
    true
  )
  RETURNING entity_definition_id INTO v_entity_id;

  SELECT json_build_object('ok', true, 'entity', row_to_json(ed))
  INTO v_result
  FROM entity_definition ed
  WHERE ed.entity_definition_id = v_entity_id;

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  -- Exception handler rolls back all DDL and the metadata insert
  RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT  EXECUTE ON FUNCTION public.create_crm_entity(
  text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, boolean, boolean
) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_crm_entity(
  text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, boolean, boolean
) FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. entity_table_health — read-only check
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.entity_table_health(p_entity_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, security, pg_temp
AS $$
DECLARE
  v_entity entity_definition%ROWTYPE;
  v_exists boolean;
BEGIN
  IF NOT security.is_system_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'Admin access required');
  END IF;

  SELECT * INTO v_entity
  FROM entity_definition
  WHERE entity_definition_id = p_entity_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Entity not found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = v_entity.physical_table_name
  ) INTO v_exists;

  RETURN json_build_object(
    'ok',           true,
    'entity_id',    v_entity.entity_definition_id,
    'logical_name', v_entity.logical_name,
    'table_name',   v_entity.physical_table_name,
    'table_exists', v_exists,
    'is_custom',    v_entity.is_custom
  );
END;
$$;

GRANT  EXECUTE ON FUNCTION public.entity_table_health(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.entity_table_health(uuid) FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. repair_crm_entity_table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.repair_crm_entity_table(p_entity_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security, pg_temp
AS $$
DECLARE
  v_entity entity_definition%ROWTYPE;
  v_pk_col text;
BEGIN
  IF NOT security.is_system_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'Admin access required');
  END IF;

  SELECT * INTO v_entity
  FROM entity_definition
  WHERE entity_definition_id = p_entity_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Entity not found');
  END IF;

  IF NOT v_entity.is_custom THEN
    RETURN json_build_object('ok', false, 'error',
      'Cannot repair system-managed entities — contact support');
  END IF;

  -- Already exists — nothing to do
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name   = v_entity.physical_table_name
  ) THEN
    RETURN json_build_object(
      'ok',            true,
      'already_existed', true,
      'message',       format('Table "%s" already exists — no action taken', v_entity.physical_table_name)
    );
  END IF;

  -- Safety: re-validate stored identifier
  IF v_entity.physical_table_name !~ '^[a-z][a-z0-9_]{0,39}$' THEN
    RETURN json_build_object('ok', false, 'error',
      format('Stored table name "%s" is not a valid identifier', v_entity.physical_table_name));
  END IF;

  v_pk_col := v_entity.logical_name || '_id';

  PERFORM public._crm_entity_create_table_ddl(
    v_entity.physical_table_name,
    v_pk_col,
    v_entity.primary_field_name
  );

  RETURN json_build_object(
    'ok',            true,
    'already_existed', false,
    'message',       format('Table "%s" created successfully', v_entity.physical_table_name)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT  EXECUTE ON FUNCTION public.repair_crm_entity_table(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.repair_crm_entity_table(uuid) FROM anon;
