import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceLedger, canonicalise, sha256, verifyBundle, extractSubChain } from '../../src/trust/ledger.ts';
import { assessAction, type PlanningAction, type ClientContext } from '../../src/trust/anomaly.ts';
import { assessSuitability, type PlanFacts } from '../../src/trust/suitability.ts';

describe('evidence ledger', () => {
  const makeLedger = () => {
    const l = new EvidenceLedger('ledger-test');
    l.append({ action: 'plan.created', actor: 'advisor:1', subject: 'household:9', anchors: { stage: 'intake' } });
    l.append({ action: 'plan.authorization.granted', actor: 'advisor:1', subject: 'household:9', anchors: { scope: 'view' } });
    l.append({ action: 'advice.ai.generated', actor: 'system:ai', subject: 'household:9', payload: { prompt: 'x', answer: 'y' } });
    return l;
  };

  test('entries chain from the genesis hash', () => {
    const l = makeLedger();
    const [first] = l.entries();
    assert.equal(first?.seq, 0);
    assert.equal(first?.prevHash, '0'.repeat(64));
    assert.equal(l.entries()[1]?.prevHash, first?.hash);
  });

  test('verifies a clean bundle', () => {
    const v = makeLedger().verify();
    assert.equal(v.valid, true);
    assert.equal(v.checked, 3);
    assert.equal(v.brokenAt, null);
  });

  test('detects an edited entry and names the position', () => {
    const bundle = makeLedger().exportBundle();
    (bundle.entries[1] as { anchors: Record<string, string> }).anchors = { scope: 'full-control' };
    const v = verifyBundle(bundle);
    assert.equal(v.valid, false);
    assert.equal(v.brokenAt, 1);
    assert.match(v.reason ?? '', /modified/);
  });

  test('detects a deleted middle entry', () => {
    const bundle = makeLedger().exportBundle();
    bundle.entries.splice(1, 1);
    const v = verifyBundle(bundle);
    assert.equal(v.valid, false);
    assert.notEqual(v.brokenAt, null);
  });

  test('detects a truncated tail via the head hash', () => {
    const bundle = makeLedger().exportBundle();
    bundle.entries.pop();
    const v = verifyBundle(bundle);
    assert.equal(v.valid, false);
    assert.match(v.reason ?? '', /head|truncat|link/i);
  });

  test('stores only a hash of the sensitive payload', () => {
    const l = makeLedger();
    const serialised = JSON.stringify(l.exportBundle());
    assert.ok(!serialised.includes('"prompt":"x"'), 'payload must not be stored in the clear');
    assert.equal(l.entries()[2]?.payloadHash?.length, 64);
  });

  test('two identical payloads produce the same hash, different payloads do not', () => {
    assert.equal(sha256(canonicalise({ a: 1, b: [2, 3] })), sha256(canonicalise({ b: [2, 3], a: 1 })));
    assert.notEqual(sha256(canonicalise({ a: 1 })), sha256(canonicalise({ a: 2 })));
  });

  test('a client-file sub-chain still verifies on its own', () => {
    const l = new EvidenceLedger('l2');
    l.append({ action: 'plan.created', actor: 'advisor:1', subject: 'h:1' });
    l.append({ action: 'plan.created', actor: 'advisor:1', subject: 'h:2' });
    l.append({ action: 'plan.stage.advanced', actor: 'advisor:1', subject: 'h:1' });
    const sub = extractSubChain(l.exportBundle(), 'h:1');
    assert.equal(sub.entries.length, 2);
    const subCheck = verifyBundle(sub);
    assert.equal(subCheck.valid, true);
    assert.equal(subCheck.linkage, 'per-entry', 'a filtered sub-chain proves entries, not the gaps between them');
  });

  test('requires an actor and a subject', () => {
    const l = new EvidenceLedger();
    assert.throws(() => l.append({ action: 'plan.created', actor: ' ', subject: 'h:1' }), /actor/);
    assert.throws(() => l.append({ action: 'plan.created', actor: 'a', subject: '' }), /subject/);
  });

  test('has no mutation API — corrections are new entries that supersede', () => {
    const l = new EvidenceLedger();
    const first = l.append({ action: 'plan.created', actor: 'a', subject: 'h:1' });
    const second = l.append({ action: 'plan.stage.advanced', actor: 'a', subject: 'h:1', supersedes: first.id });
    assert.equal(second.supersedes, first.id);
    assert.equal(l.length, 2);
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(l));
    assert.ok(!methods.includes('delete') && !methods.includes('update'));
  });
});

const vulnerableClient: ClientContext = { age: 82, vulnerabilityFlag: true, investableAssets: 800_000, typicalAnnualWithdrawal: 40_000 };

