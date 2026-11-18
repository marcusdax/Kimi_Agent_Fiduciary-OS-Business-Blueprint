/**
 * trust/ledger.ts — an append-only, hash-chained evidence ledger.
 *
 * Directly inspired by the "ACP-SQL immutable ledger" in the MASTERNEX blueprint,
 * but re-scoped for a fiduciary context: no tokens, no chain, no wallet. What
 * survives is the useful part — **protocol-first logging**, where an action cannot
 * be recorded as having happened without a verifiable, chained record of who asked
 * for it, under what authority, with what evidence, and what the outcome was.
 *
 * Why this is the highest-leverage trust feature in the product
 * ------------------------------------------------------------
 * A fiduciary's defence is not "we are careful"; it is a contemporaneous record.
 * Today the platform stores planning actions with an append-only-through-API event
 * list — but the *database* can still rewrite history, and an adviser exporting a
 * client file has no way to show it was not edited after the fact. A hash chain
 * gives every export a property a compliance officer can check offline:
 * recompute the hashes, and any altered or deleted entry breaks the chain at a
 * nameable position.
 *
 * Design decisions
 * ----------------
 * - **Append-only, never mutate.** There is no update or delete method. Corrections
 *   are new entries that reference the entry they supersede.
 * - **Canonical serialisation.** Field order is fixed and the payload is hashed
 *   separately, so the chain proves the *content* without us having to store
 *   sensitive details in the clear.
 * - **PII minimisation.** Payloads are hashed, not stored. The ledger proves that a
 *   document existed and was not changed; it does not become a second copy of the
 *   client's data.
 * - **Verifiable offline.** `verifyBundle` takes only the exported JSON.
 */
import { createHash, randomUUID, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import { MemoryLedgerStore, type LedgerStore } from '../store/ledger-store.ts';

export type LedgerAction =
  | 'plan.created'
  | 'plan.stage.advanced'
  | 'plan.authorization.granted'
  | 'plan.authorization.revoked'
  | 'plan.evidence.attached'
  | 'plan.evidence.verified'
  | 'advice.ai.generated'
  | 'advice.ai.reviewed'
  | 'data.exported'
  | 'client.share.created'
  | 'client.share.revoked';

export interface LedgerEntryInput {
  action: LedgerAction;
  /** Who acted: a user id, or `system:<job>` for automated steps. */
  actor: string;
  /** The client/household or entity the action concerns. */
  subject: string;
  /** Free-form, non-sensitive anchors (ids, stage names, versions). Never PII. */
  anchors?: Record<string, string | number | boolean | null>;
  /** The sensitive payload itself. Only its SHA-256 is retained. */
  payload?: unknown;
  /** For corrections: the entry id this one supersedes. */
  supersedes?: string;
}

export interface LedgerEntry {
  seq: number;
  id: string;
  at: string;
  action: LedgerAction;
  actor: string;
  subject: string;
  anchors: Record<string, string | number | boolean | null>;
  payloadHash: string | null;
  supersedes: string | null;
  prevHash: string;
  hash: string;
}

export interface LedgerBundle {
  ledgerId: string;
  version: 1;
  algorithm: 'sha256';
  entries: LedgerEntry[];
  headHash: string;
  exportedAt: string;
  /** Detached Ed25519 signature over `headHash`, when the ledger is configured with a key. */
  signature?: string;
  /**
   * Set when the bundle is a detached sub-chain for one subject. The first entry's
   * `prevHash` then anchors into history the recipient cannot see, which is what
   * makes the extract independently verifiable without disclosing other clients.
   */
  startSeq?: number;
}

export interface VerificationResult {
  valid: boolean;
  checked: number;
  /** Sequence number of the first broken link, if any. */
  brokenAt: number | null;
  reason: string | null;
  headHash: string;
  /**
   * `full` when every entry links to its predecessor (a complete ledger).
   * `per-entry` when the bundle is a subject-filtered sub-chain: each entry's own
   * content hash and sequence number are proven, but gaps are expected because
   * other subjects' entries are deliberately excluded. A verifier must not read
   * `per-entry` as "the history between these points is proven".
   */
  linkage: 'full' | 'per-entry';
}

const GENESIS = '0'.repeat(64);

/** Stable JSON: sorted keys, no whitespace. Without this, two equal objects can hash differently. */
export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalise(obj[k])}`).join(',')}}`;
}

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** The hash covers every field that must be tamper-evident, in a fixed order. */
function entryHash(e: Omit<LedgerEntry, 'hash'>): string {
  return sha256(
    [
      e.seq,
      e.id,
      e.at,
      e.action,
      e.actor,
      e.subject,
      canonicalise(e.anchors),
      e.payloadHash ?? '',
      e.supersedes ?? '',
      e.prevHash,
    ].join('|'),
  );
}

