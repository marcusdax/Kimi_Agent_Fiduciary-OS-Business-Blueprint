import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_FRONTEND_URL } from '../../lib/config.mjs';
import {
  LEGACY_BANNED_INSTITUTIONAL_PHRASES,
  LEXICON_PAIRS,
} from '../../lib/fixtures.mjs';
import {
  apiFetch,
  assertFrontendModule,
  assertStatus,
} from '../../lib/http.mjs';

describe('Tier 1 — F1: Bifurcated Plain-Language Lexicon (10-Row Mapping)', () => {
  it('[F1] Live frontend serves AUCTUM.ATLAS lexicon contract with all 10 consumer & advisor mappings', async () => {
    const rootRes = await apiFetch(E2E_FRONTEND_URL, '/');
    assertStatus(rootRes, 200, 'F1/M2', 'Live frontend entry HTML');

    const lexRes = await apiFetch(E2E_FRONTEND_URL, '/src/lib/lexicon.ts');
    assertFrontendModule(
      lexRes,
      'F1/M2',
      'Shared lexicon module /src/lib/lexicon.ts must be served by live frontend',
    );
    const body = lexRes.rawText;

    for (const pair of LEXICON_PAIRS) {
      assert.ok(
        body.includes(pair.atlas),
        `[F1/M2] Missing AUCTUM.ATLAS consumer lexicon term: "${pair.atlas}"`,
      );
      assert.ok(
        body.includes(pair.command),
        `[F1/M2] Missing AUCTUM Command advisor lexicon term: "${pair.command}"`,
      );
    }

    assert.ok(
      body.includes('getLabel') && body.includes('BANNED_PHRASES'),
      '[F1/M2] lexicon.ts must export getLabel() and BANNED_PHRASES per PROJECT.md contract',
    );
  });

  it('[F1] Consumer homepage HTML and lexicon omit legacy institutional product jargon', async () => {
    const rootRes = await apiFetch(E2E_FRONTEND_URL, '/');
    assertStatus(rootRes, 200, 'F1/M2', 'Live frontend entry HTML');

    const appRes = await apiFetch(E2E_FRONTEND_URL, '/src/App.tsx');
    assertFrontendModule(appRes, 'F1/M2', 'Live frontend App.tsx');

    const combined = `${rootRes.rawText}\n${appRes.rawText}`;
    for (const banned of LEGACY_BANNED_INSTITUTIONAL_PHRASES) {
      assert.ok(
        !combined.includes(banned),
        `[F1/M2] Legacy institutional phrase "${banned}" leaked into live consumer surface`,
      );
    }
  });
});
