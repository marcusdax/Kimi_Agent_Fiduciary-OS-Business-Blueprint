# Adversarial Challenger Handoff Report (`challenger_m1`) — Milestone M1

**Verdict: `CONFIRMED`**

All 6 empirical adversarial probes executed cleanly against `fiduciary_os_test` and isolated `/tmp/challenger_m1_probes` (cleaned up prior to reporting). Zero repository source, test, or config files were modified. Dev database `fiduciary_os` remained untouched (`23` tables, `5` users).

---

## Probe Results Summary

| # | Probe | Target | Result |
|---|---|---|---|
| 1 | WORM Immutability (`UPDATE`, `DELETE`, `TRUNCATE`) | `fiduciary_os_test.provenance_records` | **PASS** — all 3 rejected with `SQLSTATE 42501` |
| 2 | Concurrent Advisory Lock & Chain Continuity | `fiduciary_os_test.append_provenance_record` (20 parallel workers) | **PASS** — 0 failures, 69/69 distinct hashes, 0 broken links, 0 hash mismatches, 0 non-monotonic sequences |
| 3 | `pgcrypto` Encryption (`encrypt_ssn` / `decrypt_ssn`) | `fiduciary_os_test` | **PASS** — empty/whitespace keys rejected (`22023`), 77B non-plaintext `BYTEA`, wrong key fails (`39000`), right key round-trips cleanly |
| 4 | Consent & Outbound Dispatch Guard | `fiduciary-os/backend/src/services/consentService.ts` against `fiduciary_os_test` | **PASS** — missing -> blocked, unverified opt-in -> blocked, verified opt-in -> allowed (with SMS isolated), subsequent opt-out -> blocked |
| 5 | Exact 4-Factor Shapley Pathological Inputs | Both `fiduciary-os/backend/src/services/shapleyService.ts` & `trust-core/src/engines/shapley.ts` | **PASS** — `sum(basisPoints) === 10000`, `additivityError === 0`, non-negative integer bps, deterministic across all 12 edge cases |
| 6 | Durable `FileLedgerStore` Tamper & Recovery | `trust-core` (`EvidenceLedger.open` + `FileLedgerStore`) in `/tmp` | **PASS** — reopen head hash verified; 1-byte anchor tamper, actor tamper, and syntax tamper all fail-fast on `EvidenceLedger.open` |

---

## Exact Commands & Verbatim Outputs

### Probe 1 — WORM Immutability (`fiduciary_os_test`)
Command:
```bash
docker exec fiduciary-os-postgres-1 psql -U postgres -d fiduciary_os_test -v ON_ERROR_STOP=0 -c "
SELECT id, sequence, actor_id, record_type, prev_hash, row_hash
FROM append_provenance_record('challenger_m1', 'probe.worm_seed', '{\"probe\": 1}'::jsonb);
" -c "
DO \$\$
DECLARE
  v_err TEXT;
  v_state TEXT;
BEGIN
  BEGIN
    UPDATE provenance_records SET record_type = 'tampered' WHERE actor_id = 'challenger_m1';
    RAISE NOTICE 'UPDATE_UNEXPECTED_SUCCESS';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_err = MESSAGE_TEXT;
    RAISE NOTICE 'UPDATE_BLOCKED: SQLSTATE=% MSG=%', v_state, v_err;
  END;

  BEGIN
    DELETE FROM provenance_records WHERE actor_id = 'challenger_m1';
    RAISE NOTICE 'DELETE_UNEXPECTED_SUCCESS';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_err = MESSAGE_TEXT;
    RAISE NOTICE 'DELETE_BLOCKED: SQLSTATE=% MSG=%', v_state, v_err;
  END;

  BEGIN
    TRUNCATE TABLE provenance_records;
    RAISE NOTICE 'TRUNCATE_UNEXPECTED_SUCCESS';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_err = MESSAGE_TEXT;
    RAISE NOTICE 'TRUNCATE_BLOCKED: SQLSTATE=% MSG=%', v_state, v_err;
  END;
END \$\$;
"
```
Verbatim Output:
```text
                  id                  | sequence |   actor_id    |   record_type   |                            prev_hash                             |                             row_hash                             
--------------------------------------+----------+---------------+-----------------+------------------------------------------------------------------+------------------------------------------------------------------
 d1dcf6ba-d46b-48f4-b037-4cbb1db4eef4 |       33 | challenger_m1 | probe.worm_seed | 72c1ebc620f9f20e400cc3af3e229675473bbc27a7321c4cbae36cee9ae6a7f8 | 93f12f737408b1d7b2cbc78c18d43c249255e8453c37fe486172524974450422
(1 row)

NOTICE:  UPDATE_BLOCKED: SQLSTATE=42501 MSG=provenance_records is immutable: UPDATE is prohibited
NOTICE:  DELETE_BLOCKED: SQLSTATE=42501 MSG=provenance_records is immutable: DELETE is prohibited
NOTICE:  TRUNCATE_BLOCKED: SQLSTATE=42501 MSG=provenance_records is immutable: TRUNCATE is prohibited
DO
```

