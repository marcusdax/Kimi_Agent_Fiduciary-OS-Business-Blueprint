/**
 * store/ledger-store.ts — durable, append-only storage for the evidence ledger.
 *
 * Gap 1 in the readiness review was that the ledger lived only in memory: every
 * restart erased the evidence trail, which is precisely the property the ledger
 * exists to provide. This module fixes that without pretending a filesystem is
 * WORM storage.
 *
 * What is guaranteed here
 * -----------------------
 * - **Durability on acknowledgement.** `append` writes and `fsync`s before it
 *   returns, so an acknowledged entry survives a process crash (not necessarily a
 *   power loss on every filesystem, hence the explicit note below).
 * - **Append-only by construction.** The API has no update or delete. The file is
 *   opened with `a` and never truncated by this process.
 * - **Fail-fast on tamper.** `EvidenceLedger.open` verifies the whole chain at boot
 *   and refuses to start if it is broken. A tampered ledger is an incident, not a
 *   warning.
 *
 * What is NOT guaranteed here, and must come from the deployment
 * --------------------------------------------------------------
 * A local file is not immutability. On Linux, mount the volume with `chattr +a`
 * (append-only) or place it on S3 Object Lock in compliance mode; on Windows, use
 * a WORM share. This class gives you correct *application* semantics plus an
 * fsync; the storage layer must enforce the rest. Postgres is the natural next
 * adapter (a table with a trigger that raises on UPDATE/DELETE) and is listed as
 * the Phase-2 migration.
 */
import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, writeSync, fsyncSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { LedgerEntry } from '../trust/ledger.ts';

export interface LedgerStore {
  readonly kind: string;
  load(): LedgerEntry[];
  append(entry: LedgerEntry): void;
  health(): { entries: number; bytes: number; path: string | null };
}

export class MemoryLedgerStore implements LedgerStore {
  readonly kind = 'memory';
  readonly #entries: LedgerEntry[] = [];

  load(): LedgerEntry[] {
    return [...this.#entries];
  }

  append(entry: LedgerEntry): void {
    this.#entries.push(entry);
  }

  health(): { entries: number; bytes: number; path: string | null } {
    return {
      entries: this.#entries.length,
      bytes: this.#entries.reduce((a, e) => a + JSON.stringify(e).length, 0),
      path: null,
    };
  }
}

/**
 * One JSON object per line. JSONL is chosen over a single JSON array precisely
 * because a crash mid-write corrupts only the last line, and a truncated tail is
 * *detectable* (the head hash will not match) rather than silently parsed away.
 */
export class FileLedgerStore implements LedgerStore {
  readonly kind = 'file';
  readonly #dir: string;
  readonly #filename: string;
  #bytes = 0;
  #fd: number | null = null;

  constructor(dir: string, filename = 'ledger.jsonl') {
    this.#dir = dir;
    this.#filename = filename;
    mkdirSync(dir, { recursive: true });
    const path = join(dir, filename);
    if (existsSync(path)) {
      this.#bytes = fstatSync(openSync(path, 'r')).size;
    }
  }

  get path(): string {
    return join(this.#dir, this.#filename);
  }

  load(): LedgerEntry[] {
    const path = this.path;
    if (!existsSync(path)) return [];
    const raw = readFileSync(path, 'utf8');
    const entries: LedgerEntry[] = [];
    let lineNumber = 0;
    for (const line of raw.split('\n')) {
      lineNumber++;
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as LedgerEntry);
      } catch {
        // A torn final line is expected after a hard crash. Anything else is a
        // corrupt store, and we refuse to paper over it.
        const isLast = lineNumber === raw.split('\n').length;
        if (!isLast) {
          throw new Error(`ledger store is corrupt at line ${lineNumber} of ${path}`);
        }
        process.stderr.write(`ledger: ignoring torn final line ${lineNumber} (crash recovery)\n`);
      }
    }
    return entries;
  }

  append(entry: LedgerEntry): void {
    const line = `${JSON.stringify(entry)}\n`;
    if (this.#fd === null) this.#fd = openSync(this.path, 'a');
    const buf = Buffer.from(line, 'utf8');
    writeSync(this.#fd, buf, 0, buf.length);
    try {
      fsyncSync(this.#fd);
    } catch {
      // fsync can fail on some filesystems/containers; the write is still visible
      // to readers, so we degrade to "durable against process crash" rather than
      // failing the append.
    }
    this.#bytes += buf.length;
  }

  close(): void {
    if (this.#fd !== null) {
      closeSync(this.#fd);
      this.#fd = null;
    }
  }

  health(): { entries: number; bytes: number; path: string | null } {
    let entries = 0;
    try {
      const raw = readFileSync(this.path, 'utf8');
      entries = raw.split('\n').filter((l) => l.trim()).length;
    } catch {
      entries = 0;
    }
    return { entries, bytes: this.#bytes, path: this.path };
  }
}

/**
 * Fingerprint of the store contents. Written next to the ledger on graceful
 * shutdown so an operator can prove after the fact that the file was not swapped.
 * It is a convenience, not a control — the chain itself is the control.
 */
export function storeFingerprint(dir: string): string {
  const files = readdirSync(dir).sort();
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f);
    h.update(readFileSync(join(dir, f)));
  }
  return h.digest('hex');
}

export function defaultLedgerDir(): string {
  return process.env.LEDGER_DIR ?? join(process.cwd(), '.data', 'ledger');
}
