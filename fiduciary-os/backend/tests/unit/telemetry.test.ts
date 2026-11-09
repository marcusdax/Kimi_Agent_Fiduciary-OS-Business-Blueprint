import express from 'express';
import request from 'supertest';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-node';

import { startTelemetry, stopTelemetry, tracingMiddleware, withSpan } from '../../src/telemetry';

describe('telemetry', () => {
  afterEach(stopTelemetry);

  it('is off without an endpoint', () => {
    expect(startTelemetry({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('records spans for work and marks failures, without payload data', async () => {
    const mem = new InMemorySpanExporter();
    startTelemetry({} as NodeJS.ProcessEnv, mem);
    await withSpan('job', { 'job.name': 'x' }, async () => 1);
    await expect(withSpan('bad', {}, async () => { throw new TypeError('secret detail'); })).rejects.toThrow();
    const spans = mem.getFinishedSpans();
    expect(spans.map(s => s.name)).toEqual(['job', 'bad']);
    expect(spans[1].status.code).toBe(2);
    expect(spans[1].status.message).toBe('TypeError');
    expect(spans[1].events).toHaveLength(0);
  });

  it('http spans use route templates, not raw URLs', async () => {
    const mem = new InMemorySpanExporter();
    startTelemetry({} as NodeJS.ProcessEnv, mem);
    const app = express();
    app.use(tracingMiddleware);
    const r = express.Router();
    r.get('/households/:id', (_q, s) => { s.json({ ok: true }); });
    app.use('/org', r);
    await request(app).get('/org/households/abc-123?email=a@b.com');
    await new Promise(res => setTimeout(res, 10));
    const [span] = mem.getFinishedSpans();
    expect(span.attributes['http.route']).toBe('/org/households/:id');
    expect(JSON.stringify(span.attributes)).not.toMatch(/abc-123|a@b.com/);
  });
});
