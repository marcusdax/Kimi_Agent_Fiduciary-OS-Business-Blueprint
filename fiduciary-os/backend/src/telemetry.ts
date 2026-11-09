import { trace, SpanStatusCode, type Tracer } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeTracerProvider, BatchSpanProcessor, SimpleSpanProcessor, type SpanExporter } from '@opentelemetry/sdk-trace-node';
import type { NextFunction, Request, Response } from 'express';

/**
 * Vendor-neutral tracing. Off unless OTEL_EXPORTER_OTLP_ENDPOINT is set (or an exporter is passed in tests).
 * Spans carry route templates, status and timing only: no bodies, headers, query strings or user identifiers.
 * Auto-instrumentation packages are not used (their peer ranges currently conflict with the SDK);
 * HTTP server spans come from `tracingMiddleware`, and `withSpan` wraps AI/job work.
 */
let provider: NodeTracerProvider | null = null;

export function startTelemetry(env: NodeJS.ProcessEnv = process.env, exporter?: SpanExporter): boolean {
  if (provider) return true;
  if (!exporter && !env.OTEL_EXPORTER_OTLP_ENDPOINT) return false;
  const exp = exporter ?? new OTLPTraceExporter();
  provider = new NodeTracerProvider({ spanProcessors: [exporter ? new SimpleSpanProcessor(exp) : new BatchSpanProcessor(exp)] });
  provider.register();
  return true;
}

export async function stopTelemetry(): Promise<void> {
  await provider?.shutdown();
  provider = null;
  trace.disable();
}

const tracer = (): Tracer => trace.getTracer('fiduciary-os-api');

export async function withSpan<T>(name: string, attrs: Record<string, string | number | boolean>, fn: () => Promise<T>): Promise<T> {
  return tracer().startActiveSpan(name, async span => {
    span.setAttributes(attrs);
    try {
      return await fn();
    } catch (e) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: e instanceof Error ? e.name : 'error' });
      throw e;
    } finally {
      span.end();
    }
  });
}

export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const span = tracer().startSpan('http.request', { attributes: { 'http.method': req.method } });
  res.on('finish', () => {
    // Route template (e.g. /org/households/:id), never the raw URL, so ids and queries stay out of traces.
    span.setAttributes({ 'http.route': `${req.baseUrl}${req.route?.path ?? ''}` || 'unmatched', 'http.status_code': res.statusCode });
    if (res.statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
  });
  next();
}
