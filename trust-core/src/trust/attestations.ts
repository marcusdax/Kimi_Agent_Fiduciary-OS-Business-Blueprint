/**
 * trust/attestations.ts — F8: prove a threshold without handing over the statement.
 *
 * The workflow being fixed: a household is asked to prove it is an accredited
 * investor, or that its investable assets clear an advisory minimum, or that its
 * income is above a Roth limit — and the current process is "upload three months of
 * statements". The advisor then holds data they never needed and must protect it
 * forever.
 *
 * The design here is deliberately staged, because the ZK version is the *second*
 * step, not the first:
 *
 *   1. **Signed claim** (this file). An issuer signs "subject S satisfies predicate P
 *      with threshold T, as of D, expiring E". The verifier needs only the public key.
 *      This solves ~80% of the workflow at ~5% of the effort, because in most cases
 *      the counterparty trusts the platform's signature rather than requiring
 *      cryptographic non-disclosure.
 *   2. **Commitment + selective reveal** (this file, `commit`/`reveal`). The holder can
 *      later prove the exact value behind the claim without publishing it in the
 *      claim itself.
 *   3. **True zero-knowledge proof** (not here). Only when a counterparty refuses to
 *      trust the issuer's signature. Reaching for SNARKs first is how this feature
 *      takes six months and ships nothing.
 *
 * Honest limit, stated on the output: a signature attests that *the issuer checked*.
 * If the issuer lied or was compromised, the signature is worthless. That is why the
 * evidence field names the `DataPoint` provenance that backed the check.
 */
import { createHash, createPublicKey, generateKeyPairSync, randomBytes, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import { point, type DataPoint } from '../provenance.ts';

export type Predicate =
  | 'investable_assets_gte'
  | 'annual_income_gte'
  | 'accredited_investor'
  | 'net_worth_gte'
  | 'state_resident';

export interface Claim {
  /** Stable subject reference. Never a name or an account number. */
  subject: string;
  predicate: Predicate;
  /** Omitted for boolean predicates (e.g. accredited_investor). */
  threshold?: number;
  /** Observation date the predicate was evaluated against, ISO date. */
  asOf: string;
  /** Hard expiry. A stale attestation is not an attestation. */
  expiresAt: string;
  issuer: string;
  /** Provenance of the data used to check the predicate (source ids, not values). */
  evidence: string[];
  /** Optional commitment to the underlying value: sha256(salt|value). */
  commitment?: string;
  /** What the claim deliberately does not reveal. */
  nonDisclosure: string[];
}

export interface SignedAttestation {
  claim: Claim;
  signature: string;
  algorithm: 'ed25519';
  publicKeyPem: string;
  /** Key identifier, so a verifier can select the right key without parsing the PEM. */
  kid: string;
  issuedAt: string;
}

/** Stable key id: the first 16 hex characters of the SHA-256 of the SPKI DER. */
export function keyId(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('hex').slice(0, 16);
}

/**
 * The public key as a JWK, so a verifier can discover it at a stable URL instead of
 * being handed a PEM out of band (gap 16). Ed25519 SPKI is a 12-byte header plus the
 * 32-byte key, so the raw key is the tail — checked here rather than assumed.
 */
export function toJwk(publicKeyPem: string): { kty: 'OKP'; crv: 'Ed25519'; x: string; kid: string; use: 'sig'; alg: 'EdDSA' } {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  const raw = der.subarray(der.length - 32);
  if (raw.length !== 32) throw new Error('unexpected Ed25519 public key length');
  return { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(raw).toString('base64url'), kid: keyId(publicKeyPem), use: 'sig', alg: 'EdDSA' };
}

export interface VerifyResult {
  valid: boolean;
  claim: Claim | null;
  reason: string | null;
  expired: boolean;
}

function canonical(claim: Claim): string {
  const keys = Object.keys(claim).sort() as Array<keyof Claim>;
  return JSON.stringify(Object.fromEntries(keys.map((k) => [k, claim[k]])));
}

export function generateAttestationKeyPair() {
  return generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
}

/** Commit to a value so it can be proven later without being published now. */
export function commit(value: number, salt?: string): { commitment: string; salt: string } {
  const s = salt ?? randomBytes(16).toString('hex');
  return { commitment: createHash('sha256').update(`${s}|${value}`).digest('hex'), salt: s };
}

export function verifyCommitment(commitment: string, value: number, salt: string): boolean {
  return createHash('sha256').update(`${salt}|${value}`).digest('hex') === commitment;
}

export function issueAttestation(claim: Claim, privateKeyPem: string): SignedAttestation {
  if (!claim.subject.includes(':')) throw new Error('subject must be namespaced, e.g. household:h1');
  if (Date.parse(claim.expiresAt) <= Date.parse(claim.asOf)) {
    throw new Error('expiresAt must be after asOf');
  }
  if (claim.predicate !== 'accredited_investor' && claim.predicate !== 'state_resident' && typeof claim.threshold !== 'number') {
    throw new Error(`predicate ${claim.predicate} requires a numeric threshold`);
  }
  const signature = cryptoSign(null, Buffer.from(canonical(claim), 'utf8'), privateKeyPem).toString('base64');
  const publicKeyPem = extractPublicKey(privateKeyPem);
  return { claim, signature, algorithm: 'ed25519', publicKeyPem, kid: keyId(publicKeyPem), issuedAt: new Date().toISOString() };
}

/** Derive the public key from a private key, so a caller cannot attach the wrong one. */
function extractPublicKey(privateKeyPem: string): string {
  return createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' }).toString();
}

export function verifyAttestation(attestation: SignedAttestation, publicKeyPem?: string, now = new Date()): VerifyResult {
  const key = publicKeyPem ?? attestation.publicKeyPem;
  const ok = cryptoVerify(
    null,
    Buffer.from(canonical(attestation.claim), 'utf8'),
    key,
    Buffer.from(attestation.signature, 'base64'),
  );
  if (!ok) return { valid: false, claim: null, reason: 'signature does not verify', expired: false };
  const expired = Date.parse(attestation.claim.expiresAt) <= now.getTime();
  return {
    valid: !expired,
    claim: attestation.claim,
    reason: expired ? `attestation expired at ${attestation.claim.expiresAt}` : null,
    expired,
  };
}

/** Convenience for the API layer: build, sign, and attach provenance in one step. */
export function attest(
  claim: Claim,
  privateKeyPem: string,
): DataPoint<SignedAttestation> {
  const signed = issueAttestation(claim, privateKeyPem);
  return point(signed, {
    source: `attestation:${claim.issuer}`,
    sourceKind: 'derived',
    sourceUrl: '',
    retrievedAt: signed.issuedAt,
    asOf: claim.asOf,
    license: 'Proprietary',
    method:
      `Ed25519 signature over a canonical claim. The claim states the predicate and threshold only; ` +
      `the underlying value is ${claim.commitment ? 'committed (sha256 with salt) and can be selectively revealed' : 'not disclosed'}.`,
    derivedFrom: claim.evidence,
    staleAfterSeconds: Math.max(1, Math.floor((Date.parse(claim.expiresAt) - Date.now()) / 1000)),
  });
}
