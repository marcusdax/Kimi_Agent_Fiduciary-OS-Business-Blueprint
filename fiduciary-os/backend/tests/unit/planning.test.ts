import express, { json } from 'express';
import request from 'supertest';

import { errorHandler } from '../../src/middleware/errorHandler';
import { authRouter } from '../../src/routes/auth';
import { planningRouter } from '../../src/routes/planning';
const app = express();
app.use(json());
app.use('/auth', authRouter);
app.use('/planning', planningRouter);
app.use(errorHandler);
const details = {
  title: 'Review planning assumptions',
  outcome: 'Prepare a reviewed planning record',
  owner: 'Account holder',
  source: 'Test fixture; not real client data',
  assumptions: 'Inputs need verification',
  alternatives: 'Defer, compare alternatives, or consult a professional',
  costs: 'Costs and conflicts need confirmation',
};
async function account(email = 'planner@example.test') {
  return (
    await request(app)
      .post('/auth/register')
      .send({ email, password: 'test-password-123', name: 'Planning Test' })
  ).body;
}
function req(method: 'get' | 'post' | 'patch', path: string, token: string, body?: object) {
  return request(app)
    [method]('/planning' + path)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}
async function create(token: string) {
  return (await req('post', '/actions', token, details)).body;
}
async function advance(
  token: string,
  a: { id: string; version: number },
  stage: string,
  extra: object = {}
) {
  return req('post', `/actions/${a.id}/transitions`, token, {
    version: a.version,
    stage,
    ...extra,
  });
}
async function waiting(token: string) {
  let a = await create(token);
  for (const stage of ['Analyze choices', 'Ready for review', 'Waiting for approval'])
    a = (
      await advance(token, a, stage, {
        reviewNote: 'Reviewed costs, alternatives, assumptions, and source gaps.',
      })
    ).body;
  return a;
}
describe('owner-scoped persisted planning workspace', () => {
  it('requires authentication and refuses refresh tokens', async () => {
    expect((await request(app).get('/planning/actions')).status).toBe(401);
    const user = await account();
    expect((await req('get', '/actions', user.refreshToken)).status).toBe(401);
  });
  it('persists actions with server-owned identity, initial state and append-only events', async () => {
    const u = await account();
    const created = await req('post', '/actions', u.accessToken, details);
    expect(created.status).toBe(201);
    expect(created.body.stage).toBe('Gather information');
    expect(created.body.userId).toBe(u.user.id);
    expect(created.body.events[0].actorId).toBe(u.user.id);
    const list = await req('get', '/actions', u.accessToken);
    expect(list.body[0].id).toBe(created.body.id);
  });
  it('rejects mass-assigned status, owner account id or authorization', async () => {
    const u = await account();
    for (const extra of [
      { userId: 'other' },
      { stage: 'Verified complete' },
      { authorizedVersion: 1 },
    ])
      expect((await req('post', '/actions', u.accessToken, { ...details, ...extra })).status).toBe(
        400
      );
  });
  it('does not expose or mutate another account’s records', async () => {
    const a = await account();
    const b = await account('other@example.test');
    const action = await create(a.accessToken);
    expect((await req('get', '/actions', b.accessToken)).body).toEqual([]);
    expect((await req('get', `/actions/${action.id}`, b.accessToken)).status).toBe(404);
    expect((await advance(b.accessToken, action, 'Analyze choices')).status).toBe(404);
    expect(
      (
        await req('patch', `/actions/${action.id}/review-date`, b.accessToken, {
          version: 1,
          reviewDate: null,
        })
      ).status
    ).toBe(404);
    expect(
      (
        await req('post', `/actions/${action.id}/revoke-authorization`, b.accessToken, {
          version: 1,
        })
      ).status
    ).toBe(404);
    expect(
      (
        await req('post', `/actions/${action.id}/authorization`, b.accessToken, {
          version: 1,
          confirmation: 'AUTHORIZE_PLANNING_FOLLOW_THROUGH',
        })
      ).status
    ).toBe(404);
  });
  it('refuses skipped stages and stale versions without writing events', async () => {
    const u = await account();
    const a = await create(u.accessToken);
    expect((await advance(u.accessToken, a, 'In progress')).status).toBe(409);
    expect((await advance(u.accessToken, a, 'Analyze choices')).status).toBe(200);
    expect((await advance(u.accessToken, a, 'Analyze choices')).status).toBe(409);
    const saved = (await req('get', `/actions/${a.id}`, u.accessToken)).body;
    expect(saved.events).toHaveLength(2);
  });
  it('allows only one concurrent writer for a version and preserves contiguous history', async () => {
    const u = await account();
    const a = await create(u.accessToken);
    const results = await Promise.all([
      advance(u.accessToken, a, 'Analyze choices'),
      advance(u.accessToken, a, 'Analyze choices'),
    ]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const saved = (await req('get', `/actions/${a.id}`, u.accessToken)).body;
    expect(saved.version).toBe(2);
    expect(saved.events.map((e: { version: number }) => e.version)).toEqual([1, 2]);
  });
  it('requires a review note before requesting authorization', async () => {
    const u = await account();
    let a = await create(u.accessToken);
    a = (await advance(u.accessToken, a, 'Analyze choices')).body;
    a = (await advance(u.accessToken, a, 'Ready for review')).body;
    expect((await advance(u.accessToken, a, 'Waiting for approval')).status).toBe(400);
  });
  it('records explicit authorization separately, bound to an action snapshot and version', async () => {
    const u = await account();
    const a = await waiting(u.accessToken);
    expect((await advance(u.accessToken, a, 'In progress')).status).toBe(409);
    expect(
      (
        await req('post', `/actions/${a.id}/authorization`, u.accessToken, {
          version: a.version,
          confirmation: true,
        })
      ).status
    ).toBe(400);
    const consent = await req('post', `/actions/${a.id}/authorization`, u.accessToken, {
      version: a.version,
      confirmation: 'AUTHORIZE_PLANNING_FOLLOW_THROUGH',
    });
    expect(consent.status).toBe(200);
    expect(consent.body.stage).toBe('Waiting for approval');
    expect(consent.body.events.at(-1).type).toBe('planning_authorization_granted');
    expect(JSON.parse(consent.body.events.at(-1).details).snapshot.costs).toBe(details.costs);
    expect((await advance(u.accessToken, consent.body, 'In progress')).status).toBe(200);
  });
  it('revokes pending permission without deleting earlier authorization evidence', async () => {
    const u = await account();
    let a = await waiting(u.accessToken);
    a = (
      await req('post', `/actions/${a.id}/authorization`, u.accessToken, {
        version: a.version,
        confirmation: 'AUTHORIZE_PLANNING_FOLLOW_THROUGH',
      })
    ).body;
    const revoked = (
      await req('post', `/actions/${a.id}/revoke-authorization`, u.accessToken, {
        version: a.version,
      })
    ).body;
    expect(revoked.authorizedVersion).toBeNull();
    expect(revoked.events.map((e: { type: string }) => e.type)).toContain(
      'planning_authorization_granted'
    );
    expect((await advance(u.accessToken, revoked, 'In progress')).status).toBe(409);
  });
  it('requires completion evidence and preserves completed status when a review date changes', async () => {
    const u = await account();
    let a = await waiting(u.accessToken);
    a = (
      await req('post', `/actions/${a.id}/authorization`, u.accessToken, {
        version: a.version,
        confirmation: 'AUTHORIZE_PLANNING_FOLLOW_THROUGH',
      })
    ).body;
    a = (await advance(u.accessToken, a, 'In progress')).body;
    expect((await advance(u.accessToken, a, 'Verified complete', { evidence: '  ' })).status).toBe(
      400
    );
    a = (
      await advance(u.accessToken, a, 'Verified complete', {
        evidence: 'Planning meeting notes reviewed; no transaction executed.',
      })
    ).body;
    const review = await req('patch', `/actions/${a.id}/review-date`, u.accessToken, {
      version: a.version,
      reviewDate: '2027-01-15',
    });
    expect(review.body.stage).toBe('Verified complete');
    expect(review.body.completionEvidence).toBe(a.completionEvidence);
    expect(review.body.events).toHaveLength(a.events.length + 1);
  });
  it('rejects impossible review dates and unsupported audit modification methods', async () => {
    const u = await account();
    const a = await create(u.accessToken);
    expect(
      (
        await req('patch', `/actions/${a.id}/review-date`, u.accessToken, {
          version: a.version,
          reviewDate: '2026-02-30',
        })
      ).status
    ).toBe(400);
    expect(
      (
        await req('patch', `/actions/${a.id}/review-date`, u.accessToken, {
          version: a.version,
          reviewDate: '2026-99-99',
        })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .delete(`/planning/actions/${a.id}`)
          .set('Authorization', `Bearer ${u.accessToken}`)
      ).status
    ).toBe(404);
  });
});
