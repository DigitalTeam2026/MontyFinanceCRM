import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BodyFieldMapping {
  id: string;
  json_key: string;
  value_type: "field" | "static";
  field_physical_column?: string;
  is_lookup?: boolean;
  lookup_value_type?: "id" | "primary_name" | "field";
  lookup_field_physical_column?: string;
  lookup_entity_physical_table?: string;
  lookup_entity_pk?: string;
  lookup_entity_primary_field?: string;
  static_value?: string;
  is_required?: boolean;
}

interface BodyConfig {
  fields: BodyFieldMapping[];
  exclude_null_fields: boolean;
}

interface Integration {
  api_integration_id: string;
  name: string;
  http_method: string;
  endpoint_url: string;
  auth_type: string;
  auth_secret: string | null;
  auth_key_name: string | null;
  auth_username: string | null;
  body_config: BodyConfig;
  entity: {
    logical_name: string;
    physical_table_name: string;
    primary_field_name: string;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return response(null, 200);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller via their JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isAdmin } = await userClient.rpc("get_is_system_admin");
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    const {
      data: { user },
    } = await userClient.auth.getUser();
    const userId = user?.id ?? null;

    const payload = await req.json();
    const { integration_id, record_id, trigger_event } = payload as {
      integration_id: string;
      record_id?: string;
      trigger_event?: string;
    };

    if (!integration_id) {
      return json({ error: "integration_id is required" }, 400);
    }

