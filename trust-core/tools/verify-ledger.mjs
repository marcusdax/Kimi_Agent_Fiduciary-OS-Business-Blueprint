#!/usr/bin/env node
/**
 * verify-ledger.mjs — verify an exported evidence bundle without trusting the server.
 *
 * This is the artefact the product claim rests on: a client, an examiner or a buyer
 * can take the JSON an advisor exported, run this script, and confirm that nothing
 * was altered after the fact — no access to Fiduciary OS required.
 *
 *   node tools/verify-ledger.mjs bundle.json
 *   node tools/verify-ledger.mjs bundle.json --public-key pub.pem
 *
 * Exit codes: 0 verified, 1 broken, 2 usage error.
 */
import { readFile } from 'node:fs/promises';
import { createHash, verify as cryptoVerify } from 'node:crypto';

const GENESIS = '0'.repeat(64);

function canonicalise(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalise(value[k])}`).join(',')}}`;
}

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

function entryHash(e) {
  return sha256(
    [e.seq, e.id, e.at, e.action, e.actor, e.subject, canonicalise(e.anchors), e.payloadHash ?? '', e.supersedes ?? '', e.prevHash].join('|'),
  );
}

function verifyBundle(bundle, publicKeyPem) {
  if (bundle.version !== 1) return { valid: false, reason: `unsupported bundle version ${bundle.version}` };
  const startSeq = bundle.startSeq ?? 0;
  const linkage = bundle.startSeq === undefined ? 'full' : 'per-entry';
  let prevHash = GENESIS;

  for (let i = 0; i < bundle.entries.length; i++) {
    const e = bundle.entries[i];
    if (linkage === 'full') {
      if (e.seq !== startSeq + i) return { valid: false, brokenAt: e.seq, reason: `sequence gap at position ${i}` };
      if (i === 0 && e.prevHash !== GENESIS) return { valid: false, brokenAt: e.seq, reason: 'first entry does not chain from genesis' };
      if (i > 0 && e.prevHash !== prevHash) return { valid: false, brokenAt: e.seq, reason: `link break at seq ${e.seq}` };
    }
    const { hash, ...rest } = e;
    if (entryHash(rest) !== hash) return { valid: false, brokenAt: e.seq, reason: `content hash mismatch at seq ${e.seq}` };
    prevHash = hash;
  }

  const expectedHead = bundle.entries.at(-1)?.hash ?? GENESIS;
  if (bundle.headHash !== expectedHead) {
    return { valid: false, brokenAt: null, reason: 'head hash does not match the final entry (tail altered or truncated)' };
  }

  if (publicKeyPem) {
    if (!bundle.signature) return { valid: false, reason: 'bundle is unsigned but a public key was supplied' };
    const ok = cryptoVerify(null, Buffer.from(bundle.headHash, 'utf8'), publicKeyPem, Buffer.from(bundle.signature, 'base64'));
    if (!ok) return { valid: false, reason: 'signature does not verify against the supplied public key' };
  }

  return { valid: true, checked: bundle.entries.length, headHash: expectedHead, linkage, signed: Boolean(bundle.signature) };
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const keyIndex = args.indexOf('--public-key');
const keyFile = keyIndex !== -1 ? args[keyIndex + 1] : undefined;

if (!file) {
  console.error('usage: node tools/verify-ledger.mjs <bundle.json> [--public-key pub.pem]');
  process.exit(2);
}

const bundle = JSON.parse(await readFile(file, 'utf8'));
const publicKeyPem = keyFile ? await readFile(keyFile, 'utf8') : undefined;
const result = verifyBundle(bundle, publicKeyPem);

console.log(JSON.stringify({ file, ...result }, null, 2));
process.exit(result.valid ? 0 : 1);
