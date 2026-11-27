#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { run } from 'node:test';

const E2E_ROOT = import.meta.dirname;
const TESTS_DIR = path.join(E2E_ROOT, 'tests');
const REPORT_JSON_PATH = path.join(E2E_ROOT, 'e2e-report.json');
const SUMMARY_MD_PATH = path.join(E2E_ROOT, 'e2e-summary.md');

const TIER_DEFS = [
  { id: 'tier1', num: '1', label: 'Tier 1: Feature Coverage (F1-F18)', expectedCount: 18 },
  { id: 'tier2', num: '2', label: 'Tier 2: Boundary & Corner Cases', expectedCount: 4 },
  { id: 'tier3', num: '3', label: 'Tier 3: Cross-Feature Combinations', expectedCount: 7 },
  { id: 'tier4', num: '4', label: 'Tier 4: Real-World Scenarios', expectedCount: 6 },
];

function parseArgs(argv) {
  let tier = 'all';
  let checkOnly = false;
  for (const arg of argv) {
    if (arg === '--check') {
      checkOnly = true;
    } else if (arg.startsWith('--tier=')) {
      tier = arg.slice('--tier='.length).trim().toLowerCase();
    }
  }
  return { tier, checkOnly };
}

function listMjsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listMjsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
      out.push(full);
    }
  }
  return out.sort();
}

function getTierFiles(tierArg) {
  const selected =
    tierArg === 'all'
      ? TIER_DEFS
      : TIER_DEFS.filter((t) => t.num === tierArg || t.id === tierArg);

  if (selected.length === 0) {
    console.error(
      `Invalid --tier value "${tierArg}". Expected one of: all, 1, 2, 3, 4.`,
    );
    process.exit(2);
  }

  const files = [];
  for (const t of selected) {
    const dir = path.join(TESTS_DIR, t.id);
    const tierFiles = listMjsFiles(dir).filter((f) => f.endsWith('.test.mjs'));
    files.push(...tierFiles);
  }
  return files;
}

function tierForFile(filePath) {
  const rel = path.relative(TESTS_DIR, filePath || '').split(path.sep)[0];
  return TIER_DEFS.some((t) => t.id === rel) ? rel : 'unknown';
}

function extractFeatures(testName, filePath) {
  const found = new Set();
  const re = /\bF(1[0-8]|[1-9])\b/g;
  let match;
  while ((match = re.exec(testName || '')) !== null) {
    found.add(`F${match[1]}`);
  }
  if (found.size === 0 && filePath) {
    const base = path.basename(filePath);
    const fm = /^f0?([1-9]|1[0-8])-/.exec(base);
    if (fm) {
      found.add(`F${Number(fm[1])}`);
    }
  }
  return [...found];
}

function formatError(err) {
  if (!err) return 'Unknown failure';
  const cause = err.cause || err;
  const msg = cause.message || err.message || String(cause);
  return msg.replace(/\r?\n/g, ' ').trim();
}

