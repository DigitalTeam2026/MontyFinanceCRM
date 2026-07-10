/*
  # Repair textual state_code written by the Lead qualification engine

  leadQualificationEngine.executeQualifyLead wrote LITERAL text into state_code
  instead of the canonical numeric state_value, for every record it touched:

    - qualified Lead        -> 'inactive'  (should be '2' = Qualified)
    - created Account       -> 'active'    (should be '1' = Active)
    - created Contact       -> 'active'    (should be '1' = Active)
    - created Opportunity   -> 'active'    (should be '1' = Open)

  Consequences of the textual value:
    * Grid "Status" column showed the raw word ('inactive'/'active') because it
      never matches statecode_definition.state_value (1/2/3).
    * Any "Active Records" view (state_code = '1' filter) hid these rows.

  The code is now fixed to write numeric state_value. A prior migration
  (20260706120000) repaired leads once, but the still-buggy code re-corrupted
  every lead qualified afterwards, so this repair is re-applied here and extended
  to Account / Contact / Opportunity, which were never covered.

  Only normalize the exact textual labels this bug produced ('active'/'inactive');
  numeric rows are left untouched. USER triggers are disabled during the repair
  so audit/lifecycle triggers don't react to the corrective writes (same
  precedent as 20260706120000).

  ── Lead state<->reason consistency (extension) ──────────────────────────────
  The same buggy path also left leads whose state_code and status_reason no
  longer agree. Lead uses Dynamics statecodes — Open(1)/Qualified(2)/
  Disqualified(3) — each owning its own reasons; there is NO active/inactive
  state for Lead. Two residual inconsistencies are repaired here:

    * A qualified lead (is_qualified = true, carrying the Qualified reason '4')
      whose state_code never advanced past Open ('1'). Reason 4 belongs to the
      Qualified statecode, so the state is promoted to Qualified ('2').
    * An Open lead ('1') with a NULL status_reason. Defaults to 'New' ('1').
*/

-- ── Lead: qualified rows carrying textual 'inactive' -> Qualified ('2') ──────
ALTER TABLE lead DISABLE TRIGGER USER;
UPDATE lead SET state_code = '2' WHERE state_code = 'inactive';
UPDATE lead SET state_code = '1' WHERE state_code = 'active';
-- Qualified leads whose state never advanced past Open -> Qualified ('2')
UPDATE lead SET state_code = '2'
  WHERE is_qualified = true AND state_code = '1' AND status_reason = '4';
-- Open leads missing a status reason -> New ('1')
UPDATE lead SET status_reason = '1'
  WHERE state_code = '1' AND status_reason IS NULL;
ALTER TABLE lead ENABLE TRIGGER USER;

-- ── Account: created-by-qualify rows carrying textual 'active' -> Active ('1') ─
ALTER TABLE account DISABLE TRIGGER USER;
UPDATE account SET state_code = '1' WHERE state_code = 'active';
UPDATE account SET state_code = '2' WHERE state_code = 'inactive';
ALTER TABLE account ENABLE TRIGGER USER;

-- ── Contact ─────────────────────────────────────────────────────────────────
ALTER TABLE contact DISABLE TRIGGER USER;
UPDATE contact SET state_code = '1' WHERE state_code = 'active';
UPDATE contact SET state_code = '2' WHERE state_code = 'inactive';
ALTER TABLE contact ENABLE TRIGGER USER;

-- ── Opportunity ─────────────────────────────────────────────────────────────
ALTER TABLE opportunity DISABLE TRIGGER USER;
UPDATE opportunity SET state_code = '1' WHERE state_code = 'active';
UPDATE opportunity SET state_code = '2' WHERE state_code = 'inactive';
ALTER TABLE opportunity ENABLE TRIGGER USER;
