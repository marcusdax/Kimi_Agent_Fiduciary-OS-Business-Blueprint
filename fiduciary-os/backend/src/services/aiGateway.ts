import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { assertPlaceholdersAllowed, type DataSource } from '../utils/dataSource';
import {
  AI_DISCLOSURE,
  AI_POLICY_VERSION,
  BLOCKED_RESPONSE,
  reviewAiOutput,
} from './aiGuardrails';

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

  const review = reviewAiOutput(call.texts(call.output));
  const output = review.blocked ? call.withheld() : call.output;

  if (review.blocked) {
    logger.warn(`AI output withheld on ${call.endpoint}: ${review.flags.join(', ')}`);
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
    blocked: review.blocked,
    flags: review.flags,
  });

  return {
    output,
    envelope: {
      disclosure: AI_DISCLOSURE,
      notARecommendation: true,
      source: call.source,
      policyVersion: AI_POLICY_VERSION,
      guardrail: review,
      interactionId,
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
        flags: entry.flags.join(','),
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
