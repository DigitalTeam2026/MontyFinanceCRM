// Shared primitives for the QA agent — dependency-free.
import fs from 'node:fs';
import path from 'node:path';

export const SEVERITY = ['critical', 'medium', 'low'];
export const SEVERITY_RANK = { critical: 3, medium: 2, low: 1, none: 0 };

/**
 * Create a normalized finding. Every check emits these.
 * @param {{severity:'critical'|'medium'|'low', scope:string, rule:string,
 *          message:string, file?:string, line?:number, suggestion?:string}} f
 */
export function finding(f) {
  return {
    severity: f.severity,
    scope: f.scope,
    rule: f.rule,
    message: f.message,
    file: f.file ?? null,
    line: f.line ?? null,
    suggestion: f.suggestion ?? null,
  };
}

/** Recursively collect files with the given extensions, skipping ignored dirs. */
export function walk(dir, exts, ignore = []) {
  const out = [];
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', ...ignore]);
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (!skip.has(e.name)) stack.push(full);
      } else if (exts.some((x) => e.name.endsWith(x))) {
        out.push(full);
      }
    }
  }
  return out;
}

export function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** 1-based line number for a character offset in text. */
export function lineOf(text, index) {
  if (index < 0) return 1;
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

/** Display path relative to the repo root, using forward slashes. */
export function rel(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

/** Strip SQL comments (-- line and /* block *​/) but preserve length via spaces
 *  so character offsets still map to original line numbers. */
export function stripSqlComments(sql) {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') { out += ' '; i++; }
    } else if (sql[i] === '/' && sql[i + 1] === '*') {
      out += '  '; i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) { out += sql[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2;
    } else {
      out += sql[i]; i++;
    }
  }
  return out;
}

/**
 * Split SQL into top-level statements, respecting dollar-quoted bodies
 * ($$ ... $$ / $tag$ ... $tag$) and single-quoted string literals so we
 * never split inside a function definition.
 * @returns {{sql:string, start:number}[]}
 */
export function splitSqlStatements(sql) {
  const stmts = [];
  let i = 0;
  const n = sql.length;
  let start = 0;
  let inSingle = false;
  let dollarTag = null;
  while (i < n) {
    const ch = sql[i];
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) { i += dollarTag.length; dollarTag = null; continue; }
      i++; continue;
    }
    if (inSingle) {
      if (ch === "'") inSingle = false;
      i++; continue;
    }
    if (ch === "'") { inSingle = true; i++; continue; }
    if (ch === '$') {
      const m = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (m) { dollarTag = m[0]; i += dollarTag.length; continue; }
    }
    if (ch === ';') {
      const text = sql.slice(start, i);
      if (text.trim()) stmts.push({ sql: text, start });
      i++; start = i; continue;
    }
    i++;
  }
  const tail = sql.slice(start);
  if (tail.trim()) stmts.push({ sql: tail, start });
  return stmts;
}

/** Extract the balanced (...) body starting at/after `fromIndex`. */
export function balancedParens(text, fromIndex) {
  const open = text.indexOf('(', fromIndex);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') { depth--; if (depth === 0) return { body: text.slice(open + 1, i), open, close: i }; }
  }
  return null;
}
