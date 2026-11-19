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
 *     and "we checked and it was fine" must never collapse into the same state.
 *
 * This is a rules engine, not a legal opinion. The rule set below is deliberately
 * small and every rule is contestable; the point is the *mechanism*, so the firm's
 * compliance team can own the content without touching code.
 */
import { point, type DataPoint } from '../provenance.ts';

export type Severity = 'blocking' | 'advisory';
export type Outcome = 'pass' | 'fail' | 'insufficient-evidence';

export interface PlanFacts {
  clientAge: number;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  /** Years until the client needs the money. */
  horizonYears: number;
  /** Share of the plan in equities. */
  equityWeight: number;
  /** Share of liquid net worth the plan places in illiquid or restricted products. */
  illiquidShare: number;
  /** Annual advisory + product cost as a decimal. */
  totalCostRatio: number;
  /** Expected loss the plan tolerates in a stress year, as a decimal (e.g. -0.25). */
  stressYearLoss: number;
  /** Does the client have an emergency reserve of >= 3 months of expenses? */
  hasEmergencyReserve: boolean | null;
  /** Is the client's stated objective funded to at least 90% under the plan's own projection? */
  fundedRatio: number | null;
  /** Was concentration (single position > 10%) disclosed and accepted in writing? */
  concentrationAcknowledged: boolean | null;
  /** Does the client have any documented vulnerability flag? */
  vulnerability: boolean;
  /** Product types included, so rules can key off them without parsing prose. */
  products: string[];
}

export interface Rule {
  id: string;
  title: string;
  severity: Severity;
  /** Legal or professional basis, stated plainly. Not legal advice. */
  basis: string;
  citation: string;
  evaluate: (facts: PlanFacts) => { outcome: Outcome; detail: string };
}

export interface Finding {
  ruleId: string;
  title: string;
  severity: Severity;
  outcome: Outcome;
  detail: string;
  citation: string;
}

export interface SuitabilityReport {
  verdict: 'suitable' | 'not-suitable' | 'blocked-by-missing-evidence';
  findings: Finding[];
  blockingCount: number;
  advisoryCount: number;
  /** True only when every blocking rule passed with real evidence. */
  mayShowToClient: boolean;
}

/**
 * Equity ceiling by risk tolerance and horizon. A rule of thumb, and labelled as
 * one: the point is that an aggressive 90/10 plan for a two-year horizon is caught
 * mechanically rather than by a reviewer's memory.
 */
function equityCeiling(tolerance: PlanFacts['riskTolerance'], horizonYears: number): number {
  const base = tolerance === 'aggressive' ? 0.95 : tolerance === 'moderate' ? 0.75 : 0.5;
  if (horizonYears < 3) return Math.min(base, 0.3);
  if (horizonYears < 5) return Math.min(base, 0.6);
  return base;
}

