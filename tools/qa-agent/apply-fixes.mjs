import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const REPORT_FILE = path.join(ROOT, 'qa-report.md');

if (!fs.existsSync(REPORT_FILE)) {
  console.error('❌ qa-report.md not found. Run the QA agent first.');
  process.exit(1);
}

const report = fs.readFileSync(REPORT_FILE, 'utf8');
const lines = report.split('\n');

for (const line of lines) {
  // Example: Fix frontend console.log
  if (line.includes('console.log left in source')) {
    const match = line.match(/- (.+) \[Line (\d+)\]/);
    if (match) {
      const [_, filePath, lineNumber] = match;
      const absPath = path.join(ROOT, filePath);
      if (fs.existsSync(absPath)) {
        const content = fs.readFileSync(absPath, 'utf8').split('\n');
        content[Number(lineNumber) - 1] = ''; // Remove the console.log line
        fs.writeFileSync(absPath, content.join('\n'), 'utf8');
        console.log(`✅ Removed console.log in ${filePath} line ${lineNumber}`);
      }
    }
  }

  // Example: Fix CORS wildcard in backend
  if (line.includes('CORS allows any origin')) {
    const match = line.match(/- (.+) \[Line (\d+)\]/);
    if (match) {
      const [_, filePath, lineNumber] = match;
      const absPath = path.join(ROOT, filePath);
      if (fs.existsSync(absPath)) {
        let content = fs.readFileSync(absPath, 'utf8').split('\n');
        content[Number(lineNumber) - 1] = content[Number(lineNumber) - 1].replace('*', 'process.env.ALLOWED_ORIGIN || "*"');
        fs.writeFileSync(absPath, content.join('\n'), 'utf8');
        console.log(`✅ Updated CORS in ${filePath} line ${lineNumber}`);
      }
    }
  }

  // Add more fix rules here: move secrets to env, generate FK indexes, etc.
}

console.log('✅ All automatic fixes applied where possible.');