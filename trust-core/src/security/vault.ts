/**
 * security/vault.ts — F10: envelope encryption, key versioning, and a PQC seam.
 *
 * Gap in the upstream design: the document vault stored metadata only, with "no file
 * storage or encryption implemented". A vault with no ciphertext is not a vault.
 *
 * Design: standard envelope encryption.
 *
 *   data key (per document, AES-256-GCM)  ->  encrypts the document bytes
 *   key-encryption key (KEK, versioned)   ->  wraps the data key
 *
 * Why per-document data keys: rotation re-wraps 32 bytes per document instead of
 * re-encrypting every blob, which is the difference between a 40-second job and a
 * 40-hour one on a real vault.
 *
 * Why the KEK is versioned rather than replaced: a 30-year confidentiality horizon
 * means you *will* need to change algorithms. Only the wrapping step changes, so the
 * stored ciphertext stays valid. That is also where a hybrid post-quantum KEM goes
 * (`open-quantum-safe/oqs-provider`) when "harvest now, decrypt later" stops being
 * theoretical for long-horizon financial records.
 *
 * What this does not do: it does not hold keys in an HSM, and the keyring here is
 * in-process. In production the KEKs live in KMS, and this module becomes the client.
 * The separation is already in the interface (`Keyring`).
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

export interface WrappedKey {
  keyVersion: number;
  iv: string;
  ciphertext: string;
  tag: string;
}

export interface SealedDocument {
  id: string;
  /** Ciphertext of the document bytes. Never returned by the API. */
  content: WrappedKey;
  /** Wrapped data key. */
  wrappedDek: WrappedKey;
  /** Plaintext metadata, safe to store and index. No content, no PII beyond an owner ref. */
  meta: Record<string, string>;
  createdAt: string;
  bytes: number;
}

export interface Keyring {
  /** Version currently used for new wraps. */
  currentVersion(): number;
  /** Introduce a new key version for future wraps; old versions stay readable. */
  rotate(): number;
  /** 32-byte KEK for a version. */
  get(version: number): Buffer;
  versions(): number[];
}

/** In-memory keyring for tests and local development. Production uses KMS. */
export class MemoryKeyring implements Keyring {
  readonly #keys = new Map<number, Buffer>();
  #current: number;

  constructor(seed?: Buffer) {
    const v1 = seed ?? randomBytes(32);
    if (v1.length !== 32) throw new RangeError('KEK must be 32 bytes');
    this.#keys.set(1, v1);
    this.#current = 1;
  }

  currentVersion(): number {
    return this.#current;
  }

  get(version: number): Buffer {
    const key = this.#keys.get(version);
    if (!key) throw new Error(`no key material for version ${version}`);
    return key;
  }

  versions(): number[] {
    return [...this.#keys.keys()].sort((a, b) => a - b);
  }

  /** Rotate: introduce a new KEK version for future wraps. Old versions stay readable. */
  rotate(): number {
    const next = this.#current + 1;
    this.#keys.set(next, randomBytes(32));
    this.#current = next;
    return next;
  }
}

function sealWith(key: Buffer, plaintext: Buffer): WrappedKey {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { keyVersion: 0, iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: tag.toString('base64') };
}

function openWith(key: Buffer, wrapped: WrappedKey): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(wrapped.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(wrapped.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(wrapped.ciphertext, 'base64')), decipher.final()]);
}

export class Vault {
  readonly #keyring: Keyring;
  readonly #docs = new Map<string, SealedDocument>();

  constructor(keyring: Keyring) {
    this.#keyring = keyring;
  }

