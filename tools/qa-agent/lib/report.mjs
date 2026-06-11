// Markdown report renderer.
import { SEVERITY } from './core.mjs';

const LABEL = {
  critical: '🔴 Critical',
  medium: '🟡 Medium',
  low: '🔵 Low',
};

const SCOPE_LABEL = {
  frontend: 'Frontend',
  backend: 'Backend (Edge Functions)',
  database: 'Database',
};

function loc(f) {
  if (!f.file) return '';
  return f.line ? `\`${f.file}\`:${f.line}` : `\`${f.file}\``;
}

export function buildReport(findings, meta) {
  const counts = { critical: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity]++;

  const byScope = { frontend: 0, backend: 0, database: 0 };
  for (const f of findings) if (byScope[f.scope] !== undefined) byScope[f.scope]++;

  const lines = [];
  lines.push('# 🧪 QA Agent Report');
  lines.push('');
  lines.push(`> Generated: ${meta.timestamp}  `);
  lines.push(`> Scope: \`${meta.scopes.join(', ')}\`  `);
  lines.push(`> Repo: \`${meta.root}\``);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('| --- | --- |');
  lines.push(`| 🔴 Critical | ${counts.critical} |`);
  lines.push(`| 🟡 Medium | ${counts.medium} |`);
  lines.push(`| 🔵 Low | ${counts.low} |`);
  lines.push(`| **Total** | **${findings.length}** |`);
  lines.push('');
  lines.push('| Area | Issues |');
  lines.push('| --- | --- |');
  for (const s of Object.keys(SCOPE_LABEL)) {
    if (meta.scopes.includes(s)) lines.push(`| ${SCOPE_LABEL[s]} | ${byScope[s]} |`);
  }
  lines.push('');

  if (meta.notes?.length) {
    lines.push('## Run Notes');
    lines.push('');
    for (const n of meta.notes) lines.push(`- ${n}`);
    lines.push('');
  }

  if (findings.length === 0) {
    lines.push('✅ **No issues detected.**');
    lines.push('');
    return lines.join('\n');
  }

  // Findings grouped by severity, then scope
  for (const sev of SEVERITY) {
    const group = findings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    lines.push(`## ${LABEL[sev]} (${group.length})`);
    lines.push('');

    for (const scope of Object.keys(SCOPE_LABEL)) {
      const sub = group.filter((f) => f.scope === scope);
      if (sub.length === 0) continue;
      lines.push(`### ${SCOPE_LABEL[scope]}`);
      lines.push('');
      // stable sort by file then line
      sub.sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0));
      for (const f of sub) {
        const where = loc(f);
        lines.push(`- **[${f.rule}]** ${f.message}`);
        if (where) lines.push(`  - 📍 ${where}`);
        if (f.suggestion) lines.push(`  - 💡 _${f.suggestion}_`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
