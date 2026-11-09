import path from 'path';

import express, { Router } from 'express';
import helmet from 'helmet';

import { buildOpenApiDocument } from '../openapi';

/**
 * Public API reference. Scalar's script is served from our own node_modules (no third-party CDN),
 * and only this route gets a CSP that allows its inline bootstrap script.
 */
const router = Router();
router.use(
  helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], fontSrc: ["'self'", 'data:'], connectSrc: ["'self'"] } } })
);
router.get('/openapi.json', (_req, res) => res.json(buildOpenApiDocument()));
// Same depth from src/routes and dist/routes. The package's exports map blocks require.resolve.
const bundle = path.resolve(__dirname, '../../node_modules/@scalar/api-reference/dist/browser');
router.use('/assets', express.static(bundle));
// Minimal shell (the wrapper package is ESM-only). The script is Scalar's standalone bundle.
router.get('/', (_req, res) =>
  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fiduciary OS API reference</title></head><body><script id="api-reference" data-url="./openapi.json"></script><script src="./assets/standalone.js"></script></body></html>`)
);
export { router as docsRouter };
