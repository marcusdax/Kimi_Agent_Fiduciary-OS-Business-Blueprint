/**
 * masternexService.ts — HTTP client for MASTERNEX.os APIs.
 *
 * All calls are env-gated: if MASTERNEX_API_URL is unset, every function
 * returns a safe default and logs nothing. This keeps dev stacks working
 * without MASTERNEX running.
 *
 * API surface (confirmed):
 *   GET  /health                        — service liveness
 *   POST /v1/auctum/fiduciary/evaluate  — FiduciaryOSGuard + 10,000-bps SHAP + SR 11-7 receipt
 *   POST /v1/auctum/insights/underwrite — AUCTUM.Insights property underwriting
 *   POST /v1/connectors/infer           — Attested BYOK router (PII redaction + PQ-signed receipt)
 *   POST /v1/connectors/academic/search — Nature, OpenAlex, arXiv, PubMed w/ Merkle provenance
 *   POST /v1/recorder/events            — AI Flight Recorder (scope: ledger:write)
 *   GET  /v1/compliance/report          — SR 11-7 + EU AI Act evaluation (scope: compliance:read)
 */

function getMasternexUrl(): string | null {
  return process.env.MASTERNEX_API_URL || null;
}

function getMasternexJwt(): string | null {
  return process.env.MASTERNEX_JWT || null;
}

function authHeaders(): Record<string, string> {
  const jwt = getMasternexJwt();
  return jwt
    ? { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

/**
 * Check MASTERNEX.os gateway health.
 */
export async function getMasternexHealth(): Promise<{
  configured: boolean;
  reachable: boolean;
  url: string | null;
  status: string;
}> {
  const url = getMasternexUrl();
  if (!url) {
    return { configured: false, reachable: false, url: null, status: 'not_configured' };
  }
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      return { configured: true, reachable: false, url, status: `http_${res.status}` };
    }
    return { configured: true, reachable: true, url, status: 'healthy' };
  } catch {
    return { configured: true, reachable: false, url, status: 'unreachable' };
  }
}

/**
 * FiduciaryOSGuard — education-only compliance gate + exact 10,000-bps SHAP receipt.
 * No JWT required on /v1/auctum/* routes.
 */