  put(id: string, plaintext: Buffer, meta: Record<string, string> = {}): SealedDocument {
    if (!id.trim()) throw new Error('document id is required');
    if (this.#docs.has(id)) throw new Error(`document ${id} already exists`);
    if (plaintext.length === 0) throw new Error('refusing to store an empty document');

    // The KEK version is recorded on the wrapped DEK, not on the content.
    const kekVersion = this.#keyring.currentVersion();
    const dek = randomBytes(32);
    const content = sealWith(dek, plaintext);
    const wrapped = sealWith(this.#keyring.get(kekVersion), dek);
    const doc: SealedDocument = {
      id,
      content,
      wrappedDek: { ...wrapped, keyVersion: kekVersion },
      meta,
      createdAt: new Date().toISOString(),
      bytes: plaintext.length,
    };
    this.#docs.set(id, doc);
    // Best effort: wipe the plaintext key from memory as soon as it is wrapped.
    dek.fill(0);
    return doc;
  }

  /**
   * Re-import a sealed document (restore from object storage, or migration between
   * nodes). Required for any real deployment: without it the vault has no recovery
   * path. Refuses to overwrite, and the ciphertext is only readable if this vault's
   * keyring holds the wrapping key.
   */
  importSealed(doc: SealedDocument): void {
    if (this.#docs.has(doc.id)) throw new Error(`document ${doc.id} already exists`);
    if (!this.#keyring.versions().includes(doc.wrappedDek.keyVersion)) {
      throw new Error(
        `document ${doc.id} is wrapped under key version ${doc.wrappedDek.keyVersion}, which this keyring does not hold`,
      );
    }
    // Prove the wrapping key actually opens the data key before accepting the
    // document. Discovering a wrong-key restore months later, during a client
    // request, is the failure mode this check exists to prevent.
    try {
      const dek = openWith(this.#keyring.get(doc.wrappedDek.keyVersion), doc.wrappedDek);
      dek.fill(0);
    } catch {
      throw new Error(`document ${doc.id} is wrapped under a key this vault cannot open`);
    }
    this.#docs.set(doc.id, doc);
  }

  get(id: string): Buffer {
    const doc = this.#docs.get(id);
    if (!doc) throw new Error(`document ${id} not found`);
    const dek = openWith(this.#keyring.get(doc.wrappedDek.keyVersion), doc.wrappedDek);
    try {
      return openWith(dek, doc.content);
    } finally {
      dek.fill(0);
    }
  }

  /** Metadata only — the shape a listing endpoint may return. */
  list(): Array<{ id: string; bytes: number; createdAt: string; keyVersion: number; meta: Record<string, string> }> {
    return [...this.#docs.values()].map((d) => ({
      id: d.id,
      bytes: d.bytes,
      createdAt: d.createdAt,
      keyVersion: d.wrappedDek.keyVersion,
      meta: d.meta,
    }));
  }

  /**
   * Re-wrap every data key under the current KEK. No content is decrypted to
   * persistent storage and no blob is rewritten — only 32 bytes per document.
   */
  rewrapAll(): { rewrapped: number; fromVersions: number[]; toVersion: number } {
    const target = this.#keyring.currentVersion();
    const fromVersions = new Set<number>();
    let rewrapped = 0;
    for (const [id, doc] of this.#docs) {
      if (doc.wrappedDek.keyVersion === target) continue;
      const dek = openWith(this.#keyring.get(doc.wrappedDek.keyVersion), doc.wrappedDek);
      fromVersions.add(doc.wrappedDek.keyVersion);
      const wrapped = sealWith(this.#keyring.get(target), dek);
      dek.fill(0);
      this.#docs.set(id, { ...doc, wrappedDek: { ...wrapped, keyVersion: target } });
      rewrapped++;
    }
    return { rewrapped, fromVersions: [...fromVersions].sort(), toVersion: target };
  }

  /**
   * Rotate the KEK and re-wrap every data key. Both steps in one call on purpose: a
   * rotation that forgets to re-wrap leaves documents pinned to an old key version,
   * which is how a "successful" rotation silently fails to retire the old key.
   */
  rotateKey(): { rewrapped: number; fromVersions: number[]; toVersion: number } {
    this.#keyring.rotate();
    return this.rewrapAll();
  }

  /** True when the stored ciphertext still decrypts to something (integrity smoke test). */
  integrityCheck(): { checked: number; failures: string[] } {
    const failures: string[] = [];
    let checked = 0;
    for (const id of this.#docs.keys()) {
      checked++;
      try {
        this.get(id);
      } catch (err) {
        failures.push(`${id}: ${(err as Error).message}`);
      }
    }
    return { checked, failures };
  }

  /** Prove a candidate key is not the stored one, without revealing either. */
  matchesKey(version: number, candidate: Buffer): boolean {
    const actual = this.#keyring.get(version);
    return actual.length === candidate.length && timingSafeEqual(actual, candidate);
  }
}
