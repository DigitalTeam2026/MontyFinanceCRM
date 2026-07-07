// Local file storage server for Monty Finance CRM.
//
// Bridges the browser to per-entity storage backends (Local, NAS, S3, SharePoint)
// configured in Admin Studio (document_location_config). It runs on a machine you
// trust — it is the only component that can touch C:\ / UNC paths.
//
// Architecture:
//   Browser (CRM)  ──file ops──>  File Server (this)  ──writes──>  C:\ / \\NAS\...
//        │                             │
//        │                             └─ delegates auth + config lookups to the
//        │                                local Express API (server/index.js), which
//        │                                talks to local PostgreSQL. This project has
//        │                                NO Supabase cloud — see src/lib/supabase.ts.
//        └────── registers the stored relative_path in `crm_document` via that same API
//
// Security model:
//   - Every request carries the caller's session token (Authorization: Bearer ...),
//     the HMAC token minted by the local API on login (server/auth.js).
//   - The token is verified by the local API (GET /api/auth/session); the per-entity
//     root + storage type are read from document_location_config through that API.
//   - Record access is verified with the can_access_record RPC before any file op.
//   - recordId / fileName are sanitized; local paths are confined to the root.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getProvider, CREDENTIALED, HttpError } from './providers/index.mjs';
import { safeSegment } from './providers/util.mjs';

// The local CRM API (server/index.js) — same value the frontend uses as VITE_API_URL.
const API_URL = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const PORT = Number(process.env.PORT ?? 4000);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 100);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
// ALLOWED_ORIGINS='*' reflects whatever origin the request came from, so the CRM
// keeps working no matter how it's reached (IP, hostname, or domain) without
// re-listing origins here. Safe because every endpoint below requires a valid
// bearer token + record-access check — CORS is not the security boundary.
app.use(cors({ origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS }));

/** Pull the bearer token off the request (header or ?token= for direct browser links). */
function getToken(req) {
  const auth = req.get('authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  if (typeof req.query.token === 'string') return req.query.token;
  return null;
}

/**
 * Call the local CRM API. `body` (if given) is sent as JSON. The caller's token is
 * forwarded so the API applies the same identity/RLS the browser would get.
 * Throws HttpError(502) when the API can't be reached at all.
 */
async function callApi(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new HttpError(502, `Cannot reach the CRM API at ${API_URL}. Is server/index.js running? (${e?.message ?? e})`);
  }
  const text = await res.text();
  let parsed = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = { error: { message: text } }; }
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

/** Verify the caller's token with the local API and return the user, or throw 401. */
async function verifyUser(token) {
  const { body } = await callApi('/api/auth/session', { token });
  const user = body?.data?.user;
  if (!user) throw new HttpError(401, 'Invalid or expired session.');
  return user;
}

/**
 * Verify the token, resolve the entity's storage type + root, and (for credentialed
 * providers) fetch its secret via the local API's get_storage_secret RPC.
 */
async function resolveStorage(token, entity) {
  const user = await verifyUser(token);

  // select('*') so this keeps working whether or not the storage_type column
  // exists yet (pre/post migration); the type defaults to 'local' when absent.
  const { ok, body } = await callApi(`/api/document_location_config`, {
    method: 'POST',
    token,
    body: {
      action: 'select',
      select: '*',
      filters: [{ type: 'eq', column: 'entity_logical_name', value: entity }],
      maybeSingle: true,
    },
  });
  if (!ok) throw new HttpError(500, body?.error?.message ?? 'Failed to read document location config.');
  const data = body?.data;
  if (!data) throw new HttpError(404, `No document location configured for "${entity}".`);
  if (!data.is_active) throw new HttpError(403, `Document storage is disabled for "${entity}".`);

  const storageType = data.storage_type ?? 'local';
  let creds = null;
  if (CREDENTIALED.has(storageType)) {
    const { ok: secretOk, body: secretBody } = await callApi('/api/rpc/get_storage_secret', {
      method: 'POST',
      token,
      body: { p_entity: entity },
    });
    if (!secretOk) {
      throw new HttpError(500, `Storage type "${storageType}" needs credentials, but they could not be read from the CRM API. S3/SharePoint credential storage is not configured in local mode.`);
    }
    const secret = secretBody?.data;
    if (!secret) throw new HttpError(400, `No credentials saved for "${entity}". Add them in Admin Studio → Document Locations.`);
    creds = secret;
  }
  return { root: data.root_location, storageType, creds, provider: getProvider(storageType), userId: user.id };
}

/**
 * Confirm the caller can access the parent record before touching files.
 * can_access_record is evaluated by the local API — it returns true only when the
 * record exists and the caller may see it — this is the access-control gate.
 */
async function assertRecordAccess(token, entity, recordId) {
  const { ok, body } = await callApi('/api/rpc/can_access_record', {
    method: 'POST',
    token,
    body: { p_entity: entity, p_record_id: recordId },
  });
  if (!ok) throw new HttpError(500, body?.error?.message ?? 'Access check failed.');
  if (body?.data !== true) throw new HttpError(403, 'You do not have access to this record.');
}

/** Wrap an async handler so HttpError -> status and anything else -> 500. */
function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error('file-server error', e);
      res.status(status).json({ error: e?.message ?? 'Request failed.' });
    }
  };
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'monty-file-server',
    apiUrl: API_URL,
    allowedOrigins: ALLOWED_ORIGINS,
    providers: ['local', 'nas', 's3', 'sharepoint'],
  });
});

