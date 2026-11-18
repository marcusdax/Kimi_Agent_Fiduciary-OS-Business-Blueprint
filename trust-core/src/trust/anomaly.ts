/**
 * trust/anomaly.ts — an explainable risk score for planning actions.
 *
 * Motivated by the "NADE" anomaly engine in the MASTERNEX blueprint, but translated
 * into a domain where the failure mode is not a sensor spike: it is **elder
 * financial exploitation** and **authority misuse**.
 *
 * Why rules and not a model, at least to start
 * --------------------------------------------
 * A score that says "82% risk" and cannot explain itself is unusable in this domain:
 * a compliance officer has to either act on it or dismiss it, and an advisor has to
 * be able to contest it. Every point in this scorer is attributed to a named signal
 * with a stated weight, so the output is an argument, not an oracle. The weights are
 * a starting hypothesis to be recalibrated against real case outcomes — and they are
 * exported as data so that recalibration is a config change, not a rewrite.
 *
 * Signals chosen for evidence, not novelty: FINRA and CFP Board guidance on elder
 * exploitation consistently flag sudden beneficiary changes, unusual large
 * disbursements, new third parties appearing on accounts, and changes made under
 * time pressure or by a newly-added contact.
 */
import { point, type DataPoint } from '../provenance.ts';

export interface PlanningAction {
  id: string;
  type:
    | 'beneficiary.change'
    | 'withdrawal.large'
    | 'transfer.outbound'
    | 'authorization.grant'
    | 'address.change'
    | 'plan.stage.advance'
    | 'document.upload'
    | 'advice.acknowledge';
  at: string;
  /** Amount in dollars, when the action moves money. */
  amount?: number;
  /** Days since the client last authenticated, if known. */
  daysSinceClientLogin?: number | null;
  /** Was the initiator a person the client has previously authorised? */
  initiatorAuthorized?: boolean;
  /** Was a new third party added in the preceding 30 days? */
  newThirdPartyRecentlyAdded?: boolean;
  /** Did the client confirm by an out-of-band channel (call-back, in-app push)? */
  clientConfirmedOutOfBand?: boolean;
  /** Hours between the request and its approval. Very short is a signal. */
  hoursToApproval?: number | null;
  channel?: 'advisor' | 'client' | 'system' | 'api';
}

export interface ClientContext {
  age: number;
  /** Known cognitive-decline flag on file (set only by an authorised process). */
  vulnerabilityFlag?: boolean;
  /** Total investable assets, for sizing a withdrawal. */
  investableAssets: number;
  /** Typical annual withdrawal, for sizing an outlier. */
  typicalAnnualWithdrawal?: number;
}

export interface Signal {
  code: string;
  weight: number;
  detail: string;
  /** Human-readable basis for the signal, so a reviewer can judge it. */
  basis: string;
}

export interface AnomalyAssessment {
  score: number;
  band: 'low' | 'elevated' | 'high';
  recommendedAction: 'none' | 'advisor-review' | 'hold-and-verify' | 'escalate-to-compliance';
  signals: Signal[];
  /** Deliberately stated: what the scorer cannot see. */
  blindSpots: string[];
}

export const SIGNAL_WEIGHTS = {
  largeOutflow: 22,
  beneficiaryChangedWithoutOutOfBand: 20,
  newThirdPartyRecent: 16,
  authorityGrantByNonClient: 18,
  inactivityThenAction: 14,
  tooFastToReview: 12,
  vulnerabilityFlag: 15,
  addressChangeNearOutflow: 10,
  unusualChannel: 8,
} as const;

const HIGH = 55;
const ELEVATED = 30;

