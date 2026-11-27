import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_FRONTEND_URL } from '../../lib/config.mjs';
import { apiFetch, assertFrontendModule } from '../../lib/http.mjs';

describe('Tier 1 — F3: Context-Aware Disclosures & SEC 206(4)-1 Risk Drawer', () => {
  it('[F3] Live frontend serves RiskDrawer component with SEC 206(4)-1 / FINRA 2210 disclosures and aria-expanded', async () => {
    const res = await apiFetch(
      E2E_FRONTEND_URL,
      '/src/components/RiskDrawer.tsx',
    );
    assertFrontendModule(
      res,
      'F3/M2',
      'Shared RiskDrawer component /src/components/RiskDrawer.tsx must be served by live frontend',
    );

    const src = res.rawText;
    assert.ok(
      src.includes('aria-expanded'),
      '[F3/M2] RiskDrawer must expose expandable aria-expanded control',
    );
    assert.ok(
      /206\(4\)-1|FINRA\s*2210/i.test(src),
      '[F3/M2] RiskDrawer must cite SEC Marketing Rule 206(4)-1 or FINRA Rule 2210 disclosures',
    );
    assert.ok(
      /hypothetical|educational|not\s+(?:personalized\s+)?(?:investment|financial)\s+advice/i.test(
        src,
      ),
      '[F3/M2] RiskDrawer must include hypothetical/educational boundary disclaimer language',
    );
  });

  it('[F3] Live consumer shell includes persistent educational disclaimer landmark', async () => {
    const appRes = await apiFetch(E2E_FRONTEND_URL, '/src/App.tsx');
    assertFrontendModule(appRes, 'F3/M2', 'Live frontend App.tsx');

    const hasLandmark =
      /data-testid=["']educational-disclaimer["']|role=["']note["']|RiskDrawer/.test(
        appRes.rawText,
      );
    assert.ok(
      hasLandmark,
      '[F3/M2] Consumer App shell must mount persistent educational disclaimer landmark or RiskDrawer',
    );
  });
});
