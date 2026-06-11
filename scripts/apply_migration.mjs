// Applies a single migration .sql file to the linked Supabase project via the
// Management API (authenticates with the PAT in .env — no DB password needed),
// then records it in supabase_migrations.schema_migrations so the CLI history
// stays consistent.
//
// Usage: node scripts/apply_migration.mjs supabase/migrations/<file>.sql
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const PROJECT_REF = 'ruzfzebjvikfslbyjsrm';
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

// Prefer the env var (recommended); fall back to a Token= line in .env if present.
let TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  try {
    const env = Object.fromEntries(
      readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
    );
    TOKEN = env.Token;
  } catch { /* no .env */ }
}
if (!TOKEN) throw new Error('Set SUPABASE_ACCESS_TOKEN in your environment');

const file = process.argv[2];
if (!file) throw new Error('Usage: node apply_migration.mjs <file.sql>');

const sql = readFileSync(file, 'utf8');
const fname = basename(file).replace(/\.sql$/, '');
const m = fname.match(/^(\d+)_(.*)$/);
const version = m ? m[1] : fname;
const name = m ? m[2] : fname;

async function runSql(query) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return text;
}

try {
  await runSql(sql);
  console.log(`[applied] ${fname}`);
  // Record in migration history (idempotent).
  const rec = `insert into supabase_migrations.schema_migrations(version, name)
    values ('${version}', '${name.replace(/'/g, "''")}')
    on conflict (version) do nothing;`;
  await runSql(rec);
  console.log(`[recorded] version=${version} name=${name}`);
} catch (err) {
  console.error(`[FAILED] ${fname}\n${err.message}`);
  process.exit(1);
}
