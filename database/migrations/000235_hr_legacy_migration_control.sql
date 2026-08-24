CREATE TABLE IF NOT EXISTS legacy_source_object (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_system varchar(64) NOT NULL,
  source_database varchar(128) NOT NULL,
  object_type varchar(32) NOT NULL,
  object_schema varchar(128) NOT NULL DEFAULT 'dbo',
  object_name varchar(256) NOT NULL,
  source_version varchar(64),
  checksum_sha256 char(64) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_legacy_source_object_type CHECK (object_type IN ('database','table','view','procedure','function','trigger','file','report')),
  CONSTRAINT ck_legacy_source_object_checksum CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_legacy_source_object_metadata CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_legacy_source_object_version
  ON legacy_source_object(source_system,source_database,object_type,object_schema,object_name,checksum_sha256);

CREATE TABLE IF NOT EXISTS migration_batch (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id varchar(64) NOT NULL,
  source_system varchar(64) NOT NULL,
  source_snapshot_sha256 char(64) NOT NULL,
  target_database varchar(128) NOT NULL,
  phase varchar(32) NOT NULL DEFAULT 'inventory',
  status varchar(32) NOT NULL DEFAULT 'pending',
  tool_version varchar(64) NOT NULL,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_migration_batch_run_id UNIQUE(run_id),
  CONSTRAINT ck_migration_batch_run_id CHECK (run_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$'),
  CONSTRAINT ck_migration_batch_snapshot CHECK (source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_migration_batch_target CHECK (target_database ~ '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$'),
  CONSTRAINT ck_migration_batch_phase CHECK (phase IN ('inventory','extract','profile','transform','load','verify','report','rollback')),
  CONSTRAINT ck_migration_batch_status CHECK (status IN ('pending','running','succeeded','failed','cancelled','rolled_back')),
  CONSTRAINT ck_migration_batch_counts CHECK (jsonb_typeof(counts) = 'object'),
  CONSTRAINT ck_migration_batch_dates CHECK (finished_at IS NULL OR started_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS migration_batch_item (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id uuid NOT NULL REFERENCES migration_batch(id),
  domain varchar(64) NOT NULL,
  source_object varchar(256) NOT NULL,
  phase varchar(32) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',
  extracted_count bigint NOT NULL DEFAULT 0,
  valid_count bigint NOT NULL DEFAULT 0,
  loaded_count bigint NOT NULL DEFAULT 0,
  rejected_count bigint NOT NULL DEFAULT 0,
  checksum_sha256 char(64),
  started_at timestamptz,
  finished_at timestamptz,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_migration_batch_item UNIQUE(batch_id,domain,source_object,phase),
  CONSTRAINT ck_migration_batch_item_phase CHECK (phase IN ('inventory','extract','profile','transform','load','verify','report','rollback')),
  CONSTRAINT ck_migration_batch_item_status CHECK (status IN ('pending','running','succeeded','failed','skipped','quarantined')),
  CONSTRAINT ck_migration_batch_item_counts CHECK (extracted_count>=0 AND valid_count>=0 AND loaded_count>=0 AND rejected_count>=0 AND valid_count+rejected_count<=extracted_count),
  CONSTRAINT ck_migration_batch_item_checksum CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS legacy_record_map (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id uuid NOT NULL REFERENCES migration_batch(id),
  source_system varchar(64) NOT NULL,
  source_table varchar(256) NOT NULL,
  source_pk_canonical varchar(512) NOT NULL,
  source_identity_sha256 char(64) NOT NULL,
  source_row_sha256 char(64) NOT NULL,
  target_table varchar(256) NOT NULL,
  target_id uuid,
  mapping_status varchar(32) NOT NULL DEFAULT 'mapped',
  is_active boolean NOT NULL DEFAULT true,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_legacy_record_map_identity CHECK (source_identity_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_legacy_record_map_row CHECK (source_row_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_legacy_record_map_status CHECK (mapping_status IN ('mapped','loaded','verified','quarantined','rolled_back')),
  CONSTRAINT ck_legacy_record_map_target CHECK ((mapping_status IN ('loaded','verified') AND target_id IS NOT NULL) OR mapping_status NOT IN ('loaded','verified'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_legacy_record_map_active_source
  ON legacy_record_map(source_system,source_table,source_identity_sha256) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_legacy_record_map_batch ON legacy_record_map(batch_id,mapping_status);
CREATE INDEX IF NOT EXISTS idx_legacy_record_map_target ON legacy_record_map(target_table,target_id) WHERE target_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS migration_error (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id uuid NOT NULL REFERENCES migration_batch(id),
  batch_item_id uuid REFERENCES migration_batch_item(id),
  category varchar(64) NOT NULL,
  error_code varchar(128) NOT NULL,
  source_identity_sha256 char(64),
  redacted_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_redacted boolean NOT NULL DEFAULT true,
  retryable boolean NOT NULL DEFAULT false,
  status varchar(32) NOT NULL DEFAULT 'open',
  resolution varchar(1000),
  create_time timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT ck_migration_error_identity CHECK (source_identity_sha256 IS NULL OR source_identity_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_migration_error_evidence CHECK (evidence_redacted AND jsonb_typeof(redacted_evidence)='object'),
  CONSTRAINT ck_migration_error_status CHECK (status IN ('open','retrying','resolved','waived')),
  CONSTRAINT ck_migration_error_resolution CHECK ((status IN ('resolved','waived'))=(resolved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_migration_error_batch ON migration_error(batch_id,status,category);

CREATE TABLE IF NOT EXISTS migration_check (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id uuid NOT NULL REFERENCES migration_batch(id),
  batch_item_id uuid REFERENCES migration_batch_item(id),
  check_code varchar(128) NOT NULL,
  expected_value jsonb NOT NULL,
  actual_value jsonb NOT NULL,
  tolerance jsonb NOT NULL DEFAULT '{}'::jsonb,
  passed boolean NOT NULL,
  evidence_sha256 char(64) NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_migration_check UNIQUE(batch_id,check_code),
  CONSTRAINT ck_migration_check_json CHECK (jsonb_typeof(tolerance)='object'),
  CONSTRAINT ck_migration_check_evidence CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS migration_rollback_point (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id uuid NOT NULL REFERENCES migration_batch(id),
  rollback_code varchar(128) NOT NULL,
  target_snapshot varchar(256),
  reversible_scope jsonb NOT NULL,
  cleanup_manifest jsonb NOT NULL,
  evidence_sha256 char(64) NOT NULL,
  verified_at timestamptz,
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_migration_rollback_point UNIQUE(batch_id,rollback_code),
  CONSTRAINT ck_migration_rollback_scope CHECK (jsonb_typeof(reversible_scope)='object' AND jsonb_typeof(cleanup_manifest)='object'),
  CONSTRAINT ck_migration_rollback_evidence CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$')
);
