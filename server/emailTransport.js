// server/emailTransport.js
// Pluggable email transport for Power Automation's send_email action.
//
// Drivers, in priority order:
//   1. edge-fn  — POST to the existing Microsoft Graph "send-email" function,
//                 if SEND_EMAIL_FN_URL is configured (optionally SEND_EMAIL_FN_TOKEN).
//   2. stub     — no transport configured: log the message and return a synthetic
//                 id. The job SUCCEEDS and the full rendered email is recorded in
//                 the run history (output.transport === 'stub'). Nothing is
//                 silently dropped; swap in a real driver by setting the env vars.
//
// A single sendEmail() interface keeps adding SMTP (nodemailer) later a one-file
// change with no worker changes.

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
 * Send an email. Never throws for the stub driver; the edge-fn driver throws on
 * transport failure so the worker can retry / dead-letter.
 *
 * @param {{to: string[], subject: string, html: string}} msg
 * @returns {Promise<{transport: string, messageId: string}>}
 */
async function sendEmail(msg) {
  const to = (msg.to || []).filter(Boolean);
  if (to.length === 0) {
    // Nothing to send to — treat as a no-op success so the action isn't a hard
    // failure, but make it visible in the run history.
    return { transport: "noop", messageId: "no-recipients" };
  }

  const fnUrl = process.env.SEND_EMAIL_FN_URL;
  if (fnUrl) {
    return sendViaEdgeFn(fnUrl, process.env.SEND_EMAIL_FN_TOKEN, { ...msg, to });
  }

  // Stub fallback — record + log, do not throw.
  const ccStr = (msg.cc || []).length ? ` cc=${(msg.cc || []).join(",")}` : "";
  console.log(
    `[automation.email:stub] to=${to.join(",")}${ccStr} subject=${JSON.stringify(msg.subject)}`
  );
  return { transport: "stub", messageId: `stub-${Date.now()}` };
}

module.exports = { sendEmail };
