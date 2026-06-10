import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

/*
  Public incoming-API endpoint for CRM integrations.

  External systems call:
    POST https://<ref>.supabase.co/functions/v1/api-integration-inbound/<endpoint_key>

  This function is deployed with verify_jwt = false (see supabase/config.toml).
  All authentication is enforced here: the endpoint key identifies the
  integration, and the integration's configured auth + custom headers gate the
  caller. Records are written with the service role (RLS bypassed), so do not
  rely on client-side checks anywhere.
*/

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, PUT, PATCH, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_BODY_BYTES = 1_000_000; // 1 MB request-size limit
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120; // requests per integration per minute
const MASK = "●●●●●●●●";

interface InboundFieldMapping {
  json_path: string;
  target_physical_column?: string;
  target_display_name?: string;
  target_field_type?: string;
  is_required?: boolean;
  is_lookup?: boolean;
  lookup_match_by?: "id" | "primary_name" | "field";
  lookup_match_field_physical_column?: string;
  lookup_entity_physical_table?: string;
  lookup_entity_pk?: string;
  lookup_entity_primary_field?: string;
}

interface InboundConfig {
  fields: InboundFieldMapping[];
  match_field: string | null;
}

interface Integration {
  api_integration_id: string;
  name: string;
  direction: string;
  operation: "create" | "update" | "upsert";
  is_active: boolean;
  auth_type: string;
  auth_secret: string | null;
  auth_key_name: string | null;
  auth_username: string | null;
  inbound_config: InboundConfig;
  entity: {
    logical_name: string;
    physical_table_name: string;
    primary_field_name: string;
  } | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const start = Date.now();
  const requestUrl = req.url;

  // ── 1. Identify the integration by endpoint key ──────────────────────────────
  const endpointKey = extractKey(req.url);
  if (!endpointKey) {
    return finalize(admin, null, req, requestUrl, start, 404, {
      success: false,
      message: "Endpoint not found",
    });
  }

  const { data: integrationRow } = await admin
    .from("api_integration")
    .select(
      `api_integration_id, name, direction, operation, is_active,
       auth_type, auth_secret, auth_key_name, auth_username, inbound_config,
       entity:entity_definition(logical_name, physical_table_name, primary_field_name)`
    )
    .eq("endpoint_key", endpointKey)
    .eq("is_deleted", false)
    .maybeSingle();

  const integration = integrationRow as Integration | null;

  // Same response for "no such key" and "wrong direction" — don't leak which.
  if (!integration || integration.direction !== "incoming") {
    return finalize(admin, integration, req, requestUrl, start, 404, {
      success: false,
      message: "Endpoint not found",
    });
  }

  // ── 2. Active check ──────────────────────────────────────────────────────────
  if (!integration.is_active) {
    return finalize(admin, integration, req, requestUrl, start, 403, {
      success: false,
      message: "Integration is inactive",
    });
  }

