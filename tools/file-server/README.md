# Monty File Server

Local file storage service for the CRM's **Document Location** feature. It runs on the
machine that owns the storage folders (your PC for local testing, or a file server) and
is the only component that can read/write `C:\...` paths — browsers and Supabase cannot.

It writes uploaded files to the per-entity root folder configured in **Admin Studio →
Platform → Document Location**, under a **per-day** folder (nested year/month/day):

```
<root>/YYYY/MM/DD/<recordId>/<fileName>
```

The day is the upload date. Reads, renames and deletes use the `relative_path` stored
in `crm_document`, so files filed on any day resolve correctly — and legacy files at the
old `<root>/<recordId>/<fileName>` location keep working without migration.

## How it fits together

```
Browser (CRM)  ──upload──>  File Server (this)  ──writes──>  C:\...\MontyFinanceStorage\Lead\2026\06\12\<recordId>\<file>
      │                          │
      │                          └─ verifies auth + reads the per-entity root
      │                             from the local CRM API (server/index.js -> PostgreSQL)
      └────── registers the stored relative_path (e.g. 2026/06/12/<recordId>/<file>) in `crm_document`
```

This project has **no Supabase cloud** (see `src/lib/supabase.ts`). Auth and config
lookups are delegated to the local Express API at `server/index.js`:

- The browser sends the file plus the caller's session token (the HMAC token minted by
  the local API on login — `server/auth.js`).
- The server **verifies the token** via `GET /api/auth/session`, then reads the entity's
  root location from `document_location_config` through the same API, so a client can never
  make it write to an arbitrary path.
- Record access is checked with the `can_access_record` RPC before any file op.
- `recordId` / `fileName` are sanitized and the final path is confirmed to stay inside the
  configured root (no path traversal).

> **S3 / SharePoint:** credential storage used Supabase Vault, which is not present in local
> mode, so those providers are unavailable until credential storage is re-implemented against
> the local API. **Local** and **NAS** work fully.

## Setup

```bash
cd tools/file-server
npm install
cp .env.example .env      # then edit .env if needed
```

Fill in `.env`:

- `API_URL` — the local CRM API, same as the project root `.env`'s `VITE_API_URL`
  (e.g. `http://localhost:3001`). The main API server (`server/index.js`) must be running.
- `PORT` — default `4000`.
- `ALLOWED_ORIGINS` — your Vite dev origin, e.g. `http://localhost:5173`.

Start it:

```bash
npm start
# Monty file server listening on http://localhost:4000
```

If the CRM runs the file server on a non-default port/host, set `VITE_FILE_SERVER_URL`
in the **project root** `.env` (e.g. `VITE_FILE_SERVER_URL=http://localhost:4000`).

## Endpoints

| Method | Path        | Purpose                                                            |
|--------|-------------|-------------------------------------------------------------------|
| GET    | `/health`   | Liveness check.                                                   |
| POST   | `/upload`   | Raw file body + `x-entity`, `x-record-id`, `x-file-name` headers. |
| GET    | `/download` | `?entity=&recordId=&file=` — streams the file.                   |
| DELETE | `/file`     | `?entity=&recordId=&file=` — removes the file.                   |

All requests require `Authorization: Bearer <supabase-jwt>` (download also accepts `?token=`).

## End-to-end test (with Lead)

1. **Apply the migration** so the tables exist (run from the project root):
   `node scripts/apply_migration.mjs supabase/migrations/20260611140000_document_location_storage.sql`
2. **Start this server**: `npm start` in `tools/file-server`.
3. **Start the CRM**: `npm run dev` in the project root, and sign in as a system admin.
4. In **Admin Studio → Document Location**, click **Add Location**, pick **Lead**, and set
   the root to e.g. `C:\Users\habib.serhan\Desktop\MontyFinanceStorage\Lead`. Save.
   (You don't need to pre-create the folder — the server makes it on first upload.)
5. Open a Lead record — the shared Documents tab (`<DocumentsTab entityType="lead" recordId=... />`,
   see `src/app/components/DocumentsTab.tsx`) appears automatically when Documents is enabled for the
   entity. Upload a file and confirm:
   - the file appears at `…\MontyFinanceStorage\Lead\2026\06\12\<leadId>\<file>` on disk,
   - a row exists in `crm_document` with `relative_path = 2026/06/12/<leadId>/<file>`,
   - **Download** returns the file and **Delete** removes it.

## Notes

- This server must run on the machine that should hold the files. If the CRM is opened from
  a different PC, that PC must be able to reach this server's host/port, and the paths are
  on the **server's** filesystem, not the visitor's.
- For production, run it behind HTTPS and a process manager, and lock `ALLOWED_ORIGINS`
  down to the real app origin.
