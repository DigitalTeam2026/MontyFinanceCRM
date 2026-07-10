// server/emailTransport.js
// Pluggable email transport for Power Automation's send_email action.
//
// Drivers, in priority order:
//   1. graph    — Microsoft 365 (Office 365) via Microsoft Graph `sendMail` with
//                 the client-credentials flow. Credentials come from the chosen
//                 sender account (automation_email_account) if it carries them,
//                 else from GRAPH_* env vars. The message is sent AS the account's
//                 from_address (the "send on behalf" mailbox), else GRAPH_SENDER_UPN.
//   2. edge-fn  — POST to an external Graph "send-email" function, if
//                 SEND_EMAIL_FN_URL is configured (optionally SEND_EMAIL_FN_TOKEN).
//   3. stub     — no transport configured: log the message and return a synthetic
//                 id. The job SUCCEEDS and the full rendered email is recorded in
//                 the run history (output.transport === 'stub'). Nothing is
//                 silently dropped; configure a sender account to send for real.
//
// The Azure app registration needs the APPLICATION permission `Mail.Send`
// (admin-consented). With client credentials it can send as any licensed mailbox
// in the tenant.

const recip = (addrs) =>
  (addrs || []).filter(Boolean).map((a) => ({ emailAddress: { address: a } }));

// Resolve the effective Graph credentials + sender for this message. An explicit
// account with its own credentials wins; otherwise fall back to GRAPH_* env vars.
function resolveGraphConfig(account) {
  const acc = account || {};
  const tenant = acc.tenant_id || process.env.GRAPH_TENANT_ID;
  const clientId = acc.client_id || process.env.GRAPH_CLIENT_ID;
  const clientSecret = acc.client_secret || process.env.GRAPH_CLIENT_SECRET;
  const from = acc.from_address || process.env.GRAPH_SENDER_UPN;
  if (tenant && clientId && clientSecret && from) {
    return { tenant, clientId, clientSecret, from };
  }
  return null;
}

async function graphToken({ tenant, clientId, clientSecret }) {
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Graph auth failed: ${json.error_description || res.status}`);
  }
  return json.access_token;
}

async function sendViaGraph(gcfg, msg) {
  const token = await graphToken(gcfg);
  const message = {
    subject: msg.subject || "",
    body: { contentType: "HTML", content: msg.html || "" },
    toRecipients: recip(msg.to),
    ccRecipients: recip(msg.cc),
  };
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(gcfg.from)}/sendMail`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }),
    }
  );
  if (res.status === 202) {
    return { transport: "graph", messageId: `graph-${Date.now()}`, from: gcfg.from };
  }
  const text = await res.text().catch(() => "");
  throw new Error(`Graph sendMail failed (${res.status}): ${text.slice(0, 300)}`);
}

async function sendViaEdgeFn(url, token, msg) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      to: msg.to,
      cc: msg.cc || [],
      subject: msg.subject,
      html: msg.html,
      ...(msg.from ? { from: msg.from } : {}),
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`send-email fn HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  let messageId;
  try {
    messageId = JSON.parse(text)?.messageId;
  } catch {
    /* non-JSON body is fine */
  }
  return { transport: "edge-fn", messageId: messageId || `edgefn-${Date.now()}` };
}

/**
 * Send an email. The graph/edge-fn drivers throw on transport failure so the
 * worker can retry / dead-letter; the stub driver never throws.
 *
 * @param {{to: string[], cc?: string[], subject: string, html: string,
 *          account?: {from_address?: string, tenant_id?: string, client_id?: string, client_secret?: string}}} msg
 * @returns {Promise<{transport: string, messageId: string, from?: string}>}
 */
async function sendEmail(msg) {
  const to = (msg.to || []).filter(Boolean);
  const cc = (msg.cc || []).filter(Boolean);
  if (to.length === 0 && cc.length === 0) {
    // Nothing to send to — treat as a no-op success so the action isn't a hard
    // failure, but make it visible in the run history.
    return { transport: "noop", messageId: "no-recipients" };
  }

  // 1. Microsoft Graph (per-account creds, else GRAPH_* env).
  const gcfg = resolveGraphConfig(msg.account);
  if (gcfg) {
    return sendViaGraph(gcfg, { ...msg, to, cc });
  }

  // 2. External Graph function.
  const fnUrl = process.env.SEND_EMAIL_FN_URL;
  if (fnUrl) {
    const from = msg.account?.from_address || process.env.GRAPH_SENDER_UPN;
    return sendViaEdgeFn(fnUrl, process.env.SEND_EMAIL_FN_TOKEN, { ...msg, to, cc, from });
  }

  // 3. Stub fallback — record + log, do not throw.
  const ccStr = cc.length ? ` cc=${cc.join(",")}` : "";
  console.log(
    `[automation.email:stub] to=${to.join(",")}${ccStr} subject=${JSON.stringify(msg.subject)}`
  );
  return { transport: "stub", messageId: `stub-${Date.now()}` };
}

module.exports = { sendEmail };
