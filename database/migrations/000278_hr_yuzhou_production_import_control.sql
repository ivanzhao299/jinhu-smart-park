BEGIN;

CREATE TABLE hr_yuzhou_production_import_operation (
  operation_id varchar(64) PRIMARY KEY,
  intent varchar(32) NOT NULL,
  status varchar(32) NOT NULL,
  code_sha char(40) NOT NULL,
  source_snapshot_sha256 char(64) NOT NULL,
  mapping_contract_sha256 char(64) NOT NULL,
  sealed_plan_sha256 char(64) NOT NULL UNIQUE,
  target_identity_sha256 char(64) NOT NULL,
  authorization_artifact_sha256 char(64) NOT NULL UNIQUE,
  authorization_nonce_sha256 char(64) NOT NULL UNIQUE,
  authorization_issued_at timestamptz NOT NULL,
  authorization_expires_at timestamptz NOT NULL,
  window_starts_at timestamptz NOT NULL,
  window_ends_at timestamptz NOT NULL,
  approval_set_sha256 char(64) NOT NULL,
  manifest_sha256 char(64) NOT NULL,
  final_rehearsal_pair_sha256 char(64) NOT NULL,
  rehearsal_a_manifest_sha256 char(64) NOT NULL,
  rehearsal_b_manifest_sha256 char(64) NOT NULL,
  phase_order jsonb NOT NULL,
  current_phase varchar(8),
  failure_code varchar(96),
  authorized_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  CONSTRAINT ck_hr_yuzhou_prod_import_identity CHECK (
    operation_id ~ '^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$'
    AND intent = 'production_import'
    AND code_sha ~ '^[0-9a-f]{40}$'
    AND source_snapshot_sha256 ~ '^[0-9a-f]{64}$'
    AND mapping_contract_sha256 ~ '^[0-9a-f]{64}$'
    AND sealed_plan_sha256 ~ '^[0-9a-f]{64}$'
    AND target_identity_sha256 ~ '^[0-9a-f]{64}$'
    AND authorization_artifact_sha256 ~ '^[0-9a-f]{64}$'
    AND authorization_nonce_sha256 ~ '^[0-9a-f]{64}$'
    AND approval_set_sha256 ~ '^[0-9a-f]{64}$'
    AND manifest_sha256 ~ '^[0-9a-f]{64}$'
    AND final_rehearsal_pair_sha256 ~ '^[0-9a-f]{64}$'
    AND rehearsal_a_manifest_sha256 ~ '^[0-9a-f]{64}$'
    AND rehearsal_b_manifest_sha256 ~ '^[0-9a-f]{64}$'
    AND rehearsal_a_manifest_sha256 <> rehearsal_b_manifest_sha256
  ),
  CONSTRAINT ck_hr_yuzhou_prod_import_authority_window CHECK (
    window_starts_at < window_ends_at
    AND authorization_issued_at < authorization_expires_at
    AND authorization_issued_at >= window_starts_at
    AND authorization_expires_at <= window_ends_at
    AND authorized_at >= authorization_issued_at
    AND authorized_at < authorization_expires_at
  ),
  CONSTRAINT ck_hr_yuzhou_prod_import_status CHECK (status IN ('authorized','running','succeeded','failed')),
  CONSTRAINT ck_hr_yuzhou_prod_import_phase_order CHECK (phase_order = '["T0","T1","T2","T3"]'::jsonb),
  CONSTRAINT ck_hr_yuzhou_prod_import_finish CHECK ((status IN ('succeeded','failed') AND finished_at IS NOT NULL) OR (status IN ('authorized','running') AND finished_at IS NULL)),
  CONSTRAINT ck_hr_yuzhou_prod_import_failure CHECK ((status='failed' AND failure_code ~ '^[A-Z][A-Z0-9_]{2,95}$') OR (status<>'failed' AND failure_code IS NULL))
);

