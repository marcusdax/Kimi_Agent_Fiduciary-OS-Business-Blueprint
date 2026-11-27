import crypto from 'node:crypto';
import path from 'node:path';

export const E2E_BACKEND_URL = (
  process.env.E2E_BACKEND_URL || 'http://localhost:3001'
).replace(/\/+$/, '');

export const E2E_TRUST_CORE_URL = (
  process.env.E2E_TRUST_CORE_URL ||
  process.env.E2E_TRUST_URL ||
  'http://localhost:3002'
).replace(/\/+$/, '');

export const E2E_FRONTEND_URL = (
  process.env.E2E_FRONTEND_URL || 'http://localhost:5173'
).replace(/\/+$/, '');

export const E2E_REPO_ROOT = process.env.E2E_REPO_ROOT
  ? path.resolve(process.env.E2E_REPO_ROOT)
  : path.resolve(import.meta.dirname, '..', '..', '..');

export const E2E_TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS || 8000);

export const RUN_ID =
  process.env.E2E_RUN_ID ||
  `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;

export function e2eNamespace(label = 'entity') {
  return `e2e-${RUN_ID}-${label}`;
}

export function e2eEmail(label = 'user') {
  return `e2e.${RUN_ID}.${label}@example.test`;
}
