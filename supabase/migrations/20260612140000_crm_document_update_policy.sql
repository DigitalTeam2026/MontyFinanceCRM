/*
  # crm_document UPDATE policy (fixes rename)

  crm_document had RLS policies for SELECT / INSERT / DELETE but none for UPDATE,
  so renaming a document (which UPDATEs file_name / relative_path) was blocked by
  row-level security. The file server would rename the file on disk, then the DB
  update would fail — leaving disk and DB out of sync.

  Add an UPDATE policy mirroring the others: a user may update a document row only
  for a record they can access.
*/

DROP POLICY IF EXISTS "Update documents for accessible records" ON crm_document;
CREATE POLICY "Update documents for accessible records"
  ON crm_document
  FOR UPDATE
  TO authenticated
  USING (public.can_access_record(entity_logical_name, record_id))
  WITH CHECK (public.can_access_record(entity_logical_name, record_id));
