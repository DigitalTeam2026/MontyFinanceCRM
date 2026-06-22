/*
  # Fix: soft-deleting a dashboard 403s for EVERYONE (owner + admin included)

  Symptom: PATCH /rest/v1/dashboard?dashboard_id=eq.<id> setting `deleted_at`
  returns 403 (PostgREST) / 42501 (Postgres "new row violates row-level security
  policy"), even for the owner and for system admins.

  Root cause: soft-delete is an UPDATE that sets `deleted_at` to a non-null
  value. Postgres validates the resulting row against the SELECT policy
  `dash_sel`, whose USING clause was `deleted_at IS NULL AND dashboard_can(read)`.
  The just-deleted row has `deleted_at` NOT NULL, so it fails `dash_sel` and the
  UPDATE is rejected. This is independent of `dash_upd`'s WITH CHECK (which the
  owner/admin already pass via security.dashboard_can(..., 'write')), which is why
  the earlier dashboard_can owner-lookup fix (20260619140000) did not resolve it.
  (Restore — setting deleted_at = NULL — was never affected: the restored row
  satisfies `deleted_at IS NULL`.)

  Fix: widen `dash_sel` so a soft-deleted row is still visible to principals who
  hold the 'delete' privilege on it. The resulting deleted row then passes the
  SELECT check and the UPDATE succeeds. This also lets delete-privileged users
  list soft-deleted dashboards (recycle bin) via a direct query.

  Security is preserved:
    - Non-deleted rows: unchanged — `deleted_at IS NULL AND dashboard_can(read)`.
    - Deleted rows: visible ONLY to principals with dashboard_can(..., 'delete')
      (owner, system admin, or an explicit can_delete grant). A read-only user
      (e.g. org-wide can_read but not can_delete) still cannot see or soft-delete.
    - Soft-delete now effectively requires the 'delete' privilege (the new row
      must pass the SELECT check), which is the correct semantic for a delete.

  Verified against the live DB (rolled-back transactions impersonating each role):
    - system admin owner  -> soft-delete affects 1 row (succeeds)
    - read-only org user  -> soft-delete affects 0 rows (filtered, cannot delete)
    - restore (-> NULL)   -> still succeeds
*/

ALTER POLICY dash_sel ON public.dashboard
  USING (
    (deleted_at IS NULL AND security.dashboard_can(dashboard_id, 'read'::text))
    OR
    (deleted_at IS NOT NULL AND security.dashboard_can(dashboard_id, 'delete'::text))
  );

NOTIFY pgrst, 'reload schema';
