
/*
  # Migration 10: Form Designer Extensions

  ## Overview
  Extends the form metadata tables to fully support the Form Designer UI:
  drag-and-drop layout, tab support, JS scripts, events, and business rules.

  ## Modified Tables

  ### form_definition
  - `form_type` — already exists; values: 'main' | 'quick_create' | 'quick_view'
  - `layout_json` (jsonb) — Full serialized form layout (tabs > sections > controls)
    stored as a snapshot for fast rendering; the canonical source is still the
    normalized section/control rows
  - `is_published` (boolean) — Whether the form is live for end-users; default false
  - `published_at` (timestamptz) — When the form was last published
  - `deleted_at` (timestamptz) — Soft delete

  ### form_section
  - `tab_id` (uuid) — Groups sections into tabs; references form_tab
  - `is_visible` — already exists
  - `columns` — already exists (1 or 2 column layout)

  ### New Table: form_tab
  - `tab_id` (uuid PK)
  - `form_id` (uuid FK → form_definition)
  - `name` (text) — Internal name
  - `label` (text) — Display label
  - `display_order` (integer)
  - `is_visible` (boolean)
  - `created_at` (timestamptz)

  ### New Table: form_script
  - `script_id` (uuid PK)
  - `form_id` (uuid FK → form_definition)
  - `name` (text)
  - `script_type` (text) — 'js_library' | 'inline'
  - `source_url` (text) — For library type
  - `body` (text) — For inline type
  - `display_order` (integer)
  - `is_active` (boolean)
  - `created_at` (timestamptz)

  ### New Table: form_event_handler
  - `handler_id` (uuid PK)
  - `form_id` (uuid FK → form_definition)
  - `event_type` (text) — 'onLoad' | 'onSave' | 'onChange' | 'onTabChange'
  - `field_logical_name` (text) — For onChange events; null for form-level events
  - `function_name` (text) — JS function to call
  - `pass_execution_context` (boolean)
  - `is_active` (boolean)
  - `display_order` (integer)
  - `created_at` (timestamptz)

  ## Security
  - RLS enabled on all new tables
  - All new tables accessible to authenticated users
*/

-- form_definition extensions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='form_definition' AND column_name='layout_json') THEN
    ALTER TABLE form_definition ADD COLUMN layout_json jsonb;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='form_definition' AND column_name='is_published') THEN
    ALTER TABLE form_definition ADD COLUMN is_published boolean DEFAULT false;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='form_definition' AND column_name='published_at') THEN
    ALTER TABLE form_definition ADD COLUMN published_at timestamptz;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='form_definition' AND column_name='deleted_at') THEN
    ALTER TABLE form_definition ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

-- form_section: add tab_id support
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='form_section' AND column_name='tab_id') THEN
    ALTER TABLE form_section ADD COLUMN tab_id uuid;
  END IF;
END $$;

-- form_tab
CREATE TABLE IF NOT EXISTS form_tab (
  tab_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES form_definition(form_id) ON DELETE CASCADE,
  name text NOT NULL,
  label text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_tab_form_id ON form_tab(form_id);
ALTER TABLE form_tab ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select form_tab"
  ON form_tab FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert form_tab"
  ON form_tab FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update form_tab"
  ON form_tab FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete form_tab"
  ON form_tab FOR DELETE TO authenticated USING (true);

-- form_script
CREATE TABLE IF NOT EXISTS form_script (
  script_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES form_definition(form_id) ON DELETE CASCADE,
  name text NOT NULL,
  script_type text NOT NULL DEFAULT 'js_library' CHECK (script_type IN ('js_library', 'inline')),
  source_url text,
  body text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_script_form_id ON form_script(form_id);
ALTER TABLE form_script ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select form_script"
  ON form_script FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert form_script"
  ON form_script FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update form_script"
  ON form_script FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete form_script"
  ON form_script FOR DELETE TO authenticated USING (true);

-- form_event_handler
CREATE TABLE IF NOT EXISTS form_event_handler (
  handler_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES form_definition(form_id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('onLoad', 'onSave', 'onChange', 'onTabChange')),
  field_logical_name text,
  function_name text NOT NULL,
  pass_execution_context boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_event_form_id ON form_event_handler(form_id);
ALTER TABLE form_event_handler ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select form_event_handler"
  ON form_event_handler FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert form_event_handler"
  ON form_event_handler FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update form_event_handler"
  ON form_event_handler FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete form_event_handler"
  ON form_event_handler FOR DELETE TO authenticated USING (true);
