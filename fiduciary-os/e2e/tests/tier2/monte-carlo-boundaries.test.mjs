import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL } from '../../lib/config.mjs';
import {
  UNSOURCED_STATIC_RATIOS,
  VALID_MONTE_CARLO_PAYLOAD,
} from '../../lib/fixtures.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 2 — Boundary & Corner Cases: Monte Carlo & Unsourced Static Ratios', () => {
  it('[F11] Monte Carlo enforces path bounds: rejects 0, -1, 10001, and string paths; accepts 1 and 10000', async () => {
    for (const badPaths of [0, -1, 10001, '1000']) {
      const res = await apiFetch(
        E2E_BACKEND_URL,
        '/api/v1/calculations/retirement-simulation',
        {
          method: 'POST',
          json: { ...VALID_MONTE_CARLO_PAYLOAD, paths: badPaths },
        },
      );
      assertStatus(
        res,
        [400, 422],
        'F11/M3',
        `Monte Carlo invalid paths=${JSON.stringify(badPaths)}`,
      );
    }

    // Degenerate single path (paths = 1): p10 === p50 === p90
    const oneRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/calculations/retirement-simulation',
      {
        method: 'POST',
        json: { ...VALID_MONTE_CARLO_PAYLOAD, paths: 1 },
      },
    );
    assertStatus(oneRes, 200, 'F11/M3', 'Monte Carlo paths=1 degenerate boundary');
    const oneBody = assertJsonObject(oneRes, 'F11/M3', 'paths=1');
    const bands = oneBody.data?.percentiles || oneBody.percentiles || oneBody.data || oneBody;
    const extract = (v) => (Array.isArray(v) ? Number(v[v.length - 1]) : Number(v));
    assert.equal(
      extract(bands.p10),
      extract(bands.p90),
      '[F11/M3] For paths=1, p10 must equal p90',
    );

    // Max boundary (paths = 10000)
    const maxRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/calculations/retirement-simulation',
      {
        method: 'POST',
        json: { ...VALID_MONTE_CARLO_PAYLOAD, paths: 10000 },
      },
    );
    assertStatus(maxRes, 200, 'F11/M3', 'Monte Carlo paths=10000 max boundary');
    assert.ok(
      !maxRes.rawText.includes('NaN'),
      '[F11/M3] Monte Carlo 10,000-path response must contain zero NaN values',
    );
  });

  it('[F11] Rejects unsourced static marketing ratios (1.25x leverage / 11.10% FIA payout) without valid assumptionSource', async () => {
    // Baseline: confirm the M3 contract accepts a valid sourced payload first
    // so a legacy endpoint generic 400 cannot cause a false pass.
    const baselineRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/calculations/retirement-simulation',
      {
        method: 'POST',
        json: {
          ...VALID_MONTE_CARLO_PAYLOAD,
          paths: 100,
          assumptionSource: 'user_declared_hypothetical',
        },
      },
    );
    assertStatus(
      baselineRes,
      200,
      'F11/M3',
      'Valid baseline Monte Carlo payload (paths=100, user_declared_hypothetical) must succeed before testing unsourced static ratio rejection',
    );

    const unsourcedCases = [
      {
        label: '1.25x unsourced leverageFactor',
        payload: {
          ...VALID_MONTE_CARLO_PAYLOAD,
          paths: 100,
          assumptionSource: undefined,
          leverageFactor: UNSOURCED_STATIC_RATIOS.leverageFactor,
        },
      },
      {
        label: '11.10% unsourced fiaPayoutRate',
        payload: {
          ...VALID_MONTE_CARLO_PAYLOAD,
          paths: 100,
          assumptionSource: undefined,
          fiaPayoutRate: UNSOURCED_STATIC_RATIOS.fiaPayoutRate,
        },
      },
    ];

    for (const testCase of unsourcedCases) {
      const res = await apiFetch(
        E2E_BACKEND_URL,
        '/api/v1/calculations/retirement-simulation',
        {
          method: 'POST',
          json: testCase.payload,
        },
      );
      assertStatus(
        res,
        [400, 422],
        'F11/M3',
        `Unsourced static marketing ratio (${testCase.label}) must be rejected`,
      );
      const errBody = assertJsonObject(
        res,
        'F11/M3',
        `Unsourced static ratio error response (${testCase.label})`,
      );
      const errText = JSON.stringify(errBody);
      assert.match(
        errText,
        /unsourced|static|ratio|assumptionSource|leverageFactor|fiaPayoutRate/i,
        `[F11/M3] Rejection for ${testCase.label} must explicitly cite unsourced/static/ratio/assumptionSource (got: ${errText.slice(0, 200)})`,
      );
    }
  });
});