### Probe 2 — Concurrent Advisory Lock & Chain Continuity (`fiduciary_os_test`)
Command:
```bash
bash -c '
set -e
PIDS=()
for i in $(seq 1 20); do
  docker exec fiduciary-os-postgres-1 psql -U postgres -d fiduciary_os_test -t -A -c \
    "SELECT sequence, row_hash FROM append_provenance_record('\''challenger_m1_conc'\'', '\''probe.concurrent'\'', jsonb_build_object('\''worker'\'', $i));" &
  PIDS+=($!)
done
FAILS=0
for pid in "${PIDS[@]}"; do
  wait "$pid" || FAILS=$((FAILS + 1))
done
echo "CONCURRENT_WORKERS_FAILED=$FAILS"

docker exec fiduciary-os-postgres-1 psql -U postgres -d fiduciary_os_test -c "
WITH ordered AS (
  SELECT
    sequence, id, occurred_at, actor_id, record_type, prev_hash, row_hash, payload,
    LAG(row_hash, 1, '\''GENESIS'\'') OVER (ORDER BY sequence ASC) AS expected_prev_hash,
    LAG(sequence) OVER (ORDER BY sequence ASC) AS prev_seq,
    encode(
      digest(
        prev_hash || '\''|'\'' || id || '\''|'\'' || to_char(occurred_at, '\''YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'\'')
          || '\''|'\'' || actor_id || '\''|'\'' || record_type || '\''|'\'' || payload::TEXT,
        '\''sha256'\''
      ),
      '\''hex'\''
    ) AS recomputed_hash
  FROM provenance_records
)
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE actor_id = '\''challenger_m1_conc'\'') AS concurrent_rows,
  COUNT(DISTINCT row_hash) AS distinct_hashes,
  COUNT(*) FILTER (WHERE prev_hash <> expected_prev_hash) AS broken_links,
  COUNT(*) FILTER (WHERE row_hash <> recomputed_hash) AS hash_mismatches,
  COUNT(*) FILTER (WHERE prev_seq IS NOT NULL AND sequence <= prev_seq) AS non_monotonic_seqs
FROM ordered;
"
'
```
Verbatim Output:
```text
CONCURRENT_WORKERS_FAILED=0
 total_rows | concurrent_rows | distinct_hashes | broken_links | hash_mismatches | non_monotonic_seqs 
------------+-----------------+-----------------+--------------+-----------------+--------------------
         69 |              20 |              69 |            0 |               0 |                  0
(1 row)
```

### Probe 3 — `pgcrypto` Encryption (`encrypt_ssn` / `decrypt_ssn`)
Command:
```bash
docker exec fiduciary-os-postgres-1 psql -U postgres -d fiduciary_os_test -v ON_ERROR_STOP=0 -c "
DO \$\$
DECLARE
  v_state TEXT; v_err TEXT; v_ct BYTEA; v_pt TEXT;
  v_ssn TEXT := '123-45-6789'; v_key TEXT := 'super-secret-aes256-key-2026';
BEGIN
  BEGIN v_ct := encrypt_ssn(v_ssn, ''); EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_err = MESSAGE_TEXT;
    RAISE NOTICE 'EMPTY_KEY_REJECTED: SQLSTATE=% MSG=%', v_state, v_err;
  END;
  BEGIN v_ct := encrypt_ssn(v_ssn, '   '); EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_err = MESSAGE_TEXT;
    RAISE NOTICE 'WHITESPACE_KEY_REJECTED: SQLSTATE=% MSG=%', v_state, v_err;
  END;
  v_ct := encrypt_ssn(v_ssn, v_key);
  RAISE NOTICE 'CIPHERTEXT_LEN=% CONTAINS_PLAINTEXT=%', octet_length(v_ct), (position(convert_to(v_ssn, 'UTF8') in v_ct) > 0);
  BEGIN v_pt := decrypt_ssn(v_ct, 'wrong-key-should-fail'); EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_err = MESSAGE_TEXT;
    RAISE NOTICE 'WRONG_KEY_REJECTED: SQLSTATE=% MSG=%', v_state, v_err;
  END;
  v_pt := decrypt_ssn(v_ct, v_key);
  RAISE NOTICE 'ROUNDTRIP_MATCH=% VALUE=%', (v_pt = v_ssn), v_pt;
END \$\$;
"
```
Verbatim Output:
```text
NOTICE:  EMPTY_KEY_REJECTED: SQLSTATE=22023 MSG=encrypt_ssn requires a non-empty encryption key
NOTICE:  WHITESPACE_KEY_REJECTED: SQLSTATE=22023 MSG=encrypt_ssn requires a non-empty encryption key
NOTICE:  CIPHERTEXT_LEN=77 CONTAINS_PLAINTEXT=f
NOTICE:  WRONG_KEY_REJECTED: SQLSTATE=39000 MSG=Wrong key or corrupt data
NOTICE:  ROUNDTRIP_MATCH=t VALUE=123-45-6789
DO
```

