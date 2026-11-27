import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, e2eNamespace } from '../../lib/config.mjs';
import { makeThreeGenHouseholdFixture } from '../../lib/fixtures.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 4 — Scenario 03: Multi-Generational Family Alignment & Estate Transfer', () => {
  it('[F1][F4][F6][F8][F10][F11][F14] Seeds 3-generation household, computes Honeybee alignment, and enforces per-member consent gating on notifications', async () => {
    const ns = e2eNamespace('s03-multigen');
    const fx = makeThreeGenHouseholdFixture(ns);

    const hhRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/crm/households', {
      method: 'POST',
      json: fx.household,
    });
    assertStatus(hhRes, [200, 201], 'S3/F8', 'Create 3-gen household');
    const householdId = (assertJsonObject(hhRes, 'S3/F8').data || hhRes.body).id;

    const createdMembers = [];
    for (const m of fx.members) {
      const mRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/crm/people', {
        method: 'POST',
        json: { ...m, householdId },
      });
      assertStatus(mRes, [200, 201], 'S3/F8', `Create ${m.role}`);
      const id = (assertJsonObject(mRes, 'S3/F8').data || mRes.body).id;
      createdMembers.push({ ...m, id });
    }

    // Honeybee Democracy weighted consensus across 3 generations
    const alignRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/governance/honeybee/align',
      {
        method: 'POST',
        json: {
          householdId,
          seed: 303,
          members: createdMembers.map((m, idx) => ({
            memberId: m.id,
            weight: idx === 0 ? 0.35 : idx === 1 ? 0.45 : 0.2,
            priorities: {
              emergencyReserve: 0.85,
              collegeSavings: 0.8,
              retirementIncome: 0.88,
              legacyTransfer: 0.9,
            },
          })),
          monthlySurplusUsd: 5200,
        },
      },
    );
    assertStatus(alignRes, 200, 'S3/F14', 'Honeybee 3-gen alignment');
    assertJsonObject(alignRes, 'S3/F14', 'honeybee alignment');

    // Set member 0 opted_out, members 1 & 2 opted_in
    const ts = new Date().toISOString();
    for (let i = 0; i < createdMembers.length; i++) {
      const m = createdMembers[i];
      const status = i === 0 ? 'opted_out' : 'opted_in';
      const cRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/consent', {
        method: 'POST',
        json: {
          userId: m.id,
          channel: 'email',
          status,
          source: 'multigen_portal',
          timestamp: ts,
          proofHash: crypto
            .createHash('sha256')
            .update(`${m.id}:email:${status}:${ts}`)
            .digest('hex'),
        },
      });
      assertStatus(cRes, [200, 201], 'S3/F4', `Consent ${status} for member ${i}`);
    }

    // Opted-out grandparent must be blocked; opted-in parent allowed (dry-run)
    const blocked = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/connectors/outreach/send',
      {
        method: 'POST',
        json: {
          userId: createdMembers[0].id,
          channel: 'email',
          to: createdMembers[0].email,
          subject: 'Family Alignment Summary',
          message: 'Your household alignment summary is ready.',
          dryRun: true,
        },
      },
    );
    assertStatus(blocked, [403, 422], 'S3/F4', 'Opted-out member notification blocked');

    const allowed = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/connectors/outreach/send',
      {
        method: 'POST',
        json: {
          userId: createdMembers[1].id,
          channel: 'email',
          to: createdMembers[1].email,
          subject: 'Family Alignment Summary',
          message: 'Your household alignment summary is ready.',
          dryRun: true,
        },
      },
    );
    assertStatus(allowed, [200, 201, 202], 'S3/F4', 'Opted-in member notification allowed');
  });
});
