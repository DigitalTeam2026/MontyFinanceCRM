/*
  # RPC to fetch column names for a given table

  1. New Functions
    - `get_table_columns(p_table text)` returns a JSON array of column names
      for the specified public table. Used by the frontend to dynamically
      determine which system columns (created_by, modified_by, etc.) exist
      on each entity table before building queries.

  2. Security
    - Function is SECURITY DEFINER with search_path locked to public
    - Accessible to authenticated users only
*/

CREATE OR REPLACE FUNCTION public.get_table_columns(p_table text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'cols',
    COALESCE(
      (SELECT json_agg(column_name ORDER BY ordinal_position)
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = p_table),
      '[]'::json
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_table_columns(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_table_columns(text) TO authenticated;
