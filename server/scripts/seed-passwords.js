// server/scripts/seed-passwords.js
// One-off: add crm_user.password_hash (if missing) and seed an initial password
// for every active, non-deleted user that doesn't already have one.
//
// Run from the server directory:  node scripts/seed-passwords.js
//
// The initial password is the same for all seeded users; change it per-user
// afterwards. Existing password_hash values are never overwritten.

require("dotenv").config();
const { Pool } = require("pg");
const { hashPassword } = require("../auth");

const INITIAL_PASSWORD = process.env.SEED_PASSWORD || "Monty@2026";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    await pool.query(
      `ALTER TABLE crm_user ADD COLUMN IF NOT EXISTS password_hash text`
    );
    console.log("✓ ensured crm_user.password_hash column exists");

    const { rows } = await pool.query(
      `SELECT user_id, email FROM crm_user
       WHERE deleted_at IS NULL AND is_active = true
         AND (password_hash IS NULL OR password_hash = '')`
    );

    if (!rows.length) {
      console.log("No users need seeding (all active users already have a password).");
    }

    for (const u of rows) {
      const hash = hashPassword(INITIAL_PASSWORD);
      await pool.query(`UPDATE crm_user SET password_hash = $1 WHERE user_id = $2`, [
        hash,
        u.user_id,
      ]);
      console.log(`✓ seeded password for ${u.email}`);
    }

    console.log(
      `\nDone. Seeded ${rows.length} user(s) with initial password: ${INITIAL_PASSWORD}`
    );
  } catch (err) {
    console.error("Seed failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
