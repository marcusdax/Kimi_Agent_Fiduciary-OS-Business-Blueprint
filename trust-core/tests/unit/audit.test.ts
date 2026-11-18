/**
 * The audit rules are the guardrails for this codebase, so they are tested with planted
 * violations rather than trusted because they currently report nothing.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { findViolations, auditTree, RULES } from '../../tools/audit.mjs';

const doc = '/**\n * documented\n */\n';

describe('audit rules', () => {
  test('the shipped tree is clean', async () => {
    const { checked, findings } = await auditTree();
    assert.ok(checked > 20, `only ${checked} files audited`);
    assert.deepEqual(findings, [], JSON.stringify(findings.slice(0, 3), null, 2));
  });

  test('catches markup injection', () => {
    const found = findViolations('src/x.ts', `${doc}el.innerHTML = data;`);
    assert.equal(found[0]?.rule, 'dom-html-injection');
  });

  test('catches dynamic code execution', () => {
    assert.equal(findViolations('src/x.ts', `${doc}eval(userInput);`)[0]?.rule, 'dynamic-code-execution');
    assert.equal(findViolations('src/x.ts', `${doc}new Function('return 1')();`)[0]?.rule, 'dynamic-code-execution');
  });

  test('catches process spawning', () => {
    const found = findViolations('src/x.ts', `${doc}import { exec } from 'node:child_process';`);
    assert.equal(found[0]?.rule, 'process-spawn');
  });

  test('catches checked-in key material and passwords', () => {
    assert.equal(findViolations('src/x.ts', `${doc}const k = '-----BEGIN PRIVATE KEY-----';`)[0]?.rule, 'hardcoded-secret');
    assert.equal(findViolations('src/x.ts', `${doc}const password = 'hunter2hunter2';`)[0]?.rule, 'hardcoded-secret');
  });

  test('catches stray console output', () => {
    assert.equal(findViolations('src/x.ts', `${doc}console.log(secret);`)[0]?.rule, 'stray-console');
  });

  test('catches unfinished markers', () => {
    assert.equal(findViolations('src/x.ts', `${doc}// TODO: ship this`)[0]?.rule, 'unfinished-marker');
  });

  test('flags an undocumented source module but not a declaration file', () => {
    assert.equal(findViolations('src/x.ts', 'export const a = 1;')[0]?.rule, 'undocumented-module');
    assert.deepEqual(findViolations('src/x.d.ts', 'export const a: number;'), []);
  });

  test('a clean documented module produces nothing', () => {
    assert.deepEqual(findViolations('src/x.ts', `${doc}export const add = (a: number, b: number) => a + b;`), []);
  });

  test('files outside src/ are not audited', () => {
    assert.deepEqual(findViolations('tests/x.ts', 'eval(x)'), []);
  });

  test('every rule has an id, a pattern and a message a reviewer can act on', () => {
    for (const rule of RULES) {
      assert.match(rule.id, /^[a-z-]+$/);
      assert.ok(rule.pattern instanceof RegExp);
      assert.ok(rule.message.length > 20, rule.id);
    }
  });
});
