/*
  # Merge Center

  ## Overview
  The Merge Center resolves suspected duplicate records identified by the
  Duplicate Detection rules. It stores:
    - candidate pairs (two records that may be duplicates)
    - the user-chosen merge decisions (master record, selected field values)
    - a per-merge audit log (which fields were taken from which record and why)
    - a related-records reparenting log (child records moved from loser → master)

  This is intentionally separate from the runtime duplicate_detection_rule
  and duplicate_job tables so that resolution has its own lifecycle and
  audit trail independent of detection.

  ## New Tables

  ### 1. merge_candidate
  A pair of records suspected to be duplicates, produced by a detection job
  or manually flagged by a user.

  Columns:
  - merge_candidate_id   (uuid PK)
  - entity_logical_name  — which entity type both records belong to
  - record_a_id          — first record UUID
  - record_b_id          — second record UUID
  - record_a_label       — human-readable label snapshot (e.g. "Acme Corp")
  - record_b_label       — human-readable label for record B
  - similarity_score     — float 0–1 from the detection algorithm; null if manually added
  - match_fields         — JSON array of {field, score} objects showing which fields matched
  - source               — 'detection_job' | 'manual'
  - source_job_id        — FK → duplicate_job (nullable)
  - status               — 'pending' | 'in_review' | 'merged' | 'not_duplicate' | 'skipped'
  - resolved_by          — auth.users UUID
  - resolved_at          — timestamp
  - created_at, modified_at

  ### 2. merge_decision
  Captures the full merge action: which record is master, which is the loser,
  and a per-field map of which source was chosen.

  Columns:
  - merge_decision_id    (uuid PK)
  - merge_candidate_id   (FK → merge_candidate)
  - master_record_id     — the record that survives
  - loser_record_id      — the record that is retired
  - field_selections     — JSONB: { [field_name]: 'master' | 'loser' | 'manual', manual_value?: string }
  - reparent_relations   — JSONB: [] array of relation names to reparent
  - notes                — optional free-text notes from the reviewer
  - executed             — boolean; true once the merge has been applied
  - executed_at          — timestamp
  - executed_by          — auth.users UUID
  - created_at, modified_at

  ### 3. merge_audit_log
  Immutable append-only log of every field change and related-record
  reparenting that happened during a merge execution.

  Columns:
  - audit_id             (uuid PK)
  - merge_decision_id    (FK → merge_decision)
  - entity_logical_name
  - master_record_id
  - loser_record_id
  - change_type          — 'field_merged' | 'record_retired' | 'relation_reparented'
  - field_name           — nullable; relevant for field_merged
  - old_value            — text; the value that was overwritten
  - new_value            — text; the value that was set
  - source_record        — 'master' | 'loser' | 'manual'
  - relation_name        — nullable; for relation_reparented
  - child_record_id      — nullable; the child record that was moved
  - performed_by         — auth.users UUID
  - created_at

  ## Security
  - RLS enabled on all three tables
  - Authenticated users can read, insert, and update; audit log is insert-only

  ## Indexes
  - merge_candidate: entity + status composite
  - merge_candidate: source_job_id
  - merge_decision: merge_candidate_id
  - merge_audit_log: merge_decision_id, created_at
*/

