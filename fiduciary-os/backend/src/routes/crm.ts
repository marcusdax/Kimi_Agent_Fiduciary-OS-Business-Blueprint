/**
 * routes/crm.ts — Native PostgreSQL + pgcrypto Household Graph CRM API (/api/v1/crm/*).
 *
 * All routes require JWT authentication (`authenticateToken`) and enforce RBAC scoping
 * through `crmService` (client: own households; advisor: advised/owned; admin: all).
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import * as crmService from '../services/crmService';

const router = Router();
router.use(authenticateToken);

const lifecycleStageSchema = z.enum([
  'PROSPECT',
  'NEW_HOUSEHOLD',
  'ACTIVE_STEWARDSHIP',
  'LEGACY_HEIR',
]);

const personRoleSchema = z.enum([
  'PLANNER_PARENT',
  'SPOUSE_PARTNER',
  'NEXTGEN_HEIR',
  'TRUST_BENEFICIARY',
  'POWER_OF_ATTORNEY',
  'FAMILY_ADVISOR',
]);

const accountSourceSchema = z.enum(['MANUAL', 'CSV', 'PLAID_FDX']);
const appointmentStatusSchema = z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']);
const lifeEventTypeSchema = z.enum([
  'BIRTH',
  'MARRIAGE',
  'HOME_PURCHASE',
  'RETIREMENT',
  'INHERITANCE',
  'JOB_CHANGE',
  'EDUCATION',
  'HEALTH_EVENT',
  'OTHER',
]);
const lifeEventStatusSchema = z.enum(['PLANNED', 'OCCURRED', 'RESOLVED']);

const createHouseholdSchema = z.object({
  name: z.string().trim().min(1).max(200),
  lifecycleStage: lifecycleStageSchema.optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  primaryAdvisorId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const updateHouseholdSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  lifecycleStage: lifecycleStageSchema.optional(),
  primaryAdvisorId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const createPersonSchema = z.object({
  householdId: z.string().uuid(),
  userId: z.string().uuid().nullable().optional(),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().email().nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  dateOfBirth: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
  ssn: z.string().trim().min(4).max(20).nullable().optional(),
  role: personRoleSchema.optional(),
  relationshipToPrimary: z.string().trim().max(80).nullable().optional(),
});

const updatePersonSchema = z.object({
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().min(1).max(120).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  dateOfBirth: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
  ssn: z.string().trim().min(4).max(20).nullable().optional(),
  role: personRoleSchema.optional(),
  relationshipToPrimary: z.string().trim().max(80).nullable().optional(),
});

const createAccountSchema = z.object({
  householdId: z.string().uuid(),
  personId: z.string().uuid().nullable().optional(),
  institutionName: z.string().trim().min(1).max(200),
  accountName: z.string().trim().max(200).nullable().optional(),
  accountType: z.string().trim().min(1).max(80),
  balance: z.union([z.number(), z.string()]).optional(),
  source: accountSourceSchema.optional(),
  plaidItemId: z.string().trim().max(200).nullable().optional(),
  plaidAccessToken: z.string().trim().max(500).nullable().optional(),
  plaidCursor: z.string().trim().max(500).nullable().optional(),
});

const updateAccountSchema = z.object({
  institutionName: z.string().trim().min(1).max(200).optional(),
  accountName: z.string().trim().max(200).nullable().optional(),
  accountType: z.string().trim().min(1).max(80).optional(),
  balance: z.union([z.number(), z.string()]).optional(),
  source: accountSourceSchema.optional(),
  isActive: z.boolean().optional(),
  plaidCursor: z.string().trim().max(500).nullable().optional(),
  plaidAccessToken: z.string().trim().max(500).nullable().optional(),
});

const createAppointmentSchema = z.object({
  householdId: z.string().uuid(),
  advisorId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  scheduledAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  status: appointmentStatusSchema.optional(),
  notes: z.string().max(4000).nullable().optional(),
});

const updateAppointmentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  status: appointmentStatusSchema.optional(),
  notes: z.string().max(4000).nullable().optional(),
});

const createLifeEventSchema = z.object({
  householdId: z.string().uuid(),
  personId: z.string().uuid().nullable().optional(),
  eventType: lifeEventTypeSchema,
  eventDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  impactSummary: z.string().max(4000).nullable().optional(),
  status: lifeEventStatusSchema.optional(),
});

const updateLifeEventSchema = z.object({
  eventType: lifeEventTypeSchema.optional(),
  eventDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  impactSummary: z.string().max(4000).nullable().optional(),
  status: lifeEventStatusSchema.optional(),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(400, result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return result.data;
}

function getActor(req: Request): crmService.ActorContext {
  if (!req.user) throw new AppError(401, 'Authentication required');
  return { userId: req.user.userId, role: req.user.role };
}

// ---- Households ------------------------------------------------------------

router.get('/households', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const households = await crmService.listHouseholds(getActor(req));
    res.json({ households });
  } catch (err) {
    next(err);
  }
});

router.post('/households', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parseBody(createHouseholdSchema, req.body);
    const household = await crmService.createHousehold(input, getActor(req));
    res.status(201).json({ household });
  } catch (err) {
    next(err);
  }
});

router.get('/households/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const household = await crmService.getHouseholdById(req.params.id, getActor(req));
    res.json({ household });
  } catch (err) {
    next(err);
  }
});

router.patch('/households/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parseBody(updateHouseholdSchema, req.body);
    const household = await crmService.updateHousehold(req.params.id, input, getActor(req));
    res.json({ household });
  } catch (err) {
    next(err);
  }
});

// ---- People ----------------------------------------------------------------

router.get('/people', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const householdId = typeof req.query.householdId === 'string' ? req.query.householdId : undefined;
    const people = await crmService.listPeople(getActor(req), householdId);
    res.json({ people });
  } catch (err) {
    next(err);
  }
});

router.post('/people', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parseBody(createPersonSchema, req.body);
    const person = await crmService.createPerson(input, getActor(req));
    res.status(201).json({ person });
  } catch (err) {
    next(err);
  }
});

router.get('/people/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const person = await crmService.getPersonById(req.params.id, getActor(req));
    res.json({ person });
  } catch (err) {
    next(err);
  }
});

router.patch('/people/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parseBody(updatePersonSchema, req.body);
    const person = await crmService.updatePerson(req.params.id, input, getActor(req));
    res.json({ person });
  } catch (err) {
    next(err);
  }
});

// ---- Accounts --------------------------------------------------------------

router.get('/accounts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const householdId = typeof req.query.householdId === 'string' ? req.query.householdId : undefined;
    const accounts = await crmService.listAccounts(getActor(req), householdId);
    res.json({ accounts });
  } catch (err) {
    next(err);
  }
});

router.post('/accounts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parseBody(createAccountSchema, req.body);
    const account = await crmService.createAccount(input, getActor(req));
    res.status(201).json({ account });
  } catch (err) {
    next(err);
  }
});

router.patch('/accounts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parseBody(updateAccountSchema, req.body);
    const account = await crmService.updateAccount(req.params.id, input, getActor(req));
    res.json({ account });
  } catch (err) {
    next(err);
  }
});

// ---- Appointments ----------------------------------------------------------

router.get('/appointments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const householdId = typeof req.query.householdId === 'string' ? req.query.householdId : undefined;
    const appointments = await crmService.listAppointments(getActor(req), householdId);
    res.json({ appointments });
  } catch (err) {
    next(err);
  }
});

router.post('/appointments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parseBody(createAppointmentSchema, req.body);
    const appointment = await crmService.createAppointment(input, getActor(req));
    res.status(201).json({ appointment });
  } catch (err) {
    next(err);
  }
});

router.patch('/appointments/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parseBody(updateAppointmentSchema, req.body);
    const appointment = await crmService.updateAppointment(req.params.id, input, getActor(req));
    res.json({ appointment });
  } catch (err) {
    next(err);
  }
});

// ---- Life Events -----------------------------------------------------------

router.get('/life-events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const householdId = typeof req.query.householdId === 'string' ? req.query.householdId : undefined;
    const lifeEvents = await crmService.listLifeEvents(getActor(req), householdId);
    res.json({ lifeEvents });
  } catch (err) {
    next(err);
  }
});

router.post('/life-events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parseBody(createLifeEventSchema, req.body);
    const lifeEvent = await crmService.createLifeEvent(input, getActor(req));
    res.status(201).json({ lifeEvent });
  } catch (err) {
    next(err);
  }
});

router.patch('/life-events/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parseBody(updateLifeEventSchema, req.body);
    const lifeEvent = await crmService.updateLifeEvent(req.params.id, input, getActor(req));
    res.json({ lifeEvent });
  } catch (err) {
    next(err);
  }
});

export { router as crmRouter };
