/**
 * ui/format.js — presentation logic for the provenance console, kept out of the DOM
 * and written in plain ESM so the browser and the tests use the *same* implementation.
 *
 * Everything the console decides about a number — is it fresh, is it live, how do we
 * label a placeholder, how do we round — lives here so it can be tested without a
 * browser. Types live in format.d.ts; the browser never sees TypeScript.
 *
 * The rules encoded here are product rules, not formatting preferences:
 *  - a `mock` value is never rendered as a normal number,
 *  - a stale value is visibly stale, not merely old,
 *  - an unknown source kind is treated as untrusted rather than live.
 */

const KIND_LABEL = {
  live: 'Live',
  'bundled-official': 'Official table',
  derived: 'Derived',
  'user-input': 'Your input',
  mock: 'Placeholder',
};

const FRESHNESS_LABEL = {
  fresh: 'Current',
  aging: 'Aging',
  stale: 'Stale',
  placeholder: 'Not real data',
  unknown: 'Unverified',
};

/** Human age: "just now", "14 min ago", "3 h ago", "2 days ago". */
export function relativeAge(retrievedAt, now = Date.now()) {
  const t = Date.parse(retrievedAt);
  if (!Number.isFinite(t)) return 'unknown age';
  const seconds = Math.max(0, Math.round((now - t) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  return `${months} months ago`;
}

/**
 * Freshness is judged against the source's own `staleAfterSeconds`, not a global rule:
 * a quote that is 90 seconds old is stale, a CPI print that is 3 hours old is current.
 * One threshold for both would make one of them lie.
 */
export function classifyFreshness(p, now = Date.now()) {
  if (!p || p.sourceKind === 'mock') return 'placeholder';
  const t = Date.parse(p.retrievedAt);
  if (!Number.isFinite(t)) return 'unknown';
  const ttl = p.staleAfterSeconds;
  if (!ttl || ttl <= 0) return 'fresh';
  const ageSeconds = Math.max(0, (now - t) / 1000);
  if (ageSeconds <= ttl) return 'fresh';
  if (ageSeconds <= ttl * 2) return 'aging';
  return 'stale';
}

/** Sort order for the console's badges: worse first. */
export const FRESHNESS_RANK = { placeholder: 0, stale: 1, unknown: 2, aging: 3, fresh: 4 };

export function describeProvenance(p, now = Date.now()) {
  const freshness = classifyFreshness(p, now);
  return {
    label: p?.source ?? 'unknown',
    kindLabel: KIND_LABEL[p?.sourceKind] ?? 'Unknown source',
    freshness,
    freshnessLabel: FRESHNESS_LABEL[freshness],
    asOfLabel: p?.asOf ? `as of ${p.asOf}` : 'no observation date',
    ageLabel: relativeAge(p?.retrievedAt ?? '', now),
    license: p?.license ?? 'licence not stated',
    sourceUrl: p?.sourceUrl && p.sourceUrl.length > 0 ? p.sourceUrl : null,
    method: p?.method ?? '',
    derivedFrom: p?.derivedFrom ?? [],
    mustWarn: freshness === 'placeholder' || freshness === 'unknown',
  };
}

/** US dollars, no cents above $1,000 — advisors read magnitude, not pennies. */
export function money(value) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const opts =
    abs >= 1000
      ? { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }
      : { style: 'currency', currency: 'USD', maximumFractionDigits: 2 };
  return new Intl.NumberFormat('en-US', opts).format(value);
}

export function percent(value, digits = 1) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

/** Tax figures in this product are ratios, not percentages. */
export function rate(fraction, digits = 1) {
  if (!Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function compactNumber(value) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/**
 * The console renders this next to every result. It is not decoration: the figures are
 * estimates, and the exclusions are part of the answer.
 */
export const DISCLOSURE =
  'Educational estimate. Not a quote, offer, recommendation, or tax or investment advice.';