export const DEFAULT_RULES: Rule[] = [
  {
    id: 'horizon-equity-fit',
    title: 'Equity allocation is consistent with the client horizon',
    severity: 'blocking',
    basis: 'A plan needing the money within five years cannot rely on equity recovery after a drawdown.',
    citation: 'CFP Board Practice Standards — risk tolerance and time horizon must both inform allocation',
    evaluate: (f) => {
      const ceiling = equityCeiling(f.riskTolerance, f.horizonYears);
      return f.equityWeight <= ceiling + 1e-9
        ? { outcome: 'pass', detail: `Equity weight ${(f.equityWeight * 100).toFixed(0)}% is within the ${(ceiling * 100).toFixed(0)}% ceiling for a ${f.riskTolerance} profile with a ${f.horizonYears}-year horizon.` }
        : { outcome: 'fail', detail: `Equity weight ${(f.equityWeight * 100).toFixed(0)}% exceeds the ${(ceiling * 100).toFixed(0)}% ceiling for a ${f.riskTolerance} profile with a ${f.horizonYears}-year horizon.` };
    },
  },
  {
    id: 'stress-loss-tolerance',
    title: 'Modelled stress-year loss is within client tolerance',
    severity: 'blocking',
    basis: 'A plan whose bad year would breach the client\'s stated loss tolerance is unsuitable regardless of expected return.',
    citation: 'FINRA Rule 2111 — suitability requires consideration of the customer\'s risk tolerance',
    evaluate: (f) => {
      const limit = f.riskTolerance === 'aggressive' ? 0.35 : f.riskTolerance === 'moderate' ? 0.2 : 0.1;
      const loss = Math.abs(f.stressYearLoss);
      return loss <= limit + 1e-9
        ? { outcome: 'pass', detail: `Modelled stress-year loss ${(loss * 100).toFixed(0)}% is within the ${(limit * 100).toFixed(0)}% tolerance for a ${f.riskTolerance} profile.` }
        : { outcome: 'fail', detail: `Modelled stress-year loss ${(loss * 100).toFixed(0)}% exceeds the ${(limit * 100).toFixed(0)}% tolerance for a ${f.riskTolerance} profile.` };
    },
  },
  {
    id: 'liquidity-reserve',
    title: 'Emergency reserve exists before illiquid commitments',
    severity: 'blocking',
    basis: 'Recommending illiquid or restricted products without a reserve converts market risk into forced-sale risk.',
    citation: 'CFP Board — liquidity needs must be met before long-horizon or illiquid recommendations',
    evaluate: (f) => {
      if (f.hasEmergencyReserve === null) return { outcome: 'insufficient-evidence', detail: 'No emergency-reserve evidence on file.' };
      if (!f.hasEmergencyReserve && f.illiquidShare > 0.1) return { outcome: 'fail', detail: `No emergency reserve and ${(f.illiquidShare * 100).toFixed(1)}% of liquid net worth in illiquid products.` };
      return { outcome: 'pass', detail: f.hasEmergencyReserve ? 'Emergency reserve confirmed.' : 'Illiquid share is within tolerance despite no reserve.' };
    },
  },
  {
    id: 'concentration-disclosure',
    title: 'Single-position concentration is disclosed and acknowledged',
    severity: 'blocking',
    basis: 'A position above 10% carries idiosyncratic risk that must be a conscious, documented choice.',
    citation: 'CFP Board / FINRA — concentration risk must be disclosed and knowingly accepted',
    evaluate: (f) => {
      if (f.concentrationAcknowledged === null) return { outcome: 'insufficient-evidence', detail: 'Concentration acknowledgement not recorded.' };
      if (!f.concentrationAcknowledged) return { outcome: 'fail', detail: 'Concentration flagged but not acknowledged in writing.' };
      return { outcome: 'pass', detail: 'Concentration disclosed and acknowledged.' };
    },
  },
  {
    id: 'funded-ratio',
    title: 'The plan is funded against the client\'s stated objective',
    severity: 'advisory',
    basis: 'A plan that does not fund the objective may still be appropriate, but the shortfall must be visible to the client.',
    citation: 'CFP Board — the recommendation must be evaluated against the client\'s goals',
    evaluate: (f) => {
      if (f.fundedRatio === null) return { outcome: 'insufficient-evidence', detail: 'No projection attached to the plan.' };
      return f.fundedRatio >= 0.9
        ? { outcome: 'pass', detail: `Funded ratio ${(f.fundedRatio * 100).toFixed(0)}% meets the 90% threshold.` }
        : { outcome: 'fail', detail: `Funded ratio ${(f.fundedRatio * 100).toFixed(0)}% is below 90%; shortfall must be disclosed.` };
    },
  },
  {
    id: 'cost-reasonableness',
    title: 'Total cost is disclosed and not an outlier',
    severity: 'advisory',
    basis: 'Cost is a certain drag on a probabilistic return; a plan above 2% all-in must justify it explicitly.',
    citation: 'DOL fiduciary standard / Reg BI — cost is material to the care obligation',
    evaluate: (f) =>
      f.totalCostRatio <= 0.02
        ? { outcome: 'pass', detail: `All-in cost ${(f.totalCostRatio * 100).toFixed(2)}% is within the 2.00% review threshold.` }
        : { outcome: 'fail', detail: `All-in cost ${(f.totalCostRatio * 100).toFixed(2)}% exceeds 2.00% and requires explicit justification.` },
  },
  {
    id: 'vulnerability-escalation',
    title: 'Vulnerable-client plans carry an independent review requirement',
    severity: 'blocking',
    basis: 'A documented vulnerability raises the duty of care and requires an independent second review before client delivery.',
    citation: 'FINRA Regulatory Notice 22-08 / CFP Board elder-financial-exploitation guidance',
    evaluate: (f) =>
      f.vulnerability
        ? { outcome: 'fail', detail: 'Client has a vulnerability flag: an independent reviewer must sign off before this plan is shown to the client.' }
        : { outcome: 'pass', detail: 'No vulnerability flag on file.' },
  },
];

export function assessSuitability(facts: PlanFacts, rules: Rule[] = DEFAULT_RULES): DataPoint<SuitabilityReport> {
  const findings: Finding[] = rules.map((rule) => {
    const { outcome, detail } = rule.evaluate(facts);
    return { ruleId: rule.id, title: rule.title, severity: rule.severity, outcome, detail, citation: rule.citation };
  });

  const blocking = findings.filter((f) => f.severity === 'blocking');
  const advisory = findings.filter((f) => f.severity === 'advisory');
  const blockingFailures = blocking.filter((f) => f.outcome === 'fail');
  const blockingMissing = blocking.filter((f) => f.outcome === 'insufficient-evidence');

  const verdict: SuitabilityReport['verdict'] =
    blockingMissing.length > 0 ? 'blocked-by-missing-evidence' : blockingFailures.length > 0 ? 'not-suitable' : 'suitable';

  return point(
    {
      verdict,
      findings,
      blockingCount: blockingFailures.length + blockingMissing.length,
      advisoryCount: advisory.filter((f) => f.outcome !== 'pass').length,
      mayShowToClient: verdict === 'suitable',
    },
    {
      source: 'fiduciary-os:suitability-engine:v1',
      sourceKind: 'derived',
      sourceUrl: '',
      retrievedAt: new Date().toISOString(),
      asOf: null,
      license: 'Proprietary — rule set owned by the firm\'s compliance function',
      method: `Deterministic evaluation of ${rules.length} rules (${blocking.length} blocking, ${advisory.length} advisory). Missing evidence blocks rather than passes.`,
      staleAfterSeconds: 24 * 3600,
    },
  );
}
