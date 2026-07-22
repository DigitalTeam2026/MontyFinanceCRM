-- Power Automation — "Send documents by email" action.
--
--   send_documents_email — collect the files stored against a record (the rows in
--     crm_document, i.e. what the record's Documents tab shows) and email them as
--     real attachments. Config is:
--       • source / source_entity / source_record_id
--             'record' = the record that triggered the flow; 'other' = any entity +
--             a record id coming from a token (e.g. {{steps.lead.raw(lead_id)}}),
--             so a flow on Opportunity can send the LEAD's documents.
--       • selection  'all' = every file on the record; 'filter' = only files whose
--             name matches name_operator/name_value (contains / starts with / ends
--             with / equals / extension is, plus the negated "does not contain").
--             name_value may hold several patterns split on ; or , (any-of) and may
--             itself contain {{tokens}}.
--       • max_files / max_total_mb — attachment budget. Files beyond it are left
--             out and listed in the run output (never silently dropped).
--       • to / cc / send_to_owner / subject / body / email_account_id — same
--             recipient + sender model as send_email.
--       • skip_if_empty — no matching file => skip the step instead of sending an
--             "attached" email with nothing attached.
--
-- Bodies/subjects can use {{documents.count}}, {{documents.names}} and
-- {{documents.size}} alongside the usual record/step tokens.
--
-- The worker reads the bytes straight off the entity's configured storage root
-- (document_location_config.root_location + crm_document.relative_path) — local /
-- NAS paths only; S3 & SharePoint entities are rejected with a clear error rather
-- than sending a partial email.

begin;

alter table public.automation_rule_action
  drop constraint if exists automation_rule_action_action_type_check;

alter table public.automation_rule_action
  add constraint automation_rule_action_action_type_check
  check (action_type in
    ('send_email','update_field','generate_document','list_rows','get_row',
     'export_view_email','related_export_email','send_documents_email',
     'create_related_record','update_related_record','condition','switch'));

commit;
