import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, e2eNamespace } from '../../lib/config.mjs';
import { makeThreeGenHouseholdFixture } from '../../lib/fixtures.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 3 — 04: PostgreSQL Household Graph CRM (F8) × Multi-Gen Beneficiary Constellation (F11)', () => {
  it('[F8][F11] 3-generation household seeded in CRM is retrievable as a hierarchical beneficiary constellation graph', async () => {
    const ns = e2eNamespace('constellation');
    const fx = makeThreeGenHouseholdFixture(ns);

    const hhRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/crm/households', {
      method: 'POST',
      json: fx.household,
    });
    assertStatus(hhRes, [200, 201], 'F8+F11/M1', 'POST /api/v1/crm/households');
    const hhObj = assertJsonObject(hhRes, 'F8+F11/M1', 'household');
    const householdId = (hhObj.data || hhObj).id;

    for (const member of fx.members) {
      const mRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/crm/people', {
        method: 'POST',
        json: { ...member, householdId },
      });
      assertStatus(
        mRes,
        [200, 201],
        'F8+F11/M1',
        `POST /api/v1/crm/people (${member.role})`,
      );
    }

    const graphRes = await apiFetch(
      E2E_BACKEND_URL,
      `/api/v1/crm/households/${encodeURIComponent(householdId)}`,
    );
    assertStatus(
      graphRes,
      200,
      'F8+F11/M1',
      'GET /api/v1/crm/households/:id (3-gen constellation graph)',
    );
    const raw = graphRes.rawText;
    for (const member of fx.members) {
      assert.ok(
        raw.includes(member.firstName),
        `[F8+F11/M1] Household constellation payload missing generation ${member.generation} member "${member.firstName}"`,
      );
    }
  });
});
