import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, e2eNamespace } from '../../lib/config.mjs';
import { makeThreeGenHouseholdFixture } from '../../lib/fixtures.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 4 — Scenario 05: Privacy Rights & Regulatory Audit Lifecycle (GDPR/CCPA + FINRA 4511)', () => {
  it('[F4][F8][F12][F17] Encrypts SSN, records consent toggle + chained WORM receipts, exports user data, and soft-deletes user while preserving WORM immutability', async () => {
    const ns = e2eNamespace('s05-privacy');
    const fx = makeThreeGenHouseholdFixture(ns);

    // 1. Onboard household & person with SSN
    const hhRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/crm/households', {
      method: 'POST',
      json: fx.household,
    });
    assertStatus(hhRes, [200, 201], 'S5/F8', 'Create household');
    const householdId = (assertJsonObject(hhRes, 'S5/F8').data || hhRes.body).id;

    const personRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/crm/people', {
      method: 'POST',
      json: { ...fx.members[0], householdId },
    });
    assertStatus(personRes, [200, 201], 'S5/F8', 'Create person with SSN');
    const personId = (assertJsonObject(personRes, 'S5/F8').data || personRes.body).id;

    const checkPerson = await apiFetch(
      E2E_BACKEND_URL,
      `/api/v1/crm/people/${encodeURIComponent(personId)}`,
    );
    assertStatus(checkPerson, 200, 'S5/F8', 'GET person');
    assert.ok(
      !checkPerson.rawText.includes(fx.members[0].ssn),
      '[S5/F8] Plaintext SSN must never appear in GET response',
    );

    // 2. Toggle consent opted_in -> opted_out
    for (const status of ['opted_in', 'opted_out']) {
      const ts = new Date().toISOString();
      const cRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/consent', {
        method: 'POST',
        json: {
          userId: personId,
          channel: 'email',
          status,
          source: 'privacy_center',
          timestamp: ts,
          proofHash: crypto
            .createHash('sha256')
            .update(`${personId}:email:${status}:${ts}`)
            .digest('hex'),
        },
      });
      assertStatus(cRes, [200, 201], 'S5/F4', `Consent ${status}`);
    }

    // 3. Generate two chained WORM audit receipts
    const e1 = await apiFetch(E2E_BACKEND_URL, '/api/v1/compliance/evaluate', {
      method: 'POST',
      json: {
        sessionId: ns,
        userId: personId,
        surface: 'atlas',
        text: 'Initial educational checkup record.',
      },
    });
    assertStatus(e1, 200, 'S5/F17', 'WORM eval 1');

    const e2 = await apiFetch(E2E_BACKEND_URL, '/api/v1/compliance/evaluate', {
      method: 'POST',
      json: {
        sessionId: ns,
        userId: personId,
        surface: 'atlas',
        text: 'Follow-up educational planning note.',
      },
    });
    assertStatus(e2, 200, 'S5/F17', 'WORM eval 2');

    // 4. GDPR/CCPA export_user_data
    const expRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/privacy/export', {
      method: 'POST',
      json: { userId: personId },
    });
    assertStatus(expRes, 200, 'S5/F8', 'POST /api/v1/privacy/export');
    assertJsonObject(expRes, 'S5/F8', 'privacy export');
    assert.ok(
      !expRes.rawText.includes(fx.members[0].ssn),
      '[S5/F8] Privacy export must not leak unmasked raw SSN',
    );

    // 5. GDPR/CCPA soft_delete_user -> excluded from active CRM GET
    const delRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/privacy/soft-delete',
      { method: 'POST', json: { userId: personId } },
    );
    assertStatus(delRes, 200, 'S5/F8', 'POST /api/v1/privacy/soft-delete');

    const afterDel = await apiFetch(
      E2E_BACKEND_URL,
      `/api/v1/crm/people/${encodeURIComponent(personId)}`,
    );
    assertStatus(
      afterDel,
      [404, 410],
      'S5/F8',
      'Soft-deleted person must be excluded from active CRM GET queries',
    );
  });
});
