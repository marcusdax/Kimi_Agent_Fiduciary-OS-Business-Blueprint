import { randomUUID } from 'crypto';

import { logger } from '../utils/logger';

/**
 * Optional Langfuse trace sink (REST ingestion API). Off unless LANGFUSE_PUBLIC_KEY,
 * LANGFUSE_SECRET_KEY and LANGFUSE_HOST are all set. Fire-and-forget: it never blocks or
 * fails an AI response. Prompt and response text are NOT sent unless LANGFUSE_INCLUDE_CONTENT=true,
 * because they can contain client data; metadata (endpoint, model, policy flags) is always enough
 * to monitor guardrail behavior.
 */
export interface TraceEvent {
  endpoint: string;
  provider: string;
  model: string | null;
  blocked: boolean;
  flags: string[];
  policyVersion: string;
  prompt?: string;
  response?: string;
}

export function traceSinkEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY && env.LANGFUSE_HOST);
}

export function buildIngestionBody(e: TraceEvent, includeContent: boolean, now = new Date()) {
  const traceId = randomUUID();
  const ts = now.toISOString();
  return {
    batch: [
      {
        id: randomUUID(),
        type: 'trace-create',
        timestamp: ts,
        body: {
          id: traceId,
          name: e.endpoint,
          timestamp: ts,
          tags: [e.provider, e.blocked ? 'guardrail-blocked' : 'guardrail-pass'],
          metadata: { model: e.model, flags: e.flags, policyVersion: e.policyVersion },
          ...(includeContent ? { input: e.prompt, output: e.response } : {}),
        },
      },
    ],
  };
}

export async function emitTrace(
  e: TraceEvent,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  if (!traceSinkEnabled(env)) return;
  try {
    const auth = Buffer.from(`${env.LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_SECRET_KEY}`).toString('base64');
    const res = await fetchImpl(`${env.LANGFUSE_HOST!.replace(/\/$/, '')}/api/public/ingestion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify(buildIngestionBody(e, env.LANGFUSE_INCLUDE_CONTENT === 'true')),
    });
    if (!res.ok) logger.warn(`Trace sink responded ${res.status}`);
  } catch (error) {
    logger.warn('Trace sink failed (ignored):', error);
  }
}