  // ── 3. Rate limiting (per integration, sliding 60s window) ───────────────────
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count } = await admin
    .from("api_integration_log")
    .select("api_integration_log_id", { count: "exact", head: true })
    .eq("api_integration_id", integration.api_integration_id)
    .gte("triggered_at", since);
  if ((count ?? 0) >= RATE_LIMIT_MAX) {
    return finalize(admin, integration, req, requestUrl, start, 429, {
      success: false,
      message: "Rate limit exceeded. Try again shortly.",
    });
  }

  // ── 4. Authentication & custom-header validation ─────────────────────────────
  if (!checkAuth(req, integration)) {
    return finalize(admin, integration, req, requestUrl, start, 401, {
      success: false,
      message: "Unauthorized",
    });
  }
  const headerCheck = await checkCustomHeaders(admin, req, integration);
  if (!headerCheck) {
    return finalize(admin, integration, req, requestUrl, start, 401, {
      success: false,
      message: "Unauthorized",
    });
  }

  // ── 5. Read + validate the JSON body (with size limit) ───────────────────────
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return finalize(admin, integration, req, requestUrl, start, 413, {
      success: false,
      message: "Request body too large",
    });
  }
  let payload: Record<string, unknown>;
  try {
    payload = raw ? JSON.parse(raw) : {};
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new Error("Body must be a JSON object");
    }
  } catch (e) {
    return finalize(admin, integration, req, requestUrl, start, 400, {
      success: false,
      message: e instanceof Error ? e.message : "Invalid JSON body",
    });
  }

  // ── 6. Resolve the CRM entity ────────────────────────────────────────────────
  if (!integration.entity?.physical_table_name) {
    return finalize(admin, integration, req, requestUrl, start, 500, {
      success: false,
      message: "Integration entity is not configured",
    });
  }
  const table = integration.entity.physical_table_name;
  const pkCol = `${integration.entity.logical_name}_id`;
  const config = integration.inbound_config ?? { fields: [], match_field: null };

  // ── 7/8. Map + convert incoming values, resolve lookups, validate ────────────
  const record: Record<string, unknown> = {};
  const errors: { field: string; message: string }[] = [];

  for (const m of config.fields ?? []) {
    if (!m.target_physical_column) continue;
    const rawVal = getNested(payload, m.json_path);
    const present = rawVal !== undefined && rawVal !== null && rawVal !== "";

    if (!present) {
      if (m.is_required) {
        errors.push({
          field: m.json_path,
          message: `${m.target_display_name ?? m.json_path} is required`,
        });
      }
      continue;
    }

    if (m.is_lookup) {
      const fk = await resolveLookup(admin, m, rawVal);
      if (fk === null) {
        if (m.is_required) {
          errors.push({
            field: m.json_path,
            message: `Could not resolve related record for ${m.target_display_name ?? m.json_path}`,
          });
        }
        continue;
      }
      record[m.target_physical_column] = fk;
    } else {
      record[m.target_physical_column] = convertValue(rawVal, m.target_field_type);
    }
  }

  if (errors.length > 0) {
    return finalize(admin, integration, req, requestUrl, start, 422, {
      success: false,
      errors,
    });
  }

  // ── 9. Create / Update / Upsert ──────────────────────────────────────────────
  let recordId: string | null = null;
  let opStatus = 200;
  let opError: string | null = null;

  try {
    const op = integration.operation;
    const matchField = config.match_field;
    const matchValue = matchField ? record[matchField] : undefined;

    if ((op === "update" || op === "upsert") && (!matchField || matchValue == null)) {
      throw new Error(
        `A match field value is required for ${op}. Map an incoming property to "${matchField ?? "(unset)"}".`
      );
    }

    if (op === "create") {
      recordId = await insertRecord(admin, table, pkCol, record);
      opStatus = 201;
    } else {
      // Locate an existing record by the match field.
      const { data: existing } = await admin
        .from(table)
        .select(pkCol)
        .eq(matchField as string, matchValue as never)
        .eq("is_deleted", false)
        .maybeSingle();

      if (existing) {
        const id = (existing as Record<string, unknown>)[pkCol] as string;
        await updateRecord(admin, table, pkCol, id, record);
        recordId = id;
      } else if (op === "upsert") {
        recordId = await insertRecord(admin, table, pkCol, record);
        opStatus = 201;
      } else {
        throw new Error("No matching record found to update");
      }
    }
  } catch (e) {
    opError = e instanceof Error ? e.message : "Write failed";
    opStatus = 422;
  }

  if (opError) {
    return finalize(admin, integration, req, requestUrl, start, opStatus, {
      success: false,
      message: opError,
    });
  }

  // ── 10. Touch last_request_at + structured success response ──────────────────
  await admin
    .from("api_integration")
    .update({ last_request_at: new Date().toISOString() })
    .eq("api_integration_id", integration.api_integration_id);

  return finalize(
    admin,
    integration,
    req,
    requestUrl,
    start,
    opStatus,
    {
      success: true,
      entity: integration.entity.logical_name,
      recordId,
      message: `${integration.entity.logical_name} ${
        opStatus === 201 ? "created" : "updated"
      } successfully`,
    },
    payload
  );
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function extractKey(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("api-integration-inbound");
  const key = idx >= 0 ? parts[idx + 1] : parts[parts.length - 1];
  if (!key || key === "api-integration-inbound") return null;
  return key;
}

function checkAuth(req: Request, integration: Integration): boolean {
  const secret = integration.auth_secret ?? "";
  switch (integration.auth_type) {
    case "none":
      return true;
    case "bearer":
      return req.headers.get("Authorization") === `Bearer ${secret}`;
    case "basic": {
      const expected = `Basic ${btoa(`${integration.auth_username ?? ""}:${secret}`)}`;
      return req.headers.get("Authorization") === expected;
    }
    case "api_key":
    case "custom_header": {
      if (!integration.auth_key_name) return false;
      return req.headers.get(integration.auth_key_name) === secret;
    }
    default:
      return false;
  }
}

