// Backend scanner: Supabase Edge Functions (Deno). Heuristic static analysis.
import path from 'node:path';
import { finding, walk, readText, lineOf, rel } from '../lib/core.mjs';

export function runBackend(config, root, _notes) {
  const includeDirs = config.backend?.include ?? ['supabase/functions'];
  const findings = [];
  const files = includeDirs.flatMap((d) => walk(path.join(root, d), ['.ts', '.js']));

  for (const file of files) {
    const text = readText(file);
    const display = rel(root, file);
    const lower = text.toLowerCase();

    const hasServe = /Deno\.serve\s*\(|\bserve\s*\(/.test(text);

    // 1. Missing top-level error handling in a request handler → critical.
    if (hasServe && !/\btry\s*\{/.test(text)) {
      const idx = text.search(/Deno\.serve\s*\(|\bserve\s*\(/);
      findings.push(finding({
        severity: 'critical', scope: 'backend', rule: 'reliability/no-try-catch',
        message: 'Request handler has no try/catch — an unhandled exception returns an opaque 500 and may leak a stack trace.',
        file: display, line: lineOf(text, idx),
        suggestion: 'Wrap the handler body in try/catch and return a sanitized error response.',
      }));
    }

    // 2. Service-role key used without verifying the caller → critical security.
    const usesServiceRole = /SERVICE_ROLE_KEY/.test(text);
    const verifiesCaller = /auth\.getuser|get_is_system_admin|is_system_admin|authorization|verify(jwt|_jwt)|getuser\(/i.test(lower);
    if (usesServiceRole && !verifiesCaller) {
      const idx = text.search(/SERVICE_ROLE_KEY/);
      findings.push(finding({
        severity: 'critical', scope: 'backend', rule: 'security/unverified-service-role',
        message: 'Function uses the service-role key (bypasses RLS) without verifying the caller’s identity/permissions.',
        file: display, line: lineOf(text, idx),
        suggestion: 'Validate the Authorization JWT (auth.getUser) and check authorization before using the service-role client.',
      }));
    }

    // 3. CORS: missing OPTIONS preflight handling.
    if (hasServe && !/OPTIONS/.test(text)) {
      findings.push(finding({
        severity: 'medium', scope: 'backend', rule: 'cors/no-preflight',
        message: 'No OPTIONS preflight handling found — browser CORS requests may fail.',
        file: display, line: 1,
        suggestion: 'Return CORS headers for `req.method === "OPTIONS"`.',
      }));
    }

    // 4. Wide-open CORS origin.
    for (const m of text.matchAll(/Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/g)) {
      findings.push(finding({
        severity: 'low', scope: 'backend', rule: 'cors/wildcard-origin',
        message: 'CORS allows any origin (`*`).',
        file: display, line: lineOf(text, m.index),
        suggestion: 'Restrict Access-Control-Allow-Origin to known origins where possible.',
      }));
    }

    // 5. Potential hardcoded secrets / tokens.
    const secretPatterns = [
      [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, 'a JWT'],
      [/sk_(live|test)_[A-Za-z0-9]{10,}/g, 'a Stripe secret key'],
      [/(api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"'\s]{8,}["']/gi, 'a hardcoded credential'],
    ];
    for (const [re, what] of secretPatterns) {
      for (const m of text.matchAll(re)) {
        // Allow obvious env reads / placeholders.
        if (/Deno\.env\.get/.test(m[0])) continue;
        findings.push(finding({
          severity: 'critical', scope: 'backend', rule: 'security/hardcoded-secret',
          message: `Possible ${what} hardcoded in source.`,
          file: display, line: lineOf(text, m.index),
          suggestion: 'Move secrets to environment variables (Deno.env.get) / Supabase secrets.',
        }));
      }
    }

    // 6. Input read but no validation path (no 4xx returned).
    if (/await\s+req\.json\(\)/.test(text) && !/\b4\d\d\b/.test(text)) {
      const idx = text.search(/await\s+req\.json\(\)/);
      findings.push(finding({
        severity: 'medium', scope: 'backend', rule: 'validation/no-input-validation',
        message: 'Request body is parsed but the function never returns a 4xx — inputs may be unvalidated.',
        file: display, line: lineOf(text, idx),
        suggestion: 'Validate required fields and return 400 on bad input.',
      }));
    }

    // 7. Deprecated std/http serve import.
    for (const m of text.matchAll(/from\s+["']https:\/\/deno\.land\/std[^"']*\/http\/server\.ts["']/g)) {
      findings.push(finding({
        severity: 'low', scope: 'backend', rule: 'deprecation/std-serve',
        message: 'Imports the deprecated std/http `serve` — prefer the built-in `Deno.serve`.',
        file: display, line: lineOf(text, m.index),
        suggestion: 'Replace with `Deno.serve(handler)`.',
      }));
    }

    // 8. Explicit any.
    for (const m of text.matchAll(/:\s*any(\b|\[)/g)) {
      findings.push(finding({
        severity: 'low', scope: 'backend', rule: 'types/explicit-any',
        message: 'Explicit `any` weakens type safety.',
        file: display, line: lineOf(text, m.index),
        suggestion: 'Use a concrete type or `unknown` with narrowing.',
      }));
    }
  }
  return findings;
}
