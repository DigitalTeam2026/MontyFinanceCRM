/*
  # Soft-delete lead_qualification_rule RPC

  Problem: PostgREST UPDATE goes through SELECT RLS (USING clause) before and
  after the write. The SELECT policy filters `deleted_at IS NULL`, so after the
  soft-delete sets deleted_at the post-write SELECT sees 0 rows and PostgREST
  reports a policy violation (403).

  Solution: a SECURITY DEFINER RPC that performs the soft-delete as the function
  owner (bypassing RLS), but still enforces that only non-system rules can be
  deleted and the caller is authenticated.
*/

CREATE OR REPLACE FUNCTION soft_delete_qualification_rule(p_rule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only authenticated users, only non-system rules
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE lead_qualification_rule
  SET deleted_at = now(),
      is_active  = false,
      is_default = false
  WHERE lead_qualification_rule_id = p_rule_id
    AND is_system = false
    AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION soft_delete_qualification_rule(uuid) TO authenticated;