export class EvidenceLedger {
  readonly ledgerId: string;
  readonly store: LedgerStore;
  readonly #entries: LedgerEntry[] = [];
  #privateKey: string | null = null;
  #publicKey: string | null = null;

  constructor(ledgerId: string = randomUUID(), store: LedgerStore = new MemoryLedgerStore()) {
    this.ledgerId = ledgerId;
    this.store = store;
  }

  /**
   * Open a ledger over a durable store. The whole chain is verified on load and a
   * broken chain is fatal: serving evidence from a tampered store is worse than
   * refusing to start.
   */
  static open(store: LedgerStore, ledgerId: string = randomUUID()): EvidenceLedger {
    const ledger = new EvidenceLedger(ledgerId, store);
    for (const entry of store.load()) ledger.#entries.push(entry);
    const result = ledger.verify();
    if (!result.valid) {
      throw new Error(
        `refusing to start: ledger store failed verification at seq ${result.brokenAt ?? "?"} — ${result.reason}`,
      );
    }
    return ledger;
  }

  /** Configure an Ed25519 signing key so exported bundles can be authenticated offline. */
  withSigningKeys(privateKeyPem: string, publicKeyPem?: string): this {
    this.#privateKey = privateKeyPem;
    this.#publicKey = publicKeyPem ?? null;
    return this;
  }

  get publicKeyPem(): string | null {
    return this.#publicKey;
  }

  get length(): number {
    return this.#entries.length;
  }

  get head(): LedgerEntry | undefined {
    return this.#entries[this.#entries.length - 1];
  }

  /** Record an action. This is the only write path, and it only ever appends. */
  append(input: LedgerEntryInput, at: Date = new Date()): LedgerEntry {
    if (!input.actor.trim()) throw new Error('ledger entries require an actor');
    if (!input.subject.trim()) throw new Error('ledger entries require a subject');

    const prev = this.head;
    const base: Omit<LedgerEntry, 'hash'> = {
      seq: this.#entries.length,
      id: randomUUID(),
      at: at.toISOString(),
      action: input.action,
      actor: input.actor,
      subject: input.subject,
      anchors: input.anchors ?? {},
      payloadHash: input.payload === undefined ? null : sha256(canonicalise(input.payload)),
      supersedes: input.supersedes ?? null,
      prevHash: prev?.hash ?? GENESIS,
    };
    const entry: LedgerEntry = { ...base, hash: entryHash(base) };
    this.#entries.push(entry);
    this.store.append(entry);
    return entry;
  }

