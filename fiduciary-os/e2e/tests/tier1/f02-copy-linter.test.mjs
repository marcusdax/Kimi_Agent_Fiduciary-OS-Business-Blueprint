import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BANNED_PROMOTIONAL_PHRASES } from '../../lib/fixtures.mjs';
import { runCopyLinter, withTempFixtureFile } from '../../lib/fs-helpers.mjs';

describe('Tier 1 — F2: Automated Copy & Compliance Linter (lint:copy)', () => {
  it('[F2] npm --prefix fiduciary-os/frontend run lint:copy is defined and passes on clean repo', () => {
    const result = runCopyLinter();
    assert.equal(
      result.scriptDefined,
      true,
      `[F2/M2] Missing "lint:copy" script in fiduciary-os/frontend/package.json (${result.stderr})`,
    );
    assert.equal(
      result.exitCode,
      0,
      `[F2/M2] Expected lint:copy to exit 0 on clean repository, got exit ${result.exitCode}. Output: ${(result.stdout + '\n' + result.stderr).trim().slice(0, 400)}`,
    );
  });

  it('[F2] lint:copy exits non-zero on isolated /tmp fixture containing all 6 banned promotional phrases', async () => {
    const offendingSource = [
      'export const syntheticBadCopy = [',
      ...BANNED_PROMOTIONAL_PHRASES.map((p) => `  ${JSON.stringify(p)},`),
      '];',
    ].join('\n');

    await withTempFixtureFile('banned-copy-fixture.tsx', offendingSource, (fixturePath) => {
      const result = runCopyLinter([fixturePath]);
      assert.equal(
        result.scriptDefined,
        true,
        `[F2/M2] Missing "lint:copy" script in fiduciary-os/frontend/package.json`,
      );
      assert.notEqual(
        result.exitCode,
        0,
        `[F2/M2] lint:copy failed to reject banned promotional phrases in ${fixturePath} (exit 0)`,
      );

      const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
      for (const phrase of BANNED_PROMOTIONAL_PHRASES) {
        assert.ok(
          output.includes(phrase.toLowerCase()),
          `[F2/M2] lint:copy output did not report offending phrase "${phrase}". Output: ${output.slice(0, 400)}`,
        );
      }
    });
  });
});
