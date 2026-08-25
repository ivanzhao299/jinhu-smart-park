BEGIN;

CREATE TABLE hr_legacy_t5_import_batch (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id),
  batch_code varchar(64) NOT NULL,
  source_snapshot_sha256 char(64) NOT NULL,
  catalog_sha256 char(64) NOT NULL,
  manifest_sha256 char(64) NOT NULL,
  source_row_count bigint NOT NULL,
  loaded_row_count bigint NOT NULL DEFAULT 0,
  quarantined_row_count bigint NOT NULL DEFAULT 0,
  status varchar(24) NOT NULL DEFAULT 'unpublished',
  create_time timestamptz NOT NULL DEFAULT now(),
  update_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hr_legacy_t5_batch_hashes CHECK (
    source_snapshot_sha256 ~ '^[0-9a-f]{64}$'
    AND catalog_sha256 ~ '^[0-9a-f]{64}$'
    AND manifest_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT ck_hr_legacy_t5_batch_counts CHECK (
    source_row_count>=0 AND loaded_row_count>=0 AND quarantined_row_count>=0
    AND source_row_count=loaded_row_count+quarantined_row_count
  ),
  CONSTRAINT ck_hr_legacy_t5_batch_status CHECK (status IN ('unpublished','staged','published','rolled_back')),
  CONSTRAINT uq_hr_legacy_t5_batch_scope_id UNIQUE(tenant_id,park_id,id),
  CONSTRAINT uq_hr_legacy_t5_batch_code UNIQUE(tenant_id,park_id,batch_code),
  CONSTRAINT uq_hr_legacy_t5_batch_migration UNIQUE(migration_batch_id)
);
CREATE INDEX ix_hr_legacy_t5_batch_migration ON hr_legacy_t5_import_batch(migration_batch_id);

