import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { checkHousehold, visibleHouseholdIds } from '../services/access';
import { financialInputs, projectPlan } from '../services/financial-plan';
import { planRows, renderPlanPdf } from '../services/planPdf';

const router = Router();
router.use(authenticateToken);

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const wrap = (fn: (req: any, res: any) => Promise<void>) => (req: any, res: any, next: any) => fn(req, res).catch(next);
const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const r = schema.safeParse(body);
  if (!r.success) throw new AppError(400, 'Invalid request');
  return r.data;
};
async function requireOwner(userId: string, firmId: string) {
  const m = await prisma.firmMember.findUnique({ where: { firmId_userId: { firmId, userId } } });
  if (m?.role !== 'owner') throw new AppError(403, 'Firm owner only');
}
async function userByEmail(email: string) {
  const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
  if (!u) throw new AppError(404, 'No user with that email. They must register first.');
  return u;
}

router.post('/firms', wrap(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(1).max(100), brandColor: color.optional() }).strict(), req.body);
  const firm = await prisma.firm.create({ data: { name: b.name, brandColor: b.brandColor, members: { create: { userId: req.user.userId, role: 'owner' } } } });
  res.status(201).json(firm);
}));

router.post('/firms/:firmId/advisors', wrap(async (req, res) => {
  await requireOwner(req.user.userId, req.params.firmId);
  const b = parse(z.object({ email: z.string().email() }).strict(), req.body);
  const u = await userByEmail(b.email);
  const m = await prisma.firmMember.upsert({ where: { firmId_userId: { firmId: req.params.firmId, userId: u.id } }, update: {}, create: { firmId: req.params.firmId, userId: u.id, role: 'advisor' } });
  res.status(201).json(m);
}));

router.post('/firms/:firmId/households', wrap(async (req, res) => {
  const m = await prisma.firmMember.findUnique({ where: { firmId_userId: { firmId: req.params.firmId, userId: req.user.userId } } });
  if (!m) throw new AppError(403, 'Not a member of this firm');
  const b = parse(z.object({ name: z.string().min(1).max(100) }).strict(), req.body);
  const h = await prisma.household.create({ data: { firmId: req.params.firmId, name: b.name } });
  // The creating advisor is assigned with manage scope; an owner already has access.
  if (m.role === 'advisor') await prisma.householdAssignment.create({ data: { householdId: h.id, advisorUserId: req.user.userId, scope: 'manage' } });
  res.status(201).json(h);
}));

router.post('/households/:id/clients', wrap(async (req, res) => {
  const d = await checkHousehold(req.user.userId, req.params.id, 'manage');
  if (!d.allowed) throw new AppError(403, 'Insufficient permissions');
  const u = await userByEmail(parse(z.object({ email: z.string().email() }).strict(), req.body).email);
  const c = await prisma.householdClient.upsert({ where: { householdId_userId: { householdId: req.params.id, userId: u.id } }, update: {}, create: { householdId: req.params.id, userId: u.id } });
  res.status(201).json(c);
}));

router.post('/households/:id/assignments', wrap(async (req, res) => {
  const h = await prisma.household.findUnique({ where: { id: req.params.id } });
  if (!h) throw new AppError(404, 'Household not found');
  await requireOwner(req.user.userId, h.firmId);
  const b = parse(z.object({ email: z.string().email(), scope: z.enum(['view', 'manage']) }).strict(), req.body);
  const u = await userByEmail(b.email);
  const member = await prisma.firmMember.findUnique({ where: { firmId_userId: { firmId: h.firmId, userId: u.id } } });
  if (!member) throw new AppError(400, 'Advisor must belong to the firm first');
  const a = await prisma.householdAssignment.upsert({ where: { householdId_advisorUserId: { householdId: h.id, advisorUserId: u.id } }, update: { scope: b.scope }, create: { householdId: h.id, advisorUserId: u.id, scope: b.scope } });
  res.status(201).json(a);
}));

router.get('/households', wrap(async (req, res) => {
  const ids = await visibleHouseholdIds(req.user.userId);
  res.json(await prisma.household.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, firmId: true } }));
}));

router.get('/households/:id', wrap(async (req, res) => {
  const d = await checkHousehold(req.user.userId, req.params.id, 'view');
  if (!d.allowed) throw new AppError(403, 'Insufficient permissions');
  const h = await prisma.household.findUniqueOrThrow({ where: { id: req.params.id }, include: { firm: { select: { name: true } }, clients: { include: { user: { select: { id: true, name: true } } } } } });
  res.json({ id: h.id, name: h.name, firm: h.firm.name, clients: h.clients.map(c => c.user), access: d.reason });
}));

router.get('/households/:id/plan.pdf', wrap(async (req, res) => {
  const d = await checkHousehold(req.user.userId, req.params.id, 'view');
  if (!d.allowed) throw new AppError(403, 'Insufficient permissions');
  const h = await prisma.household.findUniqueOrThrow({ where: { id: req.params.id }, include: { firm: true, clients: { include: { user: { select: { id: true, name: true } } } } } });
  const sections = [];
  for (const c of h.clients) {
    const plan = await prisma.financialPlan.findUnique({ where: { userId: c.user.id } });
    let rows: Array<[string, string]> = [];
    if (plan) {
      const inputs = financialInputs.parse(JSON.parse(plan.inputs));
      rows = planRows(inputs, projectPlan(inputs));
    }
    sections.push({ client: c.user.name, rows });
  }
  const pdf = await renderPlanPdf({ firmName: h.firm.name, brandColor: h.firm.brandColor, household: h.name, generatedOn: new Date().toISOString().slice(0, 10), sections });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="household-plan.pdf"');
  res.send(pdf);
}));

export { router as firmsRouter };
