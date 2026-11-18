/**
 * The console's presentation logic is plain ESM so the browser and these tests share
 * one implementation. What is asserted here is the product rule, not the formatting:
 * a placeholder or unverifiable value must be marked as unfit to show a client.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  relativeAge,
  classifyFreshness,
  describeProvenance,
  FRESHNESS_RANK,
  money,
  percent,
  rate,
  compactNumber,
  DISCLOSURE,
} from '../../src/ui/format.js';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

const live = (overrides: Record<string, unknown> = {}) => ({
  source: 'fred:DGS10',
  sourceKind: 'live' as const,
  sourceUrl: 'https://fred.stlouisfed.org/series/DGS10',
  retrievedAt: ago(60),
  asOf: '2026-11-07',
  license: 'Public domain',
  method: 'FRED series DGS10',
  staleAfterSeconds: 3600,
  ...overrides,
});

describe('relative age', () => {
  test('uses human buckets rather than raw timestamps', () => {
    assert.equal(relativeAge(ago(5), NOW), 'just now');
    assert.equal(relativeAge(ago(600), NOW), '10 min ago');
    assert.equal(relativeAge(ago(3 * 3600), NOW), '3 h ago');
    assert.equal(relativeAge(ago(2 * 86400), NOW), '2 days ago');
    assert.equal(relativeAge(ago(1 * 86400), NOW), '1 day ago');
    assert.equal(relativeAge(ago(90 * 86400), NOW), '3 months ago');
  });

  test('an unparseable timestamp is unknown, not "just now"', () => {
    assert.equal(relativeAge('not-a-date', NOW), 'unknown age');
  });
});

describe('freshness', () => {
  test('is judged against the source own TTL', () => {
    assert.equal(classifyFreshness(live(), NOW), 'fresh');
    assert.equal(classifyFreshness(live({ retrievedAt: ago(5000) }), NOW), 'aging');
    assert.equal(classifyFreshness(live({ retrievedAt: ago(20_000) }), NOW), 'stale');
  });

  test('a quote TTL and a CPI TTL behave differently, on purpose', () => {
    const quote = live({ source: 'nasdaq:quote', retrievedAt: ago(120), staleAfterSeconds: 60 });
    const cpi = live({ source: 'fred:CPIAUCSL', retrievedAt: ago(120), staleAfterSeconds: 86_400 });
    assert.equal(classifyFreshness(quote, NOW), 'aging');
    assert.equal(classifyFreshness(cpi, NOW), 'fresh');
  });

  test('a placeholder is never merely "stale"', () => {
    assert.equal(classifyFreshness(live({ sourceKind: 'mock' }), NOW), 'placeholder');
  });

  test('a missing timestamp is unverified', () => {
    assert.equal(classifyFreshness(live({ retrievedAt: 'garbage' }), NOW), 'unknown');
  });

  test('the rank orders worst first, so a dashboard can sort by risk', () => {
    assert.ok(FRESHNESS_RANK.placeholder < FRESHNESS_RANK.stale);
    assert.ok(FRESHNESS_RANK.stale < FRESHNESS_RANK.aging);
    assert.ok(FRESHNESS_RANK.aging < FRESHNESS_RANK.fresh);
  });
});

describe('describeProvenance', () => {
  test('carries everything a reviewer needs on one line', () => {
    const v = describeProvenance(live(), NOW);
    assert.equal(v.label, 'fred:DGS10');
    assert.equal(v.kindLabel, 'Live');
    assert.equal(v.asOfLabel, 'as of 2026-11-07');
    assert.equal(v.ageLabel, '1 min ago');
    assert.equal(v.license, 'Public domain');
    assert.equal(v.sourceUrl?.startsWith('https://'), true);
    assert.equal(v.mustWarn, false);
  });

  test('flags a placeholder as unfit for a client', () => {
    const v = describeProvenance(live({ sourceKind: 'mock' }), NOW);
    assert.equal(v.freshness, 'placeholder');
    assert.equal(v.mustWarn, true);
  });

  test('an unknown source kind is treated as untrusted, not as live', () => {
    const v = describeProvenance(live({ sourceKind: 'something-else' as never }), NOW);
    assert.equal(v.kindLabel, 'Unknown source');
  });

  test('missing licence and method are stated rather than blank', () => {
    const v = describeProvenance(live({ license: undefined, method: undefined }), NOW);
    assert.equal(v.license, 'licence not stated');
    assert.equal(v.method, '');
  });

  test('an empty source URL becomes null so no dead link is rendered', () => {
    assert.equal(describeProvenance(live({ sourceUrl: '' }), NOW).sourceUrl, null);
  });

  test('derived values expose their inputs', () => {
    const v = describeProvenance(live({ sourceKind: 'derived', derivedFrom: ['fred:DGS10', 'fred:T10YIE'] }), NOW);
    assert.deepEqual(v.derivedFrom, ['fred:DGS10', 'fred:T10YIE']);
  });
});

describe('number formatting', () => {
  test('money drops cents above a thousand and keeps them below', () => {
    assert.equal(money(145000), '$145,000');
    assert.equal(money(12.5), '$12.50');
    assert.equal(money(-3200), '-$3,200');
  });

  test('percent takes a percentage, rate takes a fraction — they are not interchangeable', () => {
    assert.equal(percent(3.72), '3.7%');
    assert.equal(rate(0.0372), '3.7%');
    assert.notEqual(percent(0.22), rate(0.22));
  });

  test('non-finite values render as an em dash, never as NaN or Infinity', () => {
    assert.equal(money(Number.NaN), '—');
    assert.equal(percent(Number.POSITIVE_INFINITY), '—');
    assert.equal(compactNumber(Number.NaN), '—');
  });

  test('compact numbers keep a large figure readable', () => {
    assert.equal(compactNumber(1900), '1.9K');
  });

  test('the disclosure is always available to render', () => {
    assert.match(DISCLOSURE, /Not a quote/);
  });
});
