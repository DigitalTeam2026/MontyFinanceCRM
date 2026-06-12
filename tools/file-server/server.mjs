// Local file storage server for Monty Finance CRM.
//
// Bridges the browser/Supabase to per-entity storage backends (Local, NAS, S3,
// SharePoint) configured in Admin Studio (document_location_config). It runs on a
// machine you trust — it is the only component that can touch C:\ / UNC paths and
// the only holder of the Supabase service-role key used to read storage secrets.
//
// Security model:
//   - Every request carries the caller's Supabase JWT (Authorization: Bearer ...).
//   - The token is verified with Supabase; the per-entity root + storage type are
//     read THROUGH that token (RLS), so the server never trusts a client path.
//   - Record access is verified with can_access_record (RLS) before any file op.
//   - For S3/SharePoint, credentials are fetched from Supabase Vault using the
//     service-role key (get_storage_secret, which only service_role may call) —
//     they are never exposed to the browser.
//   - recordId / fileName are sanitized; local paths are confined to the root.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { getProvider, CREDENTIALED, HttpError } from './providers/index.mjs';
import { safeSegment } from './providers/util.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // needed for S3/SharePoint secrets
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

const serviceClient = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

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

/**
 * Verify the token, resolve the entity's storage type + root, and (for credentialed
 * providers) fetch its secret from Vault via the service-role client.
 */
async function resolveStorage(token, entity) {
  const supabase = userClient(token);
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    throw new HttpError(401, 'Invalid or expired session.');
  }
  // select('*') so this keeps working whether or not the storage_type column
  // exists yet (pre/post migration); the type defaults to 'local' when absent.
  const { data, error } = await supabase
    .from('document_location_config')
    .select('*')
    .eq('entity_logical_name', entity)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, `No document location configured for "${entity}".`);
  if (!data.is_active) throw new HttpError(403, `Document storage is disabled for "${entity}".`);

  const storageType = data.storage_type ?? 'local';
  let creds = null;
  if (CREDENTIALED.has(storageType)) {
    if (!serviceClient) {
      throw new HttpError(500, `Storage type "${storageType}" needs credentials, but SUPABASE_SERVICE_ROLE_KEY is not set on the file server.`);
    }
    const { data: secret, error: secretErr } = await serviceClient.rpc('get_storage_secret', { p_entity: entity });
    if (secretErr) throw new HttpError(500, `Could not read storage credentials: ${secretErr.message}`);
    if (!secret) throw new HttpError(400, `No credentials saved for "${entity}". Add them in Admin Studio → Document Locations.`);
    creds = secret;
  }
  return { root: data.root_location, storageType, creds, provider: getProvider(storageType), supabase, userId: userData.user.id };
}

/**
 * Confirm the caller can access the parent record before touching files.
 * can_access_record runs under the user's token (RLS), so it returns true only
 * when the user can actually see the record — this is the access-control gate.
 */
async function assertRecordAccess(supabase, entity, recordId) {
  const { data, error } = await supabase.rpc('can_access_record', { p_entity: entity, p_record_id: recordId });
  if (error) throw new HttpError(500, error.message);
  if (data !== true) throw new HttpError(403, 'You do not have access to this record.');
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
    allowedOrigins: ALLOWED_ORIGINS,
    serviceRole: !!serviceClient,
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
    await assertRecordAccess(ctx.supabase, entity, safeSegment(recordId));

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
  await assertRecordAccess(ctx.supabase, entity, safeSegment(req.query.recordId));

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
  await assertRecordAccess(ctx.supabase, entity, safeSegment(req.query.recordId));

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
  await assertRecordAccess(ctx.supabase, entity, safeSegment(req.query.recordId));

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
  await assertRecordAccess(ctx.supabase, entity, safeSegment(req.query.recordId));

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
  await assertRecordAccess(ctx.supabase, entity, safeSegment(recordId));

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
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  console.log(`Service-role key: ${serviceClient ? 'configured (S3/SharePoint enabled)' : 'NOT set (local/nas only)'}`);
});