async function runCheckMode() {
  const allMjs = [
    path.join(E2E_ROOT, 'run-e2e.mjs'),
    ...listMjsFiles(path.join(E2E_ROOT, 'lib')),
    ...listMjsFiles(TESTS_DIR),
  ];

  let errors = 0;

  // 1. Verify exact spec file counts per tier (35 total)
  let totalSpecs = 0;
  for (const t of TIER_DEFS) {
    const dir = path.join(TESTS_DIR, t.id);
    const specs = listMjsFiles(dir).filter((f) => f.endsWith('.test.mjs'));
    totalSpecs += specs.length;
    if (specs.length !== t.expectedCount) {
      console.error(
        `[check] ${t.id}: expected ${t.expectedCount} spec files, found ${specs.length}`,
      );
      errors++;
    }
  }

  // 2. Syntax-check every .mjs file with `node --check`
  for (const file of allMjs) {
    const res = spawnSync(process.execPath, ['--check', file], {
      encoding: 'utf8',
    });
    if (res.status !== 0) {
      console.error(
        `[check] Syntax error in ${path.relative(E2E_ROOT, file)}:\n${res.stderr}`,
      );
      errors++;
    }
  }

  // 3. Verify every relative import inside tests/ and lib/ resolves to an existing file
  const importRe = /^\s*import\s+[\s\S]*?\s+from\s+['"](\.[^'"]+)['"];?/gm;
  for (const file of allMjs) {
    const src = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = importRe.exec(src)) !== null) {
      const target = path.resolve(path.dirname(file), m[1]);
      if (!fs.existsSync(target)) {
        console.error(
          `[check] Broken import in ${path.relative(E2E_ROOT, file)}: "${m[1]}" -> ${target} does not exist`,
        );
        errors++;
      }
    }
  }

  // 4. Dynamically load all lib/*.mjs helpers to ensure zero runtime/export errors
  for (const libFile of listMjsFiles(path.join(E2E_ROOT, 'lib'))) {
    try {
      await import(libFile);
    } catch (err) {
      console.error(
        `[check] Failed to load helper ${path.relative(E2E_ROOT, libFile)}: ${err.message}`,
      );
      errors++;
    }
  }

  if (errors > 0) {
    console.error(`\nE2E check FAILED with ${errors} error(s).`);
    process.exit(1);
  }

  console.log(
    `E2E check PASSED: ${allMjs.length} .mjs files syntax-verified, ${totalSpecs}/35 spec files present, all imports and helpers loaded cleanly.`,
  );
  process.exit(0);
}

