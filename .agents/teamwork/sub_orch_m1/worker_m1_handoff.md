# Worker M1 Handoff Report — PostgreSQL + `pgcrypto` Household Graph CRM, WORM/Consent Schema & Masternex Removal

## Summary of Implemented Changes

### 1. Prisma Schema & PostgreSQL PL/pgSQL (`fiduciary-os/backend/prisma/`)
- Updated `fiduciary-os/backend/prisma/schema.prisma`:
  - Added `deletedAt DateTime? @map("deleted_at")` and non-breaking relations (`ownedHouseholds`, `advisedHouseholds`, `personProfile`, `consentRecords`) to `User`.
  - Added 7 new snake_case-mapped models: `Household` (`households`), `Person` (`people`), `CrmAccount` (`crm_accounts`), `Appointment` (`appointments`), `LifeEvent` (`life_events`), `ConsentRecord` (`consent_records`), and `ProvenanceRecord` (`provenance_records`, intentionally without a FK to `users` so user/test cleanup never triggers `DELETE` on the immutable table).
- Created idempotent `fiduciary-os/backend/prisma/sql/privacy_and_audit.sql`:
  - Enables `pgcrypto`.
  - Defines `encrypt_ssn(p_plaintext TEXT, p_key TEXT)` (AES-256 `pgp_sym_encrypt` with non-empty key guard) and `decrypt_ssn(p_ciphertext BYTEA, p_key TEXT)`.
  - Defines `prevent_provenance_mutation()` raising `ERRCODE = '42501'` and attaches `BEFORE UPDATE OR DELETE` and `BEFORE TRUNCATE` triggers on `provenance_records`.
  - Defines `append_provenance_record(p_actor_id TEXT, p_record_type TEXT, p_payload JSONB)` serialized with `pg_advisory_xact_lock(hashtext('provenance_records_chain'))` and SHA-256 hash chaining (`GENESIS` -> `row_hash`) using `TIMESTAMP(3)` UTC precision aligned with Prisma's `DateTime` column.
  - Defines `export_user_data(p_user_id TEXT)` returning a full JSONB bundle excluding `users.password`, `people.ssn_encrypted`, and `crm_accounts.plaid_access_token_encrypted`, and appending a `privacy.export` provenance row.
  - Defines `soft_delete_user(p_user_id TEXT)` scrubbing user PII/password, revoking `"AuthSession"` and deleting `sessions`, scrubbing `people` PII/SSNs, scrubbing `crm_accounts` Plaid tokens and deactivating accounts, soft-deleting owned `households`, preserving `provenance_records` untouched, and appending a `privacy.soft_delete` provenance row.
- Ran `npm run db:generate` and applied `prisma db push --skip-generate` + `privacy_and_audit.sql` additively to BOTH `fiduciary_os` (23 tables, all 5 existing dev users preserved) and `fiduciary_os_test`.

### 2. Native Backend Services & Routes (`fiduciary-os/backend/src/`)
- `src/services/shapleyService.ts`: Exact 4-factor cooperative-game Shapley attribution enumerating all $2^4 = 16$ coalitions with optional `synergyWeight` and deterministic Largest Remainder 10,000-bps integer allocation (`sumBps === 10000`, `additivityError === 0`).
- `src/services/crmService.ts`: Full RBAC-scoped CRUD (`client`, `advisor`, `admin`) for Households, People (with `pgcrypto` SSN encryption, `ssnLast4`, never returning `ssnEncrypted`, plus authorized `decryptPersonSsn`), CrmAccounts (encrypting `plaidAccessToken`), Appointments, LifeEvents, plus `appendProvenance` and `verifyProvenanceChain`.
- `src/services/consentService.ts`: `recordConsent` (SHA-256 `proofHash` + provenance mirror), `listConsent`, and `verifyOutboundConsent(userId, channel)` enforcing double-opt-in (`opted_in` + `doubleOptInVerified === true`) across `email`, `sms`, and `voice`.
- `src/routes/crm.ts`, `src/routes/consent.ts`, `src/routes/privacy.ts`: Zod-validated Express routes protected by `authenticateToken` (and `requireRole('advisor', 'admin')` on `GET /api/v1/privacy/provenance/verify`), mounted in `src/index.ts`.

### 3. Complete `MASTERNEX.os` Decommissioning & Durable `trust-core` Ledger
- Deleted `fiduciary-os/backend/src/services/masternexService.ts`.
- Updated `fiduciary-os/backend/src/routes/trust.ts`, `src/routes/intelligence.ts`, `src/services/kdenseService.ts`, and `src/services/aiGateway.ts` to remove all `masternex` imports, HTTP calls, and MCP registrations, wiring native Shapley, `aiGuardrails`, `ProvenanceRecord`, and `trust-core` (`GET /api/v1/ledger/audit` and `trust-core/src/trust/attestations.ts`).
- Updated `fiduciary-os/docker-compose.yml`, `docker-compose.dev.yml`, and `docker-compose.ecosystem.yml` to remove the `masternex` service, `MASTERNEX_*` env vars, and `ecosystem_masternex_data` volume, and switched `trust-core` to `LEDGER_MODE: file`, `LEDGER_DIR: /app/.data/ledger` with persistent named volumes (`trust_core_ledger`, `dev_trust_core_ledger`, `ecosystem_trust_core_ledger`).
- In `trust-core/`:
  - Fixed FD leak in `trust-core/src/store/ledger-store.ts` (`statSync(path).size`).
  - Replaced `trust-core/src/trust/masternex-bridge.ts` with `trust-core/src/trust/compliance-audit.ts` (`ComplianceAuditEngine`, delegating integrity checks to `ledger.verify()`).
  - Added `trust-core/src/engines/shapley.ts`.
  - Updated `trust-core/src/server.ts`, `trust-core/src/mcp/main.ts`, and `trust-core/src/mcp/server.ts`.
  - Deleted `trust-core/tests/masternex-bridge.test.mjs` and added native TypeScript tests `trust-core/tests/unit/{ledger-durable,compliance-audit,shapley}.test.ts`.

