import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, e2eNamespace } from '../../lib/config.mjs';
import { UNSOURCED_STATIC_RATIOS } from '../../lib/fixtures.mjs';
import { runCopyLinter, withTempFixtureFile } from '../../lib/fs-helpers.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 4 — Scenario 06: High-Volatility Guardrail & Unsourced Claim Rejection', () => {
  it('[F1][F2][F3][F11][F17] Blocks unsourced 1.25x/11.10% promotional claims in Gate 2, rejects via lint:copy, and triggers Gate 3 HITL + Risk Drawer on high-volatility allocation', async () => {
    const badClaimText =
      'Guaranteed growth of 11.10% with our 1.25x leverage factor — beat the market, Act now! Allocate 50% to high-volatility crypto.';

    // 1. Gate 2 + Gate 3 compliance evaluation
    const compRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/compliance/evaluate',
      {
        method: 'POST',
        json: {
          sessionId: e2eNamespace('s06-guardrail'),
          surface: 'atlas',
          text: badClaimText,
          highVolatilityAllocationPct: 0.5,
          leverageFactor: UNSOURCED_STATIC_RATIOS.leverageFactor,
          fiaPayoutRate: UNSOURCED_STATIC_RATIOS.fiaPayoutRate,
        },
      },
    );
    assertStatus(compRes, 200, 'S6/F17', 'POST /api/v1/compliance/evaluate');
    const data = assertJsonObject(compRes, 'S6/F17').data || compRes.body;

    assert.equal(
      data.allowed,
      false,
      '[S6/F17] Gate 2 must block promotional + unsourced static ratio claims',
    );
    assert.ok(
      Array.isArray(data.violations) && data.violations.length > 0,
      '[S6/F17] Gate 2 must report explicit FINRA 2210 / SEC 206(4)-1 violations',
    );
    assert.equal(
      data.riskDrawerRequired,
      true,
      '[S6/F3+F17] High-volatility guardrail scenario must set riskDrawerRequired=true',
    );
    assert.ok(
      typeof data.hitlTicketId === 'string' && data.hitlTicketId.length > 0,
      '[S6/F17] High-volatility allocation guardrail must trigger Gate 3 HITL Escalation Pause (hitlTicketId)',
    );

    // 2. lint:copy independently rejects the promotional copy
    await withTempFixtureFile(
      's06-bad-claim.tsx',
      `export const badClaim = ${JSON.stringify(badClaimText)};`,
      (fixturePath) => {
        const lintRes = runCopyLinter([fixturePath]);
        assert.equal(
          lintRes.scriptDefined,
          true,
          '[S6/F2] Missing "lint:copy" script in fiduciary-os/frontend/package.json',
        );
        assert.notEqual(
          lintRes.exitCode,
          0,
          '[S6/F2] lint:copy must independently reject promotional claim text',
        );
      },
    );
  });
});
