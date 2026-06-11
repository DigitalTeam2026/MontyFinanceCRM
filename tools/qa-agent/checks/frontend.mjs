// Frontend scanner: ESLint + tsc + lightweight React heuristics.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { finding, walk, readText, lineOf, rel } from '../lib/core.mjs';

function runNodeBin(root, binRelPath, args) {
  const bin = path.join(root, binRelPath);
  if (!fs.existsSync(bin)) return { missing: true, status: -1, stdout: '', stderr: '' };
  const res = spawnSync(process.execPath, [bin, ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return {
    missing: false,
    status: res.status ?? -1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
}

// ── ESLint ────────────────────────────────────────────────────────────────────
function runEslint(root, notes) {
  const out = runNodeBin(root, 'node_modules/eslint/bin/eslint.js', ['.', '-f', 'json']);
  if (out.missing) {
    notes.push('⚠️ ESLint binary not found — run `npm install` to enable lint checks.');
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(out.stdout || '[]');
  } catch {
    notes.push('⚠️ Could not parse ESLint JSON output; lint results skipped.');
    return [];
  }
  const findings = [];
  for (const fileResult of parsed) {
    const file = rel(root, fileResult.filePath);
    for (const m of fileResult.messages ?? []) {
      const ruleId = m.ruleId ?? 'syntax';
      // Hooks violations break at runtime → critical.
      const isHooksRule = ruleId.startsWith('react-hooks/rules-of-hooks');
      const isFatal = m.fatal === true;
      let severity;
      if (isHooksRule || isFatal) severity = 'critical';
      else if (m.severity === 2) severity = 'medium';
      else severity = 'low';
      findings.push(finding({
        severity,
        scope: 'frontend',
        rule: `eslint/${ruleId}`,
        message: m.message,
        file,
        line: m.line ?? null,
        suggestion: isHooksRule
          ? 'Hooks must be called unconditionally at the top level of a component/hook.'
          : (m.severity === 2 ? 'Fix this ESLint error.' : 'Consider addressing this ESLint warning.'),
      }));
    }
  }
  return findings;
}

// ── TypeScript ─────────────────────────────────────────────────────────────────
function runTsc(root, notes) {
  const args = ['--noEmit', '--pretty', 'false'];
  // Prefer the app tsconfig if present.
  if (fs.existsSync(path.join(root, 'tsconfig.app.json'))) {
    args.push('-p', 'tsconfig.app.json');
  }
  const out = runNodeBin(root, 'node_modules/typescript/bin/tsc', args);
  if (out.missing) {
    notes.push('⚠️ TypeScript binary not found — run `npm install` to enable type checks.');
    return [];
  }
  const findings = [];
  const text = out.stdout + '\n' + out.stderr;
  // Lines look like: src/foo.tsx(12,5): error TS2322: Message...
  const re = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const [, file, line, , code, msg] = m;
    findings.push(finding({
      severity: 'critical',
      scope: 'frontend',
      rule: `tsc/${code}`,
      message: msg.trim(),
      file: file.split(path.sep).join('/'),
      line: Number(line),
      suggestion: 'Resolve this type error — it indicates a type mismatch, missing prop, or bad import.',
    }));
  }
  return findings;
}

// ── Heuristics (catch things lint config doesn't flag) ──────────────────────────
function runHeuristics(root, includeDirs) {
  const findings = [];
  const files = includeDirs.flatMap((d) => walk(path.join(root, d), ['.ts', '.tsx']));
  for (const file of files) {
    const text = readText(file);
    const display = rel(root, file);

    // dangerouslySetInnerHTML — XSS risk
    for (const m of text.matchAll(/dangerouslySetInnerHTML/g)) {
      findings.push(finding({
        severity: 'medium', scope: 'frontend', rule: 'security/dangerous-html',
        message: 'Use of dangerouslySetInnerHTML can introduce XSS if the content is not sanitized.',
        file: display, line: lineOf(text, m.index),
        suggestion: 'Render text directly or sanitize the HTML (e.g., DOMPurify) before injecting.',
      }));
    }

    // Leftover console.log
    for (const m of text.matchAll(/console\.log\s*\(/g)) {
      findings.push(finding({
        severity: 'low', scope: 'frontend', rule: 'cleanup/console-log',
        message: 'console.log left in source.',
        file: display, line: lineOf(text, m.index),
        suggestion: 'Remove debug logging or gate it behind a debug flag.',
      }));
    }

    // Explicit any
    for (const m of text.matchAll(/:\s*any(\b|\[)/g)) {
      findings.push(finding({
        severity: 'low', scope: 'frontend', rule: 'types/explicit-any',
        message: 'Explicit `any` weakens type safety.',
        file: display, line: lineOf(text, m.index),
        suggestion: 'Replace `any` with a concrete type or `unknown` + narrowing.',
      }));
    }

    // TODO / FIXME markers
    for (const m of text.matchAll(/\/\/\s*(TODO|FIXME|HACK|XXX)\b/g)) {
      findings.push(finding({
        severity: 'low', scope: 'frontend', rule: 'cleanup/todo-marker',
        message: `Unresolved ${m[1]} marker.`,
        file: display, line: lineOf(text, m.index),
        suggestion: 'Resolve or track this in an issue.',
      }));
    }
  }
  return findings;
}

export function runFrontend(config, root, notes) {
  const includeDirs = config.frontend?.include ?? ['src'];
  const findings = [];
  findings.push(...runTsc(root, notes));
  findings.push(...runEslint(root, notes));
  findings.push(...runHeuristics(root, includeDirs));
  return findings;
}
