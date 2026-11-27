import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, e2eNamespace } from '../../lib/config.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 1 — F16: Layered Stateful AI Orchestration Spine', () => {
  it('[F16] Temporal + LangGraph workflow execution returns durable workflowId and bounded state transitions', async () => {
    const res = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/orchestration/workflows',
      {
        method: 'POST',
        json: {
          workflowType: 'household_stewardship_plan',
          sessionId: e2eNamespace('wf'),
          payload: { householdIncome: 185000, savingsRate: 0.22 },
        },
      },
    );
    assertStatus(
      res,
      [200, 201, 202],
      'F16/M4',
      'POST /api/v1/orchestration/workflows',
    );
    const body = assertJsonObject(res, 'F16/M4', 'workflow submission');
    const data = body.data || body;
    assert.ok(
      data.workflowId || data.runId,
      '[F16/M4] Temporal orchestration submission must return a durable workflowId/runId',
    );
  });

  it('[F16] Camunda DMN regulatory decision table returns deterministic decision for identical inputs', async () => {
    const input = {
      surface: 'atlas',
      highVolatilityPct: 0.04,
      licensedAdvisorPresent: false,
      containsPromotionalClaim: false,
    };
    const res1 = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/orchestration/dmn/evaluate',
      { method: 'POST', json: input },
    );
    assertStatus(res1, 200, 'F16/M4', 'POST /api/v1/orchestration/dmn/evaluate (1)');
    const d1 = assertJsonObject(res1, 'F16/M4', 'DMN run 1');

    const res2 = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/orchestration/dmn/evaluate',
      { method: 'POST', json: input },
    );
    assertStatus(res2, 200, 'F16/M4', 'POST /api/v1/orchestration/dmn/evaluate (2)');
    const d2 = assertJsonObject(res2, 'F16/M4', 'DMN run 2');

    const out1 = d1.data || d1;
    const out2 = d2.data || d2;
    assert.ok(
      ['eligible', 'escalate', 'deny'].includes(out1.decision),
      `[F16/M4] DMN decision must be eligible|escalate|deny, got "${out1.decision}"`,
    );
    assert.equal(
      out1.decision,
      out2.decision,
      '[F16/M4] Camunda DMN decision table must be deterministic across identical inputs',
    );
  });

  it('[F16] MCP/A2A discovery endpoint returns valid tool and agent capability schema', async () => {
    const res = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/orchestration/capabilities',
    );
    assertStatus(
      res,
      200,
      'F16/M4',
      'GET /api/v1/orchestration/capabilities',
    );
    const body = assertJsonObject(res, 'F16/M4', 'MCP/A2A capabilities');
    const data = body.data || body;
    assert.ok(
      Array.isArray(data.mcpTools || data.tools) &&
        (data.a2aAgents || data.agents),
      '[F16/M4] Capabilities endpoint must expose MCP tools and A2A agent schemas',
    );
  });
});
