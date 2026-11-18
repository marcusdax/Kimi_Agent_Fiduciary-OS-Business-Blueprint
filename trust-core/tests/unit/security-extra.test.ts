import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { MemoryCache } from '../../src/cache.ts';
import { RevocationRegistry } from '../../src/security/revocation.ts';
import { HttpKeyring, RemoteKeyringError } from '../../src/security/kms-keyring.ts';
import { Vault } from '../../src/security/vault.ts';

describe('token revocation', () => {
  const build = () => new RevocationRegistry(new MemoryCache(100));

  test('a revoked jti is recognised and an unrevoked one is not', () => {
    const r = build();
    assert.equal(r.isTokenRevoked('jti-1'), false);
    r.revokeToken('jti-1');
    assert.equal(r.isTokenRevoked('jti-1'), true);
    assert.equal(r.isTokenRevoked('jti-2'), false);
  });

  test('retention is bounded by the token expiry, so the list cannot grow forever', () => {
    const cache = new MemoryCache(100);
    const r = new RevocationRegistry(cache);
    const now = Date.now();
    // A token with 60 seconds left is retained for about 60 seconds, not the 12h default.
    r.revokeToken('short-lived', Math.floor(now / 1000) + 60, now);
    const record = cache.get('revoked:jti:short-lived');
    assert.ok(record);
    assert.ok(record.ttlMs <= 60_000, `ttl was ${record.ttlMs}`);
  });

  test('subject revocation kills tokens issued at or before the instant', () => {
    const r = build();
    const now = Date.now();
    const issued = Math.floor(now / 1000) - 100;
    assert.equal(r.revokeSubject('advisor:1', now), Math.floor(now / 1000));
    assert.equal(r.isSubjectRevoked('advisor:1', issued), true);
    // A token minted after the revocation is fine.
    assert.equal(r.isSubjectRevoked('advisor:1', Math.floor(now / 1000) + 60), false);
    assert.equal(r.isSubjectRevoked('advisor:2', issued), false);
  });

  test('the combined check reports which rule fired', () => {
    const r = build();
    r.revokeToken('jti-x');
    assert.deepEqual(r.check({ jti: 'jti-x', sub: 'a', iat: 1 }), { revoked: true, reason: 'token_revoked' });
    r.revokeSubject('b');
    assert.equal(r.check({ jti: 'other', sub: 'b', iat: 1 }).reason, 'subject_revoked');
    assert.deepEqual(r.check({ jti: 'other', sub: 'c', iat: 1 }), { revoked: false, reason: null });
  });

  test('a corrupt revocation record fails closed', () => {
    const cache = new MemoryCache(10);
    const r = new RevocationRegistry(cache);
    cache.set('revoked:sub:broken', '{not json', 60_000);
    assert.equal(r.isSubjectRevoked('broken', 1), true);
  });

  test('empty identifiers are refused rather than silently ignored', () => {
    const r = build();
    assert.throws(() => r.revokeToken('  '), /jti/);
    assert.throws(() => r.revokeSubject(''), /subject/);
  });
});

describe('remote keyring', () => {
  let server: Server;
  let base: string;
  const keys = new Map<number, Buffer>([
    [1, Buffer.alloc(32, 1)],
    [2, Buffer.alloc(32, 2)],
  ]);
  // Deliberately malformed and hidden from the manifest: used to prove short keys are
  // rejected without breaking every other test in this suite.
  keys.set(7, Buffer.alloc(16, 7));
  let current = 1;
  let lastAuth: string | undefined;

  before(async () => {
    server = createServer((req, res) => {
      lastAuth = req.headers.authorization;
      const url = req.url ?? '/';
      const json = (body: unknown, status = 200) => {
        res.statusCode = status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(body));
      };
      if (url === '/keys') return json({ current, versions: [1, 2] });
      if (url.startsWith('/keys/')) {
        const v = Number(url.split('/').pop());
        const key = keys.get(v);
        if (!key) return json({ error: 'missing' }, 404);
        return json({ key: key.toString('base64') });
      }
      if (url === '/rotate' && req.method === 'POST') {
        current += 1;
        keys.set(current, Buffer.alloc(32, current));
        return json({ version: current });
      }
      if (url === '/short') return json({ current: 1, versions: [1] });
      return json({ error: 'not found' }, 404);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  test('loading fetches the manifest and every listed version', async () => {
    const kr = new HttpKeyring({ baseUrl: base, token: 'secret-token', timeoutMs: 5_000 });
    await kr.load();
    assert.equal(kr.currentVersion(), 1);
    assert.deepEqual(kr.versions(), [1, 2]);
    assert.equal(kr.get(2).length, 32);
    assert.equal(new Set(kr.get(2)).size, 1, 'should be the 32-byte filler for version 2');
    assert.equal(lastAuth, 'Bearer secret-token', 'the key service must receive its credential');
  });

  test('an unloaded keyring refuses to answer rather than returning nothing', () => {
    const kr = new HttpKeyring({ baseUrl: base, timeoutMs: 2_000 });
    assert.throws(() => kr.currentVersion(), /not been loaded/);
    assert.throws(() => kr.get(1), /not loaded/);
  });

  test('short keys are rejected instead of weakening the cipher', async () => {
    const kr = new HttpKeyring({ baseUrl: base, timeoutMs: 2_000 });
    await assert.rejects(() => kr.fetchVersion(7), /expected 32/);
  });

  test('rotation goes through the service and refreshes material', async () => {
    const kr = new HttpKeyring({ baseUrl: base, timeoutMs: 2_000 });
    await kr.load();
    const before = kr.currentVersion();
    const version = await kr.rotateRemote();
    assert.equal(version, before + 1);
    assert.equal(kr.currentVersion(), version);
    assert.equal(kr.get(version).length, 32);
  });

  test('synchronous rotation is refused with a message that says what to use', async () => {
    const kr = new HttpKeyring({ baseUrl: base, timeoutMs: 2_000 });
    await kr.load();
    assert.throws(() => kr.rotate(), /rotateRemote/);
  });

  test('a remote keyring backs the vault end to end', async () => {
    const kr = new HttpKeyring({ baseUrl: base, timeoutMs: 2_000 });
    await kr.load();
    const vault = new Vault(kr);
    vault.put('doc', Buffer.from('remote-key-material'), {});
    assert.equal(vault.get('doc').toString(), 'remote-key-material');
    const rotated = await kr.rotateRemote();
    assert.ok(rotated >= 2);
    assert.equal(vault.rewrapAll().rewrapped, 1);
    assert.equal(vault.get('doc').toString(), 'remote-key-material', 'rotation must not lose the document');
  });

  test('a 404 from the key service is a typed error, not a crash', async () => {
    const kr = new HttpKeyring({ baseUrl: base, timeoutMs: 2_000 });
    await assert.rejects(() => kr.fetchVersion(999), RemoteKeyringError);
  });
});
