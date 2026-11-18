/**
 * Unit tests for the feature modules added after the readiness review:
 * authorisation graph, attestations, vault, MCP surface, and the OpenAPI contract.
 *
 * The server module is imported dynamically after the environment is pinned, because
 * it reads configuration (store selection, signing keys) at load time.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.AUTH_SECRET = 'feature-test-secret-that-is-long-enough-32';
process.env.LEDGER_MODE = 'memory';
process.env.CACHE_MODE = 'memory';

const { AuthzGraph } = await import('../../src/trust/authz.ts');
const { generateAttestationKeyPair, issueAttestation, verifyAttestation, commit, verifyCommitment, attest } = await import('../../src/trust/attestations.ts');
const { Vault, MemoryKeyring } = await import('../../src/security/vault.ts');
const { createMcpHandler, TOOLS } = await import('../../src/mcp/server.ts');
const { routes } = await import('../../src/server.ts');
const { buildOpenApi } = await import('../../src/openapi.ts');

describe('authorisation graph', () => {
  const build = () => {
    const g = new AuthzGraph();
    g.add({ subject: 'user:a1', relation: 'member', object: 'firm:f1' });
    g.add({ subject: 'firm:f1', relation: 'serves', object: 'household:h1' });
    g.add({ subject: 'household:h1', relation: 'parent', object: 'document:d1' });
    g.add({ subject: 'household:h1', relation: 'parent', object: 'document:d2' });
    g.add({ subject: 'user:a2', relation: 'member', object: 'firm:f2' });
    return g;
  };

  test('an advisor reaches a document through firm membership and engagement', () => {
    const g = build();
    const result = g.check('user:a1', 'viewer', 'document:d1');
    assert.equal(result.allowed, true);
    assert.ok(result.path.length >= 2, 'the decision must show the traversal');
  });

  test('an advisor at a different firm is denied', () => {
    const g = build();
    assert.equal(g.check('user:a2', 'viewer', 'document:d1').allowed, false);
  });

  test('a direct viewer grant works without any firm', () => {
    const g = new AuthzGraph();
    g.add({ subject: 'user:x', relation: 'viewer', object: 'household:h9' });
    assert.equal(g.check('user:x', 'viewer', 'household:h9').allowed, true);
  });

  test('editor implies viewer but not the reverse', () => {
    const g = new AuthzGraph();
    g.add({ subject: 'user:x', relation: 'editor', object: 'document:d9' });
    assert.equal(g.check('user:x', 'viewer', 'document:d9').allowed, true);
    const g2 = new AuthzGraph();
    g2.add({ subject: 'user:y', relation: 'viewer', object: 'document:d9' });
    assert.equal(g2.check('user:y', 'editor', 'document:d9').allowed, false);
  });

  test('a cycle cannot hang the traversal', () => {
    const g = new AuthzGraph();
    g.add({ subject: 'household:a', relation: 'parent', object: 'document:x' });
    g.add({ subject: 'document:x', relation: 'parent', object: 'household:a' });
    const result = g.check('user:nobody', 'viewer', 'document:x', 4);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /depth/);
  });

  test('revocation takes effect immediately', () => {
    const g = build();
    assert.equal(g.check('user:a1', 'viewer', 'document:d1').allowed, true);
    assert.equal(g.remove({ subject: 'firm:f1', relation: 'serves', object: 'household:h1' }), true);
    assert.equal(g.check('user:a1', 'viewer', 'document:d1').allowed, false);
  });

  test('listing returns only the households the subject may view', () => {
    const g = build();
    assert.deepEqual(g.listObjects('user:a1', 'viewer', 'household'), ['household:h1']);
    assert.deepEqual(g.listObjects('user:a2', 'viewer', 'household'), []);
  });

  test('unnamespaced tuples are rejected', () => {
    const g = new AuthzGraph();
    assert.throws(() => g.add({ subject: 'a1', relation: 'member', object: 'firm:f1' }), /namespaced/);
  });
});

describe('attestations', () => {
  const keys = generateAttestationKeyPair();
  const baseClaim = {
    subject: 'household:h1',
    predicate: 'investable_assets_gte' as const,
    threshold: 1_000_000,
    asOf: '2026-11-01',
    expiresAt: '2027-11-01',
    issuer: 'fiduciary-os',
    evidence: ['fred:CPIAUCSL'],
    nonDisclosure: ['account balances'],
  };

  test('a signed claim verifies and carries no underlying value', () => {
    const signed = issueAttestation(baseClaim, keys.privateKey);
    const result = verifyAttestation(signed, keys.publicKey);
    assert.equal(result.valid, true);
    assert.equal(result.claim?.threshold, 1_000_000);
    assert.ok(!JSON.stringify(signed).includes('2400000'));
  });

  test('tampering with the claim invalidates the signature', () => {
    const signed = issueAttestation(baseClaim, keys.privateKey);
    (signed.claim as { threshold: number }).threshold = 500_000;
    const result = verifyAttestation(signed, keys.publicKey);
    assert.equal(result.valid, false);
    assert.match(result.reason ?? '', /signature/);
  });

  test('an expired claim is reported as expired, not merely invalid', () => {
    const signed = issueAttestation({ ...baseClaim, expiresAt: '2026-11-05' }, keys.privateKey);
    const result = verifyAttestation(signed, keys.publicKey, new Date('2026-11-08T00:00:00Z'));
    assert.equal(result.valid, false);
    assert.equal(result.expired, true);
  });

  test('a commitment reveals the value only when the holder chooses to', () => {
    const { commitment, salt } = commit(2_400_000);
    assert.equal(verifyCommitment(commitment, 2_400_000, salt), true);
    assert.equal(verifyCommitment(commitment, 2_500_000, salt), false);
    assert.equal(verifyCommitment(commitment, 2_400_000, 'wrong-salt'), false);
  });

  test('a claim without a threshold is refused for threshold predicates', () => {
    assert.throws(() => issueAttestation({ ...baseClaim, threshold: undefined } as never, keys.privateKey), /threshold/);
  });

  test('expiry must follow the observation date', () => {
    assert.throws(() => issueAttestation({ ...baseClaim, expiresAt: '2026-10-01' }, keys.privateKey), /expiresAt/);
  });

  test('the provenance states what is not disclosed', () => {
    const d = attest(baseClaim, keys.privateKey);
    assert.equal(d.provenance.sourceKind, 'derived');
    assert.match(d.provenance.method, /not disclosed/);
  });
});

describe('vault', () => {
  test('seals and opens a document', () => {
    const vault = new Vault(new MemoryKeyring());
    vault.put('d1', Buffer.from('engagement letter'), { type: 'letter' });
    assert.equal(vault.get('d1').toString('utf8'), 'engagement letter');
  });

  test('the listing never exposes content', () => {
    const vault = new Vault(new MemoryKeyring());
    vault.put('d1', Buffer.from('secret'), {});
    const listed = JSON.stringify(vault.list());
    assert.ok(!listed.includes('secret'));
    assert.match(listed, /"bytes":6/);
  });

  test('rotation re-wraps keys and documents still decrypt', () => {
    const vault = new Vault(new MemoryKeyring());
    vault.put('d1', Buffer.from('a'), {});
    vault.put('d2', Buffer.from('b'), {});
    const rotated = vault.rotateKey();
    assert.equal(rotated.rewrapped, 2);
    assert.equal(rotated.toVersion, 2);
    assert.equal(vault.get('d1').toString(), 'a');
    assert.equal(vault.integrityCheck().failures.length, 0);
  });

  test('a sealed document cannot be restored under a different keyring', () => {
    const source = new Vault(new MemoryKeyring());
    const sealed = source.put('d1', Buffer.from('classified'), {});
    const other = new Vault(new MemoryKeyring());
    assert.throws(() => other.importSealed(sealed), /cannot open|does not hold/);
  });

  test('a sealed document restores under the same keyring material', () => {
    const key = Buffer.alloc(32, 7);
    const source = new Vault(new MemoryKeyring(Buffer.from(key)));
    const sealed = source.put('d1', Buffer.from('recoverable'), {});
    const restored = new Vault(new MemoryKeyring(Buffer.from(key)));
    restored.importSealed(sealed);
    assert.equal(restored.get('d1').toString('utf8'), 'recoverable');
  });

  test('duplicate ids and empty documents are refused', () => {
    const vault = new Vault(new MemoryKeyring());
    vault.put('d1', Buffer.from('a'), {});
    assert.throws(() => vault.put('d1', Buffer.from('b'), {}), /already exists/);
    assert.throws(() => vault.put('d2', Buffer.alloc(0), {}), /empty/);
  });

  test('rotation does not skip already-current documents', () => {
    const vault = new Vault(new MemoryKeyring());
    vault.put('d1', Buffer.from('a'), {});
    vault.rotateKey();
    const second = vault.rewrapAll();
    assert.equal(second.rewrapped, 0);
    assert.equal(second.toVersion, 2);
  });
});

describe('MCP surface', () => {
  const deps = {
    calibration: {} as never,
    watch: {} as never,
  };
  const handle = createMcpHandler(deps);

  test('initialize negotiates a protocol version and advertises tools', async () => {
    const res = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    const result = res?.result as { protocolVersion: string; capabilities: { tools: unknown } };
    assert.equal(typeof result.protocolVersion, 'string');
    assert.ok(result.capabilities.tools);
  });

  test('notifications produce no response', async () => {
    assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  });

  test('tools/list returns every tool with a JSON schema', async () => {
    const res = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const tools = (res?.result as { tools: Array<{ name: string; inputSchema: { type: string } }> }).tools;
    assert.equal(tools.length, TOOLS.length);
    for (const tool of tools) {
      assert.match(tool.name, /^fidos_/);
      assert.equal(tool.inputSchema.type, 'object');
    }
  });

  test('tools/call runs a deterministic calculator and returns provenance + disclaimer', async () => {
    const res = await handle({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'fidos_tax_estimate', arguments: { ordinaryIncome: 100_000, taxYear: 2026 } },
    });
    const result = res?.result as { content: Array<{ type: string; text: string }>; isError: boolean };
    assert.equal(result.isError, false);
    const payload = JSON.parse(result.content[0]!.text) as { data: { ordinaryTax: number }; provenance: { sourceKind: string }; disclaimer: string };
    assert.equal(payload.data.ordinaryTax, 13_170);
    assert.equal(payload.provenance.sourceKind, 'derived');
    assert.match(payload.disclaimer, /Not a quote/);
  });

  test('an unknown tool returns an error result rather than a protocol failure', async () => {
    const res = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope', arguments: {} } });
    const result = res?.result as { isError: boolean };
    assert.equal(result.isError, true);
  });

  test('an unknown method is a JSON-RPC error, not a crash', async () => {
    const res = await handle({ jsonrpc: '2.0', id: 5, method: 'nope' });
    assert.equal(res?.error?.code, -32601);
  });

  test('an unsupported tax year surfaces as a tool error with the reason', async () => {
    const res = await handle({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'fidos_tax_estimate', arguments: { ordinaryIncome: 1, taxYear: 2019 } },
    });
    const result = res?.result as { isError: boolean; content: Array<{ text: string }> };
    assert.equal(result.isError, true);
    assert.match(result.content[0]!.text, /2019/);
  });
});

describe('OpenAPI contract', () => {
  const spec = buildOpenApi(routes) as { paths: Record<string, Record<string, unknown>> };

  test('every live route appears in the document', () => {
    for (const route of routes) {
      const documented = route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
      assert.ok(spec.paths[documented], `route ${route.method} ${route.path} is not documented`);
      assert.ok(spec.paths[documented]![route.method.toLowerCase()], `${route.method} ${route.path} missing operation`);
    }
  });

  test('every documented operation exists as a route', () => {
    const declared = new Set(routes.map((r) => `${r.method.toLowerCase()} ${r.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`));
    for (const [path, operations] of Object.entries(spec.paths)) {
      for (const method of Object.keys(operations)) {
        assert.ok(declared.has(`${method} ${path}`), `documented operation ${method} ${path} has no handler`);
      }
    }
  });

  test('protected operations declare bearer security and their scope', () => {
    for (const route of routes) {
      if (route.publicRoute) continue;
      const documented = route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
      const op = spec.paths[documented]![route.method.toLowerCase()] as { security?: unknown; 'x-required-scope'?: string };
      assert.ok(Array.isArray(op.security) && op.security.length > 0, `${route.path} has no security requirement`);
      assert.equal(op['x-required-scope'], route.scope);
    }
  });

  test('a request schema is documented wherever the handler reads a body', () => {
    for (const route of routes) {
      if (!route.requestSchema) continue;
      const documented = route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
      const op = spec.paths[documented]![route.method.toLowerCase()] as { requestBody?: unknown };
      assert.ok(op.requestBody, `${route.path} reads a body but documents none`);
    }
  });
});


const { Formula, FormulaError } = await import('../../src/features/formula.ts');
const { publishBenchmark, PrivacyBudget, BenchmarkSuppressedError, PrivacyBudgetExhaustedError } = await import('../../src/features/benchmarks.ts');

describe('partner formula sandbox', () => {
  const spec = {
    id: 'income-gap',
    description: 'Protection gap',
    expression: 'max(0, income * 10 - coverage)',
    variables: { income: { label: 'Annual income' }, coverage: { label: 'Existing coverage' } },
  };

  test('evaluates arithmetic with precedence and functions', () => {
    const f = Formula.compile(spec);
    const result = f.evaluate({ income: 120_000, coverage: 400_000 });
    assert.equal(result.value.value, 800_000);
    assert.ok(result.value.trace.length > 0, 'the trace must explain the number');
  });

  test('an undeclared variable is a compile error, not a NaN later', () => {
    assert.throws(() => Formula.compile({ ...spec, expression: 'income * 2 + bonus' }), /unknown variable "bonus"/);
  });

  test('host access is impossible: the grammar has no property access or calls out', () => {
    for (const expression of ['process.env', 'this.constructor', 'require("fs")', 'globalThis.x', 'a[0]']) {
      assert.throws(() => Formula.compile({ ...spec, expression, variables: { a: { label: 'a' }, income: { label: 'i' } } }), FormulaError);
    }
  });

  test('an unlisted function is refused', () => {
    assert.throws(() => Formula.compile({ ...spec, expression: 'eval(income)' }), /not allowed/);
  });

  test('nesting depth is bounded', () => {
    const expression = '('.repeat(40) + 'income' + ')'.repeat(40);
    assert.throws(() => Formula.compile({ ...spec, expression }), /nesting/);
  });

  test('division by zero is refused rather than returning Infinity', () => {
    const f = Formula.compile({ ...spec, expression: 'income / (coverage - coverage)' });
    assert.throws(() => f.evaluate({ income: 1, coverage: 0 }), /division by zero/);
  });

  test('non-finite input is refused', () => {
    const f = Formula.compile(spec);
    assert.throws(() => f.evaluate({ income: Number.NaN, coverage: 0 }), /finite number/);
  });

  test('clamp is available and enforces its bounds', () => {
    const f = Formula.compile({ ...spec, expression: 'clamp(income, 0, 100)' });
    assert.equal(f.evaluate({ income: 500, coverage: 0 }).value.value, 100);
    assert.throws(() => Formula.compile({ ...spec, expression: 'clamp(income, 10, 1)' }).evaluate({ income: 5, coverage: 0 }), /bound/);
  });

  test('the result carries provenance identifying the sandbox', () => {
    const d = Formula.compile(spec).evaluate({ income: 1, coverage: 0 });
    assert.match(d.provenance.method, /Declarative formula/);
  });
});

describe('differentially private benchmarks', () => {
  const firms = (n: number, value = 1.1) =>
    Array.from({ length: n }, (_, i) => ({ firmId: `firm:${i}`, value, n: 40 }));

  test('refuses to publish below the firm threshold', () => {
    const budget = new PrivacyBudget(3);
    assert.throws(() => publishBenchmark('cost', firms(4), budget), BenchmarkSuppressedError);
    assert.equal(budget.spent, 0, 'a refused query must not spend budget');
  });

  test('firms below the client threshold are excluded, not down-weighted', () => {
    const mixed = [...firms(5), { firmId: 'firm:tiny', value: 99, n: 3 }];
    const result = publishBenchmark('cost', mixed, new PrivacyBudget(3)).value;
    assert.equal(result.firms, 5);
    assert.equal(result.suppressedFirms, 1);
  });

  test('the noisy mean stays within a plausible distance of the true mean', () => {
    const budget = new PrivacyBudget(3);
    const trueMean = 2.5;
    const result = publishBenchmark('funded_ratio', firms(10, trueMean), budget, {
      minFirms: 5,
      minClientsPerFirm: 25,
      epsilon: 1,
      clip: { low: 0, high: 5 },
      seed: 7,
    }).value;
    const bound = 6 * result.noiseScale;
    assert.ok(Math.abs(result.value - trueMean) <= bound, `noise too large: ${result.value} vs ${trueMean}`);
  });

  test('clipping bounds the influence of an outlier', () => {
    const withOutlier = [...firms(5, 1), { firmId: 'firm:wild', value: 10_000, n: 40 }];
    const result = publishBenchmark('cost', withOutlier, new PrivacyBudget(3), {
      minFirms: 5,
      minClientsPerFirm: 25,
      epsilon: 1,
      clip: { low: 0, high: 2 },
      seed: 1,
    }).value;
    assert.ok(result.value < 10, 'a single outlier must not move the benchmark by orders of magnitude');
  });

  test('the same seed reproduces the same published number', () => {
    const a = publishBenchmark('cost', firms(8), new PrivacyBudget(3)).value.value;
    const b = publishBenchmark('cost', firms(8), new PrivacyBudget(3)).value.value;
    assert.equal(a, b);
  });

  test('the budget is spent and then refuses', () => {
    const budget = new PrivacyBudget(1.0);
    publishBenchmark('cost', firms(8), budget, { minFirms: 5, minClientsPerFirm: 25, epsilon: 0.5, clip: { low: 0, high: 100 }, seed: 1 });
    publishBenchmark('cost', firms(8), budget, { minFirms: 5, minClientsPerFirm: 25, epsilon: 0.4, clip: { low: 0, high: 100 }, seed: 1 });
    assert.throws(
      () => publishBenchmark('cost', firms(8), budget, { minFirms: 5, minClientsPerFirm: 25, epsilon: 0.5, clip: { low: 0, high: 100 }, seed: 1 }),
      PrivacyBudgetExhaustedError,
    );
  });

  test('the result discloses the mechanism, interval and limits', () => {
    const d = publishBenchmark('cost', firms(8), new PrivacyBudget(3));
    assert.equal(d.provenance.sourceKind, 'derived');
    assert.match(d.provenance.method, /Laplace/);
    assert.ok(d.value.notes.length >= 4);
    assert.ok(d.value.interval95.high > d.value.interval95.low);
  });
});
