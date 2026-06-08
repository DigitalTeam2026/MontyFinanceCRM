/*
  # Fix mutable search_path on 6 public wrapper functions

  1. Problem
    - Six public functions lack an explicit `search_path` setting, which Supabase
      flags as a security issue (search_path hijacking risk).

  2. Affected functions
    - `public.get_users_in_bu_subtree(uuid)`
    - `public.get_users_in_bu(uuid)`
    - `public.fn_list_active_crm_users()`
    - `public.fn_get_user_display_map(uuid[])`
    - `public.get_table_columns(text)`
    - `public.fn_lookup_user_by_email(text)`

  3. Fix
    - Recreate each function with `SET search_path = public, pg_temp` to pin
      the search path and prevent hijacking.
    - All are thin wrappers that delegate to `security.*` counterparts.
    - No logic changes; only the search_path attribute is added.
*/

-- 1. get_users_in_bu_subtree
CREATE OR REPLACE FUNCTION public.get_users_in_bu_subtree(root_bu_id uuid)
  RETURNS TABLE(user_id uuid)
  LANGUAGE sql
  STABLE
  SET search_path = public, pg_temp
AS $function$
SELECT * FROM security.get_users_in_bu_subtree(root_bu_id);
$function$;

-- 2. get_users_in_bu
CREATE OR REPLACE FUNCTION public.get_users_in_bu(target_bu_id uuid)
  RETURNS TABLE(user_id uuid)
  LANGUAGE sql
  STABLE
  SET search_path = public, pg_temp
AS $function$
SELECT * FROM security.get_users_in_bu(target_bu_id);
$function$;

-- 3. fn_list_active_crm_users
CREATE OR REPLACE FUNCTION public.fn_list_active_crm_users()
  RETURNS TABLE(user_id uuid, email text)
  LANGUAGE sql
  STABLE
  SET search_path = public, pg_temp
AS $function$
SELECT * FROM security.fn_list_active_crm_users();
$function$;

-- 4. fn_get_user_display_map
CREATE OR REPLACE FUNCTION public.fn_get_user_display_map(p_user_ids uuid[])
  RETURNS TABLE(user_id uuid, display_name text)
  LANGUAGE sql
  STABLE
  SET search_path = public, pg_temp
AS $function$
SELECT * FROM security.fn_get_user_display_map(p_user_ids);
$function$;

-- 5. get_table_columns
CREATE OR REPLACE FUNCTION public.get_table_columns(p_table text)
  RETURNS json
  LANGUAGE sql
  STABLE
  SET search_path = public, pg_temp
AS $function$
SELECT security.get_table_columns(p_table);
$function$;

-- 6. fn_lookup_user_by_email
CREATE OR REPLACE FUNCTION public.fn_lookup_user_by_email(p_email text)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SET search_path = public, pg_temp
AS $function$
SELECT security.fn_lookup_user_by_email(p_email);
$function$;