export function assessAction(action: PlanningAction, context: ClientContext, history: PlanningAction[] = []): DataPoint<AnomalyAssessment> {
  const signals: Signal[] = [];
  const push = (code: keyof typeof SIGNAL_WEIGHTS, detail: string, basis: string) =>
    signals.push({ code, weight: SIGNAL_WEIGHTS[code], detail, basis });

  const moneyMoving = action.type === 'withdrawal.large' || action.type === 'transfer.outbound';
  const outflow = action.amount ?? 0;

  // 1. Size of the move relative to the client's own normal behaviour, not to an
  //    arbitrary threshold. An $80k withdrawal is unremarkable for one household
  //    and a red flag for another; the ratio is what carries information.
  if (moneyMoving && context.investableAssets > 0) {
    const shareOfAssets = outflow / context.investableAssets;
    const shareOfTypical = context.typicalAnnualWithdrawal && context.typicalAnnualWithdrawal > 0
      ? outflow / context.typicalAnnualWithdrawal
      : null;
    if (shareOfAssets >= 0.15 || (shareOfTypical !== null && shareOfTypical >= 3)) {
      push(
        'largeOutflow',
        `${formatUsd(outflow)} is ${(shareOfAssets * 100).toFixed(1)}% of investable assets` +
          (shareOfTypical !== null ? ` and ${shareOfTypical.toFixed(1)}x the client's usual annual withdrawal` : ''),
        'Outflows above 15% of assets or 3x the client-specific norm are the strongest single predictor of exploitation loss.',
      );
    }
  }

  // 2. Beneficiary change is the classic fraud vector: it converts a theft into a
  //    legitimate-looking transfer at death, and it is often the only signal.
  if (action.type === 'beneficiary.change' && action.clientConfirmedOutOfBand !== true) {
    push(
      'beneficiaryChangedWithoutOutOfBand',
      'Beneficiary changed without an out-of-band confirmation from the client',
      'Beneficiary designation changes require independent client confirmation; a single-channel change is not verifiable evidence of intent.',
    );
  }

  // 3. A new third party plus a money move inside a 30-day window is a pattern, not
  //    a coincidence. Recency is what makes it actionable.
  if (action.newThirdPartyRecentlyAdded) {
    push('newThirdPartyRecent', 'A new third party was added to the relationship in the last 30 days', 'New payee/POA/contact immediately preceding an outflow is a documented exploitation pattern.');
  }

  // 4. Authority changes initiated by someone other than the client.
  if (action.type === 'authorization.grant' && action.channel !== 'client') {
    push('authorityGrantByNonClient', `Authority granted through the ${action.channel ?? 'unknown'} channel rather than by the client`, 'Delegation of authority is the escalation step in most exploitation cases; it must originate with the client.');
  }

  // 5. A long dormancy followed by a large action.
  if (action.daysSinceClientLogin !== null && action.daysSinceClientLogin !== undefined && action.daysSinceClientLogin >= 180 && (moneyMoving || action.type === 'beneficiary.change')) {
    push('inactivityThenAction', `Client last signed in ${action.daysSinceClientLogin} days before this action`, 'Account dormancy broken by a high-consequence action is consistent with third-party control of credentials.');
  }

  // 6. Approval speed. Deliberation is a control; its absence is a signal.
  if (action.hoursToApproval !== null && action.hoursToApproval !== undefined && action.hoursToApproval < 1 && (moneyMoving || action.type === 'beneficiary.change')) {
    push('tooFastToReview', `Approved ${action.hoursToApproval.toFixed(1)}h after request`, 'High-consequence changes approved in under an hour leave no realistic window for review or client verification.');
  }

  // 7. Known vulnerability raises the consequence of everything else.
  if (context.vulnerabilityFlag) {
    push('vulnerabilityFlag', 'A documented vulnerability flag is on file for this client', 'Diminished capacity or a documented exploitation concern raises the duty of care and the cost of a false negative.');
  }

  // 8. Address change shortly before an outflow.
  if (action.type === 'address.change') {
    const outflowSoon = history.some(
      (h) => (h.type === 'withdrawal.large' || h.type === 'transfer.outbound') && Math.abs(Date.parse(h.at) - Date.parse(action.at)) <= 45 * 86400000,
    );
    if (outflowSoon) {
      push('addressChangeNearOutflow', 'Mailing/email address changed within 45 days of a large outflow', 'Address changes redirect statements and confirmations, which is how exploitation is concealed.');
    }
  }

  // 9. Channel: API-initiated high-consequence actions are legitimate for integrated
  //    firms but deserve a second look, and we say why rather than implying malice.
  if (action.channel === 'api' && (moneyMoving || action.type === 'authorization.grant')) {
    push('unusualChannel', 'High-consequence action initiated through the API channel', 'Machine-initiated changes should be tied to a human authorisation record; the ledger is the place that linkage is proven.');
  }

  const score = Math.min(100, signals.reduce((a, s) => a + s.weight, 0));
  const band: AnomalyAssessment['band'] = score >= HIGH ? 'high' : score >= ELEVATED ? 'elevated' : 'low';
  const recommendedAction: AnomalyAssessment['recommendedAction'] =
    band === 'high' ? 'escalate-to-compliance' : band === 'elevated' ? 'hold-and-verify' : score > 0 ? 'advisor-review' : 'none';

  let ageSignal = 0;
  if (context.age >= 70) ageSignal = 5;
  const finalScore = Math.min(100, score + ageSignal);

  const assessment: AnomalyAssessment = {
    score: finalScore,
    band: finalScore >= HIGH ? 'high' : finalScore >= ELEVATED ? 'elevated' : 'low',
    recommendedAction:
      finalScore >= HIGH ? 'escalate-to-compliance' : finalScore >= ELEVATED ? 'hold-and-verify' : finalScore > 0 ? 'advisor-review' : 'none',
    signals,
    blindSpots: [
      'Identity of the person operating the browser or device (session integrity is out of scope here).',
      'Communications outside the platform (phone calls, in-person visits).',
      'Family dynamics, which are the context in which most exploitation occurs.',
      'Whether the client actually understands the change.',
    ],
  };

  return point(assessment, {
    source: 'fiduciary-os:anomaly-scorer:v1',
    sourceKind: 'derived',
    sourceUrl: '',
    retrievedAt: new Date().toISOString(),
    asOf: action.at,
    license: 'Proprietary',
    method:
      `Weighted additive rules over ${signals.length} triggered signals; weights are an explicit, published table ` +
      '(SIGNAL_WEIGHTS) intended to be recalibrated against adjudicated case outcomes. Not a statistical model.',
    staleAfterSeconds: 3600,
  });
}

const formatUsd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
