import express from 'express';
import request from 'supertest';

import { buildOpenApiDocument } from '../../src/openapi';
import { calculationsRouter } from '../../src/routes/calculations';
import { docsRouter } from '../../src/routes/docs';
import { firmsRouter } from '../../src/routes/firms';

type Layer = { route?: { path: string; methods: Record<string, boolean> } };
function routesOf(router: { stack: Layer[] }, prefix: string) {
  return router.stack.filter(l => l.route).flatMap(l => Object.keys(l.route!.methods).map(m => `${m} ${prefix}${l.route!.path.replace(/:(\w+)/g, '{$1}')}`));
}

describe('OpenAPI reference', () => {
  const doc = buildOpenApiDocument() as unknown as { openapi: string; paths: Record<string, Record<string, unknown>>; components: { securitySchemes: object } };
  const documented = Object.entries(doc.paths).flatMap(([p, ms]) => Object.keys(ms).map(m => `${m} ${p}`));

  it('is OpenAPI 3.1 with bearer auth', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.components.securitySchemes).toHaveProperty('bearerAuth');
  });
  it('documents every firms and calculations route (drift guard)', () => {
    const actual = [...routesOf(firmsRouter as never, '/org'), ...routesOf(calculationsRouter as never, '/calculations')];
    expect(actual.length).toBeGreaterThan(10);
    expect(actual.filter(r => !documented.includes(r))).toEqual([]);
  });
  it('serves the spec and a self-hosted reference page with its own CSP', async () => {
    const app = express();
    app.use('/docs', docsRouter);
    const spec = await request(app).get('/docs/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.info.title).toBe('Fiduciary OS API');
    const page = await request(app).get('/docs/');
    expect(page.status).toBe(200);
    expect(page.text).toContain('./assets/standalone.js');
    expect(page.text).not.toContain('cdn.jsdelivr.net');
    expect((await request(app).get('/docs/assets/standalone.js')).status).toBe(200);
  });
});
