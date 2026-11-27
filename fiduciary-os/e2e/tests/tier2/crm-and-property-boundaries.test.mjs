import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL } from '../../lib/config.mjs';
import { VALID_UNDERWRITING_PAYLOADS } from '../../lib/fixtures.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 2 — Boundary & Corner Cases: CRM & Property Underwriting', () => {
  it('[F8] CRM rejects empty JSON {}, oversized strings (>10KB), and invalid member role enum with 400/422 (never 500)', async () => {
    const emptyRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/crm/households', {
      method: 'POST',
      json: {},
    });
    assertStatus(
      emptyRes,
      [400, 422],
      'F8/M1',
      'POST /api/v1/crm/households with empty {}',
    );

    const oversizedRes = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/crm/households',
      {
        method: 'POST',
        json: { name: 'X'.repeat(12000), state: 'CA' },
      },
    );
    assertStatus(
      oversizedRes,
      [400, 413, 422],
      'F8/M1',
      'POST /api/v1/crm/households with >10KB name',
    );

    const badRoleRes = await apiFetch(E2E_BACKEND_URL, '/api/v1/crm/people', {
      method: 'POST',
      json: {
        firstName: 'Invalid',
        lastName: 'Role',
        role: 'wizard_king_invalid_enum',
      },
    });
    assertStatus(
      badRoleRes,
      [400, 422],
      'F8/M1',
      'POST /api/v1/crm/people with invalid role enum',
    );
  });

  it('[F7] Property underwriting rejects zero/negative prices, invalid rates, >100% down payment, zero loan term, and unknown strategy with 400/422', async () => {
    const invalidCases = [
      ['purchasePrice=0', { ...VALID_UNDERWRITING_PAYLOADS.hold, purchasePrice: 0 }],
      ['purchasePrice=-250000', { ...VALID_UNDERWRITING_PAYLOADS.hold, purchasePrice: -250000 }],
      ['interestRate=-0.05', { ...VALID_UNDERWRITING_PAYLOADS.hold, interestRate: -0.05 }],
      ['interestRate=99', { ...VALID_UNDERWRITING_PAYLOADS.hold, interestRate: 99 }],
      ['loanTermYears=0', { ...VALID_UNDERWRITING_PAYLOADS.hold, loanTermYears: 0 }],
      ['downPaymentPct=1.5', { ...VALID_UNDERWRITING_PAYLOADS.hold, downPaymentPct: 1.5 }],
      ['strategy=flip_magic', { ...VALID_UNDERWRITING_PAYLOADS.hold, strategy: 'flip_magic' }],
    ];

    for (const [label, payload] of invalidCases) {
      const res = await apiFetch(
        E2E_BACKEND_URL,
        '/api/v1/property/underwrite',
        { method: 'POST', json: payload },
      );
      assertStatus(
        res,
        [400, 422],
        'F7/M3',
        `Invalid underwriting boundary (${label})`,
      );
    }
  });

  it('[F7] Property underwriting handles extreme $100,000,000 purchasePrice with finite numbers and balanced 30-yr amortization', async () => {
    const res = await apiFetch(E2E_BACKEND_URL, '/api/v1/property/underwrite', {
      method: 'POST',
      json: {
        ...VALID_UNDERWRITING_PAYLOADS.hold,
        purchasePrice: 100000000,
        monthlyRent: 750000,
      },
    });
    assertStatus(res, 200, 'F7/M3', 'Extreme $100M property underwriting');
    assert.ok(
      !res.rawText.includes('NaN') && !res.rawText.includes('Infinity'),
      '[F7/M3] Extreme $100M underwriting response must not contain NaN or Infinity',
    );
    const body = assertJsonObject(res, 'F7/M3', '$100M underwriting');
    const data = body.data || body;
    const amort = data.amortizationSchedule || data.amortization;
    assert.ok(
      Array.isArray(amort) && (amort.length === 30 || amort.length === 360),
      '[F7/M3] Extreme $100M underwriting must still produce complete 30-yr amortization',
    );
  });
});