CREATE TABLE hr_legacy_t5_record (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  import_batch_id uuid NOT NULL,
  employee_id uuid,
  domain varchar(32) NOT NULL,
  source_table varchar(64) NOT NULL,
  source_pk_canonical varchar(512) NOT NULL,
  source_identity_sha256 char(64) NOT NULL,
  source_row_sha256 char(64) NOT NULL,
  mapping_status varchar(32) NOT NULL,
  record_payload jsonb NOT NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hr_legacy_t5_record_domain CHECK (domain IN (
    'candidate','family','experience','skill','credential','training_course','training_history','reward_category','reward_history'
  )),
  CONSTRAINT ck_hr_legacy_t5_record_hashes CHECK (
    source_identity_sha256 ~ '^[0-9a-f]{64}$' AND source_row_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT ck_hr_legacy_t5_record_mapping CHECK (mapping_status IN ('not_applicable','employee_mapped')),
  CONSTRAINT ck_hr_legacy_t5_record_mapping_owner CHECK (
    (mapping_status='employee_mapped' AND employee_id IS NOT NULL)
    OR (mapping_status='not_applicable' AND employee_id IS NULL)
  ),
  CONSTRAINT ck_hr_legacy_t5_record_payload CHECK (jsonb_typeof(record_payload)='object'),
  CONSTRAINT fk_hr_legacy_t5_record_batch FOREIGN KEY(tenant_id,park_id,import_batch_id)
    REFERENCES hr_legacy_t5_import_batch(tenant_id,park_id,id),
  CONSTRAINT fk_hr_legacy_t5_record_employee FOREIGN KEY(tenant_id,park_id,employee_id)
    REFERENCES hr_employee(tenant_id,park_id,id),
  CONSTRAINT uq_hr_legacy_t5_record_scope_id UNIQUE(tenant_id,park_id,id),
  CONSTRAINT uq_hr_legacy_t5_record_source UNIQUE(import_batch_id,source_table,source_identity_sha256)
);
CREATE INDEX ix_hr_legacy_t5_record_batch ON hr_legacy_t5_record(tenant_id,park_id,import_batch_id);
CREATE INDEX ix_hr_legacy_t5_record_employee ON hr_legacy_t5_record(tenant_id,park_id,employee_id);

CREATE TABLE hr_legacy_t5_file_evidence (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  import_batch_id uuid NOT NULL,
  employee_id uuid,
  source_table varchar(64) NOT NULL,
  source_pk_canonical varchar(512) NOT NULL,
  source_identity_sha256 char(64) NOT NULL,
  source_row_sha256 char(64) NOT NULL,
  file_role varchar(32) NOT NULL,
  legacy_path_sha256 char(64),
  content_sha256 char(64),
  declared_size bigint,
  actual_size bigint,
  declared_mime varchar(128),
  detected_mime varchar(128),
  readability_status varchar(24) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hr_legacy_t5_file_role CHECK(file_role IN ('employee_photo','employee_document','credential_reference')),
  CONSTRAINT ck_hr_legacy_t5_file_hashes CHECK (
    source_identity_sha256 ~ '^[0-9a-f]{64}$'
    AND source_row_sha256 ~ '^[0-9a-f]{64}$'
    AND (legacy_path_sha256 IS NULL OR legacy_path_sha256 ~ '^[0-9a-f]{64}$')
    AND (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT ck_hr_legacy_t5_file_sizes CHECK (
    (declared_size IS NULL OR declared_size>=0) AND (actual_size IS NULL OR actual_size>=0)
  ),
  CONSTRAINT ck_hr_legacy_t5_file_readability CHECK(readability_status IN ('readable','empty','path_reference_only')),
  CONSTRAINT ck_hr_legacy_t5_file_content_shape CHECK (
    (readability_status='readable' AND content_sha256 IS NOT NULL AND actual_size>0 AND detected_mime IS NOT NULL)
    OR (readability_status='empty' AND content_sha256 IS NULL AND COALESCE(actual_size,0)=0)
    OR (readability_status='path_reference_only' AND legacy_path_sha256 IS NOT NULL AND content_sha256 IS NULL AND COALESCE(actual_size,0)=0)
  ),
  CONSTRAINT ck_hr_legacy_t5_file_metadata CHECK(jsonb_typeof(metadata)='object'),
  CONSTRAINT fk_hr_legacy_t5_file_batch FOREIGN KEY(tenant_id,park_id,import_batch_id)
    REFERENCES hr_legacy_t5_import_batch(tenant_id,park_id,id),
  CONSTRAINT fk_hr_legacy_t5_file_employee FOREIGN KEY(tenant_id,park_id,employee_id)
    REFERENCES hr_employee(tenant_id,park_id,id),
  CONSTRAINT uq_hr_legacy_t5_file_scope_id UNIQUE(tenant_id,park_id,id),
  CONSTRAINT uq_hr_legacy_t5_file_source UNIQUE(import_batch_id,source_table,source_identity_sha256)
);
CREATE INDEX ix_hr_legacy_t5_file_batch ON hr_legacy_t5_file_evidence(tenant_id,park_id,import_batch_id);
CREATE INDEX ix_hr_legacy_t5_file_employee ON hr_legacy_t5_file_evidence(tenant_id,park_id,employee_id);

CREATE OR REPLACE FUNCTION fn_hr_legacy_t5_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_run_id varchar(64);
BEGIN
  IF TG_OP='INSERT' THEN
    IF NOT EXISTS(
      SELECT 1 FROM hr_legacy_t5_import_batch ib
       WHERE ib.id=NEW.import_batch_id AND ib.tenant_id=NEW.tenant_id AND ib.park_id=NEW.park_id
         AND ib.status='unpublished'
       FOR SHARE
    ) THEN RAISE EXCEPTION '% accepts rows only while its import batch is unpublished',TG_TABLE_NAME; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' THEN
    RAISE EXCEPTION '% is immutable',TG_TABLE_NAME;
  END IF;
  SELECT mb.run_id INTO source_run_id
    FROM hr_legacy_t5_import_batch ib JOIN migration_batch mb ON mb.id=ib.migration_batch_id
   WHERE ib.id=OLD.import_batch_id AND ib.tenant_id=OLD.tenant_id AND ib.park_id=OLD.park_id
     AND ib.status='staged' AND mb.status='succeeded'
     AND EXISTS(SELECT 1 FROM migration_rollback_point rp WHERE rp.batch_id=mb.id AND rp.rollback_code='T5_LEGACY_HISTORY' AND rp.verified_at IS NOT NULL)
   FOR SHARE OF ib,mb;
  IF source_run_id IS NULL OR current_setting('yuzhou.t5_rollback',true) IS DISTINCT FROM source_run_id OR NOT EXISTS (
    SELECT 1 FROM legacy_record_map map
     WHERE map.batch_id=(SELECT migration_batch.id FROM migration_batch WHERE migration_batch.run_id=source_run_id)
       AND map.target_table=TG_TABLE_NAME AND map.target_id=OLD.id AND map.is_active
       AND map.source_table=OLD.source_table
       AND map.source_identity_sha256=OLD.source_identity_sha256
       AND map.source_row_sha256=OLD.source_row_sha256
  ) THEN
    RAISE EXCEPTION '% is immutable outside exact unpublished legacy rollback',TG_TABLE_NAME;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER tr_hr_legacy_t5_record_immutable BEFORE INSERT OR UPDATE OR DELETE ON hr_legacy_t5_record
  FOR EACH ROW EXECUTE FUNCTION fn_hr_legacy_t5_immutable();
CREATE TRIGGER tr_hr_legacy_t5_file_immutable BEFORE INSERT OR UPDATE OR DELETE ON hr_legacy_t5_file_evidence
  FOR EACH ROW EXECUTE FUNCTION fn_hr_legacy_t5_immutable();

CREATE OR REPLACE FUNCTION fn_hr_legacy_t5_batch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'legacy T5 import batch is immutable'; END IF;
  IF (NEW.tenant_id,NEW.park_id,NEW.migration_batch_id,NEW.batch_code,NEW.source_snapshot_sha256,
      NEW.catalog_sha256,NEW.manifest_sha256,NEW.source_row_count,NEW.create_time)
     IS DISTINCT FROM
     (OLD.tenant_id,OLD.park_id,OLD.migration_batch_id,OLD.batch_code,OLD.source_snapshot_sha256,
      OLD.catalog_sha256,OLD.manifest_sha256,OLD.source_row_count,OLD.create_time) THEN
    RAISE EXCEPTION 'legacy T5 import batch identity is immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='unpublished' AND NEW.status='staged') OR
    (OLD.status='staged' AND NEW.status IN ('published','rolled_back'))
  ) THEN RAISE EXCEPTION 'invalid legacy T5 batch transition'; END IF;
  IF OLD.status IN ('published','rolled_back') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal legacy T5 batch is immutable';
  END IF;
  IF OLD.status<>'unpublished' AND
     (NEW.loaded_row_count,NEW.quarantined_row_count) IS DISTINCT FROM (OLD.loaded_row_count,OLD.quarantined_row_count) THEN
    RAISE EXCEPTION 'staged legacy T5 batch counts are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tr_hr_legacy_t5_batch_guard BEFORE UPDATE OR DELETE ON hr_legacy_t5_import_batch
  FOR EACH ROW EXECUTE FUNCTION fn_hr_legacy_t5_batch_guard();

COMMIT;
