import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, E2E_FRONTEND_URL } from '../../lib/config.mjs';
import {
  UNSOURCED_STATIC_RATIOS,
  VALID_MONTE_CARLO_PAYLOAD,
} from '../../lib/fixtures.mjs';
import {
  apiFetch,
  assertFrontendModule,
  assertJsonObject,
  assertStatus,
} from '../../lib/http.mjs';

describe('Tier 1 — F11: 6 Signature Interactive Charts & Static Ratio Ban', () => {
  it('[F11] POST /api/v1/calculations/retirement-simulation executes 10,000 paths with monotonic percentile bands and explicit assumptionSource', async () => {
    const res = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/calculations/retirement-simulation',
      {
        method: 'POST',
        json: VALID_MONTE_CARLO_PAYLOAD,
      },
    );
    assertStatus(
      res,
      200,
      'F11/M3',
      'POST /api/v1/calculations/retirement-simulation (10,000 paths)',
    );
    const body = assertJsonObject(res, 'F11/M3', 'retirement simulation');
    const data = body.data || body;

    assert.ok(
      data.assumptionSource === 'timestamped_api' ||
        data.assumptionSource === 'user_declared_hypothetical',
      `[F11/M3] Expected assumptionSource to be "timestamped_api" or "user_declared_hypothetical", got "${data.assumptionSource}"`,
    );

    const bands = data.percentiles || data.bands || data;
    for (const key of ['p10', 'p25', 'p50', 'p75', 'p90']) {
      assert.ok(
        bands[key] !== undefined,
        `[F11/M3] Missing percentile band "${key}" in simulation response`,
      );
    }

    const extractNum = (v) =>
      Array.isArray(v) ? Number(v[v.length - 1]) : Number(v);
    const [p10, p25, p50, p75, p90] = [
      extractNum(bands.p10),
      extractNum(bands.p25),
      extractNum(bands.p50),
      extractNum(bands.p75),
      extractNum(bands.p90),
    ];
    assert.ok(
      [p10, p25, p50, p75, p90].every(Number.isFinite),
      '[F11/M3] All percentile band values must be finite numbers',
    );
    assert.ok(
      p10 <= p25 && p25 <= p50 && p50 <= p75 && p75 <= p90,
      `[F11/M3] Percentile bands must be monotonic (p10<=p25<=p50<=p75<=p90), got [${p10}, ${p25}, ${p50}, ${p75}, ${p90}]`,
    );

    assert.ok(
      data.baseIncomeFloor !== undefined,
      '[F11/M3] Missing baseIncomeFloor in retirement simulation output',
    );

    for (const forbidden of UNSOURCED_STATIC_RATIOS.forbiddenLabels) {
      assert.ok(
        !res.rawText.includes(forbidden),
        `[F11/M3] Unsourced static marketing ratio "${forbidden}" appeared in simulation response`,
      );
    }
  });

  it('[F11] Frontend exposes all 6 signature charts index without unsourced static ratios', async () => {
    const res = await apiFetch(
      E2E_FRONTEND_URL,
      '/src/components/charts/index.ts',
    );
    assertFrontendModule(
      res,
      'F11/M3',
      'Signature charts barrel /src/components/charts/index.ts',
    );
    const exportMatches = res.rawText.match(/export\s+/g) || [];
    assert.ok(
      exportMatches.length >= 6,
      `[F11/M3] Expected at least 6 signature chart exports in charts/index.ts, found ${exportMatches.length}`,
    );
    for (const forbidden of UNSOURCED_STATIC_RATIOS.forbiddenLabels) {
      assert.ok(
        !res.rawText.includes(forbidden),
        `[F11/M3] Unsourced static ratio "${forbidden}" found in signature charts module`,
      );
    }
  });
});
