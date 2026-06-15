// Edge Function: dashboard-sql
//
// Secure server-side execution of read-only dashboard SQL. The browser NEVER
// executes SQL — it posts query text here. This function authenticates the
// caller, lints the SQL (SELECT/WITH-only, single statement, no DDL/DML, no
// comments, reporting.* only), then delegates execution to the hardened
// SECURITY INVOKER RPC `public.execute_dashboard_sql` USING THE CALLER'S JWT, so
// Row-Level Security (record-level security) is fully enforced.
//
// Actions:
//   { action: "validate", sql }            -> { ok, error? }
//   { action: "execute",  sql, params? }   -> { columns, rows, rowCount, durationMs, status }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, authenticateCaller } from "../_shared/security.ts";

const FORBIDDEN = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|vacuum|merge|call|do|comment|reindex|cluster)\b/i;
const SENSITIVE_SCHEMA = /\b(auth|security|pg_catalog|information_schema|public|storage|vault|extensions)\s*\./i;

interface LintResult { ok: boolean; error?: string }

function lintSql(raw: string): LintResult {
  const sql = (raw ?? "").trim();
  if (!sql) return { ok: false, error: "Query is empty" };
  if (!/^(with|select)\s/i.test(sql)) return { ok: false, error: "Only SELECT / WITH queries are allowed" };
  if (FORBIDDEN.test(sql)) return { ok: false, error: "Query contains a forbidden keyword" };
  // single statement: no ';' other than an optional trailing one
  if (sql.replace(/;\s*$/, "").includes(";")) return { ok: false, error: "Multiple statements are not allowed" };
  if (/--|\/\*|\*\//.test(sql)) return { ok: false, error: "Comments are not allowed" };
  if (SENSITIVE_SCHEMA.test(sql)) return { ok: false, error: "Only reporting.* objects may be queried" };
  return { ok: true };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const auth = await authenticateCaller(req, SUPABASE_URL, SERVICE_KEY, ANON_KEY);
  if (!auth.ok || (!auth.isServiceRole && !auth.userId)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  let body: { action?: string; sql?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const action = body.action ?? "execute";
  const lint = lintSql(body.sql ?? "");

  if (action === "validate") {
    return new Response(JSON.stringify(lint), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (!lint.ok) {
    return new Response(JSON.stringify({ status: "blocked", error: lint.error }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // Execute via the hardened RPC, AS THE CALLER (RLS applies). Re-use the caller's
  // bearer token so security.execute_dashboard_sql() runs in their context.
  const bearer = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: bearer } },
    auth: { persistSession: false },
  });

  const { data, error } = await userClient.rpc("execute_dashboard_sql", {
    p_sql: body.sql,
    p_params: body.params ?? {},
  });

  if (error) {
    return new Response(JSON.stringify({ status: "error", error: error.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify(data), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
});
