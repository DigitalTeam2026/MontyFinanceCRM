/*
  # Revoke anon from data-exposure functions

  After DROP + CREATE in migration 218, the default PUBLIC grant was restored
  on the recreated functions. This migration explicitly revokes anon access
  from all data-exposure functions.

  Also cleans up provision_entity_statecodes anon access.
*/

-- Revoke anon from functions recreated in migration 218
REVOKE EXECUTE ON FUNCTION public.get_bu_subtree(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_users_in_bu(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_users_in_bu_subtree(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_table_columns(text) FROM anon;

-- Revoke anon from provision_entity_statecodes (both overloads)
DO $$
BEGIN
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.provision_entity_statecodes(text, text) FROM anon;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.provision_entity_statecodes(text) FROM anon;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.provision_entity_statecodes() FROM anon;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;
