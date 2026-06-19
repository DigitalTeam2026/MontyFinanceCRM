-- Resolve entity primary keys authoritatively from the Postgres catalog.
--
-- Problem: lookup fields guessed the target table's PK as `${physical_table_name}_id`.
-- That is wrong for prefixed/irregular tables (e.g. crm_leadsource → leadsource_id,
-- product_family → family_id, security_role → role_id), so every such lookup 400'd
-- with "column ... does not exist" until the table was manually added to an override
-- list. This makes PK resolution automatic and permanent.

-- 1) Catalog-backed PK lookup, usable from the client (security definer so RLS/grants
--    on the target table don't hide the catalog read). Returns NULL for unknown tables.
CREATE OR REPLACE FUNCTION public.get_entity_primary_key(p_table text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT a.attname::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
  WHERE c.relname = p_table
  ORDER BY array_position(i.indkey, a.attnum)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_entity_primary_key(text) TO authenticated, anon;

-- 2) Backfill entity_definition.primary_key_column for every entity whose physical
--    table actually exists, so the client reads the correct PK without an extra round
--    trip. Entities pointing at non-existent tables stay NULL (already broken).
UPDATE entity_definition ed
SET primary_key_column = public.get_entity_primary_key(ed.physical_table_name)
WHERE ed.primary_key_column IS NULL
  AND public.get_entity_primary_key(ed.physical_table_name) IS NOT NULL;
