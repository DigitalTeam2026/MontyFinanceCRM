
/*
  # Migration 6: Audit, Common Platform & Seed Data

  ## Overview
  Completes the CRM platform foundation with audit logging, notes, attachments,
  and comprehensive seed data to make the system immediately usable.

  ## New Tables

  ### Common Platform
  - `audit_log` — Immutable record of all changes to CRM entities. Tracks who changed what,
    when, which fields changed (old/new values in JSON), and the action type.
  - `note` — Free-text notes attachable to any entity (polymorphic via entity_name + record_id)
  - `attachment` — File metadata for documents attached to any CRM record.
    Stores file path/URL references (actual files stored in Supabase Storage).

  ## Seed Data

  ### Field Types (16 types)
  text, long_text, whole_number, decimal, currency, date, datetime, boolean,
  lookup, choice, multi_choice, file, image, auto_number, email, phone, url

  ### Entity Definitions (all standard entities)
  All 17 standard entities registered with logical names, display names, and table names:
  account, contact, lead, opportunity, campaign, event, marketing_email,
  segment, journey, ticket, crm_user, team, business_unit, organization,
  security_role, country, currency

  ### Option Sets (key dropdown lists)
  - lead_status: New, Contacted, Qualified, Disqualified
  - opportunity_stage: Qualify, Develop, Propose, Close, Won, Lost
  - opportunity_status: Open, Won, Lost, Cancelled
  - lead_rating: Hot, Warm, Cold
  - campaign_status: Planning, Active, Paused, Completed, Cancelled
  - campaign_type: Email, Event, Social, Content, Paid, Other
  - ticket_status_reason: various per status

  ### Ticket Priorities (4 default)
  Low, Medium, High, Critical

  ### Ticket Statuses (5 default)
  New, In Progress, Waiting for Customer, Resolved, Closed

  ### Contact Sources (8 default)
  Web, Referral, Event, Social Media, Email Campaign, Cold Call, Partner, Other

  ### Industries (20 default)
  Technology, Healthcare, Finance, Retail, Manufacturing, etc.

  ### Countries (top 30 by CRM usage)
  US, UK, CA, AU, DE, FR, etc.

  ### Currencies (major currencies)
  USD, EUR, GBP, AED, SAR, etc.

  ### Default Organization
  A starter organization record to bootstrap the system.

  ## Security
  - RLS on audit_log, note, attachment
  - audit_log is insert-only for the system, select for authenticated users
  - Notes and attachments follow same ownership pattern as business entities
*/

-- ─────────────────────────────────────────────
-- AUDIT LOG
-- Immutable change history for all CRM entities
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  audit_log_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name     text NOT NULL,
  record_id       uuid NOT NULL,
  action          text NOT NULL CHECK (action IN ('create', 'update', 'delete', 'assign', 'share', 'status_change')),
  changed_by      uuid REFERENCES crm_user(user_id),
  changed_at      timestamptz NOT NULL DEFAULT now(),
  old_values      jsonb,
  new_values      jsonb,
  field_changes   jsonb,
  ip_address      text,
  user_agent      text
);

