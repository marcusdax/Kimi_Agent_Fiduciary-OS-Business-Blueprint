import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UNIT_ECONOMICS_TARGETS } from '../../lib/fixtures.mjs';
import { readRepoFile, repoFileExists } from '../../lib/fs-helpers.mjs';

describe('Tier 1 — F18: Reconciled Unit Economics, Phases 1-4 & 5 Founder Decisions', () => {
  it('[F18] Unit_Economics.md contains exact reconciled LTV/CAC figures for Solo, Growth, Enterprise, and B2C Premium', () => {
    const content = readRepoFile('Unit_Economics.md');

    const checks = [
      ['Solo LTV', UNIT_ECONOMICS_TARGETS.solo.ltv],
      ['Solo LTV/CAC', UNIT_ECONOMICS_TARGETS.solo.ratio],
      ['Growth LTV', UNIT_ECONOMICS_TARGETS.growth.ltv],
      ['Growth LTV/CAC', UNIT_ECONOMICS_TARGETS.growth.ratio],
      ['Enterprise LTV', UNIT_ECONOMICS_TARGETS.enterprise.ltv],
      ['Enterprise LTV/CAC', UNIT_ECONOMICS_TARGETS.enterprise.ratio],
      ['B2C Premium LTV', UNIT_ECONOMICS_TARGETS.b2cPremium.ltv],
      ['B2C Premium LTV/CAC', UNIT_ECONOMICS_TARGETS.b2cPremium.ratio],
    ];

    for (const [label, expected] of checks) {
      assert.ok(
        content.includes(expected),
        `[F18/M5] Unit_Economics.md missing reconciled ${label} ("${expected}")`,
      );
    }
  });

  it('[F18] FINANCIAL_MODEL_PACKAGE.md and 07_Scenario_Analysis.csv reconcile Year 5 Base ARR ($19.95M) vs Base/Legacy/Upside Revenue ($21.05M / $28.02M / $51.7M)', () => {
    const pkg = readRepoFile('FINANCIAL_MODEL_PACKAGE.md');
    const csv = readRepoFile('07_Scenario_Analysis.csv');
    const combined = `${pkg}\n${csv}`;

    assert.ok(
      combined.includes(UNIT_ECONOMICS_TARGETS.year5BaseArr) ||
        combined.includes('19948393'),
      '[F18/M5] Missing Year 5 Base ARR ($19.95M / 19948393) reconciliation',
    );
    assert.ok(
      combined.includes(UNIT_ECONOMICS_TARGETS.year5PureSaasRev) ||
        combined.includes('21049999'),
      '[F18/M5] Missing Year 5 Pure-SaaS Base Revenue ($21.05M / 21049999)',
    );
    assert.ok(
      combined.includes(UNIT_ECONOMICS_TARGETS.year5LegacyRev),
      '[F18/M5] FINANCIAL_MODEL_PACKAGE.md / 07_Scenario_Analysis.csv must reconcile Legacy v1 $28.02M Revenue reference',
    );
    assert.ok(
      combined.includes(UNIT_ECONOMICS_TARGETS.year5UpsideRev),
      '[F18/M5] FINANCIAL_MODEL_PACKAGE.md / 07_Scenario_Analysis.csv must reconcile Licensed-Partner Upside $51.7M Revenue case',
    );
  });

  it('[F18] UNIFIED_PLATFORM_BLUEPRINT.md exists and documents Phases 1-4 (Flagger canary), all 5 Founder Decisions, and Brand Namespace Governance Note', () => {
    assert.equal(
      repoFileExists('UNIFIED_PLATFORM_BLUEPRINT.md'),
      true,
      '[F18/M5] Missing required deliverable UNIFIED_PLATFORM_BLUEPRINT.md at repo root',
    );
    const bp = readRepoFile('UNIFIED_PLATFORM_BLUEPRINT.md');

    for (const phase of ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4']) {
      assert.ok(
        bp.includes(phase),
        `[F18/M5] UNIFIED_PLATFORM_BLUEPRINT.md missing "${phase}" rollout section`,
      );
    }
    assert.ok(
      /flagger|canary/i.test(bp),
      '[F18/M5] UNIFIED_PLATFORM_BLUEPRINT.md must document Flagger canary rollout',
    );
    assert.ok(
      /founder decision/i.test(bp) && /(?:decision\s*#?\s*5|5\.\s)/i.test(bp),
      '[F18/M5] UNIFIED_PLATFORM_BLUEPRINT.md must document all 5 Founder Decisions',
    );
    assert.ok(
      /brand namespace|tier b/i.test(bp),
      '[F18/M5] UNIFIED_PLATFORM_BLUEPRINT.md must include Brand Namespace Governance Note (F19)',
    );
  });
});