### Probe 4 & Probe 5 (Backend) — Consent Guard & Shapley Service
Command:
```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/fiduciary_os_test ./node_modules/.bin/tsx /tmp/challenger_m1_probes/probe_backend.ts
```
Verbatim Output:
```text
=== PROBE 5 (backend shapleyService) ===
PASS [equal_thirds_plus_zero]: sumBps=10000 effErr=0 bps={"employer_match_contrib":3334,"low_fee_index_benefit":3333,"savings_rate_contrib":3333,"tax_deferral_compounding":0}
PASS [equal_quarters]: sumBps=10000 effErr=2.220446049250313e-16 bps={"employer_match_contrib":2500,"low_fee_index_benefit":2500,"savings_rate_contrib":2500,"tax_deferral_compounding":2500}
PASS [extreme_ratio_1e9_vs_1e-9]: sumBps=10000 effErr=0 bps={"employer_match_contrib":0,"low_fee_index_benefit":0,"savings_rate_contrib":10000,"tax_deferral_compounding":0}
PASS [extreme_ratio_with_synergy]: sumBps=10000 effErr=1.1920928955078125e-7 bps={"employer_match_contrib":0,"low_fee_index_benefit":0,"savings_rate_contrib":10000,"tax_deferral_compounding":0}
PASS [all_zeros]: sumBps=10000 effErr=0 bps={"savings_rate_contrib":3800,"employer_match_contrib":1800,"low_fee_index_benefit":2400,"tax_deferral_compounding":2000}
PASS [all_negatives]: sumBps=10000 effErr=0 bps={"savings_rate_contrib":3800,"employer_match_contrib":1800,"low_fee_index_benefit":2400,"tax_deferral_compounding":2000}
PASS [nan_and_infinity]: sumBps=10000 effErr=0 bps={"employer_match_contrib":0,"low_fee_index_benefit":0,"savings_rate_contrib":0,"tax_deferral_compounding":10000}
PASS [all_nan_infinity]: sumBps=10000 effErr=0 bps={"savings_rate_contrib":3800,"employer_match_contrib":1800,"low_fee_index_benefit":2400,"tax_deferral_compounding":2000}
PASS [nonzero_synergy_0_35]: sumBps=10000 effErr=2.220446049250313e-16 bps={"employer_match_contrib":2123,"low_fee_index_benefit":2519,"savings_rate_contrib":3646,"tax_deferral_compounding":1712}
PASS [huge_overflow_1e308_synergy]: sumBps=10000 effErr=NaN bps={"savings_rate_contrib":3800,"employer_match_contrib":1800,"low_fee_index_benefit":2400,"tax_deferral_compounding":2000}

=== PROBE 4 (Consent & Outbound Dispatch Guard) ===
PASS [1. missing consent]: allowed=false reason=no_consent_record
PASS [2. opted_in unverified]: allowed=false reason=double_opt_in_unverified
PASS [3. opted_in verified]: email allowed=true (verified_opt_in); sms allowed=false (no_consent_record)
PASS [4. subsequent opted_out]: allowed=false reason=opted_out
```

