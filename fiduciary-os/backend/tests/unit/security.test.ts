import request from 'supertest';
import express from 'express';
import { authRouter } from '../../src/routes/auth';
import { profileRouter } from '../../src/routes/profile';
import { errorHandler } from '../../src/middleware/errorHandler';

const app = express();
app.use(express.json());
app.use('/auth', authRouter);
app.use('/profile', profileRouter);
app.use(errorHandler);

async function registerUser(email: string) {
  const res = await request(app)
    .post('/auth/register')
    .send({ email, password: 'password123', name: 'Security Test' });
  return res.body as { user: { id: string }; accessToken: string; refreshToken: string };
}

describe('Token separation', () => {
  it('rejects a refresh token used as an access token', async () => {
    const { refreshToken } = await registerUser('refresh-as-access@example.com');

    const res = await request(app)
      .get('/profile')
      .set('Authorization', `Bearer ${refreshToken}`);

    expect(res.status).toBe(401);
  });

  it('rejects an access token presented to /auth/refresh', async () => {
    const { accessToken } = await registerUser('access-as-refresh@example.com');

    const res = await request(app).post('/auth/refresh').send({ refreshToken: accessToken });

    expect(res.status).toBe(401);
  });

  it('issues new tokens for a valid refresh token', async () => {
    const { refreshToken } = await registerUser('valid-refresh@example.com');

    const res = await request(app).post('/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });
});

describe('Profile mass assignment', () => {
  it('ignores fields outside the validated schema', async () => {
    const { accessToken, user } = await registerUser('mass-assign@example.com');

    const res = await request(app)
      .put('/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ age: 52, userId: 'someone-else', id: 'forced-id' });

    expect(res.status).toBe(200);
    expect(res.body.age).toBe(52);
    expect(res.body.userId).toBe(user.id);
    expect(res.body.id).not.toBe('forced-id');
  });
});
