// Database scanner: static analysis of Supabase SQL migrations.
// Aggregates state across ALL migration files so things fixed in a later
// migration are not reported as still-broken.
import path from 'node:path';
import {
  finding, walk, readText, lineOf, rel,
  stripSqlComments, splitSqlStatements, balancedParens,
} from '../lib/core.mjs';

const clean = (s) => s.replace(/["'`]/g, '').trim().toLowerCase();

export function runDatabase(config, root, _notes) {
  const includeDirs = config.database?.include ?? ['supabase/migrations'];
  const files = includeDirs.flatMap((d) => walk(path.join(root, d), ['.sql']));

  // Aggregate state across all migrations.
  const tables = new Map();      // table -> {file, line}
  const rlsEnabled = new Set();  // table
  const indexes = [];            // {table, firstCol}
  const fks = [];                // {table, column, file, line}
  const policyFindings = [];     // emitted inline

  for (const file of files) {
    const raw = readText(file);
    const sql = stripSqlComments(raw);
    const display = rel(root, file);
    const statements = splitSqlStatements(sql);

    for (const { sql: stmt, start } of statements) {
      const s = stmt.trim();
      // Point at the first non-whitespace char of the statement, not the
      // newline after the previous statement's semicolon.
      const line = lineOf(raw, start + (stmt.length - stmt.trimStart().length));

      // CREATE TABLE
      let m = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["'`]?(\w+)["'`]?/i.exec(s);
      if (m && /^create\s+table/i.test(s)) {
        const table = m[1].toLowerCase();
        if (!tables.has(table)) tables.set(table, { file: display, line });
        const bp = balancedParens(s, m.index);
        if (bp) {
          // Column-level + table-level FK references inside the body.
          for (const colLine of bp.body.split(',')) {
            const t = colLine.trim();
            // table-level: foreign key (col) references ...
            const fkM = /foreign\s+key\s*\(\s*["'`]?(\w+)["'`]?\s*\)/i.exec(t);
            if (fkM && /references/i.test(t)) {
              fks.push({ table, column: fkM[1].toLowerCase(), file: display, line });
              continue;
            }
            // column-level: <col> <type> ... references other(...)
            if (/\breferences\b/i.test(t)) {
              const colM = /^["'`]?(\w+)["'`]?\s/.exec(t);
              if (colM) fks.push({ table, column: colM[1].toLowerCase(), file: display, line });
            }
          }
        }
        continue;
      }

      // CREATE INDEX
      m = /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?[\s\S]*?\bon\s+(?:public\.)?["'`]?(\w+)["'`]?\s*(?:using\s+\w+\s*)?\(([^)]+)\)/i.exec(s);
      if (m && /^create\s+(unique\s+)?index/i.test(s)) {
        const table = m[1].toLowerCase();
        const firstCol = clean(m[2].split(',')[0]);
        indexes.push({ table, firstCol });
        continue;
      }

      // ALTER TABLE ... ENABLE ROW LEVEL SECURITY
      m = /alter\s+table\s+(?:public\.)?["'`]?(\w+)["'`]?[\s\S]*enable\s+row\s+level\s+security/i.exec(s);
      if (m) { rlsEnabled.add(m[1].toLowerCase()); continue; }

      // ALTER TABLE ... ADD ... FOREIGN KEY (col) REFERENCES
      if (/^alter\s+table/i.test(s) && /foreign\s+key/i.test(s)) {
        const tM = /alter\s+table\s+(?:public\.)?["'`]?(\w+)["'`]?/i.exec(s);
        const cM = /foreign\s+key\s*\(\s*["'`]?(\w+)["'`]?\s*\)/i.exec(s);
        if (tM && cM) fks.push({ table: tM[1].toLowerCase(), column: cM[1].toLowerCase(), file: display, line });
      }
      // ALTER TABLE ... ADD COLUMN <col> ... REFERENCES
      if (/^alter\s+table/i.test(s) && /add\s+column/i.test(s) && /references/i.test(s)) {
        const tM = /alter\s+table\s+(?:public\.)?["'`]?(\w+)["'`]?/i.exec(s);
        const cM = /add\s+column\s+(?:if\s+not\s+exists\s+)?["'`]?(\w+)["'`]?/i.exec(s);
        if (tM && cM) fks.push({ table: tM[1].toLowerCase(), column: cM[1].toLowerCase(), file: display, line });
      }

      // CREATE POLICY — check for over-permissive / perf issues.
      if (/^create\s+policy/i.test(s)) {
        const tM = /\bon\s+(?:public\.)?["'`]?(\w+)["'`]?/i.exec(s);
        const table = tM ? tM[1].toLowerCase() : '(unknown)';

        if (/using\s*\(\s*true\s*\)/i.test(s)) {
          policyFindings.push(finding({
            severity: /log|audit|history/i.test(table) ? 'critical' : 'medium',
            scope: 'database', rule: 'rls/permissive-policy',
            message: `Policy on \`${table}\` uses \`USING (true)\` — every row is exposed to anyone the policy applies to.`,
            file: display, line,
            suggestion: 'Scope the policy with an ownership/role predicate instead of `true`.',
          }));
        }
        if (/\bto\s+(anon|public)\b/i.test(s)) {
          policyFindings.push(finding({
            severity: 'critical', scope: 'database', rule: 'rls/anon-policy',
            message: `Policy on \`${table}\` grants access to \`anon\`/\`public\`.`,
            file: display, line,
            suggestion: 'Require the `authenticated` role unless anonymous access is intentional.',
          }));
        }
        // auth.uid() not wrapped in a subselect → re-evaluated per row (perf).
        if (/auth\.uid\(\)/i.test(s) && !/\(\s*select\s+auth\.uid\(\)/i.test(s)) {
          policyFindings.push(finding({
            severity: 'low', scope: 'database', rule: 'rls/auth-uid-perf',
            message: `Policy on \`${table}\` calls \`auth.uid()\` directly; Postgres re-evaluates it per row.`,
            file: display, line,
            suggestion: 'Wrap as `(select auth.uid())` so the planner caches it (InitPlan).',
          }));
        }
      }
    }
  }

  const findings = [...policyFindings];

  // Missing FK indexes (dedup by table+column).
  const seenFk = new Set();
  for (const fk of fks) {
    const key = `${fk.table}.${fk.column}`;
    if (seenFk.has(key)) continue;
    seenFk.add(key);
    const covered = indexes.some((ix) => ix.table === fk.table && ix.firstCol === fk.column);
    if (!covered) {
      findings.push(finding({
        severity: 'medium', scope: 'database', rule: 'index/missing-fk-index',
        message: `Foreign key \`${fk.table}.${fk.column}\` has no covering index — joins and cascade deletes will seq-scan.`,
        file: fk.file, line: fk.line,
        suggestion: `CREATE INDEX ON ${fk.table} (${fk.column});`,
      }));
    }
  }

  // Tables without RLS enabled anywhere.
  for (const [table, loc] of tables) {
    if (!rlsEnabled.has(table)) {
      findings.push(finding({
        severity: 'critical', scope: 'database', rule: 'rls/not-enabled',
        message: `Table \`${table}\` never has ROW LEVEL SECURITY enabled across migrations — it may be world-readable via the API.`,
        file: loc.file, line: loc.line,
        suggestion: `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; and add policies.`,
      }));
    }
  }

  return findings;
}
