/*
  # Fix get_table_columns RPC to use SECURITY DEFINER

  1. Problem
    - The `get_table_columns` function uses SECURITY INVOKER, meaning it runs
      with the calling user's privileges.
    - Authenticated users cannot read `information_schema.columns`, so the
      function always returns an empty array for them.
    - This causes `saveRecord` to skip setting system defaults (owner_id,
      created_by, state_code, etc.) when creating records for dynamic entities
      like Industry, Currency, and Country, leading to insert failures.

  2. Fix
    - Recreate the function with SECURITY DEFINER so it can always read
      information_schema.columns.
    - Restrict search_path to prevent search-path hijacking.
    - Grant EXECUTE to authenticated role only.
*/

CREATE OR REPLACE FUNCTION public.get_table_columns(p_table text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('cols', '[]'::json);
  END IF;

  RETURN (
    SELECT json_build_object(
      'cols',
      COALESCE(
        (SELECT json_agg(column_name ORDER BY ordinal_position)
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = p_table),
        '[]'::json
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_table_columns(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_table_columns(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_table_columns(text) TO authenticated;