CREATE TABLE hr_yuzhou_production_import_authorization_use (
  usage_id bigserial PRIMARY KEY,
  intent varchar(32) NOT NULL,
  operation_id varchar(72) NOT NULL UNIQUE,
  import_operation_id varchar(64) NOT NULL REFERENCES hr_yuzhou_production_import_operation(operation_id),
  authorization_artifact_sha256 char(64) NOT NULL UNIQUE,
  authorization_nonce_sha256 char(64) NOT NULL UNIQUE,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hr_yuzhou_prod_auth_use CHECK (
    (
      (intent='production_import' AND operation_id=import_operation_id AND operation_id ~ '^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$')
      OR (intent='production_import_rollback' AND operation_id ~ '^yzprod-rollback-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$')
    )
    AND authorization_artifact_sha256 ~ '^[0-9a-f]{64}$'
    AND authorization_nonce_sha256 ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE hr_yuzhou_production_import_rollback_operation (
  rollback_operation_id varchar(72) PRIMARY KEY,
  import_operation_id varchar(64) NOT NULL REFERENCES hr_yuzhou_production_import_operation(operation_id),
  status varchar(32) NOT NULL,
  sealed_plan_sha256 char(64) NOT NULL,
  target_identity_sha256 char(64) NOT NULL,
  authorization_artifact_sha256 char(64) NOT NULL UNIQUE,
  authorization_nonce_sha256 char(64) NOT NULL UNIQUE,
  authorization_issued_at timestamptz NOT NULL,
  authorization_expires_at timestamptz NOT NULL,
  failure_code varchar(96),
  authorized_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  CONSTRAINT ck_hr_yuzhou_prod_rollback_identity CHECK (
    rollback_operation_id ~ '^yzprod-rollback-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$'
    AND sealed_plan_sha256 ~ '^[0-9a-f]{64}$'
    AND target_identity_sha256 ~ '^[0-9a-f]{64}$'
    AND authorization_artifact_sha256 ~ '^[0-9a-f]{64}$'
    AND authorization_nonce_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT ck_hr_yuzhou_prod_rollback_authority_window CHECK (
    authorization_issued_at < authorization_expires_at
    AND authorized_at >= authorization_issued_at
    AND authorized_at < authorization_expires_at
  ),
  CONSTRAINT ck_hr_yuzhou_prod_rollback_status CHECK (status IN ('authorized','running','succeeded','failed')),
  CONSTRAINT ck_hr_yuzhou_prod_rollback_finish CHECK ((status IN ('succeeded','failed') AND finished_at IS NOT NULL) OR (status IN ('authorized','running') AND finished_at IS NULL)),
  CONSTRAINT ck_hr_yuzhou_prod_rollback_failure CHECK ((status='failed' AND failure_code ~ '^[A-Z][A-Z0-9_]{2,95}$') OR (status<>'failed' AND failure_code IS NULL))
);
CREATE UNIQUE INDEX uq_hr_yuzhou_prod_active_rollback ON hr_yuzhou_production_import_rollback_operation(import_operation_id) WHERE status IN ('authorized','running','succeeded');

CREATE TABLE hr_yuzhou_production_import_phase (
  operation_id varchar(64) NOT NULL REFERENCES hr_yuzhou_production_import_operation(operation_id),
  phase varchar(8) NOT NULL,
  phase_ordinal smallint NOT NULL,
  status varchar(24) NOT NULL,
  source_batch_manifest_sha256 char(64) NOT NULL,
  planned_record_count bigint NOT NULL,
  applied_record_count bigint NOT NULL DEFAULT 0,
  before_canonical_sha256 char(64) NOT NULL,
  after_canonical_sha256 char(64),
  rollback_canonical_sha256 char(64),
  started_at timestamptz,
  finished_at timestamptz,
  PRIMARY KEY(operation_id,phase),
  UNIQUE(operation_id,phase_ordinal),
  CONSTRAINT ck_hr_yuzhou_prod_phase_identity CHECK (
    (phase,phase_ordinal) IN (('T0',0),('T1',1),('T2',2),('T3',3))
    AND source_batch_manifest_sha256 ~ '^[0-9a-f]{64}$'
    AND before_canonical_sha256 ~ '^[0-9a-f]{64}$'
    AND (after_canonical_sha256 IS NULL OR after_canonical_sha256 ~ '^[0-9a-f]{64}$')
    AND (rollback_canonical_sha256 IS NULL OR rollback_canonical_sha256 ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT ck_hr_yuzhou_prod_phase_status CHECK (status IN ('planned','running','succeeded','rolling_back','rolled_back')),
  CONSTRAINT ck_hr_yuzhou_prod_phase_counts CHECK (planned_record_count >= 0 AND applied_record_count >= 0 AND applied_record_count <= planned_record_count)
);

CREATE TABLE hr_yuzhou_production_import_record (
  operation_id varchar(64) NOT NULL,
  phase varchar(8) NOT NULL,
  source_identity_sha256 char(64) NOT NULL,
  source_row_sha256 char(64) NOT NULL,
  owner_source_identity_sha256 char(64),
  disposition varchar(24) NOT NULL,
  target_table varchar(96),
  target_id uuid,
  expected_target_before_sha256 char(64),
  target_after_sha256 char(64),
  decision_attestation_sha256 char(64),
  rollback_status varchar(24) NOT NULL DEFAULT 'not_started',
  rolled_back_at timestamptz,
  PRIMARY KEY(operation_id,phase,source_identity_sha256),
  FOREIGN KEY(operation_id,phase) REFERENCES hr_yuzhou_production_import_phase(operation_id,phase),
  CONSTRAINT ck_hr_yuzhou_prod_record_hashes CHECK (
    source_identity_sha256 ~ '^[0-9a-f]{64}$'
    AND source_row_sha256 ~ '^[0-9a-f]{64}$'
    AND (owner_source_identity_sha256 IS NULL OR owner_source_identity_sha256 ~ '^[0-9a-f]{64}$')
    AND (expected_target_before_sha256 IS NULL OR expected_target_before_sha256 ~ '^[0-9a-f]{64}$')
    AND (target_after_sha256 IS NULL OR target_after_sha256 ~ '^[0-9a-f]{64}$')
    AND (decision_attestation_sha256 IS NULL OR decision_attestation_sha256 ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT ck_hr_yuzhou_prod_record_disposition CHECK (disposition IN ('insert','merge','quarantine','skip_approved')),
  CONSTRAINT ck_hr_yuzhou_prod_record_target_allowlist CHECK (
    target_table IS NULL
    OR (phase='T0' AND target_table IN ('sys_org','hr_position','hr_employee'))
    OR (phase='T1' AND target_table='hr_employment_event')
    OR (phase='T2' AND target_table IN ('hr_contract_type','hr_contract','hr_contract_change','hr_contract_legacy_evidence'))
    OR (phase='T3' AND target_table IN ('hr_attendance_import_batch','hr_attendance_symbol_rule','hr_attendance_calendar_source','hr_attendance_day','hr_insurance_policy','hr_insurance_policy_item','hr_employee_insurance_period','hr_employee_insurance_item'))
  ),
  CONSTRAINT ck_hr_yuzhou_prod_record_shape CHECK (
    (disposition = 'insert' AND target_table IS NOT NULL AND target_id IS NOT NULL AND expected_target_before_sha256 IS NULL AND target_after_sha256 IS NOT NULL)
    OR (disposition = 'merge' AND target_table IS NOT NULL AND target_id IS NOT NULL AND expected_target_before_sha256 IS NOT NULL AND target_after_sha256 IS NOT NULL AND decision_attestation_sha256 IS NOT NULL)
    OR (disposition = 'quarantine' AND target_table IS NULL AND target_id IS NULL AND expected_target_before_sha256 IS NULL AND target_after_sha256 IS NULL AND decision_attestation_sha256 IS NOT NULL)
    OR (disposition = 'skip_approved' AND target_table IS NOT NULL AND target_id IS NOT NULL AND expected_target_before_sha256 IS NOT NULL AND target_after_sha256 = expected_target_before_sha256 AND decision_attestation_sha256 IS NOT NULL)
  ),
  CONSTRAINT ck_hr_yuzhou_prod_record_rollback CHECK (rollback_status IN ('not_started','deleted_insert','restored_merge','quarantine_noop','skip_noop'))
);

CREATE TABLE hr_yuzhou_production_import_before_image (
  operation_id varchar(64) NOT NULL,
  phase varchar(8) NOT NULL,
  source_identity_sha256 char(64) NOT NULL,
  plaintext_sha256 char(64) NOT NULL,
  ciphertext_sha256 char(64) NOT NULL,
  key_reference_sha256 char(64) NOT NULL,
  nonce bytea NOT NULL,
  authentication_tag bytea NOT NULL,
  ciphertext bytea NOT NULL,
  algorithm varchar(32) NOT NULL,
  PRIMARY KEY(operation_id,phase,source_identity_sha256),
  FOREIGN KEY(operation_id,phase,source_identity_sha256) REFERENCES hr_yuzhou_production_import_record(operation_id,phase,source_identity_sha256),
  CONSTRAINT ck_hr_yuzhou_prod_before_image_hashes CHECK (
    plaintext_sha256 ~ '^[0-9a-f]{64}$'
    AND ciphertext_sha256 ~ '^[0-9a-f]{64}$'
    AND key_reference_sha256 ~ '^[0-9a-f]{64}$'
    AND encode(digest(ciphertext,'sha256'),'hex') = ciphertext_sha256
  ),
  CONSTRAINT ck_hr_yuzhou_prod_before_image_crypto CHECK (algorithm = 'aes-256-gcm-external-kek-v1' AND octet_length(nonce) = 12 AND octet_length(authentication_tag) = 16 AND octet_length(ciphertext) > 0)
);

CREATE TABLE hr_yuzhou_production_import_quarantine (
  operation_id varchar(64) NOT NULL,
  phase varchar(8) NOT NULL,
  source_identity_sha256 char(64) NOT NULL,
  reason_code varchar(64) NOT NULL,
  algorithm varchar(32) NOT NULL,
  key_reference_sha256 char(64) NOT NULL,
  nonce bytea NOT NULL,
  authentication_tag bytea NOT NULL,
  payload_ciphertext_sha256 char(64) NOT NULL,
  payload_ciphertext bytea NOT NULL,
  decision_attestation_sha256 char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(operation_id,phase,source_identity_sha256),
  FOREIGN KEY(operation_id,phase,source_identity_sha256) REFERENCES hr_yuzhou_production_import_record(operation_id,phase,source_identity_sha256),
  CONSTRAINT ck_hr_yuzhou_prod_quarantine_hash CHECK (
    payload_ciphertext_sha256 ~ '^[0-9a-f]{64}$'
    AND key_reference_sha256 ~ '^[0-9a-f]{64}$'
    AND decision_attestation_sha256 ~ '^[0-9a-f]{64}$'
    AND encode(digest(payload_ciphertext,'sha256'),'hex') = payload_ciphertext_sha256
  ),
  CONSTRAINT ck_hr_yuzhou_prod_quarantine_crypto CHECK (algorithm = 'aes-256-gcm-external-kek-v1' AND octet_length(nonce) = 12 AND octet_length(authentication_tag) = 16 AND octet_length(payload_ciphertext) > 0)
);

CREATE INDEX idx_hr_yuzhou_prod_record_target ON hr_yuzhou_production_import_record(target_table,target_id) WHERE target_id IS NOT NULL;
CREATE INDEX idx_hr_yuzhou_prod_record_owner ON hr_yuzhou_production_import_record(operation_id,owner_source_identity_sha256) WHERE owner_source_identity_sha256 IS NOT NULL;

CREATE FUNCTION hr_yuzhou_validate_production_import_owner_map() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  owner_record hr_yuzhou_production_import_record%ROWTYPE;
BEGIN
  IF NEW.phase = 'T0' THEN
    IF NEW.owner_source_identity_sha256 IS NOT NULL THEN
      RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_T0_OWNER_FORBIDDEN';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.owner_source_identity_sha256 IS NULL THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_OWNER_RECORD_MAP_REQUIRED';
  END IF;
  SELECT * INTO owner_record
  FROM hr_yuzhou_production_import_record
  WHERE operation_id=NEW.operation_id AND phase='T0' AND source_identity_sha256=NEW.owner_source_identity_sha256;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_OWNER_RECORD_MAP_REQUIRED';
  END IF;
  IF NEW.disposition <> 'quarantine'
     AND (owner_record.disposition='quarantine' OR owner_record.target_table <> 'hr_employee' OR owner_record.target_id IS NULL) THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_OWNER_RECORD_MAP_REQUIRED';
  END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_hr_yuzhou_prod_record_owner_map
BEFORE INSERT OR UPDATE OF operation_id,phase,owner_source_identity_sha256,disposition ON hr_yuzhou_production_import_record
FOR EACH ROW EXECUTE FUNCTION hr_yuzhou_validate_production_import_owner_map();

CREATE FUNCTION hr_yuzhou_consume_import_authorization(
  p_operation_id varchar,
  p_code_sha char(40),
  p_source_snapshot_sha256 char(64),
  p_mapping_contract_sha256 char(64),
  p_sealed_plan_sha256 char(64),
  p_target_identity_sha256 char(64),
  p_authorization_artifact_sha256 char(64),
  p_authorization_nonce_sha256 char(64),
  p_authorization_issued_at timestamptz,
  p_authorization_expires_at timestamptz,
  p_window_starts_at timestamptz,
  p_window_ends_at timestamptz,
  p_approval_set_sha256 char(64),
  p_manifest_sha256 char(64),
  p_final_rehearsal_pair_sha256 char(64),
  p_rehearsal_a_manifest_sha256 char(64),
  p_rehearsal_b_manifest_sha256 char(64)
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_REQUIRES_SERIALIZABLE';
  END IF;
  IF now() < p_window_starts_at OR now() >= p_window_ends_at
     OR now() < p_authorization_issued_at OR now() >= p_authorization_expires_at
     OR p_authorization_issued_at < p_window_starts_at OR p_authorization_expires_at > p_window_ends_at THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_AUTH_STALE';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_yuzhou_production_import',0));
  INSERT INTO hr_yuzhou_production_import_operation(
    operation_id,intent,status,code_sha,source_snapshot_sha256,mapping_contract_sha256,sealed_plan_sha256,
    target_identity_sha256,authorization_artifact_sha256,authorization_nonce_sha256,
    authorization_issued_at,authorization_expires_at,window_starts_at,window_ends_at,approval_set_sha256,
    manifest_sha256,final_rehearsal_pair_sha256,rehearsal_a_manifest_sha256,rehearsal_b_manifest_sha256,phase_order
  ) VALUES (
    p_operation_id,'production_import','authorized',p_code_sha,p_source_snapshot_sha256,p_mapping_contract_sha256,p_sealed_plan_sha256,
    p_target_identity_sha256,p_authorization_artifact_sha256,p_authorization_nonce_sha256,
    p_authorization_issued_at,p_authorization_expires_at,p_window_starts_at,p_window_ends_at,p_approval_set_sha256,
    p_manifest_sha256,p_final_rehearsal_pair_sha256,p_rehearsal_a_manifest_sha256,p_rehearsal_b_manifest_sha256,'["T0","T1","T2","T3"]'::jsonb
  );
  INSERT INTO hr_yuzhou_production_import_authorization_use(intent,operation_id,import_operation_id,authorization_artifact_sha256,authorization_nonce_sha256)
  VALUES('production_import',p_operation_id,p_operation_id,p_authorization_artifact_sha256,p_authorization_nonce_sha256);
END$$;

CREATE FUNCTION hr_yuzhou_start_production_import(p_operation_id varchar,p_sealed_plan_sha256 char(64)) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_REQUIRES_SERIALIZABLE'; END IF;
  UPDATE hr_yuzhou_production_import_operation
  SET status='running',started_at=now()
  WHERE operation_id=p_operation_id AND sealed_plan_sha256=p_sealed_plan_sha256 AND status='authorized';
  IF NOT FOUND THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_AUTH_RECEIPT_INVALID'; END IF;
END$$;

CREATE FUNCTION hr_yuzhou_consume_rollback_authorization(
  p_rollback_operation_id varchar,
  p_import_operation_id varchar,
  p_sealed_plan_sha256 char(64),
  p_target_identity_sha256 char(64),
  p_authorization_artifact_sha256 char(64),
  p_authorization_nonce_sha256 char(64),
  p_authorization_issued_at timestamptz,
  p_authorization_expires_at timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_REQUIRES_SERIALIZABLE'; END IF;
  IF now() < p_authorization_issued_at OR now() >= p_authorization_expires_at THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_AUTH_STALE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_yuzhou_production_import_rollback',0));
  IF NOT EXISTS(SELECT 1 FROM hr_yuzhou_production_import_operation WHERE operation_id=p_import_operation_id AND sealed_plan_sha256=p_sealed_plan_sha256 AND target_identity_sha256=p_target_identity_sha256 AND status='succeeded') THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_ROLLBACK_SOURCE_INVALID';
  END IF;
  INSERT INTO hr_yuzhou_production_import_rollback_operation(rollback_operation_id,import_operation_id,status,sealed_plan_sha256,target_identity_sha256,authorization_artifact_sha256,authorization_nonce_sha256,authorization_issued_at,authorization_expires_at)
  VALUES(p_rollback_operation_id,p_import_operation_id,'authorized',p_sealed_plan_sha256,p_target_identity_sha256,p_authorization_artifact_sha256,p_authorization_nonce_sha256,p_authorization_issued_at,p_authorization_expires_at);
  INSERT INTO hr_yuzhou_production_import_authorization_use(intent,operation_id,import_operation_id,authorization_artifact_sha256,authorization_nonce_sha256)
  VALUES('production_import_rollback',p_rollback_operation_id,p_import_operation_id,p_authorization_artifact_sha256,p_authorization_nonce_sha256);
END$$;

REVOKE ALL ON FUNCTION hr_yuzhou_consume_import_authorization(varchar,char,char,char,char,char,char,char,timestamptz,timestamptz,timestamptz,timestamptz,char,char,char,char,char) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_start_production_import(varchar,char) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_consume_rollback_authorization(varchar,varchar,char,char,char,char,timestamptz,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_validate_production_import_owner_map() FROM PUBLIC;
REVOKE ALL ON hr_yuzhou_production_import_operation,hr_yuzhou_production_import_authorization_use,
  hr_yuzhou_production_import_rollback_operation,hr_yuzhou_production_import_phase,hr_yuzhou_production_import_record,
  hr_yuzhou_production_import_before_image,hr_yuzhou_production_import_quarantine FROM PUBLIC;
REVOKE ALL ON SEQUENCE hr_yuzhou_production_import_authorization_use_usage_id_seq FROM PUBLIC;

COMMIT;
