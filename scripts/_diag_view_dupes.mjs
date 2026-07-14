import pg from 'pg';
import fs from 'fs';
const env = fs.readFileSync('.env', 'utf8');
const url = (env.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
const pool = new pg.Pool({ connectionString: url });

// Duplicate views: same entity + same name, still not soft-deleted.
const dupes = await pool.query(`
  select e.display_name as entity, v.name, v.view_type, count(*) as copies,
         min(v.created_at) as first_created, max(v.created_at) as last_created,
         array_agg(v.view_id order by v.created_at) as view_ids
  from view_definition v
  join entity_definition e on e.entity_definition_id = v.entity_definition_id
  where v.deleted_at is null
  group by e.display_name, v.name, v.view_type
  having count(*) > 1
  order by count(*) desc, e.display_name, v.name`);

if (dupes.rows.length === 0) {
  console.log('No duplicate views found.');
} else {
  for (const r of dupes.rows) {
    console.log(`${r.entity}  |  "${r.name}" (${r.view_type})  ->  ${r.copies} copies`);
    console.log(`   first: ${r.first_created?.toISOString?.() ?? r.first_created}`);
    console.log(`   last:  ${r.last_created?.toISOString?.() ?? r.last_created}`);
    console.log(`   ids (oldest first): ${r.view_ids.join(', ')}`);
    console.log('   -> keep the FIRST, the rest are retry-duplicates.');
    console.log('=================================');
  }
}
await pool.end();
