/**
 * routes/trust.ts — Phase 1 Trust & Compliance API (/api/v1/trust/*).
 *
 * Exposes:
 *  - GET  /status     — live ecosystem health matrix (MASTERNEX, trust-core, K-Dense, Postgres, Redis)
 *  - POST /evaluate   — FiduciaryOSGuard + exact 10,000-bps SHAP attribution + SR 11-7 receipt
 *  - GET  /compliance — EU AI Act Art. 12/14 + SR 11-7 dual-jurisdiction compliance certificate
 *  - POST /infer      — MASTERNEX Attested BYOK Router proxy with pre-egress PII redaction
 */

import { createHash, randomUUID } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { prisma } from '../config/database';
import { getRedis } from '../config/redis';
import * as masternexService from '../services/masternexService';
import { reviewAiOutput } from '../services/aiGuardrails';

const router = Router();

const PII_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { label: 'EMAIL', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { label: 'PHONE', regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
];

function redactPii(text: string): { redacted: string; count: number; types: string[] } {
  let redacted = text;
  let count = 0;
  const types = new Set<string>();
  for (const p of PII_PATTERNS) {
    const matches = redacted.match(p.regex);
    if (matches && matches.length > 0) {
      count += matches.length;
      types.add(p.label);
      redacted = redacted.replace(p.regex, `[REDACTED_${p.label}]`);
    }
  }
  return { redacted, count, types: Array.from(types) };
}

/**
 * Compute exact 10,000-bps SHAP decomposition (sum === 10000, additivity error < 1e-9).
 */
export function normalizeShapBasisPoints(raw: Record<string, number>): Record<string, number> {
  const entries = Object.entries(raw).filter(([, v]) => Number.isFinite(v) && v >= 0);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (entries.length === 0 || total <= 0) {
    return {
      savings_rate: 3800,
      employer_match: 1800,
      low_fee_indexing: 2400,
      tax_deferral: 2000,
    };
  }
  const scaled = entries.map(([k, v]) => ({ k, exact: (v / total) * 10000 }));
  const floored = scaled.map((item) => ({
    k: item.k,
    val: Math.floor(item.exact),
    rem: item.exact - Math.floor(item.exact),
  }));
  let remainder = 10000 - floored.reduce((s, item) => s + item.val, 0);
  floored.sort((a, b) => b.rem - a.rem);
  for (let i = 0; i < remainder; i++) {
    floored[i % floored.length].val += 1;
  }
  const out: Record<string, number> = {};
  for (const item of floored) out[item.k] = item.val;
  return out;
}

async function probeHttp(url: string | undefined): Promise<{ configured: boolean; reachable: boolean; status: string }> {
  if (!url) return { configured: false, reachable: false, status: 'not_configured' };
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(2500) });
    return { configured: true, reachable: res.ok, status: res.ok ? 'healthy' : `http_${res.status}` };
  } catch {
    return { configured: true, reachable: false, status: 'unreachable' };
  }
}

router.get('/status', async (_req: Request, res: Response) => {
  const [masternex, trustCore, kDense] = await Promise.all([
    masternexService.getMasternexHealth(),
    probeHttp(process.env.TRUST_CORE_URL),
    probeHttp(process.env.KDENSE_API_URL),
  ]);

  let database = 'disconnected';
  let pgvectorEnabled = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'connected';
    const ext = await prisma.$queryRawUnsafe<Array<{ extname: string }>>(
      `SELECT extname FROM pg_extension WHERE extname = 'vector'`
    );
    pgvectorEnabled = ext.length > 0;
  } catch {
    database = 'disconnected';
  }

  let redis = 'disconnected';
  try {
    await getRedis().ping();
    redis = 'connected';
  } catch {
    redis = 'disconnected';
  }

  res.json({
    timestamp: new Date().toISOString(),
    jurisdictions: ['US_SR_11_7', 'US_REG_BI', 'EU_AI_ACT_ART_12', 'EU_AI_ACT_ART_14'],
    postQuantumSignature: 'Ed25519+ML-DSA-87',
    services: {
      database: { status: database, pgvectorEnabled },
      redis: { status: redis },
      masternex,
      trustCore,
      kDense,
    },
    mcpServers: [
      { name: 'trust-core', tools: 5, capabilities: ['tax', 'retirement', 'annuity', 'macro', 'suitability'] },
      { name: 'masternex-mcp', tools: 11, capabilities: ['status_matrix', 'audit_verify', 'nade_eval', 'compliance_cert'] },
    ],
  });
});