    // Use service role to read secrets
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: integrationRow, error: intErr } = await adminClient
      .from("api_integration")
      .select(
        `api_integration_id, name, http_method, endpoint_url,
         auth_type, auth_secret, auth_key_name, auth_username, body_config,
         entity:entity_definition(logical_name, physical_table_name, primary_field_name)`
      )
      .eq("api_integration_id", integration_id)
      .eq("is_deleted", false)
      .single();

    if (intErr || !integrationRow) {
      return json({ error: "Integration not found" }, 404);
    }

    const integration = integrationRow as Integration;

    const { data: customHeaders } = await adminClient
      .from("api_integration_header")
      .select("header_key, header_value, is_secret")
      .eq("api_integration_id", integration_id)
      .order("sort_order");

    // Fetch the target record if provided
    let record: Record<string, unknown> | null = null;
    const pkCol = integration.entity
      ? `${integration.entity.logical_name}_id`
      : null;
    if (record_id && integration.entity?.physical_table_name && pkCol) {
      const { data: r } = await adminClient
        .from(integration.entity.physical_table_name)
        .select("*")
        .eq(pkCol, record_id)
        .maybeSingle();
      record = r as Record<string, unknown> | null;
    }

    // Pre-fetch lookup data for any lookup field that needs name/field resolution
    const lookupCache: Record<string, Record<string, unknown> | null> = {};
    if (record && integration.body_config?.fields) {
      for (const mapping of integration.body_config.fields) {
        if (
          mapping.is_lookup &&
          mapping.lookup_value_type !== "id" &&
          mapping.field_physical_column &&
          mapping.lookup_entity_physical_table &&
          mapping.lookup_entity_pk
        ) {
          const fkValue = record[mapping.field_physical_column];
          if (fkValue) {
            const cacheKey = `${mapping.lookup_entity_physical_table}:${String(fkValue)}`;
            if (!(cacheKey in lookupCache)) {
              const { data: related } = await adminClient
                .from(mapping.lookup_entity_physical_table)
                .select("*")
                .eq(mapping.lookup_entity_pk, String(fkValue))
                .maybeSingle();
              lookupCache[cacheKey] = related as Record<string, unknown> | null;
            }
            lookupCache[`${mapping.field_physical_column}:${String(fkValue)}`] =
              lookupCache[cacheKey];
          }
        }
      }
    }

    // Build request headers
    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "CRM-Integration-Engine/1.0",
    };
    const maskedHeaders: Record<string, string> = { ...reqHeaders };

    switch (integration.auth_type) {
      case "bearer":
        reqHeaders["Authorization"] = `Bearer ${integration.auth_secret ?? ""}`;
        maskedHeaders["Authorization"] = "Bearer ●●●●●●●●";
        break;
      case "api_key":
        if (integration.auth_key_name) {
          reqHeaders[integration.auth_key_name] = integration.auth_secret ?? "";
          maskedHeaders[integration.auth_key_name] = "●●●●●●●●";
        }
        break;
      case "basic": {
        const encoded = btoa(
          `${integration.auth_username ?? ""}:${integration.auth_secret ?? ""}`
        );
        reqHeaders["Authorization"] = `Basic ${encoded}`;
        maskedHeaders["Authorization"] = "Basic ●●●●●●●●";
        break;
      }
      case "custom_header":
        if (integration.auth_key_name) {
          reqHeaders[integration.auth_key_name] = integration.auth_secret ?? "";
          maskedHeaders[integration.auth_key_name] = "●●●●●●●●";
        }
        break;
    }

    for (const h of customHeaders ?? []) {
      reqHeaders[h.header_key] = h.header_value;
      maskedHeaders[h.header_key] = h.is_secret ? "●●●●●●●●" : h.header_value;
    }

    // Build request body
    const hasBody = !["GET", "DELETE"].includes(integration.http_method);
    const requestBody = hasBody
      ? buildBody(integration.body_config, record, lookupCache)
      : null;

    // Execute
    const start = Date.now();
    let responseStatus = 0;
    let responseBody = "";
    let isSuccess = false;
    let errorMessage: string | null = null;

    try {
      const res = await fetch(integration.endpoint_url, {
        method: integration.http_method,
        headers: reqHeaders,
        body: hasBody ? JSON.stringify(requestBody) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      responseStatus = res.status;
      responseBody = await res.text().catch(() => "");
      isSuccess = res.ok;
    } catch (fetchErr: unknown) {
      errorMessage =
        fetchErr instanceof Error ? fetchErr.message : "Request failed";
    }

    const durationMs = Date.now() - start;

    // Persist log (service role bypasses RLS)
    await adminClient.from("api_integration_log").insert({
      api_integration_id: integration_id,
      record_id: record_id ?? null,
      triggered_by: userId,
      trigger_event: trigger_event ?? "manual",
      request_url: integration.endpoint_url,
      request_method: integration.http_method,
      request_headers_json: maskedHeaders,
      request_body_json: requestBody,
      response_status: responseStatus || null,
      response_body: responseBody || null,
      is_success: isSuccess,
      error_message: errorMessage,
      duration_ms: durationMs,
    });

    return json({
      ok: isSuccess,
      status_code: responseStatus,
      request: {
        url: integration.endpoint_url,
        method: integration.http_method,
        headers: maskedHeaders,
        body: requestBody,
      },
      response_body: responseBody,
      duration_ms: durationMs,
      error: errorMessage,
    });
  } catch (err: unknown) {
    return json(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildBody(
  bodyConfig: BodyConfig,
  record: Record<string, unknown> | null,
  lookupCache: Record<string, Record<string, unknown> | null>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const mapping of bodyConfig.fields ?? []) {
    let value: unknown;

    if (mapping.value_type === "static") {
      value = mapping.static_value ?? null;
    } else if (record && mapping.field_physical_column) {
      if (
        mapping.is_lookup &&
        mapping.lookup_value_type !== "id"
      ) {
        const fkValue = record[mapping.field_physical_column];
        const cacheKey = `${mapping.field_physical_column}:${String(fkValue ?? "")}`;
        const related = lookupCache[cacheKey] ?? null;

        if (related) {
          if (mapping.lookup_value_type === "primary_name") {
            value = related[mapping.lookup_entity_primary_field ?? ""] ?? null;
          } else if (
            mapping.lookup_value_type === "field" &&
            mapping.lookup_field_physical_column
          ) {
            value = related[mapping.lookup_field_physical_column] ?? null;
          }
        }
      } else {
        value = record[mapping.field_physical_column] ?? null;
      }
    }

    if (
      (value === null || value === undefined) &&
      !mapping.is_required &&
      bodyConfig.exclude_null_fields
    ) {
      continue;
    }

    setNested(result, mapping.json_key, value ?? null);
  }

  return result;
}

function setNested(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object" || Array.isArray(cur[p])) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function response(body: null, status: number): Response {
  return new Response(body, { status, headers: corsHeaders });
}
