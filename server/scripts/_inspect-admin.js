require("dotenv").config({ path: "c:\\Monty Finance CRM\\MontyFinanceCRM\\.env" });
const { Pool } = require("pg");
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(
      `SELECT n.nspname AS schema, p.proname AS name, pg_get_functiondef(p.oid) AS def
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE p.proname='is_system_admin'`);
    r.rows.forEach(row => { console.log(`-- ${row.schema}.${row.name}\n${row.def}\n`); });
  } catch (e) { console.error("ERROR:", e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
