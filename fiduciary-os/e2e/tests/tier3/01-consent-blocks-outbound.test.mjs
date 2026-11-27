import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, e2eEmail, e2eNamespace } from '../../lib/config.mjs';
import { apiFetch, assertStatus } from '../../lib/http.mjs';

describe('Tier 3 — 01: Consent Ledger (F4) × Outbound Twilio/SES Dispatch (F15)', () => {
  it('[F4][F15] Opted-out user is strictly blocked from SMS/email outbound dispatch; flipping to double-opt-in permits dry-run dispatch', async () => {
    const userId = e2eNamespace('consent-outbound');
    const email = e2eEmail('outbound');
    const ts1 = new Date().toISOString();

    for (const channel of ['sms', 'email']) {
      const optOut = await apiFetch(E2E_BACKEND_URL, '/api/v1/consent', {
        method: 'POST',
        json: {
          userId,
          channel,
          status: 'opted_out',
          source: 'user_preferences',
          timestamp: ts1,
          proofHash: crypto
            .createHash('sha256')
            .update(`${userId}:${channel}:opted_out:${ts1}`)
            .digest('hex'),
        },
      });
      assertStatus(optOut, [200, 201], 'F4/M1', `opt-out ${channel}`);
    }

    const blockedSms = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/connectors/outreach/send',
      {
        method: 'POST',
        json: {
          userId,
          channel: 'sms',
          to: '+14155550100',
          message: 'Reminder: review your Family Document Binder',
          dryRun: true,
        },
      },
    );
    assertStatus(
      blockedSms,
      [403, 422],
      'F4+F15/M4',
      'SMS dispatch for opted_out user must be blocked',
    );

    const blockedEmail = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/connectors/outreach/send',
      {
        method: 'POST',
        json: {
          userId,
          channel: 'email',
          to: email,
          subject: 'Family Stewardship Update',
          message: 'Educational update ready',
          dryRun: true,
        },
      },
    );
    assertStatus(
      blockedEmail,
      [403, 422],
      'F4+F15/M4',
      'Email dispatch for opted_out user must be blocked',
    );

    // Flip email to opted_in with double-opt-in proofHash
    const ts2 = new Date().toISOString();
    const optIn = await apiFetch(E2E_BACKEND_URL, '/api/v1/consent', {
      method: 'POST',
      json: {
        userId,
        channel: 'email',
        status: 'opted_in',
        source: 'double_opt_in_confirmation',
        timestamp: ts2,
        proofHash: crypto
          .createHash('sha256')
          .update(`${userId}:email:opted_in:${ts2}`)
          .digest('hex'),
      },
    });
    assertStatus(optIn, [200, 201], 'F4/M1', 'flip email to opted_in');

    const allowedEmail = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/connectors/outreach/send',
      {
        method: 'POST',
        json: {
          userId,
          channel: 'email',
          to: email,
          subject: 'Family Stewardship Update',
          message: 'Educational update ready',
          dryRun: true,
        },
      },
    );
    assertStatus(
      allowedEmail,
      [200, 201, 202],
      'F4+F15/M4',
      'Dry-run email dispatch must succeed after double-opt-in',
    );
  });
});
