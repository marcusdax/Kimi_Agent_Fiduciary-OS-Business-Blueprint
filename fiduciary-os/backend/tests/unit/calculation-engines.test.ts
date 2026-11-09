import express, { json } from 'express';
import request from 'supertest';

import { priceAnnuity } from '../../src/engines/annuity';
import { survival, lifeExpectancy } from '../../src/engines/mortality';
import { runRetirement, sustainableSpending } from '../../src/engines/retirement';
import { incomeTax } from '../../src/engines/tax';
import { pmt, fv, pv } from '../../src/engines/timeValue';
import { errorHandler } from '../../src/middleware/errorHandler';
import { calculationsRouter } from '../../src/routes/calculations';

jest.mock('../../src/middleware/auth', () => ({
  authenticateToken: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const app = express();
app.use(json());
app.use('/calc', calculationsRouter);
app.use(errorHandler);

describe('time value (formulajs) reconciles to spreadsheet values', () => {
  it('PMT / FV / PV', () => {
    expect(pmt(0.05 / 12, 360, 200000)).toBeCloseTo(-1073.64, 2);
    expect(fv(0.05, 10, -1000)).toBeCloseTo(12577.89, 2);
    expect(fv(0.05, 10, 0, -1000)).toBeCloseTo(1628.89, 2);
    expect(pv(0.05, 10, 1000)).toBeCloseTo(-7721.73, 2);
  });
});

describe('mortality', () => {
  it('survival is in (0,1], decreasing, life expectancy plausible', () => {
    const a = survival(65, 10, 'male');
    const b = survival(65, 20, 'male');
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(0);
    expect(lifeExpectancy(65, 'female')).toBeGreaterThan(lifeExpectancy(65, 'male'));
    expect(lifeExpectancy(65, 'male')).toBeGreaterThan(14);
    expect(lifeExpectancy(65, 'male')).toBeLessThan(24);
  });
});

describe('annuity engine', () => {
  const base = { premium: 500000, purchaseAge: 65, deferralYears: 0, sex: 'male' as const, discountRate: 0.045, colaRate: 0 };
  it('payout rate is sane and rises with discount rate', () => {
    const lo = priceAnnuity({ ...base, discountRate: 0.03 });
    const hi = priceAnnuity({ ...base, discountRate: 0.06 });
    expect(lo.payoutRatePct).toBeGreaterThan(4);
    expect(hi.payoutRatePct).toBeGreaterThan(lo.payoutRatePct);
    expect(hi.payoutRatePct).toBeLessThan(15);
  });
  it('COLA and joint-life lower starting income', () => {
    const plain = priceAnnuity(base);
    expect(priceAnnuity({ ...base, colaRate: 0.025 }).annualIncome).toBeLessThan(plain.annualIncome);
    expect(priceAnnuity({ ...base, joint: { age: 65, sex: 'female', survivorShare: 1 } }).annualIncome).toBeLessThan(plain.annualIncome);
  });
});

describe('retirement engine', () => {
  const base = { portfolio: 1000000, horizonYears: 30, stockShare: 0.6, strategy: 'fixed' as const, retirementAge: 65 };
  it('low spending beats high spending', () => {
    const low = runRetirement({ ...base, annualNetSpending: 30000 });
    const high = runRetirement({ ...base, annualNetSpending: 90000 });
    expect(low.successRatePct).toBeGreaterThan(high.successRatePct);
    expect(low.successRatePct).toBeGreaterThanOrEqual(90);
  });
  it('sustainable spending passes its own target', () => {
    const s = sustainableSpending(base, 90);
    expect(s).toBeGreaterThan(20000);
    expect(runRetirement({ ...base, annualNetSpending: s }).successRatePct).toBeGreaterThanOrEqual(90);
  });
});

describe('tax engine', () => {
  it('2024 regression (single, $100k)', () => {
    expect(incomeTax(2024, 'single', 100000).tax).toBeCloseTo(13841, -1);
  });
  it('2026 standard deduction applies', () => {
    expect(incomeTax(2026, 'single', 16100).tax).toBe(0);
    expect(incomeTax(2026, 'married', 32200).tax).toBe(0);
    expect(incomeTax(2026, 'head', 24150).tax).toBe(0);
  });
});

describe('calculation routes', () => {
  it('annuity returns method, assumptions, disclosure', async () => {
    const r = await request(app).post('/calc/annuity').send({ principal: 500000, deferralPeriod: 0, startAge: 65, productType: 'fixed', jointLife: 'no', colaRider: '0' });
    expect(r.status).toBe(200);
    expect(r.body.monthlyIncome).toBeGreaterThan(0);
    expect(r.body.assumptions.length).toBeGreaterThan(0);
  });
  it('life insurance gives no fabricated premium', async () => {
    const r = await request(app).post('/calc/life-insurance').send({ currentAge: 40, annualIncome: 100, existingCoverage: 100, term: '20', healthClass: 'p', gender: 'm', tobacco: 'n' });
    expect(r.status).toBe(200);
    expect(r.body.monthlyPremium).toBeNull();
    expect(r.body.ruleOfThumb10x).toBe(1000000);
    expect(r.body.protectionGap).toBeGreaterThan(0);
  });
  it('retirement reports a historical rate, not a probability', async () => {
    const r = await request(app).post('/calc/retirement').send({ portfolioValue: 1000000, retirementAge: 65, monthlySpending: 5000, socialSecurity: 2000, pension: 0, strategy: '4pct' });
    expect(r.status).toBe(200);
    expect(r.body.historicalSuccessRatePct).toBeGreaterThanOrEqual(0);
    expect(r.body.successProbability).toBeUndefined();
  });
  it('tax defaults to 2026 and supports 2024', async () => {
    const body = { filingStatus: 'single', annualIncome: 100000, contribution401k: 0, rothConversion: 0, capitalLossHarvest: 0, hsaContribution: 0, qcdAmount: 0 };
    const d = await request(app).post('/calc/tax').send(body);
    expect(d.body.taxYearAssumed).toBe(2026);
    const o = await request(app).post('/calc/tax').send({ ...body, taxYear: '2024' });
    expect(o.body.taxYearAssumed).toBe(2024);
  });
  it('validates input', async () => {
    const r = await request(app).post('/calc/tax').send({ filingStatus: 'nope' });
    expect(r.status).toBe(400);
  });
});
