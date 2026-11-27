import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, e2eNamespace } from '../../lib/config.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';
import { validateRoCrateZip } from '../../lib/zip.mjs';

describe('Tier 1 — F12: K-Dense Dual-Loop Verification & Dual-Record Provenance', () => {
  it('[F12] Living Lab Notebook, SHA-256 Frozen Analysis Plan hash chain, and RO-Crate 1.1 ZIP WORM export', async () => {
    const sessionId = e2eNamespace('kdense-session');

    // 1. Append Living Lab Notebook entry
    const nbRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/provenance/notebook', {
      method: 'POST',
      json: {
        sessionId,
        stage: 'outer_planning',
        entry: 'Evaluate household cash-flow resilience under 10,000-path simulation',
        assumptions: { seed: 42, inflationRate: 0.025 },
      },
    });
    assertStatus(nbRes, [200, 201], 'F12/M4', 'POST /api/v1/provenance/notebook');
    const nbBody = assertJsonObject(nbRes, 'F12/M4', 'notebook entry');
    const nbData = nbBody.data || nbBody;
    assert.ok(
      nbData.stepId || nbData.provenanceStepId || nbData.id,
      '[F12/M4] Living Lab Notebook POST must return a host-observed provenance step ID',
    );

    // 2. Freeze Analysis Plan -> SHA-256 planHash linked to prevHash
    const freezeRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/provenance/freeze-plan',
      {
        method: 'POST',
        json: {
          sessionId,
          planSummary: 'Frozen 5-stage household stewardship analysis plan',
        },
      },
    );
    assertStatus(
      freezeRes,
      [200, 201],
      'F12/M4',
      'POST /api/v1/provenance/freeze-plan',
    );
    const freezeBody = assertJsonObject(freezeRes, 'F12/M4', 'freeze-plan');
    const freezeData = freezeBody.data || freezeBody;
    assert.match(
      String(freezeData.planHash || ''),
      /^[a-f0-9]{64}$/i,
      `[F12/M4] Expected 64-hex SHA-256 planHash, got "${freezeData.planHash}"`,
    );
    assert.ok(
      freezeData.prevHash !== undefined,
      '[F12/M4] Frozen Analysis Plan must include prevHash for Merkle/hash chaining',
    );

    // 3. Download & validate RO-Crate 1.1 ZIP bundle
    const zipRes = await apiFetch(
      E2E_BACKEND_URL,
      `/api/v1/provenance/ro-crate/${encodeURIComponent(sessionId)}`,
      { binary: true },
    );
    assertStatus(
      zipRes,
      200,
      'F12/M4',
      'GET /api/v1/provenance/ro-crate/:sessionId',
    );
    const { entries } = validateRoCrateZip(zipRes.buffer, 'F12/M4');
    assert.ok(
      entries.size >= 2,
      `[F12/M4] RO-Crate ZIP should contain ro-crate-metadata.json plus provenance artifacts (found ${entries.size} entries)`,
    );
  });
});
