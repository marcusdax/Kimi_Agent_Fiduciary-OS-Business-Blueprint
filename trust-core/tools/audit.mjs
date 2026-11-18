#!/usr/bin/env node
/**
 * audit.mjs — static safety checks for a trust-critical codebase.
 *
 * Not a linter. These are the specific hazards that would undermine the product's
 * claims if they appeared in the source, and each rule exists because the failure would
 * be silent:
 *
 * | Rule | Why it matters here |
 * |---|---|
 * | no `innerHTML`/`outerHTML` | a provider string becoming markup is an XSS on the one screen that shows licensed data |
 * | no `eval`/`new Function` | the formula sandbox exists precisely so partner code is never executed |
 * | no `child_process` | the service must not be able to spawn anything |
 * | no hardcoded key or password | a checked-in key is permanent, and repository history is forever |
 * | no `console.log` in `src/` | logs are structured and single-line; stray output leaks payloads |
 * | every source module opens with a doc comment | the "why" is the deliverable; an undocumented module is a regression |
 *
 * The rule engine is exported so it can be tested against planted violations. An audit
 * that has never caught anything is not evidence of anything.
 *
 *   node tools/audit.mjs           # human output, non-zero exit on findings
 *   node tools/audit.mjs --json
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export const RULES = [
  {
    id: 'dom-html-injection',
    pattern: /\.(inner|outer)HTML\s*=/g,
    files: /\.(js|ts)$/,
    message: 'assigning to innerHTML/outerHTML can turn provider data into markup',
  },
  {
    id: 'dynamic-code-execution',
    pattern: /\b(eval|new Function)\s*\(/g,
    files: /\.(js|ts)$/,
    message: 'dynamic code execution bypasses the declarative formula sandbox',
  },
  {
    id: 'process-spawn',
    pattern: /from\s+['"]node:child_process['"]/g,
    files: /\.(js|ts)$/,
    message: 'the service must not be able to spawn processes',
  },
  {
    id: 'hardcoded-secret',
    pattern: /(BEGIN [A-Z ]*PRIVATE KEY|password\s*[:=]\s*['"][^'"]{6,}['"])/g,
    files: /\.(js|ts|json|html)$/,
    message: 'key material or a password must come from the environment, never the repository',
  },
  {
    id: 'stray-console',
    pattern: /\bconsole\.(log|debug|info)\s*\(/g,
    files: /\.(js|ts)$/,
    message: 'use the structured single-line logger; console output is unstructured and leaks payloads',
  },
  {
    id: 'unfinished-marker',
    pattern: /\b(TODO|FIXME|XXX)\b/g,
    files: /\.(js|ts)$/,
    message: 'an unfinished marker in a shipped module is a claim the code does not keep',
  },
];

/** Files exempt from the "must be documented" rule, and why. */
const DOC_EXEMPT = [/\.d\.ts$/, /^src\/data\//];

/** Apply every rule to one file's text. */
export function findViolations(rel, text, { checkDoc = true } = {}) {
  const found = [];
  const lineOf = (index) => text.slice(0, index).split('\n').length;

  for (const rule of RULES) {
    if (!rule.files.test(rel)) continue;
    // Only the shipped source tree is audited, regardless of where the text came from.
    if (!rel.startsWith('src/')) continue;
    if (rel.endsWith('.d.ts') && rule.id !== 'hardcoded-secret') continue;
    for (const match of text.matchAll(rule.pattern)) {
      const index = match.index ?? 0;
      found.push({
        rule: rule.id,
        file: rel,
        line: lineOf(index),
        message: rule.message,
        excerpt: text.slice(index, index + 60).split('\n')[0],
      });
    }
  }

  const isSourceModule =
    rel.startsWith('src/') && /\.ts$/.test(rel) && !rel.endsWith('.d.ts') && !DOC_EXEMPT.some((re) => re.test(rel));
  if (checkDoc && isSourceModule && !text.trimStart().startsWith('/**')) {
    found.push({
      rule: 'undocumented-module',
      file: rel,
      line: 1,
      message: 'a module that does not explain why it exists will drift',
      excerpt: text.trimStart().slice(0, 60).split('\n')[0],
    });
  }
  return found;
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

export async function auditTree(rootDir = ROOT) {
  const files = [];
  const findings = [];
  for await (const file of walk(join(rootDir, 'src'))) {
    const rel = relative(rootDir, file).replace(/\\/g, '/');
    files.push(rel);
    const text = await readFile(file, 'utf8');
    findings.push(...findViolations(rel, text));
  }
  return { checked: files.length, files, findings };
}

const invokedDirectly = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const { checked, findings } = await auditTree();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ checked, findings }, null, 2)}\n`);
  } else {
    console.log(`audited ${checked} files under src/`);
    if (findings.length === 0) console.log('no findings');
    else {
      for (const f of findings) {
        console.log(`${f.file}:${f.line}  [${f.rule}]  ${f.message}`);
        console.log(`    ${f.excerpt}`);
      }
      console.log(`\n${findings.length} finding(s)`);
    }
  }
  process.exitCode = findings.length === 0 ? 0 : 1;
}
