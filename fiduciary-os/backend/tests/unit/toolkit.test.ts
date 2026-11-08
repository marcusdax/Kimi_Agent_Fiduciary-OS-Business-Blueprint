import express, { json } from 'express';
import request from 'supertest';

import { errorHandler } from '../../src/middleware/errorHandler';
import { authRouter } from '../../src/routes/auth';
import { toolsRouter } from '../../src/routes/tools';
import {
  catalog,
  calculate,
  inputSchema,
  scheduleTax,
  ToolKind,
  Field,
} from '../../src/services/toolkit';
jest.mock('../../src/services/observations', () => ({ observations: jest.fn(async () => []) }));
const app = express();
app.use(json());
app.use('/auth', authRouter);
app.use('/tools', toolsRouter);
app.use(errorHandler);
const fixture = (kind: ToolKind) => ({
  source: 'Synthetic test',
  asOfDate: '2026-01-01',
  ...Object.fromEntries(
    (catalog[kind].fields as Field[]).map(f => [f.key, f.options?.[0] ?? Math.max(0, f.min!)])
  ),
});
describe('Blueprint scenarios', () => {
  it.each(Object.keys(catalog) as ToolKind[])('calculates validated %s', kind => {
    const result = calculate(kind, fixture(kind));
    expect(result.methodVersion).toBe('blueprint-educational-v1');
    expect(result.metrics.every(m => Number.isFinite(m.value))).toBe(true);
  });
  it('rejects invalid facts, dates, unknown fields and unsupported ranges', () => {
    const data = fixture('life');
    for (const bad of [
      { ...data, userId: 'other' },
      { ...data, asOfDate: '2026-02-30' },
      { ...data, asOfDate: '2099-01-01' },
      { ...data, income: NaN },
      { ...data, income: -1 },
      { ...data, income: 1e15 },
      { ...data, source: '' },
    ])
      expect(() => inputSchema('life').parse(bad)).toThrow();
    expect(() =>
      calculate('profile', { ...fixture('profile'), age: 60, retirementAge: 40 })
    ).toThrow();
    expect(() => calculate('estate', { ...fixture('estate'), liquid: 10, assets: 0 })).toThrow();
  });
  it('reconciles term payout, needs, contributions, fees, depletion and shocks', () => {
    expect(
      calculate('annuity', { ...fixture('annuity'), principal: 120000, years: 10 }).metrics[1].value
    ).toBe(1000);
    expect(
      calculate('life', {
        ...fixture('life'),
        income: 100000,
        years: 10,
        debt: 200000,
        education: 50000,
        assets: 100000,
        coverage: 200000,
      }).metrics[1].value
    ).toBe(950000);
    expect(
      calculate('investment', {
        ...fixture('investment'),
        principal: 1000,
        contribution: 100,
        years: 2,
        rate: 0,
      }).rows[2].balance
    ).toBe(1200);
    expect(
      calculate('investment', {
        ...fixture('investment'),
        principal: 1000,
        years: 1,
        rate: 0,
        fee: 1,
      }).rows[1].balance
    ).toBe(990);
    expect(
      calculate('retirement', {
        ...fixture('retirement'),
        principal: 1000,
        spending: 100,
        years: 2,
        rate: 0,
      }).rows[2].unfunded
    ).toBe(1400);
    expect(
      calculate('risk', { ...fixture('risk'), equities: 1000, equityShock: -50 }).metrics[1].value
    ).toBe(500);
  });
  it('reconciles the 2026 ordinary-income single/joint bracket boundaries', () => {
    expect(scheduleTax(16100, false).tax).toBe(0);
    expect(scheduleTax(28500, false).tax).toBe(1240);
    expect(scheduleTax(28501, false).tax).toBe(1240.12);
    expect(scheduleTax(57000, true).tax).toBe(2480);
    expect(scheduleTax(133000, true).tax).toBe(11600);
  });
  it('authenticates, persists per owner and rejects stale or mass-assigned writes', async () => {
    const create = async (email: string) =>
      (
        await request(app)
          .post('/auth/register')
          .send({ email, password: 'synthetic-passphrase-123', name: 'Synthetic test' })
      ).body.accessToken;
    const a = await create('tools-a@example.test'),
      b = await create('tools-b@example.test');
    expect((await request(app).get('/tools/scenarios')).status).toBe(401);
    const inputs = fixture('life');
    const save = await request(app)
      .put('/tools/scenarios/life')
      .auth(a, { type: 'bearer' })
      .send({ version: 0, inputs });
    expect(save.status).toBe(200);
    expect(save.body.version).toBe(1);
    expect((await request(app).get('/tools/scenarios').auth(b, { type: 'bearer' })).body).toEqual(
      []
    );
    expect(
      (await request(app).get('/tools/scenarios').auth(a, { type: 'bearer' })).body[0].inputs.source
    ).toBe(inputs.source);
    expect(
      (
        await request(app)
          .put('/tools/scenarios/life')
          .auth(a, { type: 'bearer' })
          .send({ version: 0, inputs })
      ).status
    ).toBe(409);
    expect(
      (
        await request(app)
          .put('/tools/scenarios/unknown')
          .auth(a, { type: 'bearer' })
          .send({ version: 0, inputs })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .put('/tools/scenarios/life')
          .auth(a, { type: 'bearer' })
          .send({ version: 1, inputs: { ...inputs, userId: 'other' } })
      ).status
    ).toBe(400);
  });
});
