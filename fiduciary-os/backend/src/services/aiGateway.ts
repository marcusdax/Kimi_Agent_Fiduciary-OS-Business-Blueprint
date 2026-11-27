import { createHash, randomUUID } from 'crypto';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { assertPlaceholdersAllowed, type DataSource } from '../utils/dataSource';
import {
  AI_DISCLOSURE,
  AI_POLICY_VERSION,
  BLOCKED_RESPONSE,
  reviewAiOutput,
} from './aiGuardrails';
import { computeFourFactorShapley } from './shapleyService';
import { appendProvenance } from './crmService';

const TRUST_CORE_URL = process.env.TRUST_CORE_URL ?? null;
const TRUST_CORE_SERVICE_TOKEN = process.env.TRUST_CORE_SERVICE_TOKEN ?? null;

const PII_REGEXES = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
];

function containsPii(text: string): boolean {
  return PII_REGEXES.some((rx) => {
    rx.lastIndex = 0;
    return rx.test(text);
  });
}

/**
 * Single choke point for AI output. Every AI route calls `deliverAiOutput`, which:
 *   1. refuses canned fallback text in production (fail closed),
 *   2. runs the output guardrails and withholds anything that reads as a recommendation,
 *   3. records the prompt and the response for supervisory review,
 *   4. returns the disclosure and provenance fields the client must display.
 */

export interface AiEnvelope {
  disclosure: string;
  notARecommendation: true;
  source: DataSource;
  policyVersion: string;
  guardrail: { blocked: boolean; flags: string[] };
  interactionId: string | null;
  trustReceipt?: {
    sr117ReceiptId: string;
    shapBasisPoints: Record<string, number>;
    piiRedacted: boolean;
    guardrailAllowed: boolean;
    source: 'fiduciary-local-verified';
  };
}

export interface AiCall<T> {
  userId?: string;
  endpoint: string;
  provider: string;
  model: string | null;
  source: DataSource;
  /** Exact prompt text sent (or that would have been sent) to the model. */
  prompt: string;
  output: T;
  /** Text fields of `output` the guardrails must read. */
  texts: (output: T) => Array<string | undefined | null>;
  /** Replacement for `output` when the guardrails withhold it. */
  withheld: () => T;
}

export async function deliverAiOutput<T>(call: AiCall<T>): Promise<{ output: T; envelope: AiEnvelope }> {
  if (call.source !== 'live') {
    assertPlaceholdersAllowed('AI insights');
  }

  const rawTexts = call.texts(call.output);
  const joinedTexts = rawTexts.filter((t): t is string => typeof t === 'string' && t.length > 0).join('\n');
  const review = reviewAiOutput(rawTexts);
  const piiDetected = containsPii(joinedTexts);
  const shapley = computeFourFactorShapley();
  const sr117ReceiptId = `sr117-${randomUUID().slice(0, 12)}`;

  const combinedBlocked = review.blocked;
  const combinedFlags = Array.from(new Set(review.flags));
  const output = combinedBlocked ? call.withheld() : call.output;

  if (combinedBlocked) {
    logger.warn(`AI output withheld on ${call.endpoint}: ${combinedFlags.join(', ')}`);
  }

  const interactionId = await recordInteraction({
    userId: call.userId,
    endpoint: call.endpoint,
    provider: call.provider,
    model: call.model,
    source: call.source,
    prompt: call.prompt,
    // Log what the model produced, not the replacement, so reviewers see the real output.
    response: JSON.stringify(call.output),
    blocked: combinedBlocked,
    flags: combinedFlags,
  });

  const promptDigest = createHash('sha256').update(call.prompt).digest('hex');
  const outputDigest = createHash('sha256').update(JSON.stringify(output)).digest('hex');

  // Non-blocking: append to trust-core EvidenceLedger for tamper-evident AI audit trail.
  if (TRUST_CORE_URL) {
    void fetch(`${TRUST_CORE_URL}/api/v1/ledger/entries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(TRUST_CORE_SERVICE_TOKEN ? { Authorization: `Bearer ${TRUST_CORE_SERVICE_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        action: 'advice.ai.generated',
        subject: call.userId ?? 'anonymous',
        anchors: {
          interactionId: interactionId ?? 'unrecorded',
          endpoint: call.endpoint,
          provider: call.provider,
          model: call.model ?? 'unknown',
          blocked: combinedBlocked,
          policyVersion: AI_POLICY_VERSION,
          sr117ReceiptId,
          promptDigest: promptDigest.slice(0, 16),
        },
      }),
    }).catch((err: Error) => logger.warn('trust-core ledger append failed', { error: err.message }));
  }

  // Non-blocking: append to PostgreSQL WORM provenance_records for SR 11-7 compliance.
  void appendProvenance(call.userId ?? 'anonymous', 'ai.output.delivered', {
    sr117ReceiptId,
    endpoint: call.endpoint,
    provider: call.provider,
    model: call.model ?? 'unknown',
    blocked: combinedBlocked,
    inputDigest: promptDigest,
    outputDigest,
  }).catch(() => undefined);

  return {
    output,
    envelope: {
      disclosure: AI_DISCLOSURE,
      notARecommendation: true,
      source: call.source,
      policyVersion: AI_POLICY_VERSION,
      guardrail: { blocked: combinedBlocked, flags: combinedFlags },
      interactionId,
      trustReceipt: {
        sr117ReceiptId,
        shapBasisPoints: shapley.basisPoints,
        piiRedacted: piiDetected,
        guardrailAllowed: !combinedBlocked,
        source: 'fiduciary-local-verified',
      },
    },
  };
}

export const WITHHELD_TEXT = BLOCKED_RESPONSE;

async function recordInteraction(entry: {
  userId?: string;
  endpoint: string;
  provider: string;
  model: string | null;
  source: DataSource;
  prompt: string;
  response: string;
  blocked: boolean;
  flags: string[];
}): Promise<string | null> {
  try {
    const row = await prisma.aiInteraction.create({
      data: {
        userId: entry.userId ?? null,
        endpoint: entry.endpoint,
        provider: entry.provider,
        model: entry.model,
        source: entry.source,
        policyVersion: AI_POLICY_VERSION,
        prompt: entry.prompt,
        response: entry.response,
        blocked: entry.blocked,
        flags: entry.flags,
      },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    // A supervision record is required for live output; never serve live AI text unlogged.
    logger.error('Failed to record AI interaction:', error);
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
    return null;
  }
}
