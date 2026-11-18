/**
 * security/kms-keyring.ts — gap 15: move key material out of the process.
 *
 * The vault's `Keyring` interface was backed by an in-memory keyring, which is fine for
 * tests and wrong for production: a restart loses the keys, and a compromise of the app
 * process is a compromise of every document.
 *
 * This adapter reads key material from an HTTP key service (KMS, Vault Transit, an
 * internal key broker) that exposes:
 *
 *   GET  {base}/keys           -> { current: number, versions: number[] }
 *   GET  {base}/keys/{version} -> { key: base64 }   (32 bytes, AES-256)
 *   POST {base}/rotate         -> { version: number }
 *
 * Why it is a *loader*, not a live client: `Vault` is synchronous by design (a decrypt
 * must not become an async operation that can be timed), so keys are loaded at boot and
 * after an explicit rotation. A missing key fails closed — the vault throws rather than
 * inventing material.
 *
 * The interface is deliberately narrow. Anything richer — envelope callbacks, HSM
 * sessions — belongs in the KMS client, not in this file.
 */
import { Buffer } from 'node:buffer';
import type { Keyring } from './vault.ts';

export interface RemoteKeyringConfig {
  /** Base URL of the key service, e.g. https://kms.internal/v1/ledger */
  baseUrl: string;
  /** Bearer token for the key service. Never logged. */
  token?: string;
  /** Per-request timeout. */
  timeoutMs: number;
}

export class RemoteKeyringError extends Error {
  override readonly name = 'RemoteKeyringError';
  constructor(message: string) {
    super(message);
  }
}

export class HttpKeyring implements Keyring {
  readonly #config: RemoteKeyringConfig;
  readonly #keys = new Map<number, Buffer>();
  #current = 0;

  constructor(config: RemoteKeyringConfig) {
    this.#config = config;
  }

  #headers(): Record<string, string> {
    return {
      Accept: 'application/json',
      ...(this.#config.token ? { Authorization: `Bearer ${this.#config.token}` } : {}),
    };
  }

  async #getJson<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
    const url = `${this.#config.baseUrl.replace(/\/+$/, '')}${path}`;
    const res = await fetch(url, { method, headers: this.#headers(), signal: AbortSignal.timeout(this.#config.timeoutMs) });
    if (!res.ok) throw new RemoteKeyringError(`key service returned HTTP ${res.status} for ${path}`);
    return (await res.json()) as T;
  }

  /** Load the current version and every version it lists. Call this at boot. */
  async load(): Promise<void> {
    const manifest = await this.#getJson<{ current: number; versions: number[] }>('/keys');
    if (!Number.isInteger(manifest.current) || manifest.current < 1) {
      throw new RemoteKeyringError('key service returned an invalid current version');
    }
    if (!Array.isArray(manifest.versions) || manifest.versions.length === 0) {
      throw new RemoteKeyringError('key service returned no key versions');
    }
    for (const version of manifest.versions) {
      await this.fetchVersion(version);
    }
    this.#current = manifest.current;
  }

  async fetchVersion(version: number): Promise<void> {
    const body = await this.#getJson<{ key: string }>(`/keys/${version}`);
    const key = Buffer.from(body.key, 'base64');
    // A short key must never become a quietly weaker cipher.
    if (key.length !== 32) throw new RemoteKeyringError(`key version ${version} is ${key.length} bytes; expected 32`);
    this.#keys.set(version, key);
  }

  currentVersion(): number {
    if (this.#current === 0) throw new RemoteKeyringError('keyring has not been loaded; call load() at boot');
    return this.#current;
  }

  get(version: number): Buffer {
    const key = this.#keys.get(version);
    if (!key) throw new RemoteKeyringError(`key version ${version} is not loaded; refusing to proceed`);
    return key;
  }

  versions(): number[] {
    return [...this.#keys.keys()].sort((a, b) => a - b);
  }

  /**
   * Rotate through the key service. Separate from `Keyring.rotate()` because rotation
   * is an async round trip and the sync interface would have to lie about it.
   */
  async rotateRemote(): Promise<number> {
    const body = await this.#getJson<{ version: number }>('/rotate', 'POST');
    if (!Number.isInteger(body.version)) throw new RemoteKeyringError('key service returned an invalid rotation response');
    await this.fetchVersion(body.version);
    this.#current = body.version;
    return body.version;
  }

  /** Present for interface compatibility; remote rotation must go through rotateRemote(). */
  rotate(): number {
    throw new RemoteKeyringError('remote keyring cannot rotate synchronously; call rotateRemote()');
  }

  /** True when every listed version has material loaded. */
  isReady(): boolean {
    return this.#current > 0 && this.#keys.has(this.#current);
  }
}
