import pg from 'pg';
import fs from 'fs';
const env = fs.readFileSync('.env', 'utf8');
const url = (env.match(/^DATABASE_URL=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
const pool = new pg.Pool({ connectionString: url });

const TARGET = '80e28246-ea87-4212-a86b-d0f9002f5759'; // Country "Nsdui" state option (value 3)
const edId   = 'abcb18a7-77e3-44e6-8fd0-9cd422dace0e'; // Country

// Safety re-check: make sure no country row uses state_value 3
const inUse = await pool.query(`select count(*)::int as n from country where state_code = '3' or state_code = 3::text`);
if (inUse.rows[0].n > 0) {
  console.log(`ABORT: ${inUse.rows[0].n} country records still use state_code 3.`);
  await pool.end();
  process.exit(1);
}

const del = await pool.query(
  `delete from statecode_definition where statecode_id = $1 and display_label = 'Nsdui' returning statecode_id, display_label, state_value`,
  [TARGET]);
console.log(`Deleted ${del.rowCount} row(s):`, del.rows);

console.log('\n=== Remaining Country state options ===');
const sc = await pool.query(
  `select state_value, display_label, sort_order from statecode_definition where entity_definition_id = $1 order by sort_order`,
  [edId]);
for (const r of sc.rows) console.log(`  value=${r.state_value}  label="${r.display_label}"`);

await pool.end();
