import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, e2eNamespace } from '../../lib/config.mjs';
import { makeThreeGenHouseholdFixture } from '../../lib/fixtures.mjs';
import { scanForMasternex } from '../../lib/fs-helpers.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 1 — F8: PostgreSQL + pgcrypto Household Graph CRM & Masternex Removal', () => {
  it('[F8] Full CRM CRUD on households, people (encrypted SSN), accounts, appointments, life-events + privacy export & soft-delete', async () => {
    const ns = e2eNamespace('crm');
    const fx = makeThreeGenHouseholdFixture(ns);

    // 1. Create household
    const hhRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/crm/households', {
      method: 'POST',
      json: fx.household,
    });
    assertStatus(hhRes, [200, 201], 'F8/M1', 'POST /api/v1/crm/households');
    const hhObj = assertJsonObject(hhRes, 'F8/M1', 'household');
    const householdId = (hhObj.data || hhObj).id;
    assert.ok(householdId, '[F8/M1] Created household must return an id');

    // 2. Create person with SSN and verify plaintext SSN is NEVER returned on GET
    const member = fx.members[0];
    const personRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/crm/people', {
      method: 'POST',
      json: { ...member, householdId },
    });
    assertStatus(personRes, [200, 201], 'F8/M1', 'POST /api/v1/crm/people');
    const personObj = assertJsonObject(personRes, 'F8/M1', 'person');
    const personId = (personObj.data || personObj).id;
    assert.ok(personId, '[F8/M1] Created person must return an id');

    const getPersonRes = await apiFetch(
      E2E_BACKEND_URL,
      `/api/v1/crm/people/${encodeURIComponent(personId)}`,
    );
    assertStatus(getPersonRes, 200, 'F8/M1', 'GET /api/v1/crm/people/:id');
    assert.ok(
      !getPersonRes.rawText.includes(member.ssn) &&
        !getPersonRes.rawText.includes(member.ssn.replace(/-/g, '')),
      '[F8/M1] Plaintext SSN leaked in GET /api/v1/crm/people/:id response',
    );

    // 3. Create account, appointment, life-event
    const acctRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/crm/accounts', {
      method: 'POST',
      json: { ...fx.account, householdId, personId },
    });
    assertStatus(acctRes, [200, 201], 'F8/M1', 'POST /api/v1/crm/accounts');

    const apptRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/crm/appointments', {
      method: 'POST',
      json: { ...fx.appointment, householdId, personId },
    });
    assertStatus(apptRes, [200, 201], 'F8/M1', 'POST /api/v1/crm/appointments');

    const eventRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/crm/life-events', {
      method: 'POST',
      json: { ...fx.lifeEvent, householdId, personId },
    });
    assertStatus(eventRes, [200, 201], 'F8/M1', 'POST /api/v1/crm/life-events');

    // 4. Privacy export (export_user_data)
    const exportRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/privacy/export', {
      method: 'POST',
      json: { userId: personId },
    });
    assertStatus(exportRes, 200, 'F8/M1', 'POST /api/v1/privacy/export');
    assertJsonObject(exportRes, 'F8/M1', 'privacy export bundle');

    // 5. Privacy soft-delete (soft_delete_user)
    const delRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/privacy/soft-delete',
      {
        method: 'POST',
        json: { userId: personId },
      },
    );
    assertStatus(delRes, 200, 'F8/M1', 'POST /api/v1/privacy/soft-delete');
  });

  it('[F8] Docker Compose files contain zero masternex service definitions', () => {
    const hits = scanForMasternex([
      'fiduciary-os/docker-compose.yml',
      'fiduciary-os/docker-compose.dev.yml',
      'fiduciary-os/docker-compose.ecosystem.yml',
    ]);
    assert.equal(
      hits.length,
      0,
      `[F8/M1] Found ${hits.length} active masternex reference(s) in docker-compose files: ${hits
        .slice(0, 5)
        .map((h) => `${h.file}:${h.line}`)
        .join(', ')}`,
    );
  });
});
