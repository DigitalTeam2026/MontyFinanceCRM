/*
  # Add Performance Indexes for Disk I/O Optimization

  1. Purpose
    - Reduce sequential scans on frequently queried tables
    - Optimize form loading, view rendering, BPF resolution, and activity feeds
    - Target the most common query patterns identified in code audit

  2. New Indexes
    - `field_change_log`: composite on (entity_name, record_id, changed_at DESC)
    - `activity_log`: composite on (regarding_entity, regarding_id, created_at DESC)
    - `activity_log`: partial on (owner_id, is_deleted) for filtered queries
    - `field_definition`: partial on entity_definition_id WHERE is_active = true
    - `form_definition`: partial on entity_definition_id WHERE is_active = true
    - `view_definition`: partial on entity_definition_id WHERE is_active = true
    - `view_column`: on (view_id, display_order)
    - `business_rule`: partial on entity_definition_id WHERE is_active = true
    - `digital_rule`: composite on (entity_logical_name, trigger_event)
    - `nav_item`: on (nav_group_id, sort_order)
    - `recent_items`: on (user_id, viewed_at DESC)
    - `saved_filter`: on (user_id, entity)
    - `statecode_definition`: on (entity_definition_id)
    - `crm_user`: on (business_unit_id)

  3. Important Notes
    - All indexes use IF NOT EXISTS for safety
    - Partial indexes match common query filter patterns
*/

-- field_change_log: history panel queries by entity + record, ordered by time
CREATE INDEX IF NOT EXISTS idx_field_change_log_entity_record_time
  ON field_change_log(entity_name, record_id, changed_at DESC);

-- activity_log: activity feed on record form
CREATE INDEX IF NOT EXISTS idx_activity_log_regarding_time
  ON activity_log(regarding_entity, regarding_id, created_at DESC);

-- activity_log: filtered queries for non-deleted activities
CREATE INDEX IF NOT EXISTS idx_activity_log_owner_active
  ON activity_log(owner_id, created_at DESC)
  WHERE is_deleted = false;

-- field_definition: form/field loading always filters is_active
CREATE INDEX IF NOT EXISTS idx_field_definition_entity_active
  ON field_definition(entity_definition_id)
  WHERE is_active = true;

-- form_definition: default form lookup filters is_active
CREATE INDEX IF NOT EXISTS idx_form_definition_entity_active
  ON form_definition(entity_definition_id)
  WHERE is_active = true;

-- view_definition: view loading filters is_active
CREATE INDEX IF NOT EXISTS idx_view_definition_entity_active
  ON view_definition(entity_definition_id)
  WHERE is_active = true;

-- view_column: columns fetched ordered by display_order
CREATE INDEX IF NOT EXISTS idx_view_column_view_order
  ON view_column(view_id, display_order);

-- business_rule: rule loading filters is_active
CREATE INDEX IF NOT EXISTS idx_business_rule_entity_active
  ON business_rule(entity_definition_id)
  WHERE is_active = true;

-- digital_rule: rule evaluation by entity + trigger event
CREATE INDEX IF NOT EXISTS idx_digital_rule_entity_trigger
  ON digital_rule(entity_logical_name, trigger_event)
  WHERE is_active = true AND deleted_at IS NULL;

-- nav_item: navigation sidebar rendering
CREATE INDEX IF NOT EXISTS idx_nav_item_group_order
  ON nav_item(nav_group_id, sort_order);

-- recent_items: recent items panel per user
CREATE INDEX IF NOT EXISTS idx_recent_items_user_viewed
  ON recent_items(user_id, viewed_at DESC);

-- saved_filter: user's saved filters per entity
CREATE INDEX IF NOT EXISTS idx_saved_filter_user_entity
  ON saved_filter(user_id, entity);

-- statecode_definition: status resolution by entity
CREATE INDEX IF NOT EXISTS idx_statecode_definition_entity
  ON statecode_definition(entity_definition_id);

-- crm_user: user queries by business unit
CREATE INDEX IF NOT EXISTS idx_crm_user_business_unit
  ON crm_user(business_unit_id);
