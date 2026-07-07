require("dotenv").config({ path: "c:\\Monty Finance CRM\\MontyFinanceCRM\\.env" });
const { Pool } = require("pg");
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r = await pool.query(
      `SELECT n.nspname AS schema, pg_get_functiondef(p.oid) AS def
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE p.proname='get_current_user_is_admin'`);
    r.rows.forEach(row => console.log(`-- ${row.schema}\n${row.def}\n`));
  } catch (e) { console.error("ERROR:", e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
