/**
 * mcp/server.ts — F12: put the calculators inside the assistants people already use.
 *
 * Distribution, not a feature. The scan found multiple retirement-planning MCP
 * servers already live; a calculator that only exists on your own domain reaches
 * only people who already found you.
 *
 * The design constraint that matters here is not the protocol — it is the
 * **disclosure discipline**. An assistant quoting a projection without the caveat
 * and the provenance is a regulatory exposure, so every tool result returns the same
 * envelope the HTTP API returns, including exclusions and the not-advice statement.
 * A model may paraphrase the number; it cannot paraphrase away the receipt.
 *
 * Transport: stdio, newline-delimited JSON-RPC 2.0 as MCP specifies. No SDK, so the
 * wire format is visible and auditable.
 */
import { createInterface } from 'node:readline';
import { computeTax, type TaxInput } from '../engines/tax.ts';
import { simulate, type MonteCarloInput } from '../engines/montecarlo.ts';
import { priceAnnuity, type AnnuityInput } from '../engines/annuity.ts';
import { assessSuitability, type PlanFacts } from '../trust/suitability.ts';
import type { CalibrationService } from '../calibration.ts';
import type { DisclosureWatch } from '../features/disclosure-watch.ts';
import { LATEST_TAX_YEAR } from '../sources/taxTables.ts';

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'fiduciary-os', version: '1.0.0' };

const NOT_ADVICE =
  'Educational estimate. Not a quote, offer, recommendation, or tax/investment advice. ' +
  'Review any decision with a licensed professional.';

