import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { buildServer, MCP_DISCLOSURE } from '../../src/mcp/server';

async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 't', version: '0' });
  await Promise.all([buildServer().connect(b), client.connect(a)]);
  return client;
}
const parse = (r: any) => JSON.parse(r.content[0].text);

describe('MCP calculators', () => {
  it('lists the three tools', async () => {
    const c = await connect();
    const names = (await c.listTools()).tools.map(t => t.name).sort();
    expect(names).toEqual(['annuity_income', 'federal_income_tax', 'retirement_historical_replay']);
  });
  it('tax tool returns result with disclosure and citation', async () => {
    const c = await connect();
    const out = parse(await c.callTool({ name: 'federal_income_tax', arguments: { filingStatus: 'single', grossIncome: 100000, taxYear: 2024 } }));
    expect(out.tax).toBeCloseTo(13841, -1);
    expect(out.disclosure).toBe(MCP_DISCLOSURE);
    expect(out.citation).toBeTruthy();
  });
  it('rejects unsupported tax year and bad input', async () => {
    const c = await connect();
    const r: any = await c.callTool({ name: 'federal_income_tax', arguments: { filingStatus: 'single', grossIncome: 1, taxYear: 1999 } });
    expect(r.isError).toBe(true);
    const bad: any = await c.callTool({ name: 'annuity_income', arguments: { premium: 5, purchaseAge: 65 } });
    expect(bad.isError).toBe(true);
  });
  it('annuity and retirement tools run', async () => {
    const c = await connect();
    expect(parse(await c.callTool({ name: 'annuity_income', arguments: { premium: 500000, purchaseAge: 65 } })).annualIncome).toBeGreaterThan(0);
    expect(parse(await c.callTool({ name: 'retirement_historical_replay', arguments: { portfolio: 1000000, annualNetSpending: 40000 } })).successRatePct).toBeGreaterThan(50);
  });
});
