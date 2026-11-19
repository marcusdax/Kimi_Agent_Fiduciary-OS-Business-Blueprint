/**
 * server.ts — the HTTP surface for the trust core.
 *
 * Deliberately dependency-free (`node:http`): this service sits in front of every
 * number a client sees, so its dependency graph is a security boundary.
 *
 * Contract every response honours:
 *   1. Errors are `{ error: { code, message, detail? } }` with a real HTTP status.
 *   2. Every computed value is returned inside a provenance envelope.
 *   3. Nothing is served as live that is not live; production refuses placeholder
 *      values with 503.
 *   4. `x-request-id` is echoed so a support ticket can be traced to a log line.
 *   5. Authenticated routes require a scoped bearer token; refusals are metric'd.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID, generateKeyPairSync, createPublicKey, sign as cryptoSign } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { HttpClient, CircuitOpenError, UpstreamError } from './http.ts';
import { cacheFromEnv } from './cache.ts';
import { CalibrationService } from './calibration.ts';
import { computeTax, type TaxInput } from './engines/tax.ts';
import { simulate, type MonteCarloInput } from './engines/montecarlo.ts';
import { priceAnnuity, type AnnuityInput } from './engines/annuity.ts';
import { lifeExpectancy } from './engines/mortality.ts';
import { EvidenceLedger, verifyBundle, extractSubChain } from './trust/ledger.ts';
import { assessAction, type PlanningAction, type ClientContext } from './trust/anomaly.ts';
import { assessSuitability, type PlanFacts, DEFAULT_RULES } from './trust/suitability.ts';
import { AuthzGraph } from './trust/authz.ts';
import { attest, verifyAttestation, commit, verifyCommitment, generateAttestationKeyPair, toJwk, keyId, type Claim } from './trust/attestations.ts';
import { Vault, MemoryKeyring, type Keyring } from './security/vault.ts';
import { HttpKeyring } from './security/kms-keyring.ts';
import { DisclosureWatch } from './features/disclosure-watch.ts';
import { Formula, FormulaError, type FormulaSpec } from './features/formula.ts';
import { publishBenchmark, PrivacyBudget, BenchmarkSuppressedError, PrivacyBudgetExhaustedError } from './features/benchmarks.ts';
import { SecSource } from './sources/sec.ts';
import { LATEST_TAX_YEAR, SUPPORTED_TAX_YEARS, getTaxTable } from './sources/taxTables.ts';
import { authenticate, issueToken, requireScope, hasScope, AuthError, type Scope } from './security/auth.ts';
import { defaultLimiter } from './security/ratelimit.ts';
import { RevocationRegistry } from './security/revocation.ts';
import { metrics } from './observability/metrics.ts';
import { FileLedgerStore, MemoryLedgerStore, defaultLedgerDir } from './store/ledger-store.ts';
import { isProduction } from './provenance.ts';
import { matchPath, type RouteSpec, type RouteContext, type RouteResult } from './routes.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildOpenApi } from './openapi.ts';

const PORT = Number(process.env.PORT ?? 8080);
const MAX_BODY_BYTES = 256 * 1024;

// ---- Wiring -----------------------------------------------------------------
const httpClient = new HttpClient({
  userAgent: process.env.SEC_USER_AGENT ?? 'FiduciaryOS/1.0 (+https://fiduciary-os.example; data-provenance)',
  cache: cacheFromEnv(),
});
const calibration = new CalibrationService(httpClient);
const sec = new SecSource(httpClient);
const watch = new DisclosureWatch(sec);
const authz = new AuthzGraph();
// Key material comes from a key service in production and from memory in development.
// The check is explicit so an operator can see which one is in use at /ready.
const vaultKeyring: Keyring = process.env.KMS_URL
  ? new HttpKeyring({ baseUrl: process.env.KMS_URL, token: process.env.KMS_TOKEN, timeoutMs: 5_000 })
  : new MemoryKeyring();
const vault = new Vault(vaultKeyring);
const limiter = defaultLimiter();
// Shared with the HTTP cache, so a second replica honours a revocation immediately.
const revocation = new RevocationRegistry(httpClient.cache);
// Registered partner formulas are compiled once, at submission, and addressed by id.
const formulas = new Map<string, Formula>();
// One ε budget for the reporting period; a benchmark that cannot afford ε is refused.
const benchmarkBudget = new PrivacyBudget(Number(process.env.BENCHMARK_EPSILON_BUDGET ?? 3));

const ledgerStore =
  process.env.LEDGER_MODE === 'memory' || process.env.NODE_ENV === 'test'
    ? new MemoryLedgerStore()
    : new FileLedgerStore(defaultLedgerDir());

const ledger = EvidenceLedger.open(ledgerStore, process.env.LEDGER_ID ?? 'fiduciary-os-primary');

// Signing keys: Ed25519, from env in production, generated in development.
const signing = (() => {
  if (process.env.LEDGER_PRIVATE_KEY) {
    const privateKeyPem = Buffer.from(process.env.LEDGER_PRIVATE_KEY, 'base64').toString('utf8');
    const publicKeyPem = process.env.LEDGER_PUBLIC_KEY
      ? Buffer.from(process.env.LEDGER_PUBLIC_KEY, 'base64').toString('utf8')
      : createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' }).toString();
    return { privateKeyPem, publicKeyPem };
  }
  if (isProduction()) {
    throw new Error('LEDGER_PRIVATE_KEY must be configured in production so exports can be authenticated');
  }
  const pair = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKeyPem: pair.privateKey, publicKeyPem: pair.publicKey };
})();
ledger.withSigningKeys(signing.privateKeyPem, signing.publicKeyPem);

const attestationKeys = generateAttestationKeyPair();

// ---- Warm-up ----------------------------------------------------------------
const warm: { startedAt: string; done: boolean; errors: string[] } = { startedAt: new Date().toISOString(), done: false, errors: [] };

export async function warmUp(): Promise<void> {
  // The Treasury curve CSV takes 15-20s cold. Warming it in the background keeps it
  // off the request path (gap 9) without pretending the provider is fast.
  const results = await Promise.allSettled([
    calibration.treasury.latestCurve(),
    calibration.equityRealReturns(),
    // A remote keyring must be loaded before the first decrypt; doing it here means a
    // misconfigured KMS fails at boot rather than on a client's document.
    ...(vaultKeyring instanceof HttpKeyring ? [vaultKeyring.load()] : []),
  ]);
  warm.errors = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => String(r.reason?.message ?? r.reason));
  warm.done = true;
}


// ---- Static console ---------------------------------------------------------
// A fixed whitelist, not a directory server: no traversal, no content sniffing, and a
// CSP that forbids anything the console does not need.
const UI_DIR = join(import.meta.dirname, 'ui');
const UI_ASSETS: Record<string, { file: string; type: string }> = {
  '/': { file: 'console.html', type: 'text/html; charset=utf-8' },
  '/console': { file: 'console.html', type: 'text/html; charset=utf-8' },
  '/assets/console.css': { file: 'console.css', type: 'text/css; charset=utf-8' },
  '/assets/console.js': { file: 'console.js', type: 'text/javascript; charset=utf-8' },
  '/assets/format.js': { file: 'format.js', type: 'text/javascript; charset=utf-8' },
};
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function serveUi(path: string, res: ServerResponse): boolean {
  const asset = UI_ASSETS[path];
  if (!asset) return false;
  try {
    const body = readFileSync(join(UI_DIR, asset.file), 'utf8');
    res.statusCode = 200;
    res.setHeader('content-type', asset.type);
    res.setHeader('content-security-policy', CONTENT_SECURITY_POLICY);
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('cache-control', asset.type.startsWith('text/html') ? 'no-store' : 'public, max-age=300');
    res.end(body);
    return true;
  } catch {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: { code: 'ui_unavailable', message: 'console assets are missing from this build' } }));
    return true;
  }
}

// ---- Route table ------------------------------------------------------------
const routes: RouteSpec[] = [
  {
    method: 'GET',
    path: '/health',
    group: 'default',
    publicRoute: true,
    summary: 'Liveness probe.',
    handler: async () => ({ status: 200, body: { status: 'ok', uptimeSeconds: Math.round(process.uptime()), production: isProduction() } }),
  },
  {
    method: 'GET',
    path: '/ready',
    group: 'default',
    publicRoute: true,
    summary: 'Readiness probe: cache, circuit breakers, ledger integrity and warm-up state.',
    handler: async () => ({
      status: 200,
      body: {
        status: 'ready',
        cache: { kind: httpClient.cache.kind, ...httpClient.cacheStats() },
        breakers: httpClient.health(),
        ledger: { ...ledger.store.health(), verified: ledger.verify().valid, head: ledger.head?.hash ?? null },
        keyring: { kind: vaultKeyring instanceof HttpKeyring ? 'remote' : 'memory', versions: vaultKeyring.versions() },
        warmUp: warm,
      },
    }),
  },
  {
    method: 'GET',
    path: '/metrics',
    group: 'default',
    publicRoute: true,
    summary: 'Prometheus text exposition.',
    handler: async () => ({ status: 200, body: { __raw: metrics.render() } }),
  },
  {
    method: 'GET',
    path: '/openapi.json',
    group: 'default',
    publicRoute: true,
    summary: 'OpenAPI 3.1 description, generated from this route table.',
    handler: async () => ({ status: 200, body: buildOpenApi(routes) }),
  },
  {
    method: 'GET',
    path: '/api/v1/data-sources',
    group: 'default',
    publicRoute: true,
    summary: 'Registry of every external data dependency, its licence and its health.',
    handler: async () => ({ status: 200, body: dataSourcesReport() }),
  },
  {
    method: 'POST',
    path: '/api/v1/auth/token',
    group: 'auth',
    publicRoute: true,
    summary: 'Issue a scoped bearer token. Disabled in production; use the identity provider there.',
    requestSchema: {
      type: 'object',
      required: ['sub', 'scopes'],
      properties: {
        sub: { type: 'string' },
        scopes: { type: 'array', items: { type: 'string' } },
        ttlSeconds: { type: 'number' },
        firm: { type: 'string' },
      },
    },
    handler: async (ctx) => {
      if (isProduction()) throw new AuthError('token issuing is disabled in production', 403, 'forbidden');
      const body = await ctx.body<{ sub: string; scopes: Scope[]; ttlSeconds?: number; firm?: string }>();
      const token = issueToken({ sub: body.sub, scopes: body.scopes, ttlSeconds: body.ttlSeconds, firm: body.firm });
      return { status: 201, body: { token, tokenType: 'Bearer', expiresIn: Math.min(body.ttlSeconds ?? 3600, 43_200) } };
    },
  },


  {
    method: 'POST',
    path: '/api/v1/auth/revoke',
    group: 'auth',
    scope: 'admin',
    summary: 'Revoke one token by jti, or every token for a subject. Enforced on the next request.',
    requestSchema: {
      type: 'object',
      properties: { jti: { type: 'string' }, sub: { type: 'string' } },
    },
    handler: async (ctx) => {
      const body = await ctx.body<{ jti?: string; sub?: string }>();
      if (!body.jti && !body.sub) {
        throw Object.assign(new Error('provide jti (one token) or sub (all tokens for a subject)'), { status: 400, code: 'bad_request' });
      }
      if (body.jti) revocation.revokeToken(body.jti);
      const revokedAt = body.sub ? revocation.revokeSubject(body.sub) : null;
      ledger.append({
        action: 'client.share.revoked',
        actor: ctx.claims?.sub ?? 'system',
        subject: body.sub ?? `token:${body.jti}`,
        anchors: { scope: body.jti ? 'token' : 'subject', revokedAt },
      });
      return { status: 200, body: { revoked: { jti: body.jti ?? null, sub: body.sub ?? null }, revokedAt } };
    },
  },

  // ---- Calculators ----------------------------------------------------------
  {
    method: 'POST',
    path: '/api/v1/calculations/tax',
    group: 'calc',
    scope: 'calc:read',
    summary: 'Federal income tax for a household, with citation and explicit exclusions.',
    requestSchema: {
      type: 'object',
      required: ['ordinaryIncome'],
      properties: {
        taxYear: { type: 'number', enum: SUPPORTED_TAX_YEARS },
        filingStatus: { type: 'string', enum: ['single', 'married', 'head', 'separate'] },
        ordinaryIncome: { type: 'number' },
        preferentialIncome: { type: 'number' },
        contribution401k: { type: 'number' },
        rothConversion: { type: 'number' },
        capitalLossHarvest: { type: 'number' },
        hsaContribution: { type: 'number' },
        qcdAmount: { type: 'number' },
        ages: { type: 'array', items: { type: 'number' } },
        qualifyingChildren: { type: 'number' },
      },
    },
    handler: async (ctx) => {
      const body = await ctx.body<TaxInput>();
      if (!Number.isFinite(Number(body.ordinaryIncome))) {
        throw Object.assign(new Error('ordinaryIncome is required'), { status: 400, code: 'bad_request' });
      }
      const filingStatus = body.filingStatus ?? 'single';
      const result = computeTax({ ...body, filingStatus, taxYear: body.taxYear ?? LATEST_TAX_YEAR });
      return { status: 200, body: envelope(result) };
    },
  },
  {
    method: 'GET',
    path: '/api/v1/calculations/tax/years',
    group: 'calc',
    scope: 'calc:read',
    summary: 'Tax years the engine can answer for, and the year used when none is given.',
    handler: async () => ({
      status: 200,
      body: {
        supportedYears: SUPPORTED_TAX_YEARS,
        latest: LATEST_TAX_YEAR,
        citations: SUPPORTED_TAX_YEARS.map((y) => ({ year: y, citation: getTaxTable(y).citation, url: getTaxTable(y).citationUrl })),
      },
    }),
  },
  {
    method: 'POST',
    path: '/api/v1/calculations/retirement',
    group: 'live',
    scope: 'calc:read',
    summary: 'Monte Carlo retirement projection calibrated from live FRED data.',
    requestSchema: {
      type: 'object',
      required: ['currentAge', 'retirementAge', 'portfolio', 'annualSpending'],
      properties: {
        currentAge: { type: 'number' },
        retirementAge: { type: 'number' },
        planToAge: { type: 'number' },
        portfolio: { type: 'number' },
        annualContribution: { type: 'number' },
        annualSpending: { type: 'number' },
        socialSecurity: { type: 'number' },
        socialSecurityStartAge: { type: 'number' },
        pension: { type: 'number' },
        equityWeight: { type: 'number' },
        feeRate: { type: 'number' },
        trials: { type: 'number' },
        seed: { type: 'number' },
      },
    },
    handler: async (ctx) => {
      const body = await ctx.body<MonteCarloInput>();
      const input: MonteCarloInput = { ...body, seed: body.seed ?? 20261108, trials: body.trials ?? 2000 };
      const cal = await calibration.assumptions({ equityWeight: input.equityWeight, feeRate: input.feeRate });
      const result = simulate(input, cal.assumptions);
      return {
        status: 200,
        body: { ...envelope(result), calibration: { observedFrom: cal.observedFrom, observedTo: cal.observedTo, sources: cal.provenanceSources } },
      };
    },
  },
  {
    method: 'POST',
    path: '/api/v1/calculations/annuity',
    group: 'live',
    scope: 'calc:read',
    summary: 'Actuarial annuity payout from the live Treasury curve and the SSA life table.',
    requestSchema: {
      type: 'object',
      required: ['principal', 'startAge'],
      properties: {
        principal: { type: 'number' },
        startAge: { type: 'number' },
        deferralYears: { type: 'number' },
        sex: { type: 'string', enum: ['male', 'female'] },
        survivorBenefit: { type: 'number' },
        jointAge: { type: 'number' },
        jointSex: { type: 'string', enum: ['male', 'female'] },
        colaRate: { type: 'number' },
        loadRate: { type: 'number' },
      },
    },
    handler: async (ctx) => {
      const body = await ctx.body<AnnuityInput>();
      const { latest } = await calibration.treasury.latestCurve();
      const result = priceAnnuity(body, latest);
      return {
        status: 200,
        body: { ...envelope(result), lifeExpectancyYears: Math.round(lifeExpectancy(body.startAge, body.sex ?? 'male') * 100) / 100, curveDate: latest.date },
      };
    },
  },
  {
    method: 'GET',
    path: '/api/v1/macro',
    group: 'live',
    scope: 'calc:read',
    summary: 'Inflation, Treasury yields, curve spread and the implied real yield.',
    handler: async () => {
      const [cpi, tenYear, twoYear, breakeven, curve] = await Promise.all([
        calibration.fred.yearOverYear('CPIAUCSL'),
        calibration.fred.latest('DGS10'),
        calibration.fred.latest('DGS2'),
        calibration.fred.latest('T10YIE'),
        calibration.treasury.latestCurve(),
      ]);
      return {
        status: 200,
        body: {
          inflation: { seriesId: 'CPIAUCSL', latestYoyPct: round2(cpi.value.at(-1)?.yoyPct ?? 0), asOf: cpi.provenance.asOf, provenance: cpi.provenance },
          rates: {
            tenYearPct: tenYear.value.value,
            twoYearPct: twoYear.value.value,
            breakeven10yPct: breakeven.value.value,
            realYield10yPct: round2((tenYear.value.value ?? 0) - (breakeven.value.value ?? 0)),
            spread10y2yPct: curve.spread10y2y?.value ?? null,
            inverted: (curve.spread10y2y?.value ?? 1) < 0,
            curveDate: curve.latest.date,
          },
          provenance: { curve: curve.curve.provenance },
        },
      };
    },
  },

  // ---- Trust gates ----------------------------------------------------------
  {
    method: 'POST',
    path: '/api/v1/suitability/assess',
    group: 'calc',
    scope: 'advice:write',
    summary: 'Deterministic suitability gate. Missing evidence blocks client delivery.',
    requestSchema: {
      type: 'object',
      required: ['clientAge', 'riskTolerance', 'horizonYears', 'equityWeight', 'stressYearLoss'],
      properties: {
        clientAge: { type: 'number' },
        riskTolerance: { type: 'string', enum: ['conservative', 'moderate', 'aggressive'] },
        horizonYears: { type: 'number' },
        equityWeight: { type: 'number' },
        illiquidShare: { type: 'number' },
        totalCostRatio: { type: 'number' },
        stressYearLoss: { type: 'number' },
        hasEmergencyReserve: { type: 'boolean', nullable: true },
        fundedRatio: { type: 'number', nullable: true },
        concentrationAcknowledged: { type: 'boolean', nullable: true },
        vulnerability: { type: 'boolean' },
        products: { type: 'array', items: { type: 'string' } },
      },
    },
    handler: async (ctx) => {
      const facts = await ctx.body<PlanFacts>();
      const d = assessSuitability(facts);
      // Persist the decision, not just the verdict — an assessment a reviewer cannot
      // reconstruct later is not evidence (gap 10).
      ledger.append({
        action: 'advice.ai.reviewed',
        actor: ctx.claims?.sub ?? 'system:anonymous',
        subject: (facts as unknown as { subject?: string }).subject ?? 'plan:unspecified',
        anchors: { verdict: d.value.verdict, blocking: d.value.blockingCount, rules: DEFAULT_RULES.length },
        payload: { facts },
      });
      metrics.ledgerAppends.inc({ kind: 'suitability' });
      return { status: 200, body: envelope(d) };
    },
  },
  {
    method: 'POST',
    path: '/api/v1/anomaly/assess',
    group: 'calc',
    scope: 'calc:read',
    summary: 'Explainable action-risk score for elder-exploitation and authority misuse.',
    requestSchema: {
      type: 'object',
      required: ['action', 'context'],
      properties: {
        action: { type: 'object' },
        context: { type: 'object' },
        history: { type: 'array', items: { type: 'object' } },
      },
    },
    handler: async (ctx) => {
      const body = await ctx.body<{ action: PlanningAction; context: ClientContext; history?: PlanningAction[] }>();
      const d = assessAction(body.action, body.context, body.history ?? []);
      if (d.value.band !== 'low') {
        ledger.append({
          action: 'plan.stage.advanced',
          actor: ctx.claims?.sub ?? 'system:anonymous',
          subject: `action:${body.action.id}`,
          anchors: { band: d.value.band, score: d.value.score, recommendation: d.value.recommendedAction },
          payload: { action: body.action },
        });
        metrics.ledgerAppends.inc({ kind: 'anomaly' });
      }
      return { status: 200, body: envelope(d) };
    },
  },

  // ---- Disclosure Watch -----------------------------------------------------
  {
    method: 'POST',
    path: '/api/v1/disclosure-watch',
    group: 'watch',
    scope: 'calc:read',
    summary: 'Recent SEC filings and risk-language hits for a list of tickers.',
    requestSchema: {
      type: 'object',
      required: ['tickers'],
      properties: {
        tickers: { type: 'array', items: { type: 'string' } },
        lookbackDays: { type: 'number' },
        forms: { type: 'array', items: { type: 'string' } },
        phrases: { type: 'array', items: { type: 'string' } },
      },
    },
    handler: async (ctx) => {
      const body = await ctx.body<{ tickers: string[]; lookbackDays?: number; forms?: string[]; phrases?: string[] }>();
      const d = await watch.run(body);
      metrics.watcherRuns.inc({ result: 'ok' });
      return { status: 200, body: envelope(d) };
    },
  },


  // ---- Partner formulas (F11) ----------------------------------------------
  {
    method: 'POST',
    path: '/api/v1/partners/formulas',
    group: 'calc',
    scope: 'admin',
    summary: 'Register a partner calculator. The formula is compiled and validated at submission time.',
    requestSchema: {
      type: 'object',
      required: ['id', 'description', 'expression', 'variables'],
      properties: {
        id: { type: 'string' },
        description: { type: 'string' },
        expression: { type: 'string', description: 'Arithmetic only: numbers, declared variables, + - * / % ^, min max abs round floor ceil clamp' },
        variables: { type: 'object' },
      },
    },
    handler: async (ctx) => {
      const spec = await ctx.body<FormulaSpec>();
      const compiled = Formula.compile(spec);
      formulas.set(spec.id, compiled);
      ledger.append({
        action: 'plan.evidence.attached',
        actor: ctx.claims?.sub ?? 'system',
        subject: `formula:${spec.id}`,
        anchors: { expression: spec.expression, variables: Object.keys(spec.variables).join(',') },
      });
      return { status: 201, body: { id: spec.id, compiled: true, variables: Object.keys(spec.variables), limits: compiled.limits } };
    },
  },
  {
    method: 'GET',
    path: '/api/v1/partners/formulas',
    group: 'calc',
    scope: 'calc:read',
    summary: 'List registered partner formulas with their declared variables.',
    handler: async () => ({
      status: 200,
      body: {
        formulas: [...formulas.values()].map((f) => ({ id: f.spec.id, description: f.spec.description, expression: f.spec.expression, variables: f.spec.variables })),
      },
    }),
  },
  {
    method: 'POST',
    path: '/api/v1/partners/formulas/:id/evaluate',
    group: 'calc',
    scope: 'calc:read',
    summary: 'Evaluate a registered formula against declared inputs, returning the trace.',
    requestSchema: { type: 'object', properties: { inputs: { type: 'object' } } },
    handler: async (ctx) => {
      const formula = formulas.get(ctx.params.id ?? '');
      if (!formula) throw Object.assign(new Error(`no registered formula "${ctx.params.id}"`), { status: 404, code: 'not_found' });
      const body = await ctx.body<{ inputs?: Record<string, number> }>();
      return { status: 200, body: envelope(formula.evaluate(body.inputs ?? {})) };
    },
  },

  // ---- Cross-firm benchmarks (F9) ------------------------------------------
  {
    method: 'POST',
    path: '/api/v1/benchmarks/publish',
    group: 'watch',
    scope: 'admin',
    summary: 'Publish a differentially private cross-firm benchmark, or refuse if too few firms participate.',
    requestSchema: {
      type: 'object',
      required: ['metric', 'firms'],
      properties: {
        metric: { type: 'string' },
        firms: { type: 'array', items: { type: 'object' } },
        minFirms: { type: 'number' },
        minClientsPerFirm: { type: 'number' },
        epsilon: { type: 'number' },
        clipLow: { type: 'number' },
        clipHigh: { type: 'number' },
      },
    },
    handler: async (ctx) => {
      const body = await ctx.body<{
        metric: string;
        firms: Array<{ firmId: string; value: number; n: number }>;
        minFirms?: number;
        minClientsPerFirm?: number;
        epsilon?: number;
        clipLow?: number;
        clipHigh?: number;
      }>();
      const result = publishBenchmark(body.metric, body.firms, benchmarkBudget, {
        minFirms: body.minFirms ?? 5,
        minClientsPerFirm: body.minClientsPerFirm ?? 25,
        epsilon: body.epsilon ?? 0.5,
        clip: { low: body.clipLow ?? 0, high: body.clipHigh ?? 100 },
        seed: 20_261_108,
      });
      return { status: 200, body: { ...envelope(result), budget: { total: benchmarkBudget.total, spent: benchmarkBudget.spent, remaining: benchmarkBudget.remaining } } };
    },
  },
  {
    method: 'GET',
    path: '/api/v1/benchmarks/budget',
    group: 'calc',
    scope: 'calc:read',
    summary: 'Privacy budget consumed and remaining for this reporting period.',
    handler: async () => ({
      status: 200,
      body: { total: benchmarkBudget.total, spent: benchmarkBudget.spent, remaining: benchmarkBudget.remaining },
    }),
  },

  // ---- Ledger ---------------------------------------------------------------
  {
    method: 'POST',
    path: '/api/v1/ledger/entries',
    group: 'ledger',
    scope: 'ledger:write',
    summary: 'Append an evidence entry. Payloads are hashed, never stored.',
    requestSchema: {
      type: 'object',
      required: ['action', 'subject'],
      properties: {
        action: { type: 'string' },
        subject: { type: 'string' },
        anchors: { type: 'object' },
        payload: {},
        supersedes: { type: 'string' },
      },
    },
    handler: async (ctx) => {
      const body = await ctx.body<{
        action: Parameters<EvidenceLedger['append']>[0]['action'];
        subject: string;
        anchors?: Record<string, string | number | boolean | null>;
        payload?: unknown;
        supersedes?: string;
      }>();
      const entry = ledger.append({ ...body, actor: ctx.claims?.sub ?? 'system:anonymous' });
      metrics.ledgerAppends.inc({ kind: 'manual' });
      return { status: 201, body: { entry, headHash: ledger.head?.hash ?? null, length: ledger.length } };
    },
  },
  {
    method: 'GET',
    path: '/api/v1/ledger/head',
    group: 'ledger',
    scope: 'ledger:read',
    summary: 'Current head, entry count and live chain verification.',
    handler: async () => ({
      status: 200,
      body: { head: ledger.head ?? null, length: ledger.length, ledgerId: ledger.ledgerId, verification: ledger.verify(), store: ledger.store.health() },
    }),
  },
  {
    method: 'GET',
    path: '/api/v1/ledger/export',
    group: 'ledger',
    scope: 'ledger:read',
    summary: 'Full signed bundle, verifiable offline.',
    handler: async () => ({ status: 200, body: ledger.exportBundle() }),
  },
  {
    method: 'GET',
    path: '/api/v1/ledger/public-key',
    group: 'ledger',
    publicRoute: true,
    summary: 'Ed25519 public key used to authenticate exported bundles.',
    handler: async () => ({ status: 200, body: { algorithm: 'ed25519', publicKeyPem: ledger.publicKeyPem } }),
  },
  {
    method: 'POST',
    path: '/api/v1/ledger/verify',
    group: 'ledger',
    scope: 'ledger:read',
    summary: 'Verify a bundle (optionally against a public key) without trusting this server.',
    requestSchema: { type: 'object', required: ['bundle'], properties: { bundle: { type: 'object' }, publicKeyPem: { type: 'string' } } },
    handler: async (ctx) => {
      const body = await ctx.body<{ bundle: Parameters<typeof verifyBundle>[0]; publicKeyPem?: string }>();
      return { status: 200, body: verifyBundle(body.bundle, body.publicKeyPem) };
    },
  },
  {
    method: 'GET',
    path: '/api/v1/ledger/subject/:subject',
    group: 'ledger',
    scope: 'ledger:read',
    summary: 'Subject-scoped sub-chain for a client file.',
    handler: async (ctx) => {
      const bundle = extractSubChain(ledger.exportBundle(), ctx.params.subject ?? '');
      // Sign the detached head so the client file is authentic on its own, not merely
      // internally consistent.
      bundle.signature = cryptoSign(null, Buffer.from(bundle.headHash, 'utf8'), signing.privateKeyPem).toString('base64');
      return { status: 200, body: { ...bundle, verification: verifyBundle(bundle, signing.publicKeyPem) } };
    },
  },

  // ---- Authorisation graph --------------------------------------------------
  {
    method: 'POST',
    path: '/api/v1/authz/tuples',
    group: 'ledger',
    scope: 'authz:write',
    summary: 'Grant a relationship (user→firm, firm→household, household→document).',
    requestSchema: {
      type: 'object',
      required: ['subject', 'relation', 'object'],
      properties: {
        subject: { type: 'string' },
        relation: { type: 'string', enum: ['member', 'serves', 'parent', 'viewer', 'editor', 'owner'] },
        object: { type: 'string' },
      },
    },
    handler: async (ctx) => {
      const tuple = await ctx.body<{ subject: string; relation: 'member' | 'serves' | 'parent' | 'viewer' | 'editor' | 'owner'; object: string }>();
      authz.add(tuple);
      ledger.append({
        action: 'plan.authorization.granted',
        actor: ctx.claims?.sub ?? 'system:anonymous',
        subject: tuple.object,
        anchors: { grantee: tuple.subject, relation: tuple.relation },
      });
      return { status: 201, body: { tuple, size: authz.size } };
    },
  },
  {
    method: 'POST',
    path: '/api/v1/authz/check',
    group: 'calc',
    scope: 'authz:read',
    summary: 'Check one relationship, returning the traversal that justified the answer.',
    requestSchema: {
      type: 'object',
      required: ['subject', 'relation', 'object'],
      properties: {
        subject: { type: 'string' },
        relation: { type: 'string' },
        object: { type: 'string' },
      },
    },
    handler: async (ctx) => {
      const body = await ctx.body<{ subject: string; relation: 'member' | 'serves' | 'parent' | 'viewer' | 'editor' | 'owner'; object: string }>();
      return { status: 200, body: authz.check(body.subject, body.relation, body.object) };
    },
  },
  {
    method: 'GET',
    path: '/api/v1/authz/objects/:subject',
    group: 'calc',
    scope: 'authz:read',
    summary: 'Objects of a type the subject may view (e.g. their client households).',
    handler: async (ctx) => {
      const objects = authz.listObjects(ctx.params.subject ?? '', 'viewer', 'household');
      return { status: 200, body: { subject: ctx.params.subject, relation: 'viewer', type: 'household', objects } };
    },
  },

  // ---- Attestations ---------------------------------------------------------
  {
    method: 'POST',
    path: '/api/v1/attestations',
    group: 'ledger',
    scope: 'admin',
    summary: 'Issue a signed threshold claim (e.g. assets ≥ X) without disclosing the value.',
    requestSchema: {
      type: 'object',
      required: ['subject', 'predicate', 'asOf', 'expiresAt'],
      properties: {
        subject: { type: 'string' },
        predicate: { type: 'string' },
        threshold: { type: 'number' },
        asOf: { type: 'string' },
        expiresAt: { type: 'string' },
        evidence: { type: 'array', items: { type: 'string' } },
        value: { type: 'number', description: 'Optional: commit to this value so it can be selectively revealed later' },
      },
    },
    handler: async (ctx) => {
      const body = await ctx.body<Claim & { value?: number }>();
      const commitment = typeof body.value === 'number' ? commit(body.value) : undefined;
      const claim: Claim = {
        subject: body.subject,
        predicate: body.predicate,
        ...(body.threshold !== undefined ? { threshold: body.threshold } : {}),
        asOf: body.asOf,
        expiresAt: body.expiresAt,
        issuer: ctx.claims?.sub ?? 'system',
        evidence: body.evidence ?? [],
        ...(commitment ? { commitment: commitment.commitment } : {}),
        nonDisclosure: ['account balances', 'institution names', 'account numbers', 'transaction history'],
      };
      const d = attest(claim, attestationKeys.privateKey);
      ledger.append({
        action: 'plan.evidence.verified',
        actor: ctx.claims?.sub ?? 'system',
        subject: claim.subject,
        anchors: { predicate: claim.predicate, threshold: claim.threshold ?? null, expiresAt: claim.expiresAt },
        payload: { claim },
      });
      return { status: 201, body: { ...envelope(d), salt: commitment?.salt ?? null, publicKeyPem: attestationKeys.publicKey } };
    },
  },
  {
    method: 'GET',
    path: '/api/v1/attestations/public-key',
    group: 'ledger',
    publicRoute: true,
    summary: 'Public key that verifies issued attestations.',
    handler: async () => ({ status: 200, body: { algorithm: 'ed25519', publicKeyPem: attestationKeys.publicKey } }),
  },
  {
    method: 'GET',
    path: '/api/v1/attestations/jwks',
    group: 'ledger',
    publicRoute: true,
    summary: 'JWK Set for attestation verification, so keys are discoverable rather than handed over out of band.',
    handler: async () => ({
      status: 200,
      body: { keys: [toJwk(attestationKeys.publicKey)], issuer: 'fiduciary-os', keyId: keyId(attestationKeys.publicKey) },
    }),
  },
  {
    method: 'POST',
    path: '/api/v1/attestations/verify',
    group: 'calc',
    scope: 'calc:read',
    summary: 'Verify an attestation and, optionally, reveal a committed value.',
    requestSchema: {
      type: 'object',
      required: ['attestation'],
      properties: { attestation: { type: 'object' }, value: { type: 'number' }, salt: { type: 'string' } },
    },
    handler: async (ctx) => {
      const body = await ctx.body<{ attestation: Parameters<typeof verifyAttestation>[0]; value?: number; salt?: string }>();
      const result = verifyAttestation(body.attestation, attestationKeys.publicKey);
      const commitmentOk =
        typeof body.value === 'number' && body.salt && result.claim?.commitment
          ? verifyCommitment(result.claim.commitment, body.value, body.salt)
          : null;
      return { status: 200, body: { ...result, commitmentVerified: commitmentOk } };
    },
  },

  // ---- Vault ----------------------------------------------------------------
  {
    method: 'POST',
    path: '/api/v1/vault/documents',
    group: 'ledger',
    scope: 'admin',
    summary: 'Seal a document with envelope encryption (AES-256-GCM + wrapped data key).',
    requestSchema: {
      type: 'object',
      required: ['id', 'contentBase64'],
      properties: { id: { type: 'string' }, contentBase64: { type: 'string' }, meta: { type: 'object' } },
    },
    handler: async (ctx) => {
      const body = await ctx.body<{ id: string; contentBase64: string; meta?: Record<string, string> }>();
      const doc = vault.put(body.id, Buffer.from(body.contentBase64, 'base64'), body.meta ?? {});
      ledger.append({
        action: 'plan.evidence.attached',
        actor: ctx.claims?.sub ?? 'system',
        subject: `document:${doc.id}`,
        anchors: { bytes: doc.bytes, keyVersion: doc.wrappedDek.keyVersion },
        payload: { id: doc.id, sha: doc.content.ciphertext.slice(0, 64) },
      });
      return { status: 201, body: { id: doc.id, bytes: doc.bytes, keyVersion: doc.wrappedDek.keyVersion, createdAt: doc.createdAt } };
    },
  },
  {
    method: 'GET',
    path: '/api/v1/vault/documents',
    group: 'calc',
    scope: 'admin',
    summary: 'List sealed documents (metadata only; never content).',
    handler: async () => ({ status: 200, body: { documents: vault.list(), integrity: vault.integrityCheck() } }),
  },
  {
    method: 'POST',
    path: '/api/v1/vault/rotate',
    group: 'ledger',
    scope: 'admin',
    summary: 'Rotate the key-encryption key and re-wrap every data key.',
    handler: async () => {
      const rotated = vaultKeyring instanceof HttpKeyring
        ? (await vaultKeyring.rotateRemote(), vault.rewrapAll())
        : vault.rotateKey();
      ledger.append({
        action: 'data.exported',
        actor: 'system:key-rotation',
        subject: 'vault:all',
        anchors: { rewrapped: rotated.rewrapped, toVersion: rotated.toVersion },
      });
      return { status: 200, body: rotated };
    },
  },
];

// ---- HTTP plumbing ----------------------------------------------------------
export function requestHandler(req: IncomingMessage, res: ServerResponse): void {
  void (async () => {
    const started = Date.now();
    const requestId = req.headers['x-request-id']?.toString() ?? randomUUID();
    res.setHeader('x-request-id', requestId);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = (req.method ?? 'GET') as 'GET' | 'POST';
    let routeLabel = `${method} ${path}`;

    try {
      if (method === 'GET' && serveUi(path, res)) {
        metrics.requests.inc({ route: 'ui', method, status: '200' });
        return;
      }
      const route = routes.find((r) => r.method === method && matchPath(r.path, path) !== null);
      if (!route) {
        metrics.requests.inc({ route: 'unmatched', status: '404' });
        return send(res, 404, { error: { code: 'not_found', message: `No route for ${method} ${path}` }, requestId });
      }
      routeLabel = `${route.method} ${route.path}`;

      const params = matchPath(route.path, path) ?? {};
      let claims = null;
      if (!route.publicRoute) {
        try {
          claims = authenticate(req.headers.authorization);
          const status = revocation.check(claims);
          if (status.revoked) throw new AuthError('this token has been revoked', 401, status.reason ?? 'token_revoked');
          if (route.scope) requireScope(claims, route.scope);
        } catch (err) {
          const authErr = err as AuthError;
          metrics.authFailures.inc({ reason: authErr.code ?? 'unknown' });
          throw authErr;
        }
      }

      const decision = limiter.check(claims?.sub ?? clientKey(req), route.group);
      res.setHeader('x-ratelimit-limit', String(decision.limit));
      res.setHeader('x-ratelimit-remaining', String(decision.remaining));
      if (!decision.allowed) {
        metrics.rateLimited.inc({ route: route.path });
        res.setHeader('retry-after', String(decision.retryAfterSeconds));
        throw Object.assign(new Error(`rate limit exceeded; retry in ${decision.retryAfterSeconds}s`), { status: 429, code: 'rate_limited' });
      }

      const ctx: RouteContext = {
        req,
        url,
        params,
        claims: claims ? { sub: claims.sub, scopes: claims.scopes, ...(claims.firm ? { firm: claims.firm } : {}) } : null,
        body: <T>() => readJson<T>(req),
      };

      const result = await route.handler(ctx);
      if (result.body && typeof result.body === 'object' && '__raw' in result.body) {
        res.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8');
        res.statusCode = result.status;
        res.end(String((result.body as { __raw: string }).__raw));
      } else {
        send(res, result.status, result.body);
      }
      metrics.requests.inc({ route: route.path, method: route.method, status: String(result.status) });
    } catch (err) {
      const mapped = mapError(err);
      send(res, mapped.status, { error: { code: mapped.code, message: mapped.message, detail: mapped.detail }, requestId });
      metrics.requests.inc({ route: routeLabel, status: String(mapped.status) });
    } finally {
      const ms = Date.now() - started;
      metrics.latency.observe(ms, { route: routeLabel });
      logLine(requestId, method, path, res.statusCode, ms);
    }
  })();
}

function clientKey(req: IncomingMessage): string {
  return `ip:${req.socket.remoteAddress ?? 'unknown'}`;
}

function logLine(requestId: string, method: string, path: string, status: number, ms: number): void {
  process.stdout.write(
    `${JSON.stringify({ level: status >= 500 ? 'error' : 'info', msg: 'request', requestId, method, path, status, ms })}\n`,
  );
}

export function start(port = PORT): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const s = createServer(requestHandler);
    s.listen(port, '127.0.0.1', () => {
      const address = s.address();
      const actual = typeof address === 'object' && address ? address.port : port;
      void warmUp().catch(() => undefined);
      resolve({
        port: actual,
        close: () => new Promise<void>((done) => s.close(() => done())),
      });
    });
  });
}

function envelope<T>(d: { value: T; provenance: unknown }): { data: T; provenance: unknown } {
  return { data: d.value, provenance: d.provenance };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('request body too large'), { status: 413, code: 'payload_too_large' });
    chunks.push(chunk as Buffer);
  }
  if (size === 0) throw Object.assign(new Error('request body is required'), { status: 400, code: 'bad_request' });
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
  } catch {
    throw Object.assign(new Error('request body is not valid JSON'), { status: 400, code: 'bad_request' });
  }
}

function mapError(err: unknown): { status: number; code: string; message: string; detail?: string } {
  if (err instanceof AuthError) return { status: err.status, code: err.code, message: err.message };
  if (err instanceof BenchmarkSuppressedError) return { status: 422, code: err.code, message: err.message };
  if (err instanceof PrivacyBudgetExhaustedError) return { status: 429, code: err.code, message: err.message };
  if (err instanceof FormulaError) return { status: 422, code: 'invalid_formula', message: err.message };
  if (err instanceof CircuitOpenError) {
    return { status: 503, code: 'upstream_circuit_open', message: 'A data provider is unavailable; retry shortly.', detail: err.message };
  }
  if (err instanceof UpstreamError) {
    return { status: err.status >= 500 ? 502 : err.status, code: 'upstream_error', message: 'A data provider returned an error.', detail: err.message };
  }
  const anyErr = err as { status?: number; code?: string; message?: string; name?: string };
  if (anyErr?.name === 'PlaceholderInProductionError') {
    return { status: 503, code: 'data_unavailable', message: anyErr.message ?? 'Data is unavailable in this environment.' };
  }
  if (anyErr?.status && anyErr?.code) {
    return { status: anyErr.status, code: anyErr.code, message: anyErr.message ?? 'Bad request' };
  }
  if (err instanceof RangeError) return { status: 422, code: 'invalid_input', message: err.message };
  return { status: 500, code: 'internal_error', message: 'Unexpected server error', detail: (err as Error)?.message };
}

function dataSourcesReport() {
  return {
    generatedAt: new Date().toISOString(),
    production: isProduction(),
    policy: {
      liveDataRequiredInProduction: true,
      placeholderBehaviour: 'HTTP 503 with an explicit message; never a fabricated value',
      provenanceOnEveryValue: true,
      authentication: 'scoped HS256 bearer tokens; token issuing disabled in production',
      rateLimiting: 'token bucket per subject and route group',
    },
    sources: [
      { id: 'fred', name: 'Federal Reserve Bank of St. Louis (FRED)', url: 'https://fred.stlouisfed.org/', auth: 'none', license: 'Public domain (US Government work)', backs: ['CPI inflation', 'Treasury yields', 'breakeven inflation', 'long-history equity index (Nasdaq Composite)', 'unemployment'], freshness: 'daily to monthly per series', fallback: 'BLS public API for CPI; Treasury Fiscal Data for rates', notes: 'Multi-series requests return a ZIP, so each series is fetched individually.' },
      { id: 'treasury', name: 'US Department of the Treasury', url: 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates', auth: 'none', license: 'Public domain (US Government work)', backs: ['par yield curve for annuity discounting', 'average interest rates on federal debt'], freshness: 'daily', fallback: 'FRED constant-maturity series', notes: 'The annual curve CSV is generated on demand (17-20s cold); cached 24h with a 45-day stale tolerance and warmed at boot.' },
      { id: 'sec-edgar', name: 'SEC EDGAR', url: 'https://www.sec.gov/edgar/sec-api-documentation', auth: 'none (descriptive User-Agent required)', license: 'Public filings; fair-access rate limit of 10 req/s', backs: ['filing history', 'XBRL fundamentals', 'disclosure full-text monitoring', 'ticker to CIK resolution'], freshness: 'real time on filing', fallback: 'none — primary source', notes: 'Set SEC_USER_AGENT with a real contact address before production use.' },
      { id: 'bls', name: 'Bureau of Labor Statistics', url: 'https://www.bls.gov/developers/', auth: 'optional key raises limits', license: 'Public domain (US Government work)', backs: ['CPI series with publication vintage'], freshness: 'monthly', fallback: 'FRED', notes: 'Returns HTTP 200 with a failure status; treated as a data error, not a transport error.' },
      { id: 'coingecko', name: 'CoinGecko', url: 'https://www.coingecko.com/en/api', auth: 'none on free tier', license: 'Attribution required; no redistribution as a feed', backs: ['crypto prices'], freshness: 'real time (rate limited)', fallback: 'none', notes: 'Free tier is aggressively rate limited; cache 60s and never fan out per user request.' },
      { id: 'nasdaq', name: 'Nasdaq public quote endpoint', url: 'https://api.nasdaq.com/api/quote/SPY/info?assetclass=etf', auth: 'none', license: 'Delayed data; display attribution required; not licensed for redistribution', backs: ['equity and ETF quotes'], freshness: 'delayed', fallback: 'Yahoo chart endpoint', notes: 'Undocumented and unreliable (observed 45s timeout). Treated as display-only with explicit timeliness labelling.' },
      { id: 'ssa', name: 'Social Security Administration — period life table', url: 'https://www.ssa.gov/oact/STATS/table4c6.html', auth: 'n/a (bundled)', license: 'Public domain (US Government work)', backs: ['mortality for annuity factors and life expectancy'], freshness: 'annual, with the Trustees Report', fallback: 'n/a', notes: 'ssa.gov returns 403 to automated clients, so the table is shipped as a versioned artefact with its citation.' },
      { id: 'irs', name: 'Internal Revenue Service — Revenue Procedures', url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf', auth: 'n/a (bundled)', license: 'Public domain (US Government work)', backs: ['federal brackets, deductions, LTCG, NIIT, AMT, CTC for 2025 and 2026'], freshness: 'annual', fallback: 'n/a', notes: 'Tax years are released artefacts. The engine refuses an unsupported year rather than interpolating.' },
    ],
    health: httpClient.health(),
    cache: { kind: httpClient.cache.kind, ...httpClient.cacheStats() },
    ledger: { ...ledger.store.health(), verified: ledger.verify().valid },
  };
}

// Auto-start only when executed directly (`node src/server.ts`), never on import.
const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  void start(PORT).then(({ port }) => {
    process.stdout.write(`${JSON.stringify({ level: 'info', msg: 'listening', port, production: isProduction() })}\n`);
  });
}

export { routes, ledger, authz, vault, watch, calibration };
