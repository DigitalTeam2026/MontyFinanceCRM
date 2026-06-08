/*
  # Add public schema aliases for validation RPCs

  The Supabase JS client only exposes functions in the public schema via supabase.rpc().
  The security-schema functions need public wrappers so the admin UI can call them.

  These wrappers delegate to the security-schema implementations which perform all
  input validation and use SECURITY DEFINER.
*/

CREATE OR REPLACE FUNCTION public.validate_field_column_alignment()
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
STABLE
SECURITY DEFINER
SET search_path = public, security
AS $$
  SELECT * FROM security.validate_field_column_alignment();
$$;

GRANT EXECUTE ON FUNCTION public.validate_field_column_alignment() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_field_column_alignment() FROM anon;

CREATE OR REPLACE FUNCTION public.admin_add_missing_column(
  p_table    text,
  p_column   text,
  p_sql_type text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, security
AS $$
  SELECT security.admin_add_missing_column(p_table, p_column, p_sql_type);
$$;

GRANT EXECUTE ON FUNCTION public.admin_add_missing_column(text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_add_missing_column(text, text, text) FROM anon;
