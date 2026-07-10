/*
  drop_field_column — allow CASCADE so deleting a custom column also removes the
  column-local objects that depend on it (its own FK constraint, indexes, and any
  BEFORE INSERT/UPDATE trigger whose WHEN clause references the column).

  Motivation
  ----------
  Deleting the Opportunity "Product" lookup (column product_id) failed with:

    cannot drop column product_id of table opportunity because other objects
    depend on it

  The blocker is the row-security trigger `trg_validate_product_access_opportunity`,
  whose `WHEN (new.product_id IS NOT NULL)` clause creates a hard (RESTRICT)
  dependency on the column. The FK constraint and index drop automatically; only
  the trigger blocks the plain DROP COLUMN.

  CASCADE drops exactly the column-local dependents — the trigger on THIS table,
  its FK, and its index. It does NOT drop the shared trigger *function*
  (fn_validate_product_access_on_save, also used by the lead table) nor the lead
  trigger, because those do not depend on opportunity.product_id.

  Safety
  ------
  CASCADE is opt-in via p_cascade (default false). The create-field rollback path
  (dropPhysicalColumn) keeps the safe non-cascade behavior — a just-created column
  has no dependents. Only the deliberate user-initiated delete passes p_cascade=true.
*/

-- Old 2-arg signatures are replaced by 3-arg versions. Drop them first so
-- PostgREST resolves calls unambiguously to the new function.
DROP FUNCTION IF EXISTS public.drop_field_column(text, text);
DROP FUNCTION IF EXISTS security.drop_field_column(text, text);

CREATE OR REPLACE FUNCTION security.drop_field_column(
  p_table   text,
  p_column  text,
  p_cascade boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, security, pg_catalog
AS $$
BEGIN
  IF NOT security.is_system_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'Admin access required');
  END IF;
  IF p_table  !~ '^[a-z][a-z0-9_]*$' THEN
    RETURN json_build_object('ok', false, 'error', 'Invalid table name');
  END IF;
  IF p_column !~ '^[a-z][a-z0-9_]*$' THEN
    RETURN json_build_object('ok', false, 'error', 'Invalid column name');
  END IF;
  EXECUTE format(
    'ALTER TABLE public.%I DROP COLUMN IF EXISTS %I %s',
    p_table, p_column,
    CASE WHEN p_cascade THEN 'CASCADE' ELSE 'RESTRICT' END
  );
  RETURN json_build_object('ok', true);
END;
$$;

-- This deployment has no anon/authenticated roles; access is gated inside the
-- function by security.is_system_admin(). Grant to public (the only role).
GRANT EXECUTE ON FUNCTION security.drop_field_column(text, text, boolean) TO public;

CREATE OR REPLACE FUNCTION public.drop_field_column(
  p_table   text,
  p_column  text,
  p_cascade boolean DEFAULT false
)
RETURNS json
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT security.drop_field_column(p_table, p_column, p_cascade);
$$;

GRANT EXECUTE ON FUNCTION public.drop_field_column(text, text, boolean) TO public;