  entries(): readonly LedgerEntry[] {
    return [...this.#entries];
  }

  /** Everything needed to verify the history offline. Contains no payloads or PII. */
  exportBundle(): LedgerBundle {
    const headHash = this.head?.hash ?? GENESIS;
    return {
      ledgerId: this.ledgerId,
      version: 1,
      algorithm: 'sha256',
      entries: [...this.entries()],
      headHash,
      exportedAt: new Date().toISOString(),
      ...(this.#privateKey ? { signature: cryptoSign(null, Buffer.from(headHash, 'utf8'), this.#privateKey).toString('base64') } : {}),
    };
  }

  /** Full scan; returns the first break, because an auditor needs the position. */
  verify(): VerificationResult {
    return verifyBundle(this.exportBundle());
  }

  /** Entries for one subject, in order — the shape a client-file export needs. */
  forSubject(subject: string): LedgerEntry[] {
    return this.#entries.filter((e) => e.subject === subject);
  }
}

/**
 * Verify a bundle with no access to the server that produced it. This function is
 * the product claim: an exporter can hand this JSON plus this algorithm to a third
 * party and have them confirm nothing was altered.
 */
export function verifyBundle(bundle: LedgerBundle, publicKeyPem?: string): VerificationResult {
  const linkage: 'full' | 'per-entry' = bundle.startSeq === undefined ? 'full' : 'per-entry';

  if (bundle.version !== 1) {
    return { valid: false, checked: 0, brokenAt: null, reason: `unsupported bundle version ${bundle.version}`, headHash: bundle.headHash, linkage };
  }
  const startSeq = bundle.startSeq ?? 0;
  let prevHash = GENESIS;

  for (let i = 0; i < bundle.entries.length; i++) {
    const e = bundle.entries[i] as LedgerEntry;

    if (linkage === 'full') {
      if (e.seq !== startSeq + i) {
        return { valid: false, checked: i, brokenAt: e.seq, reason: `sequence gap at position ${i}: expected seq ${startSeq + i}, found ${e.seq}`, headHash: bundle.headHash, linkage };
      }
      if (i === 0 && e.prevHash !== GENESIS) {
        return { valid: false, checked: 0, brokenAt: e.seq, reason: 'the first entry does not chain from the genesis hash', headHash: bundle.headHash, linkage };
      }
      if (i > 0 && e.prevHash !== prevHash) {
        return { valid: false, checked: i, brokenAt: e.seq, reason: `link break at seq ${e.seq}: prevHash does not match the preceding entry`, headHash: bundle.headHash, linkage };
      }
    } else if (i > 0 && e.seq <= (bundle.entries[i - 1]?.seq ?? -1)) {
      return { valid: false, checked: i, brokenAt: e.seq, reason: `sub-chain sequence is not strictly increasing at position ${i}`, headHash: bundle.headHash, linkage };
    }

    const { hash, ...rest } = e;
    if (entryHash(rest) !== hash) {
      return { valid: false, checked: i, brokenAt: e.seq, reason: `content hash mismatch at seq ${e.seq}: entry was modified after it was written`, headHash: bundle.headHash, linkage };
    }
    prevHash = hash;
  }

  const expectedHead = bundle.entries[bundle.entries.length - 1]?.hash ?? GENESIS;
  if (bundle.headHash !== expectedHead) {
    return { valid: false, checked: bundle.entries.length, brokenAt: null, reason: 'headHash does not match the final entry: the tail of the ledger was altered or truncated', headHash: bundle.headHash, linkage };
  }

  // An attached signature is only meaningful if we have a key to check it against;
  // callers that require authenticity must pass the key.
  if (publicKeyPem) {
    if (!bundle.signature) {
      return { valid: false, checked: bundle.entries.length, brokenAt: null, reason: 'bundle is unsigned but a public key was supplied', headHash: expectedHead, linkage };
    }
    const ok = cryptoVerify(
      null,
      Buffer.from(bundle.headHash, 'utf8'),
      publicKeyPem,
      Buffer.from(bundle.signature, 'base64'),
    );
    if (!ok) {
      return { valid: false, checked: bundle.entries.length, brokenAt: null, reason: 'signature does not verify against the supplied public key', headHash: expectedHead, linkage };
    }
  }

  return { valid: true, checked: bundle.entries.length, brokenAt: null, reason: null, headHash: expectedHead, linkage };
}
export function extractSubChain(bundle: LedgerBundle, subject: string): LedgerBundle {
  const entries = bundle.entries.filter((e) => e.subject === subject);
  return {
    ledgerId: bundle.ledgerId,
    version: 1,
    algorithm: 'sha256',
    entries,
    headHash: entries[entries.length - 1]?.hash ?? GENESIS,
    exportedAt: new Date().toISOString(),
    startSeq: entries[0]?.seq ?? 0,
  };
}
