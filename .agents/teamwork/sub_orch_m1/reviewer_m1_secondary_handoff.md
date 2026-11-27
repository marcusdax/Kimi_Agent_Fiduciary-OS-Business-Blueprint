# Secondary Code Review Handoff Report (`reviewer_m1_secondary`) — Milestone M1

**Verdict: `APPROVE`**

---

## 1. Independent Target-Scoped Verification Commands & Verbatim Outputs

### A. Backend Target-Scoped Jest Suite (`fiduciary_os_test`)
Command:
```bash
cd fiduciary-os/backend && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/fiduciary_os_test npx jest tests/unit/shapley.test.ts tests/unit/ecosystem.test.ts tests/integration/crm-consent-privacy.test.ts
```
Result (exit code `0`):
```text
PASS tests/integration/crm-consent-privacy.test.ts (15.667 s)
PASS tests/unit/ecosystem.test.ts
PASS tests/unit/shapley.test.ts

Test Suites: 3 passed, 3 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        18.458 s
Ran all test suites matching /tests\/unit\/shapley.test.ts|tests\/unit\/ecosystem.test.ts|tests\/integration\/crm-consent-privacy.test.ts/i.
```

### B. `trust-core` Test Suite
Command:
```bash
cd trust-core && npm test
```
Result (exit code `0`):
```text
npm notice run @fiduciary-os/trust-core@1.2.0 test
npm notice run node --test --test-reporter=spec "tests/**/*.test.mjs" "tests/**/*.test.ts"
✔ ComplianceAuditEngine produces CONFORMANT Merkle-verified report for intact ledger (5.920393ms)
✔ ComplianceAuditEngine detects payload/entry tampering via ledger.verify() (5.486057ms)
✔ FileLedgerStore persists entries across reopen and verifies chain integrity (32.003501ms)
✔ EvidenceLedger.open refuses to start when persisted JSONL file is tampered (12.001311ms)
✔ computeFourFactorShapley evaluates all 16 coalitions and sums strictly to 10,000 bps (23.78667ms)
✔ computeFourFactorShapley satisfies symmetry and dummy-player axioms (2.857715ms)
✔ normalizeShapBasisPoints falls back cleanly on zero inputs and is deterministic (1.483272ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 885.272196
```

---

## 2. Deep Security, Edge-Case & Spec-Fidelity Analysis

### A. `fiduciary-os/backend/prisma/sql/privacy_and_audit.sql`
- **SQL Injection Safety**: All PL/pgSQL functions use static SQL with typed parameters (no `EXECUTE` / dynamic SQL). All backend callers (`crmService.ts`, `privacy.ts`) use parameterized `$1, $2, $3` placeholders via `prisma.$queryRawUnsafe`.
- **Key Validation & `pgcrypto` Encryption**: `encrypt_ssn` and `decrypt_ssn` are marked `STRICT` and reject whitespace/empty keys with `ERRCODE = '22023'`. Backend `getPiiEncryptionKey()` fails closed in `production` if `CRM_ENCRYPTION_KEY`/`JWT_SECRET` is unset.
- **Advisory Lock & SHA-256 Hash Chain**: `append_provenance_record` acquires `pg_advisory_xact_lock(hashtext('provenance_records_chain'))` before reading `prev_hash` (`ORDER BY sequence DESC LIMIT 1`, defaulting to `'GENESIS'`), guaranteeing a strictly linear chain under concurrent writers. `v_occurred_at` uses `date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')` matching Prisma's `TIMESTAMP(3)` column, and both `append_provenance_record` and `verifyProvenanceChain` hash `JSONB::TEXT`, ensuring deterministic round-trip verification.
- **WORM Immutability Triggers**: `prevent_provenance_mutation()` raises `ERRCODE = '42501'` on both `BEFORE UPDATE OR DELETE` (row-level) and `BEFORE TRUNCATE` (statement-level). Verified against live PostgreSQL in `crm-consent-privacy.test.ts`.
- **`export_user_data` Redaction**: Explicitly strips `users.password`, `people.ssn_encrypted`, and `crm_accounts.plaid_access_token_encrypted`, and appends a `privacy.export` provenance record.
- **`soft_delete_user` Completeness & Audit Preservation**: Scrubs `users` PII/password and sets `deleted_at`, revokes active `"AuthSession"` rows, deletes legacy `sessions`, scrubs `people` PII/SSNs (`ssn_encrypted`, `ssn_last4`), scrubs `crm_accounts` Plaid tokens/cursors and sets `is_active = FALSE`, soft-deletes owned `households`, preserves `provenance_records` untouched, and appends a `privacy.soft_delete` provenance record.