async function checkCustomHeaders(
  admin: SupabaseClient,
  req: Request,
  integration: Integration
): Promise<boolean> {
  const { data: headers } = await admin
    .from("api_integration_header")
    .select("header_key, header_value")
    .eq("api_integration_id", integration.api_integration_id);
  for (const h of headers ?? []) {
    if (req.headers.get(h.header_key) !== h.header_value) return false;
  }
  return true;
}

async function resolveLookup(
  admin: SupabaseClient,
  m: InboundFieldMapping,
  value: unknown
): Promise<string | null> {
  // Direct FK value supplied
  if (m.lookup_match_by === "id" || !m.lookup_match_by) {
    return value == null ? null : String(value);
  }
  if (!m.lookup_entity_physical_table || !m.lookup_entity_pk) return null;

  const matchCol =
    m.lookup_match_by === "primary_name"
      ? m.lookup_entity_primary_field
      : m.lookup_match_field_physical_column;
  if (!matchCol) return null;

  const { data } = await admin
    .from(m.lookup_entity_physical_table)
    .select(m.lookup_entity_pk)
    .eq(matchCol, value as never)
    .eq("is_deleted", false)
    .maybeSingle();

  if (!data) return null;
  return String((data as Record<string, unknown>)[m.lookup_entity_pk]);
}

function convertValue(value: unknown, type?: string): unknown {
  if (value == null) return null;
  switch (type) {
    case "number":
    case "integer":
    case "decimal":
    case "money":
    case "currency": {
      const n = Number(value);
      return Number.isNaN(n) ? value : n;
    }
    case "boolean": {
      if (typeof value === "boolean") return value;
      const s = String(value).toLowerCase();
      return s === "true" || s === "1" || s === "yes";
    }
    default:
      return value;
  }
}

async function insertRecord(
  admin: SupabaseClient,
  table: string,
  pkCol: string,
  record: Record<string, unknown>
): Promise<string> {
  const { data, error } = await admin
    .from(table)
    .insert(record)
    .select(pkCol)
    .single();
  if (error) throw new Error(error.message);
  return String((data as Record<string, unknown>)[pkCol]);
}

async function updateRecord(
  admin: SupabaseClient,
  table: string,
  pkCol: string,
  id: string,
  record: Record<string, unknown>
): Promise<void> {
  const { error } = await admin.from(table).update(record).eq(pkCol, id);
  if (error) throw new Error(error.message);
}

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && !Array.isArray(acc)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

/** Mask sensitive incoming headers before logging. */
function maskHeaders(req: Request, integration: Integration): Record<string, string> {
  const out: Record<string, string> = {};
  const secretKey = integration.auth_key_name?.toLowerCase();
  req.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "authorization" || k === secretKey || k === "apikey" || k === "x-client-info") {
      out[key] = MASK;
    } else {
      out[key] = value;
    }
  });
  return out;
}

/** Persist a log row (best-effort) and return the JSON response. */
async function finalize(
  admin: SupabaseClient,
  integration: Integration | null,
  req: Request,
  requestUrl: string,
  start: number,
  status: number,
  responseBody: Record<string, unknown>,
  parsedBody?: unknown
): Promise<Response> {
  const duration = Date.now() - start;
  const isSuccess = status >= 200 && status < 300;

  if (integration) {
    try {
      await admin.from("api_integration_log").insert({
        api_integration_id: integration.api_integration_id,
        record_id: (responseBody.recordId as string) ?? null,
        triggered_by: null,
        trigger_event: "inbound",
        direction: "incoming",
        request_url: requestUrl,
        request_method: req.method,
        request_headers_json: maskHeaders(req, integration),
        request_body_json: parsedBody ?? null,
        response_status: status,
        response_body: JSON.stringify(responseBody),
        is_success: isSuccess,
        error_message: isSuccess ? null : (responseBody.message as string) ?? "Failed",
        duration_ms: duration,
      });
    } catch {
      // logging must never break the response
    }
  }

  return new Response(JSON.stringify(responseBody), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