-- ─── merge_candidate ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS merge_candidate (
  merge_candidate_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_logical_name text NOT NULL,
  record_a_id         uuid NOT NULL,
  record_b_id         uuid NOT NULL,
  record_a_label      text NOT NULL DEFAULT '',
  record_b_label      text NOT NULL DEFAULT '',
  similarity_score    numeric(5,4),
  match_fields        jsonb NOT NULL DEFAULT '[]',
  source              text NOT NULL DEFAULT 'detection_job'
    CHECK (source IN ('detection_job', 'manual')),
  source_job_id       uuid REFERENCES duplicate_job(duplicate_job_id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_review', 'merged', 'not_duplicate', 'skipped')),
  resolved_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  modified_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE merge_candidate ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read merge candidates"
  ON merge_candidate FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert merge candidates"
  ON merge_candidate FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update merge candidates"
  ON merge_candidate FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_merge_candidate_entity_status
  ON merge_candidate(entity_logical_name, status);

CREATE INDEX IF NOT EXISTS idx_merge_candidate_source_job
  ON merge_candidate(source_job_id) WHERE source_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_merge_candidate_status
  ON merge_candidate(status);

-- ─── merge_decision ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS merge_decision (
  merge_decision_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merge_candidate_id  uuid NOT NULL
    REFERENCES merge_candidate(merge_candidate_id) ON DELETE CASCADE,
  master_record_id    uuid NOT NULL,
  loser_record_id     uuid NOT NULL,
  field_selections    jsonb NOT NULL DEFAULT '{}',
  reparent_relations  jsonb NOT NULL DEFAULT '[]',
  notes               text,
  executed            boolean NOT NULL DEFAULT false,
  executed_at         timestamptz,
  executed_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  modified_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE merge_decision ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read merge decisions"
  ON merge_decision FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert merge decisions"
  ON merge_decision FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update merge decisions"
  ON merge_decision FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_merge_decision_candidate
  ON merge_decision(merge_candidate_id);

-- ─── merge_audit_log ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS merge_audit_log (
  audit_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merge_decision_id   uuid NOT NULL
    REFERENCES merge_decision(merge_decision_id) ON DELETE CASCADE,
  entity_logical_name text NOT NULL,
  master_record_id    uuid NOT NULL,
  loser_record_id     uuid NOT NULL,
  change_type         text NOT NULL
    CHECK (change_type IN ('field_merged', 'record_retired', 'relation_reparented')),
  field_name          text,
  old_value           text,
  new_value           text,
  source_record       text CHECK (source_record IN ('master', 'loser', 'manual')),
  relation_name       text,
  child_record_id     uuid,
  performed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE merge_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read merge audit log"
  ON merge_audit_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert merge audit entries"
  ON merge_audit_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_merge_audit_log_decision
  ON merge_audit_log(merge_decision_id);

CREATE INDEX IF NOT EXISTS idx_merge_audit_log_created
  ON merge_audit_log(created_at DESC);

-- ─── Seed: Demo Candidates ────────────────────────────────────────────────────

DO $$
BEGIN
  INSERT INTO merge_candidate (
    entity_logical_name, record_a_id, record_b_id,
    record_a_label, record_b_label,
    similarity_score, match_fields, source, status
  ) VALUES
  (
    'account',
    gen_random_uuid(), gen_random_uuid(),
    'Acme Corporation', 'Acme Corp.',
    0.9200,
    '[{"field":"name","score":0.92},{"field":"emailaddress1","score":0.95}]',
    'detection_job', 'pending'
  ),
  (
    'account',
    gen_random_uuid(), gen_random_uuid(),
    'Global Tech Ltd', 'Global Technology Limited',
    0.8600,
    '[{"field":"name","score":0.86},{"field":"telephone1","score":1.0}]',
    'detection_job', 'pending'
  ),
  (
    'contact',
    gen_random_uuid(), gen_random_uuid(),
    'John Smith', 'Jon Smith',
    0.8800,
    '[{"field":"fullname","score":0.88},{"field":"emailaddress1","score":1.0}]',
    'detection_job', 'pending'
  ),
  (
    'contact',
    gen_random_uuid(), gen_random_uuid(),
    'Sarah Johnson', 'Sara Johnson',
    0.9400,
    '[{"field":"fullname","score":0.94},{"field":"telephone1","score":0.90}]',
    'detection_job', 'in_review'
  ),
  (
    'lead',
    gen_random_uuid(), gen_random_uuid(),
    'Michael Brown — Initech', 'Mike Brown — Initech Corp',
    0.7800,
    '[{"field":"fullname","score":0.78},{"field":"companyname","score":0.82}]',
    'manual', 'pending'
  ),
  (
    'account',
    gen_random_uuid(), gen_random_uuid(),
    'Contoso Enterprises', 'Contoso Enterprises Inc.',
    0.9700,
    '[{"field":"name","score":0.97},{"field":"accountnumber","score":1.0},{"field":"emailaddress1","score":0.91}]',
    'detection_job', 'merged'
  );
END $$;