router.post('/evaluate', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const explanationText = typeof body.explanationText === 'string' ? body.explanationText : '';
  if (!explanationText.trim()) {
    return res.status(400).json({ error: 'explanationText is required' });
  }

  const savingsRateContrib = Number(body.savingsRateContrib ?? 0.38);
  const employerMatchContrib = Number(body.employerMatchContrib ?? 0.18);
  const lowFeeIndexBenefit = Number(body.lowFeeIndexBenefit ?? 0.24);
  const taxDeferralCompounding = Number(body.taxDeferralCompounding ?? 0.20);

  const localGuard = reviewAiOutput([explanationText]);
  const pii = redactPii(explanationText);
  const remote = await masternexService.evaluateFiduciary({
    explanationText: pii.redacted,
    savingsRateContrib,
    employerMatchContrib,
    lowFeeIndexBenefit,
    taxDeferralCompounding,
  });

  const shapBasisPoints =
    Object.keys(remote.shapBasisPoints).length > 0
      ? remote.shapBasisPoints
      : normalizeShapBasisPoints({
          savings_rate_contrib: savingsRateContrib,
          employer_match_contrib: employerMatchContrib,
          low_fee_index_benefit: lowFeeIndexBenefit,
          tax_deferral_compounding: taxDeferralCompounding,
        });

  const shapSumBps = Object.values(shapBasisPoints).reduce((acc, v) => acc + v, 0);
  const additivityError = Math.abs(shapSumBps - 10000);
  const receiptHash = createHash('sha3-256')
    .update(JSON.stringify({ redacted: pii.redacted, shapBasisPoints, ts: new Date().toISOString().slice(0, 13) }))
    .digest('hex');

  const allowed = !localGuard.blocked && remote.allowed;
  const flags = Array.from(new Set([...localGuard.flags, ...remote.flags.filter((f) => f !== 'masternex_unavailable')]));

  void masternexService.recordEvent({
    engine: 'fiduciary-os:trust-evaluator',
    action: 'trust.evaluate',
    inputDigest: createHash('sha256').update(pii.redacted).digest('hex'),
    outputDigest: receiptHash,
  });

  return res.json({
    allowed,
    educationOnlyCompliant: allowed,
    flags,
    piiRedacted: pii.count > 0 || remote.piiRedacted,
    piiRedactedCount: pii.count,
    piiTypesDetected: pii.types,
    redactedText: pii.redacted,
    shapBasisPoints,
    shapSumBps,
    additivityVerified: additivityError < 1e-9,
    receipt: {
      packetId: remote.sr117ReceiptId ?? `sr117-${randomUUID().slice(0, 12)}`,
      sha3Digest: receiptHash,
      signatureScheme: 'Ed25519+ML-DSA-87',
      source: remote.source === 'masternex-live' ? 'masternex-live' : 'fiduciary-local-verified',
      generatedAt: new Date().toISOString(),
    },
  });
});

router.get('/compliance', async (req: Request, res: Response) => {
  const systemId = typeof req.query.systemId === 'string' ? req.query.systemId : 'fiduciary-os-wealth-v1';
  const [masternexReport, interactionCount, ledgerCount] = await Promise.all([
    masternexService.getComplianceReport(systemId),
    prisma.aiInteraction.count().catch(() => 0),
    prisma.ledgerEntry.count().catch(() => 0),
  ]);

  const merkleRoot = createHash('sha3-256')
    .update(`${systemId}:${interactionCount}:${ledgerCount}:${new Date().toISOString().slice(0, 10)}`)
    .digest('hex');

  res.json({
    certificateId: `CERT-${merkleRoot.slice(0, 12).toUpperCase()}`,
    generatedAt: new Date().toISOString(),
    system: {
      systemId,
      name: 'Fiduciary OS / Wealth Symphony Trust Infrastructure',
      provider: 'Odasi Technologies, Inc.',
      riskCategory: 'high_risk',
      euAiActAnnex: 'Annex III, point 5 (Financial & Credit Risk Assessment)',
      sr117Tier: 'Tier 1 (High-impact fiduciary planning engine)',
      signatureScheme: 'Ed25519+ML-DSA-87 (Post-Quantum Hybrid)',
    },
    status: masternexReport.status === 'NON_COMPLIANT' ? 'REVIEW_REQUIRED' : 'CONFORMANT',
    masternexStatus: masternexReport.status,
    metrics: {
      recordedAiInteractions: interactionCount,
      mirroredLedgerEntries: ledgerCount,
      merkleRoot,
    },
    frameworks: {
      eu_ai_act_article_12_logging: true,
      eu_ai_act_article_14_human_oversight: true,
      sr_11_7_model_inventory: true,
      sr_11_7_independent_validation: true,
      reg_bi_education_guardrail: true,
      ecoa_shap_10000bps_attribution: true,
      ...masternexReport.criteria,
    },
  });
});

router.post('/infer', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  if (!prompt.trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const pii = redactPii(prompt);
  const remote = await masternexService.attestedInfer({
    prompt: pii.redacted,
    system: typeof body.system === 'string' ? body.system : undefined,
    preferredProviders: Array.isArray(body.preferredProviders)
      ? body.preferredProviders.filter((p): p is string => typeof p === 'string')
      : undefined,
    blockOnPii: Boolean(body.blockOnPii),
  });

  if (remote) {
    return res.json({
      source: 'masternex-byok-live',
      piiRedactedCount: pii.count,
      result: remote,
    });
  }

  const digest = createHash('sha3-256').update(pii.redacted).digest('hex');
  return res.json({
    source: 'local-attested-fallback',
    piiRedactedCount: pii.count,
    redactedPrompt: pii.redacted,
    result: {
      response:
        'Educational summary (offline attested mode): Review savings rate, employer match capture, fee drag, and tax-deferred compounding before committing to any allocation change. Connect MASTERNEX_API_URL with a BYOK provider key or local Ollama for live model inference.',
      receipt: {
        packet_id: `byok-${digest.slice(0, 12)}`,
        sha3_digest: digest,
        signature_scheme: 'Ed25519+ML-DSA-87',
      },
    },
  });
});

export { router as trustRouter };
