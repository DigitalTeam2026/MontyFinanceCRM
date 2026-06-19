/*
  # Add completed_stage_ids to BPF entities (explicit green-stage tracking)

  The BPF bar previously derived "completed" (green) stages from index logic
  (stageIndex < activeStageIndex). That auto-greened stages a record had merely
  scrolled past, and could flicker before the record loaded. This adds an explicit
  per-record set of completed stages so colors are driven by saved state only:

    GREEN  = process_stage_id ∈ completed_stage_ids
    BLUE   = process_stage_id  = active_process_stage_id
    GREY   = otherwise

  Stored as jsonb array of process_stage_id (uuid) strings. Added to the same
  entities that already carry the other BPF columns (lead, opportunity).

  Backfill: existing in-flight records get the stages BEFORE their active stage
  (same flow, lower display_order, excluding condition nodes) so they don't visually
  regress to all-grey. This one-time backfill uses display order; runtime never does.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name = 'completed_stage_ids'
  ) THEN
    ALTER TABLE lead ADD COLUMN completed_stage_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunity' AND column_name = 'completed_stage_ids'
  ) THEN
    ALTER TABLE opportunity ADD COLUMN completed_stage_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- One-time backfill from the saved active stage's position (lead).
UPDATE lead l
SET completed_stage_ids = (
  SELECT coalesce(jsonb_agg(to_jsonb(ps.process_stage_id::text)), '[]'::jsonb)
  FROM process_stage ps
  JOIN process_stage cur ON cur.process_stage_id = l.active_process_stage_id
  WHERE ps.process_flow_id = cur.process_flow_id
    AND ps.display_order < cur.display_order
    AND ps.component_type <> 'condition'
)
WHERE l.active_process_stage_id IS NOT NULL
  AND (l.completed_stage_ids IS NULL OR l.completed_stage_ids = '[]'::jsonb);

-- One-time backfill (opportunity).
UPDATE opportunity o
SET completed_stage_ids = (
  SELECT coalesce(jsonb_agg(to_jsonb(ps.process_stage_id::text)), '[]'::jsonb)
  FROM process_stage ps
  JOIN process_stage cur ON cur.process_stage_id = o.active_process_stage_id
  WHERE ps.process_flow_id = cur.process_flow_id
    AND ps.display_order < cur.display_order
    AND ps.component_type <> 'condition'
)
WHERE o.active_process_stage_id IS NOT NULL
  AND (o.completed_stage_ids IS NULL OR o.completed_stage_ids = '[]'::jsonb);

NOTIFY pgrst, 'reload schema';
