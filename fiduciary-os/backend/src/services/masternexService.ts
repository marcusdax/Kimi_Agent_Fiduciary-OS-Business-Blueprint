/**
 * masternexService.ts — HTTP client for MASTERNEX.os APIs.
 *
 * All calls are env-gated: if MASTERNEX_API_URL is unset, every function
 * returns a safe default and logs nothing. This keeps dev stacks working
 * without MASTERNEX running.
 *
 * API surface (confirmed):
 *   POST /v1/auctum/fiduciary/evaluate  — no auth required
 *   POST /v1/recorder/events            — scope: ledger:write
 *   GET  /v1/compliance/report          — scope: compliance:read
 */

const MASTERNEX_URL = process.env.MASTERNEX_API_URL ?? null;
const MASTERNEX_JWT = process.env.MASTERNEX_JWT ?? null;

function authHeaders(): Record<string, string> {
  return MASTERNEX_JWT
    ? { Authorization: `Bearer ${MASTERNEX_JWT}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

/**
 * FiduciaryOSGuard — education-only compliance gate.
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
}> {
  if (!MASTERNEX_URL) {
    return { allowed: true, flags: [], piiRedacted: false, shapBasisPoints: {}, sr117ReceiptId: null };
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
    const res = await fetch(`${MASTERNEX_URL}/v1/auctum/fiduciary/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { allowed: true, flags: [`masternex_http_${res.status}`], piiRedacted: false, shapBasisPoints: {}, sr117ReceiptId: null };
    }
    const data = await res.json() as Record<string, unknown>;
    return {
      allowed: (data.education_guardrail as Record<string, unknown> | undefined)?.education_only_compliant !== false,
      flags: ((data.education_guardrail as Record<string, unknown> | undefined)?.violations as string[]) ?? [],
      piiRedacted: ((data.pii_redacted_count as number | undefined) ?? 0) > 0,
      shapBasisPoints: (data.shap_basis_points as Record<string, number> | undefined) ?? {},
      sr117ReceiptId: ((data.sr11_7_receipt as Record<string, unknown> | undefined)?.packet_id as string) ?? null,
    };
  } catch {
    return { allowed: true, flags: ['masternex_unavailable'], piiRedacted: false, shapBasisPoints: {}, sr117ReceiptId: null };
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
  if (!MASTERNEX_URL) return { packetId: null };
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
    const res = await fetch(`${MASTERNEX_URL}/v1/recorder/events`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) return { packetId: null };
    const data = await res.json() as Record<string, unknown>;
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
  if (!MASTERNEX_URL) return { status: 'MASTERNEX_NOT_CONFIGURED', criteria: {} };
  try {
    const res = await fetch(`${MASTERNEX_URL}/v1/compliance/report?system_id=${encodeURIComponent(systemId)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return { status: 'NON_COMPLIANT', criteria: {} };
    const data = await res.json() as Record<string, unknown>;
    return {
      status: (data.status as 'COMPLIANT' | 'NON_COMPLIANT') ?? 'NON_COMPLIANT',
      criteria: (data.criteria as Record<string, boolean>) ?? {},
    };
  } catch {
    return { status: 'NON_COMPLIANT', criteria: {} };
  }
}
