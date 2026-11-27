/**
 * services/crmService.ts — Native PostgreSQL + pgcrypto Household Graph CRM service.
 *
 * Manages Households, People (with AES-256 pgcrypto SSN encryption), CrmAccounts
 * (with encrypted Plaid access tokens), Appointments, LifeEvents, and append-only
 * Merkle-chained ProvenanceRecords with strict RBAC scoping.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export interface ActorContext {
  userId: string;
  role: string;
}

export type LifecycleStage = 'PROSPECT' | 'NEW_HOUSEHOLD' | 'ACTIVE_STEWARDSHIP' | 'LEGACY_HEIR';
export type PersonRole =
  | 'PLANNER_PARENT'
  | 'SPOUSE_PARTNER'
  | 'NEXTGEN_HEIR'
  | 'TRUST_BENEFICIARY'
  | 'POWER_OF_ATTORNEY'
  | 'FAMILY_ADVISOR';
export type AccountSource = 'MANUAL' | 'CSV' | 'PLAID_FDX';
export type AppointmentStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
export type LifeEventType =
  | 'BIRTH'
  | 'MARRIAGE'
  | 'HOME_PURCHASE'
  | 'RETIREMENT'
  | 'INHERITANCE'
  | 'JOB_CHANGE'
  | 'EDUCATION'
  | 'HEALTH_EVENT'
  | 'OTHER';
export type LifeEventStatus = 'PLANNED' | 'OCCURRED' | 'RESOLVED';

export interface ProvenanceRow {
  id: string;
  sequence: number;
  occurred_at: Date;
  actor_id: string;
  record_type: string;
  prev_hash: string;
  row_hash: string;
  payload: unknown;
}

export function getPiiEncryptionKey(): string {
  const key = process.env.CRM_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (key && key.trim().length > 0) return key;
  if (process.env.NODE_ENV === 'production') {
    throw new AppError(500, 'CRM_ENCRYPTION_KEY must be configured in production');
  }
  return 'fiduciary-os-local-dev-pgcrypto-key-32b';
}

function sanitizePerson<T extends { ssnEncrypted?: Buffer | Uint8Array | null }>(
  person: T
): Omit<T, 'ssnEncrypted'> & { hasSsn: boolean } {
  const { ssnEncrypted, ...rest } = person;
  return {
    ...rest,
    hasSsn: Boolean(ssnEncrypted && ssnEncrypted.length > 0),
  };
}

function sanitizeAccount<T extends { plaidAccessTokenEncrypted?: Buffer | Uint8Array | null }>(
  account: T
): Omit<T, 'plaidAccessTokenEncrypted'> & { hasPlaidToken: boolean } {
  const { plaidAccessTokenEncrypted, ...rest } = account;
  return {
    ...rest,
    hasPlaidToken: Boolean(plaidAccessTokenEncrypted && plaidAccessTokenEncrypted.length > 0),
  };
}

function householdWhereForActor(actor: ActorContext): Prisma.HouseholdWhereInput {
  if (actor.role === 'admin') {
    return { deletedAt: null };
  }
  if (actor.role === 'advisor') {
    return {
      deletedAt: null,
      OR: [{ primaryAdvisorId: actor.userId }, { ownerUserId: actor.userId }],
    };
  }
  return {
    deletedAt: null,
    OR: [
      { ownerUserId: actor.userId },
      { people: { some: { userId: actor.userId, deletedAt: null } } },
    ],
  };
}

export async function assertHouseholdAccess(householdId: string, actor: ActorContext) {
  const household = await prisma.household.findFirst({
    where: { id: householdId, deletedAt: null },
    include: { people: { where: { deletedAt: null }, select: { userId: true } } },
  });
  if (!household) {
    throw new AppError(404, 'Household not found');
  }

  if (actor.role === 'admin') return household;
  if (
    actor.role === 'advisor' &&
    (household.primaryAdvisorId === actor.userId || household.ownerUserId === actor.userId)
  ) {
    return household;
  }
  if (
    household.ownerUserId === actor.userId ||
    household.people.some((p) => p.userId === actor.userId)
  ) {
    return household;
  }

  throw new AppError(403, 'Insufficient permissions to access this household');
}

// ----------------------------------------------------------------------------
// Provenance Ledger Helpers (WORM table backed by PostgreSQL triggers)
// ----------------------------------------------------------------------------

export async function appendProvenance(
  actorId: string,
  recordType: string,
  payload: Record<string, unknown> = {}
): Promise<ProvenanceRow> {
  const rows = await prisma.$queryRawUnsafe<ProvenanceRow[]>(
    `SELECT * FROM append_provenance_record($1, $2, $3::jsonb)`,
    actorId,
    recordType,
    JSON.stringify(payload)
  );
  if (!rows[0]) {
    throw new AppError(500, 'Failed to append provenance record');
  }
  return rows[0];
}

export async function verifyProvenanceChain(): Promise<{
  valid: boolean;
  totalRecords: number;
  headHash: string | null;
  brokenAtSequence?: number;
  reason?: string;
}> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      sequence: number;
      prev_hash: string;
      row_hash: string;
      recomputed_hash: string;
    }>
  >(`
    SELECT
      sequence,
      prev_hash,
      row_hash,
      encode(
        digest(
          prev_hash || '|' || id || '|' || to_char(occurred_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            || '|' || actor_id || '|' || record_type || '|' || payload::TEXT,
          'sha256'
        ),
        'hex'
      ) AS recomputed_hash
    FROM provenance_records
    ORDER BY sequence ASC
  `);

  if (rows.length === 0) {
    return { valid: true, totalRecords: 0, headHash: null };
  }

  let expectedPrev = 'GENESIS';
  for (const row of rows) {
    if (row.prev_hash !== expectedPrev) {
      return {
        valid: false,
        totalRecords: rows.length,
        headHash: rows[rows.length - 1].row_hash,
        brokenAtSequence: row.sequence,
        reason: `Chain link mismatch at sequence ${row.sequence}`,
      };
    }
    if (row.row_hash !== row.recomputed_hash) {
      return {
        valid: false,
        totalRecords: rows.length,
        headHash: rows[rows.length - 1].row_hash,
        brokenAtSequence: row.sequence,
        reason: `Row hash mismatch at sequence ${row.sequence}`,
      };
    }
    expectedPrev = row.row_hash;
  }

  return {
    valid: true,
    totalRecords: rows.length,
    headHash: rows[rows.length - 1].row_hash,
  };
}

// ----------------------------------------------------------------------------
// Households
// ----------------------------------------------------------------------------

export async function listHouseholds(actor: ActorContext) {
  const households = await prisma.household.findMany({
    where: householdWhereForActor(actor),
    orderBy: { createdAt: 'desc' },
    include: {
      people: { where: { deletedAt: null } },
      crmAccounts: { where: { deletedAt: null } },
      appointments: { orderBy: { scheduledAt: 'asc' } },
      lifeEvents: { orderBy: { eventDate: 'asc' } },
    },
  });

  return households.map((h) => ({
    ...h,
    people: h.people.map(sanitizePerson),
    crmAccounts: h.crmAccounts.map(sanitizeAccount),
  }));
}

export async function getHouseholdById(id: string, actor: ActorContext) {
  await assertHouseholdAccess(id, actor);
  const h = await prisma.household.findFirst({
    where: { id, deletedAt: null },
    include: {
      people: { where: { deletedAt: null } },
      crmAccounts: { where: { deletedAt: null } },
      appointments: { orderBy: { scheduledAt: 'asc' } },
      lifeEvents: { orderBy: { eventDate: 'asc' } },
    },
  });
  if (!h) throw new AppError(404, 'Household not found');
  return {
    ...h,
    people: h.people.map(sanitizePerson),
    crmAccounts: h.crmAccounts.map(sanitizeAccount),
  };
}

export async function createHousehold(
  input: {
    name: string;
    lifecycleStage?: LifecycleStage;
    ownerUserId?: string | null;
    primaryAdvisorId?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  actor: ActorContext
) {
  const ownerUserId =
    actor.role === 'client' ? actor.userId : (input.ownerUserId ?? actor.userId);
  const primaryAdvisorId =
    actor.role === 'advisor'
      ? (input.primaryAdvisorId ?? actor.userId)
      : (input.primaryAdvisorId ?? null);

  const created = await prisma.household.create({
    data: {
      name: input.name,
      lifecycleStage: input.lifecycleStage ?? 'PROSPECT',
      ownerUserId,
      primaryAdvisorId,
      metadata: (input.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });

  await appendProvenance(actor.userId, 'crm.household.created', {
    householdId: created.id,
    lifecycleStage: created.lifecycleStage,
  });

  return created;
}

export async function updateHousehold(
  id: string,
  input: {
    name?: string;
    lifecycleStage?: LifecycleStage;
    primaryAdvisorId?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  actor: ActorContext
) {
  await assertHouseholdAccess(id, actor);
  const updated = await prisma.household.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.lifecycleStage !== undefined ? { lifecycleStage: input.lifecycleStage } : {}),
      ...(input.primaryAdvisorId !== undefined ? { primaryAdvisorId: input.primaryAdvisorId } : {}),
      ...(input.metadata !== undefined
        ? { metadata: (input.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue }
        : {}),
    },
  });

  await appendProvenance(actor.userId, 'crm.household.updated', {
    householdId: updated.id,
    lifecycleStage: updated.lifecycleStage,
  });

  return updated;
}

// ----------------------------------------------------------------------------
// People (with pgcrypto AES-256 SSN encryption)
// ----------------------------------------------------------------------------

async function encryptSecretInPg(plaintext: string): Promise<Buffer> {
  const key = getPiiEncryptionKey();
  const rows = await prisma.$queryRawUnsafe<Array<{ encrypted: Buffer }>>(
    `SELECT encrypt_ssn($1, $2) AS encrypted`,
    plaintext,
    key
  );
  if (!rows[0]?.encrypted) {
    throw new AppError(500, 'pgcrypto encryption failed');
  }
  return rows[0].encrypted;
}

export async function listPeople(actor: ActorContext, householdId?: string) {
  if (householdId) {
    await assertHouseholdAccess(householdId, actor);
  }
  const people = await prisma.person.findMany({
    where: {
      deletedAt: null,
      ...(householdId ? { householdId } : {}),
      household: householdWhereForActor(actor),
    },
    orderBy: { createdAt: 'asc' },
  });
  return people.map(sanitizePerson);
}

export async function getPersonById(id: string, actor: ActorContext) {
  const person = await prisma.person.findFirst({ where: { id, deletedAt: null } });
  if (!person) throw new AppError(404, 'Person not found');
  await assertHouseholdAccess(person.householdId, actor);
  return sanitizePerson(person);
}

export async function createPerson(
  input: {
    householdId: string;
    userId?: string | null;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    dateOfBirth?: string | Date | null;
    ssn?: string | null;
    role?: PersonRole;
    relationshipToPrimary?: string | null;
  },
  actor: ActorContext
) {
  await assertHouseholdAccess(input.householdId, actor);

  let ssnEncrypted: Buffer | null = null;
  let ssnLast4: string | null = null;
  if (input.ssn && input.ssn.trim().length > 0) {
    const digits = input.ssn.replace(/\D/g, '');
    if (digits.length < 4) {
      throw new AppError(400, 'Invalid SSN format');
    }
    ssnLast4 = digits.slice(-4);
    ssnEncrypted = await encryptSecretInPg(input.ssn.trim());
  }

  const created = await prisma.person.create({
    data: {
      householdId: input.householdId,
      userId: input.userId ?? null,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
      ssnEncrypted,
      ssnLast4,
      role: input.role ?? 'PLANNER_PARENT',
      relationshipToPrimary: input.relationshipToPrimary ?? null,
    },
  });

  await appendProvenance(actor.userId, 'crm.person.created', {
    personId: created.id,
    householdId: created.householdId,
    role: created.role,
    ssnEncrypted: Boolean(ssnEncrypted),
  });

  return sanitizePerson(created);
}

export async function updatePerson(
  id: string,
  input: {
    firstName?: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
    dateOfBirth?: string | Date | null;
    ssn?: string | null;
    role?: PersonRole;
    relationshipToPrimary?: string | null;
  },
  actor: ActorContext
) {
  const existing = await prisma.person.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError(404, 'Person not found');
  await assertHouseholdAccess(existing.householdId, actor);

  let ssnUpdate: { ssnEncrypted?: Buffer | null; ssnLast4?: string | null } = {};
  if (input.ssn !== undefined) {
    if (input.ssn === null || input.ssn.trim().length === 0) {
      ssnUpdate = { ssnEncrypted: null, ssnLast4: null };
    } else {
      const digits = input.ssn.replace(/\D/g, '');
      if (digits.length < 4) throw new AppError(400, 'Invalid SSN format');
      ssnUpdate = {
        ssnEncrypted: await encryptSecretInPg(input.ssn.trim()),
        ssnLast4: digits.slice(-4),
      };
    }
  }

  const updated = await prisma.person.update({
    where: { id },
    data: {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.dateOfBirth !== undefined
        ? { dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null }
        : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.relationshipToPrimary !== undefined
        ? { relationshipToPrimary: input.relationshipToPrimary }
        : {}),
      ...ssnUpdate,
    },
  });

  await appendProvenance(actor.userId, 'crm.person.updated', {
    personId: updated.id,
    householdId: updated.householdId,
  });

  return sanitizePerson(updated);
}

export async function decryptPersonSsn(id: string, actor: ActorContext): Promise<string | null> {
  if (actor.role !== 'admin' && actor.role !== 'advisor') {
    throw new AppError(403, 'Only authorized advisors or admins may decrypt SSN records');
  }
  const existing = await prisma.person.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError(404, 'Person not found');
  await assertHouseholdAccess(existing.householdId, actor);

  if (!existing.ssnEncrypted) return null;
  const key = getPiiEncryptionKey();
  const rows = await prisma.$queryRawUnsafe<Array<{ ssn: string | null }>>(
    `SELECT decrypt_ssn(ssn_encrypted, $2) AS ssn FROM people WHERE id = $1`,
    id,
    key
  );

  await appendProvenance(actor.userId, 'crm.person.ssn_decrypted', {
    personId: id,
    householdId: existing.householdId,
  });

  return rows[0]?.ssn ?? null;
}

// ----------------------------------------------------------------------------
// CrmAccounts
// ----------------------------------------------------------------------------

export async function listAccounts(actor: ActorContext, householdId?: string) {
  if (householdId) {
    await assertHouseholdAccess(householdId, actor);
  }
  const accounts = await prisma.crmAccount.findMany({
    where: {
      deletedAt: null,
      ...(householdId ? { householdId } : {}),
      household: householdWhereForActor(actor),
    },
    orderBy: { createdAt: 'desc' },
  });
  return accounts.map(sanitizeAccount);
}

export async function createAccount(
  input: {
    householdId: string;
    personId?: string | null;
    institutionName: string;
    accountName?: string | null;
    accountType: string;
    balance?: number | string;
    source?: AccountSource;
    plaidItemId?: string | null;
    plaidAccessToken?: string | null;
    plaidCursor?: string | null;
  },
  actor: ActorContext
) {
  await assertHouseholdAccess(input.householdId, actor);

  let plaidAccessTokenEncrypted: Buffer | null = null;
  if (input.plaidAccessToken && input.plaidAccessToken.trim().length > 0) {
    plaidAccessTokenEncrypted = await encryptSecretInPg(input.plaidAccessToken.trim());
  }

  const created = await prisma.crmAccount.create({
    data: {
      householdId: input.householdId,
      personId: input.personId ?? null,
      institutionName: input.institutionName,
      accountName: input.accountName ?? null,
      accountType: input.accountType,
      balance: new Prisma.Decimal(input.balance ?? 0),
      source: input.source ?? 'MANUAL',
      plaidItemId: input.plaidItemId ?? null,
      plaidAccessTokenEncrypted,
      plaidCursor: input.plaidCursor ?? null,
      lastSyncedAt: input.source === 'PLAID_FDX' ? new Date() : null,
    },
  });

  await appendProvenance(actor.userId, 'crm.account.created', {
    accountId: created.id,
    householdId: created.householdId,
    source: created.source,
  });

  return sanitizeAccount(created);
}

export async function updateAccount(
  id: string,
  input: {
    institutionName?: string;
    accountName?: string | null;
    accountType?: string;
    balance?: number | string;
    source?: AccountSource;
    isActive?: boolean;
    plaidCursor?: string | null;
    plaidAccessToken?: string | null;
  },
  actor: ActorContext
) {
  const existing = await prisma.crmAccount.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError(404, 'Account not found');
  await assertHouseholdAccess(existing.householdId, actor);

  let tokenUpdate: { plaidAccessTokenEncrypted?: Buffer | null } = {};
  if (input.plaidAccessToken !== undefined) {
    tokenUpdate = {
      plaidAccessTokenEncrypted:
        input.plaidAccessToken && input.plaidAccessToken.trim().length > 0
          ? await encryptSecretInPg(input.plaidAccessToken.trim())
          : null,
    };
  }

  const updated = await prisma.crmAccount.update({
    where: { id },
    data: {
      ...(input.institutionName !== undefined ? { institutionName: input.institutionName } : {}),
      ...(input.accountName !== undefined ? { accountName: input.accountName } : {}),
      ...(input.accountType !== undefined ? { accountType: input.accountType } : {}),
      ...(input.balance !== undefined ? { balance: new Prisma.Decimal(input.balance) } : {}),
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.plaidCursor !== undefined ? { plaidCursor: input.plaidCursor } : {}),
      ...tokenUpdate,
    },
  });

  await appendProvenance(actor.userId, 'crm.account.updated', {
    accountId: updated.id,
    householdId: updated.householdId,
  });

  return sanitizeAccount(updated);
}

// ----------------------------------------------------------------------------
// Appointments
// ----------------------------------------------------------------------------

export async function listAppointments(actor: ActorContext, householdId?: string) {
  if (householdId) {
    await assertHouseholdAccess(householdId, actor);
  }
  return prisma.appointment.findMany({
    where: {
      ...(householdId ? { householdId } : {}),
      household: householdWhereForActor(actor),
    },
    orderBy: { scheduledAt: 'asc' },
  });
}

export async function createAppointment(
  input: {
    householdId: string;
    advisorId?: string | null;
    title: string;
    scheduledAt: string | Date;
    durationMinutes?: number;
    status?: AppointmentStatus;
    notes?: string | null;
  },
  actor: ActorContext
) {
  await assertHouseholdAccess(input.householdId, actor);
  const created = await prisma.appointment.create({
    data: {
      householdId: input.householdId,
      advisorId: input.advisorId ?? (actor.role === 'advisor' ? actor.userId : null),
      title: input.title,
      scheduledAt: new Date(input.scheduledAt),
      durationMinutes: input.durationMinutes ?? 30,
      status: input.status ?? 'SCHEDULED',
      notes: input.notes ?? null,
    },
  });

  await appendProvenance(actor.userId, 'crm.appointment.created', {
    appointmentId: created.id,
    householdId: created.householdId,
    status: created.status,
  });

  return created;
}

export async function updateAppointment(
  id: string,
  input: {
    title?: string;
    scheduledAt?: string | Date;
    durationMinutes?: number;
    status?: AppointmentStatus;
    notes?: string | null;
  },
  actor: ActorContext
) {
  const existing = await prisma.appointment.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Appointment not found');
  await assertHouseholdAccess(existing.householdId, actor);

  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.scheduledAt !== undefined ? { scheduledAt: new Date(input.scheduledAt) } : {}),
      ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });

  await appendProvenance(actor.userId, 'crm.appointment.updated', {
    appointmentId: updated.id,
    householdId: updated.householdId,
    status: updated.status,
  });

  return updated;
}

// ----------------------------------------------------------------------------
// Life Events
// ----------------------------------------------------------------------------

export async function listLifeEvents(actor: ActorContext, householdId?: string) {
  if (householdId) {
    await assertHouseholdAccess(householdId, actor);
  }
  return prisma.lifeEvent.findMany({
    where: {
      ...(householdId ? { householdId } : {}),
      household: householdWhereForActor(actor),
    },
    orderBy: { eventDate: 'asc' },
  });
}

export async function createLifeEvent(
  input: {
    householdId: string;
    personId?: string | null;
    eventType: LifeEventType;
    eventDate: string | Date;
    impactSummary?: string | null;
    status?: LifeEventStatus;
  },
  actor: ActorContext
) {
  await assertHouseholdAccess(input.householdId, actor);
  const created = await prisma.lifeEvent.create({
    data: {
      householdId: input.householdId,
      personId: input.personId ?? null,
      eventType: input.eventType,
      eventDate: new Date(input.eventDate),
      impactSummary: input.impactSummary ?? null,
      status: input.status ?? 'PLANNED',
    },
  });

  await appendProvenance(actor.userId, 'crm.life_event.created', {
    lifeEventId: created.id,
    householdId: created.householdId,
    eventType: created.eventType,
  });

  return created;
}

export async function updateLifeEvent(
  id: string,
  input: {
    eventType?: LifeEventType;
    eventDate?: string | Date;
    impactSummary?: string | null;
    status?: LifeEventStatus;
  },
  actor: ActorContext
) {
  const existing = await prisma.lifeEvent.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Life event not found');
  await assertHouseholdAccess(existing.householdId, actor);

  const updated = await prisma.lifeEvent.update({
    where: { id },
    data: {
      ...(input.eventType !== undefined ? { eventType: input.eventType } : {}),
      ...(input.eventDate !== undefined ? { eventDate: new Date(input.eventDate) } : {}),
      ...(input.impactSummary !== undefined ? { impactSummary: input.impactSummary } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });

  await appendProvenance(actor.userId, 'crm.life_event.updated', {
    lifeEventId: updated.id,
    householdId: updated.householdId,
    status: updated.status,
  });

  return updated;
}
