// SharePoint provider via Microsoft Graph (app-only / client-credentials flow).
//
// root_location holds an optional folder path inside the document library
// (e.g. "Leads" or ""). Credentials come from Vault:
//   { tenantId, clientId, clientSecret, driveId }
// driveId is the target document library's drive id (Graph: /sites/{id}/drives).
// Files live at <folder>/<recordId>/<fileName>; relativePath stays
// "<recordId>/<fileName>" to mirror the other providers.
//
// NOTE: uses Graph "simple upload" (PUT .../content). For very large files an
// upload session would be needed — flagged for a future pass.
import { HttpError, safeSegment, dayPrefix, splitRelative } from './util.mjs';

const GRAPH = 'https://graph.microsoft.com/v1.0';

async function getToken(creds) {
  if (!creds?.tenantId || !creds?.clientId || !creds?.clientSecret || !creds?.driveId) {
    throw new HttpError(400, 'SharePoint credentials are incomplete (need tenantId, clientId, clientSecret, driveId).');
  }
  const url = `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new HttpError(401, `SharePoint auth failed: ${await res.text()}`);
  return (await res.json()).access_token;
}

function itemPath(root, recordId, fileName) {
  const rid = safeSegment(recordId);
  if (!rid) throw new HttpError(400, 'Invalid record id.');
  const folder = String(root || '').replace(/^\/+|\/+$/g, '');
  const parts = [folder, rid];
  if (fileName) {
    const name = safeSegment(fileName);
    if (!name) throw new HttpError(400, 'Invalid file name.');
    parts.push(name);
  }
  return parts.filter(Boolean).map(encodeURIComponent).join('/');
}

/** Today's upload path: <folder>/YYYY/MM/DD/<recordId>/<fileName>. Returns both
 *  the encoded Graph path and the relativePath stored in crm_document. */
function uploadPaths(root, recordId, fileName) {
  const rid = safeSegment(recordId);
  const name = safeSegment(fileName);
  if (!rid) throw new HttpError(400, 'Invalid record id.');
  if (!name) throw new HttpError(400, 'Invalid file name.');
  const folder = String(root || '').replace(/^\/+|\/+$/g, '');
  const rel = `${dayPrefix()}/${rid}/${name}`;
  const encoded = [folder, ...rel.split('/')].filter(Boolean).map(encodeURIComponent).join('/');
  return { rel, encoded };
}

/** Encoded Graph path for an existing item from its stored relative path (new
 *  day-based or legacy <recordId>/<file>), else rebuilt from recordId/fileName. */
function storedItemPath(root, relativePath, recordId, fileName) {
  const segs = relativePath ? splitRelative(relativePath) : [safeSegment(recordId), safeSegment(fileName)];
  if (segs.some((s) => !s)) throw new HttpError(400, 'Invalid stored path.');
  const folder = String(root || '').replace(/^\/+|\/+$/g, '');
  return [folder, ...segs].filter(Boolean).map(encodeURIComponent).join('/');
}

function driveUrl(driveId, p, suffix = '') {
  // /drives/{id}/root:/<path>:<suffix>  (root: with empty path collapses to /root)
  return p
    ? `${GRAPH}/drives/${driveId}/root:/${p}:${suffix}`
    : `${GRAPH}/drives/${driveId}/root${suffix.replace(/^:/, '')}`;
}

async function gfetch(token, url, init = {}) {
  return fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
}

export const sharepointProvider = {
  async upload({ root, recordId, fileName, body, contentType, creds }) {
    const token = await getToken(creds);
    const { rel, encoded } = uploadPaths(root, recordId, fileName);
    const res = await gfetch(token, driveUrl(creds.driveId, encoded, ':/content'), {
      method: 'PUT',
      headers: { 'Content-Type': contentType || 'application/octet-stream' },
      body,
    });
    if (!res.ok) throw new HttpError(res.status, `SharePoint upload failed: ${await res.text()}`);
    const item = await res.json();
    return { relativePath: rel, absolutePath: item.webUrl ?? null, byteSize: body.length };
  },

  async download({ root, recordId, fileName, relativePath, creds }) {
    const token = await getToken(creds);
    const p = storedItemPath(root, relativePath, recordId, fileName);
    const res = await gfetch(token, driveUrl(creds.driveId, p, ':/content'));
    if (res.status === 404) throw new HttpError(404, 'File not found.');
    if (!res.ok) throw new HttpError(res.status, `SharePoint download failed: ${await res.text()}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, fileName: safeSegment(fileName) };
  },

  async remove({ root, recordId, fileName, relativePath, creds }) {
    const token = await getToken(creds);
    const p = storedItemPath(root, relativePath, recordId, fileName);
    const res = await gfetch(token, driveUrl(creds.driveId, p), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new HttpError(res.status, `SharePoint delete failed: ${await res.text()}`);
  },

  async rename({ root, recordId, fileName, newName, relativePath, creds }) {
    const name = safeSegment(newName);
    if (!name) throw new HttpError(400, 'Invalid file name.');
    const token = await getToken(creds);
    const p = storedItemPath(root, relativePath, recordId, fileName);
    const res = await gfetch(token, driveUrl(creds.driveId, p), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.status === 404) throw new HttpError(404, 'File not found.');
    if (res.status === 409) throw new HttpError(409, 'A file with that name already exists.');
    if (!res.ok) throw new HttpError(res.status, `SharePoint rename failed: ${await res.text()}`);
    const item = await res.json();
    // Rename in place: new relative path = same folder + new name.
    const fromRel = relativePath ? splitRelative(relativePath).join('/') : `${safeSegment(recordId)}/${safeSegment(fileName)}`;
    const slash = fromRel.lastIndexOf('/');
    const newRel = slash === -1 ? name : `${fromRel.slice(0, slash)}/${name}`;
    return { relativePath: newRel, absolutePath: item.webUrl ?? null };
  },

  async list({ root, recordId, creds }) {
    const token = await getToken(creds);
    const rid = safeSegment(recordId);
    const p = itemPath(root, recordId, null);
    const res = await gfetch(token, driveUrl(creds.driveId, p, ':/children'));
    if (res.status === 404) return [];
    if (!res.ok) throw new HttpError(res.status, `SharePoint list failed: ${await res.text()}`);
    const data = await res.json();
    return (data.value ?? [])
      .filter((i) => i.file)
      .map((i) => ({ fileName: i.name, relativePath: `${rid}/${i.name}`, absolutePath: i.webUrl ?? null, byteSize: i.size ?? null }));
  },

  // Day-based uploads create their parent folders implicitly (Graph creates the
  // path on PUT), so there's nothing to pre-create. Return today's logical path
  // for document_path seeding.
  async ensureRecordFolder({ root, recordId }) {
    const rid = safeSegment(recordId);
    if (!rid) throw new HttpError(400, 'Invalid record id.');
    void root;
    return { relativePath: `${dayPrefix()}/${rid}`, absolutePath: null, created: false };
  },

  async testConnection({ creds }) {
    try {
      const token = await getToken(creds);
      const res = await gfetch(token, `${GRAPH}/drives/${creds.driveId}/root`);
      if (!res.ok) return { ok: false, message: `Drive not reachable: ${await res.text()}` };
      return { ok: true, message: 'SharePoint drive reachable.' };
    } catch (e) {
      return { ok: false, message: e?.message ?? 'SharePoint not reachable.' };
    }
  },
};