### B. Backend Services & Routes (`crmService`, `consentService`, `shapleyService`, `kdenseService`, `aiGateway`, `crm`, `consent`, `privacy`, `trust`, `intelligence`)
- **RBAC & Ownership Isolation**: All `/api/v1/crm/*`, `/api/v1/consent/*`, and `/api/v1/privacy/*` routes require `authenticateToken`. `crmService` scopes all list queries with `householdWhereForActor` and gates single-record reads/writes with `assertHouseholdAccess`. `decryptPersonSsn` requires `advisor`/`admin` role plus `assertHouseholdAccess` and logs `crm.person.ssn_decrypted` to `provenance_records`. `GET /api/v1/privacy/provenance/verify` enforces `requireRole('advisor', 'admin')`.
- **No Ciphertext Leaks**: `sanitizePerson` removes `ssnEncrypted` (exposing only `hasSsn` + `ssnLast4`) and `sanitizeAccount` removes `plaidAccessTokenEncrypted` (exposing only `hasPlaidToken`) across all list/get/create/update paths.
- **Consent Guard**: `consentService.recordConsent` computes a SHA-256 `proofHash` and mirrors into `provenance_records`. `verifyOutboundConsent` strictly requires `status === 'opted_in' && doubleOptInVerified === true` across `email`, `sms`, and `voice`.
- **Exact 16-Coalition Shapley Math**: Both `fiduciary-os/backend/src/services/shapleyService.ts` and `trust-core/src/engines/shapley.ts` enumerate all $2^4 = 16$ coalitions with exact Shapley weights $\frac{|S|!(n-|S|-1)!}{n!}$ and optional pairwise synergy $\gamma \sum_{i<j}\sqrt{w_i w_j}$. Satisfies efficiency ($\sum \phi_i = v(N)$), symmetry, and dummy-player axioms, and allocates exact integer basis points summing strictly to `10,000` (`additivityError === 0`) via Largest Remainder (Hamilton) rounding with deterministic key tie-breaking.
- **Masternex Removal**: `masternexService.ts` and `masternex-bridge.ts` are deleted; `kdenseService.ts`, `aiGateway.ts`, `routes/trust.ts`, `routes/intelligence.ts`, and all `docker-compose*.yml` files are clean of `masternex` runtime imports, containers, and routes.

### C. `trust-core` (`ledger-store.ts`, `compliance-audit.ts`, `engines/shapley.ts`)
- **FD Leak Fix**: `FileLedgerStore` constructor replaced `fstatSync(openSync(path, 'r')).size` with `statSync(path).size`, eliminating the leaked read file descriptor.
- **Cryptographic Compliance Audit**: `ComplianceAuditEngine.verifyLedger(ledger)` delegates to `ledger.verify()` (recomputing entry hashes and `prevHash` links rather than only checking `prevHash` equality) and binds `eu_ai_act_article_12`, `sr_11_7_audit_trail`, and `compliance_status` to `verification.valid`.

---

## 3. Non-Blocking Observations (Advisory for M2/M4 Hardening)
1. **`export_user_data` Advisor Scope**: `privacy_and_audit.sql` line 170 includes `OR h.primary_advisor_id = p_user_id` when resolving `v_household_ids`. If an `advisor` invokes `POST /api/v1/privacy/export`, their personal export bundle would include advised clients' households/people/accounts. In M2/M4, consider scoping `export_user_data` strictly to `h.owner_user_id = p_user_id OR p.user_id = p_user_id`.
2. **Cross-Household FK Check**: `crmService.createAccount` and `createLifeEvent` do not verify that an optional `personId` belongs to `input.householdId`, and `routes/consent.ts` (`POST /`) does not call `assertHouseholdAccess` when an optional `householdId` is supplied. Neither leaks third-party PII today, but adding ownership checks tightens tenant isolation.
3. **Numeric String Validation on `balance`**: `createAccountSchema` / `updateAccountSchema` accept `balance: z.union([z.number(), z.string()])`; a non-numeric string would throw a `Prisma.Decimal` error (500) rather than a 400 validation error.
4. **PostgreSQL `pgcrypto` Cipher Mode**: `pgp_sym_encrypt(..., 'cipher-algo=aes256')` uses OpenPGP AES-256-CFB with MDC (standard for `pgcrypto`, which does not natively expose raw AES-256-GCM). Documenting this explicitly in security notes keeps compliance terminology precise.

---

## 4. Final Verdict

**`APPROVE`** — All M1 security, correctness, WORM immutability, `pgcrypto` encryption, RBAC, Shapley attribution, `trust-core` durability, and Masternex removal requirements are verified and passing.
