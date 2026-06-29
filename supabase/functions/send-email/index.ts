// send-email — sends a real email through Microsoft 365 (Office 365 Outlook) using
// Microsoft Graph `sendMail` with the client-credentials flow. This is the real
// mailer behind the workflow `send_email` action (the Outlook connector equivalent).
//
// Required edge-function secrets (supabase secrets set ...):
//   GRAPH_TENANT_ID      — Azure AD tenant id (GUID or domain)
//   GRAPH_CLIENT_ID      — App registration (client) id
//   GRAPH_CLIENT_SECRET  — App registration client secret
//   GRAPH_SENDER_UPN     — Default from mailbox, e.g. no-reply@montyholding.com
//
// The Azure app registration needs the APPLICATION permission `Mail.Send`
// (admin-consented). With client credentials it can send as any licensed mailbox
// in the tenant; we send from `from` (if provided) else GRAPH_SENDER_UPN.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, authenticateCaller } from "../_shared/security.ts";

interface Attachment { name: string; contentType?: string; contentBytes: string; }
interface EmailPayload {
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  isHtml?: boolean;
  importance?: "low" | "normal" | "high";
  replyTo?: string[];
  from?: string;
  attachments?: Attachment[];
}

const recip = (addrs?: string[]) =>
  (addrs ?? []).filter(Boolean).map((a) => ({ emailAddress: { address: a } }));

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Any authenticated caller may send (flows fire in the triggering user's session).
  const auth = await authenticateCaller(req, supabaseUrl, serviceRoleKey, anonKey);
  if (!auth.ok) return json({ ok: false, error: "Unauthorized" }, 401);

  const tenant = Deno.env.get("GRAPH_TENANT_ID");
  const clientId = Deno.env.get("GRAPH_CLIENT_ID");
  const clientSecret = Deno.env.get("GRAPH_CLIENT_SECRET");
  const defaultSender = Deno.env.get("GRAPH_SENDER_UPN");

  // Not configured yet → tell the caller so it can fall back to an in-app notice.
  if (!tenant || !clientId || !clientSecret || !defaultSender) {
    return json({ ok: false, notConfigured: true, error: "Mail sender not configured (missing GRAPH_* secrets)" }, 200);
  }

  let payload: EmailPayload;
  try { payload = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const to = (payload.to ?? []).filter(Boolean);
  if (to.length === 0) return json({ ok: false, error: "No recipients" }, 400);
  const sender = payload.from || defaultSender;

  try {
    // 1. Client-credentials token for Microsoft Graph
    const tokenResp = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }),
    });
    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok || !tokenJson.access_token) {
      return json({ ok: false, error: `Graph auth failed: ${tokenJson.error_description ?? tokenResp.status}` }, 502);
    }

    // 2. Build the message
    const message: Record<string, unknown> = {
      subject: payload.subject ?? "",
      body: {
        contentType: payload.isHtml === false ? "Text" : "HTML",
        content: payload.body ?? "",
      },
      toRecipients: recip(to),
      ccRecipients: recip(payload.cc),
      bccRecipients: recip(payload.bcc),
      importance: payload.importance ?? "normal",
    };
    if (payload.replyTo?.length) message.replyTo = recip(payload.replyTo);
    if (payload.attachments?.length) {
      message.attachments = payload.attachments.map((a) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: a.name,
        contentType: a.contentType ?? "application/octet-stream",
        contentBytes: a.contentBytes,
      }));
    }

    // 3. Send
    const sendResp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenJson.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message, saveToSentItems: true }),
      },
    );

    if (sendResp.status === 202) return json({ ok: true, delivered: "email", from: sender, to }, 200);
    const errText = await sendResp.text().catch(() => "");
    return json({ ok: false, error: `Graph sendMail failed (${sendResp.status}): ${errText.slice(0, 500)}` }, 502);
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
