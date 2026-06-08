/*
  # Drop Record Transformation Tables

  1. Tables Removed
    - `record_transformation_field_mapping` - field mappings for transformation rules
    - `record_transformation_instance` - execution history of transformations
    - `record_transformation_target` - target entity configuration per rule
    - `record_transformation_rule` - the rules themselves

  2. Notes
    - All four tables are empty (zero rows)
    - No external tables reference these tables via foreign keys
    - Dropped in dependency order (children first, then parent)
    - Feature removed from admin configuration UI
*/

DROP TABLE IF EXISTS record_transformation_field_mapping;
DROP TABLE IF EXISTS record_transformation_instance;
DROP TABLE IF EXISTS record_transformation_target;
DROP TABLE IF EXISTS record_transformation_rule;
