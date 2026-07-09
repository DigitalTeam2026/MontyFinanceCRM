// Applies a migration .sql file to the LOCAL Postgres database used by the app
// (server/index.js talks to this same DB via DATABASE_URL). The other helper
// scripts in this folder (apply_migration.mjs / run_sql.mjs) target the legacy
// Supabase cloud project and are NOT the live database — use this one for the
// local `monty_finance_crm` instance.
//
// Usage: node scripts/apply_local_migration.mjs supabase/migrations/<file>.sql
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import pg from 'pg';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const connectionString = process.env.DATABASE_URL || env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL not set (env or .env)');

const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/apply_local_migration.mjs <file.sql>');
const sql = readFileSync(file, 'utf8');
const fname = basename(file).replace(/\.sql$/, '');
const m = fname.match(/^(\d+)_(.*)$/);
const version = m ? m[1] : fname;
const name = m ? m[2] : fname;

const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query('begin');
  await client.query(sql);
  // Keep CLI migration history consistent if the tracking table exists.
  await client.query(
    `insert into supabase_migrations.schema_migrations(version, name)
       values ($1, $2) on conflict (version) do nothing`,
    [version, name]
  ).catch(() => { /* history table may not exist locally — non-fatal */ });
  await client.query('commit');
  console.log(`[applied] ${fname}`);
} catch (err) {
  await client.query('rollback').catch(() => {});
  console.error(`[FAILED] ${fname}\n${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
