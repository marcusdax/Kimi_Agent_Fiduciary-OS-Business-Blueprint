#!/usr/bin/env node
/**
 * github-scan.mjs — reproducible GitHub repository discovery for Fiduciary OS.
 *
 * WHY THIS EXISTS
 * ---------------
 * "Scan GitHub for repos that add value" must be an evidence-producing process,
 * not a vibes list. This script queries the GitHub Search API for a curated set
 * of capability domains mapped to the Fiduciary OS value flow, normalises the
 * metadata we actually need to make adoption decisions (license, recency,
 * liveness, stars, archived state), applies a transparent scoring rubric, and
 * writes a machine-readable candidate set that the report cites.
 *
 * DESIGN NOTES
 * ------------
 * - No dependencies: Node >= 18 global fetch only.
 * - Respects the unauthenticated search limit (10 req/min) via pacing, and
 *   honours `X-RateLimit-Reset` when the API tells us to back off.
 * - Every query is labelled with the value-flow stage it serves, so scoring can
 *   reason about *fit*, not just popularity.
 * - Deterministic output ordering so diffs of the JSON are reviewable.
 *
 * USAGE
 *   node tools/github-scan.mjs                # full scan -> data/github-candidates.json
 *   node tools/github-scan.mjs --per-page 30  # smaller pages
 *   GITHUB_TOKEN=ghp_...  node tools/github-scan.mjs   # avoids rate-limit pacing
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'data', 'github-candidates.json');

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const PER_PAGE = Number(argValue('--per-page', '40'));

/**
 * Query plan. Each entry is a capability gap in Fiduciary OS that open source
 * could close, mapped to the value-flow stage it accelerates:
 *   attract | activate | convert-b2c | convert-b2b | retain | trust | platform
 */
const QUERIES = [
  // --- Trust / compliance layer (the B2B moat) ---
  { q: 'topic:audit-trail tamper-evident', stage: 'trust', gap: 'Immutable, verifiable audit trail for advice + planning actions' },
  { q: 'immutable audit log sql', stage: 'trust', gap: 'Append-only evidence store for fiduciary-duty proof' },
  { q: 'topic:soc2 compliance automation', stage: 'trust', gap: 'Fast path to a real SOC 2 program' },
  { q: 'topic:policy-as-code authorization', stage: 'trust', gap: 'Fine-grained advisor/household relationship authorization' },
  { q: 'topic:zero-knowledge-proofs', stage: 'trust', gap: 'Prove eligibility/asset band without revealing balances' },
  { q: 'topic:post-quantum cryptography', stage: 'trust', gap: 'Long-horizon document vault crypto-agility' },
  { q: 'topic:federated-learning differential-privacy', stage: 'trust', gap: 'Cross-firm benchmarks without sharing client data' },
  { q: 'topic:anomaly-detection fraud', stage: 'trust', gap: 'Elder-exploitation / planning-action anomaly sentinel' },

  // --- Data + calculation correctness (attract/activate) ---
  { q: 'sec edgar financial statements parser', stage: 'attract', gap: 'Primary-source filings data for portfolio + fundamentals' },
  { q: 'tax calculation engine open source', stage: 'attract', gap: 'Replace bracket approximation with maintained rules engine' },
  { q: 'topic:personal-finance calculator', stage: 'attract', gap: 'Free calculator surface for top-of-funnel' },
  { q: 'topic:retirement planning', stage: 'attract', gap: 'Retirement / withdrawal modelling' },
  { q: 'topic:monte-carlo simulation finance', stage: 'activate', gap: 'Probabilistic retirement outcomes instead of single-point' },
  { q: 'topic:financial-data api market-data', stage: 'activate', gap: 'Provider abstraction + provenance for market data' },

  // --- Portfolio / conversion features ---
  { q: 'topic:portfolio-management open-source', stage: 'convert-b2c', gap: 'Portfolio tracking, performance and risk analytics' },
  { q: 'topic:personal-finance-manager self-hosted', stage: 'convert-b2c', gap: 'Reference model for account aggregation UX' },
  { q: 'topic:open-banking aggregation', stage: 'convert-b2c', gap: 'Account linking without a US aggregator lock-in' },
  { q: 'topic:wealth-management advisor', stage: 'convert-b2b', gap: 'Advisor command-center primitives' },
  { q: 'topic:crm open-source', stage: 'convert-b2b', gap: 'Client/prospect pipeline for advisor firms' },

  // --- Documents, e-sign, vault (retain) ---
  { q: 'topic:electronic-signature open-source', stage: 'retain', gap: 'Plan approval / IPS signature capture' },
  { q: 'topic:document-management encryption', stage: 'retain', gap: 'Document vault that is more than metadata' },

  // --- Platform / AI supervision ---
  { q: 'topic:llm-evaluation', stage: 'platform', gap: 'Eval harness for advice-safety regressions' },
  { q: 'topic:prompt-injection guardrails', stage: 'platform', gap: 'Injection defense for advisor-uploaded documents' },
  { q: 'topic:feature-flags', stage: 'platform', gap: 'Gradual rollout + experiment plumbing' },
  { q: 'topic:product-analytics self-hosted', stage: 'platform', gap: 'Funnel measurement owned by the company' },
  { q: 'topic:workflow-engine', stage: 'platform', gap: 'Configurable planning-workflow stages without redeploys' },
];

const HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'fiduciary-os-repo-scan/1.0',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(query, perPage) {
  const url = new URL('https://api.github.com/search/repositories');
  url.searchParams.set('q', `${query} archived:false`);
  url.searchParams.set('sort', 'stars');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', String(perPage));

  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.status === 200) {
      const body = await res.json();
      return { items: body.items ?? [], total: body.total_count ?? 0 };
    }
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset') ?? 0) * 1000;
      const wait = Math.max(reset - Date.now(), 5_000) + 1_000;
      process.stderr.write(`  rate limited; sleeping ${Math.round(wait / 1000)}s\n`);
      await sleep(wait);
      continue;
    }
    process.stderr.write(`  HTTP ${res.status} for "${query}" (attempt ${attempt})\n`);
    await sleep(2_000 * attempt);
  }
  return { items: [], total: 0 };
}

/**
 * Scoring rubric — deliberately simple and auditable. Each factor is bounded and
 * the weights are stated so a reader can disagree with one weight in isolation.
 *
 *   liveness   0..30  recency of last push (the single best "is this alive" signal)
 *   adoption   0..25  log-scaled stars (proxy for ecosystem support, not quality)
 *   license    0..20  permissive licence = adoptable; none/unknown = legal review
 *   fit        0..20  stage relevance weight (trust/convert stages weigh most)
 *   health     0..5   forks + open-issue signal, capped
 */
const STAGE_WEIGHT = {
  trust: 1.0,
  'convert-b2b': 1.0,
  'convert-b2c': 0.85,
  activate: 0.8,
  attract: 0.75,
  retain: 0.8,
  platform: 0.6,
};

function score(repo, stage) {
  const pushed = Date.parse(repo.pushed_at ?? '') || 0;
  const days = pushed ? (Date.now() - pushed) / 86_400_000 : 9999;
  const liveness = days <= 30 ? 30 : days <= 90 ? 26 : days <= 180 ? 20 : days <= 365 ? 13 : days <= 730 ? 6 : 0;

  const stars = repo.stargazers_count ?? 0;
  const adoption = Math.min(25, Math.round(5.5 * Math.log10(Math.max(stars, 1))));

  const spdx = repo.license?.spdx_id ?? null;
  const license = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MPL-2.0'].includes(spdx)
    ? 20
    : spdx === 'AGPL-3.0' || spdx === 'GPL-3.0' || spdx === 'LGPL-3.0'
      ? 8
      : spdx === 'NOASSERTION'
        ? 8
        : 0;

  const fit = Math.round(20 * STAGE_WEIGHT[stage]);

  const health = Math.min(
    5,
    Math.round(Math.log10(Math.max(repo.forks_count ?? 0, 1)) * 2) +
      ((repo.open_issues_count ?? 0) > 0 ? 1 : 0),
  );

  return { total: liveness + adoption + license + fit + health, liveness, adoption, license, fit, health };
}

function normalise(repo, hit) {
  const s = score(repo, hit.stage);
  return {
    full_name: repo.full_name,
    url: repo.html_url,
    description: (repo.description ?? '').slice(0, 240),
    stars: repo.stargazers_count ?? 0,
    forks: repo.forks_count ?? 0,
    open_issues: repo.open_issues_count ?? 0,
    language: repo.language ?? null,
    license: repo.license?.spdx_id ?? null,
    pushed_at: repo.pushed_at ?? null,
    created_at: repo.created_at ?? null,
    topics: repo.topics ?? [],
    default_branch: repo.default_branch ?? 'main',
    stage: hit.stage,
    gap: hit.gap,
    query: hit.q,
    score: s.total,
    score_breakdown: { liveness: s.liveness, adoption: s.adoption, license: s.license, fit: s.fit, health: s.health },
  };
}

async function main() {
  const byName = new Map();
  const perQuery = [];
  const seenQueries = new Set();

  for (const hit of QUERIES) {
    if (seenQueries.has(hit.q)) continue;
    seenQueries.add(hit.q);
    process.stderr.write(`scanning :: ${hit.q}\n`);
    const { items, total } = await search(hit.q, PER_PAGE);
    perQuery.push({ query: hit.q, stage: hit.stage, total_count: total, returned: items.length });
    for (const repo of items) {
      const candidate = normalise(repo, hit);
      const existing = byName.get(candidate.full_name);
      // A repo can serve several gaps; keep the highest-scoring framing but
      // remember every stage it was discovered under.
      if (existing) {
        existing.also_relevant_to = [...new Set([...(existing.also_relevant_to ?? []), hit.stage])];
        if (candidate.score > existing.score) Object.assign(existing, candidate, { also_relevant_to: existing.also_relevant_to });
      } else {
        byName.set(candidate.full_name, candidate);
      }
    }
    // Unauthenticated search allows 10 requests/minute.
    if (!process.env.GITHUB_TOKEN) await sleep(6_500);
  }

  const candidates = [...byName.values()].sort(
    (a, b) => b.score - a.score || b.stars - a.stars || a.full_name.localeCompare(b.full_name),
  );

  const payload = {
    generated_at: new Date().toISOString(),
    method: 'GitHub Search API v3, sorted by stars, archived repos excluded',
    rubric: {
      liveness: '0-30 by days since last push',
      adoption: '0-25 log-scaled stars',
      license: '0-20 permissive=20, copyleft=8, none=0',
      fit: '0-20 stage weight',
      health: '0-5 forks + issue activity',
    },
    query_plan: perQuery,
    counts: { unique_repos: candidates.length, queries: perQuery.length },
    candidates,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  process.stderr.write(`\nwrote ${OUT} (${candidates.length} unique repos)\n`);
}

main().catch((err) => {
  process.stderr.write(`scan failed: ${err.stack ?? err}\n`);
  process.exit(1);
});
