import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ allowed: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ allowed: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { entity_name } = await req.json();
    if (!entity_name) {
      return new Response(
        JSON.stringify({ allowed: false, error: "entity_name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Check if user is system admin
    const { data: crmUser } = await adminClient
      .from("crm_user")
      .select("is_system_admin")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (crmUser?.is_system_admin) {
      return new Response(
        JSON.stringify({ allowed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get CRM user ID first
    const { data: crmUserRow } = await adminClient
      .from("crm_user")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!crmUserRow) {
      return new Response(
        JSON.stringify({ allowed: false, error: "User not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: roles } = await adminClient
      .from("user_security_role")
      .select("role_id")
      .eq("user_id", crmUserRow.user_id);

    if (!roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ allowed: false, error: "No security roles assigned" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const roleIds = roles.map((r: any) => r.role_id);

    // Check action_permission for import_from_excel
    const { data: perms } = await adminClient
      .from("action_permission")
      .select("is_denied")
      .in("role_id", roleIds)
      .eq("entity_name", entity_name)
      .eq("action_key", "import_from_excel");

    // Deny-wins model: if any role denies, access is denied
    const isDenied = (perms ?? []).some((p: any) => p.is_denied);

    // Also check create privilege (needed to import records)
    const { data: privs } = await adminClient
      .from("role_privilege")
      .select("can_create")
      .in("role_id", roleIds)
      .eq("entity_name", entity_name);

    const canCreate = (privs ?? []).some((p: any) => p.can_create);

    return new Response(
      JSON.stringify({
        allowed: !isDenied && canCreate,
        reason: isDenied
          ? "Import from Excel is denied for your role"
          : !canCreate
          ? "You do not have permission to create records for this entity"
          : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ allowed: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
