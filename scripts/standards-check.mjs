// scripts/standards-check.mjs — heuristic engineering-standards checks.
// See docs/autonomous/ENGINEERING_STANDARDS.md for the full standard.
// This is AST-light (regex) by design: it catches common violations;
// determined evasion is a code-review problem, not a tooling problem.
//
// Checks (fail = exit 1):
//   1. module boundaries: app/ must not import supabase/functions;
//      lib/ must not import from app/
//   2. edge-function error shape: handlers should return { error: { code } }
//   3. privacy: no console.log with sensitive keywords on the same line
// Advisories (warn only):
//   A. PR touches migrations/_shared without an ADR update
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = join(import.meta.dirname, '..');
let failures = 0;
let warnings = 0;
const fail = (m) => { failures++; console.error(`  ✗ ${m}`); };
const warn = (m) => { warnings++; console.log(`  ! ${m}`); };
const pass = (m) => console.log(`  ✓ ${m}`);

function walk(dir, exts) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      out.push(...walk(p, exts));
    } else if (exts.some((x) => e.name.endsWith(x))) {
      out.push(p);
    }
  }
  return out;
}

console.log('── 1. module boundaries');
{
  const appFiles = existsSync(join(ROOT, 'apps/mobile/src/app'))
    ? walk(join(ROOT, 'apps/mobile/src/app'), ['.ts', '.tsx']) : [];
  const badApp = appFiles.filter((f) => /from\s+['"]\.\.?\/.*supabase\/functions|supabase\/functions/.test(readFileSync(f, 'utf8')));
  badApp.length === 0 ? pass('app/ does not import supabase/functions') : fail(`app/ imports server code: ${badApp.map((f) => relative(ROOT, f)).join(', ')}`);

  const libFiles = existsSync(join(ROOT, 'apps/mobile/src/lib'))
    ? walk(join(ROOT, 'apps/mobile/src/lib'), ['.ts', '.tsx']) : [];
  const badLib = libFiles.filter((f) => /from\s+['"]\.\.\/app\//.test(readFileSync(f, 'utf8')));
  badLib.length === 0 ? pass('lib/ does not import from app/') : fail(`lib/ imports from app/: ${badLib.map((f) => relative(ROOT, f)).join(', ')}`);
}

console.log('── 2. edge-function error envelope');
{
  const fnDirs = existsSync(join(ROOT, 'supabase/functions'))
    ? readdirSync(join(ROOT, 'supabase/functions'), { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.')).map((e) => e.name) : [];
  // Convention (see ENGINEERING_STANDARDS.md §4): failures return
  // `{ error: <string> }` with an appropriate HTTP status. This check
  // verifies the envelope is used (not raw throws / HTML errors).
  const missing = [];
  for (const d of fnDirs) {
    const idx = join(ROOT, 'supabase/functions', d, 'index.ts');
    if (!existsSync(idx)) continue;
    const src = readFileSync(idx, 'utf8');
    if (!/\{\s*[^}]*error:/.test(src)) missing.push(d);
  }
  missing.length === 0 ? pass(`${fnDirs.length} functions return { error: … } envelope`) : fail(`functions missing error envelope: ${missing.join(', ')}`);
}

console.log('── 3. privacy-safe logging heuristic');
{
  const files = [
    ...walk(join(ROOT, 'apps/mobile/src'), ['.ts', '.tsx']),
    ...walk(join(ROOT, 'supabase/functions'), ['.ts']),
    ...walk(join(ROOT, 'packages'), ['.ts']),
  ];
  const hits = [];
  // High-confidence sensitive tokens. 'ghost' intentionally excluded:
  // 'ghost voice cleanup' style operational messages are false positives;
  // actual ghost-word handling is reviewed manually.
  const kw = /secret_code|password|refresh_token|access_token|magic[_-]?link.*token|transcript\s*[:,=]/i;
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((ln, i) => {
      if (/console\.(log|warn|error|info)\(/.test(ln) && kw.test(ln) && !/sanitiz|redact|\*\*\*/.test(ln)) {
        hits.push(`${relative(ROOT, f)}:${i + 1}`);
      }
    });
  }
  hits.length === 0 ? pass('no console.* with sensitive keywords') : fail(`sensitive console logging: ${hits.slice(0, 10).join(', ')}${hits.length > 10 ? ` (+${hits.length - 10} more)` : ''}`);
}

console.log('── A. ADR advisory (non-blocking)');
{
  try {
    const changed = execSync('git diff --name-only HEAD~1 HEAD 2>/dev/null || git status --porcelain', { cwd: ROOT, encoding: 'utf8' });
    const touchesInfra = /supabase\/migrations\/|supabase\/functions\/_shared\//.test(changed);
    const touchesAdr = /docs\/autonomous\/adr\//.test(changed);
    if (touchesInfra && !touchesAdr) warn('PR touches migrations/_shared without an ADR update — consider documenting the decision');
    else pass('ADR coverage ok (or no infra changes)');
  } catch {
    warn('could not determine changed files; skipping ADR check');
  }
}

console.log(failures === 0 ? `\n✅ standards-check: PASS (${warnings} warnings)` : `\n❌ standards-check: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
