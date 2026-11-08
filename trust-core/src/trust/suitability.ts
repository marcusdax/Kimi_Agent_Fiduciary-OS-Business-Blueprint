/**
 * trust/suitability.ts — a deterministic gate between "a plan exists" and "a plan
 * may be shown to a client as suitable".
 *
 * The product-risk being managed: an LLM produces a fluent, confident explanation,
 * and a human under time pressure treats it as a suitability opinion. The correct
 * architecture is not a better prompt — it is a deterministic, auditable check that
 * the AI's output cannot bypass, plus a refusal path when evidence is missing.
 *
 * So rules live in **data**, not in prose or in a prompt:
 *   - each rule cites a source and a severity,
 *   - each rule can return `pass`, `fail`, or `insufficient-evidence`,
 *   - `insufficient-evidence` is treated as blocking, because "we could not check"
 *     and "we checked and it was fine" are dangerously different states that look
 *     identical if the UI only shows passes and fails.
 *
 * This is not legal advice and it does not try to be: the rules here are a
 * *mechanism* for a firm's own compliance function to express its standards. The
 * firm owns the content; we own the audit trail.
 */
import { point, type DataPoint } from '../provenance.ts';

export type RuleOutcome = 'pass' | 'fail' | 'insufficient-evidence';
export type Severity = 'blocker' | 'warning';

export interface PlanFacts {
  clientAge: number;
  /** Informed-risk capacity stated by the client: conservative | moderate | aggressive. */
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  /** Years until the money is substantially needed. */
  horizonYears: number;
  /** Portfolio equity weight as a 0-1 fraction. */
  equityWeight: number;
  /** Share of assets that cannot be sold within 30 days. */
  illiquidShare: number;
  /** All-in cost of the proposed products, as a 0-1 annual fraction. */
  totalCostRatio: number;
  /** Modelled one-year loss at the 5th percentile, as a negative decimal. */
  stressYearLoss: number;
  /** Cash reserve outside the plan, verified or null if unknown. */
  hasEmergencyReserve: boolean | null;
  /** Ratio of guaranteed income to essential spending, or null if unmeasured. */
  fundedRatio: number | null;
  /** Whether the client holds >25% of investable assets in one issuer (employer stock, typically). */
  concentrationAcknowledged: boolean | null;
  /** Whether a documented vulnerability flag is on file. */
  vulnerability: boolean;
  /** Product categories involved, e.g. ["equity-etf", "fixed-annuity", "reit"]. */
  products: string[];
}

export interface RuleEvaluation {
  ruleId: string;
  outcome: RuleOutcome;
  severity: Severity;
  basis: string;
  citation: string;
  detail: string;
}

export interface SuitabilityRule {
  id: string;
  severity: Severity;
  /** Why this rule exists, in one sentence a reviewer can argue with. */
  basis: string;
  /** Public reference. FINRA 2111 is the anchor for suitability reasoning. */
  citation: string;
  evaluate: (f: PlanFacts) => { outcome: RuleOutcome; detail: string };
}

