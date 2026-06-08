/*
  # Add get_my_shared_record_ids RPC

  ## Summary
  Adds a new RPC `get_my_shared_record_ids(entity_name)` that uses `auth.uid()` internally
  instead of requiring the caller to pass a user_id. This eliminates any risk of the wrong
  user ID being passed from the frontend and makes shared record fetching more reliable.

  ## Changes
  - New function `public.get_my_shared_record_ids(p_entity_name text)` — returns all record IDs
    shared with the currently authenticated user (direct or via team), with all 5 permission flags.
  - Grants EXECUTE to authenticated role only.
*/

CREATE OR REPLACE FUNCTION public.get_my_shared_record_ids(
  p_entity_name text
)
RETURNS TABLE (
  record_id  uuid,
  can_read   boolean,
  can_write  boolean,
  can_delete boolean,
  can_assign boolean,
  can_share  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    rs.record_id,
    bool_or(rs.can_read)   AS can_read,
    bool_or(rs.can_write)  AS can_write,
    bool_or(rs.can_delete) AS can_delete,
    bool_or(rs.can_assign) AS can_assign,
    bool_or(rs.can_share)  AS can_share
  FROM record_share rs
  WHERE rs.entity_name = p_entity_name
    AND (
      (rs.principal_type = 'user' AND rs.principal_id = auth.uid())
      OR
      (rs.principal_type = 'team' AND EXISTS (
        SELECT 1 FROM team_user tu
         WHERE tu.team_id = rs.principal_id
           AND tu.user_id = auth.uid()
      ))
    )
  GROUP BY rs.record_id;
$$;

REVOKE ALL ON FUNCTION public.get_my_shared_record_ids(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_shared_record_ids(text) TO authenticated;
