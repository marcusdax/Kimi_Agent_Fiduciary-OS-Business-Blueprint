/**
 * integration/server.test.ts — drives the real HTTP handler over a real socket.
 *
 * Proves the contract an API consumer depends on: status codes, the provenance
 * envelope, authentication and scopes, rate-limit headers, the production data gate,
 * and the ledger round-trip (append -> export -> verify -> tamper detected).
 *
 * Environment is configured before the server module is imported, because the module
 * reads configuration at load time (store selection, signing keys, rate limits).
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.AUTH_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.LEDGER_MODE = 'memory';
process.env.CACHE_MODE = 'memory';
process.env.RATE_LIMIT_MULTIPLIER = '50';

const { start } = await import('../../src/server.ts');

let base = '';
let close: () => Promise<void>;
let token = '';

before(async () => {
  const server = await start(0);
  base = `http://127.0.0.1:${server.port}`;
  close = server.close;
  const issued = await fetch(`${base}/api/v1/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sub: 'advisor:test', scopes: ['calc:read', 'ledger:read', 'ledger:write', 'advice:write', 'authz:read', 'authz:write', 'admin'] }),
  });
  token = ((await issued.json()) as { token: string }).token;
});

after(async () => {
  await close?.();
});

async function call(method: string, path: string, body?: unknown, opts: { auth?: string | null; token?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const bearer = opts.auth === null ? null : (opts.token ?? token);
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { __text: text };
  }
  return { status: res.status, json, headers: res.headers, text };
}

describe('HTTP contract', () => {
  test('health is unauthenticated and cheap', async () => {
    const r = await call('GET', '/health', undefined, { auth: null });
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'ok');
  });

  test('every response carries a request id for support traceability', async () => {
    const r = await call('GET', '/health');
    assert.ok((r.headers.get('x-request-id') ?? '').length > 10);
  });

  test('an unknown route is a real 404, not an empty 200', async () => {
    const r = await call('GET', '/api/v1/nope');
    assert.equal(r.status, 404);
    assert.equal((r.json.error as { code: string }).code, 'not_found');
  });

  test('metrics are exposed in Prometheus text format', async () => {
    const res = await fetch(`${base}/metrics`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /fidos_http_requests_total/);
    assert.match(text, /fidos_upstream_calls_total/);
  });

  test('the OpenAPI document is generated from the live route table', async () => {
    const r = await call('GET', '/openapi.json', undefined, { auth: null });
    assert.equal(r.status, 200);
    const spec = r.json as { openapi: string; paths: Record<string, unknown> };
    assert.equal(spec.openapi, '3.1.0');
    assert.ok(Object.keys(spec.paths).length >= 15, `only ${Object.keys(spec.paths).length} paths documented`);
  });

  test('the data-source registry names every external dependency', async () => {
    const r = await call('GET', '/api/v1/data-sources', undefined, { auth: null });
    assert.equal(r.status, 200);
    const sources = r.json.sources as Array<{ id: string; license: string; backs: string[] }>;
    const ids = sources.map((s) => s.id);
    for (const required of ['fred', 'treasury', 'sec-edgar', 'bls', 'ssa', 'irs']) {
      assert.ok(ids.includes(required), `registry is missing ${required}`);
    }
    for (const s of sources) {
      assert.ok(s.license.length > 3, `source ${s.id} has no licence statement`);
      assert.ok(s.backs.length > 0, `source ${s.id} does not say what it backs`);
    }
  });
});

describe('authentication and authorisation', () => {
  test('a protected route rejects an anonymous caller', async () => {
    const r = await call('POST', '/api/v1/calculations/tax', { ordinaryIncome: 1000 }, { auth: null });
    assert.equal(r.status, 401);
    assert.equal((r.json.error as { code: string }).code, 'unauthorized');
  });

  test('a token without the required scope is forbidden, not unauthenticated', async () => {
    const limited = await call('POST', '/api/v1/auth/token', { sub: 'reader:x', scopes: ['calc:read'] });
    const scoped = (limited.json.token as string) ?? '';
    const r = await call('POST', '/api/v1/ledger/entries', { action: 'plan.created', subject: 'household:x' }, { token: scoped });
    assert.equal(r.status, 403);
    assert.equal((r.json.error as { code: string }).code, 'forbidden');
  });

  test('a tampered token is rejected', async () => {
    const parts = token.split('.');
    const forged = `${parts[0]}.${parts[1]}.${Buffer.from('nope').toString('base64url')}`;
    const r = await call('GET', '/api/v1/ledger/head', undefined, { token: forged });
    assert.equal(r.status, 401);
  });

  test('rate-limit headers are present and bounded', async () => {
    const r = await call('POST', '/api/v1/calculations/tax', { ordinaryIncome: 1000 });
    assert.equal(r.status, 200);
    assert.ok(Number(r.headers.get('x-ratelimit-limit')) > 0);
    assert.ok(Number(r.headers.get('x-ratelimit-remaining')) >= 0);
  });
});

describe('console', () => {
  test('the console is served with a strict content security policy', async () => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    const csp = res.headers.get('content-security-policy') ?? '';
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    const html = await res.text();
    assert.match(html, /Trust console/);
    assert.match(html, /assets\/console\.js/);
  });

  test('assets are served with javascript and text/css content types', async () => {
    const js = await fetch(base + '/assets/console.js');
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type') ?? '', /javascript/);
    const css = await fetch(base + '/assets/console.css');
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type') ?? '', /text\/css/);
  });

  test('the console module imports the shared formatter, which is also served', async () => {
    const fmt = await fetch(base + '/assets/format.js');
    assert.equal(fmt.status, 200);
    assert.match(await fmt.text(), /classifyFreshness/);
  });

  test('anything outside the asset whitelist is a 404, including traversal attempts', async () => {
    for (const path of ['/assets/nope.js', '/assets/../src/server.ts', '/assets/..%2F..%2Fpackage.json']) {
      const res = await fetch(base + path);
      assert.equal(res.status, 404, path + ' should not be served');
    }
  });
});

describe('calculators over HTTP', () => {
  test('tax returns a value plus provenance', async () => {
    const r = await call('POST', '/api/v1/calculations/tax', { taxYear: 2026, filingStatus: 'single', ordinaryIncome: 100_000 });
    assert.equal(r.status, 200);
    const data = r.json.data as Record<string, number>;
    assert.equal(data.ordinaryTax, 13_170);
    const prov = r.json.provenance as { sourceKind: string; method: string };
    assert.equal(prov.sourceKind, 'derived');
    assert.match(prov.method, /Revenue Procedure 2025-32/);
  });

  test('both supported tax years are answered with their own citation', async () => {
    const years = await call('GET', '/api/v1/calculations/tax/years');
    const data = years.json as { supportedYears: number[]; citations: Array<{ year: number; citation: string }> };
    assert.deepEqual(data.supportedYears, [2025, 2026]);
    assert.match(data.citations.find((c) => c.year === 2025)?.citation ?? '', /2024-40/);
  });

  test('an unsupported tax year is a 422, never a silent approximation', async () => {
    const r = await call('POST', '/api/v1/calculations/tax', { taxYear: 2019, filingStatus: 'single', ordinaryIncome: 50_000 });
    assert.equal(r.status, 422);
    assert.equal((r.json.error as { code: string }).code, 'invalid_input');
  });

  test('a malformed body is a 400 with a machine-readable code', async () => {
    const res = await fetch(`${base}/api/v1/calculations/tax`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: '{not json',
    });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'bad_request');
  });

  test('suitability returns a verdict, gates client delivery and writes evidence', async () => {
    const r = await call('POST', '/api/v1/suitability/assess', {
      clientAge: 58,
      riskTolerance: 'moderate',
      horizonYears: 12,
      equityWeight: 0.6,
      illiquidShare: 0.05,
      totalCostRatio: 0.012,
      stressYearLoss: -0.18,
      hasEmergencyReserve: true,
      fundedRatio: 0.95,
      concentrationAcknowledged: true,
      vulnerability: false,
      products: ['index-fund'],
    });
    assert.equal(r.status, 200);
    const data = r.json.data as { verdict: string; mayShowToClient: boolean };
    assert.equal(data.verdict, 'suitable');
    assert.equal(data.mayShowToClient, true);

    const head = await call('GET', '/api/v1/ledger/head');
    assert.ok((head.json.length as number) > 0, 'the suitability decision must be recorded');
  });

  test('anomaly returns an explainable band', async () => {
    const r = await call('POST', '/api/v1/anomaly/assess', {
      action: { id: 'a1', type: 'withdrawal.large', at: '2026-11-01T12:00:00Z', amount: 400_000, channel: 'advisor', daysSinceClientLogin: 300, hoursToApproval: 0.2 },
      context: { age: 84, vulnerabilityFlag: true, investableAssets: 700_000, typicalAnnualWithdrawal: 35_000 },
    });
    assert.equal(r.status, 200);
    const data = r.json.data as { band: string; signals: unknown[] };
    assert.equal(data.band, 'high');
    assert.ok(data.signals.length >= 3);
  });
});

describe('ledger round-trip over HTTP', () => {
  test('append, export, verify, tamper', async () => {
    const append = await call('POST', '/api/v1/ledger/entries', {
      action: 'plan.created',
      subject: 'household:integration',
      anchors: { stage: 'intake' },
      payload: { note: 'sensitive client detail that must not be stored in the clear' },
    });
    assert.equal(append.status, 201);
    const entry = append.json.entry as { actor: string };
    assert.equal(entry.actor, 'advisor:test', 'the actor comes from the token, not the body');

    const exported = await call('GET', '/api/v1/ledger/export');
    const bundle = exported.json as { entries: Array<Record<string, unknown>>; headHash: string; signature?: string };
    assert.ok(bundle.entries.length >= 1);
    assert.ok(!exported.text.includes('sensitive client detail'), 'ledger exports must not contain payload plaintext');
    assert.ok(bundle.signature, 'exported bundles must be signed');

    const key = await call('GET', '/api/v1/ledger/public-key', undefined, { auth: null });
    const publicKeyPem = (key.json as { publicKeyPem: string }).publicKeyPem;
    const verified = await call('POST', '/api/v1/ledger/verify', { bundle, publicKeyPem });
    assert.equal((verified.json as { valid: boolean }).valid, true);

    const tampered = structuredClone(bundle);
    (tampered.entries[0] as { anchors: Record<string, string> }).anchors = { stage: 'pwned' };
    const detected = await call('POST', '/api/v1/ledger/verify', { bundle: tampered, publicKeyPem });
    const result = detected.json as { valid: boolean; brokenAt: number | null; reason: string };
    assert.equal(result.valid, false);
    assert.equal(result.brokenAt, 0);
    assert.match(result.reason, /modified/);
  });

  test('a subject sub-chain is exportable, signed and self-verifying', async () => {
    await call('POST', '/api/v1/ledger/entries', { action: 'plan.stage.advanced', subject: 'household:sub', anchors: { stage: 'discovery' } });
    await call('POST', '/api/v1/ledger/entries', { action: 'plan.stage.advanced', subject: 'household:other', anchors: { stage: 'discovery' } });
    const r = await call('GET', '/api/v1/ledger/subject/household:sub');
    assert.equal(r.status, 200);
    const bundle = r.json as { entries: unknown[]; verification: { valid: boolean; linkage: string } };
    assert.equal(bundle.entries.length, 1);
    assert.equal(bundle.verification.valid, true);
    assert.equal(bundle.verification.linkage, 'per-entry');
  });
});

describe('authorisation graph', () => {
  test('an advisor reaches a household document only through the firm that serves it', async () => {
    await call('POST', '/api/v1/authz/tuples', { subject: 'user:advisor1', relation: 'member', object: 'firm:f1' });
    await call('POST', '/api/v1/authz/tuples', { subject: 'firm:f1', relation: 'serves', object: 'household:h1' });
    await call('POST', '/api/v1/authz/tuples', { subject: 'household:h1', relation: 'parent', object: 'document:d1' });
    await call('POST', '/api/v1/authz/tuples', { subject: 'household:h1', relation: 'viewer', object: 'document:d1' });

    const allowed = await call('POST', '/api/v1/authz/check', { subject: 'user:advisor1', relation: 'viewer', object: 'document:d1' });
    assert.equal((allowed.json as { allowed: boolean }).allowed, true);
    assert.ok((allowed.json as { path: string[] }).path.length > 1, 'a decision must show its traversal');

    const stranger = await call('POST', '/api/v1/authz/check', { subject: 'user:stranger', relation: 'viewer', object: 'document:d1' });
    assert.equal((stranger.json as { allowed: boolean }).allowed, false);
  });

  test('listing returns only the households the subject may view', async () => {
    const r = await call('GET', '/api/v1/authz/objects/user:advisor1');
    const body = r.json as { objects: string[] };
    assert.ok(Array.isArray(body.objects));
    assert.ok(!body.objects.includes('household:h999'));
  });
});

describe('attestations and vault', () => {
  test('an attestation proves a threshold without carrying the value', async () => {
    const issued = await call('POST', '/api/v1/attestations', {
      subject: 'household:h1',
      predicate: 'investable_assets_gte',
      threshold: 1_000_000,
      asOf: '2026-11-01',
      expiresAt: '2027-11-01',
      evidence: ['fiduciary-os:calibration:equity-real-returns'],
      value: 2_400_000,
    });
    assert.equal(issued.status, 201);
    assert.ok(!issued.text.includes('2400000'), 'the underlying value must never appear in the attestation');

    const attestation = (issued.json as { data: unknown }).data;
    const salt = (issued.json as { salt: string }).salt;
    const publicKeyPem = (issued.json as { publicKeyPem: string }).publicKeyPem;

    const verified = await call('POST', '/api/v1/attestations/verify', { attestation, value: 2_400_000, salt });
    const result = verified.json as { valid: boolean; commitmentVerified: boolean | null };
    assert.equal(result.valid, true);
    assert.equal(result.commitmentVerified, true);
    assert.ok(publicKeyPem.includes('BEGIN PUBLIC KEY'));

    const wrongValue = await call('POST', '/api/v1/attestations/verify', { attestation, value: 10, salt });
    assert.equal((wrongValue.json as { commitmentVerified: boolean }).commitmentVerified, false);
  });

  test('the vault seals, lists without content, and survives key rotation', async () => {
    const created = await call('POST', '/api/v1/vault/documents', {
      id: 'doc-1',
      contentBase64: Buffer.from('sensitive engagement letter').toString('base64'),
      meta: { type: 'engagement-letter' },
    });
    assert.equal(created.status, 201);
    assert.ok(!created.text.includes('sensitive engagement letter'));

    const list = await call('GET', '/api/v1/vault/documents');
    const body = list.json as { documents: Array<{ id: string; keyVersion: number }>; integrity: { failures: string[] } };
    assert.equal(body.documents.length, 1);
    assert.equal(body.integrity.failures.length, 0);
    assert.ok(!list.text.includes('c2Vuc2l0aXZl'), 'ciphertext must not be exposed by a listing');

    const rotated = await call('POST', '/api/v1/vault/rotate');
    assert.equal(rotated.status, 200);

    const after = await call('GET', '/api/v1/vault/documents');
    const afterBody = after.json as { documents: Array<{ keyVersion: number }>; integrity: { failures: string[] } };
    assert.equal(afterBody.integrity.failures.length, 0, 'documents must still decrypt after rotation');
    assert.ok(afterBody.documents[0]!.keyVersion > 1, 'the data key should be re-wrapped under the new version');
  });
});

describe('partner formulas and benchmarks', () => {
  test('registers a formula at submission time and evaluates it with a trace', async () => {
    const created = await call('POST', '/api/v1/partners/formulas', {
      id: 'income-gap',
      description: 'Protection gap',
      expression: 'max(0, income * 10 - coverage)',
      variables: { income: { label: 'Annual income' }, coverage: { label: 'Existing coverage' } },
    });
    assert.equal(created.status, 201);

    const evaluated = await call('POST', '/api/v1/partners/formulas/income-gap/evaluate', { inputs: { income: 120000, coverage: 400000 } });
    assert.equal(evaluated.status, 200);
    const data = evaluated.json.data as { value: number; trace: string[]; operations: number };
    assert.equal(data.value, 800000);
    assert.ok(data.trace.length > 0);
    assert.ok(data.operations > 0);
  });

  test('a formula that tries to reach the host is refused at registration', async () => {
    const r = await call('POST', '/api/v1/partners/formulas', {
      id: 'evil',
      description: 'x',
      expression: 'process.env',
      variables: { income: { label: 'i' } },
    });
    assert.equal(r.status, 422);
    assert.equal((r.json.error as { code: string }).code, 'invalid_formula');
  });

  test('an unknown formula id is a 404, not an empty result', async () => {
    const r = await call('POST', '/api/v1/partners/formulas/nope/evaluate', { inputs: {} });
    assert.equal(r.status, 404);
  });

  test('a benchmark below the firm threshold is refused and spends no privacy budget', async () => {
    const before = await call('GET', '/api/v1/benchmarks/budget');
    const spentBefore = (before.json as { spent: number }).spent;
    const r = await call('POST', '/api/v1/benchmarks/publish', {
      metric: 'all_in_cost',
      firms: [1, 2, 3, 4].map((i) => ({ firmId: 'firm:' + i, value: 1.2, n: 40 })),
    });
    assert.equal(r.status, 422);
    assert.equal((r.json.error as { code: string }).code, 'benchmark_suppressed');
    const after = await call('GET', '/api/v1/benchmarks/budget');
    assert.equal((after.json as { spent: number }).spent, spentBefore);
  });

  test('a benchmark with enough firms publishes a noisy value with its mechanism disclosed', async () => {
    const r = await call('POST', '/api/v1/benchmarks/publish', {
      metric: 'all_in_cost',
      firms: [1, 2, 3, 4, 5, 6].map((i) => ({ firmId: 'firm:' + i, value: 1.2, n: 40 })),
      clipLow: 0,
      clipHigh: 5,
    });
    assert.equal(r.status, 200);
    const data = r.json.data as { firms: number; epsilon: number; noiseScale: number; notes: string[] };
    assert.equal(data.firms, 6);
    assert.ok(data.epsilon > 0);
    assert.ok(data.notes.length >= 4);
  });
});

describe('token revocation and key discovery', () => {
  const decode = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString('utf8')) as { jti: string; sub: string; iat: number };

  test('a revoked token is refused on the very next request', async () => {
    const minted = await call('POST', '/api/v1/auth/token', { sub: 'revoke:one', scopes: ['calc:read'] });
    const victim = (minted.json as { token: string }).token;
    const before = await call('GET', '/api/v1/calculations/tax/years', undefined, { token: victim });
    assert.equal(before.status, 200);

    const { jti } = decode(victim);
    const revoked = await call('POST', '/api/v1/auth/revoke', { jti });
    assert.equal(revoked.status, 200);

    const after = await call('GET', '/api/v1/calculations/tax/years', undefined, { token: victim });
    assert.equal(after.status, 401);
    assert.equal((after.json.error as { code: string }).code, 'token_revoked');
  });

  test('revoking a subject kills tokens issued before it and spares those issued after', async () => {
    const first = (await call('POST', '/api/v1/auth/token', { sub: 'revoke:sub', scopes: ['calc:read'] })).json as { token: string };
    await call('POST', '/api/v1/auth/revoke', { sub: 'revoke:sub' });

    const dead = await call('GET', '/api/v1/calculations/tax/years', undefined, { token: first.token });
    assert.equal(dead.status, 401);
    assert.equal((dead.json.error as { code: string }).code, 'subject_revoked');

    // iat has second resolution, so wait out the boundary before minting a replacement.
    await new Promise((r) => setTimeout(r, 1100));
    const second = (await call('POST', '/api/v1/auth/token', { sub: 'revoke:sub', scopes: ['calc:read'] })).json as { token: string };
    const alive = await call('GET', '/api/v1/calculations/tax/years', undefined, { token: second.token });
    assert.equal(alive.status, 200);
  });

  test('revocation needs a jti or a subject, and does not accept an empty request', async () => {
    const r = await call('POST', '/api/v1/auth/revoke', {});
    assert.equal(r.status, 400);
  });

  test('the attestation key is discoverable as a JWK instead of being handed over out of band', async () => {
    const r = await call('GET', '/api/v1/attestations/jwks', undefined, { auth: null });
    assert.equal(r.status, 200);
    const jwk = (r.json.keys as Array<Record<string, string>>)[0]!;
    assert.equal(jwk.kty, 'OKP');
    assert.equal(jwk.crv, 'Ed25519');
    assert.equal(jwk.use, 'sig');
    assert.equal(jwk.alg, 'EdDSA');
    assert.match(jwk.kid ?? '', /^[a-f0-9]{16}$/);
    assert.equal(Buffer.from(jwk.x!, 'base64url').length, 32);
  });
});

describe('live market data over HTTP', { skip: process.env.FID_OS_LIVE !== '1' && 'set FID_OS_LIVE=1' }, () => {
  test('macro snapshot is populated from FRED and Treasury', async () => {
    const r = await call('GET', '/api/v1/macro');
    assert.equal(r.status, 200);
    const rates = r.json.rates as { tenYearPct: number; realYield10yPct: number };
    assert.ok(rates.tenYearPct > 0);
  });

  test('retirement projection is calibrated from live data', async () => {
    const r = await call('POST', '/api/v1/calculations/retirement', {
      currentAge: 55,
      retirementAge: 65,
      planToAge: 95,
      portfolio: 1_200_000,
      annualContribution: 25_000,
      annualSpending: 90_000,
      socialSecurity: 36_000,
      socialSecurityStartAge: 67,
      pension: 0,
      equityWeight: 0.6,
      feeRate: 0.0075,
      trials: 400,
      seed: 20261108,
    });
    assert.equal(r.status, 200);
    const data = r.json.data as { successRate: number };
    assert.ok(data.successRate >= 0 && data.successRate <= 1);
    const calibration = r.json.calibration as { observedFrom: number };
    assert.ok(calibration.observedFrom > 1970);
  });

  test('annuity is priced off the live Treasury curve and SSA mortality', async () => {
    const r = await call('POST', '/api/v1/calculations/annuity', { principal: 500_000, startAge: 67, deferralYears: 0, sex: 'female', colaRate: 0.02 });
    assert.equal(r.status, 200);
    const data = r.json.data as { payoutRate: number; monthlyIncome: number };
    assert.ok(data.payoutRate > 0.04 && data.payoutRate < 0.12);
    assert.ok(data.monthlyIncome > 1_000);
  });

  test('disclosure watch returns filings and links for a real issuer', async () => {
    const r = await call('POST', '/api/v1/disclosure-watch', { tickers: ['AAPL'], lookbackDays: 400 });
    assert.equal(r.status, 200);
    const data = r.json.data as { filings: Array<{ url: string; form: string }>; issuersChecked: number };
    assert.equal(data.issuersChecked, 1);
    assert.ok(data.filings.length > 0, 'Apple files 10-K/10-Q/8-K regularly');
    assert.match(data.filings[0]!.url, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//);
  });
});
