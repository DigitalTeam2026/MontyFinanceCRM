require("dotenv").config({ path: "c:\\Monty Finance CRM\\MontyFinanceCRM\\.env" });
const { Pool } = require("pg");
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const uid = await pool.query(
      `SELECT pg_get_functiondef(p.oid) def
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE p.proname='uid' AND n.nspname='auth'`);
    uid.rows.forEach(r => console.log(r.def, "\n"));
    const admin = await pool.query(
      `SELECT user_id, email FROM crm_user WHERE is_system_admin=true AND is_active=true AND deleted_at IS NULL LIMIT 3`);
    console.log("Admins:", admin.rows);
  } catch (e) { console.error("ERROR:", e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
