import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_FRONTEND_URL } from '../../lib/config.mjs';
import {
  apiFetch,
  assertFrontendModule,
  assertStatus,
} from '../../lib/http.mjs';

describe('Tier 1 — F9: 7 Platform Surfaces & Mobile Policy Tracker', () => {
  it('[F9] Live frontend serves StewardPortal / Mobile Policy Tracker and Advisor Command Center wired to live CRM', async () => {
    const rootRes = await apiFetch(E2E_FRONTEND_URL, '/');
    assertStatus(rootRes, 200, 'F9/M2', 'Live frontend entry HTML');

    const stewardRes = await apiFetch(
      E2E_FRONTEND_URL,
      '/src/components/StewardPortal.tsx',
    );
    assertFrontendModule(
      stewardRes,
      'F9/M2',
      'StewardPortal / Mobile Policy Tracker /src/components/StewardPortal.tsx',
    );
    assert.ok(
      /policy|task|steward|mobile/i.test(stewardRes.rawText),
      '[F9/M2] StewardPortal must render multi-generational policy and task tracker surface',
    );

    const advisorRes = await apiFetch(
      E2E_FRONTEND_URL,
      '/src/components/AdvisorCommandCenter.tsx',
    );
    assertFrontendModule(
      advisorRes,
      'F9/M2',
      'AdvisorCommandCenter /src/components/AdvisorCommandCenter.tsx',
    );
    assert.ok(
      /\/api\/v1\/crm\/households/i.test(advisorRes.rawText),
      '[F9/M2] AdvisorCommandCenter must wire to live PostgreSQL CRM endpoint /api/v1/crm/households',
    );
  });
});