export interface McpDeps {
  calibration: CalibrationService;
  watch: DisclosureWatch;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const TOOLS = [
  {
    name: 'fidos_tax_estimate',
    description:
      'Federal individual income tax for a US household, for supported tax years. Returns the figure with its ' +
      'citation and an explicit list of what is excluded (state tax, credits, AMT, itemising).',
    inputSchema: {
      type: 'object',
      required: ['ordinaryIncome'],
      properties: {
        taxYear: { type: 'number', description: '2025 or 2026', default: 2026 },
        filingStatus: { type: 'string', enum: ['single', 'married', 'head', 'separate'], default: 'single' },
        ordinaryIncome: { type: 'number', description: 'W-2 wages, interest, IRA withdrawals, in dollars' },
        preferentialIncome: { type: 'number', description: 'Long-term capital gains + qualified dividends' },
        contribution401k: { type: 'number' },
        rothConversion: { type: 'number' },
        hsaContribution: { type: 'number' },
        ages: { type: 'array', items: { type: 'number' }, description: 'Taxpayer and spouse ages, for the 65+ deductions' },
      },
    },
  },
  {
    name: 'fidos_retirement_projection',
    description:
      'Monte Carlo retirement sustainability calibrated from live FRED data (55 years of real equity returns, ' +
      'current 10-year real bond yield). Returns success probability, percentile paths and the 90%-success ' +
      'spending level. Requires network access for calibration.',
    inputSchema: {
      type: 'object',
      required: ['currentAge', 'retirementAge', 'portfolio', 'annualSpending'],
      properties: {
        currentAge: { type: 'number' },
        retirementAge: { type: 'number' },
        planToAge: { type: 'number', default: 95 },
        portfolio: { type: 'number', description: 'Investable assets today, real dollars' },
        annualContribution: { type: 'number', default: 0 },
        annualSpending: { type: 'number', description: 'Retirement spending, real dollars, before Social Security' },
        socialSecurity: { type: 'number', default: 0 },
        socialSecurityStartAge: { type: 'number', default: 67 },
        pension: { type: 'number', default: 0 },
        equityWeight: { type: 'number', default: 0.6 },
        feeRate: { type: 'number', default: 0.0075 },
        trials: { type: 'number', default: 2000 },
      },
    },
  },
  {
    name: 'fidos_annuity_quote',
    description:
      'Actuarial annuity payout from the live US Treasury par curve and the SSA period life table. Explicitly ' +
      'NOT a carrier quote: it excludes insurer expenses, lapses, credit spread and commissions.',
    inputSchema: {
      type: 'object',
      required: ['principal', 'startAge'],
      properties: {
        principal: { type: 'number' },
        startAge: { type: 'number' },
        deferralYears: { type: 'number', default: 0 },
        sex: { type: 'string', enum: ['male', 'female'], default: 'male' },
        colaRate: { type: 'number', default: 0, description: 'e.g. 0.02 for a 2% annual increase' },
        survivorBenefit: { type: 'number', default: 1, description: '1 = life only, 0.5 = 50% to survivor' },
        jointAge: { type: 'number' },
        jointSex: { type: 'string', enum: ['male', 'female'] },
      },
    },
  },
  {
    name: 'fidos_suitability_check',
    description:
      'Deterministic suitability gate over a proposed plan. Returns pass/fail/insufficient-evidence per rule and ' +
      'whether the plan may be shown to a client. Missing evidence blocks; it never passes by default.',
    inputSchema: {
      type: 'object',
      required: ['clientAge', 'riskTolerance', 'horizonYears', 'equityWeight', 'stressYearLoss'],
      properties: {
        clientAge: { type: 'number' },
        riskTolerance: { type: 'string', enum: ['conservative', 'moderate', 'aggressive'] },
        horizonYears: { type: 'number' },
        equityWeight: { type: 'number' },
        illiquidShare: { type: 'number', default: 0 },
        totalCostRatio: { type: 'number', default: 0.01 },
        stressYearLoss: { type: 'number', description: 'Negative decimal, e.g. -0.25' },
        hasEmergencyReserve: { type: 'boolean' },
        fundedRatio: { type: 'number' },
        concentrationAcknowledged: { type: 'boolean' },
        vulnerability: { type: 'boolean', default: false },
        products: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'fidos_disclosure_watch',
    description:
      'Recent SEC filings and risk-language hits for a list of tickers, from EDGAR primary sources. Returns ' +
      'links to the filings; it never summarises or interprets them.',
    inputSchema: {
      type: 'object',
      required: ['tickers'],
      properties: {
        tickers: { type: 'array', items: { type: 'string' } },
        lookbackDays: { type: 'number', default: 90 },
        forms: { type: 'array', items: { type: 'string' } },
      },
    },
  },
] as const;

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function fail(id: string | number | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function toolResult(payload: unknown, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError,
    ...(isError ? {} : { structuredContent: payload as Record<string, unknown> }),
  };
}

export function createMcpHandler(deps: McpDeps) {
  return async function handle(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const id = request.id ?? null;

    // Notifications carry no id and take no response.
    if (request.method.startsWith('notifications/')) return null;

    switch (request.method) {
      case 'initialize':
        return ok(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            'Financial planning calculators. Every result includes provenance and exclusions. ' +
            'Do not present a result as advice, and always surface the disclaimer and the source URL.',
        });

      case 'ping':
        return ok(id, {});

      case 'tools/list':
        return ok(id, { tools: TOOLS.map((t) => ({ ...t })) });

      case 'tools/call': {
        const params = request.params ?? {};
        const name = params.name;
        const rawArgs = params.arguments;
        if (typeof name !== 'string') return fail(id, -32602, 'params.name is required');
        const args = (typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}) as Record<string, unknown>;

        try {
          const payload = await callTool(name, args, deps);
          return ok(id, toolResult({ ...(payload as object), disclaimer: NOT_ADVICE }));
        } catch (err) {
          const message = (err as Error)?.message ?? 'tool failed';
          return ok(id, toolResult({ error: message, disclaimer: NOT_ADVICE }, true));
        }
      }

      default:
        return fail(id, -32601, `method not found: ${request.method}`);
    }
  };
}

async function callTool(name: string, args: Record<string, unknown>, deps: McpDeps): Promise<unknown> {
  switch (name) {
    case 'fidos_tax_estimate': {
      const d = computeTax({
        taxYear: num(args.taxYear, LATEST_TAX_YEAR),
        filingStatus: (args.filingStatus as TaxInput['filingStatus']) ?? 'single',
        ordinaryIncome: num(args.ordinaryIncome, 0),
        preferentialIncome: num(args.preferentialIncome, 0),
        contribution401k: num(args.contribution401k, 0),
        rothConversion: num(args.rothConversion, 0),
        hsaContribution: num(args.hsaContribution, 0),
        ...(Array.isArray(args.ages) ? { ages: args.ages.map((a) => Number(a)) } : {}),
      });
      return { data: d.value, provenance: d.provenance };
    }

    case 'fidos_retirement_projection': {
      const input: MonteCarloInput = {
        currentAge: num(args.currentAge, 0),
        retirementAge: num(args.retirementAge, 65),
        planToAge: num(args.planToAge, 95),
        portfolio: num(args.portfolio, 0),
        annualContribution: num(args.annualContribution, 0),
        annualSpending: num(args.annualSpending, 0),
        socialSecurity: num(args.socialSecurity, 0),
        socialSecurityStartAge: num(args.socialSecurityStartAge, 67),
        pension: num(args.pension, 0),
        equityWeight: num(args.equityWeight, 0.6),
        feeRate: num(args.feeRate, 0.0075),
        trials: Math.round(num(args.trials, 2000)),
        seed: 20261108,
      };
      const cal = await deps.calibration.assumptions({ equityWeight: input.equityWeight, feeRate: input.feeRate });
      const d = simulate(input, cal.assumptions);
      return {
        data: d.value,
        provenance: d.provenance,
        calibration: { observedFrom: cal.observedFrom, observedTo: cal.observedTo, sources: cal.provenanceSources },
      };
    }

    case 'fidos_annuity_quote': {
      const input: AnnuityInput = {
        principal: num(args.principal, 0),
        startAge: num(args.startAge, 65),
        deferralYears: num(args.deferralYears, 0),
        sex: (args.sex as 'male' | 'female') ?? 'male',
        colaRate: num(args.colaRate, 0),
        survivorBenefit: num(args.survivorBenefit, 1),
        ...(args.jointAge !== undefined ? { jointAge: num(args.jointAge, 0) } : {}),
        ...(args.jointSex ? { jointSex: args.jointSex as 'male' | 'female' } : {}),
      };
      const { latest } = await deps.calibration.treasury.latestCurve();
      const d = priceAnnuity(input, latest);
      return { data: d.value, provenance: d.provenance, curveDate: latest.date };
    }

    case 'fidos_suitability_check': {
      const facts: PlanFacts = {
        clientAge: num(args.clientAge, 0),
        riskTolerance: (args.riskTolerance as PlanFacts['riskTolerance']) ?? 'moderate',
        horizonYears: num(args.horizonYears, 10),
        equityWeight: num(args.equityWeight, 0.5),
        illiquidShare: num(args.illiquidShare, 0),
        totalCostRatio: num(args.totalCostRatio, 0.01),
        stressYearLoss: num(args.stressYearLoss, 0),
        hasEmergencyReserve: args.hasEmergencyReserve === undefined ? null : Boolean(args.hasEmergencyReserve),
        fundedRatio: args.fundedRatio === undefined ? null : num(args.fundedRatio, 0),
        concentrationAcknowledged: args.concentrationAcknowledged === undefined ? null : Boolean(args.concentrationAcknowledged),
        vulnerability: Boolean(args.vulnerability),
        products: Array.isArray(args.products) ? args.products.map(String) : [],
      };
      const d = assessSuitability(facts);
      return { data: d.value, provenance: d.provenance };
    }

    case 'fidos_disclosure_watch': {
      const tickers = Array.isArray(args.tickers) ? args.tickers.map(String) : [];
      const d = await deps.watch.run({
        tickers,
        lookbackDays: num(args.lookbackDays, 90),
        ...(Array.isArray(args.forms) ? { forms: args.forms.map(String) } : {}),
      });
      return { data: d.value, provenance: d.provenance };
    }

    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Read newline-delimited JSON-RPC from stdin and write responses to stdout. */
export async function runStdio(deps: McpDeps): Promise<void> {
  const handle = createMcpHandler(deps);
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      process.stdout.write(`${JSON.stringify(fail(null, -32700, 'parse error'))}\n`);
      continue;
    }
    const response = await handle(request);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}
