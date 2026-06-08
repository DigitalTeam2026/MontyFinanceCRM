import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface WebhookPayload {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH";
  headers?: Record<string, string>;
  body?: string;
  record?: Record<string, unknown>;
  entity_name?: string;
  record_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload: WebhookPayload = await req.json();

    if (!payload.url) {
      return new Response(
        JSON.stringify({ error: "Missing required field: url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetUrl = new URL(payload.url);
    const allowedProtocols = ["https:", "http:"];
    if (!allowedProtocols.includes(targetUrl.protocol)) {
      return new Response(
        JSON.stringify({ error: "Only http/https URLs are permitted" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const outHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "CRM-Workflow-Engine/1.0",
      ...(payload.headers ?? {}),
    };

    const outBody =
      payload.method !== "GET" && payload.body !== undefined
        ? payload.body
        : undefined;

    const start = Date.now();

    const response = await fetch(payload.url, {
      method: payload.method ?? "POST",
      headers: outHeaders,
      body: outBody,
      signal: AbortSignal.timeout(15_000),
    });

    const responseText = await response.text().catch(() => "");
    let responseBody: unknown = responseText;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
    }

    const duration = Date.now() - start;

    return new Response(
      JSON.stringify({
        status_code: response.status,
        response_body: responseBody,
        duration_ms: duration,
        ok: response.ok,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.toLowerCase().includes("timeout") || message.toLowerCase().includes("abort");

    return new Response(
      JSON.stringify({
        error: isTimeout ? "Webhook request timed out (15s limit)" : `Webhook delivery failed: ${message}`,
      }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
