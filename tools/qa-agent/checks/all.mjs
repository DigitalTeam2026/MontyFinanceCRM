import path from 'node:path';
import { runBackend } from './checks/backend.mjs';
import { runFrontend } from './checks/frontend.mjs';
import { runDatabase } from './checks/database.mjs';
import fs from 'node:fs';

const ROOT = path.resolve('.');
const notes = [];
let report = '# QA Report\n\n';

// Backend
report += '## Backend Findings\n';
const backendFindings = runBackend({}, ROOT, notes);
if (!backendFindings.length) report += '- No issues found\n';
else backendFindings.forEach(f => {
  report += `- ${f.file} [Line ${f.line}]: ${f.message} (Severity: ${f.severity})\n`;
});

// Frontend
report += '\n## Frontend Findings\n';
const frontendFindings = runFrontend({}, ROOT, notes);
if (!frontendFindings.length) report += '- No issues found\n';
else frontendFindings.forEach(f => {
  report += `- ${f.file} [Line ${f.line}]: ${f.message} (Severity: ${f.severity})\n`;
});

// Database
report += '\n## Database Findings\n';
const dbFindings = runDatabase({}, ROOT, notes);
if (!dbFindings.length) report += '- No issues found\n';
else dbFindings.forEach(f => {
  report += `- ${f.file} [Line ${f.line}]: ${f.message} (Severity: ${f.severity})\n`;
});

const reportFile = path.join(ROOT, 'qa-report.md');
fs.writeFileSync(reportFile, report, 'utf8');
console.log(`QA report generated: ${reportFile}`);