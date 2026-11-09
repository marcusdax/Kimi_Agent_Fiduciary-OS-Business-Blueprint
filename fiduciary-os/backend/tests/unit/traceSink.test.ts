import { buildIngestionBody, emitTrace, traceSinkEnabled } from '../../src/services/traceSink';

const ev = { endpoint: '/ai/x', provider: 'anthropic', model: 'm', blocked: true, flags: ['advice'], policyVersion: 'v1', prompt: 'SECRET PROMPT', response: 'SECRET OUT' };
const env = { LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: 'sk', LANGFUSE_HOST: 'https://lf.test/' } as NodeJS.ProcessEnv;

describe('trace sink', () => {
  it('is disabled without config and never calls fetch', async () => {
    const f = jest.fn();
    expect(traceSinkEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    await emitTrace(ev, {} as NodeJS.ProcessEnv, f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
  });
  it('omits prompt/response by default', () => {
    const body = JSON.stringify(buildIngestionBody(ev, false));
    expect(body).not.toContain('SECRET');
    expect(body).toContain('guardrail-blocked');
  });
  it('includes content only when opted in', () => {
    expect(JSON.stringify(buildIngestionBody(ev, true))).toContain('SECRET PROMPT');
  });
  it('posts to ingestion with basic auth and swallows failures', async () => {
    const f = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    await emitTrace(ev, env, f as unknown as typeof fetch);
    expect(f.mock.calls[0][0]).toBe('https://lf.test/api/public/ingestion');
    expect(f.mock.calls[0][1].headers.Authorization).toMatch(/^Basic /);
    await expect(emitTrace(ev, env, jest.fn().mockRejectedValue(new Error('x')) as unknown as typeof fetch)).resolves.toBeUndefined();
  });
});
