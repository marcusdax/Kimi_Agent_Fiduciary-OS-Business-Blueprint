import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, e2eNamespace } from '../../lib/config.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 1 — F14: Biomimicry 3.8 & Honeybee Democracy Governance', () => {
  it('[F14] POST /api/v1/governance/honeybee/align computes weighted household consensus and Biomimicry cash-flow allocation', async () => {
    const res = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/governance/honeybee/align',
      {
        method: 'POST',
        json: {
          householdId: e2eNamespace('honeybee-hh'),
          seed: 101,
          members: [
            {
              memberId: 'parent-a',
              weight: 0.45,
              priorities: {
                emergencyReserve: 0.9,
                collegeSavings: 0.8,
                retirementIncome: 0.85,
                legacyTransfer: 0.7,
              },
            },
            {
              memberId: 'parent-b',
              weight: 0.45,
              priorities: {
                emergencyReserve: 0.85,
                collegeSavings: 0.75,
                retirementIncome: 0.9,
                legacyTransfer: 0.65,
              },
            },
            {
              memberId: 'grandparent',
              weight: 0.1,
              priorities: {
                emergencyReserve: 0.8,
                collegeSavings: 0.9,
                retirementIncome: 0.8,
                legacyTransfer: 0.95,
              },
            },
          ],
          monthlySurplusUsd: 4500,
        },
      },
    );
    assertStatus(res, 200, 'F14/M4', 'POST /api/v1/governance/honeybee/align');
    const body = assertJsonObject(res, 'F14/M4', 'honeybee align');
    const data = body.data || body;

    assert.ok(
      typeof data.consensusScore === 'number' ||
        typeof data.alignmentScore === 'number',
      '[F14/M4] Honeybee align response must include numeric consensusScore/alignmentScore',
    );
    assert.ok(
      data.allocation || data.cashFlowAllocation || data.biomimicryAllocation,
      '[F14/M4] Honeybee align response must include Biomimicry multi-constraint cash-flow allocation',
    );
  });

  it('[F14] POST /api/v1/governance/swarm-critic executes 4 independent scouts and returns quorum convergence', async () => {
    const res = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/governance/swarm-critic',
      {
        method: 'POST',
        json: {
          seed: 101,
          proposal: {
            strategy: 'balanced_family_stewardship',
            horizonYears: 20,
            liquidityMonths: 9,
            leverageRatio: 0.25,
            highVolatilityPct: 0.03,
          },
        },
      },
    );
    assertStatus(res, 200, 'F14/M4', 'POST /api/v1/governance/swarm-critic');
    const body = assertJsonObject(res, 'F14/M4', 'swarm-critic');
    const data = body.data || body;

    const scouts = data.scouts || data.verdicts;
    assert.ok(
      Array.isArray(scouts) && scouts.length === 4,
      `[F14/M4] Expected exactly 4 independent swarm-critic scouts, got ${Array.isArray(scouts) ? scouts.length : typeof scouts}`,
    );
    assert.equal(
      typeof data.converged,
      'boolean',
      '[F14/M4] Swarm critic response must include boolean converged verdict',
    );
  });
});
