// TEMP: verify the dependency pre-check counts external lookups/N:N correctly.
require("dotenv").config({ path: "c:\\Monty Finance CRM\\MontyFinanceCRM\\.env" });
const { Pool } = require("pg");

const CHECK = `
  WITH deps AS (
    SELECT DISTINCT e.display_name AS nm
    FROM field_definition fd
    JOIN entity_definition e ON e.entity_definition_id = fd.entity_definition_id
    WHERE fd.lookup_entity_id = $1 AND fd.entity_definition_id <> $1
    UNION
    SELECT DISTINCT e.display_name
    FROM relationship_definition rd
    JOIN entity_definition e ON e.entity_definition_id =
      CASE WHEN rd.source_entity_id = $1 THEN rd.target_entity_id ELSE rd.source_entity_id END
    WHERE rd.relationship_type = 'N:N'
      AND (rd.source_entity_id = $1 OR rd.target_entity_id = $1)
      AND rd.source_entity_id <> rd.target_entity_id
  )
  SELECT count(*)::int AS n, string_agg(nm, ', ' ORDER BY nm) AS names FROM deps`;

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Top 8 entities by how many OTHER entities hold a lookup into them.
    const top = await pool.query(
      `SELECT e.entity_definition_id AS id, e.display_name, e.is_custom,
              count(*)::int AS inbound_lookups
       FROM field_definition fd
       JOIN entity_definition e ON e.entity_definition_id = fd.lookup_entity_id
       WHERE fd.entity_definition_id <> fd.lookup_entity_id
       GROUP BY 1,2,3 ORDER BY inbound_lookups DESC LIMIT 8`);
    console.log("Most-referenced entities (would block permanent delete):");
    for (const row of top.rows) {
      const c = await pool.query(CHECK, [row.id]);
      console.log(`  ${row.display_name} [custom=${row.is_custom}] -> pre-check n=${c.rows[0].n}; e.g. ${(c.rows[0].names||'').slice(0,80)}`);
    }
  } catch (e) { console.error("ERROR:", e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
