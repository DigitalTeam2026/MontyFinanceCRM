import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const REPORT_FILE = path.join(ROOT, 'qa-report.md');
const FIXED_FILE = path.join(ROOT, 'fix-qa-report.md');

// Read QA report
if (!fs.existsSync(REPORT_FILE)) {
  console.error('❌ qa-report.md not found. Run the QA agent first.');
  process.exit(1);
}

const content = fs.readFileSync(REPORT_FILE, 'utf8');
const lines = content.split('\n');

const fixedLines = lines.map(line => {
  // Simple auto-fixes examples:
  // 1. Remove leftover console.log warnings in frontend
  if (line.includes('console.log left in source')) {
    return line + ' ✅ Suggestion: Remove console.log statement.';
  }
  // 2. Replace wildcard CORS
  if (line.includes('CORS allows any origin (`*`)')) {
    return line + ' ✅ Suggestion: Restrict Access-Control-Allow-Origin to known domains.';
  }
  // 3. Hardcoded secret
  if (line.includes('hardcoded credential') || line.includes('JWT') || line.includes('Stripe secret key')) {
    return line + ' ✅ Suggestion: Move secret to environment variable.';
  }
  // 4. Missing FK index
  if (line.includes('Foreign key') && line.includes('has no covering index')) {
    return line + ' ✅ Suggestion: CREATE INDEX to improve performance.';
  }
  // 5. Generic placeholder
  return line;
});

// Save fixed report
fs.writeFileSync(FIXED_FILE, fixedLines.join('\n'), 'utf8');
console.log(`✅ Fixed suggestions added to ${FIXED_FILE}`);