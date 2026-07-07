// server/auth.js
// Password hashing + stateless session tokens for the local CRM auth.
//
// Dependency-free: uses Node's built-in crypto (scrypt for password hashing,
// HMAC-SHA256 for signing session tokens). Shared by index.js (login/session
// endpoints) and scripts/seed-passwords.js (initial password seeding).

const crypto = require("crypto");

// Secret used to sign session tokens. Set AUTH_SECRET in server/.env for
// production; the fallback keeps local dev working out of the box. Changing the
// secret invalidates all existing tokens (everyone must log in again).
const AUTH_SECRET =
  process.env.AUTH_SECRET || "monty-crm-dev-secret-change-me";

// Session lifetime (12 hours).
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

// --- Password hashing (scrypt) ----------------------------------------------

// Stored format: "scrypt:<saltHex>:<hashHex>".
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== "string" || !stored.startsWith("scrypt:")) return false;
  const [, saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, "hex"), expected.length);
  // timingSafeEqual throws on length mismatch — guard first.
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// --- Session tokens (HMAC-signed, stateless) --------------------------------

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function signToken(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

// Returns the decoded payload, or null if the token is malformed, tampered, or
// expired.
function verifyToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.exp === "number" && Date.now() > payload.exp) return null;
  return payload;
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, TOKEN_TTL_MS };
