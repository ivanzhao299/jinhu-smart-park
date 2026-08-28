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
  manifest_sha256 char(64) NOT NULL,
  final_rehearsal_pair_sha256 char(64) NOT NULL,
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
    AND manifest_sha256 ~ '^[0-9a-f]{64}$'
    AND final_rehearsal_pair_sha256 ~ '^[0-9a-f]{64}$'
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
    intent IN ('production_import','production_import_rollback')
    AND authorization_artifact_sha256 ~ '^[0-9a-f]{64}$'
    AND authorization_nonce_sha256 ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE hr_yuzhou_production_import_rollback_operation (
  rollback_operation_id varchar(72) PRIMARY KEY,
  import_operation_id varchar(64) NOT NULL REFERENCES hr_yuzhou_production_import_operation(operation_id),
  status varchar(32) NOT NULL,
  sealed_plan_sha256 char(64) NOT NULL,
  authorization_artifact_sha256 char(64) NOT NULL UNIQUE,
  authorization_nonce_sha256 char(64) NOT NULL UNIQUE,
  failure_code varchar(96),
  authorized_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  CONSTRAINT ck_hr_yuzhou_prod_rollback_identity CHECK (
    rollback_operation_id ~ '^yzprod-rollback-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$'
    AND sealed_plan_sha256 ~ '^[0-9a-f]{64}$'
    AND authorization_artifact_sha256 ~ '^[0-9a-f]{64}$'
    AND authorization_nonce_sha256 ~ '^[0-9a-f]{64}$'
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

CREATE FUNCTION hr_yuzhou_consume_import_authorization(
  p_operation_id varchar,
  p_code_sha char(40),
  p_source_snapshot_sha256 char(64),
  p_mapping_contract_sha256 char(64),
  p_sealed_plan_sha256 char(64),
  p_target_identity_sha256 char(64),
  p_authorization_artifact_sha256 char(64),
  p_authorization_nonce_sha256 char(64),
  p_manifest_sha256 char(64),
  p_final_rehearsal_pair_sha256 char(64)
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_REQUIRES_SERIALIZABLE';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_yuzhou_production_import',0));
  INSERT INTO hr_yuzhou_production_import_operation(
    operation_id,intent,status,code_sha,source_snapshot_sha256,mapping_contract_sha256,sealed_plan_sha256,
    target_identity_sha256,authorization_artifact_sha256,authorization_nonce_sha256,manifest_sha256,
    final_rehearsal_pair_sha256,phase_order
  ) VALUES (
    p_operation_id,'production_import','authorized',p_code_sha,p_source_snapshot_sha256,p_mapping_contract_sha256,p_sealed_plan_sha256,
    p_target_identity_sha256,p_authorization_artifact_sha256,p_authorization_nonce_sha256,p_manifest_sha256,
    p_final_rehearsal_pair_sha256,'["T0","T1","T2","T3"]'::jsonb
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
  p_authorization_artifact_sha256 char(64),
  p_authorization_nonce_sha256 char(64)
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_REQUIRES_SERIALIZABLE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hr_yuzhou_production_import_rollback',0));
  IF NOT EXISTS(SELECT 1 FROM hr_yuzhou_production_import_operation WHERE operation_id=p_import_operation_id AND sealed_plan_sha256=p_sealed_plan_sha256 AND status='succeeded') THEN
    RAISE EXCEPTION 'HR_PRODUCTION_IMPORT_ROLLBACK_SOURCE_INVALID';
  END IF;
  INSERT INTO hr_yuzhou_production_import_rollback_operation(rollback_operation_id,import_operation_id,status,sealed_plan_sha256,authorization_artifact_sha256,authorization_nonce_sha256)
  VALUES(p_rollback_operation_id,p_import_operation_id,'authorized',p_sealed_plan_sha256,p_authorization_artifact_sha256,p_authorization_nonce_sha256);
  INSERT INTO hr_yuzhou_production_import_authorization_use(intent,operation_id,import_operation_id,authorization_artifact_sha256,authorization_nonce_sha256)
  VALUES('production_import_rollback',p_rollback_operation_id,p_import_operation_id,p_authorization_artifact_sha256,p_authorization_nonce_sha256);
END$$;

REVOKE ALL ON FUNCTION hr_yuzhou_consume_import_authorization(varchar,char,char,char,char,char,char,char,char,char) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_start_production_import(varchar,char) FROM PUBLIC;
REVOKE ALL ON FUNCTION hr_yuzhou_consume_rollback_authorization(varchar,varchar,char,char,char) FROM PUBLIC;
REVOKE ALL ON hr_yuzhou_production_import_operation,hr_yuzhou_production_import_authorization_use,
  hr_yuzhou_production_import_rollback_operation,hr_yuzhou_production_import_phase,hr_yuzhou_production_import_record,
  hr_yuzhou_production_import_before_image,hr_yuzhou_production_import_quarantine FROM PUBLIC;

COMMIT;