describe('anomaly scorer', () => {
  test('a routine action scores low', () => {
    const action: PlanningAction = { id: 'a1', type: 'plan.stage.advance', at: '2026-11-01T12:00:00Z', channel: 'advisor', clientConfirmedOutOfBand: true };
    const r = assessAction(action, { age: 60, investableAssets: 500_000 }).value;
    assert.equal(r.score, 0);
    assert.equal(r.band, 'low');
    assert.equal(r.recommendedAction, 'none');
  });

  test('a large withdrawal from a vulnerable client escalates', () => {
    const action: PlanningAction = {
      id: 'a2',
      type: 'withdrawal.large',
      at: '2026-11-01T12:00:00Z',
      amount: 300_000,
      channel: 'advisor',
      daysSinceClientLogin: 400,
      hoursToApproval: 0.4,
      newThirdPartyRecentlyAdded: true,
      clientConfirmedOutOfBand: false,
    };
    const r = assessAction(action, vulnerableClient).value;
    assert.equal(r.band, 'high');
    assert.equal(r.recommendedAction, 'escalate-to-compliance');
    const codes = r.signals.map((s) => s.code);
    assert.ok(codes.includes('largeOutflow'));
    assert.ok(codes.includes('vulnerabilityFlag'));
    assert.ok(codes.includes('tooFastToReview'));
  });

  test('every point in the score is attributable to a named signal', () => {
    const action: PlanningAction = { id: 'a3', type: 'beneficiary.change', at: '2026-11-01T12:00:00Z', channel: 'api' };
    const r = assessAction(action, vulnerableClient).value;
    const signalTotal = r.signals.reduce((a, s) => a + s.weight, 0);
    assert.ok(r.score >= signalTotal, 'score must be explained by its signals (plus the age adjustment)');
    for (const s of r.signals) assert.ok(s.basis.length > 20, 'each signal needs a stated basis');
  });

  test('outflow size is judged against the client, not a fixed threshold', () => {
    const action = (amount: number): PlanningAction => ({ id: 'x', type: 'withdrawal.large', at: '2026-11-01T12:00:00Z', amount, channel: 'client' });
    const modest = assessAction(action(50_000), { age: 60, investableAssets: 800_000, typicalAnnualWithdrawal: 40_000 }).value;
    const huge = assessAction(action(500_000), { age: 60, investableAssets: 800_000, typicalAnnualWithdrawal: 40_000 }).value;
    assert.ok(!modest.signals.some((s) => s.code === 'largeOutflow'));
    assert.ok(huge.signals.some((s) => s.code === 'largeOutflow'));
  });

  test('states what it cannot see', () => {
    const r = assessAction({ id: 'x', type: 'plan.stage.advance', at: '2026-11-01T12:00:00Z' }, vulnerableClient).value;
    assert.ok(r.blindSpots.length >= 3);
  });

  test('is labelled as rules, not a statistical model', () => {
    const d = assessAction({ id: 'x', type: 'plan.stage.advance', at: '2026-11-01T12:00:00Z' }, vulnerableClient);
    assert.match(d.provenance.method, /Not a statistical model/);
  });
});

const goodPlan: PlanFacts = {
  clientAge: 58,
  riskTolerance: 'moderate',
  horizonYears: 12,
  equityWeight: 0.6,
  illiquidShare: 0.05,
  totalCostRatio: 0.012,
  stressYearLoss: -0.18,
  hasEmergencyReserve: true,
  fundedRatio: 0.95,
  concentrationAcknowledged: true,
  vulnerability: false,
  products: ['index-fund', 'bond-ladder'],
};

describe('suitability gate', () => {
  test('a well-formed plan is suitable and may be shown to the client', () => {
    const r = assessSuitability(goodPlan).value;
    assert.equal(r.verdict, 'suitable');
    assert.equal(r.mayShowToClient, true);
    assert.equal(r.blockingCount, 0);
  });

  test('missing evidence blocks rather than passing', () => {
    const r = assessSuitability({ ...goodPlan, hasEmergencyReserve: null }).value;
    assert.equal(r.verdict, 'blocked-by-missing-evidence');
    assert.equal(r.mayShowToClient, false);
    assert.ok(r.findings.some((f) => f.outcome === 'insufficient-evidence'));
  });

  test('an over-aggressive allocation for a short horizon fails', () => {
    const r = assessSuitability({ ...goodPlan, riskTolerance: 'aggressive', horizonYears: 2, equityWeight: 0.9, stressYearLoss: -0.3 }).value;
    assert.equal(r.verdict, 'not-suitable');
    assert.equal(r.mayShowToClient, false);
  });

  test('a vulnerability flag always requires independent review', () => {
    const r = assessSuitability({ ...goodPlan, vulnerability: true }).value;
    assert.equal(r.verdict, 'not-suitable');
    assert.ok(r.findings.some((f) => f.ruleId === 'vulnerability-escalation' && f.outcome === 'fail'));
  });

  test('advisory findings do not block on their own', () => {
    const r = assessSuitability({ ...goodPlan, totalCostRatio: 0.031, fundedRatio: 0.7 }).value;
    assert.equal(r.verdict, 'suitable');
    assert.ok(r.advisoryCount >= 2);
  });

  test('every finding cites a basis a compliance officer can check', () => {
    const r = assessSuitability(goodPlan).value;
    for (const f of r.findings) {
      assert.ok(f.citation.length > 10, `rule ${f.ruleId} lacks a citation`);
      assert.ok(f.detail.length > 10, `rule ${f.ruleId} lacks a detail`);
    }
  });
});
