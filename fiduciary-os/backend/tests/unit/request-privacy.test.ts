import express, { json } from 'express';
import request from 'supertest';

import { errorHandler } from '../../src/middleware/errorHandler';
import { requestLogger, operationalMetrics } from '../../src/middleware/requestLogger';
import { logger } from '../../src/utils/logger';
describe('bounded request diagnostics', () => {
  it('does not log URL, body, headers, identifiers, exception text or supplied request ID', async () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => logger),
      error = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    try {
      const app = express();
      app.use(requestLogger, json());
      app.post('/api/v1/tools/:id', () => {
        throw Error('PRIVATE_EXCEPTION');
      });
      app.use(errorHandler);
      const before = operationalMetrics();
      const r = await request(app)
        .post('/api/v1/tools/PRIVATE_ID?token=PRIVATE_QUERY')
        .set('Authorization', 'Bearer PRIVATE_BEARER')
        .set('X-Request-ID', 'PRIVATE_REQUEST')
        .send({ secret: 'PRIVATE_BODY' });
      expect(r.status).toBe(500);
      expect(r.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
      expect(JSON.stringify([...info.mock.calls, ...error.mock.calls])).not.toContain('PRIVATE_');
      expect(operationalMetrics().requests).toBe(before.requests + 1);
      expect(operationalMetrics().serverErrors).toBe(before.serverErrors + 1);
    } finally {
      info.mockRestore();
      error.mockRestore();
    }
  });
});
