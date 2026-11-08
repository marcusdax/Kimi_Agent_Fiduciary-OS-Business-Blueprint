import express, { json } from 'express';
import request from 'supertest';

import { prisma } from '../../src/config/database';
import { errorHandler } from '../../src/middleware/errorHandler';
import { authRouter } from '../../src/routes/auth';
import { documentsRouter } from '../../src/routes/documents';
import { profileRouter } from '../../src/routes/profile';
const app = express();
app.use(json());
app.use('/auth', authRouter);
app.use('/profile', profileRouter);
app.use('/documents', documentsRouter);
app.use(errorHandler);
const register = async () =>
  (
    await request(app)
      .post('/auth/register')
      .send({
        email: 'synthetic-session@example.test',
        password: 'test-only-passphrase-123',
        name: 'Synthetic fixture',
      })
  ).body;
const profile = (token: string) => request(app).get('/profile').auth(token, { type: 'bearer' });
describe('Persisted revocable session families', () => {
  it('rotates once and revokes the whole family when an old refresh is replayed', async () => {
    const a = await register();
    const b = await request(app).post('/auth/refresh').send({ refreshToken: a.refreshToken });
    expect(b.status).toBe(200);
    expect(b.body.refreshToken).not.toBe(a.refreshToken);
    const rows = await prisma.sessionRefresh.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.every(x => /^[a-f0-9]{64}$/.test(x.digest))).toBe(true);
    expect(
      (await request(app).post('/auth/refresh').send({ refreshToken: a.refreshToken })).status
    ).toBe(401);
    expect((await profile(b.body.accessToken)).status).toBe(401);
    expect(
      (await request(app).post('/auth/refresh').send({ refreshToken: b.body.refreshToken })).status
    ).toBe(401);
  });
  it('fails closed when the same refresh is submitted concurrently', async () => {
    const a = await register();
    const results = await Promise.all([
      request(app).post('/auth/refresh').send({ refreshToken: a.refreshToken }),
      request(app).post('/auth/refresh').send({ refreshToken: a.refreshToken }),
    ]);
    expect(results.every(r => r.status === 200 || r.status === 401)).toBe(true);
    expect(results.filter(r => r.status === 200).length).toBeLessThanOrEqual(1);
    for (const r of results.filter(r => r.status === 200))
      expect((await profile(r.body.accessToken)).status).toBe(401);
    expect((await profile(a.accessToken)).status).toBe(401);
  });
  it('revokes access immediately on logout and rejects refresh afterwards', async () => {
    const a = await register();
    expect(
      (await request(app).post('/auth/logout').auth(a.accessToken, { type: 'bearer' })).status
    ).toBe(200);
    expect((await profile(a.accessToken)).status).toBe(401);
    expect(
      (await request(app).post('/auth/refresh').send({ refreshToken: a.refreshToken })).status
    ).toBe(401);
  });
  it('logout-all revokes separate logins for only the authenticated owner', async () => {
    const a = await register();
    const b = (
      await request(app)
        .post('/auth/login')
        .send({ email: 'synthetic-session@example.test', password: 'test-only-passphrase-123' })
    ).body;
    const other = (
      await request(app)
        .post('/auth/register')
        .send({
          email: 'other-session@example.test',
          password: 'test-only-passphrase-123',
          name: 'Other fixture',
        })
    ).body;
    expect(
      (await request(app).post('/auth/logout-all').auth(a.accessToken, { type: 'bearer' })).status
    ).toBe(200);
    expect((await profile(b.accessToken)).status).toBe(401);
    expect((await profile(other.accessToken)).status).toBe(200);
  });
  it('fails closed for expired sessions, malformed refresh and unconfigured identity delivery', async () => {
    const a = await register();
    await prisma.authSession.updateMany({ data: { expiresAt: new Date(0) } });
    expect((await profile(a.accessToken)).status).toBe(401);
    expect((await request(app).post('/auth/refresh').send({ refreshToken: {} })).status).toBe(401);
    for (const path of ['password-reset', 'verify-email', 'mfa/enroll'])
      expect(
        (
          await request(app)
            .post('/auth/' + path)
            .send({ email: 'fixture@example.test' })
        ).status
      ).toBe(503);
  });
  it('never creates encrypted placeholder documents or claims deletion', async () => {
    const a = await register();
    expect(
      (
        await request(app)
          .post('/documents')
          .auth(a.accessToken, { type: 'bearer' })
          .send({ name: 'test.pdf', encrypted: true })
      ).status
    ).toBe(503);
    expect(await prisma.document.count()).toBe(0);
    expect(
      (await request(app).delete('/documents/unknown').auth(a.accessToken, { type: 'bearer' }))
        .status
    ).toBe(503);
    expect((await request(app).post('/documents').send({})).status).toBe(401);
  });
});
