import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { priceAnnuity } from '../engines/annuity';
import { runRetirement, sustainableSpending } from '../engines/retirement';
import { incomeTax, DEFAULT_TAX_YEAR, SUPPORTED_TAX_YEARS, TAX_TABLES } from '../engines/tax';

/**
 * Read-only MCP server exposing the documented-method calculators so an AI client can call
 * them instead of doing arithmetic itself. No database, no auth, no client data: pure functions.
 * Every result carries the educational disclosure. Run: `npm run mcp` (stdio).
 */
export const MCP_DISCLOSURE =
  'Educational illustration only. Not a quote, offer, or recommendation. Method and assumptions are listed in each result.';

const text = (o: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify({ ...(o as object), disclosure: MCP_DISCLOSURE }, null, 2) }] });

export function buildServer(): McpServer {
  const server = new McpServer({ name: 'fiduciary-os-calculators', version: '0.1.0' });

  server.tool(
    'annuity_income',
    'Actuarial fair-value annuity income illustration (SSA 2023 mortality). Not a carrier quote.',
    {
      premium: z.number().min(1000),
      purchaseAge: z.number().int().min(45).max(80),
      deferralYears: z.number().int().min(0).max(30).default(0),
      sex: z.enum(['male', 'female']).default('male'),
      discountRate: z.number().min(0.005).max(0.1).default(0.045),
      colaRate: z.number().min(0).max(0.05).default(0),
    },
    async a => text(priceAnnuity({ premium: a.premium, purchaseAge: a.purchaseAge, deferralYears: a.deferralYears, sex: a.sex, discountRate: a.discountRate, colaRate: a.colaRate }))
  );

  server.tool(
    'retirement_historical_replay',
    'Replays a spending plan through every historical start year (1928+). Reports a historical success rate, not a probability or forecast.',
    {
      portfolio: z.number().min(10000),
      annualNetSpending: z.number().min(0),
      horizonYears: z.number().int().min(10).max(50).default(30),
      stockShare: z.number().min(0).max(1).default(0.6),
      strategy: z.enum(['fixed', 'dynamic', 'guardrails', 'annuity']).default('fixed'),
      retirementAge: z.number().int().min(50).max(80).default(65),
    },
    async a => {
      const base = { portfolio: a.portfolio, horizonYears: a.horizonYears, stockShare: a.stockShare, strategy: a.strategy, retirementAge: a.retirementAge };
      return text({ ...runRetirement({ ...base, annualNetSpending: a.annualNetSpending }), sustainableAnnualAt90pct: sustainableSpending(base, 90) });
    }
  );

  server.tool(
    'federal_income_tax',
    `Federal ordinary income tax from versioned tables (${SUPPORTED_TAX_YEARS.join(', ')}). No state tax, credits or AMT.`,
    {
      filingStatus: z.enum(['single', 'married', 'head']),
      grossIncome: z.number().min(0),
      taxYear: z.number().int().default(DEFAULT_TAX_YEAR),
    },
    async a => {
      if (!(a.taxYear in TAX_TABLES)) return { isError: true, content: [{ type: 'text' as const, text: `Unsupported taxYear. Supported: ${SUPPORTED_TAX_YEARS.join(', ')}` }] };
      return text({ ...incomeTax(a.taxYear, a.filingStatus, a.grossIncome), taxYear: a.taxYear, citation: TAX_TABLES[a.taxYear].citation });
    }
  );

  return server;
}

if (require.main === module) {
  void buildServer().connect(new StdioServerTransport());
}
