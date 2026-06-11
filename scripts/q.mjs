// Ad-hoc query helper: node scripts/q.mjs "SELECT ..."  (prints JSON rows)
import { readFileSync } from 'node:fs';
let token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  try {
    const env = Object.fromEntries(
      readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split(/\r?\n/).filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
    );
    token = env.Token;
  } catch { /* no .env */ }
}
if (!token) { console.error('Set SUPABASE_ACCESS_TOKEN'); process.exit(1); }
const q = process.argv[2];
const res = await fetch('https://api.supabase.com/v1/projects/ruzfzebjvikfslbyjsrm/database/query', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: q }),
});
const text = await res.text();
if (!res.ok) { console.error('HTTP', res.status, text); process.exit(1); }
const rows = JSON.parse(text);
for (const r of rows) {
  for (const [k, v] of Object.entries(r)) console.log(`-- ${k}:\n${v}\n`);
  console.log('────────');
}
if (rows.length === 0) console.log('(0 rows)');
