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
    // Verify the caller is an authenticated system admin by inspecting the JWT
    // and checking the crm_user record via the anon client.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userToken = authHeader.slice(7);

    // Use the caller's token to identify them
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify system admin status via the service role client
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: crmUser, error: crmErr } = await adminClient
      .from("crm_user")
      .select("is_system_admin")
      .eq("user_id", user.id)
      .maybeSingle();

    if (crmErr || !crmUser?.is_system_admin) {
      return new Response(JSON.stringify({ error: "System admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse and validate the request body
    const body = await req.json();
    const action = body?.action as string | undefined;

    if (action === "soft_delete") {
      const flowId = body?.flow_id as string | undefined;
      if (!flowId || typeof flowId !== "string") {
        return new Response(JSON.stringify({ error: "flow_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Call the SECURITY DEFINER function via service_role
      const { error: rpcErr } = await adminClient.rpc("soft_delete_process_flow", {
        p_flow_id: flowId,
      });

      if (rpcErr) {
        return new Response(JSON.stringify({ error: rpcErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "publish") {
      const flowId = body?.flow_id as string | undefined;
      const snapshot = body?.snapshot;
      if (!flowId || typeof flowId !== "string") {
        return new Response(JSON.stringify({ error: "flow_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!snapshot || typeof snapshot !== "object") {
        return new Response(JSON.stringify({ error: "snapshot is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Apply the draft to the live flow atomically via the SECURITY DEFINER RPC.
      const { error: rpcErr } = await adminClient.rpc("publish_process_flow_draft", {
        p_flow_id: flowId,
        p_snapshot: snapshot,
      });

      if (rpcErr) {
        return new Response(JSON.stringify({ error: rpcErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
