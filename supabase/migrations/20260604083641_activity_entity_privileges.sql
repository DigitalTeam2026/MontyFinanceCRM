/*
  # Activity Entity Privileges

  ## Summary
  Registers Note, Appointment, Email, and Attachment as first-class system entities
  so they appear in Security Role privilege matrices with full Create/Read/Write/Delete/
  Assign/Share support at User/BU/Parent BU/Org scopes.

  ## Changes

  ### 1. entity_definition schema extensions
  - Adds `is_activity` boolean column (marks activity/timeline entities)
  - Adds `show_in_navigation` boolean column (activity entities hidden from nav by default)

  ### 2. timeline_attachment — add owner_id
  - Adds `owner_id` uuid column (consistent with other timeline tables)
  - Backfills from `uploaded_by` / `created_by`

  ### 3. New system entities registered
  - note, appointment, email, attachment

  ### 4. role_privilege seed
  - System Administrator: full Org access (via sync function)
  - All other roles: no access by default

  ### 5. security.has_activity_privilege() helper
  - Scope-aware privilege check for activity entities
  - Used in RLS policies on all four timeline tables

  ### 6. RLS rebuilt on all four timeline tables
  - Drops old permissive policies
  - Inserts privilege-gated policies per action

  ## Security
  - RLS enforced on all four timeline tables
  - System Administrator bypass preserved
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend entity_definition
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definition' AND column_name = 'is_activity'
  ) THEN
    ALTER TABLE public.entity_definition ADD COLUMN is_activity boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'entity_definition' AND column_name = 'show_in_navigation'
  ) THEN
    ALTER TABLE public.entity_definition ADD COLUMN show_in_navigation boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add owner_id to timeline_attachment for scope-based RLS
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timeline_attachment' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE public.timeline_attachment ADD COLUMN owner_id uuid REFERENCES auth.users(id);
    UPDATE public.timeline_attachment SET owner_id = COALESCE(uploaded_by, created_by);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Register activity entities
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.entity_definition (
  logical_name, display_name, display_name_plural,
  physical_table_name, primary_field_name,
  description, icon_name,
  ownership_type, is_custom, is_active,
  is_activity, show_in_navigation,
  enable_activities, enable_notes, enable_audit, allow_timeline
) VALUES
  ('note',        'Note',        'Notes',
   'timeline_note',        'title',
   'Timeline note activity', 'StickyNote',
   'user', false, true, true, false, false, false, false, false),

  ('appointment', 'Appointment', 'Appointments',
   'timeline_appointment', 'subject',
   'Timeline appointment activity', 'Calendar',
   'user', false, true, true, false, false, false, false, false),

  ('email',       'Email',       'Emails',
   'timeline_email',       'subject',
   'Timeline email activity', 'Mail',
   'user', false, true, true, false, false, false, false, false),

  ('attachment',  'Attachment',  'Attachments',
   'timeline_attachment',  'file_name',
   'Timeline attachment activity', 'Paperclip',
   'user', false, true, true, false, false, false, false, false)
ON CONFLICT (logical_name) DO UPDATE SET
  is_activity        = EXCLUDED.is_activity,
  show_in_navigation = EXCLUDED.show_in_navigation,
  is_active          = true,
  modified_at        = now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Seed no-access rows for non-SA roles, then sync SA to full org
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.role_privilege (
  role_id, entity_name,
  can_create, can_read, can_write, can_delete, can_assign, can_share,
  create_access_level, read_access_level, write_access_level,
  delete_access_level, assign_access_level, share_access_level
)
SELECT
  r.role_id,
  a.logical_name,
  false, false, false, false, false, false,
  'user', 'user', 'user', 'user', 'user', 'user'
FROM public.security_role r
CROSS JOIN (
  VALUES ('note'), ('appointment'), ('email'), ('attachment')
) AS a(logical_name)
WHERE r.name <> 'System Administrator'
ON CONFLICT (role_id, entity_name) DO NOTHING;

SELECT security.sync_system_admin_privileges();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Security helper function
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION security.has_activity_privilege(
  p_entity_name text,
  p_action      text,
  p_owner_id    uuid DEFAULT NULL
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

  IF v_max_level IS NULL OR v_max_level = 0 THEN RETURN false; END IF;
  IF v_max_level = 4 THEN RETURN true; END IF;
  IF p_owner_id IS NULL THEN RETURN v_max_level >= 1; END IF;
  IF v_max_level = 1 THEN RETURN p_owner_id = auth.uid(); END IF;

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

REVOKE ALL ON FUNCTION security.has_activity_privilege(text, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION security.has_activity_privilege(text, text, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Rebuild RLS: timeline_note
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Timeline notes readable by authenticated users"  ON public.timeline_note;
DROP POLICY IF EXISTS "Timeline notes creatable by authenticated users" ON public.timeline_note;
DROP POLICY IF EXISTS "Timeline note owners and admins can update"      ON public.timeline_note;
DROP POLICY IF EXISTS "Timeline note owners and admins can delete"      ON public.timeline_note;

CREATE POLICY "Note read privilege required"
  ON public.timeline_note FOR SELECT TO authenticated
  USING (security.has_activity_privilege('note', 'read', owner_id));

CREATE POLICY "Note create privilege required"
  ON public.timeline_note FOR INSERT TO authenticated
  WITH CHECK (
    security.has_activity_privilege('note', 'create', NULL)
    AND created_by = auth.uid()
  );

CREATE POLICY "Note write privilege required"
  ON public.timeline_note FOR UPDATE TO authenticated
  USING  (security.has_activity_privilege('note', 'write', owner_id))
  WITH CHECK (security.has_activity_privilege('note', 'write', owner_id));

CREATE POLICY "Note delete privilege required"
  ON public.timeline_note FOR DELETE TO authenticated
  USING (security.has_activity_privilege('note', 'delete', owner_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Rebuild RLS: timeline_appointment
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Timeline appointments readable by authenticated users"  ON public.timeline_appointment;
DROP POLICY IF EXISTS "Timeline appointments creatable by authenticated users" ON public.timeline_appointment;
DROP POLICY IF EXISTS "Timeline appointment owners and admins can update"      ON public.timeline_appointment;
DROP POLICY IF EXISTS "Timeline appointment owners and admins can delete"      ON public.timeline_appointment;

CREATE POLICY "Appointment read privilege required"
  ON public.timeline_appointment FOR SELECT TO authenticated
  USING (security.has_activity_privilege('appointment', 'read', owner_id));

CREATE POLICY "Appointment create privilege required"
  ON public.timeline_appointment FOR INSERT TO authenticated
  WITH CHECK (
    security.has_activity_privilege('appointment', 'create', NULL)
    AND created_by = auth.uid()
  );

CREATE POLICY "Appointment write privilege required"
  ON public.timeline_appointment FOR UPDATE TO authenticated
  USING  (security.has_activity_privilege('appointment', 'write', owner_id))
  WITH CHECK (security.has_activity_privilege('appointment', 'write', owner_id));

CREATE POLICY "Appointment delete privilege required"
  ON public.timeline_appointment FOR DELETE TO authenticated
  USING (security.has_activity_privilege('appointment', 'delete', owner_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Rebuild RLS: timeline_email
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Timeline emails readable by authenticated users"  ON public.timeline_email;
DROP POLICY IF EXISTS "Timeline emails creatable by authenticated users" ON public.timeline_email;
DROP POLICY IF EXISTS "Timeline email owners and admins can update"      ON public.timeline_email;
DROP POLICY IF EXISTS "Timeline email owners and admins can delete"      ON public.timeline_email;

CREATE POLICY "Email read privilege required"
  ON public.timeline_email FOR SELECT TO authenticated
  USING (security.has_activity_privilege('email', 'read', owner_id));

CREATE POLICY "Email create privilege required"
  ON public.timeline_email FOR INSERT TO authenticated
  WITH CHECK (
    security.has_activity_privilege('email', 'create', NULL)
    AND created_by = auth.uid()
  );

CREATE POLICY "Email write privilege required"
  ON public.timeline_email FOR UPDATE TO authenticated
  USING  (security.has_activity_privilege('email', 'write', owner_id))
  WITH CHECK (security.has_activity_privilege('email', 'write', owner_id));

CREATE POLICY "Email delete privilege required"
  ON public.timeline_email FOR DELETE TO authenticated
  USING (security.has_activity_privilege('email', 'delete', owner_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Rebuild RLS: timeline_attachment
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Timeline attachments readable by authenticated users"  ON public.timeline_attachment;
DROP POLICY IF EXISTS "Timeline attachments creatable by authenticated users" ON public.timeline_attachment;
DROP POLICY IF EXISTS "Timeline attachment owners and admins can delete"      ON public.timeline_attachment;

CREATE POLICY "Attachment read privilege required"
  ON public.timeline_attachment FOR SELECT TO authenticated
  USING (security.has_activity_privilege('attachment', 'read', owner_id));

CREATE POLICY "Attachment create privilege required"
  ON public.timeline_attachment FOR INSERT TO authenticated
  WITH CHECK (
    security.has_activity_privilege('attachment', 'create', NULL)
    AND created_by = auth.uid()
  );

CREATE POLICY "Attachment delete privilege required"
  ON public.timeline_attachment FOR DELETE TO authenticated
  USING (security.has_activity_privilege('attachment', 'delete', owner_id));
