import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { E2E_BACKEND_URL, e2eNamespace } from '../../lib/config.mjs';
import {
  BANNED_PHRASE_VARIANTS,
  PII_REDACTION_VECTORS,
} from '../../lib/fixtures.mjs';
import { runCopyLinter, withTempFixtureFile } from '../../lib/fs-helpers.mjs';
import { apiFetch, assertJsonObject, assertStatus } from '../../lib/http.mjs';

describe('Tier 2 — Boundary & Corner Cases: Compliance Gate 1 PII, Gate 2 Injection & Copy Linter Variants', () => {
  it('[F17] Gate 1 redacts all SSN, email, phone, and bank account PII variants from redactedText', async () => {
    const piiText = [
      `Dashed SSN ${PII_REDACTION_VECTORS.ssnDashed}`,
      `Compact SSN ${PII_REDACTION_VECTORS.ssnCompact}`,
      `Spaced SSN ${PII_REDACTION_VECTORS.ssnSpaced}`,
      `Email ${PII_REDACTION_VECTORS.email}`,
      `Phone ${PII_REDACTION_VECTORS.phoneParen} / ${PII_REDACTION_VECTORS.phoneIntl}`,
      `Acct # ${PII_REDACTION_VECTORS.bankAccount}`,
    ].join('; ');

    const res = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/compliance/evaluate',
      {
        method: 'POST',
        json: {
          sessionId: e2eNamespace('pii-gate1'),
          surface: 'atlas',
          text: piiText,
        },
      },
    );
    assertStatus(res, 200, 'F17/M2', 'POST /api/v1/compliance/evaluate (PII vectors)');
    const body = assertJsonObject(res, 'F17/M2', 'PII redaction response');
    const data = body.data || body;

    assert.equal(
      typeof data.redactedText,
      'string',
      '[F17/M2] Gate 1 response must include redactedText string',
    );
    for (const [label, secret] of [
      ['ssnDashed', PII_REDACTION_VECTORS.ssnDashed],
      ['ssnCompact', PII_REDACTION_VECTORS.ssnCompact],
      ['ssnSpaced', PII_REDACTION_VECTORS.ssnSpaced],
      ['email', PII_REDACTION_VECTORS.email],
      ['phoneParen', PII_REDACTION_VECTORS.phoneParen],
      ['phoneIntl', PII_REDACTION_VECTORS.phoneIntl],
      ['bankAccount', PII_REDACTION_VECTORS.bankAccount],
    ]) {
      assert.ok(
        !data.redactedText.includes(secret),
        `[F17/M2] Gate 1 failed to redact ${label} ("${secret}") from redactedText`,
      );
    }
  });

  it('[F17] Gate 2 blocks prompt-injection promotional claim and populates violations[]', async () => {
    const res = await apiFetch(
      E2E_BACKEND_URL,
      '/api/v1/compliance/evaluate',
      {
        method: 'POST',
        json: {
          sessionId: e2eNamespace('injection-gate2'),
          surface: 'atlas',
          text: PII_REDACTION_VECTORS.promptInjection,
        },
      },
    );
    assertStatus(res, 200, 'F17/M2', 'POST /api/v1/compliance/evaluate (prompt injection)');
    const body = assertJsonObject(res, 'F17/M2', 'prompt injection evaluation');
    const data = body.data || body;

    assert.equal(
      data.allowed,
      false,
      '[F17/M2] Gate 2 must set allowed=false on prompt-injection guaranteed growth claim',
    );
    assert.ok(
      Array.isArray(data.violations) && data.violations.length > 0,
      '[F17/M2] Gate 2 must populate non-empty violations[] on blocked content',
    );
  });

  it('[F1][F2] lint:copy catches uppercase, mixed-case, punctuation, and whitespace variants of banned phrases', async () => {
    const variantSource = [
      'export const variantCopy = [',
      ...BANNED_PHRASE_VARIANTS.map((v) => `  ${JSON.stringify(v)},`),
      '];',
    ].join('\n');

    await withTempFixtureFile('variant-copy-fixture.tsx', variantSource, (fixturePath) => {
      const result = runCopyLinter([fixturePath]);
      assert.equal(
        result.scriptDefined,
        true,
        '[F2/M2] Missing "lint:copy" script in fiduciary-os/frontend/package.json',
      );
      assert.notEqual(
        result.exitCode,
        0,
        '[F2/M2] lint:copy must reject case/punctuation/whitespace variants of banned phrases',
      );
    });
  });
});
