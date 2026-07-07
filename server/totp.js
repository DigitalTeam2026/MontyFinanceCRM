// server/totp.js
// Dependency-free TOTP (RFC 6238) for two-factor authentication.
//
// Uses only Node's built-in crypto (HMAC-SHA1). Compatible with Google
// Authenticator, Microsoft Authenticator, Authy, 1Password, etc. Secrets are
// stored/exchanged as RFC 4648 Base32 (no padding), which is what authenticator
// apps expect for manual key entry and inside otpauth:// URIs.

const crypto = require("crypto");

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30; // standard TOTP time step
const DIGITS = 6;

// --- Base32 -----------------------------------------------------------------

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// --- Secret generation ------------------------------------------------------

// 20 random bytes -> 32-char Base32 secret (matches the common 160-bit default).
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

// --- Code generation / verification -----------------------------------------

function hotp(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  // Write the 64-bit counter big-endian (high 32 bits are ~always 0 for TOTP).
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % 10 ** DIGITS;
  return otp.toString().padStart(DIGITS, "0");
}

// Verify a submitted 6-digit code against the secret. `window` allows codes from
// adjacent time steps (default ±1 step = ±30s) to tolerate clock drift. Uses a
// constant-time compare and never short-circuits per-window to avoid leaking
// timing information about which step matched.
function verifyToken(secretBase32, token, window = 1) {
  const clean = String(token || "").replace(/\D/g, "");
  if (clean.length !== DIGITS || !secretBase32) return false;
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  const submitted = Buffer.from(clean);
  let matched = false;
  for (let i = -window; i <= window; i++) {
    const expected = Buffer.from(hotp(secretBase32, counter + i));
    if (
      expected.length === submitted.length &&
      crypto.timingSafeEqual(expected, submitted)
    ) {
      matched = true;
    }
  }
  return matched;
}

// --- otpauth:// URI (for QR codes / manual entry) ---------------------------

function otpauthUrl(secretBase32, accountName, issuer) {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = { generateSecret, verifyToken, otpauthUrl, base32Encode, base32Decode };
