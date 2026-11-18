/**
 * live/provider.test.ts — contract tests against the real providers.
 *
 * These are intentionally NOT part of the default `npm test` run: a build must not
 * fail because the Treasury website is slow. They are the release gate instead:
 *
 *     FID_OS_LIVE=1 npm run test:live
 *
 * Each test asserts the *shape* we depend on, so a provider silently changing its
 * schema is caught here rather than in a client's retirement projection.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HttpClient } from '../../src/http.ts';
import { FredSource } from '../../src/sources/fred.ts';
import { TreasurySource } from '../../src/sources/treasury.ts';
import { SecSource } from '../../src/sources/sec.ts';
import { BlsSource } from '../../src/sources/bls.ts';
import { MarketSource } from '../../src/sources/market.ts';
import { CalibrationService } from '../../src/calibration.ts';

const live = process.env.FID_OS_LIVE === '1';
const client = new HttpClient({ userAgent: 'FiduciaryOS/1.0 (live contract test; contact@fiduciary-os.example)' });

describe('live provider contracts', { skip: !live && 'set FID_OS_LIVE=1 to run' }, () => {
  test('FRED returns a parseable daily yield series', async () => {
    const fred = new FredSource(client);
    const d = await fred.latest('DGS10', { start: '2025-01-01' });
    assert.equal(typeof d.value.value, 'number');
    assert.ok((d.value.value as number) > 0 && (d.value.value as number) < 25);
    assert.match(d.provenance.sourceUrl, /fred\.stlouisfed\.org/);
    console.log(`  DGS10 = ${d.value.value}% as of ${d.value.date}`);
  });

  test('FRED CPI series is long enough to compute YoY', async () => {
    const fred = new FredSource(client);
    const yoy = await fred.yearOverYear('CPIAUCSL', { start: '2024-01-01' });
    assert.ok(yoy.value.length > 6);
    const last = yoy.value.at(-1);
    assert.ok(last && Number.isFinite(last.yoyPct));
    console.log(`  CPI YoY = ${last?.yoyPct.toFixed(2)}% as of ${last?.date}`);
  });

  test('Treasury Fiscal Data returns records', async () => {
    const treasury = new TreasurySource(client);
    const d = await treasury.averageInterestRates(3);
    assert.ok(d.value.length > 0);
    assert.ok(d.value[0]?.record_date);
  });

  test('SEC EDGAR submissions returns filings for a known CIK', async () => {
    const sec = new SecSource(client);
    const d = await sec.submissions(320193); // Apple
    assert.match(d.value.entityName, /Apple/i);
    assert.ok(Array.isArray(d.value.filings));
  });

  test('SEC full-text search returns hits', async () => {
    const sec = new SecSource(client);
    const d = await sec.fullTextSearch('"material weakness"', { forms: ['10-K'], startdt: '2025-01-01' });
    assert.ok(d.value.total >= 0);
  });

  test('BLS returns CPI observations', async () => {
    const bls = new BlsSource(client);
    const year = new Date().getUTCFullYear();
    const d = await bls.series(['CUUR0000SA0'], year - 1, year);
    assert.ok((d.value[0]?.observations.length ?? 0) > 6);
  });

  test('market quote returns a priced instrument with a timeliness label', async () => {
    const market = new MarketSource(client);
    const d = await market.quote('SPY', 'etf');
    assert.ok(d.value.price > 0);
    assert.ok(['realtime', 'delayed', 'eod'].includes(d.value.timeliness));
    console.log(`  SPY = $${d.value.price} (${d.value.timeliness}, ${d.value.providerTime})`);
  });

  test('calibration produces a usable assumption set from live data', async () => {
    const cal = new CalibrationService(client);
    const c = await cal.assumptions({ equityWeight: 0.6, feeRate: 0.0075 });
    assert.ok(c.assumptions.equityRealReturns.length > 30);
    assert.ok(Number.isFinite(c.assumptions.bondRealYield));
    assert.ok(c.observedFrom > 1970);
    console.log(
      `  real equity returns: n=${c.assumptions.equityRealReturns.length}, ${c.observedFrom}-${c.observedTo}, ` +
        `bond real yield=${(c.assumptions.bondRealYield * 100).toFixed(2)}%`,
    );
  });
});
