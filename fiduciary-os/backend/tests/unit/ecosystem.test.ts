import express from 'express';
import request from 'supertest';
import { trustRouter, normalizeShapBasisPoints } from '../../src/routes/trust';
import { intelligenceRouter } from '../../src/routes/intelligence';
import { advisorRouter } from '../../src/routes/advisor';
import { deterministicEmbed, cosineSimilarity } from '../../src/services/embeddingService';
import { analyzeDocument } from '../../src/services/documentVaultService';

jest.mock('../../src/config/redis', () => ({
  getRedis: () => ({ ping: jest.fn().mockResolvedValue('PONG') }),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/trust', trustRouter);
  app.use('/api/v1/intelligence', intelligenceRouter);
  app.use('/api/v1/advisor', advisorRouter);
  return app;
}

describe('Ecosystem Integration — Phases 1 to 5', () => {
  const app = buildApp();

  describe('Phase 1: Trust + Compliance (MASTERNEX + SHAP)', () => {
    it('normalizes SHAP basis points to sum strictly to 10,000 bps', () => {
      const bps = normalizeShapBasisPoints({
        savings_rate_contrib: 0.373,
        employer_match_contrib: 0.181,
        low_fee_index_benefit: 0.229,
        tax_deferral_compounding: 0.144,
      });
      const sum = Object.values(bps).reduce((a, b) => a + b, 0);
      expect(sum).toBe(10000);
    });

    it('POST /api/v1/trust/evaluate redacts PII and verifies 10,000-bps SHAP receipt', async () => {
      const res = await request(app)
        .post('/api/v1/trust/evaluate')
        .send({
          explanationText: 'Educational projection for jane@example.com (SSN 123-45-6789): compare low-cost indexing.',
          savingsRateContrib: 0.4,
          employerMatchContrib: 0.2,
          lowFeeIndexBenefit: 0.25,
          taxDeferralCompounding: 0.15,
        });

      expect(res.status).toBe(200);
      expect(res.body.piiRedacted).toBe(true);
      expect(res.body.piiRedactedCount).toBe(2);
      expect(res.body.redactedText).toContain('[REDACTED_EMAIL]');
      expect(res.body.redactedText).toContain('[REDACTED_SSN]');
      expect(res.body.shapSumBps).toBe(10000);
      expect(res.body.additivityVerified).toBe(true);
      expect(res.body.receipt.signatureScheme).toBe('Ed25519+ML-DSA-87');
    });

    it('GET /api/v1/trust/compliance returns EU AI Act Art. 12 + SR 11-7 certificate', async () => {
      const res = await request(app).get('/api/v1/trust/compliance');
      expect(res.status).toBe(200);
      expect(res.body.certificateId).toMatch(/^CERT-/);
      expect(res.body.frameworks.eu_ai_act_article_12_logging).toBe(true);
      expect(res.body.frameworks.sr_11_7_model_inventory).toBe(true);
      expect(res.body.metrics.merkleRoot).toHaveLength(64);
    });

    it('GET /api/v1/trust/status reports trust-core MCP server, post-quantum scheme, and no masternex service', async () => {
      const res = await request(app).get('/api/v1/trust/status');
      expect(res.status).toBe(200);
      expect(res.body.postQuantumSignature).toBe('Ed25519+ML-DSA-87');
      expect(res.body.services.masternex).toBeUndefined();
      expect(res.body.mcpServers).toHaveLength(1);
      expect(res.body.mcpServers[0].name).toBe('trust-core');
    });
  });

  describe('Phase 2 & 4: Embeddings, Document Intelligence, Nature Research & PRINCE', () => {
    it('computes deterministic normalized 1536-dim embeddings with high self-similarity', () => {
      const a = deterministicEmbed('Roth conversion tax bracket strategy for retirement');
      const b = deterministicEmbed('Roth conversion tax strategy retirement planning');
      const c = deterministicEmbed('Coastal municipal bond carbon transition risk');
      expect(a).toHaveLength(1536);
      expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, c));
    });

    it('POST /api/v1/intelligence/embed and /search power Natural-Language Plan Q&A', async () => {
      const idx = await request(app)
        .post('/api/v1/intelligence/embed')
        .send({
          entityType: 'planning_action',
          entityId: 'roth-2026',
          content: 'Decided to execute a $35,000 Roth conversion before age 65 to fill the 22% bracket.',
        });
      expect(idx.status).toBe(201);

      const search = await request(app)
        .post('/api/v1/intelligence/search')
        .send({ query: 'What did we decide about Roth conversion?', limit: 3 });
      expect(search.status).toBe(200);
      expect(search.body.results.length).toBeGreaterThan(0);
      expect(search.body.results[0].entityId).toBe('roth-2026');
    });

    it('classifies insurance documents and flags surrender-charge & promissory risks', async () => {
      const analysis = await analyzeDocument({
        filename: 'variable-annuity-policy.pdf',
        content: 'Policy #VA-99210 includes a 7% surrender charge and promises guaranteed return with M&E fee of 1.35% on $250,000.',
      });
      expect(analysis.category).toBe('insurance_policy');
      expect(analysis.riskFlags.some((f) => f.category === 'liquidity_lockup')).toBe(true);
      expect(analysis.riskFlags.some((f) => f.category === 'misleading_claim')).toBe(true);
      expect(analysis.extractedTerms.dollarAmounts).toContain('$250,000');
      expect(analysis.vaultAnchor.sha256).toHaveLength(64);
    });

    it('POST /api/v1/intelligence/research/search returns Nature citations with Merkle provenance', async () => {
      const res = await request(app)
        .post('/api/v1/intelligence/research/search')
        .send({ query: 'longevity' });
      expect(res.status).toBe(200);
      expect(res.body.merkleProvenance).toHaveLength(64);
      expect(res.body.results.length).toBeGreaterThan(0);
    });

    it('POST /api/v1/intelligence/monte-carlo/regime returns calibrated percentile outcomes', async () => {
      const res = await request(app)
        .post('/api/v1/intelligence/monte-carlo/regime')
        .send({ initialPortfolio: 750000, annualWithdrawal: 38000, years: 25, regime: 'stagflation' });
      expect(res.status).toBe(200);
      expect(res.body.results.successProbabilityPct).toBeGreaterThanOrEqual(0);
      expect(res.body.results.p90TerminalBalance).toBeGreaterThanOrEqual(res.body.results.p50TerminalBalance);
    });

    it('POST /api/v1/intelligence/federated/pilot runs PRINCE Rényi-DP benchmark simulation', async () => {
      const res = await request(app)
        .post('/api/v1/intelligence/federated/pilot')
        .send({ institutions: 6, epsilon: 1.0, rounds: 5 });
      expect(res.status).toBe(200);
      expect(res.body.rawDataShared).toBe(false);
      expect(res.body.privacyGuarantee.glbaMinimized).toBe(true);
    });
  });

  describe('Phase 3: Advisor Command Center Productivity', () => {
    it('POST /api/v1/advisor/meeting-brief generates structured prep brief', async () => {
      const res = await request(app)
        .post('/api/v1/advisor/meeting-brief')
        .send({ clientName: 'Elena Vance', age: 58, retirementAge: 65, investableAssets: 920000 });
      expect(res.status).toBe(200);
      expect(res.body.brief.clientName).toBe('Elena Vance');
      expect(res.body.brief.agenda.length).toBeGreaterThanOrEqual(4);
    });

    it('POST /api/v1/advisor/triage-inquiry flags behavioral panic as high urgency', async () => {
      const res = await request(app)
        .post('/api/v1/advisor/triage-inquiry')
        .send({ subject: 'Market drop', message: 'Should I panic and sell everything today?' });
      expect(res.status).toBe(200);
      expect(res.body.urgency).toBe('high');
      expect(res.body.category).toBe('behavioral_risk_event');
    });

    it('POST /api/v1/advisor/client-report produces branded HTML report with SHAP & PQ receipt', async () => {
      const res = await request(app)
        .post('/api/v1/advisor/client-report')
        .send({ clientName: 'Elena Vance', portfolioValue: 920000, successRatePct: 88.2 });
      expect(res.status).toBe(200);
      expect(res.body.reportId).toMatch(/^RPT-/);
      expect(res.body.html).toContain('Ed25519+ML-DSA-87');
      expect(res.body.html).toContain('Elena Vance');
    });
  });
});
