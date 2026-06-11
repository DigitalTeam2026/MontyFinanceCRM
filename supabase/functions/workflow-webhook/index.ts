import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, assertSafeUrl, authenticateCaller } from "../_shared/security.ts";

interface WebhookPayload {
  // Server-authoritative: the URL is resolved from this workflow step, not trusted
  // from the client. `url` (below) is accepted only as a fallback for steps that
  // have no persisted config and is still SSRF-checked.
  workflow_step_id?: string;
  url?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH";
  headers?: Record<string, string>;
  body?: string;
  record?: Record<string, unknown>;
  entity_name?: string;
  record_id?: string;
}

const MAX_RESPONSE_BYTES = 4096; // cap echoed body to avoid being an exfiltration oracle

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // 1. Authenticate — reject anon key and anonymous callers
  const auth = await authenticateCaller(req, supabaseUrl, serviceRoleKey, anonKey);
  if (!auth.ok) return json({ error: "Unauthorized" }, 401);

  try {
    const payload: WebhookPayload = await req.json();

    // 2. Resolve the target URL server-side from the workflow step (authoritative)
    let targetUrl: string | undefined;
    if (payload.workflow_step_id) {
      const admin = createClient(supabaseUrl, serviceRoleKey);
      const { data: step, error } = await admin
        .from("workflow_step")
        .select("config_json, step_type")
        .eq("workflow_step_id", payload.workflow_step_id)
        .maybeSingle();
      if (error || !step) return json({ error: "Workflow step not found" }, 404);
      if (step.step_type !== "webhook") return json({ error: "Step is not a webhook" }, 400);
      targetUrl = (step.config_json as { url?: string } | null)?.url;
    } else {
      targetUrl = payload.url; // fallback path, still SSRF-validated below
    }

    if (!targetUrl) return json({ error: "No webhook URL configured" }, 400);

    // 3. SSRF guard — blocks private/loopback/metadata hosts and rebinding
    const safe = await assertSafeUrl(targetUrl);
    if (!safe.ok) return json({ error: safe.reason ?? "URL not permitted" }, 400);

    const outHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "CRM-Workflow-Engine/1.0",
      ...(payload.headers ?? {}),
    };
    const method = payload.method ?? "POST";
    const outBody = method !== "GET" && payload.body !== undefined ? payload.body : undefined;

    const start = Date.now();
    const response = await fetch(targetUrl, {
      method,
      headers: outHeaders,
      body: outBody,
      redirect: "manual", // do not follow redirects into internal hosts
      signal: AbortSignal.timeout(15_000),
    });

    // 4. Cap and avoid echoing arbitrary response bodies in full
    const raw = await response.text().catch(() => "");
    const truncated = raw.length > MAX_RESPONSE_BYTES;
    const snippet = raw.slice(0, MAX_RESPONSE_BYTES);

    return json(
      {
        status_code: response.status,
        ok: response.ok,
        duration_ms: Date.now() - start,
        response_preview: snippet,
        truncated,
      },
      200,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.toLowerCase().includes("timeout") || message.toLowerCase().includes("abort");
    // Generic client-facing message; detail stays in logs
    console.error("[workflow-webhook] delivery error:", message);
    return json({ error: isTimeout ? "Webhook request timed out (15s limit)" : "Webhook delivery failed" }, 502);
  }
});
