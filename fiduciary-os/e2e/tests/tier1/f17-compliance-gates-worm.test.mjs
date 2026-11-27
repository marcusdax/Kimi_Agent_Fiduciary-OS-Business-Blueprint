import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  E2E_BACKEND_URL,
  E2E_TRUST_CORE_URL,
  e2eNamespace,
} from '../../lib/config.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 1 — F17: 4 Runtime Compliance Gates & Immutable Audit Ledger', () => {
  it('[F17] POST /api/v1/compliance/evaluate passes educational copy and emits chained 64-hex WORM receipt hashes', async () => {
    const sessionId = e2eNamespace('worm');

    const res1 = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/compliance/evaluate',
      {
        method: 'POST',
        json: {
          sessionId,
          surface: 'atlas',
          text: 'Reviewing your family emergency reserve helps clarify next educational steps.',
        },
      },
    );
    assertStatus(res1, 200, 'F17/M2', 'POST /api/v1/compliance/evaluate (1)');
    const b1 = assertJsonObject(res1, 'F17/M2', 'compliance eval 1');
    const d1 = b1.data || b1;

    assert.equal(
      d1.allowed,
      true,
      '[F17/M2] Benign educational text must be allowed by compliance gates',
    );
    assert.ok(
      Array.isArray(d1.violations) && d1.violations.length === 0,
      '[F17/M2] Benign educational text must have zero compliance violations',
    );
    assert.equal(
      typeof d1.riskDrawerRequired,
      'boolean',
      '[F17/M2] Response must include boolean riskDrawerRequired',
    );
    assert.match(
      String(d1.wormReceiptHash || ''),
      /^[a-f0-9]{64}$/i,
      `[F17/M2] Expected 64-hex SHA-256 wormReceiptHash, got "${d1.wormReceiptHash}"`,
    );

    const res2 = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/compliance/evaluate',
      {
        method: 'POST',
        json: {
          sessionId,
          surface: 'atlas',
          text: 'Comparing hypothetical savings rates illustrates long-term compounding.',
        },
      },
    );
    assertStatus(res2, 200, 'F17/M2', 'POST /api/v1/compliance/evaluate (2)');
    const b2 = assertJsonObject(res2, 'F17/M2', 'compliance eval 2');
    const d2 = b2.data || b2;

    assert.match(
      String(d2.wormReceiptHash || ''),
      /^[a-f0-9]{64}$/i,
      '[F17/M2] Second evaluation must emit 64-hex wormReceiptHash',
    );
    assert.notEqual(
      d2.wormReceiptHash,
      d1.wormReceiptHash,
      '[F17/M2] Sequential WORM audit receipts must produce distinct chained hashes',
    );
  });

  it('[F17] trust-core (:3002) confirms durable cryptographic ledger mode (NOT LEDGER_MODE=memory)', async () => {
    const healthRes = await apiFetch(E2E_TRUST_CORE_URL, '/health');
    assertStatus(healthRes, 200, 'F17/M1', 'GET trust-core /health');
    const body = assertJsonObject(healthRes, 'F17/M1', 'trust-core health');

    const ledgerMode = body.ledgerMode || body.ledger?.mode || body.storageMode;
    assert.ok(
      ledgerMode && String(ledgerMode).toLowerCase() !== 'memory',
      `[F17/M1] trust-core must report durable ledger persistence (NOT memory), got ledgerMode="${ledgerMode}"`,
    );
  });
});
