import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, e2eNamespace } from '../../lib/config.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 1 — F15: Audited Financial, Insurance & Identity Connectors', () => {
  it('[F15] GET /api/v1/connectors/status reports all audited connectors including Gemini 4 Api-Revision 2026-05-20', async () => {
    const res = await apiFetch(E2E_BACKEND_URL, '/api/v1/connectors/status');
    assertStatus(res, 200, 'F15/M4', 'GET /api/v1/connectors/status');
    const body = assertJsonObject(res, 'F15/M4', 'connectors status');
    const raw = JSON.stringify(body).toLowerCase();

    for (const expected of [
      'plaid',
      'ipipeline',
      'annuity',
      'cannex',
      'compulife',
      'gemini',
      'auth0',
      'twilio',
    ]) {
      assert.ok(
        raw.includes(expected),
        `[F15/M4] Connector status missing required audited connector "${expected}"`,
      );
    }
    assert.ok(
      raw.includes('2026-05-20'),
      '[F15/M4] Connector status must declare Gemini 4 Interactions Api-Revision 2026-05-20',
    );
  });

  it('[F15] POST /api/v1/connectors/plaid/sync returns cursor-based incremental sync payload', async () => {
    const res = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/connectors/plaid/sync',
      {
        method: 'POST',
        json: {
          userId: e2eNamespace('plaid-user'),
          tier: 'paid',
          institutionId: 'ins_109508',
          cursor: null,
        },
      },
    );
    assertStatus(res, 200, 'F15/M4', 'POST /api/v1/connectors/plaid/sync');
    const body = assertJsonObject(res, 'F15/M4', 'plaid sync');
    const data = body.data || body;

    assert.ok(
      typeof data.nextCursor === 'string' && data.nextCursor.length > 0,
      '[F15/M4] Plaid /transactions/sync response must include non-empty nextCursor',
    );
    assert.ok(
      Array.isArray(data.added) &&
        Array.isArray(data.modified) &&
        Array.isArray(data.removed),
      '[F15/M4] Plaid sync response must include added[], modified[], removed[] arrays',
    );
  });

  it('[F15] POST /api/v1/connectors/quotes/compare with valid REMOTE_IP returns timestamped multi-carrier quotes', async () => {
    const res = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/connectors/quotes/compare',
      {
        method: 'POST',
        headers: { 'x-remote-ip': '203.0.113.42' },
        json: {
          remoteIp: '203.0.113.42',
          state: 'CA',
          age: 44,
          gender: 'F',
          smoker: false,
          faceAmountUsd: 1000000,
          termYears: 20,
        },
      },
    );
    assertStatus(res, 200, 'F15/M4', 'POST /api/v1/connectors/quotes/compare');
    const body = assertJsonObject(res, 'F15/M4', 'quotes compare');
    const data = body.data || body;

    const quotes = data.quotes || data.carriers;
    assert.ok(
      Array.isArray(quotes) && quotes.length > 0,
      '[F15/M4] Expected non-empty multi-carrier quotes array',
    );
    assert.equal(
      data.assumptionSource,
      'timestamped_api',
      `[F15/M4] Carrier quote comparison must declare assumptionSource="timestamped_api", got "${data.assumptionSource}"`,
    );
  });
});