### 4. Backend Tests (`fiduciary-os/backend/tests/`)
- Updated `tests/setup.ts` to clean mutable CRM/Consent tables before `user.deleteMany()` while never touching `provenance_records`.
- Updated `tests/unit/ecosystem.test.ts` to verify 1 MCP server (`trust-core`) and `services.masternex === undefined`.
- Added `tests/unit/shapley.test.ts` (6 tests) and `tests/integration/crm-consent-privacy.test.ts` (3 comprehensive PostgreSQL integration tests covering CRM CRUD, `pgcrypto` SSN encryption/decryption, RBAC isolation, double-opt-in consent guard, GDPR/CCPA export & soft-delete, hash-chain verification, and PostgreSQL `42501` WORM immutability triggers for `UPDATE`, `DELETE`, and `TRUNCATE`).

---

## Verification Results (Exact Commands & Verbatim Outputs)

### 1. Backend Type-Check & Jest Suite (`fiduciary_os_test`)
Command:
```bash
cd fiduciary-os/backend && npm run type-check && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/fiduciary_os_test npm test
```
Result (exit code `0`):
```
npm notice run @fiduciary-os/backend@1.0.0 type-check
npm notice run tsc --noEmit
npm notice run @fiduciary-os/backend@1.0.0 test
npm notice run jest
...
Test Suites: 14 passed, 14 total
Tests:       110 passed, 110 total
Snapshots:   0 total
Time:        19.553 s
Ran all test suites.
```

### 2. `trust-core` Type-Check & Test Suite
Command:
```bash
cd trust-core && npm run type-check && npm test
```
Result (exit code `0`):
```
npm notice run @fiduciary-os/trust-core@1.2.0 type-check
npm notice run tsc --noEmit
npm notice run @fiduciary-os/trust-core@1.2.0 test
npm notice run node --test --test-reporter=spec "tests/**/*.test.mjs" "tests/**/*.test.ts"
✔ ComplianceAuditEngine produces CONFORMANT Merkle-verified report for intact ledger (9.940003ms)
✔ ComplianceAuditEngine detects payload/entry tampering via ledger.verify()
✔ FileLedgerStore persists entries across reopen and verifies chain integrity (16.033073ms)
✔ EvidenceLedger.open refuses to start when persisted JSONL file is tampered (19.303364ms)
✔ computeFourFactorShapley evaluates all 16 coalitions and sums strictly to 10,000 bps (15.408908ms)
✔ computeFourFactorShapley satisfies symmetry and dummy-player axioms (0.57776ms)
✔ normalizeShapBasisPoints falls back cleanly on zero inputs and is deterministic (1.552734ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 591.725367
```

### 3. Grep Check for `masternex` Runtime Imports/Services
Command:
```bash
grep -rni "masternex" fiduciary-os/backend/src/ trust-core/src/ fiduciary-os/docker-compose*.yml || echo "ZERO_MASTERNEX_MATCHES"
```
Result (zero runtime imports, services, env vars, or routes; only two pre-existing historical design comments):
```
trust-core/src/trust/anomaly.ts:4: * Motivated by the "NADE" anomaly engine in the MASTERNEX blueprint, but translated
trust-core/src/trust/ledger.ts:4: * Directly inspired by the "ACP-SQL immutable ledger" in the MASTERNEX blueprint,
```

### 4. Dev Database (`fiduciary_os`) Integrity Check
Command:
```bash
docker exec fiduciary-os-postgres-1 psql -U postgres -d fiduciary_os -c "SELECT count(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public';" -c "SELECT count(*) AS users_count FROM users;"
```
Result:
```
 table_count 
-------------
          23
(1 row)

 users_count 
-------------
           5
(1 row)
```

### 5. `git status` & `git diff --stat` (M1-owned files)
Modified/Deleted/Added in M1 scope:
- Modified: `fiduciary-os/backend/prisma/schema.prisma`, `fiduciary-os/backend/src/index.ts`, `fiduciary-os/backend/src/routes/trust.ts`, `fiduciary-os/backend/src/routes/intelligence.ts`, `fiduciary-os/backend/src/services/aiGateway.ts`, `fiduciary-os/backend/src/services/kdenseService.ts`, `fiduciary-os/backend/tests/setup.ts`, `fiduciary-os/backend/tests/unit/ecosystem.test.ts`, `fiduciary-os/docker-compose.yml`, `fiduciary-os/docker-compose.dev.yml`, `fiduciary-os/docker-compose.ecosystem.yml`, `trust-core/src/store/ledger-store.ts`, `trust-core/src/server.ts`, `trust-core/src/mcp/main.ts`, `trust-core/src/mcp/server.ts`.
- Deleted: `fiduciary-os/backend/src/services/masternexService.ts`, `trust-core/src/trust/masternex-bridge.ts`, `trust-core/tests/masternex-bridge.test.mjs`.
- Created: `fiduciary-os/backend/prisma/sql/privacy_and_audit.sql`, `fiduciary-os/backend/src/services/{shapleyService,crmService,consentService}.ts`, `fiduciary-os/backend/src/routes/{crm,consent,privacy}.ts`, `fiduciary-os/backend/tests/unit/shapley.test.ts`, `fiduciary-os/backend/tests/integration/crm-consent-privacy.test.ts`, `trust-core/src/trust/compliance-audit.ts`, `trust-core/src/engines/shapley.ts`, `trust-core/tests/unit/{ledger-durable,compliance-audit,shapley}.test.ts`.
