import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, e2eNamespace } from '../../lib/config.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';
import { validateRoCrateZip } from '../../lib/zip.mjs';

describe('Tier 3 — 06: K-Dense Dual-Loop & RO-Crate 1.1 (F12) × Gate 4 WORM Audit (F17)', () => {
  it('[F12][F17] Frozen Analysis Plan hash and Gate 4 WORM receipt hash are both preserved inside exported RO-Crate 1.1 ZIP', async () => {
    const sessionId = e2eNamespace('kdense-worm');

    const nbRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/provenance/notebook', {
      method: 'POST',
      json: {
        sessionId,
        stage: 'inner_verification',
        entry: 'Verified tax-bracket projection math against deterministic trust-core engine',
      },
    });
    assertStatus(nbRes, [200, 201], 'F12+F17/M4', 'POST /api/v1/provenance/notebook');

    const freezeRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/provenance/freeze-plan',
      {
        method: 'POST',
        json: { sessionId, planSummary: 'Dual-loop verified family plan' },
      },
    );
    assertStatus(
      freezeRes,
      [200, 201],
      'F12+F17/M4',
      'POST /api/v1/provenance/freeze-plan',
    );
    const freezeData = assertJsonObject(freezeRes, 'F12+F17/M4', 'freeze').data || freezeRes.body;
    const planHash = freezeData.planHash;
    assert.match(String(planHash || ''), /^[a-f0-9]{64}$/i, '[F12+F17/M4] Invalid planHash');

    const compRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/compliance/evaluate',
      {
        method: 'POST',
        json: {
          sessionId,
          surface: 'command',
          text: 'Compliant planning illustration prepared for licensed advisor review.',
        },
      },
    );
    assertStatus(compRes, 200, 'F12+F17/M2', 'POST /api/v1/compliance/evaluate');
    const compData = assertJsonObject(compRes, 'F12+F17/M2', 'compliance').data || compRes.body;
    const wormReceiptHash = compData.wormReceiptHash;
    assert.match(
      String(wormReceiptHash || ''),
      /^[a-f0-9]{64}$/i,
      '[F12+F17/M2] Invalid wormReceiptHash',
    );

    const zipRes = await apiFetch(
      E2E_BACKEND_URL,
      `/api/v1/provenance/ro-crate/${encodeURIComponent(sessionId)}`,
      { binary: true },
    );
    assertStatus(
      zipRes,
      200,
      'F12+F17/M4',
      'GET /api/v1/provenance/ro-crate/:sessionId',
    );
    const { entries } = validateRoCrateZip(zipRes.buffer, 'F12+F17/M4');
    const allArchiveText = [...entries.values()].map((e) => e.text).join('\n');

    assert.ok(
      allArchiveText.includes(planHash),
      `[F12+F17/M4] RO-Crate ZIP missing frozen planHash "${planHash}"`,
    );
    assert.ok(
      allArchiveText.includes(wormReceiptHash),
      `[F12+F17/M4] RO-Crate ZIP missing Gate 4 wormReceiptHash "${wormReceiptHash}"`,
    );
  });
});
