// Shared security helpers for edge functions: CORS allow-listing, SSRF guards,
// and caller authentication.
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Build CORS headers. If APP_ALLOWED_ORIGINS (comma-separated) is set and the
 * request Origin is in it, reflect that origin; otherwise fall back to "*" only
 * when no allow-list is configured. Authenticated functions should set the env
 * var so other sites cannot drive the API with a victim's bearer token.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const configured = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.get("Origin") ?? "";
  let allowOrigin = "*";
  if (configured.length > 0) {
    allowOrigin = configured.includes(origin) ? origin : configured[0];
  }
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

/** Constant-time string comparison to avoid leaking secret length/content via timing. */
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Compare against a fixed-length buffer so the loop count never depends on `a`.
  const len = Math.max(ab.length, bb.length, 1);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** Returns true if an IPv4/IPv6 literal is private, loopback, link-local or reserved. */
export function isPrivateIp(ip: string): boolean {
  // IPv4
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const o = v4.slice(1).map(Number);
    if (o.some((n) => n > 255)) return true; // malformed → treat as unsafe
    const [a, b] = o;
    if (a === 10) return true;                         // 10.0.0.0/8
    if (a === 127) return true;                        // loopback
    if (a === 0) return true;                          // 0.0.0.0/8
    if (a === 169 && b === 254) return true;           // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;           // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a >= 224) return true;                         // multicast/reserved
    return false;
  }
  // IPv6 — block loopback, unique-local, link-local, and IPv4-mapped private
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7
  if (lower.startsWith("fe80")) return true;                          // link-local
  const mapped = lower.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIp(mapped[1]);
  return false;
}

/**
 * Validate an outbound URL against SSRF. Rejects non-http(s), private/loopback/
 * metadata hosts, and hostnames that RESOLVE to private addresses.
 * Returns { ok: true } or { ok: false, reason }.
 */
export async function assertSafeUrl(rawUrl: string): Promise<{ ok: boolean; reason?: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Malformed URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Only http/https URLs are permitted" };
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    return { ok: false, reason: "Host is not permitted" };
  }
  // Literal IP host
  if (/^[\d.]+$/.test(host) || host.includes(":")) {
    if (isPrivateIp(host)) return { ok: false, reason: "Private/loopback addresses are not permitted" };
    return { ok: true };
  }
  // Resolve DNS and reject if any record is private (DNS-rebinding / internal names)
  try {
    const results: string[] = [];
    for (const kind of ["A", "AAAA"] as const) {
      try {
        const recs = await Deno.resolveDns(host, kind);
        results.push(...recs);
      } catch {
        /* no record of this type */
      }
    }
    if (results.length === 0) return { ok: false, reason: "Host could not be resolved" };
    if (results.some(isPrivateIp)) {
      return { ok: false, reason: "Host resolves to a private address" };
    }
  } catch {
    return { ok: false, reason: "Host could not be resolved" };
  }
  return { ok: true };
}

/**
 * Authenticate the caller. Allows the service-role key (trusted backend) or a
 * valid end-user JWT; rejects the anon key and anonymous callers.
 * Returns { ok, isServiceRole, userId } or { ok: false }.
 */
export async function authenticateCaller(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
  anonKey: string,
): Promise<{ ok: boolean; isServiceRole?: boolean; userId?: string }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false };
  if (token === anonKey) return { ok: false };          // public anon key is not a caller identity
  if (token === serviceRoleKey) return { ok: true, isServiceRole: true };

  // Verify as an end-user JWT
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return { ok: false };
  return { ok: true, userId: data.user.id };
}

/**
 * Returns true if the user is an active system admin. Uses a service-role client
 * so it is not subject to RLS. Centralizes the admin check (incl. is_active) that
 * was previously duplicated and inconsistent across functions.
 */
export async function isSystemAdmin(
  serviceClient: ReturnType<typeof createClient>,
  userId: string | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await serviceClient
    .from("crm_user")
    .select("is_system_admin, is_active")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return data.is_system_admin === true && data.is_active !== false;
}
