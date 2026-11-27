import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_FRONTEND_URL } from '../../lib/config.mjs';
import { ALBERS_ITTEN_PALETTE, TRANSITION_TOKENS } from '../../lib/fixtures.mjs';
import { apiFetch, assertFrontendModule } from '../../lib/http.mjs';

describe('Tier 1 — F10: WCAG 2.2 Accessible Visualization System', () => {
  it('[F10] AccessibleChartFrame provides ARIA landmarks, paired Accessible Data Table, RiskDrawer, Albers/Itten palette, and 220ms transition', async () => {
    const res = await apiFetch(
      E2E_FRONTEND_URL,
      '/src/components/charts/AccessibleChartFrame.tsx',
    );
    assertFrontendModule(
      res,
      'F10/M3',
      'Shared AccessibleChartFrame /src/components/charts/AccessibleChartFrame.tsx',
    );

    const src = res.rawText;
    assert.ok(
      /role=["']region["']/.test(src) && /aria-label/.test(src),
      '[F10/M3] AccessibleChartFrame must include role="region" and aria-label landmark',
    );
    assert.ok(
      /<table\b/i.test(src) && /<thead\b/i.test(src) && /<tbody\b/i.test(src),
      '[F10/M3] AccessibleChartFrame must pair every chart with a semantic Accessible Data Table (<table>, <thead>, <tbody>)',
    );
    assert.ok(
      src.includes('RiskDrawer'),
      '[F10/M3] AccessibleChartFrame must mount <RiskDrawer />',
    );

    const upper = src.toUpperCase();
    for (const [name, hex] of Object.entries(ALBERS_ITTEN_PALETTE)) {
      assert.ok(
        upper.includes(hex.toUpperCase()),
        `[F10/M3] AccessibleChartFrame missing Albers/Itten palette token "${name}" (${hex})`,
      );
    }

    assert.ok(
      src.includes(TRANSITION_TOKENS.durationCss) &&
        src.includes(TRANSITION_TOKENS.easing),
      `[F10/M3] AccessibleChartFrame must define ${TRANSITION_TOKENS.durationCss} ${TRANSITION_TOKENS.easing} transition tokens`,
    );
  });
});
