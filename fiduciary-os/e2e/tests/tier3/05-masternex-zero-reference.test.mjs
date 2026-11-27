import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scanForMasternex } from '../../lib/fs-helpers.mjs';

describe('Tier 3 — 05: Masternex Zero-Reference Across Full Stack (F8)', () => {
  it('[F8] Zero active masternex/MASTERNEX references remain in docker-compose, .env.dev, backend/src, or frontend/src', () => {
    const hits = scanForMasternex([
      'fiduciary-os/docker-compose.yml',
      'fiduciary-os/docker-compose.dev.yml',
      'fiduciary-os/docker-compose.ecosystem.yml',
      'fiduciary-os/.env.dev',
      'fiduciary-os/backend/src',
      'fiduciary-os/frontend/src',
    ]);

    assert.equal(
      hits.length,
      0,
      `[F8/M1] Found ${hits.length} active Masternex reference(s) across stack: ${hits
        .slice(0, 8)
        .map((h) => `${h.file}:${h.line}`)
        .join(', ')}`,
    );
  });
});
