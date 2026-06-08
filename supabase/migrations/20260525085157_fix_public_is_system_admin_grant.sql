/*
  # Fix public.is_system_admin missing EXECUTE grant for authenticated role

  All RLS INSERT/UPDATE/DELETE policies call is_system_admin() without a schema prefix,
  which resolves to public.is_system_admin. That function was only granted to service_role,
  not authenticated, causing 403 "permission denied for function is_system_admin" on all
  admin operations (form_definition, process_flow_entity_config, etc.).

  Grant EXECUTE on public.is_system_admin to authenticated to restore admin functionality.
*/

GRANT EXECUTE ON FUNCTION public.is_system_admin() TO authenticated;
