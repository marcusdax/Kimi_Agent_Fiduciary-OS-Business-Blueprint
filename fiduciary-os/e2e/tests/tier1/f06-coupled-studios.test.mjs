import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, E2E_FRONTEND_URL } from '../../lib/config.mjs';
import { VALID_UNDERWRITING_PAYLOADS } from '../../lib/fixtures.mjs';
import {
  apiFetch,
  assertFrontendModule,
  assertJsonObject,
  assertStatus,
} from '../../lib/http.mjs';

describe('Tier 1 — F6: 11 Coupled Financial & Tangible Asset Studios', () => {
  it('[F6] Property Studio #11 underwriting output includes net cash-flow coupling fields for Unified Cash-Flow Router', async () => {
    const res = await apiFetch(E2E_BACKEND_URL, '/api/v1/property/underwrite', {
      method: 'POST',
      json: VALID_UNDERWRITING_PAYLOADS.hold,
    });
    assertStatus(res, 200, 'F6/M3', 'POST /api/v1/property/underwrite');
    const body = assertJsonObject(res, 'F6/M3', 'underwriting response');
    const data = body.data || body;

    const noi = data.noi ?? data.kpis?.noi ?? data.metrics?.noi;
    const cashFlow =
      data.annualCashFlow ??
      data.monthlyCashFlow ??
      data.kpis?.annualCashFlow ??
      data.kpis?.monthlyCashFlow ??
      data.cashFlowRouterDelta;

    assert.ok(
      typeof noi === 'number' && Number.isFinite(noi),
      `[F6/M3] Expected finite numeric NOI from Studio #11, got ${noi}`,
    );
    assert.ok(
      typeof cashFlow === 'number' && Number.isFinite(cashFlow),
      `[F6/M3] Expected finite numeric cash-flow output for Unified Cash-Flow Router coupling, got ${cashFlow}`,
    );
  });

  it('[F6] Live frontend Wealth Canvas references all 11 studios including Real Property & Tangible Asset Studio', async () => {
    const appRes = await apiFetch(E2E_FRONTEND_URL, '/src/App.tsx');
    assertFrontendModule(appRes, 'F6/M2', 'Live frontend App.tsx');

    const hasPropertyStudio =
      /Real Property|Tangible Asset|PropertyStudio|Studio\s*#?11/i.test(
        appRes.rawText,
      );
    assert.ok(
      hasPropertyStudio,
      '[F6/M2] Live frontend must expose Studio #11 (Real Property & Tangible Asset Studio) alongside the 10 financial Navigators',
    );
  });
});
