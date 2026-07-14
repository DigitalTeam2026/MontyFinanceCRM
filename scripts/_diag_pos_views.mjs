import pg from 'pg';
import fs from 'fs';
const env = fs.readFileSync('.env', 'utf8');
const url = (env.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
const pool = new pg.Pool({ connectionString: url });

const rows = await pool.query(`
  select v.view_id, v.name, v.view_type, v.is_system, v.deleted_at, v.created_at
  from view_definition v
  join entity_definition e on e.entity_definition_id = v.entity_definition_id
  where e.display_name ilike '%POS Location%' or e.logical_name ilike '%pos%location%'
  order by v.created_at`);

console.log(`Total POS Location view rows: ${rows.rows.length}`);
for (const r of rows.rows) {
  const del = r.deleted_at ? ' [DELETED]' : '';
  const sys = r.is_system ? ' [system]' : '';
  console.log(`${r.created_at?.toISOString?.() ?? r.created_at}  ${r.view_type}${sys}${del}  "${r.name}"  ${r.view_id}`);
}
await pool.end();
