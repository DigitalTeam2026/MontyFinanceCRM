import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RuleCondition {
  condition_type: string;
  target_entity: string | null;
  target_field: string | null;
  source_field: string | null;
  operator: string | null;
  value: string | null;
}

interface RuleAction {
  action_type: string;
  target_entity: string | null;
  target_field: string | null;
  source_field: string | null;
  field_value: string | null;
  message: string | null;
  display_order: number;
}

interface DigitalRule {
  digital_rule_id: string;
  name: string;
  entity_logical_name: string;
  trigger_event: string;
  priority: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

interface DeleteRequest {
  entity: string;
  record_ids: string[];
  confirmed?: boolean;
  dry_run?: boolean;
}

const ENTITY_TABLE: Record<string, string> = {
  accounts: "account",
  contacts: "contact",
  leads: "lead",
  lead: "lead",
  opportunities: "opportunity",
  opportunity: "opportunity",
  tickets: "ticket",
  ticket: "ticket",
  product_family: "product_family",
  product: "product",
};

const ENTITY_PK: Record<string, string> = {
  accounts: "account_id",
  contacts: "contact_id",
  leads: "lead_id",
  lead: "lead_id",
  opportunities: "opportunity_id",
  opportunity: "opportunity_id",
  tickets: "ticket_id",
  ticket: "ticket_id",
  product_family: "family_id",
  product: "product_id",
};

const dynamicMetaCache = new Map<string, { table: string; pk: string }>();

async function resolveEntityMeta(
  client: ReturnType<typeof createClient>,
  entity: string,
): Promise<{ table: string; pk: string }> {
  if (ENTITY_TABLE[entity] && ENTITY_PK[entity]) {
    return { table: ENTITY_TABLE[entity], pk: ENTITY_PK[entity] };
  }
  const cached = dynamicMetaCache.get(entity);
  if (cached) return cached;

  const { data } = await client
    .from("entity_definition")
    .select("physical_table_name")
    .eq("logical_name", entity)
    .maybeSingle();

  if (data?.physical_table_name) {
    const table = data.physical_table_name;
    const pk = `${table}_id`;
    const meta = { table, pk };
    dynamicMetaCache.set(entity, meta);
    return meta;
  }

  return { table: entity, pk: `${entity}_id` };
}

// Soft-delete via the soft_delete_records RPC, which detects the real PK and
// whichever soft-delete/audit columns the table actually has (deleted_at,
// is_deleted, …) at runtime. This avoids hardcoding per-table conventions, which
// drift whenever the schema changes (e.g. the deleted_at standardisation).
function applySoftDelete(
  client: ReturnType<typeof createClient>,
  table: string,
  recordIds: string[],
  actorId: string | null,
) {
  return client.rpc("soft_delete_records", {
    p_table: table,
    p_ids: recordIds,
    p_actor: actorId,
    p_match_col: null,
  });
}

const PLURAL_TO_LOGICAL: Record<string, string> = {
  accounts: "account",
  contacts: "contact",
  leads: "lead",
  opportunities: "opportunity",
  tickets: "ticket",
};

function toLogicalName(entity: string): string {
  return PLURAL_TO_LOGICAL[entity] ?? entity;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: DeleteRequest = await req.json();
    const { entity, record_ids, confirmed = false, dry_run = false } = body;

    if (!entity || !record_ids?.length) {
      return new Response(
        JSON.stringify({ error: "entity and record_ids are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const entityLogical = toLogicalName(entity);
    const resolved = await resolveEntityMeta(adminClient, entityLogical);
    const table = resolved.table;
    const pk = resolved.pk;

    // Enforce action permission: check if user's roles deny the delete action
    const { data: crmUserRow } = await adminClient
      .from("crm_user")
      .select("user_id, is_system_admin")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!crmUserRow) {
      return new Response(
        JSON.stringify({ error: "CRM user not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!crmUserRow.is_system_admin) {
      const { data: userRoles } = await adminClient
        .from("user_security_role")
        .select("role_id")
        .eq("user_id", crmUserRow.user_id);

      const roleIds = (userRoles ?? []).map((r: { role_id: string }) => r.role_id);

      if (roleIds.length === 0) {
        return new Response(
          JSON.stringify({ error: "No security roles assigned — delete denied" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Check privilege: can_delete must be granted by at least one role
      const { data: privRows } = await adminClient
        .from("role_privilege")
        .select("can_delete")
        .in("role_id", roleIds)
        .eq("entity_name", entityLogical);

      const hasDeletePrivilege = (privRows ?? []).some(
        (p: { can_delete: boolean }) => p.can_delete,
      );

      if (!hasDeletePrivilege) {
        return new Response(
          JSON.stringify({ error: "Delete is denied for your security role" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // For bulk delete (multiple records), also check the bulk_delete action permission
      if (record_ids.length > 1) {
        const { data: actionPerms } = await adminClient
          .from("action_permission")
          .select("is_denied")
          .in("role_id", roleIds)
          .eq("entity_name", entityLogical)
          .eq("action_key", "bulk_delete");

        if ((actionPerms ?? []).some((p: { is_denied: boolean }) => p.is_denied)) {
          return new Response(
            JSON.stringify({ error: "Bulk delete is denied for your security role" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    // Fetch active rules for this entity
    const { data: rules } = await adminClient
      .from("digital_rule")
      .select(
        "digital_rule_id, name, entity_logical_name, trigger_event, priority"
      )
      .eq("entity_logical_name", entityLogical)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("priority", { ascending: true });

    if (!rules || rules.length === 0) {
      // No rules: do a plain soft delete
      if (dry_run) {
        return new Response(
          JSON.stringify({ requires_confirmation: false, confirmation_messages: [], rules_matched: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { error } = await applySoftDelete(adminClient, table, record_ids, user.id);
      if (error) throw new Error(`Delete failed: ${error.message}`);
      return new Response(
        JSON.stringify({ success: true, deleted: record_ids.length, errors: 0, actions_executed: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch conditions and actions for matched rules
    const ruleIds = rules.map((r) => r.digital_rule_id);

    const [condResult, actResult] = await Promise.all([
      adminClient
        .from("digital_rule_condition")
        .select("*")
        .in("digital_rule_id", ruleIds)
        .order("display_order"),
      adminClient
        .from("digital_rule_action")
        .select("*")
        .in("digital_rule_id", ruleIds)
        .order("display_order"),
    ]);

    const condsByRule = new Map<string, RuleCondition[]>();
    for (const c of condResult.data ?? []) {
      const arr = condsByRule.get(c.digital_rule_id) ?? [];
      arr.push(c);
      condsByRule.set(c.digital_rule_id, arr);
    }

    const actsByRule = new Map<string, RuleAction[]>();
    for (const a of actResult.data ?? []) {
      const arr = actsByRule.get(a.digital_rule_id) ?? [];
      arr.push(a);
      actsByRule.set(a.digital_rule_id, arr);
    }

    const fullRules: DigitalRule[] = rules.map((r) => ({
      ...r,
      conditions: condsByRule.get(r.digital_rule_id) ?? [],
      actions: actsByRule.get(r.digital_rule_id) ?? [],
    }));

    // For each record, evaluate rules and collect actions
    const allConfirmMessages: string[] = [];
    const allBlockMessages: string[] = [];

    interface PendingAction {
      ruleId: string;
      ruleName: string;
      recordId: string;
      action: RuleAction;
    }
    const pendingActions: PendingAction[] = [];

    for (const recordId of record_ids) {
      // Fetch the record
      const { data: record } = await adminClient
        .from(table)
        .select("*")
        .eq(pk, recordId)
        .maybeSingle();

      if (!record) continue;

      for (const rule of fullRules) {
        if (rule.trigger_event !== "before_delete") continue;

        const condsMet = await evaluateConditions(
          adminClient,
          rule.conditions,
          record,
          entityLogical,
          pk,
          recordId
        );
        if (!condsMet) continue;

        for (const action of rule.actions) {
          if (action.action_type === "confirm_before_delete") {
            if (action.message && !allConfirmMessages.includes(action.message)) {
              allConfirmMessages.push(action.message);
            }
          } else if (action.action_type === "block_delete") {
            if (action.message && !allBlockMessages.includes(action.message)) {
              allBlockMessages.push(action.message);
            }
          } else {
            pendingActions.push({
              ruleId: rule.digital_rule_id,
              ruleName: rule.name,
              recordId,
              action,
            });
          }
        }
      }
    }

    // If there are block messages, reject the delete
    if (allBlockMessages.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          blocked: true,
          block_messages: allBlockMessages,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If confirmation required and not confirmed, return the messages
    if (allConfirmMessages.length > 0 && !confirmed) {
      return new Response(
        JSON.stringify({
          requires_confirmation: true,
          confirmation_messages: allConfirmMessages,
          rules_matched: fullRules.map((r) => r.name),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // dry_run just reports what would happen
    if (dry_run) {
      return new Response(
        JSON.stringify({
          requires_confirmation: allConfirmMessages.length > 0,
          confirmation_messages: allConfirmMessages,
          rules_matched: fullRules.map((r) => r.name),
          pending_actions: pendingActions.map((p) => ({
            rule: p.ruleName,
            action: p.action.action_type,
            target: p.action.target_entity,
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Execute all pending actions
    const actionsExecuted: string[] = [];
    const logs: Array<{
      digital_rule_id: string;
      rule_name: string;
      entity_logical_name: string;
      record_id: string;
      user_id: string;
      action_taken: string;
      success: boolean;
      error_message: string | null;
    }> = [];

    for (const pa of pendingActions) {
      const { ruleId, ruleName, recordId, action } = pa;
      try {
        await executeAction(adminClient, action, table, pk, recordId, entityLogical, user.id);
        const desc = `${action.action_type}: ${action.target_entity ?? entity} ${action.target_field ?? ""}`.trim();
        actionsExecuted.push(desc);
        logs.push({
          digital_rule_id: ruleId,
          rule_name: ruleName,
          entity_logical_name: entityLogical,
          record_id: recordId,
          user_id: user.id,
          action_taken: desc,
          success: true,
          error_message: null,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logs.push({
          digital_rule_id: ruleId,
          rule_name: ruleName,
          entity_logical_name: entityLogical,
          record_id: recordId,
          user_id: user.id,
          action_taken: `FAILED ${action.action_type}`,
          success: false,
          error_message: msg,
        });
        // Rollback: since we can't use DB transactions from the client, we fail the whole request
        if (logs.length > 0) {
          await adminClient
            .from("digital_rule_execution_log")
            .insert(logs);
        }
        return new Response(
          JSON.stringify({
            success: false,
            error: `Rule action failed: ${msg}`,
            actions_executed: actionsExecuted,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Now perform the actual soft delete on the primary records
    const { error: deleteError } = await applySoftDelete(adminClient, table, record_ids, user.id);

    if (deleteError) {
      logs.push({
        digital_rule_id: "",
        rule_name: "Primary Delete",
        entity_logical_name: entityLogical,
        record_id: record_ids[0],
        user_id: user.id,
        action_taken: "FAILED soft_delete on primary entity",
        success: false,
        error_message: deleteError.message,
      });
      if (logs.length > 0) {
        await adminClient.from("digital_rule_execution_log").insert(logs);
      }
      throw new Error(`Primary delete failed: ${deleteError.message}`);
    }

    logs.push(
      ...record_ids.map((rid) => ({
        digital_rule_id: "",
        rule_name: "Primary Delete",
        entity_logical_name: entityLogical,
        record_id: rid,
        user_id: user.id,
        action_taken: `soft_delete ${entityLogical}`,
        success: true,
        error_message: null,
      }))
    );

    // Write all logs
    if (logs.length > 0) {
      await adminClient.from("digital_rule_execution_log").insert(logs);
    }

    return new Response(
      JSON.stringify({
        success: true,
        deleted: record_ids.length,
        errors: 0,
        actions_executed: actionsExecuted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function evaluateConditions(
  client: ReturnType<typeof createClient>,
  conditions: RuleCondition[],
  record: Record<string, unknown>,
  _entityLogical: string,
  _pk: string,
  recordId: string
): Promise<boolean> {
  for (const cond of conditions) {
    switch (cond.condition_type) {
      case "lookup_not_null": {
        const val = record[cond.source_field ?? ""];
        if (!val) return false;
        break;
      }
      case "related_record_exists": {
        if (!cond.target_entity || !cond.target_field || !cond.source_field)
          return false;
        const sourceVal = record[cond.source_field] ?? recordId;
        const targetMeta = await resolveEntityMeta(client, cond.target_entity);
        const { count } = await client
          .from(targetMeta.table)
          .select("*", { count: "exact", head: true })
          .eq(cond.target_field, sourceVal)
          .eq("is_deleted", false);
        if (!count || count === 0) return false;
        break;
      }
      case "field_equals": {
        const val = String(record[cond.source_field ?? ""] ?? "");
        if (val !== (cond.value ?? "")) return false;
        break;
      }
      case "status_equals": {
        const val = String(record[cond.source_field ?? "state_code"] ?? "");
        if (val !== (cond.value ?? "")) return false;
        break;
      }
      case "custom":
        break;
      default:
        return false;
    }
  }
  return true;
}

async function executeAction(
  client: ReturnType<typeof createClient>,
  action: RuleAction,
  sourceTable: string,
  sourcePk: string,
  recordId: string,
  _entityLogical: string,
  actorId: string | null
): Promise<void> {
  // Fetch the record to get linked IDs
  const { data: record } = await client
    .from(sourceTable)
    .select("*")
    .eq(sourcePk, recordId)
    .maybeSingle();

  if (!record) return;

  switch (action.action_type) {
    case "update_field": {
      if (!action.target_entity || !action.target_field) return;
      const ufMeta = await resolveEntityMeta(client, action.target_entity);
      const linkedId = record[action.source_field ?? ""];
      if (!linkedId) return;

      let parsedValue: unknown = action.field_value;
      if (parsedValue === "true") parsedValue = true;
      else if (parsedValue === "false") parsedValue = false;
      else if (parsedValue && !isNaN(Number(parsedValue)))
        parsedValue = Number(parsedValue);

      const { error } = await client
        .from(ufMeta.table)
        .update({ [action.target_field]: parsedValue })
        .eq(ufMeta.pk, linkedId);
      if (error) throw new Error(`update_field: ${error.message}`);
      break;
    }

    case "clear_lookup": {
      if (!action.target_entity || !action.target_field) return;
      const clMeta = await resolveEntityMeta(client, action.target_entity);
      const linkedId = record[action.source_field ?? ""];
      if (!linkedId) return;
      const { error } = await client
        .from(clMeta.table)
        .update({ [action.target_field]: null })
        .eq(clMeta.pk, linkedId);
      if (error) throw new Error(`clear_lookup: ${error.message}`);
      break;
    }

    case "reopen_related": {
      if (!action.target_entity) return;
      const rrMeta = await resolveEntityMeta(client, action.target_entity);
      const linkedId = record[action.source_field ?? ""];
      if (!linkedId) return;
      const { error } = await client
        .from(rrMeta.table)
        .update({ state_code: 1, status_reason: 1 })
        .eq(rrMeta.pk, linkedId);
      if (error) throw new Error(`reopen_related: ${error.message}`);
      break;
    }

    case "delete_related": {
      if (!action.target_entity || !action.target_field) return;
      const drMeta = await resolveEntityMeta(client, action.target_entity);
      const sourceVal = record[action.source_field ?? sourcePk] ?? recordId;
      const { error } = await client.rpc("soft_delete_records", {
        p_table: drMeta.table,
        p_ids: [String(sourceVal)],
        p_actor: actorId,
        p_match_col: action.target_field,
      });
      if (error) throw new Error(`delete_related: ${error.message}`);
      break;
    }

    case "cascade_delete": {
      if (!action.target_entity || !action.target_field) return;
      const cdMeta = await resolveEntityMeta(client, action.target_entity);
      const sourceVal = record[action.source_field ?? sourcePk] ?? recordId;
      const { error } = await client.rpc("soft_delete_records", {
        p_table: cdMeta.table,
        p_ids: [String(sourceVal)],
        p_actor: actorId,
        p_match_col: action.target_field,
      });
      if (error) throw new Error(`cascade_delete: ${error.message}`);
      break;
    }

    case "confirm_before_delete":
    case "block_delete":
      // These are handled before execution
      break;

    default:
      break;
  }
}
