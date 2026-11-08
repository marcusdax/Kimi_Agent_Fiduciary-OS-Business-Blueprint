import express, { json } from 'express';
import request from 'supertest';

import { prisma } from '../../src/config/database';
import { errorHandler } from '../../src/middleware/errorHandler';
import { authRouter } from '../../src/routes/auth';
import { financialPlanRouter } from '../../src/routes/financial-plan';
import { portfolioRouter } from '../../src/routes/portfolio';
import { projectPlan, financialInputs } from '../../src/services/financial-plan';
const app = express();
app.use(json());
app.use('/auth', authRouter);
app.use('/plan', financialPlanRouter);
app.use('/portfolio', portfolioRouter);
app.use(errorHandler);
const inputs = {
  name: 'Test plan',
  asOf: '2026-11-08',
  source: 'Synthetic test fixture',
  balances: { cash: 1000000, bonds: 0, equities: 0, other: 0 },
  monthlyIncomeCents: 100000,
  monthlySpendingCents: 50000,
  annualReturnBps: 0,
  annualFeeBps: 0,
  annualInflationBps: 0,
  years: 2,
};
async function account(email = 'financial@example.test') {
  return (
    await request(app)
      .post('/auth/register')
      .send({ email, name: 'Test', password: 'test-password-123' })
  ).body;
}
const read = (token: string) => request(app).get('/plan').set('Authorization', `Bearer ${token}`);
const put = (token: string, version: number, values = inputs) =>
  request(app)
    .put('/plan')
    .set('Authorization', `Bearer ${token}`)
    .send({ version, inputs: values });
describe('deterministic financial plan', () => {
  it('reconciles zero-rate balances and cash flows exactly', () => {
    const p = projectPlan(inputs);
    expect(p.rows.map(r => r.nominalCents)).toEqual([1000000, 1600000, 2200000]);
    expect(p.rows[2].realCents).toBe(2200000);
    expect(p.depletionMonth).toBeNull();
  });
  it('compounds effective annual return and inflation independently', () => {
    const p = projectPlan({
      ...inputs,
      monthlyIncomeCents: 0,
      monthlySpendingCents: 0,
      annualReturnBps: 1000,
      annualInflationBps: 1000,
    });
    expect(p.rows[1].nominalCents).toBe(1100000);
    expect(p.rows[2].realCents).toBe(1000000);
  });
  it('accounts for asset fees rather than inventing returns', () => {
    const p = projectPlan({
      ...inputs,
      monthlyIncomeCents: 0,
      monthlySpendingCents: 0,
      annualFeeBps: 100,
    });
    expect(p.rows[1].nominalCents).toBe(990000);
    expect(p.rows[1].cumulativeFeesCents).toBe(10000);
  });
  it('tracks unfunded spending without negative assets or fake success probability', () => {
    const p = projectPlan({
      ...inputs,
      balances: { cash: 100000, bonds: 0, equities: 0, other: 0 },
      monthlyIncomeCents: 0,
      monthlySpendingCents: 60000,
    });
    expect(p.depletionMonth).toBe(2);
    expect(p.rows[1].nominalCents).toBe(0);
    expect(p.rows[1].cumulativeUnfundedCents).toBe(620000);
    expect(p).not.toHaveProperty('successProbability');
  });
  it('rejects invalid calendar dates, nonfinite/negative money, excessive bounds and unknown fields', () => {
    for (const extra of [
      { asOf: '2026-02-30' },
      { years: 0 },
      { years: 61 },
      { annualReturnBps: -10000 },
      { monthlyIncomeCents: NaN },
      { monthlySpendingCents: -1 },
      { userId: 'other' },
    ])
      expect(financialInputs.safeParse({ ...inputs, ...extra }).success).toBe(false);
  });
  it('requires access tokens, never accepting refresh tokens', async () => {
    expect((await request(app).get('/plan')).status).toBe(401);
    const u = await account();
    expect((await read(u.refreshToken)).status).toBe(401);
  });
  it('persists and updates only its owner with optimistic concurrency', async () => {
    const a = await account();
    const b = await account('other@example.test');
    expect((await read(a.accessToken)).body).toBeNull();
    const created = await put(a.accessToken, 0);
    expect(created.status).toBe(200);
    expect(created.body.version).toBe(1);
    expect((await read(a.accessToken)).body.inputs.name).toBe(inputs.name);
    expect((await read(b.accessToken)).body).toBeNull();
    expect((await put(a.accessToken, 0)).status).toBe(409);
    const updated = await put(a.accessToken, 1, { ...inputs, name: 'Revised' });
    expect(updated.body.version).toBe(2);
    expect((await put(a.accessToken, 1)).status).toBe(409);
    expect((await read(a.accessToken)).body.inputs.name).toBe('Revised');
    expect((await read(b.accessToken)).body).toBeNull();
  });
  it('rejects mass assignment and malformed input without changing saved values', async () => {
    const u = await account();
    await put(u.accessToken, 0);
    const r = await request(app)
      .put('/plan')
      .set('Authorization', `Bearer ${u.accessToken}`)
      .send({ version: 1, inputs, userId: 'someone' });
    expect(r.status).toBe(400);
    expect((await read(u.accessToken)).body.version).toBe(1);
  });
  it('prevents cross-account deletion of holdings and atomic loss on invalid replacement', async () => {
    const a = await account();
    const b = await account('second@example.test');
    const p = await prisma.portfolio.create({
      data: {
        userId: a.user.id,
        holdings: { create: { symbol: 'TEST', quantity: 1, avgCost: 5 } },
      },
      include: { holdings: true },
    });
    const denied = await request(app)
      .delete('/portfolio/holdings/' + p.holdings[0].id)
      .set('Authorization', `Bearer ${b.accessToken}`);
    expect(denied.status).not.toBe(200);
    expect(await prisma.holding.count({ where: { portfolioId: p.id } })).toBe(1);
    const invalid = await request(app)
      .put('/portfolio')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ holdings: [{ symbol: 'X', quantity: -1 }] });
    expect(invalid.status).toBe(400);
    expect(await prisma.holding.count({ where: { portfolioId: p.id } })).toBe(1);
  });
  it('never exposes database exception details or stack traces', async () => {
    const b = await account();
    const r = await request(app)
      .delete('/portfolio/holdings/unknown')
      .set('Authorization', `Bearer ${b.accessToken}`);
    expect(r.body).not.toHaveProperty('stack');
    expect(r.body).not.toHaveProperty('message');
  });
});
