import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { E2E_REPO_ROOT, RUN_ID } from './config.mjs';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.turbo',
]);

export function resolveRepoPath(relPath) {
  return path.resolve(E2E_REPO_ROOT, relPath);
}

export function repoFileExists(relPath) {
  return fs.existsSync(resolveRepoPath(relPath));
}

export function readRepoFile(relPath) {
  const abs = resolveRepoPath(relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Required repository file not found: ${relPath} (${abs})`);
  }
  return fs.readFileSync(abs, 'utf8');
}

export function listRepoFiles(relDir, extensions = null) {
  const root = resolveRepoPath(relDir);
  if (!fs.existsSync(root)) return [];
  const results = [];

  function walk(current) {
    const dirents = fs.readdirSync(current, { withFileTypes: true });
    for (const d of dirents) {
      if (SKIP_DIRS.has(d.name)) continue;
      const full = path.join(current, d.name);
      if (d.isDirectory()) {
        walk(full);
      } else if (d.isFile()) {
        if (!extensions || extensions.some((ext) => d.name.endsWith(ext))) {
          results.push(path.relative(E2E_REPO_ROOT, full));
        }
      }
    }
  }

  walk(root);
  return results.sort();
}

/**
 * Scans repo files for active references to masternex / MASTERNEX.
 */
export function scanForMasternex(relPaths) {
  const hits = [];
  const pattern = /masternex/i;

  for (const rel of relPaths) {
    const abs = resolveRepoPath(rel);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    const filesToScan = stat.isDirectory()
      ? listRepoFiles(rel, [
          '.ts',
          '.tsx',
          '.js',
          '.jsx',
          '.mjs',
          '.cjs',
          '.yml',
          '.yaml',
          '.json',
          '.env',
        ])
      : [rel];

    for (const file of filesToScan) {
      const content = readRepoFile(file);
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (pattern.test(line)) {
          hits.push({ file, line: idx + 1, text: line.trim() });
        }
      });
    }
  }

  return hits;
}

/**
 * Runs `npm --prefix fiduciary-os/frontend run lint:copy` via child_process.
 * Optionally passes extra CLI args (e.g. a temp file path in /tmp).
 */
export function runCopyLinter(extraArgs = []) {
  const pkgPath = resolveRepoPath('fiduciary-os/frontend/package.json');
  if (!fs.existsSync(pkgPath)) {
    return {
      scriptDefined: false,
      exitCode: 127,
      stdout: '',
      stderr: `Missing ${pkgPath}`,
    };
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const scriptDefined = Boolean(pkg.scripts && pkg.scripts['lint:copy']);
  if (!scriptDefined) {
    return {
      scriptDefined: false,
      exitCode: 127,
      stdout: '',
      stderr: 'Script "lint:copy" is not defined in fiduciary-os/frontend/package.json',
    };
  }

  const npmArgs = ['--prefix', 'fiduciary-os/frontend', 'run', 'lint:copy'];
  if (extraArgs.length > 0) {
    npmArgs.push('--', ...extraArgs);
  }

  const res = spawnSync('npm', npmArgs, {
    cwd: E2E_REPO_ROOT,
    encoding: 'utf8',
    timeout: 30000,
  });

  return {
    scriptDefined: true,
    exitCode: res.status ?? 1,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

/**
 * Creates an isolated temporary fixture file under /tmp and guarantees cleanup.
 */
export async function withTempFixtureFile(filename, content, fn) {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `fiduciary-os-e2e-${RUN_ID}-`),
  );
  const filePath = path.join(tmpDir, filename);
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return await fn(filePath, tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