// Upload: raw file body + x-entity / x-record-id / x-file-name headers.
app.post(
  '/upload',
  express.raw({ type: '*/*', limit: `${MAX_UPLOAD_MB}mb` }),
  handler(async (req, res) => {
    const token = getToken(req);
    if (!token) throw new HttpError(401, 'Missing authorization token.');
    const entity = safeSegment(req.get('x-entity'));
    if (!entity) throw new HttpError(400, 'Missing or invalid x-entity header.');
    const recordId = req.get('x-record-id');
    const fileName = req.get('x-file-name') ? decodeURIComponent(req.get('x-file-name')) : null;
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'Empty request body.');

    const ctx = await resolveStorage(token, entity);
    await assertRecordAccess(token, entity, safeSegment(recordId));

    const result = await ctx.provider.upload({
      root: ctx.root, recordId, fileName, body: req.body,
      contentType: req.get('content-type'), creds: ctx.creds,
    });
    res.json({ ...result, storageType: ctx.storageType });
  })
);

// Download: ?entity=&recordId=&file= plus bearer token (header or ?token=).
app.get('/download', handler(async (req, res) => {
  const token = getToken(req);
  if (!token) throw new HttpError(401, 'Missing authorization token.');
  const entity = safeSegment(req.query.entity);
  if (!entity) throw new HttpError(400, 'Missing or invalid entity.');

  const ctx = await resolveStorage(token, entity);
  await assertRecordAccess(token, entity, safeSegment(req.query.recordId));

  const { buffer, fileName } = await ctx.provider.download({
    root: ctx.root, recordId: req.query.recordId, fileName: req.query.file,
    relativePath: req.query.relativePath, creds: ctx.creds,
  });
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(buffer);
}));

// List files stored for a record: ?entity=&recordId=
app.get('/list', handler(async (req, res) => {
  const token = getToken(req);
  if (!token) throw new HttpError(401, 'Missing authorization token.');
  const entity = safeSegment(req.query.entity);
  if (!entity) throw new HttpError(400, 'Missing or invalid entity.');

  const ctx = await resolveStorage(token, entity);
  await assertRecordAccess(token, entity, safeSegment(req.query.recordId));

  const files = await ctx.provider.list({ root: ctx.root, recordId: req.query.recordId, creds: ctx.creds });
  res.json({ storageType: ctx.storageType, files });
}));

// Delete a stored file (the DB row is removed by the frontend).
app.delete('/file', handler(async (req, res) => {
  const token = getToken(req);
  if (!token) throw new HttpError(401, 'Missing authorization token.');
  const entity = safeSegment(req.query.entity);
  if (!entity) throw new HttpError(400, 'Missing or invalid entity.');

  const ctx = await resolveStorage(token, entity);
  await assertRecordAccess(token, entity, safeSegment(req.query.recordId));

  await ctx.provider.remove({
    root: ctx.root, recordId: req.query.recordId, fileName: req.query.file,
    relativePath: req.query.relativePath, creds: ctx.creds,
  });
  res.json({ ok: true });
}));

// Rename a stored file within the same record folder (?entity=&recordId=&file=, x-new-file-name header).
app.patch('/file', handler(async (req, res) => {
  const token = getToken(req);
  if (!token) throw new HttpError(401, 'Missing authorization token.');
  const entity = safeSegment(req.query.entity);
  if (!entity) throw new HttpError(400, 'Missing or invalid entity.');
  const newName = req.get('x-new-file-name') ? decodeURIComponent(req.get('x-new-file-name')) : null;

  const ctx = await resolveStorage(token, entity);
  await assertRecordAccess(token, entity, safeSegment(req.query.recordId));

  const result = await ctx.provider.rename({
    root: ctx.root, recordId: req.query.recordId, fileName: req.query.file, newName,
    relativePath: req.query.relativePath, creds: ctx.creds,
  });
  res.json({ ...result, storageType: ctx.storageType });
}));

// Provision a record's storage location (create <root>/<recordId>/ if missing).
// Called when a record is created so its folder exists before any upload.
// Body or query: { entity, recordId }. Returns { relativePath, absolutePath, created }.
app.post('/provision', express.json(), handler(async (req, res) => {
  const token = getToken(req);
  if (!token) throw new HttpError(401, 'Missing authorization token.');
  const entity = safeSegment(req.body?.entity ?? req.query.entity);
  if (!entity) throw new HttpError(400, 'Missing or invalid entity.');
  const recordId = req.body?.recordId ?? req.query.recordId;

  const ctx = await resolveStorage(token, entity);
  await assertRecordAccess(token, entity, safeSegment(recordId));

  const result = await ctx.provider.ensureRecordFolder({ root: ctx.root, recordId, creds: ctx.creds });
  res.json({ ...result, storageType: ctx.storageType });
}));

// Test connection for an entity's saved storage config (?entity=). Admin-driven.
app.get('/test-connection', handler(async (req, res) => {
  const token = getToken(req);
  if (!token) throw new HttpError(401, 'Missing authorization token.');
  const entity = safeSegment(req.query.entity);
  if (!entity) throw new HttpError(400, 'Missing or invalid entity.');

  const ctx = await resolveStorage(token, entity);
  const result = await ctx.provider.testConnection({ root: ctx.root, creds: ctx.creds });
  res.status(result.ok ? 200 : 400).json({ ...result, storageType: ctx.storageType });
}));

app.listen(PORT, () => {
  console.log(`Monty file server listening on http://localhost:${PORT}`);
  console.log(`CRM API: ${API_URL}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});