CREATE INDEX IF NOT EXISTS idx_audit_log_record ON audit_log(entity_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by ON audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit_log(changed_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view audit logs"
  ON audit_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert audit logs"
  ON audit_log FOR INSERT
  TO authenticated
  WITH CHECK (changed_by = auth.uid());

-- ─────────────────────────────────────────────
-- NOTE
-- Free-text notes attachable to any CRM record
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS note (
  note_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name     text NOT NULL,
  record_id       uuid NOT NULL,
  title           text,
  body            text NOT NULL DEFAULT '',
  is_pinned       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES crm_user(user_id),
  modified_at     timestamptz NOT NULL DEFAULT now(),
  modified_by     uuid REFERENCES crm_user(user_id),
  is_deleted      boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_note_record ON note(entity_name, record_id);
CREATE INDEX IF NOT EXISTS idx_note_created_by ON note(created_by);
CREATE INDEX IF NOT EXISTS idx_note_is_deleted ON note(is_deleted);

ALTER TABLE note ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view notes they created"
  ON note FOR SELECT
  TO authenticated
  USING (is_deleted = false AND created_by = auth.uid());

CREATE POLICY "Authenticated users can insert notes"
  ON note FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own notes"
  ON note FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (modified_by = auth.uid());

-- ─────────────────────────────────────────────
-- ATTACHMENT
-- File metadata for documents attached to any CRM record
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attachment (
  attachment_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name     text NOT NULL,
  record_id       uuid NOT NULL,
  file_name       text NOT NULL,
  file_size       bigint NOT NULL DEFAULT 0,
  mime_type       text,
  storage_path    text NOT NULL,
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES crm_user(user_id),
  is_deleted      boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_attachment_record ON attachment(entity_name, record_id);
CREATE INDEX IF NOT EXISTS idx_attachment_created_by ON attachment(created_by);
CREATE INDEX IF NOT EXISTS idx_attachment_is_deleted ON attachment(is_deleted);

ALTER TABLE attachment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attachments they created"
  ON attachment FOR SELECT
  TO authenticated
  USING (is_deleted = false AND created_by = auth.uid());

CREATE POLICY "Authenticated users can insert attachments"
  ON attachment FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can soft-delete their own attachments"
  ON attachment FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- ═════════════════════════════════════════════
-- SEED DATA
-- ═════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- FIELD TYPES
-- ─────────────────────────────────────────────
INSERT INTO field_type (name, display_name, description, sort_order) VALUES
  ('text',         'Single Line Text',  'Short text up to 255 characters',        1),
  ('long_text',    'Multi Line Text',   'Long text / rich text area',              2),
  ('whole_number', 'Whole Number',      'Integer values',                          3),
  ('decimal',      'Decimal Number',    'Floating point / decimal values',         4),
  ('currency',     'Currency',          'Monetary value with currency reference',  5),
  ('date',         'Date',              'Date only (no time)',                      6),
  ('datetime',     'Date & Time',       'Date and time value',                     7),
  ('boolean',      'Yes / No',          'True or false toggle',                    8),
  ('lookup',       'Lookup',            'Reference to another entity record',      9),
  ('choice',       'Choice',            'Single selection from option set',       10),
  ('multi_choice', 'Multi Choice',      'Multiple selections from option set',    11),
  ('email',        'Email',             'Email address field',                    12),
  ('phone',        'Phone',             'Phone number field',                     13),
  ('url',          'URL',               'Web address / URL field',                14),
  ('file',         'File',              'File attachment reference',              15),
  ('auto_number',  'Auto Number',       'System-generated sequential number',     16)
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────
-- ENTITY DEFINITIONS
-- ─────────────────────────────────────────────
INSERT INTO entity_definition (logical_name, display_name, display_name_plural, physical_table_name, primary_field_name, description, icon_name, is_custom) VALUES
  ('account',          'Account',           'Accounts',           'account',          'account_name',  'Company or customer organization',        'Building2',     false),
  ('contact',          'Contact',           'Contacts',           'contact',          'full_name',     'Person linked to an account or standalone','User',          false),
  ('lead',             'Lead',              'Leads',              'lead',             'full_name',     'Unqualified potential customer',           'UserPlus',      false),
  ('opportunity',      'Opportunity',       'Opportunities',      'opportunity',      'topic',         'Qualified sales deal',                    'TrendingUp',    false),
  ('campaign',         'Campaign',          'Campaigns',          'campaign',         'name',          'Marketing campaign',                      'Megaphone',     false),
  ('event',            'Event',             'Events',             'event',            'name',          'Physical or virtual event',               'Calendar',      false),
  ('marketing_email',  'Marketing Email',   'Marketing Emails',   'marketing_email',  'subject',       'Email communication for marketing',       'Mail',          false),
  ('segment',          'Segment',           'Segments',           'segment',          'name',          'Audience segment definition',             'PieChart',      false),
  ('journey',          'Journey',           'Journeys',           'journey',          'name',          'Automated customer journey',              'GitBranch',     false),
  ('ticket',           'Ticket',            'Tickets',            'ticket',           'title',         'Customer support case / ticket',          'LifeBuoy',      false),
  ('crm_user',         'User',              'Users',              'crm_user',         'full_name',     'CRM platform user',                       'Users',         false),
  ('team',             'Team',              'Teams',              'team',             'name',          'Group of users',                          'Users2',        false),
  ('business_unit',    'Business Unit',     'Business Units',     'business_unit',    'name',          'Organizational business unit',            'Layers',        false),
  ('organization',     'Organization',      'Organizations',      'organization',     'name',          'Top-level organization tenant',           'Globe',         false),
  ('security_role',    'Security Role',     'Security Roles',     'security_role',    'name',          'Permission role assigned to users',       'Shield',        false),
  ('country',          'Country',           'Countries',          'country',          'name',          'Country reference data',                  'Flag',          false),
  ('currency',         'Currency',          'Currencies',         'currency',         'name',          'Currency reference data',                 'DollarSign',    false)
ON CONFLICT (logical_name) DO NOTHING;

-- ─────────────────────────────────────────────
-- OPTION SETS
-- ─────────────────────────────────────────────
INSERT INTO option_set (name, display_name, description, is_global) VALUES
  ('lead_status',        'Lead Status',       'Status values for a lead',          true),
  ('lead_rating',        'Lead Rating',       'Rating / temperature of a lead',    true),
  ('opportunity_stage',  'Opportunity Stage', 'Sales pipeline stage',              true),
  ('opportunity_status', 'Opportunity Status','Overall opportunity status',        true),
  ('campaign_type',      'Campaign Type',     'Type of marketing campaign',        true),
  ('campaign_status',    'Campaign Status',   'Status of a campaign',              true),
  ('ticket_priority',    'Ticket Priority',   'Urgency level of a ticket',         true),
  ('ticket_status',      'Ticket Status',     'Current state of a ticket',         true)
ON CONFLICT (name) DO NOTHING;

-- Option Set Values: Lead Status
INSERT INTO option_set_value (option_set_id, value, display_label, color, sort_order, is_default)
SELECT os.option_set_id, v.value, v.label, v.color, v.sort_order, v.is_default
FROM option_set os,
(VALUES
  ('new',           'New',           '#6B7280', 1, true),
  ('contacted',     'Contacted',     '#3B82F6', 2, false),
  ('qualified',     'Qualified',     '#10B981', 3, false),
  ('disqualified',  'Disqualified',  '#EF4444', 4, false)
) AS v(value, label, color, sort_order, is_default)
WHERE os.name = 'lead_status'
ON CONFLICT (option_set_id, value) DO NOTHING;

-- Option Set Values: Lead Rating
INSERT INTO option_set_value (option_set_id, value, display_label, color, sort_order, is_default)
SELECT os.option_set_id, v.value, v.label, v.color, v.sort_order, v.is_default
FROM option_set os,
(VALUES
  ('hot',  'Hot',  '#EF4444', 1, false),
  ('warm', 'Warm', '#F59E0B', 2, true),
  ('cold', 'Cold', '#3B82F6', 3, false)
) AS v(value, label, color, sort_order, is_default)
WHERE os.name = 'lead_rating'
ON CONFLICT (option_set_id, value) DO NOTHING;

-- Option Set Values: Opportunity Stage
INSERT INTO option_set_value (option_set_id, value, display_label, color, sort_order, is_default)
SELECT os.option_set_id, v.value, v.label, v.color, v.sort_order, v.is_default
FROM option_set os,
(VALUES
  ('qualify', 'Qualify', '#6B7280', 1, true),
  ('develop', 'Develop', '#3B82F6', 2, false),
  ('propose', 'Propose', '#8B5CF6', 3, false),
  ('close',   'Close',   '#F59E0B', 4, false),
  ('won',     'Won',     '#10B981', 5, false),
  ('lost',    'Lost',    '#EF4444', 6, false)
) AS v(value, label, color, sort_order, is_default)
WHERE os.name = 'opportunity_stage'
ON CONFLICT (option_set_id, value) DO NOTHING;

-- Option Set Values: Opportunity Status
INSERT INTO option_set_value (option_set_id, value, display_label, color, sort_order, is_default)
SELECT os.option_set_id, v.value, v.label, v.color, v.sort_order, v.is_default
FROM option_set os,
(VALUES
  ('open',      'Open',      '#3B82F6', 1, true),
  ('won',       'Won',       '#10B981', 2, false),
  ('lost',      'Lost',      '#EF4444', 3, false),
  ('cancelled', 'Cancelled', '#6B7280', 4, false)
) AS v(value, label, color, sort_order, is_default)
WHERE os.name = 'opportunity_status'
ON CONFLICT (option_set_id, value) DO NOTHING;

-- Option Set Values: Campaign Type
INSERT INTO option_set_value (option_set_id, value, display_label, color, sort_order, is_default)
SELECT os.option_set_id, v.value, v.label, v.color, v.sort_order, v.is_default
FROM option_set os,
(VALUES
  ('email',   'Email',   '#3B82F6', 1, true),
  ('event',   'Event',   '#10B981', 2, false),
  ('social',  'Social',  '#EC4899', 3, false),
  ('content', 'Content', '#8B5CF6', 4, false),
  ('paid',    'Paid',    '#F59E0B', 5, false),
  ('other',   'Other',   '#6B7280', 6, false)
) AS v(value, label, color, sort_order, is_default)
WHERE os.name = 'campaign_type'
ON CONFLICT (option_set_id, value) DO NOTHING;

-- Option Set Values: Campaign Status
INSERT INTO option_set_value (option_set_id, value, display_label, color, sort_order, is_default)
SELECT os.option_set_id, v.value, v.label, v.color, v.sort_order, v.is_default
FROM option_set os,
(VALUES
  ('planning',   'Planning',   '#6B7280', 1, true),
  ('active',     'Active',     '#10B981', 2, false),
  ('paused',     'Paused',     '#F59E0B', 3, false),
  ('completed',  'Completed',  '#3B82F6', 4, false),
  ('cancelled',  'Cancelled',  '#EF4444', 5, false)
) AS v(value, label, color, sort_order, is_default)
WHERE os.name = 'campaign_status'
ON CONFLICT (option_set_id, value) DO NOTHING;

-- ─────────────────────────────────────────────
-- TICKET PRIORITIES
-- ─────────────────────────────────────────────
INSERT INTO ticket_priority (name, sort_order, color) VALUES
  ('Low',      1, '#6B7280'),
  ('Medium',   2, '#3B82F6'),
  ('High',     3, '#F59E0B'),
  ('Critical', 4, '#EF4444')
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────
-- TICKET STATUSES
-- ─────────────────────────────────────────────
INSERT INTO ticket_status (name, sort_order, color, is_closed) VALUES
  ('New',                  1, '#6B7280', false),
  ('In Progress',          2, '#3B82F6', false),
  ('Waiting for Customer', 3, '#F59E0B', false),
  ('Resolved',             4, '#10B981', true),
  ('Closed',               5, '#1F2937', true)
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────
-- CONTACT SOURCES
-- ─────────────────────────────────────────────
INSERT INTO contact_source (name) VALUES
  ('Web'),
  ('Referral'),
  ('Event'),
  ('Social Media'),
  ('Email Campaign'),
  ('Cold Call'),
  ('Partner'),
  ('Other')
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────
-- INDUSTRIES
-- ─────────────────────────────────────────────
INSERT INTO industry (name) VALUES
  ('Technology'),
  ('Healthcare'),
  ('Financial Services'),
  ('Retail'),
  ('Manufacturing'),
  ('Real Estate'),
  ('Education'),
  ('Media & Entertainment'),
  ('Telecommunications'),
  ('Energy & Utilities'),
  ('Transportation & Logistics'),
  ('Hospitality & Tourism'),
  ('Construction'),
  ('Government & Public Sector'),
  ('Non-Profit'),
  ('Legal Services'),
  ('Consulting & Professional Services'),
  ('Food & Beverage'),
  ('Automotive'),
  ('Other')
ON CONFLICT (name) DO NOTHING;

-- ─────────────────────────────────────────────
-- COUNTRIES (Top 50 by CRM usage)
-- ─────────────────────────────────────────────
INSERT INTO country (code, name) VALUES
  ('US', 'United States'),
  ('GB', 'United Kingdom'),
  ('CA', 'Canada'),
  ('AU', 'Australia'),
  ('DE', 'Germany'),
  ('FR', 'France'),
  ('IN', 'India'),
  ('JP', 'Japan'),
  ('CN', 'China'),
  ('BR', 'Brazil'),
  ('MX', 'Mexico'),
  ('SG', 'Singapore'),
  ('AE', 'United Arab Emirates'),
  ('SA', 'Saudi Arabia'),
  ('ZA', 'South Africa'),
  ('NG', 'Nigeria'),
  ('EG', 'Egypt'),
  ('KW', 'Kuwait'),
  ('QA', 'Qatar'),
  ('BH', 'Bahrain'),
  ('OM', 'Oman'),
  ('JO', 'Jordan'),
  ('LB', 'Lebanon'),
  ('IT', 'Italy'),
  ('ES', 'Spain'),
  ('NL', 'Netherlands'),
  ('SE', 'Sweden'),
  ('NO', 'Norway'),
  ('DK', 'Denmark'),
  ('FI', 'Finland'),
  ('PL', 'Poland'),
  ('RU', 'Russia'),
  ('TR', 'Turkey'),
  ('KR', 'South Korea'),
  ('ID', 'Indonesia'),
  ('MY', 'Malaysia'),
  ('TH', 'Thailand'),
  ('PH', 'Philippines'),
  ('PK', 'Pakistan'),
  ('BD', 'Bangladesh'),
  ('AR', 'Argentina'),
  ('CO', 'Colombia'),
  ('CL', 'Chile'),
  ('NZ', 'New Zealand'),
  ('CH', 'Switzerland'),
  ('AT', 'Austria'),
  ('BE', 'Belgium'),
  ('PT', 'Portugal'),
  ('GR', 'Greece'),
  ('OTHER', 'Other')
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────
-- CURRENCIES (Major + Regional)
-- ─────────────────────────────────────────────
INSERT INTO currency (code, name, symbol, exchange_rate, is_base) VALUES
  ('USD', 'US Dollar',          '$',  1.000000, true),
  ('EUR', 'Euro',               '€',  0.920000, false),
  ('GBP', 'British Pound',      '£',  0.790000, false),
  ('AED', 'UAE Dirham',         'د.إ',3.670000, false),
  ('SAR', 'Saudi Riyal',        'ر.س',3.750000, false),
  ('QAR', 'Qatari Riyal',       'ر.ق',3.640000, false),
  ('KWD', 'Kuwaiti Dinar',      'د.ك',0.310000, false),
  ('BHD', 'Bahraini Dinar',     'BD', 0.380000, false),
  ('OMR', 'Omani Rial',         'ر.ع',0.380000, false),
  ('EGP', 'Egyptian Pound',     'E£', 30.90000, false),
  ('JOD', 'Jordanian Dinar',    'JD', 0.710000, false),
  ('CAD', 'Canadian Dollar',    'C$', 1.360000, false),
  ('AUD', 'Australian Dollar',  'A$', 1.530000, false),
  ('JPY', 'Japanese Yen',       '¥',  149.5000, false),
  ('CNY', 'Chinese Yuan',       '¥',  7.240000, false),
  ('INR', 'Indian Rupee',       '₹',  83.10000, false),
  ('BRL', 'Brazilian Real',     'R$', 4.980000, false),
  ('SGD', 'Singapore Dollar',   'S$', 1.340000, false),
  ('CHF', 'Swiss Franc',        'Fr', 0.890000, false),
  ('SEK', 'Swedish Krona',      'kr', 10.40000, false)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────
-- DEFAULT ORGANIZATION
-- ─────────────────────────────────────────────
INSERT INTO organization (name)
SELECT 'Default Organization'
WHERE NOT EXISTS (SELECT 1 FROM organization LIMIT 1);
