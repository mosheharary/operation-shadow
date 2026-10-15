/**
 * Scans the built browser bundle (apps/web/.next/static) for server secrets: the values of the
 * secret environment variables in this process, and Google API key patterns. Prints only file
 * names and which secret matched, never a value. Exit code 1 on any finding.
 *
 *   make scan-bundle      (builds first)
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('apps/web/.next/static');
const SECRET_VARS = ['GOOGLE_API_KEY', 'BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_SECRET', 'DEV_LOGIN_PASSWORD', 'DATABASE_URL', 'DATABASE_URL_UNPOOLED'];
const PATTERNS: [string, RegExp][] = [
  ['Google API key pattern', /AIza[0-9A-Za-z_-]{35}/],
  ['Postgres URL with password', /postgres(?:ql)?:\/\/[^:\s"']+:[^@\s"']+@/],
];

async function* files(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else yield full;
  }
}

const secrets = SECRET_VARS.flatMap((name) => {
  const value = (process.env[name] ?? '').trim();
  return value.length >= 8 ? [[name, value] as const] : [];
});

let scanned = 0;
const findings: string[] = [];
for await (const file of files(ROOT)) {
  scanned += 1;
  const text = await readFile(file, 'utf8');
  const rel = path.relative(ROOT, file);
  for (const [name, value] of secrets) if (text.includes(value)) findings.push(`${rel}: contains the value of ${name}`);
  for (const [name, re] of PATTERNS) if (re.test(text)) findings.push(`${rel}: matches ${name}`);
}

console.log(`[scan-bundle] ${scanned} files scanned; checked ${secrets.length} secret values and ${PATTERNS.length} patterns`);
if (findings.length > 0) {
  console.error(`[scan-bundle] FOUND ${findings.length} problem(s):\n${findings.join('\n')}`);
  process.exit(1);
}
console.log('[scan-bundle] no secrets found in the client bundle');
