#!/usr/bin/env node
// QA Agent — one-command static QA for frontend / backend / database.
// Usage: node tools/qa-agent/index.mjs [--scope=all] [--out=qa-report.md] [--fail-on=critical]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEVERITY_RANK } from './lib/core.mjs';
import { buildReport } from './lib/report.mjs';
import { runFrontend } from './checks/frontend.mjs';
import { runBackend } from './checks/backend.mjs';
import { runDatabase } from './checks/database.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const args = { scope: 'all', out: 'qa-report.md', failOn: 'critical', quiet: false };
  for (const a of argv) {
    if (a === '--quiet' || a === '-q') args.quiet = true;
    else if (a.startsWith('--scope=')) args.scope = a.slice(8);
    else if (a.startsWith('--out=')) args.out = a.slice(6);
    else if (a.startsWith('--fail-on=')) args.failOn = a.slice(10);
  }
  return args;
}

function loadConfig() {
  const cfgPath = path.join(ROOT, 'qa-agent.config.json');
  if (fs.existsSync(cfgPath)) {
    try {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch (e) {
      console.error(`⚠️  Could not parse qa-agent.config.json: ${e.message}`);
    }
  }
  return {};
}

function isoNow() {
  // Local timestamp without external deps.
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();

  const requested = args.scope === 'all'
    ? ['frontend', 'backend', 'database']
    : args.scope.split(',').map((s) => s.trim()).filter(Boolean);

  const valid = new Set(['frontend', 'backend', 'database']);
  const scopes = requested.filter((s) => valid.has(s));
  if (scopes.length === 0) {
    console.error(`No valid scope in "${args.scope}". Use: frontend, backend, database, all (comma-separated).`);
    process.exit(2);
  }

  const log = (...m) => { if (!args.quiet) console.log(...m); };
  const notes = [];
  const findings = [];

  log(`🧪 QA Agent — scope: ${scopes.join(', ')}`);

  if (scopes.includes('frontend')) {
    log('  • Frontend (ESLint + tsc + heuristics)...');
    findings.push(...runFrontend(config, ROOT, notes));
  }
  if (scopes.includes('backend')) {
    log('  • Backend (edge functions)...');
    findings.push(...runBackend(config, ROOT, notes));
  }
  if (scopes.includes('database')) {
    log('  • Database (migrations)...');
    findings.push(...runDatabase(config, ROOT, notes));
  }

  const report = buildReport(findings, { timestamp: isoNow(), scopes, root: ROOT, notes });
  const outPath = path.isAbsolute(args.out) ? args.out : path.join(ROOT, args.out);
  fs.writeFileSync(outPath, report, 'utf8');

  const counts = { critical: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity]++;

  log('');
  log(`  🔴 ${counts.critical}  🟡 ${counts.medium}  🔵 ${counts.low}   (total ${findings.length})`);
  log(`  📄 Report written to ${path.relative(ROOT, outPath).split(path.sep).join('/')}`);
  for (const n of notes) log(`  ${n}`);

  // CI gate.
  const threshold = SEVERITY_RANK[args.failOn] ?? SEVERITY_RANK.critical;
  if (threshold > 0) {
    const offending = findings.some((f) => SEVERITY_RANK[f.severity] >= threshold);
    if (offending) {
      log(`\n❌ Failing: found issues at or above "${args.failOn}".`);
      process.exit(1);
    }
  }
  log('\n✅ Passed gate.');
  process.exit(0);
}

main().catch((e) => {
  console.error('QA Agent crashed:', e);
  process.exit(2);
});