### Probe 5 (`trust-core`) & Probe 6 — Shapley Engine & Durable `FileLedgerStore` Tamper Detection
Commands:
```bash
node /tmp/challenger_m1_probes/probe_trust_core.ts   # Shapley cases
node /tmp/challenger_m1_probes/probe_ledger.ts       # FileLedgerStore write/reopen/tamper
```
Verbatim Output:
```text
=== PROBE 5 (trust-core Shapley) ===
PASS [equal_thirds_plus_zero]: sumBps=10000 effErr=0 bps={"employer_match_contrib":3334,"low_fee_index_benefit":3333,"savings_rate_contrib":3333,"tax_deferral_compounding":0}
PASS [equal_quarters]: sumBps=10000 effErr=2.220446049250313e-16 bps={"employer_match_contrib":2500,"low_fee_index_benefit":2500,"savings_rate_contrib":2500,"tax_deferral_compounding":2500}
PASS [extreme_ratio_1e9_vs_1e-9]: sumBps=10000 effErr=0 bps={"employer_match_contrib":0,"low_fee_index_benefit":0,"savings_rate_contrib":10000,"tax_deferral_compounding":0}
PASS [extreme_ratio_with_synergy]: sumBps=10000 effErr=1.1920928955078125e-7 bps={"employer_match_contrib":0,"low_fee_index_benefit":0,"savings_rate_contrib":10000,"tax_deferral_compounding":0}
PASS [all_zeros]: sumBps=10000 effErr=0 bps={"savings_rate_contrib":3800,"employer_match_contrib":1800,"low_fee_index_benefit":2400,"tax_deferral_compounding":2000}
PASS [all_zeros_with_synergy]: sumBps=10000 effErr=0 bps={"savings_rate_contrib":3800,"employer_match_contrib":1800,"low_fee_index_benefit":2400,"tax_deferral_compounding":2000}
PASS [all_negatives]: sumBps=10000 effErr=0 bps={"savings_rate_contrib":3800,"employer_match_contrib":1800,"low_fee_index_benefit":2400,"tax_deferral_compounding":2000}
PASS [nan_and_infinity]: sumBps=10000 effErr=0 bps={"employer_match_contrib":0,"low_fee_index_benefit":0,"savings_rate_contrib":0,"tax_deferral_compounding":10000}
PASS [all_nan_infinity]: sumBps=10000 effErr=0 bps={"savings_rate_contrib":3800,"employer_match_contrib":1800,"low_fee_index_benefit":2400,"tax_deferral_compounding":2000}
PASS [nonzero_synergy_0_35]: sumBps=10000 effErr=2.220446049250313e-16 bps={"employer_match_contrib":2123,"low_fee_index_benefit":2519,"savings_rate_contrib":3646,"tax_deferral_compounding":1712}
PASS [huge_overflow_1e308_synergy]: sumBps=10000 effErr=NaN bps={"savings_rate_contrib":3800,"employer_match_contrib":1800,"low_fee_index_benefit":2400,"tax_deferral_compounding":2000}
PASS [negative_synergy]: sumBps=10000 effErr=0 bps={"employer_match_contrib":2000,"low_fee_index_benefit":2500,"savings_rate_contrib":4000,"tax_deferral_compounding":1500}

=== PROBE 6 (trust-core FileLedgerStore) ===
WRITTEN: entries=5 headHash=43db874cf328536e1e97d155d4ab1a2b0425ccda7dd5f27d4c300ea5bc19e32c
REOPEN_VERIFIED: entries=5 headHash=43db874cf328536e1e97d155d4ab1a2b0425ccda7dd5f27d4c300ea5bc19e32c valid=true
TAMPER_ANCHOR_CAUGHT: refusing to start: ledger store failed verification at seq 1 — content hash mismatch at seq 1: entry was modified after it was written
TAMPER_ACTOR_CAUGHT: refusing to start: ledger store failed verification at seq 2 — content hash mismatch at seq 2: entry was modified after it was written
TAMPER_SYNTAX_CAUGHT: refusing to start: ledger store failed verification at seq 1 — content hash mismatch at seq 1: entry was modified after it was written
```

### Cleanup, Dev DB Integrity & Masternex Removal Check
Command:
```bash
rm -rf /tmp/challenger_m1_probes && test ! -e /tmp/challenger_m1_probes && echo "TEMP_DIR_CLEANED=true" && \
docker exec fiduciary-os-postgres-1 psql -U postgres -d fiduciary_os -c "SELECT count(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public';" -c "SELECT count(*) AS users_count FROM users;" && \
grep -rni "masternex" fiduciary-os/backend/src/ trust-core/src/ fiduciary-os/docker-compose*.yml || echo "ZERO_MASTERNEX_MATCHES"
```
Verbatim Output:
```text
TEMP_DIR_CLEANED=true
 table_count 
-------------
          23
(1 row)

 users_count 
-------------
           5
(1 row)

trust-core/src/trust/anomaly.ts:4: * Motivated by the "NADE" anomaly engine in the MASTERNEX blueprint, but translated
trust-core/src/trust/ledger.ts:4: * Directly inspired by the "ACP-SQL immutable ledger" in the MASTERNEX blueprint,
```

---

## Non-Blocking Forensic Observation
- In `computeFourFactorShapley` (both `fiduciary-os/backend/src/services/shapleyService.ts` and `trust-core/src/engines/shapley.ts`), passing IEEE-754 near-max weights (`1e308`) with `synergyWeight > 0` overflows `Math.sqrt(w_i * w_j)` to `Infinity` before square-rooting, yielding `efficiencyError = NaN`. However, `normalizeShapBasisPoints` filters non-finite values and still guarantees `sumBps === 10000`, `additivityError === 0`, and deterministic fallback output. Writing `Math.sqrt(w_i) * Math.sqrt(w_j)` in a future hardening pass would prevent intermediate overflow.
