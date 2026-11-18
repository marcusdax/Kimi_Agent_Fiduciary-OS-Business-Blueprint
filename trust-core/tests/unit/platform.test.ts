import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvidenceLedger, verifyBundle } from '../../src/trust/ledger.ts';
import { FileLedgerStore, MemoryLedgerStore, storeFingerprint } from '../../src/store/ledger-store.ts';
import { issueToken, verifyToken, authenticate, requireScope, AuthError } from '../../src/security/auth.ts';
import { RateLimiter, ProviderBudget } from '../../src/security/ratelimit.ts';
import { MemoryCache, FileCache } from '../../src/cache.ts';
import { MetricsRegistry } from '../../src/observability/metrics.ts';

process.env.AUTH_SECRET = 'unit-test-secret-that-is-long-enough-32';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'fidos-'));
}

describe('ledger persistence', () => {
  test('entries survive a reopen and the chain still verifies', () => {
    const dir = tempDir();
    try {
      const store = new FileLedgerStore(dir);
      const first = EvidenceLedger.open(store, 'ledger-persist');
      first.append({ action: 'plan.created', actor: 'advisor:1', subject: 'household:1' });
      first.append({ action: 'plan.stage.advanced', actor: 'advisor:1', subject: 'household:1', anchors: { to: 'discovery' } });

      const reopened = EvidenceLedger.open(new FileLedgerStore(dir), 'ledger-persist');
      assert.equal(reopened.length, 2);
      assert.equal(reopened.verify().valid, true);
      assert.equal(reopened.head?.hash, first.head?.hash);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('tampering with the stored file is fatal at boot, not a warning', () => {
    const dir = tempDir();
    try {
      const ledger = EvidenceLedger.open(new FileLedgerStore(dir), 'ledger-tamper');
      ledger.append({ action: 'plan.created', actor: 'advisor:1', subject: 'household:1' });
      ledger.append({ action: 'plan.created', actor: 'advisor:1', subject: 'household:2' });

      const path = join(dir, 'ledger.jsonl');
      const lines = readFileSync(path, 'utf8').trim().split('\n');
      const second = JSON.parse(lines[1]!) as { anchors: Record<string, unknown> };
      second.anchors = { injected: true };
      writeFileSync(path, `${lines[0]}\n${JSON.stringify(second)}\n`);

      assert.throws(() => EvidenceLedger.open(new FileLedgerStore(dir), 'ledger-tamper'), /refusing to start/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a torn final line is tolerated as crash recovery, but a torn middle is not', () => {
    const dir = tempDir();
    try {
      const ledger = EvidenceLedger.open(new FileLedgerStore(dir), 'ledger-torn');
      ledger.append({ action: 'plan.created', actor: 'advisor:1', subject: 'household:1' });
      appendFileSync(join(dir, 'ledger.jsonl'), '{"partial":', 'utf8');
      const reopened = EvidenceLedger.open(new FileLedgerStore(dir), 'ledger-torn');
      assert.equal(reopened.length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a signed bundle verifies with the public key and fails with a different one', () => {
    const ledger = new EvidenceLedger('signed');
    const keys = generateKeys();
    ledger.withSigningKeys(keys.privateKey, keys.publicKey);
    ledger.append({ action: 'plan.created', actor: 'a', subject: 'h:1' });
    const bundle = ledger.exportBundle();
    assert.ok(bundle.signature);
    assert.equal(verifyBundle(bundle, keys.publicKey).valid, true);

    const other = generateKeys();
    const wrong = verifyBundle(bundle, other.publicKey);
    assert.equal(wrong.valid, false);
    assert.match(wrong.reason ?? '', /signature/);
  });

  test('an unsigned bundle fails verification when a key is required', () => {
    const ledger = new EvidenceLedger('unsigned');
    ledger.append({ action: 'plan.created', actor: 'a', subject: 'h:1' });
    const keys = generateKeys();
    const result = verifyBundle(ledger.exportBundle(), keys.publicKey);
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /unsigned/);
  });

  test('the memory store reports its footprint', () => {
    const store = new MemoryLedgerStore();
    const ledger = EvidenceLedger.open(store, 'mem');
    ledger.append({ action: 'plan.created', actor: 'a', subject: 'h:1' });
    assert.equal(store.health().entries, 1);
    assert.ok((store.health().bytes ?? 0) > 0);
    assert.ok(storeFingerprint(tempDir()).length === 64);
  });
});

function generateKeys() {
  const pair = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey: pair.privateKey, publicKey: pair.publicKey };
}

describe('authentication', () => {
  test('a token round-trips with its claims', () => {
    const token = issueToken({ sub: 'advisor:1', scopes: ['calc:read', 'ledger:write'], firm: 'firm:1' });
    const claims = verifyToken(token);
    assert.equal(claims.sub, 'advisor:1');
    assert.deepEqual(claims.scopes, ['calc:read', 'ledger:write']);
    assert.equal(claims.firm, 'firm:1');
  });

  test('an expired token is rejected', () => {
    const token = issueToken({ sub: 'a', scopes: ['calc:read'], ttlSeconds: 60 });
    assert.throws(() => verifyToken(token, Date.now() + 120_000), /expired/);
  });

  test('a token cannot outlive the maximum ttl', () => {
    const token = issueToken({ sub: 'a', scopes: ['calc:read'], ttlSeconds: 999_999 });
    const claims = verifyToken(token);
    assert.ok(claims.exp - claims.iat <= 43_200);
  });

  test('a modified payload breaks the signature', () => {
    const token = issueToken({ sub: 'a', scopes: ['calc:read'] });
    const [h, , s] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'admin', scopes: ['admin'], iat: 1, exp: 9_999_999_999, jti: 'x' })).toString('base64url');
    assert.throws(() => verifyToken(`${h}.${forgedPayload}.${s}`), /signature/);
  });

  test('unknown scopes are refused at issue time', () => {
    assert.throws(() => issueToken({ sub: 'a', scopes: ['root' as never] }), /unknown scopes/);
  });

  test('scope checks fail closed and admin implies everything', () => {
    const limited = verifyToken(issueToken({ sub: 'a', scopes: ['calc:read'] }));
    assert.throws(() => requireScope(limited, 'ledger:write'), (err: unknown) => err instanceof AuthError && err.status === 403);
    const admin = verifyToken(issueToken({ sub: 'a', scopes: ['admin'] }));
    requireScope(admin, 'ledger:write');
  });

  test('a malformed Authorization header is rejected', () => {
    assert.throws(() => authenticate('Basic abc'), /Bearer/);
    assert.throws(() => authenticate(undefined), /missing/);
  });
});

describe('rate limiting', () => {
  test('a burst is allowed then the bucket empties', () => {
    const limiter = new RateLimiter({ calc: { ratePerSecond: 1, burst: 3 } });
    const now = Date.now();
    assert.equal(limiter.check('k', 'calc', 1, now).allowed, true);
    assert.equal(limiter.check('k', 'calc', 1, now).allowed, true);
    assert.equal(limiter.check('k', 'calc', 1, now).allowed, true);
    const denied = limiter.check('k', 'calc', 1, now);
    assert.equal(denied.allowed, false);
    assert.ok(denied.retryAfterSeconds >= 1);
  });

  test('tokens refill over time', () => {
    const limiter = new RateLimiter({ calc: { ratePerSecond: 1, burst: 1 } });
    const now = Date.now();
    assert.equal(limiter.check('k', 'calc', 1, now).allowed, true);
    assert.equal(limiter.check('k', 'calc', 1, now).allowed, false);
    assert.equal(limiter.check('k', 'calc', 1, now + 1_100).allowed, true);
  });

  test('buckets are isolated per key', () => {
    const limiter = new RateLimiter({ calc: { ratePerSecond: 1, burst: 1 } });
    const now = Date.now();
    assert.equal(limiter.check('a', 'calc', 1, now).allowed, true);
    assert.equal(limiter.check('b', 'calc', 1, now).allowed, true);
  });

  test('provider concurrency is capped and released', () => {
    const budget = new ProviderBudget({ sec: 1 });
    assert.equal(budget.tryAcquire('sec'), true);
    assert.equal(budget.tryAcquire('sec'), false);
    budget.release('sec');
    assert.equal(budget.tryAcquire('sec'), true);
    assert.equal(budget.tryAcquire('other'), true);
  });
});

describe('cache implementations', () => {
  test('memory cache stores and reports', () => {
    const cache = new MemoryCache(10);
    cache.set('k', 'v', 60_000);
    assert.equal(cache.get('k')?.value, 'v');
    assert.equal(cache.stats().entries, 1);
    cache.clear();
    assert.equal(cache.stats().entries, 0);
  });

  test('file cache is shared across instances', () => {
    const dir = tempDir();
    try {
      const a = new FileCache(dir);
      a.set('https://example.gov/x', 'shared-value', 60_000);
      const b = new FileCache(dir);
      assert.equal(b.get('https://example.gov/x')?.value, 'shared-value');
      b.delete('https://example.gov/x');
      assert.equal(a.get('https://example.gov/x'), undefined);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('file cache keys are hashed, so URLs never become filenames', () => {
    const dir = tempDir();
    try {
      const cache = new FileCache(dir);
      cache.set('https://example.gov/../../etc/passwd', 'v', 60_000);
      const files = readdirSafe(dir);
      assert.equal(files.length, 1);
      assert.match(files[0]!, /^[a-f0-9]{64}\.json$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a zero ttl means do not cache', () => {
    const cache = new MemoryCache();
    cache.set('k', 'v', 0);
    assert.equal(cache.get('k'), undefined);
  });
});

function readdirSafe(dir: string): string[] {
  return readdirSync(dir);
}

describe('metrics exposition', () => {
  test('renders Prometheus text with types, labels and histograms', () => {
    const registry = new MetricsRegistry();
    registry.requests.inc({ route: '/x', status: '200' });
    registry.latency.observe(42, { route: '/x' });
    registry.breakerState.set({ host: 'example.gov' }, 1);
    const text = registry.render();
    assert.match(text, /# TYPE fidos_http_requests_total counter/);
    assert.match(text, /fidos_http_requests_total\{route="\/x",status="200"\} 1/);
    assert.match(text, /fidos_circuit_breaker_open\{host="example\.gov"\} 1/);
    assert.match(text, /fidos_http_request_duration_ms_bucket\{[^}]*le="50"[^}]*\} 1/);
    assert.match(text, /fidos_http_request_duration_ms_count\{route="\/x"\} 1/);
  });

  test('label cardinality is bounded', () => {
    const registry = new MetricsRegistry();
    for (let i = 0; i < 600; i++) registry.requests.inc({ route: `r${i}` });
    const text = registry.render();
    assert.match(text, /dropped_series/);
  });
});
