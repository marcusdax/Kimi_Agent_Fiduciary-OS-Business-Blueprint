import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { HttpClient, CircuitOpenError } from '../../src/http.ts';

const realFetch = globalThis.fetch;
let calls: string[] = [];

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): void {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push(url);
    return handler(url, init);
  }) as typeof fetch;
}

const ok = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } });

describe('resilient HTTP client', () => {
  beforeEach(() => {
    calls = [];
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('caches within the TTL and does not re-request', async () => {
    stubFetch(async () => ok('payload'));
    const client = new HttpClient();
    await client.getText('https://example.gov/a', { ttlMs: 60_000 });
    await client.getText('https://example.gov/a', { ttlMs: 60_000 });
    assert.equal(calls.length, 1);
  });

  test('separates cache entries by URL', async () => {
    stubFetch(async (url) => ok(`body:${url}`));
    const client = new HttpClient();
    await client.getText('https://example.gov/a', { ttlMs: 60_000 });
    await client.getText('https://example.gov/b', { ttlMs: 60_000 });
    assert.equal(calls.length, 2);
  });

  test('retries a 500 and succeeds', async () => {
    let attempt = 0;
    stubFetch(async () => (++attempt === 1 ? new Response('nope', { status: 500 }) : ok('recovered')));
    const client = new HttpClient({ maxRetries: 2, failureThreshold: 10 });
    const res = await client.getText('https://example.gov/flaky', { ttlMs: 0 });
    assert.equal(res.text, 'recovered');
    assert.equal(calls.length, 2);
  });

  test('does not retry a 404 — that is a permanent answer', async () => {
    stubFetch(async () => new Response('missing', { status: 404 }));
    const client = new HttpClient({ maxRetries: 3 });
    await assert.rejects(() => client.getText('https://example.gov/missing'), /HTTP 404/);
    assert.equal(calls.length, 1);
  });

  test('opens the circuit after repeated failures and then fails fast', async () => {
    stubFetch(async () => new Response('down', { status: 503 }));
    const client = new HttpClient({ maxRetries: 0, failureThreshold: 2, cooldownMs: 60_000 });
    await assert.rejects(() => client.getText('https://example.gov/down'));
    await assert.rejects(() => client.getText('https://example.gov/down'));
    await assert.rejects(() => client.getText('https://example.gov/down'), (err: unknown) => err instanceof CircuitOpenError);
    assert.equal(calls.length, 2, 'an open circuit must not reach the network');
    assert.equal(client.health()[0]?.state, 'open');
  });

  test('serves a stale cached body instead of failing when the provider breaks', async () => {
    let fail = false;
    stubFetch(async () => (fail ? new Response('down', { status: 500 }) : ok('cached-value')));
    const client = new HttpClient({ maxRetries: 0, failureThreshold: 10 });
    await client.getText('https://example.gov/x', { ttlMs: 1 });
    fail = true;
    await new Promise((r) => setTimeout(r, 5)); // let the 1ms TTL lapse
    const res = await client.getText('https://example.gov/x', { ttlMs: 1, staleIfErrorMs: 60_000 });
    assert.equal(res.text, 'cached-value');
    assert.equal(res.stale, true);
  });

  test('does not serve a stale body that is older than the stale window', async () => {
    let fail = false;
    stubFetch(async () => (fail ? new Response('down', { status: 500 }) : ok('old')));
    const client = new HttpClient({ maxRetries: 0, failureThreshold: 10 });
    await client.getText('https://example.gov/y', { ttlMs: 1 });
    fail = true;
    await new Promise((r) => setTimeout(r, 20));
    await assert.rejects(() => client.getText('https://example.gov/y', { ttlMs: 1, staleIfErrorMs: 1 }), /HTTP 500/);
  });

  test('rejects a non-JSON body when JSON was requested, rather than returning null', async () => {
    stubFetch(async () => ok('<html>not json</html>'));
    const client = new HttpClient({ maxRetries: 0 });
    await assert.rejects(() => client.getJson('https://example.gov/html'), /expected JSON/);
  });

  test('sends an identifying User-Agent (required by SEC and good practice elsewhere)', async () => {
    let seen: string | undefined;
    stubFetch(async (_url, init) => {
      seen = (init?.headers as Record<string, string> | undefined)?.['User-Agent'];
      return ok('ok');
    });
    const client = new HttpClient({ userAgent: 'FiduciaryOS/test' });
    await client.getText('https://example.gov/ua');
    assert.equal(seen, 'FiduciaryOS/test');
  });

  test('passes a per-request method and body', async () => {
    let seenBody: string | undefined;
    stubFetch(async (_url, init) => {
      seenBody = init?.body as string;
      return ok('{"ok":true}');
    });
    const client = new HttpClient();
    const res = await client.getJson<{ ok: boolean }>('https://example.gov/post', { method: 'POST', body: '{"a":1}', cacheKey: 'post-1' });
    assert.deepEqual(res.json, { ok: true });
    assert.equal(seenBody, '{"a":1}');
  });

  test('evicts rather than growing without bound', async () => {
    stubFetch(async (url) => ok(`body:${url}`));
    const client = new HttpClient({ maxCacheEntries: 10 });
    for (let i = 0; i < 40; i++) await client.getText(`https://example.gov/${i}`, { ttlMs: 60_000 });
    assert.ok(client.cacheStats().entries <= 10, `cache grew to ${client.cacheStats().entries}`);
  });
});
