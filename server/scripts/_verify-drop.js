// TEMP one-off: dry-run drop_crm_entity for the `test` entity as an admin, rolled back.
require("dotenv").config({ path: "c:\\Monty Finance CRM\\MontyFinanceCRM\\.env" });
const { Pool } = require("pg");

const ADMIN_UID = "d7cea7df-3710-48f0-9a32-3f48361df202"; // admin@montyfinance.com

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const ent = await pool.query(
      `SELECT entity_definition_id AS id, display_name, physical_table_name, is_custom
       FROM entity_definition
       WHERE is_custom = true AND deleted_at IS NULL
         AND (lower(display_name)='test' OR physical_table_name IN ('test','crm_test'))
       LIMIT 5`);
    console.log("Custom 'test' entities:", ent.rows);
    if (!ent.rows.length) { console.log("No live custom 'test' entity found."); return; }
    const e = ent.rows[0];

    const sc  = await pool.query(`SELECT count(*)::int n FROM statecode_definition WHERE entity_definition_id=$1`, [e.id]);
    const dep = await pool.query(`SELECT count(*)::int n FROM field_definition WHERE lookup_entity_id=$1 AND entity_definition_id<>$1`, [e.id]);
    console.log(`\nEntity "${e.display_name}" (${e.id}) table=${e.physical_table_name}`);
    console.log(`  statecode_definition rows (were blocking before fix): ${sc.rows[0].n}`);
    console.log(`  external lookup deps (should block if > 0):           ${dep.rows[0].n}`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Authenticate as admin so security.is_system_admin() passes.
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN_UID })]);
      const chk = await client.query(`SELECT security.is_system_admin() AS ok`);
      console.log(`\n  is_system_admin() in session: ${chk.rows[0].ok}`);
      const r = await client.query(`SELECT public.drop_crm_entity($1) AS result`, [e.id]);
      console.log("  drop_crm_entity() returns:", JSON.stringify(r.rows[0].result));
      // Confirm the row would be gone within the tx
      const gone = await client.query(`SELECT count(*)::int n FROM entity_definition WHERE entity_definition_id=$1`, [e.id]);
      const scGone = await client.query(`SELECT count(*)::int n FROM statecode_definition WHERE entity_definition_id=$1`, [e.id]);
      console.log(`  after (in-tx) entity_definition rows: ${gone.rows[0].n}, statecode rows: ${scGone.rows[0].n}`);
      await client.query("ROLLBACK");
      console.log("  ROLLED BACK — nothing actually deleted.");
    } finally { client.release(); }
  } catch (e) { console.error("ERROR:", e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
