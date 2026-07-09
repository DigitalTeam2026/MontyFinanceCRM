// Seeds the Power Automation "list_rows" reference use case:
//   - an `email_recipients` table (created via the same create_crm_entity /
//     add_custom_field_column RPCs Admin Studio uses — NOT raw DDL),
//   - a few recipient rows,
//   - the demo rule "Notify unit on approval" (list_rows -> send_email).
//
// Idempotent: safe to re-run. Usage: node server/scripts/seed-power-automation-demo.mjs
import { readFileSync } from "node:fs";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
// Single connection so the admin JWT claim (needed by create_crm_entity's admin
// check) sticks for the whole session — mirrors how the API sets request.jwt.claims.
const pool = new pg.Client({ connectionString: env.DATABASE_URL });

async function fieldTypeId(name) {
  const r = await pool.query("select field_type_id from field_type where name=$1 limit 1", [name]);
  if (!r.rows[0]) throw new Error(`field_type ${name} not found`);
  return r.rows[0].field_type_id;
}

async function ensureField(entityId, table, logical, display, typeName, sortOrder) {
  const exists = await pool.query(
    "select 1 from field_definition where entity_definition_id=$1 and logical_name=$2 and deleted_at is null",
    [entityId, logical]
  );
  if (exists.rows.length) return;
  // Create the physical column (no-op / tolerated if it already exists, e.g. the
  // create_crm_entity primary field, which makes the column but no metadata row).
  const colExists = await pool.query(
    "select 1 from information_schema.columns where table_name=$1 and column_name=$2",
    [table, logical]
  );
  if (!colExists.rows.length) {
    await pool.query("select add_custom_field_column($1,$2,$3)", [table, logical, typeName]);
  }
  await pool.query(
    `insert into field_definition
       (entity_definition_id, logical_name, display_name, physical_column_name, field_type_id, is_active, is_custom, sort_order)
     values ($1,$2,$3,$2,$4,true,true,$5)`,
    [entityId, logical, display, await fieldTypeId(typeName), sortOrder]
  );
}

async function main() {
  await pool.connect();
  // Authenticate as a system admin for the admin-gated create_crm_entity RPC.
  const admin = (await pool.query("select user_id from crm_user where is_system_admin=true limit 1")).rows[0];
  if (!admin) throw new Error("no system-admin user found to run the seed under");
  await pool.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: admin.user_id })]);

  // 1) Entity via the real RPC (not raw DDL)
  let ent = (await pool.query("select entity_definition_id, physical_table_name from entity_definition where logical_name=$1", ["email_recipients"])).rows[0];
  if (!ent) {
    const res = (await pool.query(
      `select create_crm_entity(
         p_logical_name => 'email_recipients',
         p_display_name => 'Email Recipient',
         p_display_name_plural => 'Email Recipients',
         p_physical_table_name => 'email_recipients',
         p_primary_field_name => 'email',
         p_ownership_type => 'organization',
         p_is_active => true) as r`
    )).rows[0].r;
    if (!res?.ok) throw new Error("create_crm_entity failed: " + JSON.stringify(res));
    ent = (await pool.query("select entity_definition_id, physical_table_name from entity_definition where logical_name=$1", ["email_recipients"])).rows[0];
    console.log("[seed] created email_recipients entity");
  } else {
    console.log("[seed] email_recipients entity already exists");
  }

  // 2) Fields: email (primary — column exists but needs metadata), unit, enabled.
  await ensureField(ent.entity_definition_id, ent.physical_table_name, "email", "Email", "email", 0);
  await ensureField(ent.entity_definition_id, ent.physical_table_name, "unit", "Unit", "text", 10);
  await ensureField(ent.entity_definition_id, ent.physical_table_name, "enabled", "Enabled", "boolean", 20);
  await pool.query("select reload_postgrest_schema()").catch(() => {});

  // 3) Seed a few rows (idempotent by email)
  const seedRows = [
    ["ops1@montyholding.com", "operations", true],
    ["ops2@montyholding.com", "operations", true],
    ["finance1@montyholding.com", "finance", true],
    ["ops-disabled@montyholding.com", "operations", false],
  ];
  for (const [email, unit, enabled] of seedRows) {
    await pool.query(
      `insert into email_recipients (email, unit, enabled, owner_id)
       select $1,$2,$3,$4 where not exists (select 1 from email_recipients where email=$1)`,
      [email, unit, enabled, admin.user_id]
    );
  }
  console.log("[seed] recipient rows ensured");

  // 4) Demo rule (idempotent by name)
  const existing = await pool.query("select automation_rule_id from automation_rule where name=$1", ["Notify unit on approval"]);
  if (existing.rows.length) { console.log("[seed] demo rule already exists"); await pool.end(); return; }

  const rule = (await pool.query(
    `insert into automation_rule
       (name, description, table_logical_name, trigger_event, field_logical_name, operator, trigger_value, enabled)
     values ('Notify unit on approval',
       'Lists the operations-unit recipients and emails them when an opportunity approval starts.',
       'opportunity','update','start_approval','changes_to','true'::jsonb, false)
     returning automation_rule_id`
  )).rows[0];

  await pool.query(
    `insert into automation_rule_action (rule_id, sort_order, action_type, config) values ($1,0,'list_rows',$2)`,
    [rule.automation_rule_id, JSON.stringify({
      step_name: "recipients", source_table: "email_recipients",
      filters: [
        { field: "unit", operator: "equals", value: "operations" },
        { field: "enabled", operator: "equals", value: true },
      ],
      columns: ["email"], limit: 100,
    })]
  );
  await pool.query(
    `insert into automation_rule_action (rule_id, sort_order, action_type, config) values ($1,1,'send_email',$2)`,
    [rule.automation_rule_id, JSON.stringify({
      to_static: [], to_fields: [],
      to: "{{steps.recipients.join(email, ';')}}",
      cc: "",
      subject: "Approval started: {{record.topic}}",
      body: "<p>Approval has started for <strong>{{record.topic}}</strong>.</p><p><a href=\"{{record.url}}\">Open the opportunity</a></p>",
    })]
  );
  console.log("[seed] created demo rule 'Notify unit on approval' (disabled)");
  await pool.end();
}

main().catch((e) => { console.error("[seed] FAILED:", e.message); process.exit(1); });
