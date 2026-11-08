import { createHash, randomUUID } from 'crypto';

import { verify, sign } from 'jsonwebtoken';
import type { Algorithm } from 'jsonwebtoken';

import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
const options = {
  algorithms: ['HS256'] as Algorithm[],
  issuer: 'fiduciary-os',
  audience: 'fiduciary-api',
};
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
function secret() {
  const key = process.env.JWT_SECRET;
  if (!key) throw new AppError(500, 'Authentication unavailable');
  return key;
}
export function verifySessionToken(token: string) {
  const p = verify(token, secret(), options);
  if (typeof p === 'string' || typeof p.sid !== 'string' || typeof p.userId !== 'string')
    throw new AppError(401, 'Invalid session');
  return p;
}
function tokens(userId: string, sid: string, expiresAt: Date) {
  const accessToken = sign({ userId, sid, tokenType: 'access' }, secret(), {
    algorithm: 'HS256',
    issuer: options.issuer,
    audience: options.audience,
    expiresIn: 900,
    jwtid: randomUUID(),
  });
  const refreshToken = sign({ userId, sid, tokenType: 'refresh' }, secret(), {
    algorithm: 'HS256',
    issuer: options.issuer,
    audience: options.audience,
    expiresIn: Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    jwtid: randomUUID(),
  });
  return { accessToken, refreshToken };
}
export async function startSession(userId: string) {
  const sid = randomUUID(),
    expiresAt = new Date(Date.now() + 30 * 86400000);
  const pair = tokens(userId, sid, expiresAt);
  await prisma.authSession.create({
    data: {
      id: sid,
      userId,
      expiresAt,
      refreshTokens: { create: { digest: digest(pair.refreshToken), expiresAt } },
    },
  });
  return pair;
}
export async function rotateSession(token: unknown) {
  if (typeof token !== 'string' || token.length > 4096)
    throw new AppError(401, 'Invalid refresh token');
  const p = verifySessionToken(token);
  if (p.tokenType !== 'refresh') throw new AppError(401, 'Invalid refresh token');
  const outcome = await prisma
    .$transaction(async tx => {
      const stored = await tx.sessionRefresh.findUnique({
        where: { digest: digest(token) },
        include: { session: true },
      });
      if (!stored || stored.sessionId !== p.sid || stored.session.userId !== p.userId) return null;
      if (stored.usedAt) {
        await tx.authSession.update({
          where: { id: stored.sessionId },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      if (
        stored.session.revokedAt ||
        stored.expiresAt <= new Date() ||
        stored.session.expiresAt <= new Date()
      )
        return null;
      const consumed = await tx.sessionRefresh.updateMany({
        where: { digest: stored.digest, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        await tx.authSession.update({
          where: { id: stored.sessionId },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      const pair = tokens(stored.session.userId, stored.sessionId, stored.session.expiresAt);
      await tx.sessionRefresh.create({
        data: {
          digest: digest(pair.refreshToken),
          sessionId: stored.sessionId,
          expiresAt: stored.session.expiresAt,
        },
      });
      return pair;
    })
    .catch(async (error: unknown) => {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        ['P2028', 'P2034'].includes(String(error.code))
      ) {
        // SQLite transaction contention must not keep a potentially reused family alive.
        await prisma.authSession.updateMany({
          where: { id: p.sid as string, userId: p.userId as string, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        throw new AppError(401, 'Session could not be rotated safely; sign in again');
      }
      throw error;
    });
  if (!outcome) throw new AppError(401, 'Session expired or revoked; sign in again');
  return outcome;
}
