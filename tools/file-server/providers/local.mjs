// Local + NAS provider. Both are filesystem paths — NAS is just a UNC root
// (\\server\share\...) that this machine can reach. New uploads are filed under
// a per-day folder: <root>/YYYY/MM/DD/<recordId>/<fileName>. Reads/updates work
// off the stored relative path, so legacy files at <root>/<recordId>/<fileName>
// keep resolving without migration.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { HttpError, safeSegment, toPosix, dayPrefix, splitRelative } from './util.mjs';

/** Build today's upload target: <root>/YYYY/MM/DD/<recordId>/<fileName>. */
function buildUploadPath(root, recordId, fileName) {
  const rid = safeSegment(recordId);
  const name = safeSegment(fileName);
  if (!rid) throw new HttpError(400, 'Invalid record id.');
  if (!name) throw new HttpError(400, 'Invalid file name.');
  const segs = [...dayPrefix().split('/'), rid, name];
  const rootResolved = path.resolve(root);
  const full = path.resolve(rootResolved, ...segs);
  if (!full.startsWith(rootResolved + path.sep)) {
    throw new HttpError(400, 'Resolved path escapes the configured root.');
  }
  return { dir: path.dirname(full), full, relativePath: toPosix(segs.join('/')) };
}

/** Resolve a stored relative path (new day-based OR legacy <recordId>/<file>),
 *  validating every segment so it can't escape the root. */
function resolveStoredPath(root, relativePath) {
  const segs = splitRelative(relativePath);
  const rootResolved = path.resolve(root);
  const full = path.resolve(rootResolved, ...segs);
  if (!full.startsWith(rootResolved + path.sep)) {
    throw new HttpError(400, 'Resolved path escapes the configured root.');
  }
  return { dir: path.dirname(full), full, relativePath: toPosix(segs.join('/')) };
}

/** Locate an existing file from its stored relative path, falling back to the
 *  legacy <recordId>/<fileName> layout when no relative path was supplied. */
function locate(root, relativePath, recordId, fileName) {
  if (relativePath) return resolveStoredPath(root, relativePath);
  return resolveStoredPath(root, `${safeSegment(recordId) ?? ''}/${safeSegment(fileName) ?? ''}`);
}

export const localProvider = {
  async upload({ root, recordId, fileName, body }) {
    const t = buildUploadPath(root, recordId, fileName);
    await fsp.mkdir(t.dir, { recursive: true });
    await fsp.writeFile(t.full, body);
    return { relativePath: t.relativePath, absolutePath: t.full, byteSize: body.length };
  },

  async download({ root, recordId, fileName, relativePath }) {
    const t = locate(root, relativePath, recordId, fileName);
    if (!fs.existsSync(t.full)) throw new HttpError(404, 'File not found.');
    const buffer = await fsp.readFile(t.full);
    return { buffer, fileName: path.basename(t.full) };
  },

  async remove({ root, recordId, fileName, relativePath }) {
    const t = locate(root, relativePath, recordId, fileName);
    if (fs.existsSync(t.full)) await fsp.unlink(t.full);
  },

  async rename({ root, recordId, fileName, newName, relativePath }) {
    const from = locate(root, relativePath, recordId, fileName);
    const name = safeSegment(newName);
    if (!name) throw new HttpError(400, 'Invalid file name.');
    const rootResolved = path.resolve(root);
    const toFull = path.resolve(from.dir, name); // rename in place, same day/record folder
    if (!toFull.startsWith(rootResolved + path.sep)) throw new HttpError(400, 'Resolved path escapes the configured root.');
    const toRel = toPosix(path.relative(rootResolved, toFull));
    if (!fs.existsSync(from.full)) throw new HttpError(404, 'File not found.');
    if (from.full === toFull) return { relativePath: toRel, absolutePath: toFull };
    if (fs.existsSync(toFull)) throw new HttpError(409, 'A file with that name already exists.');
    await fsp.rename(from.full, toFull);
    return { relativePath: toRel, absolutePath: toFull };
  },

  // Legacy listing of a flat <root>/<recordId>/ folder. The UI lists from the
  // crm_document table (authoritative), not this endpoint; with day-based
  // folders a record's files span multiple day folders, so this only surfaces
  // legacy files. Kept for back-office/legacy callers.
  async list({ root, recordId }) {
    const rid = safeSegment(recordId);
    if (!rid) throw new HttpError(400, 'Invalid record id.');
    const dir = path.resolve(root, rid);
    if (!fs.existsSync(dir)) return [];
    const names = await fsp.readdir(dir);
    const out = [];
    for (const name of names) {
      const full = path.join(dir, name);
      const stat = await fsp.stat(full);
      if (stat.isFile()) {
        out.push({ fileName: name, relativePath: toPosix(path.join(rid, name)), absolutePath: full, byteSize: stat.size });
      }
    }
    return out;
  },

  // Eagerly create today's <root>/YYYY/MM/DD/<recordId>/ so a folder exists for
  // same-day uploads, and seed document_path with it. Files uploaded on later
  // days land in their own day folder — document_path is a hint, not the sole
  // location (each crm_document row carries its own relative_path).
  //
  // `on` (ISO date/timestamp) overrides the day folder. Repair runs pass the
  // record's created_at so a folder that was never provisioned (file server
  // down at create time) is rebuilt where it would originally have gone,
  // instead of appearing under today's date.
  async ensureRecordFolder({ root, recordId, on }) {
    const rid = safeSegment(recordId);
    if (!rid) throw new HttpError(400, 'Invalid record id.');
    const day = on ? new Date(on) : new Date();
    if (Number.isNaN(day.getTime())) throw new HttpError(400, `Invalid date: ${on}`);
    const segs = [...dayPrefix(day).split('/'), rid];
    const rootResolved = path.resolve(root);
    const dir = path.resolve(rootResolved, ...segs);
    if (!dir.startsWith(rootResolved + path.sep)) throw new HttpError(400, 'Resolved path escapes the configured root.');
    const existed = fs.existsSync(dir);
    await fsp.mkdir(dir, { recursive: true });
    return { relativePath: toPosix(segs.join('/')), absolutePath: dir, created: !existed };
  },

  async testConnection({ root }) {
    try {
      await fsp.mkdir(root, { recursive: true });
      await fsp.access(root, fs.constants.W_OK);
      return { ok: true, message: `Reachable and writable: ${root}` };
    } catch (e) {
      return { ok: false, message: e?.message ?? 'Path not reachable.' };
    }
  },
};
