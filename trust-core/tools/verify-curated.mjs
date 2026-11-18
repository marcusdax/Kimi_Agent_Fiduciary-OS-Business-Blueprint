#!/usr/bin/env node
/**
 * verify-curated.mjs — pin the exact metadata of every repository the report cites.
 *
 * The keyword scan produces candidates and ranks them, but a published report must
 * not quote a star count it did not just read. This script resolves a hand-curated
 * shortlist against the GitHub REST API (one call per repo, cached to
 * data/curated-repos.json) so every number in `docs/GITHUB_REPO_VALUE_SCAN.md` is
 * reproducible and dated.
 *
 *   node tools/verify-curated.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'data', 'curated-repos.json');

/** capability -> repos this report actually recommends or rejects, with a reason slot. */
const CURATED = {
  'data-providers': ['ranaroussi/yfinance', 'OpenBB-finance/OpenBB', 'jimlindstrom/sec_edgar'],
  'tax-engine': ['PolicyEngine/policyengine-us', 'PSLmodels/Tax-Calculator', 'The-Pied-Piper/tax-engine'],
  'authorization': ['openfga/openfga', 'cerbos/cerbos', 'permitio/opal', 'better-auth/better-auth'],
  'audit-and-provenance': ['bkuan001/halo-record', 'Cygnux-Labs/Tracekit', 'anivar/decern', 'quantumpipes/capsule'],
  'ai-supervision': ['langfuse/langfuse', 'promptfoo/promptfoo', 'confident-ai/deepeval', 'NVIDIA/garak'],
  'growth-and-flags': ['PostHog/posthog', 'growthbook/growthbook', 'umami-software/umami'],
  'portfolio-reference': ['ghostfolio/ghostfolio'],
  'documents-and-esign': ['documenso/documenso', 'OpenSignLabs/OpenSign'],
  'ui-system': ['shadcn-ui/ui', 'tremorlabs/tremor', 'satnaing/shadcn-admin'],
  'workflow-and-jobs': ['taskforcesh/bullmq', 'temporalio/temporal', 'conductor-oss/conductor'],
  'privacy-tech': ['apple/pfl-research', 'owkin/FLamby', 'open-quantum-safe/oqs-provider', 'semaphore-protocol/semaphore'],
  'crm': ['twentyhq/twenty', 'krayin/laravel-crm'],
  'compliance-program': ['trycompai/comp', 'UnicisTech/unicis-platform-ce'],
  'observability': ['open-telemetry/opentelemetry-js'],
};

const HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'fiduciary-os-verify/1.0',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function one(fullName, capability) {
  const url = `https://api.github.com/repos/${fullName}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.status === 200) {
      const r = await res.json();
      return {
        full_name: r.full_name,
        html_url: r.html_url,
        capability,
        stars: r.stargazers_count,
        forks: r.forks_count,
        open_issues: r.open_issues_count,
        license: r.license?.spdx_id ?? null,
        language: r.language ?? null,
        pushed_at: r.pushed_at,
        created_at: r.created_at,
        archived: r.archived,
        description: (r.description ?? '').slice(0, 200),
        topics: (r.topics ?? []).slice(0, 8),
        default_branch: r.default_branch,
        verified_at: new Date().toISOString(),
      };
    }
    if (res.status === 404) {
      return { full_name: fullName, capability, error: 'not found (renamed, private or deleted)' };
    }
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset') ?? 0) * 1000;
      const wait = Math.max(1_000, Math.min(reset - Date.now() + 1_000, 65_000));
      process.stderr.write(`rate limited; waiting ${Math.round(wait / 1000)}s\n`);
      await sleep(wait);
      continue;
    }
    process.stderr.write(`HTTP ${res.status} for ${fullName}\n`);
    await sleep(1_500 * (attempt + 1));
  }
  return { full_name: fullName, capability, error: 'unresolved' };
}

async function main() {
  let existing = { repos: [] };
  try {
    existing = JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    /* first run */
  }
  const known = new Map(existing.repos.map((r) => [r.full_name, r]));

  const wanted = [];
  for (const [capability, repos] of Object.entries(CURATED)) {
    for (const r of repos) wanted.push({ full_name: r, capability });
  }

  const results = [];
  for (const { full_name, capability } of wanted) {
    const cached = known.get(full_name);
    // Re-verify anything older than a day; otherwise reuse to stay inside the rate limit.
    if (cached && !cached.error && Date.now() - Date.parse(cached.verified_at) < 24 * 3600 * 1000) {
      results.push({ ...cached, capability });
      continue;
    }
    process.stderr.write(`verifying ${full_name}\n`);
    results.push(await one(full_name, capability));
    await sleep(400);
  }

  results.sort((a, b) => a.capability.localeCompare(b.capability) || (b.stars ?? 0) - (a.stars ?? 0));
  await writeFile(
    OUT,
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        method: 'GitHub REST API /repos/{owner}/{repo}, one call per repo, cached 24h',
        counts: { requested: wanted.length, resolved: results.filter((r) => !r.error).length, failed: results.filter((r) => r.error).length },
        repos: results,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  process.stderr.write(`\nwrote ${OUT}: ${results.filter((r) => !r.error).length}/${wanted.length} resolved\n`);
}

await main();
