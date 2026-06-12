// S3 (and S3-compatible) provider.
//
// root_location holds "bucket" or "bucket/prefix" (an optional s3:// scheme is
// stripped). Credentials come from Vault: { accessKeyId, secretAccessKey, region,
// endpoint?, forcePathStyle? }. Objects are keyed <prefix>/<recordId>/<fileName>;
// relativePath stays "<recordId>/<fileName>" to mirror the local provider so the
// crm_document rows are consistent across storage types.
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { HttpError, safeSegment, dayPrefix, splitRelative } from './util.mjs';

function parseRoot(root) {
  const r = String(root).replace(/^s3:\/\//i, '').replace(/^\/+/, '');
  const idx = r.indexOf('/');
  const bucket = idx === -1 ? r : r.slice(0, idx);
  const prefix = idx === -1 ? '' : r.slice(idx + 1).replace(/\/+$/, '');
  if (!bucket) throw new HttpError(400, 'S3 root must include a bucket name.');
  return { bucket, prefix };
}

function relKey(recordId, fileName) {
  const rid = safeSegment(recordId);
  const name = safeSegment(fileName);
  if (!rid) throw new HttpError(400, 'Invalid record id.');
  if (!name) throw new HttpError(400, 'Invalid file name.');
  return `${rid}/${name}`;
}

/** Today's upload key: YYYY/MM/DD/<recordId>/<fileName>. */
function uploadRelKey(recordId, fileName) {
  const rid = safeSegment(recordId);
  const name = safeSegment(fileName);
  if (!rid) throw new HttpError(400, 'Invalid record id.');
  if (!name) throw new HttpError(400, 'Invalid file name.');
  return `${dayPrefix()}/${rid}/${name}`;
}

/** Safe rel key from a stored relative path (new or legacy), else rebuild it. */
function storedRel(relativePath, recordId, fileName) {
  if (relativePath) return splitRelative(relativePath).join('/');
  return relKey(recordId, fileName);
}

function fullKey(prefix, rel) {
  return [prefix, rel].filter(Boolean).join('/');
}

function client(creds) {
  if (!creds?.accessKeyId || !creds?.secretAccessKey || !creds?.region) {
    throw new HttpError(400, 'S3 credentials are incomplete (need accessKeyId, secretAccessKey, region).');
  }
  return new S3Client({
    region: creds.region,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
    endpoint: creds.endpoint || undefined,
    forcePathStyle: !!creds.forcePathStyle,
  });
}

async function streamToBuffer(stream) {
  if (typeof stream.transformToByteArray === 'function') {
    return Buffer.from(await stream.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export const s3Provider = {
  async upload({ root, recordId, fileName, body, contentType, creds }) {
    const { bucket, prefix } = parseRoot(root);
    const rel = uploadRelKey(recordId, fileName);
    const key = fullKey(prefix, rel);
    await client(creds).send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: body, ContentType: contentType || undefined,
    }));
    return { relativePath: rel, absolutePath: `s3://${bucket}/${key}`, byteSize: body.length };
  },

  async download({ root, recordId, fileName, relativePath, creds }) {
    const { bucket, prefix } = parseRoot(root);
    const key = fullKey(prefix, storedRel(relativePath, recordId, fileName));
    try {
      const res = await client(creds).send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return { buffer: await streamToBuffer(res.Body), fileName: safeSegment(fileName) };
    } catch (e) {
      if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NoSuchKey') throw new HttpError(404, 'File not found.');
      throw e;
    }
  },

  async remove({ root, recordId, fileName, relativePath, creds }) {
    const { bucket, prefix } = parseRoot(root);
    const key = fullKey(prefix, storedRel(relativePath, recordId, fileName));
    await client(creds).send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },

  async rename({ root, recordId, fileName, newName, relativePath, creds }) {
    const { bucket, prefix } = parseRoot(root);
    const fromRel = storedRel(relativePath, recordId, fileName);
    const name = safeSegment(newName);
    if (!name) throw new HttpError(400, 'Invalid file name.');
    const slash = fromRel.lastIndexOf('/');
    const toRel = slash === -1 ? name : `${fromRel.slice(0, slash)}/${name}`; // rename in place, same folder
    if (fromRel === toRel) return { relativePath: toRel, absolutePath: `s3://${bucket}/${fullKey(prefix, toRel)}` };
    const c = client(creds);
    const fromKey = fullKey(prefix, fromRel);
    const toKey = fullKey(prefix, toRel);
    await c.send(new CopyObjectCommand({ Bucket: bucket, CopySource: `/${bucket}/${encodeURIComponent(fromKey)}`, Key: toKey }));
    await c.send(new DeleteObjectCommand({ Bucket: bucket, Key: fromKey }));
    return { relativePath: toRel, absolutePath: `s3://${bucket}/${toKey}` };
  },

  async list({ root, recordId, creds }) {
    const { bucket, prefix } = parseRoot(root);
    const rid = safeSegment(recordId);
    if (!rid) throw new HttpError(400, 'Invalid record id.');
    const keyPrefix = `${fullKey(prefix, rid)}/`;
    const res = await client(creds).send(new ListObjectsV2Command({ Bucket: bucket, Prefix: keyPrefix }));
    return (res.Contents ?? [])
      .filter((o) => o.Key && !o.Key.endsWith('/'))
      .map((o) => {
        const name = o.Key.slice(keyPrefix.length);
        return { fileName: name, relativePath: `${rid}/${name}`, absolutePath: `s3://${bucket}/${o.Key}`, byteSize: o.Size ?? null };
      });
  },

  // S3 has no real folders — a prefix exists implicitly once an object is written.
  // Nothing to create; return today's logical prefix for document_path seeding.
  async ensureRecordFolder({ root, recordId }) {
    const { bucket, prefix } = parseRoot(root);
    const rid = safeSegment(recordId);
    if (!rid) throw new HttpError(400, 'Invalid record id.');
    const rel = `${dayPrefix()}/${rid}`;
    return { relativePath: rel, absolutePath: `s3://${bucket}/${[prefix, rel].filter(Boolean).join('/')}/`, created: false };
  },

  async testConnection({ root, creds }) {
    try {
      const { bucket } = parseRoot(root);
      await client(creds).send(new HeadBucketCommand({ Bucket: bucket }));
      return { ok: true, message: `Bucket reachable: ${bucket}` };
    } catch (e) {
      return { ok: false, message: e?.message ?? 'Bucket not reachable.' };
    }
  },
};
