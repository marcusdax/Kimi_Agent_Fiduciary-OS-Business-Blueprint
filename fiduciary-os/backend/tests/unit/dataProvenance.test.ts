import request from 'supertest';
import express from 'express';
import { authRouter } from '../../src/routes/auth';
import { aiRouter } from '../../src/routes/ai';
import { marketRouter } from '../../src/routes/market';
import { errorHandler } from '../../src/middleware/errorHandler';
import { prisma } from '../../src/config/database';
import { AI_DISCLOSURE } from '../../src/services/aiGuardrails';

const app = express();
app.use(express.json());
app.use('/auth', authRouter);
app.use('/ai', aiRouter);
app.use('/market', marketRouter);
app.use(errorHandler);

const ORIGINAL_ENV = { ...process.env };

async function token(email: string): Promise<string> {
  const res = await request(app).post('/auth/register').send({ email, password: 'password123', name: 'Test' });
  return res.body.accessToken as string;
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test', ENABLE_AI_INSIGHTS: 'true' };
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ALPHA_VANTAGE_API_KEY;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('AI responses', () => {
  it('carry the disclosure, provenance, and a supervision record', async () => {
    const t = await token('ai-envelope@example.com');

    const res = await request(app)
      .post('/ai/profile-insight')
      .set('Authorization', `Bearer ${t}`)
      .send({ profile: { age: 52, name: 'Should Not Leave', email: 'x@example.com' } });

    expect(res.status).toBe(200);
    expect(res.body.disclosure).toBe(AI_DISCLOSURE);
    expect(res.body.notARecommendation).toBe(true);
    expect(res.body.source).toBe('fallback');
    expect(res.body.interactionId).toEqual(expect.any(String));

    const row = await prisma.aiInteraction.findUnique({ where: { id: res.body.interactionId } });
    expect(row?.endpoint).toBe('/ai/profile-insight');
    expect(row?.source).toBe('fallback');
    // Identifiers are stripped before the prompt is built (and therefore before logging).
    expect(row?.prompt).not.toContain('Should Not Leave');
    expect(row?.prompt).not.toContain('x@example.com');
  });

  it('fail closed in production when only fallback text is available', async () => {
    const t = await token('ai-prod@example.com');
    process.env.NODE_ENV = 'production';

    const res = await request(app)
      .post('/ai/retirement-insight')
      .set('Authorization', `Bearer ${t}`)
      .send({ config: { portfolioValue: 500000 } });

    expect(res.status).toBe(503);
  });
});

describe('Market data', () => {
  it('labels mock quotes outside production', async () => {
    const t = await token('mock-quote@example.com');

    const res = await request(app).get('/market/quote/SPY').set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('mock');
    expect(res.body.meta.source).toBe('mock');
    expect(res.body.data.change).toBe(0);
  });

  it('refuses mock quotes in production', async () => {
    const t = await token('mock-prod@example.com');
    process.env.NODE_ENV = 'production';

    const res = await request(app).get('/market/quote/SPY').set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(503);
  });

  it('does not invent risk metrics in portfolio analytics', async () => {
    const t = await token('analytics@example.com');

    const res = await request(app)
      .post('/market/portfolio-analytics')
      .set('Authorization', `Bearer ${t}`)
      .send({ holdings: [{ symbol: 'VTI', quantity: 10, avgCost: 80 }] });

    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('mock');
    expect(res.body.data.beta).toBeUndefined();
    expect(res.body.data.sharpeRatio).toBeUndefined();
    expect(res.body.data.unavailableMetrics).toContain('beta');
  });
});

describe('Insurance illustrations', () => {
  it('are anonymised, labelled illustrative, and carry a disclaimer', async () => {
    const t = await token('insurance@example.com');

    const res = await request(app)
      .post('/market/insurance/quotes')
      .set('Authorization', `Bearer ${t}`)
      .send({ age: 40, gender: 'female', coverageAmount: 500000, termLength: 20 });

    expect(res.status).toBe(200);
    expect(res.body.meta.source).toBe('illustrative');
    expect(res.body.disclaimer).toMatch(/not quotes or offers/);
    for (const item of res.body.data) {
      expect(item.carrier).toMatch(/^Illustrative Carrier [A-F]$/);
      expect(item.illustrative).toBe(true);
      expect(item).not.toHaveProperty('rating');
      expect(item).not.toHaveProperty('carrierLogo');
    }
  });
});

describe('Calculators', () => {
  it('label every estimate illustrative and use head-of-household brackets for HoH filers', async () => {
    const t = await token('calc@example.com');
    const body = {
      annualIncome: 80000,
      contribution401k: 0,
      rothConversion: 0,
      capitalLossHarvest: 0,
      hsaContribution: 0,
      qcdAmount: 0,
    };

    const { calculationsRouter } = await import('../../src/routes/calculations');
    const calcApp = express();
    calcApp.use(express.json());
    calcApp.use('/calc', calculationsRouter);
    calcApp.use(errorHandler);

    const single = await request(calcApp).post('/calc/tax').set('Authorization', `Bearer ${t}`).send({ ...body, filingStatus: 'single' });
    const head = await request(calcApp).post('/calc/tax').set('Authorization', `Bearer ${t}`).send({ ...body, filingStatus: 'head' });

    expect(single.status).toBe(200);
    expect(single.body.illustrative).toBe(true);
    expect(single.body.disclaimer).toMatch(/not a quote, offer, or recommendation/);
    expect(single.body.taxYearAssumed).toBe(2024);
    // 2024: single $80,000 - $14,600 = $65,400 taxable -> $9,441; HoH $80,000 - $21,900 = $58,100 -> $6,641.
    expect(Math.round(single.body.estimatedLiability)).toBe(9441);
    expect(Math.round(head.body.estimatedLiability)).toBe(6641);
  });
});
