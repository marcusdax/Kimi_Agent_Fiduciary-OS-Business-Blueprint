import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  E2E_BACKEND_URL,
  E2E_FRONTEND_URL,
  e2eNamespace,
} from '../../lib/config.mjs';
import {
  VALID_MONTE_CARLO_PAYLOAD,
  VALID_UNDERWRITING_PAYLOADS,
} from '../../lib/fixtures.mjs';
import {
  apiFetch,
  assertFrontendModule,
  assertJsonObject,
  assertStatus,
} from '../../lib/http.mjs';
import { validateRoCrateZip } from '../../lib/zip.mjs';

describe('Tier 4 — Scenario 01: Planner Parent Household Stewardship Journey', () => {
  it('[F1][F3][F5][F6][F7][F9][F10][F11][F12][F14][F16] Full 5-stage consumer journey from AUCTUM.ATLAS checkup to 10k-path model, Property Studio, Swarm Critic HITL, and RO-Crate WORM export', async () => {
    const sessionId = e2eNamespace('s01-planner');

    // 1. Discover & Orient: AUCTUM.ATLAS lexicon & 3-slider checkup live on frontend
    const lexRes = await apiFetch(E2E_FRONTEND_URL, '/src/lib/lexicon.ts');
    assertFrontendModule(lexRes, 'S1/F1', 'AUCTUM.ATLAS lexicon');
    assert.ok(
      lexRes.rawText.includes('Build a Future for Your Family, One Step at a Time.') &&
        lexRes.rawText.includes('Map Our Next Family Step'),
      '[S1/F1] Consumer homepage lexicon missing hero tagline or primary CTA',
    );

    const checkupRes = await apiFetch(
      E2E_FRONTEND_URL,
      '/src/components/HouseholdCheckup.tsx',
    );
    assertFrontendModule(checkupRes, 'S1/F5', '3-Slider HouseholdCheckup');

    // 2. Map & Model: 10,000-path Longevity Fan + Real Property Studio #11 Buy & Hold
    const mcRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/calculations/retirement-simulation',
      { method: 'POST', json: VALID_MONTE_CARLO_PAYLOAD },
    );
    assertStatus(mcRes, 200, 'S1/F11', '10,000-path retirement simulation');

    const propRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/property/underwrite',
      { method: 'POST', json: VALID_UNDERWRITING_PAYLOADS.hold },
    );
    assertStatus(propRes, 200, 'S1/F7', 'Studio #11 Buy & Hold underwriting');

    // 3. Verify & Escalate: Swarm Critic + Living Lab Notebook + Freeze Plan
    const swarmRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/governance/swarm-critic',
      {
        method: 'POST',
        json: {
          sessionId,
          seed: 42,
          proposal: {
            strategy: 'planner_parent_stewardship',
            horizonYears: 22,
            liquidityMonths: 8,
            leverageRatio: 0.3,
            highVolatilityPct: 0.04,
          },
        },
      },
    );
    assertStatus(swarmRes, 200, 'S1/F14', '4-Scout Swarm Critic evaluation');

    const nbRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/provenance/notebook', {
      method: 'POST',
      json: {
        sessionId,
        stage: 'steward_export',
        entry: 'Planner parent completed 5-stage stewardship journey',
      },
    });
    assertStatus(nbRes, [200, 201], 'S1/F12', 'Living Lab Notebook append');

    const freezeRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/provenance/freeze-plan',
      { method: 'POST', json: { sessionId, planSummary: 'Planner parent plan' } },
    );
    assertStatus(freezeRes, [200, 201], 'S1/F12', 'Freeze Analysis Plan');
    const freezeObj = assertJsonObject(freezeRes, 'S1/F12', 'freeze');
    assert.ok((freezeObj.data || freezeObj).planHash, '[S1/F12] Missing planHash');

    // 4. Steward & Transfer: RO-Crate 1.1 ZIP export
    const zipRes = await apiFetch(
      E2E_BACKEND_URL,
      `/api/v1/provenance/ro-crate/${encodeURIComponent(sessionId)}`,
      { binary: true },
    );
    assertStatus(zipRes, 200, 'S1/F12', 'RO-Crate 1.1 ZIP download');
    validateRoCrateZip(zipRes.buffer, 'S1/F12');
  });
});