export async function evaluateFiduciary(params: {
  explanationText: string;
  savingsRateContrib?: number;
  employerMatchContrib?: number;
  lowFeeIndexBenefit?: number;
  taxDeferralCompounding?: number;
  authorizationSteps?: string[];
}): Promise<{
  allowed: boolean;
  flags: string[];
  piiRedacted: boolean;
  shapBasisPoints: Record<string, number>;
  sr117ReceiptId: string | null;
  source: 'masternex-live' | 'unconfigured' | 'fallback';
}> {
  const url = getMasternexUrl();
  if (!url) {
    return {
      allowed: true,
      flags: [],
      piiRedacted: false,
      shapBasisPoints: {},
      sr117ReceiptId: null,
      source: 'unconfigured',
    };
  }
  try {
    const body = {
      session: {
        explanation_text: params.explanationText,
        savings_rate_contrib: params.savingsRateContrib ?? 0.38,
        employer_match_contrib: params.employerMatchContrib ?? 0.18,
        low_fee_index_benefit: params.lowFeeIndexBenefit ?? 0.22,
        tax_deferral_compounding: params.taxDeferralCompounding ?? 0.14,
        authorization_steps: params.authorizationSteps ?? ['disclosure_ack', 'input_verified', 'simulation_run'],
      },
    };
    const res = await fetch(`${url}/v1/auctum/fiduciary/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return {
        allowed: true,
        flags: [`masternex_http_${res.status}`],
        piiRedacted: false,
        shapBasisPoints: {},
        sr117ReceiptId: null,
        source: 'fallback',
      };
    }
    const data = (await res.json()) as Record<string, unknown>;
    const guardrail = data.education_guardrail as Record<string, unknown> | undefined;
    const receipt = data.sr11_7_receipt as Record<string, unknown> | undefined;
    const rawPacketId = receipt?.packet_id ?? data.packet_id;
    const nestedPacketId =
      typeof rawPacketId === 'string'
        ? rawPacketId
        : typeof (rawPacketId as Record<string, unknown> | undefined)?.packet_id === 'string'
          ? ((rawPacketId as Record<string, unknown>).packet_id as string)
          : null;
    return {
      allowed: guardrail?.education_only_compliant !== false,
      flags: (guardrail?.violations as string[]) ?? [],
      piiRedacted: ((data.pii_redacted_count as number | undefined) ?? 0) > 0,
      shapBasisPoints: (data.shap_basis_points as Record<string, number> | undefined) ?? {},
      sr117ReceiptId: nestedPacketId,
      source: 'masternex-live',
    };
  } catch {
    return {
      allowed: true,
      flags: ['masternex_unavailable'],
      piiRedacted: false,
      shapBasisPoints: {},
      sr117ReceiptId: null,
      source: 'fallback',
    };
  }
}

/**
 * AI Flight Recorder — hash-chained event record.
 * Requires JWT scope: ledger:write.
 */
export async function recordEvent(params: {
  engine: string;
  action?: string;
  inputDigest?: string;
  outputDigest?: string;
  latencyMs?: number;
  metadata?: Record<string, string | number>;
}): Promise<{ packetId: string | null }> {
  const url = getMasternexUrl();
  if (!url) return { packetId: null };
  try {
    const body = {
      engine: params.engine,
      action: params.action ?? 'evaluate',
      input_digest: params.inputDigest,
      output_digest: params.outputDigest,
      latency_ms: params.latencyMs,
      status: 'ok',
      metadata: params.metadata,
    };
    const res = await fetch(`${url}/v1/recorder/events`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { packetId: null };
    const data = (await res.json()) as Record<string, unknown>;
    return { packetId: (data.packet_id as string) ?? null };
  } catch {
    return { packetId: null };
  }
}

/**
 * Compliance report — SR 11-7 + EU AI Act evaluation.
 * Requires JWT scope: compliance:read.
 */
export async function getComplianceReport(systemId = 'fiduciary-os-v1'): Promise<{
  status: 'COMPLIANT' | 'NON_COMPLIANT' | 'MASTERNEX_NOT_CONFIGURED';
  criteria: Record<string, boolean>;
}> {
  const url = getMasternexUrl();
  if (!url) return { status: 'MASTERNEX_NOT_CONFIGURED', criteria: {} };
  try {
    const res = await fetch(`${url}/v1/compliance/report?system_id=${encodeURIComponent(systemId)}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { status: 'NON_COMPLIANT', criteria: {} };
    const data = (await res.json()) as Record<string, unknown>;
    return {
      status: (data.status as 'COMPLIANT' | 'NON_COMPLIANT') ?? 'NON_COMPLIANT',
      criteria: (data.criteria as Record<string, boolean>) ?? {},
    };
  } catch {
    return { status: 'NON_COMPLIANT', criteria: {} };
  }
}

/**
 * Attested BYOK Router — pre-egress PII redaction + PQ-signed receipt.
 */
export async function attestedInfer(params: {
  prompt: string;
  system?: string;
  preferredProviders?: string[];
  modelOverride?: string;
  maxTokens?: number;
  blockOnPii?: boolean;
}): Promise<Record<string, unknown> | null> {
  const url = getMasternexUrl();
  if (!url) return null;
  try {
    const res = await fetch(`${url}/v1/connectors/infer`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        prompt: params.prompt,
        platform: 'fiduciary-os',
        system: params.system ?? 'You are Fiduciary OS, an educational financial planning assistant.',
        preferred_providers: params.preferredProviders,
        model_override: params.modelOverride,
        max_tokens: params.maxTokens ?? 512,
        tenant_id: 'fiduciary-os',
        block_on_pii: params.blockOnPii ?? false,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Academic Connector Suite — Nature.com, OpenAlex, arXiv, PubMed with Merkle provenance.
 */
export async function searchAcademicLiterature(params: {
  query: string;
  sources?: string[];
  rowsPerSource?: number;
}): Promise<Record<string, unknown> | null> {
  const url = getMasternexUrl();
  if (!url) return null;
  try {
    const res = await fetch(`${url}/v1/connectors/academic/search`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        query: params.query,
        sources: params.sources ?? ['nature', 'openalex', 'arxiv', 'pubmed'],
        rows_per_source: params.rowsPerSource ?? 3,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * AUCTUM.Insights — Property underwriting & stress test bridge.
 */
export async function underwriteProperty(params: {
  parcel: Record<string, unknown>;
  reportType?: string;
}): Promise<Record<string, unknown> | null> {
  const url = getMasternexUrl();
  if (!url) return null;
  try {
    const res = await fetch(`${url}/v1/auctum/insights/underwrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parcel: params.parcel,
        report_type: params.reportType ?? 'IC Audit',
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
