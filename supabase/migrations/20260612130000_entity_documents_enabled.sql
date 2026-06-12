/*
  # Per-entity Documents toggle

  Adds a documents_enabled flag to entity_definition, matching the existing
  feature-flag pattern (enable_activities / enable_notes / allow_timeline).
  When true, the shared Documents tab appears on that entity's record form.
  This is independent of whether a Document Location is configured — an entity
  can be enabled but show a "storage not configured" state until an admin sets
  a root in Admin Studio → Document Location.

  Enables it out of the box for the core entities: account, contact, lead,
  opportunity.
*/

ALTER TABLE public.entity_definition
  ADD COLUMN IF NOT EXISTS documents_enabled boolean NOT NULL DEFAULT false;

UPDATE public.entity_definition
  SET documents_enabled = true
  WHERE logical_name IN ('account', 'contact', 'lead', 'opportunity');
