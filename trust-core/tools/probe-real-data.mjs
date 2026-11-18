#!/usr/bin/env node
/**
 * probe-real-data.mjs — proves every external data link the product depends on.
 *
 * "We integrate real data" is a claim. This script is the evidence: for each
 * endpoint it records HTTP status, latency, payload size, whether the response has
 * the *shape* the code depends on, and the licence we are relying on. Run it before
 * a release; its output is what `GET /api/v1/data-sources` summarises at runtime.
 *
 *   node tools/probe-real-data.mjs            # human-readable table
 *   node tools/probe-real-data.mjs --json     # machine-readable, saved to data/
 *
 * Sources are marked `required` (a failure is a release blocker) or `optional`
 * (a failure is a degraded feature). Endpoints that were probed and REJECTED are
 * kept in the list with the reason, so the decision is auditable later.
 */

const PROBES = [
  {
    id: 'fred:dgs10',
    group: 'macro',
    label: 'FRED — 10Y Treasury yield (CSV, no key)',
    url: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=2025-01-01',
    expect: (t) => /(observation_date|DATE),DGS10/.test(t),
    backs: 'discount rate anchor, bond leg of the retirement projection',
    license: 'Public domain — US Government work (Federal Reserve Board)',
    required: true,
  },
  {
    id: 'fred:cpi',
    group: 'macro',
    label: 'FRED — CPI-U (CSV, no key)',
    url: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL&cosd=2024-01-01',
    expect: (t) => /CPIAUCSL/.test(t),
    backs: 'inflation assumption; deflating nominal returns to real',
    license: 'Public domain — BLS via FRED',
    required: true,
  },
  {
    id: 'fred:breakeven',
    group: 'macro',
    label: 'FRED — 10Y breakeven inflation (CSV)',
    url: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=T10YIE&cosd=2025-01-01',
    expect: (t) => /T10YIE/.test(t),
    backs: '10-year real yield = DGS10 − T10YIE',
    license: 'Public domain — Federal Reserve via FRED',
    required: true,
  },
  {
    id: 'fred:equity',
    group: 'macro',
    label: 'FRED — Nasdaq Composite, 1971- (CSV)',
    url: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=NASDAQCOM&cosd=1971-01-01',
    expect: (t) => /NASDAQCOM/.test(t),
    backs: 'historical real equity returns for the Monte Carlo bootstrap',
    license: 'Public domain — Nasdaq via FRED',
    required: true,
  },
  {
    id: 'treasury:fiscaldata',
    group: 'rates',
    label: 'Treasury Fiscal Data — average interest rates (JSON, no key)',
    url: 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?page%5Bsize%5D=2&sort=-record_date',
    expect: (t) => t.includes('"data"'),
    backs: 'fiscal context panel',
    license: 'Public domain — US Department of the Treasury',
    required: true,
  },
  {
    id: 'treasury:par-curve',
    group: 'rates',
    label: 'Treasury — daily par yield curve (CSV, no key)',
    url: 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2025/all?type=daily_treasury_yield_curve&field_tdr_date_value=2025&page&_format=csv',
    expect: (t) => /10 Yr/.test(t),
    backs: 'annuity discount factors (bootstrap)',
    license: 'Public domain — US Department of the Treasury',
    required: false,
    note: 'Generated on demand: 15-20s cold. Cached 24h with a 45-day stale tolerance and a FRED fallback; never on a request path without a fallback.',
  },
  {
    id: 'sec:submissions',
    group: 'disclosure',
    label: 'SEC EDGAR — submissions index (JSON, UA required)',
    url: 'https://data.sec.gov/submissions/CIK0000320193.json',
    expect: (t) => t.includes('filings'),
    headers: { 'User-Agent': 'FiduciaryOS/1.0 (probe; contact@fiduciary-os.example)' },
    backs: 'filing history and disclosure calendar per holding',
    license: 'Public SEC filings; fair-access policy (10 req/s, descriptive UA)',
    required: true,
  },
  {
    id: 'sec:companyfacts',
    group: 'disclosure',
    label: 'SEC EDGAR — XBRL company facts (JSON)',
    url: 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json',
    expect: (t) => t.includes('"facts"'),
    headers: { 'User-Agent': 'FiduciaryOS/1.0 (probe; contact@fiduciary-os.example)' },
    backs: 'primary-source fundamentals (multi-MB payload; cache hard)',
    license: 'Public SEC filings',
    required: true,
  },
  {
    id: 'sec:fulltext',
    group: 'disclosure',
    label: 'SEC EDGAR — full-text search (JSON)',
    url: 'https://efts.sec.gov/LATEST/search-index?q=%22material%20weakness%22&forms=10-K&startdt=2025-01-01',
    expect: (t) => /"hits"/.test(t),
    headers: { 'User-Agent': 'FiduciaryOS/1.0 (probe; contact@fiduciary-os.example)' },
    backs: 'Disclosure Watch (F7) — per-holding risk language monitoring',
    license: 'Public SEC filings',
    required: true,
  },
  {
    id: 'bls:cpi',
    group: 'macro',
    label: 'BLS Public Data API v2 (no key, 25 queries/day)',
    url: 'https://api.bls.gov/publicAPI/v2/timeseries/data/',
    method: 'POST',
    body: JSON.stringify({ seriesid: ['CUUR0000SA0'], startyear: '2024', endyear: '2026' }),
    headers: { 'Content-Type': 'application/json' },
    expect: (t) => t.includes('seriesID') || t.includes('CUUR0000SA0'),
    backs: 'CPI with publication vintage; independent second path to FRED',
    license: 'Public domain — Bureau of Labor Statistics',
    required: true,
  },
  {
    id: 'nasdaq:quote',
    group: 'market',
    label: 'Nasdaq — public quote endpoint (JSON)',
    url: 'https://api.nasdaq.com/api/quote/SPY/info?assetclass=etf',
    expect: (t) => t.includes('"data"'),
    headers: { Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' },
    backs: 'equity/ETF quotes (delayed)',
    license: 'Delayed display data; attribution required; NOT licensed for redistribution',
    required: false,
    note: 'Frequently slow (8s timeout + Yahoo fallback). Display-only, always labelled delayed.',
  },
  {
    id: 'yahoo:chart',
    group: 'market',
    label: 'Yahoo Finance — chart endpoint (JSON, undocumented)',
    url: 'https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=5d',
    expect: (t) => t.includes('"chart"'),
    backs: 'quote fallback; daily close history',
    license: 'Undocumented endpoint; delayed; internal/display use only — treat as replaceable',
    required: true,
  },
  {
    id: 'coingecko:price',
    group: 'market',
    label: 'CoinGecko — simple price (no key)',
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_last_updated_at=true',
    expect: (t) => t.includes('"usd"'),
    backs: 'crypto sleeve of the portfolio',
    license: 'CoinGecko API terms — attribution required, no redistribution as a feed',
    required: true,
  },
  {
    id: 'frankfurter:fx',
    group: 'market',
    label: 'Frankfurter — ECB FX rates (no key)',
    url: 'https://api.frankfurter.dev/v1/latest?from=USD',
    expect: (t) => t.includes('"rates"'),
    backs: 'non-USD household conversion (multi-currency phase)',
    license: 'Free, ECB reference rates',
    required: false,
  },
  {
    id: 'worldbank:macro',
    group: 'macro',
    label: 'World Bank — indicator API (no key)',
    url: 'https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.CD?format=json&per_page=2',
    expect: (t) => t.includes('USA'),
    backs: 'context for international expansion; not client-facing',
    license: 'CC BY-4.0 — attribution required',
    required: false,
  },

  // ---- Probed and REJECTED. Kept so the decision is auditable. --------------
  {
    id: 'ssa:life-table',
    group: 'rejected',
    label: 'SSA period life table (HTTP)',
    url: 'https://www.ssa.gov/oact/STATS/table4c6.html',
    expect: (t) => /life expectancy/i.test(t),
    backs: 'mortality basis',
    license: 'Public domain',
    required: false,
    rejected: true,
    note: 'HTTP 403 for both bot and browser user agents (bot manager). Ship the table as a versioned artefact with its citation instead — see src/data/ssa-period-life-table-2023.json.',
  },
  {
    id: 'stooq:csv',
    group: 'rejected',
    label: 'Stooq — quote CSV',
    url: 'https://stooq.com/q/l/?s=spy.us,vti.us&f=sd2t2ohlcv&h&e=csv',
    expect: (t) => /Symbol|SPY/i.test(t),
    backs: 'equity quotes',
    license: 'Undefined redistribution terms',
    required: false,
    rejected: true,
    note: 'HTTP 404 / bot interstitial. Also has unclear redistribution terms — not a source to build a client-facing number on.',
  },
  {
    id: 'policyengine:calculate',
    group: 'rejected',
    label: 'PolicyEngine US — /calculate',
    url: 'https://api.policyengine.org/us/calculate',
    method: 'POST',
    body: JSON.stringify({
      household: {
        people: { you: { age: { 2026: 40 }, employment_income: { 2026: 100000 } } },
        tax_units: { tu: { members: ['you'], filing_status: { 2026: 'SINGLE' } } },
        families: { fam: { members: ['you'] } },
        spm_units: { spm: { members: ['you'] } },
        households: { hh: { members: ['you'], state_name: { 2026: 'TX' } } },
        marital_units: { mu: { members: ['you'] } },
      },
      tax_year: 2026,
    }),
    headers: { 'Content-Type': 'application/json' },
    expect: (t) => t.includes('income_tax'),
    backs: 'authoritative tax rules',
    license: 'AGPL-3.0 — network service only',
    required: false,
    rejected: true,
    note: 'Returns HTTP 200 but only echoes the household plus SPM provenance (spm-calculator 1.0.0); no computed tax variables. The public endpoint is SPM-only in 2026 — self-host PolicyEngine to get tax outputs.',
  },
];

async function probe(p) {
  const started = Date.now();
  try {
    const res = await fetch(p.url, {
      method: p.method ?? 'GET',
      body: p.body,
      headers: {
        Accept: '*/*',
        'User-Agent': 'FiduciaryOS/1.0 (+https://fiduciary-os.example; data-provenance probe)',
        ...(p.headers ?? {}),
      },
      signal: AbortSignal.timeout(45_000),
    });
    const text = await res.text();
    return {
      id: p.id,
      group: p.group,
      label: p.label,
      url: p.url,
      backs: p.backs,
      license: p.license,
      required: p.required,
      rejected: p.rejected ?? false,
      note: p.note ?? null,
      status: res.status,
      latency_ms: Date.now() - started,
      bytes: text.length,
      shape_ok: p.expect?.(text) ?? true,
      ok: res.ok && (p.expect?.(text) ?? true),
      sample: text.slice(0, 140).replace(/\s+/g, ' '),
      checked_at: new Date().toISOString(),
    };
  } catch (err) {
    return {
      id: p.id,
      group: p.group,
      label: p.label,
      url: p.url,
      backs: p.backs,
      license: p.license,
      required: p.required,
      rejected: p.rejected ?? false,
      note: p.note ?? null,
      status: 0,
      latency_ms: Date.now() - started,
      ok: false,
      error: String(err?.message ?? err),
      checked_at: new Date().toISOString(),
    };
  }
}

const json = process.argv.includes('--json');
const results = await Promise.all(PROBES.map(probe));

const summary = {
  checked_at: new Date().toISOString(),
  total: results.length,
  required_ok: results.filter((r) => r.required && r.ok).length,
  required_total: results.filter((r) => r.required).length,
  optional_ok: results.filter((r) => !r.required && r.ok).length,
  optional_total: results.filter((r) => !r.required).length,
  rejected_confirmed: results.filter((r) => r.rejected).length,
  results,
};

if (json) {
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(new URL('../data/probe-results.json', import.meta.url), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ...summary, results: undefined }, null, 2)}\n`);
} else {
  const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
  console.log(`${pad('SOURCE', 26)}${pad('STATUS', 8)}${pad('MS', 8)}${pad('BYTES', 10)}${pad('SHAPE', 8)}REQUIRED`);
  for (const r of results) {
    const flag = r.rejected ? 'REJECTED' : r.required ? 'yes' : 'optional';
    console.log(`${pad(r.id, 26)}${pad(r.status, 8)}${pad(r.latency_ms, 8)}${pad(r.bytes ?? '-', 10)}${pad(r.shape_ok ? 'ok' : 'MISMATCH', 8)}${flag}`);
  }
  console.log(`\nrequired: ${summary.required_ok}/${summary.required_total} healthy`);
  console.log(`optional: ${summary.optional_ok}/${summary.optional_total} healthy`);
  const blockers = results.filter((r) => r.required && !r.ok);
  if (blockers.length) {
    console.log(`\nRELEASE BLOCKERS:\n${blockers.map((r) => `  - ${r.id} (${r.status || r.error})`).join('\n')}`);
    process.exitCode = 1;
  }
}
