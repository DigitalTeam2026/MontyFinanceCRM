# 🧪 QA Agent

A dependency-free, one-command static QA agent for this CRM. It scans the
**frontend**, **backend (Supabase Edge Functions)**, and **database
(SQL migrations)**, then writes a single Markdown report grouped into
**Critical / Medium / Low** with file paths, line numbers, table names, and
suggested fixes.

It is **safe to run locally or in CI** — it never connects to a live database
and never mutates data. The database checks are performed by statically
analyzing the SQL migration files.

## What it checks

### Frontend (`src/`)
- **TypeScript errors** via `tsc --noEmit` → type mismatches, missing props, bad imports (Critical).
- **ESLint** (your existing flat config) → React Hooks violations (Critical), other errors (Medium), warnings (Low).
- Heuristics: `dangerouslySetInnerHTML` (XSS), leftover `console.log`, explicit `any`, `TODO/FIXME`.

### Backend (`supabase/functions/`)
- Request handler with **no try/catch** (Critical).
- **Service-role key used without verifying the caller** (Critical security).
- Possible **hardcoded secrets / JWTs** (Critical).
- Missing **OPTIONS/CORS preflight** (Medium), wildcard CORS origin (Low).
- Body parsed but **no input validation** / no 4xx returned (Medium).
- Deprecated `std/http` `serve` import, explicit `any` (Low).

### Database (`supabase/migrations/`)
- **Foreign keys without a covering index** (Medium).
- **Tables without RLS enabled** anywhere across migrations (Critical).
- **Over-permissive policies** — `USING (true)`, access granted to `anon`/`public` (Medium/Critical; Critical on `*log*`/`*audit*` tables).
- `auth.uid()` not wrapped in `(select …)` — per-row re-evaluation (Low, perf).

> State is **aggregated across all migration files**, so something fixed in a
> later migration (e.g. an index added afterwards) is **not** re-reported.

## Install

Nothing to install — it uses only Node's standard library. The frontend
checks reuse the ESLint/TypeScript already in `devDependencies`, so just make
sure deps are present:

```bash
npm install
```

Requires Node 18+.

## Usage

```bash
# Everything (default)
npm run check-agent

# One area at a time
npm run check-agent:frontend
npm run check-agent:backend
npm run check-agent:database
```

Direct CLI (more options):

```bash
node tools/qa-agent/index.mjs --scope=all --out=qa-report.md --fail-on=critical
node tools/qa-agent/index.mjs --scope=frontend,database         # comma-separated
node tools/qa-agent/index.mjs --scope=backend --fail-on=none -q # never fail, quiet
```

### Flags
| Flag | Default | Meaning |
| --- | --- | --- |
| `--scope=` | `all` | `frontend`, `backend`, `database`, `all`, or a comma-separated subset |
| `--out=` | `qa-report.md` | Output Markdown path (relative to repo root or absolute) |
| `--fail-on=` | `critical` | Exit code 1 if any finding ≥ this severity: `critical`, `medium`, `low`, or `none` |
| `--quiet` / `-q` | off | Suppress console output (report file is still written) |

The report is written to **`qa-report.md`** at the repo root by default.

## Configuration

Optional `qa-agent.config.json` at the repo root overrides the scanned paths
and default gate:

```json
{
  "frontend": { "include": ["src"] },
  "backend":  { "include": ["supabase/functions"] },
  "database": { "include": ["supabase/migrations"] },
  "failOn": "critical"
}
```

## CI example (GitHub Actions)

```yaml
- run: npm ci
- run: npm run check-agent -- --fail-on=critical
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: qa-report
    path: qa-report.md
```

## Extending it

Each scope is one file under `tools/qa-agent/checks/`. To add a rule, push a
`finding({ severity, scope, rule, message, file, line, suggestion })` from the
relevant check. Shared helpers (file walking, SQL statement splitting, line
lookup) live in `tools/qa-agent/lib/core.mjs`. No build step — the agent is
plain Node ESM and can be re-run anytime.
