/*
  # Drop campaign_type check constraint

  The campaign_type column has a check constraint limiting values to
  ['email', 'event', 'social', 'content', 'paid', 'other'], but the
  field definition uses custom choice values ('1', '2' for Meta/LinkedIn).
  
  Dropping the constraint allows any text value to be stored, which is
  the correct behavior since choices are managed through field_definition
  config_json and can be customized per deployment.
*/
ALTER TABLE campaign DROP CONSTRAINT IF EXISTS campaign_campaign_type_check;
