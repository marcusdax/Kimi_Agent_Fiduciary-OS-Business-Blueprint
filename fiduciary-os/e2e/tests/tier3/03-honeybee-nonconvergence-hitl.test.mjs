import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, e2eNamespace } from '../../lib/config.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 3 — 03: Honeybee 4-Scout Swarm Critic Non-Convergence (F14) × Gate 3 HITL Escalation (F17)', () => {
  it('[F14][F17] Conflicted high-risk proposal fails 4-scout quorum and automatically triggers Gate 3 HITL Escalation Pause', async () => {
    const res = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/governance/swarm-critic',
      {
        method: 'POST',
        json: {
          sessionId: e2eNamespace('swarm-hitl'),
          seed: 999,
          proposal: {
            strategy: 'aggressive_leveraged_speculation',
            horizonYears: 2,
            liquidityMonths: 1,
            leverageRatio: 3.5,
            highVolatilityPct: 0.65,
            earlyWithdrawalTaxPenalty: true,
          },
        },
      },
    );
    assertStatus(
      res,
      200,
      'F14+F17/M4',
      'POST /api/v1/governance/swarm-critic (conflicted high-risk)',
    );
    const body = assertJsonObject(res, 'F14+F17/M4', 'swarm-critic HITL');
    const data = body.data || body;

    const scouts = data.scouts || data.verdicts;
    assert.ok(
      Array.isArray(scouts) && scouts.length === 4,
      '[F14+F17/M4] Swarm critic must evaluate all 4 independent scouts',
    );
    assert.equal(
      data.converged,
      false,
      '[F14+F17/M4] Conflicted high-risk scenario must NOT converge (converged=false)',
    );
    assert.ok(
      typeof data.hitlTicketId === 'string' && data.hitlTicketId.length > 0,
      '[F14+F17/M4] Non-convergent swarm verdict must automatically trigger Gate 3 HITL ticket (hitlTicketId)',
    );
    assert.equal(
      data.status,
      'pending_advisor_review',
      `[F14+F17/M4] Expected status="pending_advisor_review", got "${data.status}"`,
    );
  });
});
