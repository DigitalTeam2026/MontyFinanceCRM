/*
  # 203 — Lock down audit_log reads and notification-sender spoofing

  ## audit_log SELECT
  The policy "Authenticated users can view audit logs" used USING (true), so any
  authenticated user could read the entire change history of every record in the
  system — including full old_values / new_values snapshots, IP address and user
  agent. The client never reads audit_log (it is written by duplicate-detection
  and record services, and surfaced only to admins), so SELECT is restricted to
  system admins. Per-record user-facing history is served by field_change_log /
  currency_audit_log, which are intentionally left readable.

  ## user_notification INSERT
  The INSERT policy only required auth.uid() IS NOT NULL, so any user could forge
  a notification with an arbitrary sender_id (impersonating another user).
  Notifications are legitimately delivered to OTHER users (assignment alerts,
  mentions), so recipient_id must stay arbitrary, but the sender is now pinned to
  the caller (or NULL for system notifications).
*/

-- ── audit_log: restrict SELECT to system admins ──────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view audit logs" ON public.audit_log;

CREATE POLICY "Only system admins can view audit logs"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (security.is_system_admin());

-- ── user_notification: prevent sender spoofing on INSERT ─────────────────────
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.user_notification;

CREATE POLICY "Users can create notifications without spoofing the sender"
  ON public.user_notification
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND (sender_id = (SELECT auth.uid()) OR sender_id IS NULL)
  );
