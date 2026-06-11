// Local file storage server for Monty Finance CRM.
//
// Writes uploaded files to the per-entity root folder configured in Admin Studio
// (document_location_config), under <root>/<recordId>/<fileName>. It runs on the
// machine that owns the storage folders (your PC or a file server) — it is the only
// component that can touch C:\... paths, because browsers and Supabase cannot.
//
// Security model:
//   - Every request must carry the caller's Supabase JWT (Authorization: Bearer ...).
//   - The token is verified with Supabase, and the per-entity root is read THROUGH
//     that token (RLS), so the server never trusts a client-supplied path.
//   - recordId and fileName are sanitized and the final path is confirmed to stay
//     inside the configured root (no path traversal).

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const PORT = Number(process.env.PORT ?? 4000);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 100);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.');
  process.exit(1);
}

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));

/** Pull the bearer token off the request (header or ?token= for direct browser links). */
function getToken(req) {
  const auth = req.get('authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  if (typeof req.query.token === 'string') return req.query.token;
  return null;
}

/** A Supabase client scoped to the caller's JWT, so RLS applies as that user. */
function userClient(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** Verify the token and resolve the active root location for an entity. */
async function resolveRoot(token, entity) {
  const supabase = userClient(token);
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { error: { status: 401, message: 'Invalid or expired session.' } };
  }
  const { data, error } = await supabase
    .from('document_location_config')
    .select('root_location, is_active')
    .eq('entity_logical_name', entity)
    .maybeSingle();
  if (error) return { error: { status: 500, message: error.message } };
  if (!data) return { error: { status: 404, message: `No document location configured for "${entity}".` } };
  if (!data.is_active) return { error: { status: 403, message: `Document storage is disabled for "${entity}".` } };
  return { root: data.root_location, userId: userData.user.id, supabase };
}

/**
 * Confirm the caller can access the parent record before touching files.
 * can_access_record runs under the user's token (RLS), so it returns true only
 * when the user can actually see the record — this is the access-control gate.
 */
async function assertRecordAccess(supabase, entity, recordId) {
  const { data, error } = await supabase.rpc('can_access_record', {
    p_entity: entity,
    p_record_id: recordId,
  });
  if (error) return { error: { status: 500, message: error.message } };
  if (data !== true) {
    return { error: { status: 403, message: 'You do not have access to this record.' } };
  }
  return {};
}

/** Allow only safe single path segments (no separators, no traversal). */
function safeSegment(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const base = path.basename(value.trim());
  if (!base || base === '.' || base === '..') return null;
  if (/[\\/]/.test(base)) return null;
  return base;
}

/** Build and validate <root>/<recordId>/<fileName>, ensuring it stays inside root. */
function buildTargetPath(root, recordId, fileName) {
  const rid = safeSegment(recordId);
  const name = safeSegment(fileName);
  if (!rid) return { error: 'Invalid record id.' };
  if (!name) return { error: 'Invalid file name.' };
  const dir = path.resolve(root, rid);
  const full = path.resolve(dir, name);
  const rootResolved = path.resolve(root);
  if (dir !== path.join(rootResolved, rid) || !full.startsWith(rootResolved + path.sep)) {
    return { error: 'Resolved path escapes the configured root.' };
  }
  return { dir, full, relativePath: path.join(rid, name) };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'monty-file-server', allowedOrigins: ALLOWED_ORIGINS });
});

// Upload: raw file body + x-entity / x-record-id / x-file-name headers.
app.post(
  '/upload',
  express.raw({ type: '*/*', limit: `${MAX_UPLOAD_MB}mb` }),
  async (req, res) => {
    try {
      const token = getToken(req);
      if (!token) return res.status(401).json({ error: 'Missing authorization token.' });

      const entity = safeSegment(req.get('x-entity'));
      const recordId = req.get('x-record-id');
      const fileName = req.get('x-file-name') ? decodeURIComponent(req.get('x-file-name')) : null;
      if (!entity) return res.status(400).json({ error: 'Missing or invalid x-entity header.' });
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'Empty request body.' });
      }

      const resolved = await resolveRoot(token, entity);
      if (resolved.error) return res.status(resolved.error.status).json({ error: resolved.error.message });

      const access = await assertRecordAccess(resolved.supabase, entity, safeSegment(recordId));
      if (access.error) return res.status(access.error.status).json({ error: access.error.message });

      const target = buildTargetPath(resolved.root, recordId, fileName);
      if (target.error) return res.status(400).json({ error: target.error });

      await fsp.mkdir(target.dir, { recursive: true });
      await fsp.writeFile(target.full, req.body);

      res.json({
        relativePath: target.relativePath.split(path.sep).join('/'),
        absolutePath: target.full,
        byteSize: req.body.length,
      });
    } catch (e) {
      console.error('upload error', e);
      res.status(500).json({ error: e?.message ?? 'Upload failed.' });
    }
  }
);

// Download: ?entity=&recordId=&file= plus bearer token (header or ?token=).
app.get('/download', async (req, res) => {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Missing authorization token.' });
    const entity = safeSegment(req.query.entity);
    if (!entity) return res.status(400).json({ error: 'Missing or invalid entity.' });

    const resolved = await resolveRoot(token, entity);
    if (resolved.error) return res.status(resolved.error.status).json({ error: resolved.error.message });

    const access = await assertRecordAccess(resolved.supabase, entity, safeSegment(req.query.recordId));
    if (access.error) return res.status(access.error.status).json({ error: access.error.message });

    const target = buildTargetPath(resolved.root, req.query.recordId, req.query.file);
    if (target.error) return res.status(400).json({ error: target.error });
    if (!fs.existsSync(target.full)) return res.status(404).json({ error: 'File not found.' });

    res.download(target.full, path.basename(target.full));
  } catch (e) {
    console.error('download error', e);
    res.status(500).json({ error: e?.message ?? 'Download failed.' });
  }
});

// Delete a stored file (the DB row is removed by the frontend).
app.delete('/file', async (req, res) => {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Missing authorization token.' });
    const entity = safeSegment(req.query.entity);
    if (!entity) return res.status(400).json({ error: 'Missing or invalid entity.' });

    const resolved = await resolveRoot(token, entity);
    if (resolved.error) return res.status(resolved.error.status).json({ error: resolved.error.message });

    const access = await assertRecordAccess(resolved.supabase, entity, safeSegment(req.query.recordId));
    if (access.error) return res.status(access.error.status).json({ error: access.error.message });

    const target = buildTargetPath(resolved.root, req.query.recordId, req.query.file);
    if (target.error) return res.status(400).json({ error: target.error });
    if (fs.existsSync(target.full)) await fsp.unlink(target.full);

    res.json({ ok: true });
  } catch (e) {
    console.error('delete error', e);
    res.status(500).json({ error: e?.message ?? 'Delete failed.' });
  }
});

app.listen(PORT, () => {
  console.log(`Monty file server listening on http://localhost:${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});
