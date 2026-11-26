#!/usr/bin/env tsx
/**
 * generate-service-token.ts
 *
 * Generates a signed JWT for backend → trust-core sidecar calls.
 *
 * Usage:
 *   npx tsx scripts/generate-service-token.ts            # expires in 365d (default)
 *   npx tsx scripts/generate-service-token.ts 90d        # expires in 90 days
 *   npx tsx scripts/generate-service-token.ts 8h         # short-lived for CI
 *
 * Required env var:
 *   TRUST_CORE_JWT_SECRET — shared secret (min 32 chars) used by trust-core to
 *   verify inbound requests on the /ledger/* routes.
 *
 * Output:
 *   Prints the signed JWT to stdout. Set the printed value as TRUST_CORE_SERVICE_TOKEN
 *   in the backend .env to allow the backend to call trust-core's /ledger/append,
 *   /ledger/audit, and /ledger/export routes.
 */
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const secret = process.env.TRUST_CORE_JWT_SECRET ?? '';
if (secret.length < 32) {
  process.stderr.write(
    'Error: TRUST_CORE_JWT_SECRET must be set and at least 32 characters.\n' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n'
  );
  process.exit(1);
}

const expiresIn = (process.argv[2] ?? '365d') as jwt.SignOptions['expiresIn'];

const payload: jwt.JwtPayload = {
  sub: 'fiduciary-os-backend',
  iss: 'fiduciary-os',
  aud: 'trust-core',
  scope: 'ledger:write compliance:read',
};

const token = jwt.sign(payload, secret, {
  expiresIn,
  algorithm: 'HS256',
});

process.stdout.write(token + '\n');
