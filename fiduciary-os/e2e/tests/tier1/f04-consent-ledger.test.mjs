import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, e2eNamespace } from '../../lib/config.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 1 — F4: CAN-SPAM, TCPA & GDPR/CCPA Consent Ledger', () => {
  it('[F4] POST/GET /api/v1/consent records and retrieves double-opt-in proofs for email, sms, and voice', async () => {
    const userId = e2eNamespace('consent-user');
    const channels = ['email', 'sms', 'voice'];

    for (const channel of channels) {
      const timestamp = new Date().toISOString();
      const proofHash = crypto
        .createHash('sha256')
        .update(`${userId}:${channel}:opted_in:${timestamp}`)
        .digest('hex');

      const postRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/consent', {
        method: 'POST',
        json: {
          userId,
          channel,
          status: 'opted_in',
          source: 'atlas_onboarding',
          timestamp,
          proofHash,
        },
      });
      assertStatus(
        postRes,
        [200, 201],
        'F4/M1',
        `POST /api/v1/consent (${channel})`,
      );
      const created = assertJsonObject(postRes, 'F4/M1', `consent ${channel}`);
      const record = created.data || created.consent || created;
      assert.equal(
        record.channel,
        channel,
        `[F4/M1] Expected echoed channel "${channel}"`,
      );
      assert.equal(
        record.status,
        'opted_in',
        `[F4/M1] Expected status "opted_in" for channel "${channel}"`,
      );
      assert.ok(
        typeof record.proofHash === 'string' && record.proofHash.length >= 16,
        `[F4/M1] Expected non-empty proofHash for channel "${channel}"`,
      );
    }

    const getRes = await apiFetch(
      E2E_BACKEND_URL,
      `/api/v1/consent?userId=${encodeURIComponent(userId)}`,
    );
    assertStatus(getRes, 200, 'F4/M1', 'GET /api/v1/consent');

    const payload = getRes.body;
    const records = Array.isArray(payload)
      ? payload
      : payload?.data || payload?.records || payload?.consents;
    assert.ok(
      Array.isArray(records) && records.length >= 3,
      `[F4/M1] Expected >= 3 persisted consent records for ${userId}, got ${JSON.stringify(payload)?.slice(0, 200)}`,
    );

    for (const channel of channels) {
      const match = records.find((r) => r.channel === channel);
      assert.ok(
        match && match.status === 'opted_in' && match.proofHash,
        `[F4/M1] Missing opted_in consent ledger record with proofHash for channel "${channel}"`,
      );
    }
  });
});
