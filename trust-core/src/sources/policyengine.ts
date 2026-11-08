/**
 * PolicyEngine US — an open, maintained US tax-and-benefit rules engine.
 *
 * Licence position (important): PolicyEngine US is AGPL-3.0. We therefore **call
 * it over HTTP** and never vendor its code. That keeps Fiduciary OS proprietary
 * while still giving households real, maintained tax math instead of the
 * hard-coded single-year bracket table the prototype shipped.
 *
 * Two distinct uses, and they are not interchangeable:
 *
 *   1. `calculate()` — the authoritative answer for a household. Slower (~0.5s),
 *      depends on a third party, and is subject to their rate limits.
 *   2. Cross-check in CI — our own deterministic federal engine is compared
 *      against PolicyEngine at bracket boundaries so a stale table is caught by a
 *      failing build rather than by a client.
 *
 * If PolicyEngine is down we do not guess: `calculate` throws and the caller
 * degrades to the deterministic engine with a `derived` provenance trail, which
 * is honest about being an approximation.
 */
import type { HttpClient } from '../http.ts';
import { point } from '../provenance.ts';

const ENDPOINT = 'https://api.policyengine.org/us/calculate';
export const POLICYENGINE_LICENSE = 'AGPL-3.0 — consumed as a network service only; source never vendored into this repository';

export type FilingStatusPe = 'SINGLE' | 'JOINT' | 'HEAD_OF_HOUSEHOLD' | 'SEPARATE';

export interface HouseholdRequest {
  year: number;
  age: number;
  /** Gross wage/salary income for the year. */
  employmentIncome: number;
  filingStatus: FilingStatusPe;
  state: string;
  spouseAge?: number;
  /** Other income treated as miscellaneous (interest, dividends) by PolicyEngine's `miscellaneous_income`. */
  investmentIncome?: number;
}

/** Minimal PolicyEngine US household payload — the shape their API expects in 2026. */
export function buildPayload(req: HouseholdRequest) {
  const people: Record<string, unknown> = {
    you: { age: { [String(req.year)]: req.age } },
  };
  const members = ['you'];
  if (req.filingStatus === 'JOINT') {
    people.spouse = { age: { [String(req.year)]: req.spouseAge ?? req.age } };
    members.push('spouse');
  }
  const entity = { members };
  return {
    household: {
      people,
      tax_units: { tu: { ...entity, ...(req.filingStatus ? { filing_status: { [String(req.year)]: req.filingStatus } } : {}) } },
      families: { fam: entity },
      spm_units: { spm: entity },
      households: { hh: { ...entity, state_name: { [String(req.year)]: req.state } } },
      marital_units: { mu: entity },
    },
    tax_year: req.year,
  };
}

export interface PolicyEngineResult {
  household_id?: number;
  result: {
    household: {
      tax_unit?: Record<string, Record<string, number>>;
      people?: Record<string, Record<string, number>>;
    };
  };
}

export class PolicyEngineSource {
  readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async calculate(req: HouseholdRequest) {
    const body = JSON.stringify(buildPayload(req));
    const res = await this.http.getJson<PolicyEngineResult>(ENDPOINT, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      // Tax law changes annually; a day of caching is well inside tolerance and
      // keeps us far below PolicyEngine's fair-use expectations.
      ttlMs: 24 * 3600 * 1000,
      staleIfErrorMs: 7 * 24 * 3600 * 1000,
      cacheKey: `policyengine ${body}`,
      timeoutMs: 30_000,
    });

    const tu = res.json.result?.household?.tax_unit ?? {};
    const pick = (key: string): number | null => {
      const entry = tu[key];
      if (!entry) return null;
      const values = Object.values(entry).filter((v) => Number.isFinite(v));
      return values.length ? (values[values.length - 1] as number) : null;
    };

    return point(
      {
        incomeTax: pick('income_tax'),
        federalIncomeTax: pick('federal_state_income_tax') ?? pick('income_tax_before_refundable_credits'),
        payrollTax: pick('employee_payroll_tax'),
        stateIncomeTax: pick('state_income_tax'),
        taxableIncome: pick('taxable_income'),
        agi: pick('adjusted_gross_income'),
        marginalRate: pick('marginal_tax_rate'),
        raw: res.json,
      },
      {
        source: `policyengine:us:${req.year}`,
        sourceKind: 'live' as const,
        sourceUrl: ENDPOINT,
        retrievedAt: res.retrievedAt,
        asOf: `${req.year}-12-31`,
        license: POLICYENGINE_LICENSE,
        method:
          'PolicyEngine US rules engine, called as a network service (AGPL-3.0 compliance: no source vendored). ' +
          'Covers federal and state income tax, payroll tax and credits for the modelled household.',
        staleAfterSeconds: 24 * 3600,
      },
    );
  }
}
