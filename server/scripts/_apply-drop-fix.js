// TEMP one-off: apply the drop_crm_entity fix migration against the local DB.
require("dotenv").config({ path: "c:\\Monty Finance CRM\\MontyFinanceCRM\\.env" });
const fs = require("fs");
const { Pool } = require("pg");

const MIGRATION = "c:\\Monty Finance CRM\\MontyFinanceCRM\\supabase\\migrations\\20260707120000_drop_crm_entity_clean_dependencies.sql";

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const pool = new Pool({ connectionString: url });
  const sql = fs.readFileSync(MIGRATION, "utf8");
  try {
    await pool.query(sql);
    console.log("OK: drop_crm_entity migration applied.");
  } catch (e) {
    console.error("FAILED:", e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
