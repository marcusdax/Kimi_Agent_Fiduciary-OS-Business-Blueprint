// Synthetic, disposable restore exercise. Tests AES-256-GCM backup envelope
// over a real pg_dump snapshot of the CI database. No production data or keys.
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const temp = await mkdtemp(join(tmpdir(), 'fiduciary-synthetic-restore-'));
const key = randomBytes(32);
const dbUrl = process.env.DATABASE_URL ?? '';

function run(command, args) {
  const p = spawnSync(command, args, { env: process.env, encoding: 'utf8', timeout: 60000 });
  if (p.status !== 0) {
    const detail = (p.stderr || p.stdout || '').slice(0, 400);
    throw Error(`Synthetic drill subprocess failed (inspect locally; no records logged): ${detail}`);
  }
  return p.stdout.trim();
}

try {
  const dumpFile = join(temp, 'snapshot.dump');

  // 1. Snapshot — pg_dump of the CI database (schema + test data, custom format)
  run('pg_dump', ['--format=custom', `--dbname=${dbUrl}`, `--file=${dumpFile}`]);

  const plain = await readFile(dumpFile);
  assert(plain.length > 0, 'pg_dump produced empty output');

  // 2. AES-256-GCM envelope: 'FOSBACKUP1' header | 12-byte IV | 16-byte GCM tag | ciphertext
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope = Buffer.concat([Buffer.from('FOSBACKUP1'), iv, tag, encrypted]);
  await writeFile(join(temp, 'backup.aesgcm'), envelope, { mode: 0o600 });

  // 3. Plaintext magic must not appear in the envelope (encryption sanity check)
  assert(!envelope.includes(Buffer.from('PGDMP')), 'pg_dump magic found in ciphertext — encryption is broken');

  // 4. Tamper rejection: flipping any ciphertext byte must throw
  const decode = (bytes) => {
    const d = createDecipheriv('aes-256-gcm', key, bytes.subarray(10, 22));
    d.setAuthTag(bytes.subarray(22, 38));
    return Buffer.concat([d.update(bytes.subarray(38)), d.final()]);
  };
  const damaged = Buffer.from(envelope);
  damaged[damaged.length - 1] ^= 1;
  assert.throws(() => decode(damaged), 'Tamper detection failed — damaged envelope was accepted');

  // 5. Decrypt and verify byte-exact round-trip
  const recovered = decode(envelope);
  assert(recovered.equals(plain), 'Decrypted dump does not match original — round-trip failed');

  console.log(JSON.stringify({
    encryption: 'AES-256-GCM',
    key: 'memory-only; never logged/persisted',
    tamperRejection: true,
    dumpBytes: plain.length,
    scope: 'disposable synthetic drill; NOT production backup/KMS/retention evidence',
  }));

  plain.fill(0);
  recovered.fill(0);
} finally {
  key.fill(0);
  await rm(temp, { recursive: true, force: true });
}
