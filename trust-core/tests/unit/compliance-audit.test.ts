import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceLedger } from '../../src/trust/ledger.ts';
import { MemoryLedgerStore } from '../../src/store/ledger-store.ts';
import { ComplianceAuditEngine } from '../../src/trust/compliance-audit.ts';

test('ComplianceAuditEngine produces CONFORMANT Merkle-verified report for intact ledger', () => {
  const ledger = EvidenceLedger.open(new MemoryLedgerStore(), 'audit-test');
  const engine = new ComplianceAuditEngine();

  ledger.append({
    action: 'plan.created',
    actor: 'advisor-1',
    subject: 'household-100',
    anchors: { stage: 'ACTIVE_STEWARDSHIP' },
  });
  ledger.append({
    action: 'advice.ai.reviewed',
    actor: 'advisor-1',
    subject: 'household-100',
    anchors: { verdict: 'pass' },
  });

  const report = engine.generateComplianceAudit(ledger);
  assert.equal(report.total_events, 2);
  assert.equal(report.chain_integrity_valid, true);
  assert.equal(report.compliance_status, 'CONFORMANT');
  assert.equal(report.merkle_root.length, 64);
  assert.equal(report.frameworks.eu_ai_act_article_12, true);
  assert.equal(report.frameworks.sr_11_7_audit_trail, true);
});

test('ComplianceAuditEngine detects payload/entry tampering via ledger.verify()', () => {
  const store = new MemoryLedgerStore();
  const ledger = EvidenceLedger.open(store, 'audit-tamper');
  const engine = new ComplianceAuditEngine();

  ledger.append({
    action: 'plan.created',
    actor: 'advisor-1',
    subject: 'household-200',
  });
  ledger.append({
    action: 'advice.ai.generated',
    actor: 'advisor-1',
    subject: 'household-200',
  });

  // Mutate an entry's actor in-place to simulate tampering without touching prevHash
  const mutableEntries = ledger.entries() as unknown as Array<{ actor: string }>;
  const first = mutableEntries[0];
  assert.ok(first);
  first.actor = 'tampered-actor';

  const report = engine.generateComplianceAudit(ledger);
  assert.equal(report.chain_integrity_valid, false);
  assert.equal(report.compliance_status, 'NON_CONFORMANT');
  assert.equal(report.frameworks.eu_ai_act_article_12, false);
  assert.equal(report.frameworks.sr_11_7_audit_trail, false);
});
