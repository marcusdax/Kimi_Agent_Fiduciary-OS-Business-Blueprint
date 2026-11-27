import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, e2eNamespace } from '../../lib/config.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 2 — Boundary & Corner Cases: Orchestration, Plaid Tier Cap, Compulife REMOTE_IP & Consent Enums', () => {
  it('[F16] Temporal orchestration spine handles >2.1 MB payload via S3 UUID ref offload without gRPC limit crash', async () => {
    const largeBlob = 'A'.repeat(2_200_000);
    const res = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/orchestration/workflows',
      {
        method: 'POST',
        json: {
          workflowType: 'large_document_ingest',
          sessionId: e2eNamespace('temporal-2mb'),
          payload: { rawDocument: largeBlob },
        },
        timeoutMs: 12000,
      },
    );
    assertStatus(
      res,
      [200, 201, 202, 413],
      'F16/M4',
      'Temporal >2 MB payload guard (offload to S3 UUID ref or explicit 413 offload contract)',
    );
    const body = assertJsonObject(
      res,
      'F16/M4',
      'Temporal >2 MB payload response must be structured JSON',
    );
    const data = body.data || body;
    if (res.status === 413) {
      const bodyText = JSON.stringify(body);
      const hasOffloadContract =
        Boolean(
          data.payloadRef ||
            data.offloadRequired === true ||
            data.uploadUrl ||
            data.s3UploadUrl,
        ) || /payloadRef|offloadRequired|offload|s3|2\s*mb|uploadUrl/i.test(bodyText);
      assert.ok(
        hasOffloadContract,
        `[F16/M4] HTTP 413 must explicitly declare S3 offload contract (payloadRef/offloadRequired/s3/2MB/uploadUrl), not a generic body-parser error (got: ${bodyText.slice(0, 200)})`,
      );
    } else {
      assert.ok(
        data.payloadRef || data.s3Ref || data.offloaded === true,
        '[F16/M4] >2 MB workflow payload accepted without returning compact S3 UUID payloadRef',
      );
    }
  });

  it('[F15] Plaid FDX Free-tier allows 1 institution connection and blocks 2nd distinct institution with 402/403', async () => {
    const freeUser = e2eNamespace('plaid-free');
    const first = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/connectors/plaid/sync',
      {
        method: 'POST',
        json: {
          userId: freeUser,
          tier: 'free',
          institutionId: 'ins_free_1',
          cursor: null,
        },
      },
    );
    assertStatus(first, 200, 'F15/M4', 'Plaid Free-tier 1st institution sync');

    const second = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/connectors/plaid/sync',
      {
        method: 'POST',
        json: {
          userId: freeUser,
          tier: 'free',
          institutionId: 'ins_free_2',
          cursor: null,
        },
      },
    );
    assertStatus(
      second,
      [402, 403],
      'F15/M4',
      'Plaid Free-tier 2nd distinct institution must be blocked with 402/403',
    );
  });

  it('[F15] Compulife quote compare rejects missing or invalid REMOTE_IP with 400/422', async () => {
    const missingIp = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/connectors/quotes/compare',
      {
        method: 'POST',
        json: {
          state: 'CA',
          age: 40,
          gender: 'M',
          smoker: false,
          faceAmountUsd: 500000,
          termYears: 20,
        },
      },
    );
    assertStatus(
      missingIp,
      [400, 422],
      'F15/M4',
      'Compulife quote compare without REMOTE_IP must be rejected',
    );

    const badIp = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/connectors/quotes/compare',
      {
        method: 'POST',
        headers: { 'x-remote-ip': 'not-an-ip' },
        json: {
          remoteIp: 'not-an-ip',
          state: 'CA',
          age: 40,
          gender: 'M',
          smoker: false,
          faceAmountUsd: 500000,
          termYears: 20,
        },
      },
    );
    assertStatus(
      badIp,
      [400, 422],
      'F15/M4',
      'Compulife quote compare with invalid REMOTE_IP must be rejected',
    );
  });

  it('[F4] Consent endpoint rejects invalid channel and status enums with 400/422', async () => {
    const res = await apiFetch(E2E_BACKEND_URL, '/api/v1/consent', {
      method: 'POST',
      json: {
        userId: e2eNamespace('bad-consent'),
        channel: 'carrier_pigeon',
        status: 'maybe',
        source: 'atlas_onboarding',
        timestamp: new Date().toISOString(),
        proofHash: '0'.repeat(64),
      },
    });
    assertStatus(
      res,
      [400, 422],
      'F4/M1',
      'POST /api/v1/consent with invalid channel/status enums',
    );
  });
});
