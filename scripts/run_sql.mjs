// Runs an inline SQL string (passed as argv[2]) against the linked Supabase
// project via the Management API. Authenticates with SUPABASE_ACCESS_TOKEN.
// Usage: node scripts/run_sql.mjs "SQL HERE"
const PROJECT_REF = 'ruzfzebjvikfslbyjsrm';
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error('Set SUPABASE_ACCESS_TOKEN in your environment');

const query = process.argv[2];
if (!query) throw new Error('Usage: node scripts/run_sql.mjs "<sql>"');

const res = await fetch(API, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
const text = await res.text();
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${text}`);
  process.exit(1);
}
console.log(text);
