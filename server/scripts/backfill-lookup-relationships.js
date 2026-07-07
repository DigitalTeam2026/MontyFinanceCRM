// server/scripts/backfill-lookup-relationships.js
//
// Ensures every lookup field has its relationship_definition rows so features
// that read them work for ALL entities — notably the form "Add Related Field"
// picker, which lists N:1 relationships where the current entity is the source.
//
// Background: a lookup field should own a PAIR of relationship rows
//   N:1  source=child (owns the FK column) -> target=parent (looked-up entity)
//   1:N  source=parent                     -> target=child
// New lookups create both via createLookupRelationshipPair(). Historical /
// seeded / imported lookups sometimes have only one side, which hides them from
// the picker (needs the N:1) or from reverse subgrids (needs the 1:N).
//
// This script is IDEMPOTENT — safe to re-run any time, including after adding
// lookups to new entities later.
//
// By default the system audit/ownership fields (createdby / modifiedby / ownerid)
// are SKIPPED — registering them would flood every picker with "X -> User"
// rows. Pass --include-system to backfill those too.
//
// Usage (run from the server directory):
//   node scripts/backfill-lookup-relationships.js                 # dry-run, N:1 only, business lookups (report)
//   node scripts/backfill-lookup-relationships.js --apply         # create missing N:1 rows
//   node scripts/backfill-lookup-relationships.js --apply --with-reverse   # also create missing 1:N rows
//   node scripts/backfill-lookup-relationships.js --apply --with-reverse --include-system  # include audit fields

require("dotenv").config();
const { Pool } = require("pg");

const APPLY = process.argv.includes("--apply");
const WITH_REVERSE = process.argv.includes("--with-reverse");
const INCLUDE_SYSTEM = process.argv.includes("--include-system");

// Audit/ownership lookups that point at User on virtually every entity.
const SYSTEM_AUDIT_FIELDS = new Set(["createdby", "modifiedby", "ownerid"]);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureRow(client, plan) {
  // Idempotent guard matching the DB unique constraint
  // uq_rel_def_source_target_lookup (source, target, lookup field) — note the
  // constraint does NOT include relationship_type. For self-referential lookups
  // (source === target) the N:1 and 1:N rows share this tuple, so only one row
  // can exist; we create the N:1 first and skip its 1:N reverse.
  const { rows } = await client.query(
    `SELECT 1 FROM relationship_definition
      WHERE source_entity_id = $1 AND target_entity_id = $2
        AND source_lookup_field_id = $3
      LIMIT 1`,
    [plan.source, plan.target, plan.fieldId]
  );
  if (rows.length) return false;

  // Avoid a name collision with an unrelated existing relationship.
  let name = plan.name;
  const clash = await client.query(
    `SELECT 1 FROM relationship_definition WHERE name = $1 LIMIT 1`,
    [name]
  );
  if (clash.rows.length) name = `${name}_${plan.fieldId.slice(0, 8)}`;

  if (APPLY) {
    await client.query(
      `INSERT INTO relationship_definition
         (name, display_name, reverse_display_name, source_entity_id, target_entity_id,
          relationship_type, relationship_storage_type, source_lookup_field_id, is_active, is_system)
       VALUES ($1,$2,$3,$4,$5,$6,'lookup',$7,true,$8)`,
      [name, plan.display, plan.reverse, plan.source, plan.target, plan.type, plan.fieldId, plan.isSystem]
    );
  }
  return true;
}

(async () => {
  const client = await pool.connect();
  try {
    // Every field that points at another entity (definitive lookup signal).
    const { rows: fields } = await client.query(`
      SELECT f.field_definition_id AS field_id, f.logical_name AS field_logical,
             ce.entity_definition_id AS child_id, ce.display_name AS child, ce.logical_name AS child_logical,
             pe.entity_definition_id AS parent_id, pe.display_name AS parent, pe.logical_name AS parent_logical
      FROM field_definition f
      JOIN entity_definition ce ON ce.entity_definition_id = f.entity_definition_id
      JOIN entity_definition pe ON pe.entity_definition_id = f.lookup_entity_id
      WHERE f.lookup_entity_id IS NOT NULL
      ORDER BY ce.display_name, f.display_name`);

    // Existing partner rows tell us is_system to inherit.
    const { rows: existing } = await client.query(
      `SELECT source_lookup_field_id AS fld, relationship_type AS type, is_system
         FROM relationship_definition
        WHERE relationship_storage_type = 'lookup' AND source_lookup_field_id IS NOT NULL`
    );
    const siblingSystem = new Map(); // fieldId -> is_system of any existing partner
    for (const r of existing) if (!siblingSystem.has(r.fld)) siblingSystem.set(r.fld, r.is_system);

    const plans = [];
    let skippedSystem = 0;
    for (const f of fields) {
      if (!INCLUDE_SYSTEM && SYSTEM_AUDIT_FIELDS.has(f.field_logical)) { skippedSystem++; continue; }
      const isSystem = siblingSystem.get(f.field_id) ?? false;

      // N:1 (child -> parent) — the side the borrowed-field picker needs.
      plans.push({
        kind: "N:1", type: "N:1",
        source: f.child_id, target: f.parent_id, fieldId: f.field_id, isSystem,
        name: `${f.child_logical}_${f.field_logical}`,
        display: `${f.child} → ${f.parent}`,
        reverse: `${f.parent} → ${f.child}s`,
        label: `${f.child} → ${f.parent} (via ${f.field_logical})`,
      });

      if (WITH_REVERSE) {
        // 1:N (parent -> child) — reverse subgrid side.
        plans.push({
          kind: "1:N", type: "1:N",
          source: f.parent_id, target: f.child_id, fieldId: f.field_id, isSystem,
          name: `${f.parent_logical}_${f.child_logical}s`,
          display: `${f.parent} → ${f.child}s`,
          reverse: `${f.child} → ${f.parent}`,
          label: `${f.parent} → ${f.child}s (via ${f.field_logical})`,
        });
      }
    }

    await client.query("BEGIN");
    let created = 0;
    for (const p of plans) {
      const didInsert = await ensureRow(client, p);
      if (didInsert) {
        created++;
        console.log(`${APPLY ? "＋ created" : "would create"} [${p.kind}] ${p.label}`);
      }
    }
    await client.query(APPLY ? "COMMIT" : "ROLLBACK");

    console.log(
      `\n${APPLY ? "Applied" : "Dry-run"}: ${created} relationship row(s) ${APPLY ? "created" : "missing"}` +
      ` across ${fields.length} lookup field(s)` +
      `${WITH_REVERSE ? " (N:1 + 1:N)" : " (N:1 only — pass --with-reverse to also backfill 1:N)"}` +
      `${INCLUDE_SYSTEM ? " [incl. system audit fields]" : `; skipped ${skippedSystem} system audit field(s) (createdby/modifiedby/ownerid — pass --include-system to add)`}.`
    );
    if (!APPLY && created > 0) console.log("Re-run with --apply to write these rows.");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Backfill failed:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
