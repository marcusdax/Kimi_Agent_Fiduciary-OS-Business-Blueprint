import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceLedger } from '../src/trust/ledger.ts';
import { MasternexFiduciaryBridge } from '../src/trust/masternex-bridge.ts';

test('MasternexFiduciaryBridge - Verification and Compliance Audit Generation', () => {
  const ledger = new EvidenceLedger();
  const bridge = new MasternexFiduciaryBridge();

  // Record realistic fiduciary planning actions
  ledger.append({
    action: 'profile_updated',
    actor: 'advisor_smith',
    subject: 'household_doe_481',
    evidence: { risk_tolerance: 'moderate', time_horizon_years: 18, state: 'IL' },
  });

  ledger.append({
    action: 'plan_calculated',
    actor: 'system_montecarlo',
    subject: 'household_doe_481',
    evidence: { success_probability: 0.92, recommended_annuity_fraction: 0.25 },
  });

  ledger.append({
    action: 'recommendation_suitability_cleared',
    actor: 'compliance_gate',
    subject: 'household_doe_481',
    evidence: { passed_rules: ['RULE_C01_TAX', 'RULE_M03_MORTALITY'] },
  });

  // Verify compliance audit
  const audit = bridge.generateComplianceAudit(ledger);
  assert.equal(audit.total_events, 3);
  assert.equal(audit.chain_integrity_valid, true);
  assert.equal(audit.compliance_status, 'CONFORMANT');
  assert.equal(audit.frameworks.eu_ai_act_article_12, true);
  assert.equal(audit.frameworks.sr_11_7_audit_trail, true);
  assert.equal(typeof audit.merkle_root, 'string');
  assert.equal(audit.merkle_root.length, 64);
});
