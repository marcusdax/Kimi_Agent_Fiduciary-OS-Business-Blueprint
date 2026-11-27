import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_FRONTEND_URL } from '../../lib/config.mjs';
import { FIVE_LIFECYCLE_STAGES } from '../../lib/fixtures.mjs';
import { apiFetch, assertFrontendModule } from '../../lib/http.mjs';

describe('Tier 1 — F5: Continuous 5-Stage Lifecycle Flow & 6-Step XState Wizard', () => {
  it('[F5] Live frontend serves 6-step XState onboardingMachine and OnboardingWizard', async () => {
    const machineRes = await apiFetch(
      E2E_FRONTEND_URL,
      '/src/lib/onboardingMachine.ts',
    );
    assertFrontendModule(
      machineRes,
      'F5/M2',
      'XState onboarding machine /src/lib/onboardingMachine.ts',
    );
    assert.ok(
      /xstate|createMachine|setup\(/i.test(machineRes.rawText),
      '[F5/M2] onboardingMachine.ts must define an XState state machine',
    );

    const wizardRes = await apiFetch(
      E2E_FRONTEND_URL,
      '/src/components/OnboardingWizard.tsx',
    );
    assertFrontendModule(
      wizardRes,
      'F5/M2',
      '6-step OnboardingWizard /src/components/OnboardingWizard.tsx',
    );
    assert.ok(
      /micro-lesson|5-min|step/i.test(wizardRes.rawText),
      '[F5/M2] OnboardingWizard must implement 6-step flow with 5-min micro-lessons',
    );
  });

  it('[F5] Live frontend serves 3-Slider HouseholdCheckup and all 5 lifecycle stages', async () => {
    const checkupRes = await apiFetch(
      E2E_FRONTEND_URL,
      '/src/components/HouseholdCheckup.tsx',
    );
    assertFrontendModule(
      checkupRes,
      'F5/M2',
      'Homepage 3-Slider HouseholdCheckup /src/components/HouseholdCheckup.tsx',
    );
    assert.ok(
      /type=["']range["']/.test(checkupRes.rawText),
      '[F5/M2] HouseholdCheckup must render interactive range sliders',
    );

    const appRes = await apiFetch(E2E_FRONTEND_URL, '/src/App.tsx');
    assertFrontendModule(appRes, 'F5/M2', 'Live frontend App.tsx');
    const combined = `${appRes.rawText}\n${checkupRes.rawText}`;

    for (const stage of FIVE_LIFECYCLE_STAGES) {
      assert.ok(
        combined.includes(stage),
        `[F5/M2] Missing lifecycle stage "${stage}" in live frontend flow`,
      );
    }

    assert.ok(
      combined.includes('Talk to a Licensed Advisor'),
      '[F5/M2] Verify & Escalate stage must expose "Talk to a Licensed Advisor" handoff CTA',
    );
  });
});
