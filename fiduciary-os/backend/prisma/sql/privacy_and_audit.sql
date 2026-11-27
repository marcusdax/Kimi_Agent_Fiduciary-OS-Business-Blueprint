-- ============================================================================
-- privacy_and_audit.sql — PostgreSQL + pgcrypto encryption, WORM provenance
-- triggers, hash-chain append routine, and GDPR/CCPA export & soft-delete.
--
-- Idempotent: safe to re-run against both fiduciary_os and fiduciary_os_test.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Column-level AES-256 symmetric encryption helpers (pgcrypto)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION encrypt_ssn(p_plaintext TEXT, p_key TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
STRICT
AS $$
BEGIN
  IF length(trim(p_key)) = 0 THEN
    RAISE EXCEPTION 'encrypt_ssn requires a non-empty encryption key'
      USING ERRCODE = '22023';
  END IF;
  RETURN pgp_sym_encrypt(p_plaintext, p_key, 'cipher-algo=aes256');
END;
$$;

CREATE OR REPLACE FUNCTION decrypt_ssn(p_ciphertext BYTEA, p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STRICT
AS $$
BEGIN
  IF length(trim(p_key)) = 0 THEN
    RAISE EXCEPTION 'decrypt_ssn requires a non-empty encryption key'
      USING ERRCODE = '22023';
  END IF;
  RETURN pgp_sym_decrypt(p_ciphertext, p_key);
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. WORM Immutability Triggers on provenance_records
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_provenance_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'provenance_records is immutable: % is prohibited', TG_OP
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_provenance_no_update_delete ON provenance_records;
CREATE TRIGGER trg_provenance_no_update_delete
  BEFORE UPDATE OR DELETE ON provenance_records
  FOR EACH ROW
  EXECUTE FUNCTION prevent_provenance_mutation();

DROP TRIGGER IF EXISTS trg_provenance_no_truncate ON provenance_records;
CREATE TRIGGER trg_provenance_no_truncate
  BEFORE TRUNCATE ON provenance_records
  FOR EACH STATEMENT
  EXECUTE FUNCTION prevent_provenance_mutation();

-- ----------------------------------------------------------------------------
-- 3. Hash-chained Provenance Append (serialized via advisory transaction lock)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION append_provenance_record(
  p_actor_id TEXT,
  p_record_type TEXT,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS provenance_records
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_hash TEXT;
  v_id TEXT;
  v_occurred_at TIMESTAMP(3);
  v_payload JSONB;
  v_row_hash TEXT;
  v_row provenance_records;
BEGIN
  -- Serialize concurrent appends so prev_hash -> row_hash chain is strictly linear.
  PERFORM pg_advisory_xact_lock(hashtext('provenance_records_chain'));

  SELECT row_hash INTO v_prev_hash
  FROM provenance_records
  ORDER BY sequence DESC
  LIMIT 1;

  IF v_prev_hash IS NULL THEN
    v_prev_hash := 'GENESIS';
  END IF;

  v_id := gen_random_uuid()::TEXT;
  v_occurred_at := date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC');
  v_payload := COALESCE(p_payload, '{}'::JSONB);

  v_row_hash := encode(
    digest(
      v_prev_hash || '|' || v_id || '|' || to_char(v_occurred_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        || '|' || p_actor_id || '|' || p_record_type || '|' || v_payload::TEXT,
      'sha256'
    ),
    'hex'
  );

  INSERT INTO provenance_records (
    id,
    occurred_at,
    actor_id,
    record_type,
    prev_hash,
    row_hash,
    payload
  ) VALUES (
    v_id,
    v_occurred_at,
    p_actor_id,
    p_record_type,
    v_prev_hash,
    v_row_hash,
    v_payload
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. GDPR / CCPA Data Portability Export (export_user_data)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION export_user_data(p_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_user JSONB;
  v_households JSONB;
  v_people JSONB;
  v_accounts JSONB;
  v_appointments JSONB;
  v_life_events JSONB;
  v_consents JSONB;
  v_provenance JSONB;
  v_prov_row provenance_records;
  v_household_ids TEXT[];
BEGIN
  SELECT to_jsonb(u) - 'password'
  INTO v_user
  FROM users u
  WHERE u.id = p_user_id;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'User % not found', p_user_id USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT h.id), ARRAY[]::TEXT[])
  INTO v_household_ids
  FROM households h
  LEFT JOIN people p ON p.household_id = h.id
  WHERE h.owner_user_id = p_user_id
     OR h.primary_advisor_id = p_user_id
     OR p.user_id = p_user_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.created_at), '[]'::JSONB)
  INTO v_households
  FROM households h
  WHERE h.id = ANY(v_household_ids);

  SELECT COALESCE(jsonb_agg((to_jsonb(p) - 'ssn_encrypted') ORDER BY p.created_at), '[]'::JSONB)
  INTO v_people
  FROM people p
  WHERE p.user_id = p_user_id
     OR p.household_id = ANY(v_household_ids);

  SELECT COALESCE(jsonb_agg((to_jsonb(a) - 'plaid_access_token_encrypted') ORDER BY a.created_at), '[]'::JSONB)
  INTO v_accounts
  FROM crm_accounts a
  WHERE a.household_id = ANY(v_household_ids);

  SELECT COALESCE(jsonb_agg(to_jsonb(ap) ORDER BY ap.scheduled_at), '[]'::JSONB)
  INTO v_appointments
  FROM appointments ap
  WHERE ap.household_id = ANY(v_household_ids);

  SELECT COALESCE(jsonb_agg(to_jsonb(le) ORDER BY le.event_date), '[]'::JSONB)
  INTO v_life_events
  FROM life_events le
  WHERE le.household_id = ANY(v_household_ids);

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.recorded_at), '[]'::JSONB)
  INTO v_consents
  FROM consent_records c
  WHERE c.user_id = p_user_id;

  -- Record the export in the immutable provenance log before returning
  v_prov_row := append_provenance_record(
    p_user_id,
    'privacy.export',
    jsonb_build_object(
      'userId', p_user_id,
      'householdCount', jsonb_array_length(v_households),
      'consentCount', jsonb_array_length(v_consents)
    )
  );

  SELECT COALESCE(jsonb_agg(to_jsonb(pr) ORDER BY pr.sequence), '[]'::JSONB)
  INTO v_provenance
  FROM provenance_records pr
  WHERE pr.actor_id = p_user_id;

  RETURN jsonb_build_object(
    'exported_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'user', v_user,
    'households', v_households,
    'people', v_people,
    'crm_accounts', v_accounts,
    'appointments', v_appointments,
    'life_events', v_life_events,
    'consent_records', v_consents,
    'provenance_records', v_provenance,
    'export_provenance_hash', v_prov_row.row_hash
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. GDPR / CCPA Right-to-Erasure Soft Delete (soft_delete_user)
--    Scrubs PII, SSNs, Plaid tokens, and sessions while preserving WORM
--    provenance_records untouched (FINRA 4511 / SEC 17a-4 retention).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION soft_delete_user(p_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_exists BOOLEAN;
  v_owned_household_ids TEXT[];
  v_people_scrubbed INT := 0;
  v_accounts_scrubbed INT := 0;
  v_households_deleted INT := 0;
  v_auth_sessions_revoked INT := 0;
  v_sessions_deleted INT := 0;
  v_prov_row provenance_records;
BEGIN
  SELECT EXISTS(SELECT 1 FROM users WHERE id = p_user_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'User % not found', p_user_id USING ERRCODE = 'P0002';
  END IF;

  -- Scrub user PII & mark deleted_at
  UPDATE users
  SET email = 'deleted+' || id || '@redacted.invalid',
      name = 'Deleted User',
      password = NULL,
      deleted_at = v_now,
      "updatedAt" = v_now
  WHERE id = p_user_id;

  -- Revoke AuthSession rows and remove legacy sessions
  UPDATE "AuthSession"
  SET "revokedAt" = v_now
  WHERE "userId" = p_user_id
    AND "revokedAt" IS NULL;
  GET DIAGNOSTICS v_auth_sessions_revoked = ROW_COUNT;

  DELETE FROM sessions WHERE "userId" = p_user_id;
  GET DIAGNOSTICS v_sessions_deleted = ROW_COUNT;

  -- Identify households owned by this user
  SELECT COALESCE(array_agg(id), ARRAY[]::TEXT[])
  INTO v_owned_household_ids
  FROM households
  WHERE owner_user_id = p_user_id;

  -- Scrub people PII and encrypted SSNs linked directly to user or owned households
  UPDATE people
  SET first_name = 'Redacted',
      last_name = 'User',
      email = NULL,
      phone = NULL,
      date_of_birth = NULL,
      ssn_encrypted = NULL,
      ssn_last4 = NULL,
      deleted_at = v_now,
      updated_at = v_now
  WHERE user_id = p_user_id
     OR household_id = ANY(v_owned_household_ids);
  GET DIAGNOSTICS v_people_scrubbed = ROW_COUNT;

  -- Scrub Plaid access tokens and deactivate accounts in owned households
  UPDATE crm_accounts
  SET plaid_access_token_encrypted = NULL,
      plaid_cursor = NULL,
      is_active = FALSE,
      deleted_at = v_now,
      updated_at = v_now
  WHERE household_id = ANY(v_owned_household_ids);
  GET DIAGNOSTICS v_accounts_scrubbed = ROW_COUNT;

  -- Soft-delete owned households
  UPDATE households
  SET deleted_at = v_now,
      updated_at = v_now
  WHERE id = ANY(v_owned_household_ids);
  GET DIAGNOSTICS v_households_deleted = ROW_COUNT;

  -- Preserve provenance_records untouched; append the soft_delete event
  v_prov_row := append_provenance_record(
    p_user_id,
    'privacy.soft_delete',
    jsonb_build_object(
      'userId', p_user_id,
      'peopleScrubbed', v_people_scrubbed,
      'accountsScrubbed', v_accounts_scrubbed,
      'householdsSoftDeleted', v_households_deleted,
      'authSessionsRevoked', v_auth_sessions_revoked,
      'sessionsDeleted', v_sessions_deleted
    )
  );

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'deleted_at', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'people_scrubbed', v_people_scrubbed,
    'accounts_scrubbed', v_accounts_scrubbed,
    'households_soft_deleted', v_households_deleted,
    'auth_sessions_revoked', v_auth_sessions_revoked,
    'sessions_deleted', v_sessions_deleted,
    'provenance_preserved', TRUE,
    'provenance_hash', v_prov_row.row_hash
  );
END;
$$;
