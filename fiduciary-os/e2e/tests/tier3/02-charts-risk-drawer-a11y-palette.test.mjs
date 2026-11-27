import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_FRONTEND_URL } from '../../lib/config.mjs';
import { ALBERS_ITTEN_PALETTE } from '../../lib/fixtures.mjs';
import { apiFetch, assertFrontendModule } from '../../lib/http.mjs';

describe('Tier 3 — 02: Charts (F11) × Risk Drawer (F3) × WCAG 2.2 & Albers/Itten Palette (F10)', () => {
  it('[F3][F7][F10][F11] AccessibleChartFrame pairs RiskDrawer, ARIA region, Accessible Data Table, and Albers/Itten palette across all 6 signature charts', async () => {
    const frameRes = await apiFetch(
      E2E_FRONTEND_URL,
      '/src/components/charts/AccessibleChartFrame.tsx',
    );
    assertFrontendModule(
      frameRes,
      'F3+F10+F11/M3',
      'AccessibleChartFrame.tsx must be served by live frontend',
    );

    const riskRes = await apiFetch(
      E2E_FRONTEND_URL,
      '/src/components/RiskDrawer.tsx',
    );
    assertFrontendModule(
      riskRes,
      'F3+F10+F11/M2',
      'RiskDrawer.tsx must be served by live frontend',
    );

    const indexRes = await apiFetch(
      E2E_FRONTEND_URL,
      '/src/components/charts/index.ts',
    );
    assertFrontendModule(
      indexRes,
      'F11/M3',
      'Signature charts index /src/components/charts/index.ts',
    );

    const frameSrc = frameRes.rawText;
    assert.ok(
      frameSrc.includes('RiskDrawer') &&
        /<table\b/i.test(frameSrc) &&
        /role=["']region["']/.test(frameSrc),
      '[F3+F10+F11/M3] AccessibleChartFrame must combine ARIA region + Accessible Data Table + RiskDrawer',
    );

    const upper = frameSrc.toUpperCase();
    for (const [token, hex] of Object.entries(ALBERS_ITTEN_PALETTE)) {
      assert.ok(
        upper.includes(hex.toUpperCase()),
        `[F10+F11/M3] Missing Albers/Itten palette color ${token} (${hex}) in chart frame`,
      );
    }

    // Verify all 6 signature chart exports exist in charts/index.ts
    const exportMatches = indexRes.rawText.match(/export\s+/g) || [];
    assert.ok(
      exportMatches.length >= 6,
      `[F11/M3] Expected at least 6 signature chart exports in charts/index.ts, found ${exportMatches.length}`,
    );
  });
});
