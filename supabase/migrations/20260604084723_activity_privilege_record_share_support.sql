/*
  # Activity Privilege — Record Share Support

  ## Summary
  Updates security.has_activity_privilege() to also honour the record_share table,
  matching the same pattern used by crm_user_has_access() for regular entities.

  A user can read/write/delete/share/assign an activity record if:
    (a) Their security role privilege grants it at the required scope, OR
    (b) The record was explicitly shared with them (user principal) or a team
        they belong to, and the share grants the requested action.

  ## Changes
  - Replaces the existing security.has_activity_privilege() function with an
    extended version that checks record_share for the given record id and action.
  - p_record_id parameter added (nullable) — pass the activity record's primary key
    for read/write/delete/share checks; pass NULL for create checks.

  ## Security
  - SECURITY DEFINER, search_path locked to public and security schemas
  - Only authenticated users can execute
*/

CREATE OR REPLACE FUNCTION security.has_activity_privilege(
  p_entity_name text,
  p_action      text,       -- 'create' | 'read' | 'write' | 'delete' | 'assign' | 'share'
  p_owner_id    uuid DEFAULT NULL,
  p_record_id   uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, security
AS $$
DECLARE
  v_is_admin    boolean;
  v_user_bu_id  uuid;
  v_owner_bu_id uuid;
  v_max_level   int;
BEGIN
  SELECT cu.is_system_admin, cu.business_unit_id
  INTO v_is_admin, v_user_bu_id
  FROM public.crm_user cu
  WHERE cu.user_id = auth.uid();

  IF v_is_admin THEN RETURN true; END IF;

  -- ── Role-based privilege check ─────────────────────────────────────────────
  SELECT MAX(
    CASE p_action
      WHEN 'read' THEN
        CASE rp.read_access_level
          WHEN 'organization'  THEN 4 WHEN 'parent_bu' THEN 3
          WHEN 'business_unit' THEN 2 WHEN 'user'      THEN 1 ELSE 0
        END
      WHEN 'create' THEN
        CASE WHEN rp.can_create THEN
          CASE rp.create_access_level
            WHEN 'organization'  THEN 4 WHEN 'parent_bu' THEN 3
            WHEN 'business_unit' THEN 2 WHEN 'user'      THEN 1 ELSE 0
          END
        ELSE 0 END
      WHEN 'write' THEN
        CASE rp.write_access_level
          WHEN 'organization'  THEN 4 WHEN 'parent_bu' THEN 3
          WHEN 'business_unit' THEN 2 WHEN 'user'      THEN 1 ELSE 0
        END
      WHEN 'delete' THEN
        CASE rp.delete_access_level
          WHEN 'organization'  THEN 4 WHEN 'parent_bu' THEN 3
          WHEN 'business_unit' THEN 2 WHEN 'user'      THEN 1 ELSE 0
        END
      WHEN 'assign' THEN
        CASE rp.assign_access_level
          WHEN 'organization'  THEN 4 WHEN 'parent_bu' THEN 3
          WHEN 'business_unit' THEN 2 WHEN 'user'      THEN 1 ELSE 0
        END
      WHEN 'share' THEN
        CASE rp.share_access_level
          WHEN 'organization'  THEN 4 WHEN 'parent_bu' THEN 3
          WHEN 'business_unit' THEN 2 WHEN 'user'      THEN 1 ELSE 0
        END
      ELSE 0
    END
  ) INTO v_max_level
  FROM public.user_security_role usr
  JOIN public.role_privilege rp
    ON rp.role_id = usr.role_id AND rp.entity_name = p_entity_name
  WHERE usr.user_id = auth.uid()
    AND (
      (p_action = 'read'   AND rp.can_read   = true) OR
      (p_action = 'create' AND rp.can_create = true) OR
      (p_action = 'write'  AND rp.can_write  = true) OR
      (p_action = 'delete' AND rp.can_delete = true) OR
      (p_action = 'assign' AND rp.can_assign = true) OR
      (p_action = 'share'  AND rp.can_share  = true)
    );

  -- Create: no owner/record to scope — just check the flag
  IF p_action = 'create' THEN
    RETURN coalesce(v_max_level, 0) >= 1;
  END IF;

  -- Organisation-wide privilege granted → always allowed
  IF coalesce(v_max_level, 0) = 4 THEN RETURN true; END IF;

  -- ── Record-share check (user direct) ──────────────────────────────────────
  IF p_record_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.record_share rs
      WHERE rs.entity_name    = p_entity_name
        AND rs.record_id      = p_record_id::text
        AND rs.principal_type = 'user'
        AND rs.principal_id   = auth.uid()
        AND (
          (p_action = 'read'   AND rs.can_read   = true) OR
          (p_action = 'write'  AND rs.can_write  = true) OR
          (p_action = 'delete' AND rs.can_delete = true) OR
          (p_action = 'assign' AND rs.can_assign = true) OR
          (p_action = 'share'  AND rs.can_share  = true)
        )
    ) THEN RETURN true; END IF;

    -- ── Record-share check (team member) ──────────────────────────────────────
    IF EXISTS (
      SELECT 1 FROM public.record_share rs
      JOIN public.team_user tu ON tu.team_id = rs.principal_id
      WHERE rs.entity_name    = p_entity_name
        AND rs.record_id      = p_record_id::text
        AND rs.principal_type = 'team'
        AND tu.user_id        = auth.uid()
        AND (
          (p_action = 'read'   AND rs.can_read   = true) OR
          (p_action = 'write'  AND rs.can_write  = true) OR
          (p_action = 'delete' AND rs.can_delete = true) OR
          (p_action = 'assign' AND rs.can_assign = true) OR
          (p_action = 'share'  AND rs.can_share  = true)
        )
    ) THEN RETURN true; END IF;
  END IF;

  -- No privilege at all
  IF coalesce(v_max_level, 0) = 0 THEN RETURN false; END IF;

  -- Scope is user-level: owner must match the caller
  IF v_max_level = 1 THEN
    RETURN p_owner_id = auth.uid();
  END IF;

  -- Scope is BU or BU+
  IF v_max_level IN (2, 3) AND v_user_bu_id IS NOT NULL THEN
    SELECT cu.business_unit_id INTO v_owner_bu_id
    FROM public.crm_user cu WHERE cu.user_id = p_owner_id;

    IF v_max_level = 2 THEN
      RETURN v_owner_bu_id = v_user_bu_id;
    ELSE
      RETURN EXISTS (
        WITH RECURSIVE bu_tree AS (
          SELECT business_unit_id FROM public.business_unit
          WHERE business_unit_id = v_user_bu_id
          UNION ALL
          SELECT bu.business_unit_id FROM public.business_unit bu
          JOIN bu_tree t ON bu.parent_business_unit_id = t.business_unit_id
        )
        SELECT 1 FROM bu_tree WHERE business_unit_id = v_owner_bu_id
      );
    END IF;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION security.has_activity_privilege(text, text, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION security.has_activity_privilege(text, text, uuid, uuid) TO authenticated;

-- ── Rebuild RLS on timeline_note to pass record id for share checks ────────────

DROP POLICY IF EXISTS "Note read privilege required"   ON public.timeline_note;
DROP POLICY IF EXISTS "Note create privilege required" ON public.timeline_note;
DROP POLICY IF EXISTS "Note write privilege required"  ON public.timeline_note;
DROP POLICY IF EXISTS "Note delete privilege required" ON public.timeline_note;

CREATE POLICY "Note read privilege required"
  ON public.timeline_note FOR SELECT TO authenticated
  USING (security.has_activity_privilege('note', 'read', owner_id, note_id));

CREATE POLICY "Note create privilege required"
  ON public.timeline_note FOR INSERT TO authenticated
  WITH CHECK (
    security.has_activity_privilege('note', 'create', NULL, NULL)
    AND created_by = auth.uid()
  );

CREATE POLICY "Note write privilege required"
  ON public.timeline_note FOR UPDATE TO authenticated
  USING  (security.has_activity_privilege('note', 'write', owner_id, note_id))
  WITH CHECK (security.has_activity_privilege('note', 'write', owner_id, note_id));

CREATE POLICY "Note delete privilege required"
  ON public.timeline_note FOR DELETE TO authenticated
  USING (security.has_activity_privilege('note', 'delete', owner_id, note_id));

-- ── Rebuild RLS on timeline_appointment ─────────────────────────────────────

DROP POLICY IF EXISTS "Appointment read privilege required"   ON public.timeline_appointment;
DROP POLICY IF EXISTS "Appointment create privilege required" ON public.timeline_appointment;
DROP POLICY IF EXISTS "Appointment write privilege required"  ON public.timeline_appointment;
DROP POLICY IF EXISTS "Appointment delete privilege required" ON public.timeline_appointment;

CREATE POLICY "Appointment read privilege required"
  ON public.timeline_appointment FOR SELECT TO authenticated
  USING (security.has_activity_privilege('appointment', 'read', owner_id, appointment_id));

CREATE POLICY "Appointment create privilege required"
  ON public.timeline_appointment FOR INSERT TO authenticated
  WITH CHECK (
    security.has_activity_privilege('appointment', 'create', NULL, NULL)
    AND created_by = auth.uid()
  );

CREATE POLICY "Appointment write privilege required"
  ON public.timeline_appointment FOR UPDATE TO authenticated
  USING  (security.has_activity_privilege('appointment', 'write', owner_id, appointment_id))
  WITH CHECK (security.has_activity_privilege('appointment', 'write', owner_id, appointment_id));

CREATE POLICY "Appointment delete privilege required"
  ON public.timeline_appointment FOR DELETE TO authenticated
  USING (security.has_activity_privilege('appointment', 'delete', owner_id, appointment_id));

-- ── Rebuild RLS on timeline_email ────────────────────────────────────────────

DROP POLICY IF EXISTS "Email read privilege required"   ON public.timeline_email;
DROP POLICY IF EXISTS "Email create privilege required" ON public.timeline_email;
DROP POLICY IF EXISTS "Email write privilege required"  ON public.timeline_email;
DROP POLICY IF EXISTS "Email delete privilege required" ON public.timeline_email;

CREATE POLICY "Email read privilege required"
  ON public.timeline_email FOR SELECT TO authenticated
  USING (security.has_activity_privilege('email', 'read', owner_id, email_id));

CREATE POLICY "Email create privilege required"
  ON public.timeline_email FOR INSERT TO authenticated
  WITH CHECK (
    security.has_activity_privilege('email', 'create', NULL, NULL)
    AND created_by = auth.uid()
  );

CREATE POLICY "Email write privilege required"
  ON public.timeline_email FOR UPDATE TO authenticated
  USING  (security.has_activity_privilege('email', 'write', owner_id, email_id))
  WITH CHECK (security.has_activity_privilege('email', 'write', owner_id, email_id));

CREATE POLICY "Email delete privilege required"
  ON public.timeline_email FOR DELETE TO authenticated
  USING (security.has_activity_privilege('email', 'delete', owner_id, email_id));

-- ── Rebuild RLS on timeline_attachment ──────────────────────────────────────

DROP POLICY IF EXISTS "Attachment read privilege required"   ON public.timeline_attachment;
DROP POLICY IF EXISTS "Attachment create privilege required" ON public.timeline_attachment;
DROP POLICY IF EXISTS "Attachment delete privilege required" ON public.timeline_attachment;

CREATE POLICY "Attachment read privilege required"
  ON public.timeline_attachment FOR SELECT TO authenticated
  USING (security.has_activity_privilege('attachment', 'read', owner_id, attachment_id));

CREATE POLICY "Attachment create privilege required"
  ON public.timeline_attachment FOR INSERT TO authenticated
  WITH CHECK (
    security.has_activity_privilege('attachment', 'create', NULL, NULL)
    AND created_by = auth.uid()
  );

CREATE POLICY "Attachment delete privilege required"
  ON public.timeline_attachment FOR DELETE TO authenticated
  USING (security.has_activity_privilege('attachment', 'delete', owner_id, attachment_id));
