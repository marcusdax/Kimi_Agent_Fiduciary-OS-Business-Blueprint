import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvidenceLedger } from '../../src/trust/ledger.ts';
import { FileLedgerStore } from '../../src/store/ledger-store.ts';

test('FileLedgerStore persists entries across reopen and verifies chain integrity', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trust-core-ledger-'));
  try {
    const store1 = new FileLedgerStore(dir);
    const ledger1 = EvidenceLedger.open(store1, 'test-durable');
    ledger1.append({
      action: 'plan.created',
      actor: 'advisor-1',
      subject: 'household-1',
      anchors: { stage: 'NEW_HOUSEHOLD' },
    });
    ledger1.append({
      action: 'advice.ai.generated',
      actor: 'advisor-1',
      subject: 'household-1',
      anchors: { model: 'deterministic' },
      payload: { summary: 'Educational comparison' },
    });
    const head1 = ledger1.head?.hash;
    store1.close();

    // Reopen from disk — simulates container/process restart
    const store2 = new FileLedgerStore(dir);
    const ledger2 = EvidenceLedger.open(store2, 'test-durable');
    assert.equal(ledger2.length, 2);
    assert.equal(ledger2.head?.hash, head1);
    assert.equal(ledger2.verify().valid, true);
    assert.ok(store2.health().bytes > 0);
    store2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('EvidenceLedger.open refuses to start when persisted JSONL file is tampered', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trust-core-tamper-'));
  try {
    const store1 = new FileLedgerStore(dir);
    const ledger1 = EvidenceLedger.open(store1, 'test-tamper');
    ledger1.append({
      action: 'plan.created',
      actor: 'advisor-1',
      subject: 'household-tamper',
    });
    store1.close();

    // Tamper with actor field on disk
    const raw = readFileSync(store1.path, 'utf8');
    const tampered = raw.replace('advisor-1', 'attacker-1');
    writeFileSync(store1.path, tampered, 'utf8');

    const store2 = new FileLedgerStore(dir);
    assert.throws(() => EvidenceLedger.open(store2, 'test-tamper'), /corrupt|mismatch|tamper|invalid/i);
    store2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
