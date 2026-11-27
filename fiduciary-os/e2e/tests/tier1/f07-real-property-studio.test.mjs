import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL } from '../../lib/config.mjs';
import { VALID_UNDERWRITING_PAYLOADS } from '../../lib/fixtures.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 1 — F7: Real Property & Tangible Asset Studio (#11)', () => {
  for (const strategy of ['hold', 'brrrr', 'str']) {
    it(`[F7] POST /api/v1/property/underwrite computes deterministic ${strategy.toUpperCase()} KPIs, 30-yr amortization, 10-yr curves, 2^3 DOE, and Committee Memo`, async () => {
      const res = await apiFetch(E2E_BACKEND_URL, '/api/v1/property/underwrite', {
        method: 'POST',
        json: VALID_UNDERWRITING_PAYLOADS[strategy],
      });
      assertStatus(
        res,
        200,
        'F7/M3',
        `POST /api/v1/property/underwrite (${strategy})`,
      );
      const body = assertJsonObject(res, 'F7/M3', `underwrite ${strategy}`);
      const data = body.data || body;

      const kpis = data.kpis || data.metrics || data;
      for (const field of ['noi', 'capRate', 'dscr']) {
        assert.ok(
          typeof kpis[field] === 'number' && Number.isFinite(kpis[field]),
          `[F7/M3] Missing finite numeric KPI "${field}" for strategy "${strategy}"`,
        );
      }

      const amort = data.amortizationSchedule || data.amortization;
      assert.ok(
        Array.isArray(amort) && (amort.length === 30 || amort.length === 360),
        `[F7/M3] Expected 30 annual or 360 monthly amortization rows, got ${Array.isArray(amort) ? amort.length : typeof amort}`,
      );
      const lastRow = amort[amort.length - 1];
      const endBal =
        lastRow?.endingBalance ?? lastRow?.remainingBalance ?? lastRow?.balance;
      assert.ok(
        typeof endBal === 'number' && Math.abs(endBal) < 5,
        `[F7/M3] Expected ending 30-yr amortization balance near 0, got ${endBal}`,
      );

      const curves = data.tenYearCurves || data.projection10Year || data.curves;
      assert.ok(
        Array.isArray(curves) && curves.length === 10,
        `[F7/M3] Expected 10-year projection curves (10 points), got ${Array.isArray(curves) ? curves.length : typeof curves}`,
      );

      const doe = data.doeStressTest || data.doeMatrix || data.stressTests;
      assert.ok(
        Array.isArray(doe) && doe.length === 8,
        `[F7/M3] Expected 2^3 DOE stress test with 8 corner scenarios, got ${Array.isArray(doe) ? doe.length : typeof doe}`,
      );

      const memo =
        data.committeeMemoMarkdown || data.committeeMemo || data.memoMarkdown;
      assert.ok(
        typeof memo === 'string' && memo.includes('#') && memo.length > 80,
        `[F7/M3] Expected non-empty Markdown Committee Memo with headings for strategy "${strategy}"`,
      );
    });
  }
});
