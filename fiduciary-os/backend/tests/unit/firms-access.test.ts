import express, { json } from 'express';
import request from 'supertest';

import { prisma } from '../../src/config/database';
import { errorHandler } from '../../src/middleware/errorHandler';
import { authRouter } from '../../src/routes/auth';
import { firmsRouter } from '../../src/routes/firms';

const app = express();
app.use(json());
app.use('/auth', authRouter);
app.use('/org', firmsRouter);
app.use(errorHandler);

async function user(email: string) {
  const r = await request(app).post('/auth/register').send({ email, password: 'password123', name: email.split('@')[0] });
  return { email, h: { Authorization: `Bearer ${r.body.accessToken}` } };
}
const post = (u: { h: Record<string, string> }, url: string, body: object) => request(app).post(url).set(u.h).send(body);
const get = (u: { h: Record<string, string> }, url: string) => request(app).get(url).set(u.h);

async function setup() {
  const owner = await user('owner@firm.test');
  const adv = await user('adv@firm.test');
  const adv2 = await user('adv2@firm.test');
  const client = await user('client@home.test');
  const other = await user('other@home.test');
  const firm = (await post(owner, '/org/firms', { name: 'Acme Wealth' })).body;
  await post(owner, `/org/firms/${firm.id}/advisors`, { email: adv.email });
  await post(owner, `/org/firms/${firm.id}/advisors`, { email: adv2.email });
  const hh = (await post(owner, `/org/firms/${firm.id}/households`, { name: 'Smith' })).body;
  await post(owner, `/org/households/${hh.id}/clients`, { email: client.email });
  return { owner, adv, adv2, client, other, firm, hh };
}

describe('firm -> advisor -> household permissions', () => {
  it('owner and household client can view; unrelated users and unassigned advisors cannot', async () => {
    const s = await setup();
    expect((await get(s.owner, `/org/households/${s.hh.id}`)).body.access).toBe('firm owner');
    expect((await get(s.client, `/org/households/${s.hh.id}`)).body.access).toBe('household client');
    expect((await get(s.other, `/org/households/${s.hh.id}`)).status).toBe(403);
    expect((await get(s.adv, `/org/households/${s.hh.id}`)).status).toBe(403);
  });
  it('assignment grants view; manage needs manage scope', async () => {
    const s = await setup();
    await post(s.owner, `/org/households/${s.hh.id}/assignments`, { email: s.adv.email, scope: 'view' });
    expect((await get(s.adv, `/org/households/${s.hh.id}`)).status).toBe(200);
    expect((await post(s.adv, `/org/households/${s.hh.id}/clients`, { email: s.other.email })).status).toBe(403);
    await post(s.owner, `/org/households/${s.hh.id}/assignments`, { email: s.adv.email, scope: 'manage' });
    expect((await post(s.adv, `/org/households/${s.hh.id}/clients`, { email: s.other.email })).status).toBe(201);
  });
  it('clients cannot manage or assign; only owners assign', async () => {
    const s = await setup();
    expect((await post(s.client, `/org/households/${s.hh.id}/clients`, { email: s.other.email })).status).toBe(403);
    expect((await post(s.adv, `/org/households/${s.hh.id}/assignments`, { email: s.adv.email, scope: 'manage' })).status).toBe(403);
  });
  it('removing an advisor from the firm revokes assignment access', async () => {
    const s = await setup();
    await post(s.owner, `/org/households/${s.hh.id}/assignments`, { email: s.adv.email, scope: 'manage' });
    await prisma.firmMember.deleteMany({ where: { firmId: s.firm.id, user: { email: s.adv.email } } });
    expect((await get(s.adv, `/org/households/${s.hh.id}`)).status).toBe(403);
  });
  it('lists only visible households', async () => {
    const s = await setup();
    expect((await get(s.client, '/org/households')).body).toHaveLength(1);
    expect((await get(s.other, '/org/households')).body).toHaveLength(0);
    expect((await get(s.adv2, '/org/households')).body).toHaveLength(0);
  });
  it('logs allowed and denied decisions', async () => {
    const s = await setup();
    await get(s.other, `/org/households/${s.hh.id}`);
    await get(s.client, `/org/households/${s.hh.id}`);
    const logs = await prisma.accessLog.findMany({ where: { householdId: s.hh.id, action: 'view' } });
    expect(logs.filter(l => !l.allowed)).toHaveLength(1);
    expect(logs.filter(l => l.allowed).length).toBeGreaterThanOrEqual(1);
  });
  it('rejects unknown fields and bad colors', async () => {
    const o = await user('o2@firm.test');
    expect((await post(o, '/org/firms', { name: 'X', brandColor: 'red' })).status).toBe(400);
    expect((await post(o, '/org/firms', { name: 'X', role: 'admin' })).status).toBe(400);
  });
});

describe('household plan PDF', () => {
  it('returns a branded PDF with the plan for permitted users, 403 otherwise', async () => {
    const s = await setup();
    const c = await prisma.user.findUniqueOrThrow({ where: { email: s.client.email } });
    await prisma.financialPlan.create({
      data: {
        userId: c.id,
        inputs: JSON.stringify({ name: 'Plan', asOf: '2026-01-01', source: 'Client entered', balances: { cash: 1000000, bonds: 0, equities: 5000000, other: 0 }, monthlyIncomeCents: 800000, monthlySpendingCents: 500000, annualReturnBps: 500, annualFeeBps: 50, annualInflationBps: 250, years: 10 }),
      },
    });
    const bin = (res: any, cb: any) => { const b: Buffer[] = []; res.on('data', (d: Buffer) => b.push(d)); res.on('end', () => cb(null, Buffer.concat(b))); };
    const ok = await get(s.client, `/org/households/${s.hh.id}/plan.pdf`).buffer(true).parse(bin);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toMatch(/application\/pdf/);
    expect((ok.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await get(s.other, `/org/households/${s.hh.id}/plan.pdf`)).status).toBe(403);
  });
});
