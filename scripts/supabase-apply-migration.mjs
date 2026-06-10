#!/usr/bin/env node
/*
 * Apply a Supabase migration file to the linked remote project using the
 * Management API (access token only — no database password required).
 *
 * Usage:  node scripts/supabase-apply-migration.mjs supabase/migrations/<file>.sql
 *
 * Reads the access token from .env (Token=...) or the SUPABASE_ACCESS_TOKEN env
 * var, runs the SQL against the remote database, then records the migration in
 * supabase_migrations.schema_migrations so the CLI history stays consistent.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const PROJECT_REF = 'ruzfzebjvikfslbyjsrm';
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

function getToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  try {
    const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    const line = env.split(/\r?\n/).find((l) => /^Token\s*=/.test(l));
    if (line) return line.split('=').slice(1).join('=').trim();
  } catch { /* ignore */ }
  throw new Error('No access token found (set SUPABASE_ACCESS_TOKEN or Token= in .env)');
}

async function runSql(token, query) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${res.status}: ${text}`);
  return text;
}

const sqlLit = (s) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/supabase-apply-migration.mjs <path-to-sql>');
  const token = getToken();
  const sql = readFileSync(file, 'utf8');
  const version = basename(file).match(/^(\d+)/)?.[1];
  if (!version) throw new Error(`Cannot derive version from filename: ${file}`);
  const name = basename(file).replace(/^\d+_?/, '').replace(/\.sql$/, '');

  console.log(`Applying ${basename(file)} (version ${version})...`);
  await runSql(token, sql);
  console.log('  SQL applied.');

  await runSql(
    token,
    `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
     VALUES (${sqlLit(version)}, ${sqlLit(name)}, ARRAY[${sqlLit(sql)}])
     ON CONFLICT (version) DO NOTHING;`
  );
  console.log('  Recorded in migration history.');
  console.log('Done.');
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
