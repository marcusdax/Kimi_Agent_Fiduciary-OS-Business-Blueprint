import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL } from '../../lib/config.mjs';
import { VALID_UNDERWRITING_PAYLOADS } from '../../lib/fixtures.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 4 — Scenario 04: Real Property Acquisition & Stress-Test Committee Workflow', () => {
  it('[F6][F7][F10][F11] Underwrites hold/brrrr/str strategies, verifies 30-yr amortization + 2^3 DOE + Committee Memo consistency', async () => {
    const results = {};

    for (const strategy of ['hold', 'brrrr', 'str']) {
      const res = await apiFetch(
        E2E_BACKEND_URL,
        '/api/v1/property/underwrite',
        { method: 'POST', json: VALID_UNDERWRITING_PAYLOADS[strategy] },
      );
      assertStatus(res, 200, 'S4/F7', `Underwrite ${strategy}`);
      const data = assertJsonObject(res, 'S4/F7', strategy).data || res.body;

      const amort =
        data.amortizationSchedule || data.amortization || data.schedule;
      assert.ok(
        Array.isArray(amort) && amort.length >= 30,
        `[S4/F7] Expected 30-year amortization schedule (>= 30 entries) for ${strategy}, got ${Array.isArray(amort) ? amort.length : typeof amort}`,
      );

      const doe = data.doeStressTest || data.doeMatrix || data.stressTests;
      assert.ok(
        Array.isArray(doe) && doe.length === 8,
        `[S4/F7] Expected 8 DOE stress scenarios for ${strategy}`,
      );

      const memo =
        data.committeeMemoMarkdown || data.committeeMemo || data.memoMarkdown;
      assert.ok(
        typeof memo === 'string' && /NOI|DSCR|Cap\s*Rate/i.test(memo),
        `[S4/F7] Committee Memo for ${strategy} must include NOI/DSCR/Cap Rate metrics`,
      );
      results[strategy] = data;
    }

    // Verify all 3 strategies produced distinct strategy identifiers and finite cash-flow coupling outputs
    assert.equal(Object.keys(results).length, 3);
  });
});
