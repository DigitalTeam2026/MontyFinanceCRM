// Shared helpers for storage providers.
import path from 'node:path';

/** An error that carries an HTTP status, so the server can map it to a response. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Allow only safe single path segments (no separators, no traversal). */
export function safeSegment(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const base = path.basename(value.trim());
  if (!base || base === '.' || base === '..') return null;
  if (/[\\/]/.test(base)) return null;
  return base;
}

/** Normalise OS path separators to forward slashes for storage in the DB. */
export function toPosix(p) {
  return p.split(path.sep).join('/');
}

/**
 * The date-based folder prefix new uploads are filed under: "YYYY/MM/DD" using
 * the server's local date. One folder per day (nested year/month/day), so the
 * full layout is <root>/YYYY/MM/DD/<recordId>/<fileName>.
 */
export function dayPrefix(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

/**
 * Validate a stored relative path (e.g. "2026/06/12/<recordId>/<file>" or the
 * legacy "<recordId>/<file>") into its safe segments. Each segment is checked
 * for traversal/separators so a malicious DB value can't escape the root. Throws
 * HttpError(400) if any segment is unsafe or the path is empty.
 */
export function splitRelative(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    throw new HttpError(400, 'Missing or invalid relative path.');
  }
  const parts = relativePath.split('/').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) throw new HttpError(400, 'Missing or invalid relative path.');
  const safe = parts.map((p) => safeSegment(p));
  if (safe.some((s) => s === null)) throw new HttpError(400, 'Relative path contains an invalid segment.');
  return safe;
}
