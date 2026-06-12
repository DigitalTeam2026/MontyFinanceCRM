/*
  # Sync document_path on rename

  Builds on 20260611150000_document_storage_access_control.sql.

  The trg_sync_document_path trigger previously fired only on INSERT and DELETE.
  Renaming a document UPDATEs crm_document.relative_path, which left the parent
  record's document_path pointing at the old path. Recreate the trigger to also
  fire on UPDATE. The trigger function's ELSE branch already reads NEW, so no
  function change is needed (record_id / entity do not change on a rename).
*/

DROP TRIGGER IF EXISTS trg_sync_document_path ON crm_document;
CREATE TRIGGER trg_sync_document_path
  AFTER INSERT OR UPDATE OR DELETE ON crm_document
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_parent_document_path();
