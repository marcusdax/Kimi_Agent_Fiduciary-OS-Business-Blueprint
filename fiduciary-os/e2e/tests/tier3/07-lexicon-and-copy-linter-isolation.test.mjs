import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_FRONTEND_URL } from '../../lib/config.mjs';
import { runCopyLinter, withTempFixtureFile } from '../../lib/fs-helpers.mjs';
import { apiFetch, assertFrontendModule } from '../../lib/http.mjs';

describe('Tier 3 — 07: Bifurcated Lexicon (F1) × Automated Copy Linter Isolation (F2)', () => {
  it('[F1][F2] Consumer onboarding/checkup surfaces contain zero AUCTUM Command advisor-only terms and lint:copy flags B2C advisor-jargon leaks', async () => {
    const advisorOnlyTerms = [
      'Unified Cash-Flow & Policy Router',
      'WORM Fiduciary Document Vault (FINRA 4511)',
      'Multi-Carrier Quote & Suitability Router',
    ];

    const checkupRes = await apiFetch(
      E2E_FRONTEND_URL,
      '/src/components/HouseholdCheckup.tsx',
    );
    assertFrontendModule(
      checkupRes,
      'F1+F2/M2',
      'Consumer HouseholdCheckup.tsx must be served by live frontend',
    );

    for (const term of advisorOnlyTerms) {
      assert.ok(
        !checkupRes.rawText.includes(term),
        `[F1+F2/M2] Advisor-only term "${term}" leaked into consumer HouseholdCheckup surface`,
      );
    }

    const leakFixture = `export const ConsumerCard = () => <div>Unified Cash-Flow & Policy Router and WORM Fiduciary Document Vault (FINRA 4511)</div>;`;
    await withTempFixtureFile(
      'consumer-advisor-leak.tsx',
      leakFixture,
      (fixturePath) => {
        const result = runCopyLinter([fixturePath]);
        assert.equal(
          result.scriptDefined,
          true,
          '[F1+F2/M2] Missing "lint:copy" script in fiduciary-os/frontend/package.json',
        );
        assert.notEqual(
          result.exitCode,
          0,
          '[F1+F2/M2] lint:copy must exit non-zero when advisor-only jargon leaks into a consumer surface file',
        );
      },
    );
  });
});