function buildSummaryMarkdown(report) {
  const lines = [];
  lines.push('# Fiduciary OS / AUCTUM.ATLAS — E2E Test Summary');
  lines.push('');
  lines.push(`- **Generated:** ${report.timestamp}`);
  lines.push(`- **Tier Filter:** \`${report.tierFilter}\``);
  lines.push(`- **Spec Files Executed:** ${report.specFilesCount}`);
  lines.push(
    `- **Totals:** ${report.totals.passed} passed / ${report.totals.failed} failed / ${report.totals.total} total (${Math.round(report.totals.durationMs)} ms)`,
  );
  lines.push('');
  lines.push('## Per-Tier Results');
  lines.push('');
  lines.push('| Tier | Specs | Passed | Failed | Total | Duration (ms) |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const t of TIER_DEFS) {
    const s = report.tiers[t.id];
    lines.push(
      `| ${t.label} | ${s.specs} | ${s.passed} | ${s.failed} | ${s.total} | ${Math.round(s.durationMs)} |`,
    );
  }
  lines.push('');
  lines.push('## Feature Coverage Matrix (F1–F18)');
  lines.push('');
  lines.push('| Feature | Passed | Failed | Total | Status |');
  lines.push('|---|---:|---:|---:|---|');
  for (let i = 1; i <= 18; i++) {
    const fid = `F${i}`;
    const f = report.features[fid];
    const status =
      f.total === 0
        ? 'NOT_RUN'
        : f.failed === 0
          ? 'PASS'
          : 'FAIL';
    lines.push(`| ${fid} | ${f.passed} | ${f.failed} | ${f.total} | ${status} |`);
  }

  if (report.failures.length > 0) {
    lines.push('');
    lines.push('## Failure Diagnostics');
    lines.push('');
    for (const fail of report.failures) {
      lines.push(
        `- **${fail.tier}** \`${fail.file}\` — ${fail.name}: ${fail.error}`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const { tier, checkOnly } = parseArgs(process.argv.slice(2));
  if (checkOnly) {
    await runCheckMode();
    return;
  }

  const files = getTierFiles(tier);
  if (files.length === 0) {
    console.error(`No E2E spec files found for --tier=${tier}.`);
    process.exit(1);
  }

  const startedAt = Date.now();
  const tiers = {};
  for (const t of TIER_DEFS) {
    tiers[t.id] = {
      specs: files.filter((f) => tierForFile(f) === t.id).length,
      passed: 0,
      failed: 0,
      total: 0,
      durationMs: 0,
    };
  }

  const features = {};
  for (let i = 1; i <= 18; i++) {
    features[`F${i}`] = { passed: 0, failed: 0, total: 0 };
  }

  const results = [];
  const failures = [];

  const stream = run({
    files,
    concurrency: false,
  });

  stream.on('test:pass', (event) => {
    if (event.details?.type === 'suite') return;
    const tId = tierForFile(event.file);
    const dur = event.details?.duration_ms || 0;
    const featList = extractFeatures(event.name, event.file);

    if (tiers[tId]) {
      tiers[tId].passed++;
      tiers[tId].total++;
      tiers[tId].durationMs += dur;
    }
    for (const fid of featList) {
      if (features[fid]) {
        features[fid].passed++;
        features[fid].total++;
      }
    }
    results.push({
      status: 'pass',
      tier: tId,
      file: event.file ? path.relative(E2E_ROOT, event.file) : '',
      name: event.name,
      features: featList,
      durationMs: Math.round(dur),
    });
  });

  stream.on('test:fail', (event) => {
    if (event.details?.type === 'suite') return;
    const tId = tierForFile(event.file);
    const dur = event.details?.duration_ms || 0;
    const featList = extractFeatures(event.name, event.file);
    const errMsg = formatError(event.details?.error);

    if (tiers[tId]) {
      tiers[tId].failed++;
      tiers[tId].total++;
      tiers[tId].durationMs += dur;
    }
    for (const fid of featList) {
      if (features[fid]) {
        features[fid].failed++;
        features[fid].total++;
      }
    }
    const record = {
      status: 'fail',
      tier: tId,
      file: event.file ? path.relative(E2E_ROOT, event.file) : '',
      name: event.name,
      features: featList,
      durationMs: Math.round(dur),
      error: errMsg,
    };
    results.push(record);
    failures.push(record);
  });

  await new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
    stream.resume();
  });

  const totalPassed = Object.values(tiers).reduce((a, b) => a + b.passed, 0);
  const totalFailed = Object.values(tiers).reduce((a, b) => a + b.failed, 0);
  const totalDurationMs = Date.now() - startedAt;

  const report = {
    timestamp: new Date().toISOString(),
    tierFilter: tier,
    specFilesCount: files.length,
    totals: {
      passed: totalPassed,
      failed: totalFailed,
      total: totalPassed + totalFailed,
      durationMs: totalDurationMs,
    },
    tiers,
    features,
    failures,
    results,
  };

  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(SUMMARY_MD_PATH, buildSummaryMarkdown(report), 'utf8');

  console.log('\n=== Fiduciary OS / AUCTUM.ATLAS E2E Summary ===');
  console.log(
    `Tier Filter: ${tier} | Spec Files: ${files.length} | Duration: ${totalDurationMs} ms`,
  );
  console.log('-------------------------------------------------------------------');
  console.log('Tier                                   | Specs | Pass | Fail | Total');
  console.log('-------------------------------------------------------------------');
  for (const t of TIER_DEFS) {
    const s = tiers[t.id];
    console.log(
      `${t.label.padEnd(38)} | ${String(s.specs).padStart(5)} | ${String(s.passed).padStart(4)} | ${String(s.failed).padStart(4)} | ${String(s.total).padStart(5)}`,
    );
  }
  console.log('-------------------------------------------------------------------');
  console.log(
    `TOTAL                                  | ${String(files.length).padStart(5)} | ${String(totalPassed).padStart(4)} | ${String(totalFailed).padStart(4)} | ${String(totalPassed + totalFailed).padStart(5)}`,
  );
  console.log(`Reports written: ${path.relative(process.cwd(), REPORT_JSON_PATH)}, ${path.relative(process.cwd(), SUMMARY_MD_PATH)}`);

  if (totalFailed > 0 || totalPassed === 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Unhandled E2E runner error:', err);
  process.exit(1);
});