export const DEFAULT_RULES: SuitabilityRule[] = [
  {
    id: 'horizon-equity-fit',
    severity: 'blocker',
    basis: 'Short horizons cannot absorb equity drawdowns; a sub-3-year horizon with a high equity weight fails any reasonable suitability standard.',
    citation: 'FINRA Rule 2111 (suitability: investment profile, time horizon)',
    evaluate: (f) =>
      f.horizonYears < 3 && f.equityWeight > 0.5
        ? { outcome: 'fail', detail: `Horizon of ${f.horizonYears}y is incompatible with a ${(f.equityWeight * 100).toFixed(0)}% equity allocation.` }
        : { outcome: 'pass', detail: 'Horizon and equity weight are compatible.' },
  },
  {
    id: 'stress-loss-tolerance',
    severity: 'blocker',
    basis: 'A conservative client who cannot state a loss they could bear has not given informed risk capacity, and a plan whose stress loss exceeds a stated tolerance is unsuitable by the client\u2019s own words.',
    citation: 'FINRA Rule 2111; Reg BI (Form CRS risk discussion)',
    evaluate: (f) => {
      if (f.riskTolerance === 'conservative' && f.stressYearLoss < -0.15) {
        return { outcome: 'fail', detail: `A modelled stress loss of ${(f.stressYearLoss * 100).toFixed(1)}% exceeds what a conservative mandate can support.` };
      }
      if (f.riskTolerance === 'moderate' && f.stressYearLoss < -0.3) {
        return { outcome: 'fail', detail: `A modelled stress loss of ${(f.stressYearLoss * 100).toFixed(1)}% exceeds a moderate mandate's defensible bound.` };
      }
      return { outcome: 'pass', detail: 'Stress loss is within the stated risk tolerance.' };
    },
  },
  {
    id: 'liquidity-before-illiquidity',
    severity: 'blocker',
    basis: 'An illiquid commitment made while the client has no verified reserve converts a market risk into a solvency risk.',
    citation: 'FINRA Rule 2111 (liquidity needs); state annuity suitability rules (NAIC model)',
    evaluate: (f) => {
      if (f.illiquidShare <= 0.1) return { outcome: 'pass', detail: 'Illiquid share is below the review threshold.' };
      if (f.hasEmergencyReserve === null) {
        return { outcome: 'insufficient-evidence', detail: `Illiquid share is ${(f.illiquidShare * 100).toFixed(0)}% but the reserve position was not evidenced.` };
      }
      return f.hasEmergencyReserve
        ? { outcome: 'pass', detail: 'Illiquid share is offset by a verified emergency reserve.' }
        : { outcome: 'fail', detail: 'A material illiquid commitment with no emergency reserve is unsuitable.' };
    },
  },
  {
    id: 'concentration-disclosure',
    severity: 'warning',
    basis: 'Concentration is sometimes rational (employer stock with restrictions); it is never something to leave undocumented.',
    citation: 'FINRA Rule 2111; SEC investor bulletin on concentration risk',
    evaluate: (f) => {
      if (f.concentrationAcknowledged === null) {
        return { outcome: 'insufficient-evidence', detail: 'Concentration position was not captured.' };
      }
      return f.concentrationAcknowledged
        ? { outcome: 'pass', detail: 'Concentration acknowledged in writing.' }
        : { outcome: 'fail', detail: 'A concentrated position exists without a written acknowledgement.' };
    },
  },
  {
    id: 'funded-floor',
    severity: 'warning',
    basis: 'A plan that does not cover essential spending from guaranteed sources is a hope, not a floor. It can still be right, but the gap must be explicit.',
    citation: 'CFP Board practice standards (retirement income adequacy)',
    evaluate: (f) => {
      if (f.fundedRatio === null) return { outcome: 'insufficient-evidence', detail: 'The funded ratio was not computed.' };
      return f.fundedRatio >= 0.7
        ? { outcome: 'pass', detail: `Funded ratio ${(f.fundedRatio * 100).toFixed(0)}% meets the 70% floor.` }
        : { outcome: 'fail', detail: `Funded ratio ${(f.fundedRatio * 100).toFixed(0)}% is below the 70% floor; the gap must be a documented client choice.` };
    },
  },
  {
    id: 'cost-reasonableness',
    severity: 'warning',
    basis: 'Costs compound; a plan charging far above the implementable alternative needs a documented reason.',
    citation: 'Reg BI (cost as a factor); DOL PTE 84-24 for annuities',
    evaluate: (f) =>
      f.totalCostRatio > 0.02
        ? { outcome: 'fail', detail: `All-in cost of ${(f.totalCostRatio * 100).toFixed(2)}%/yr exceeds the 2.00% review threshold without a documented justification.` }
        : { outcome: 'pass', detail: 'Cost is within the review threshold.' },
  },
  {
    id: 'vulnerable-client-escalation',
    severity: 'blocker',
    basis: 'A documented vulnerability flag changes the standard of care: the plan must receive human review regardless of any automated outcome.',
    citation: 'FINRA Rule 2165 (financial exploitation of specified adults)',
    evaluate: (f) =>
      f.vulnerability
        ? { outcome: 'insufficient-evidence', detail: 'A vulnerability flag is on file; human review is required before this plan proceeds.' }
        : { outcome: 'pass', detail: 'No vulnerability flag on file.' },
  },
];

export interface SuitabilityVerdict {
  verdict: 'suitable' | 'suitable-with-conditions' | 'not-suitable' | 'cannot-assess';
  evaluations: RuleEvaluation[];
  blockingCount: number;
  warningCount: number;
  evidenceGaps: string[];
  /** Whether the result may be shown to a client at all. */
  mayShowToClient: boolean;
}

export function assessSuitability(facts: PlanFacts, rules: SuitabilityRule[] = DEFAULT_RULES): DataPoint<SuitabilityVerdict> {
  const evaluations: RuleEvaluation[] = rules.map((rule) => {
    const { outcome, detail } = rule.evaluate(facts);
    return { ruleId: rule.id, outcome, severity: rule.severity, basis: rule.basis, citation: rule.citation, detail };
  });

  const blockers = evaluations.filter((e) => e.severity === 'blocker' && e.outcome === 'fail');
  const gaps = evaluations.filter((e) => e.outcome === 'insufficient-evidence');
  const warnings = evaluations.filter((e) => e.severity === 'warning' && e.outcome === 'fail');

  const verdict: SuitabilityVerdict['verdict'] =
    blockers.length > 0
      ? 'not-suitable'
      : gaps.length > 0
        ? 'cannot-assess'
        : warnings.length > 0
          ? 'suitable-with-conditions'
          : 'suitable';

  const result: SuitabilityVerdict = {
    verdict,
    evaluations,
    blockingCount: blockers.length,
    warningCount: warnings.length,
    evidenceGaps: gaps.map((g) => g.ruleId),
    // A plan with unmet evidence requirements must not be dressed up for delivery.
    mayShowToClient: verdict === 'suitable' || verdict === 'suitable-with-conditions',
  };

  return point(result, {
    source: 'fiduciary-os:suitability-rules:v1',
    sourceKind: 'derived',
    sourceUrl: '',
    retrievedAt: new Date().toISOString(),
    asOf: null,
    license: 'Proprietary',
    method:
      `${rules.length} deterministic rules over the plan facts; blockers and evidence gaps are listed by id. ` +
      'This is a compliance *mechanism*: the firm\u2019s compliance function owns the rule content.',
    staleAfterSeconds: 3600,
  });
}
