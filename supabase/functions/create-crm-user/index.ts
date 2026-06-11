import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerCrmUser } = await adminClient
      .from("crm_user")
      .select("is_system_admin, is_active")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (!callerCrmUser?.is_system_admin || callerCrmUser.is_active === false) {
      return new Response(JSON.stringify({ error: "Forbidden: system admins only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email, password, full_name, username, job_title, mobile_phone, business_unit_id, is_active, is_system_admin } = body;

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "email and password are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Server-side password policy (min 10 chars, mixed character classes)
    const pw = String(password);
    const strong = pw.length >= 10 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
    if (!strong) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 10 characters and include lower, upper and numeric characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = authData.user.id;

    const { data: crmUser, error: crmError } = await adminClient
      .from("crm_user")
      .insert({
        user_id: newUserId,
        email: email ?? "",
        full_name: full_name ?? "",
        username: username ?? null,
        job_title: job_title ?? null,
        mobile_phone: mobile_phone ?? null,
        business_unit_id: business_unit_id ?? null,
        is_active: is_active ?? true,
        is_system_admin: is_system_admin ?? false,
      })
      .select()
      .single();

    if (crmError) {
      await adminClient.auth.admin.deleteUser(newUserId);
      console.error("[create-crm-user] crm_user insert failed:", crmError.message);
      return new Response(JSON.stringify({ error: "Failed to create user record" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit the privilege grant when a new system admin is minted
    if (is_system_admin === true) {
      await adminClient.from("audit_log").insert({
        entity_name: "crm_user",
        record_id: newUserId,
        action: "grant_system_admin",
        changed_by: caller.id,
        new_values: { is_system_admin: true, email },
      });
    }

    return new Response(JSON.stringify({ user: crmUser }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[create-crm-user] error:", err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
