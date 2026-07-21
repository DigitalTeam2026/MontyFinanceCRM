# CLAUDE.md — Monty Finance CRM

Project-wide instructions for Claude Code. These are **binding rules** for all code
in this repository. Follow them automatically in every session.

## Architecture (what this repo actually is)

This is **not** a `/frontend` + `/backend` monorepo and does **not** use Prisma.
The real layout:

- **Frontend** — React + TypeScript + Vite, in `src/`. Served in dev by Vite (`npm run dev`),
  in prod as static files behind IIS.
- **Backend** — Node.js + Express, in `server/` (`server/index.js` is the API; `server/auth.js`,
  `server/totp.js`, `server/deleteRules.js`, `server/automationWorker.js`, etc.). This is the
  ONLY tier allowed to touch the database.
- **Database** — PostgreSQL, accessed via the `pg` library with **parameterized queries**.
  Schema is managed through `supabase/migrations/*.sql`. Auth is fully local (Node + PG);
  see the project memory notes on local-auth-architecture.
- **File server** — `tools/file-server/` (document storage on `:4000`), reached same-origin
  via `/files` (IIS-proxied in prod, Vite-proxied in dev).
- **Config** — a single source-of-truth `.env` at the repo root. Only `VITE_`-prefixed vars
  are ever exposed to the client bundle.

When adding features, extend these existing tiers. Do **not** restructure into a monorepo,
swap `pg` for an ORM, or scaffold parallel auth.

## Security rules (apply to ALL code)

1. **The frontend NEVER touches the database.** All data flows through the `server/` Express
   API. No direct DB clients, connection strings, or SQL in `src/`.
2. **All business logic, subscription checks, role/permission checks, and sensitive
   calculations live in the backend only.** Frontend guards (hiding buttons, disabling routes)
   are UX only and must never be the sole enforcement point. Re-check every permission on the
   server before returning or mutating data.
3. **Every protected API endpoint verifies the JWT and checks the user's
   permissions/subscription in middleware BEFORE returning data.** New routes must go through
   the existing auth middleware in `server/` — never expose an endpoint that trusts an
   unauthenticated caller.
4. **Secrets live in the backend `.env` only** — DB credentials, JWT secret, SMTP creds, API
   keys. Never in `src/` (frontend), never hardcoded, never committed. `.env` and `.env*` are
   git-ignored; keep them that way. Only `*.env.example` (no real values) may be committed.
5. **No raw string-concatenated SQL.** Use parameterized queries (`pg` `$1, $2, …`) or the
   Supabase client. Never build SQL by interpolating client input.
6. **Validate ALL input from the client on the backend** — type, shape, range, and
   authorization to act on the referenced records. Never trust the frontend, including field
   names, IDs, and enum/choice values.
7. **CORS allows only the known frontend origin(s).** Do not use `origin: '*'` on
   credentialed/authenticated routes. Configure allowed origins from `.env`.

## Frontend build protection (configured in `vite.config.ts`)

- `build.sourcemap: false` — never ship source maps to production.
- `vite-plugin-javascript-obfuscator`, applied **only on production build** (`apply: 'build'`,
  so `npm run dev` stays normal and fast) and **only to `/src`** (`node_modules` excluded).
  Settings:
  - `stringArray: true`
  - `stringArrayEncoding: ['base64']`
  - `stringArrayThreshold: 0.75`
  - `selfDefending: true`
  - `compact: true`
  - `controlFlowFlattening: false`
  - `deadCodeInjection: false`
  - `renameGlobals: false`

Obfuscation is a defense-in-depth / IP-protection measure for shipped client code. It is
**not** a substitute for rules 1–7 — never move a secret or a security decision into the
frontend on the assumption that obfuscation hides it.
