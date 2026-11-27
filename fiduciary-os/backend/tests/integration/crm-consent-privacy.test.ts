import express from 'express';
import request from 'supertest';
import { prisma } from '../../src/config/database';
import { authRouter } from '../../src/routes/auth';
import { crmRouter } from '../../src/routes/crm';
import { consentRouter } from '../../src/routes/consent';
import { privacyRouter } from '../../src/routes/privacy';
import { errorHandler } from '../../src/middleware/errorHandler';
import { decryptPersonSsn, getPiiEncryptionKey } from '../../src/services/crmService';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/crm', crmRouter);
  app.use('/api/v1/consent', consentRouter);
  app.use('/api/v1/privacy', privacyRouter);
  app.use(errorHandler);
  return app;
}

async function registerAndToken(
  app: express.Express,
  email: string,
  name: string,
  role?: 'client' | 'advisor' | 'admin'
): Promise<{ userId: string; accessToken: string }> {
  const reg = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: 'StrongPassword123!', name });
  expect(reg.status).toBe(201);

  if (role && role !== 'client') {
    await prisma.user.update({
      where: { id: reg.body.user.id },
      data: { role },
    });
  }

  return {
    userId: reg.body.user.id as string,
    accessToken: reg.body.accessToken as string,
  };
}

describe('CRM, Consent, pgcrypto Encryption, Privacy & WORM Provenance Integration', () => {
  const app = buildApp();

  it('supports Household Graph CRM CRUD, pgcrypto AES-256 SSN encryption, and RBAC isolation', async () => {
    const clientA = await registerAndToken(app, 'client-a@example.com', 'Alice Mercer', 'client');
    const clientB = await registerAndToken(app, 'client-b@example.com', 'Bob Outsider', 'client');
    const advisor = await registerAndToken(app, 'advisor-1@example.com', 'Dana Fiduciary', 'advisor');
    const admin = await registerAndToken(app, 'admin-1@example.com', 'Sys Admin', 'admin');

    // 1. Client A creates a household assigned to advisor
    const hhRes = await request(app)
      .post('/api/v1/crm/households')
      .set('Authorization', `Bearer ${clientA.accessToken}`)
      .send({
        name: 'Mercer Family Household',
        lifecycleStage: 'NEW_HOUSEHOLD',
        primaryAdvisorId: advisor.userId,
        metadata: { state: 'TX' },
      });
    expect(hhRes.status).toBe(201);
    const householdId = hhRes.body.household.id as string;
    expect(hhRes.body.household.lifecycleStage).toBe('NEW_HOUSEHOLD');

    // 2. Client A creates a Person with an SSN (encrypted via pgcrypto)
    const rawSsn = '123-45-6789';
    const personRes = await request(app)
      .post('/api/v1/crm/people')
      .set('Authorization', `Bearer ${clientA.accessToken}`)
      .send({
        householdId,
        userId: clientA.userId,
        firstName: 'Alice',
        lastName: 'Mercer',
        email: 'client-a@example.com',
        phone: '512-555-0199',
        dateOfBirth: '1980-04-15',
        ssn: rawSsn,
        role: 'PLANNER_PARENT',
      });
    expect(personRes.status).toBe(201);
    const personId = personRes.body.person.id as string;
    expect(personRes.body.person.ssnLast4).toBe('6789');
    expect(personRes.body.person.hasSsn).toBe(true);
    expect(personRes.body.person.ssnEncrypted).toBeUndefined();

    // Verify ciphertext in Postgres is NOT plaintext and round-trips via decrypt_ssn
    const rawRow = await prisma.$queryRawUnsafe<
      Array<{ ssn_encrypted: Buffer; decrypted: string }>
    >(
      `SELECT ssn_encrypted, decrypt_ssn(ssn_encrypted, $2) AS decrypted FROM people WHERE id = $1`,
      personId,
      getPiiEncryptionKey()
    );
    expect(rawRow).toHaveLength(1);
    expect(rawRow[0].ssn_encrypted).toBeInstanceOf(Buffer);
    expect(rawRow[0].ssn_encrypted.toString('utf8')).not.toContain(rawSsn);
    expect(rawRow[0].decrypted).toBe(rawSsn);

    // Authorized advisor can decrypt via service; client cannot
    await expect(
      decryptPersonSsn(personId, { userId: clientA.userId, role: 'client' })
    ).rejects.toThrow(/authorized/i);
    const decryptedByAdvisor = await decryptPersonSsn(personId, {
      userId: advisor.userId,
      role: 'advisor',
    });
    expect(decryptedByAdvisor).toBe(rawSsn);

    // 3. Create CrmAccount with Plaid token (encrypted, never leaked)
    const acctRes = await request(app)
      .post('/api/v1/crm/accounts')
      .set('Authorization', `Bearer ${clientA.accessToken}`)
      .send({
        householdId,
        personId,
        institutionName: 'Vanguard',
        accountName: 'Joint Brokerage',
        accountType: 'brokerage',
        balance: 425000.5,
        source: 'PLAID_FDX',
        plaidItemId: 'item-vg-001',
        plaidAccessToken: 'access-sandbox-secret-token-xyz',
      });
    expect(acctRes.status).toBe(201);
    expect(acctRes.body.account.hasPlaidToken).toBe(true);
    expect(acctRes.body.account.plaidAccessTokenEncrypted).toBeUndefined();

    // 4. Create Appointment & LifeEvent
    const apptRes = await request(app)
      .post('/api/v1/crm/appointments')
      .set('Authorization', `Bearer ${advisor.accessToken}`)
      .send({
        householdId,
        title: 'Annual Stewardship Review',
        scheduledAt: '2026-12-15T15:00:00Z',
        durationMinutes: 60,
      });
    expect(apptRes.status).toBe(201);

    const leRes = await request(app)
      .post('/api/v1/crm/life-events')
      .set('Authorization', `Bearer ${clientA.accessToken}`)
      .send({
        householdId,
        personId,
        eventType: 'RETIREMENT',
        eventDate: '2042-06-01',
        impactSummary: 'Target retirement milestone',
      });
    expect(leRes.status).toBe(201);

    // 5. RBAC isolation: Client B is forbidden from reading or updating Client A's household
    const bGet = await request(app)
      .get(`/api/v1/crm/households/${householdId}`)
      .set('Authorization', `Bearer ${clientB.accessToken}`);
    expect(bGet.status).toBe(403);

    const bPatch = await request(app)
      .patch(`/api/v1/crm/households/${householdId}`)
      .set('Authorization', `Bearer ${clientB.accessToken}`)
      .send({ name: 'Hijacked' });
    expect(bPatch.status).toBe(403);

    // Advisor and Admin can read Client A's household
    const advGet = await request(app)
      .get(`/api/v1/crm/households/${householdId}`)
      .set('Authorization', `Bearer ${advisor.accessToken}`);
    expect(advGet.status).toBe(200);
    expect(advGet.body.household.people).toHaveLength(1);
    expect(advGet.body.household.crmAccounts).toHaveLength(1);

    const admList = await request(app)
      .get('/api/v1/crm/households')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(admList.status).toBe(200);
    expect(admList.body.households.some((h: { id: string }) => h.id === householdId)).toBe(true);
  });

  it('enforces double-opt-in consent guard across email, sms, and voice channels', async () => {
    const user = await registerAndToken(app, 'consent-user@example.com', 'Consent Tester');

    // No record yet -> blocked for all channels
    for (const channel of ['email', 'sms', 'voice']) {
      const check = await request(app)
        .get(`/api/v1/consent/verify/${channel}`)
        .set('Authorization', `Bearer ${user.accessToken}`);
      expect(check.status).toBe(200);
      expect(check.body.allowed).toBe(false);
      expect(check.body.reason).toBe('no_consent_record');
    }

    // Opted-in WITHOUT doubleOptInVerified -> still blocked
    const unverified = await request(app)
      .post('/api/v1/consent')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        channel: 'sms',
        status: 'opted_in',
        doubleOptInVerified: false,
        source: 'web_onboarding_step_2',
      });
    expect(unverified.status).toBe(201);
    expect(unverified.body.record.proofHash).toHaveLength(64);

    const checkUnverified = await request(app)
      .get('/api/v1/consent/verify/sms')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(checkUnverified.status).toBe(200);
    expect(checkUnverified.body.allowed).toBe(false);
    expect(checkUnverified.body.reason).toBe('double_opt_in_unverified');

    // Opted-in WITH doubleOptInVerified: true -> allowed
    const verified = await request(app)
      .post('/api/v1/consent')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        channel: 'sms',
        status: 'opted_in',
        doubleOptInVerified: true,
        source: 'sms_reply_yes',
      });
    expect(verified.status).toBe(201);

    const checkVerified = await request(app)
      .get('/api/v1/consent/verify/sms')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(checkVerified.status).toBe(200);
    expect(checkVerified.body.allowed).toBe(true);
    expect(checkVerified.body.reason).toBe('verified_opt_in');

    // Subsequent opt-out -> immediately blocked again
    const optOut = await request(app)
      .post('/api/v1/consent')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        channel: 'sms',
        status: 'opted_out',
        doubleOptInVerified: true,
        source: 'sms_reply_stop',
      });
    expect(optOut.status).toBe(201);

    const checkOptOut = await request(app)
      .get('/api/v1/consent/verify/sms')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(checkOptOut.status).toBe(200);
    expect(checkOptOut.body.allowed).toBe(false);
    expect(checkOptOut.body.reason).toBe('opted_out');
  });

  it('exports full GDPR/CCPA bundle without secrets, soft-deletes PII while preserving WORM provenance, and enforces immutability triggers', async () => {
    const user = await registerAndToken(app, 'privacy-user@example.com', 'Pat Privacy');
    const advisor = await registerAndToken(app, 'privacy-advisor@example.com', 'Adv Privacy', 'advisor');

    // Seed household, person with SSN, account with Plaid token, consent record
    const hh = await request(app)
      .post('/api/v1/crm/households')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Privacy Household' });
    const householdId = hh.body.household.id as string;

    const person = await request(app)
      .post('/api/v1/crm/people')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        householdId,
        userId: user.userId,
        firstName: 'Pat',
        lastName: 'Privacy',
        email: 'privacy-user@example.com',
        ssn: '987-65-4321',
      });
    const personId = person.body.person.id as string;

    const acct = await request(app)
      .post('/api/v1/crm/accounts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        householdId,
        personId,
        institutionName: 'Fidelity',
        accountType: 'ira',
        balance: 150000,
        source: 'PLAID_FDX',
        plaidAccessToken: 'access-secret-plaid-999',
      });
    const accountId = acct.body.account.id as string;

    await request(app)
      .post('/api/v1/consent')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        householdId,
        channel: 'email',
        status: 'opted_in',
        doubleOptInVerified: true,
        source: 'double_opt_in_email_link',
      });

    // 1. POST /api/v1/privacy/export
    const exportRes = await request(app)
      .post('/api/v1/privacy/export')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(exportRes.status).toBe(200);
    const bundle = exportRes.body.export;
    expect(bundle.exported_at).toBeDefined();
    expect(bundle.user.id).toBe(user.userId);
    expect(bundle.user.password).toBeUndefined();
    expect(bundle.households).toHaveLength(1);
    expect(bundle.people).toHaveLength(1);
    expect(bundle.people[0].ssn_encrypted).toBeUndefined();
    expect(bundle.crm_accounts).toHaveLength(1);
    expect(bundle.crm_accounts[0].plaid_access_token_encrypted).toBeUndefined();
    expect(bundle.consent_records).toHaveLength(1);
    expect(bundle.provenance_records.length).toBeGreaterThanOrEqual(4);
    expect(bundle.export_provenance_hash).toHaveLength(64);

    // 2. Soft-delete rejects missing/invalid confirmation
    const badDelete = await request(app)
      .post('/api/v1/privacy/soft-delete')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ confirmation: 'WRONG' });
    expect(badDelete.status).toBe(400);

    // 3. Soft-delete succeeds, scrubs PII/SSN/Plaid, revokes sessions, preserves provenance
    const provBefore = await prisma.provenanceRecord.count({ where: { actorId: user.userId } });
    const delRes = await request(app)
      .post('/api/v1/privacy/soft-delete')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ confirmation: 'CONFIRM_SOFT_DELETE' });
    expect(delRes.status).toBe(200);
    expect(delRes.body.summary.provenance_preserved).toBe(true);
    expect(delRes.body.summary.people_scrubbed).toBe(1);
    expect(delRes.body.summary.accounts_scrubbed).toBe(1);
    expect(delRes.body.summary.households_soft_deleted).toBe(1);

    // Token is now revoked
    const afterRevoke = await request(app)
      .get('/api/v1/crm/households')
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(afterRevoke.status).toBe(401);

    // Verify DB rows scrubbed
    const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
    expect(dbUser?.deletedAt).not.toBeNull();
    expect(dbUser?.password).toBeNull();
    expect(dbUser?.email).toMatch(/@redacted\.invalid$/);

    const dbPerson = await prisma.person.findUnique({ where: { id: personId } });
    expect(dbPerson?.deletedAt).not.toBeNull();
    expect(dbPerson?.ssnEncrypted).toBeNull();
    expect(dbPerson?.ssnLast4).toBeNull();

    const dbAccount = await prisma.crmAccount.findUnique({ where: { id: accountId } });
    expect(dbAccount?.deletedAt).not.toBeNull();
    expect(dbAccount?.isActive).toBe(false);
    expect(dbAccount?.plaidAccessTokenEncrypted).toBeNull();

    // Provenance records preserved and grew by 1 (privacy.soft_delete)
    const provAfter = await prisma.provenanceRecord.count({ where: { actorId: user.userId } });
    expect(provAfter).toBe(provBefore + 1);

    // 4. Verify hash chain continuity via advisor endpoint
    const verifyRes = await request(app)
      .get('/api/v1/privacy/provenance/verify')
      .set('Authorization', `Bearer ${advisor.accessToken}`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.valid).toBe(true);
    expect(verifyRes.body.totalRecords).toBeGreaterThanOrEqual(provAfter);
    expect(verifyRes.body.headHash).toHaveLength(64);

    // 5. Verify PostgreSQL WORM immutability triggers reject UPDATE, DELETE, and TRUNCATE (SQLSTATE 42501)
    const latestProv = await prisma.provenanceRecord.findFirst({ orderBy: { sequence: 'desc' } });
    expect(latestProv).not.toBeNull();

    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE provenance_records SET record_type = 'tampered' WHERE id = $1`,
        latestProv!.id
      )
    ).rejects.toThrow(/immutable|42501|prohibited/i);

    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM provenance_records WHERE id = $1`, latestProv!.id)
    ).rejects.toThrow(/immutable|42501|prohibited/i);

    await expect(
      prisma.$executeRawUnsafe(`TRUNCATE TABLE provenance_records`)
    ).rejects.toThrow(/immutable|42501|prohibited/i);
  });
});
