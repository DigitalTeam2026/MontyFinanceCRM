/*
  # get_table_pk

  Returns the primary-key column name of a public table, read from the catalog.
  Used by the api-integration-inbound function to resolve lookup foreign keys
  generically — entity PKs do not always follow the `<logical_name>_id`
  convention (e.g. crm_user's PK is user_id), so the name must come from the DB
  rather than being assumed or hardcoded.
*/
CREATE OR REPLACE FUNCTION public.get_table_pk(p_table text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE v_col text;
BEGIN
  IF p_table !~ '^[a-z][a-z0-9_]*$' THEN RETURN NULL; END IF;
  SELECT a.attname INTO v_col
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
  WHERE i.indrelid = ('public.' || p_table)::regclass
    AND i.indisprimary
  LIMIT 1;
  RETURN v_col;
EXCEPTION WHEN others THEN
  RETURN NULL;
END; $$;

REVOKE ALL ON FUNCTION public.get_table_pk(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_table_pk(text) TO authenticated, service_role;
