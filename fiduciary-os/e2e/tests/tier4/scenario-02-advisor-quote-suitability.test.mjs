import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, e2eNamespace } from '../../lib/config.mjs';
import { makeThreeGenHouseholdFixture } from '../../lib/fixtures.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 4 — Scenario 02: Advisor Command Center Multi-Carrier Quote & Suitability Workflow', () => {
  it('[F3][F8][F9][F11][F15][F17] Seeds CRM household & appointment, pulls timestamped carrier quotes with REMOTE_IP, and passes Gate 2 + Gate 4 WORM suitability review', async () => {
    const ns = e2eNamespace('s02-advisor');
    const fx = makeThreeGenHouseholdFixture(ns);

    // 1. Seed household + person + appointment in PostgreSQL CRM
    const hhRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/crm/households', {
      method: 'POST',
      json: fx.household,
    });
    assertStatus(hhRes, [200, 201], 'S2/F8', 'Create CRM household');
    const householdId = (assertJsonObject(hhRes, 'S2/F8').data || hhRes.body).id;

    const personRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/crm/people', {
      method: 'POST',
      json: { ...fx.members[1], householdId },
    });
    assertStatus(personRes, [200, 201], 'S2/F8', 'Create CRM person');
    const personId = (assertJsonObject(personRes, 'S2/F8').data || personRes.body).id;

    const apptRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/crm/appointments', {
      method: 'POST',
      json: { ...fx.appointment, householdId, personId },
    });
    assertStatus(apptRes, [200, 201], 'S2/F8', 'Create CRM appointment');

    // 2. Pull timestamped multi-carrier quotes with REMOTE_IP
    const quoteRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/connectors/quotes/compare',
      {
        method: 'POST',
        headers: { 'x-remote-ip': '198.51.100.24' },
        json: {
          remoteIp: '198.51.100.24',
          householdId,
          state: 'CA',
          age: 44,
          gender: 'F',
          smoker: false,
          faceAmountUsd: 1500000,
          termYears: 20,
        },
      },
    );
    assertStatus(quoteRes, 200, 'S2/F15', 'Multi-carrier quotes compare');
    const quoteData = assertJsonObject(quoteRes, 'S2/F15').data || quoteRes.body;
    assert.equal(
      quoteData.assumptionSource,
      'timestamped_api',
      '[S2/F15] Quotes must carry assumptionSource="timestamped_api"',
    );

    // 3. Evaluate suitability illustration through Gate 2 + Gate 4 WORM
    const evalRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/compliance/evaluate',
      {
        method: 'POST',
        json: {
          sessionId: ns,
          surface: 'command',
          text: 'Multi-Carrier Quote & Suitability Router comparison based on timestamped carrier API schedules with SEC 206(4)-1 Risk Drawer attached.',
          hasForwardLookingProjection: true,
        },
      },
    );
    assertStatus(evalRes, 200, 'S2/F17', 'Suitability compliance evaluate');
    const evalData = assertJsonObject(evalRes, 'S2/F17').data || evalRes.body;
    assert.equal(evalData.allowed, true, '[S2/F17] Compliant illustration must be allowed');
    assert.equal(
      evalData.riskDrawerRequired,
      true,
      '[S2/F3+F17] Forward-looking illustration must require Risk Drawer',
    );
    assert.match(
      String(evalData.wormReceiptHash || ''),
      /^[a-f0-9]{64}$/i,
      '[S2/F17] Suitability evaluation must produce 64-hex WORM receipt hash',
    );
  });
});
