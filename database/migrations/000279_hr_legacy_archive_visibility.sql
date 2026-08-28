BEGIN;

-- The archive projection is deliberately separate from online HR aggregates.
-- A legacy identity can own an employee only through the immutable T0 record map;
-- names, employee codes and other mutable display fields are never mapping keys.
CREATE TABLE hr_legacy_identity_registry (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  source_system varchar(64) NOT NULL,
  source_table varchar(256) NOT NULL,
  source_identity_sha256 char(64) NOT NULL,
  source_row_sha256 char(64) NOT NULL,
  identity_kind varchar(32) NOT NULL,
  mapping_status varchar(32) NOT NULL,
  owner_employee_id uuid,
  owner_record_map_id uuid REFERENCES legacy_record_map(id),
  owner_source_system varchar(64),
  owner_source_table varchar(256),
  owner_source_identity_sha256 char(64),
  resolution_reason_code varchar(64),
  resolved_by uuid,
  resolved_at timestamptz,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hr_legacy_identity_hashes CHECK (
    source_identity_sha256 ~ '^[0-9a-f]{64}$' AND source_row_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT ck_hr_legacy_identity_kind CHECK (identity_kind IN ('person','archive_record','file_logical')),
  CONSTRAINT ck_hr_legacy_identity_status CHECK (mapping_status IN ('mapped','archive_only','quarantine','resolved')),
  CONSTRAINT ck_hr_legacy_identity_owner CHECK (
    (mapping_status IN ('mapped','resolved') AND owner_employee_id IS NOT NULL AND owner_record_map_id IS NOT NULL
      AND btrim(owner_source_system)<>'' AND btrim(owner_source_table)<>'' AND owner_source_identity_sha256 ~ '^[0-9a-f]{64}$')
    OR (mapping_status IN ('archive_only','quarantine') AND owner_employee_id IS NULL AND owner_record_map_id IS NULL
      AND owner_source_system IS NULL AND owner_source_table IS NULL AND owner_source_identity_sha256 IS NULL)
  ),
  CONSTRAINT ck_hr_legacy_identity_resolution CHECK (
    (mapping_status='resolved' AND resolution_reason_code IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
    OR (mapping_status<>'resolved' AND resolution_reason_code IS NULL AND resolved_by IS NULL AND resolved_at IS NULL)
  ),
  CONSTRAINT fk_hr_legacy_identity_employee_scope FOREIGN KEY(tenant_id,park_id,owner_employee_id)
    REFERENCES hr_employee(tenant_id,park_id,id),
  CONSTRAINT uq_hr_legacy_identity_source UNIQUE(tenant_id,park_id,source_system,source_table,source_identity_sha256)
);
CREATE UNIQUE INDEX uq_hr_legacy_identity_scope_id ON hr_legacy_identity_registry(tenant_id,park_id,id);
CREATE INDEX ix_hr_legacy_identity_owner ON hr_legacy_identity_registry(tenant_id,park_id,owner_employee_id,mapping_status)
  WHERE owner_employee_id IS NOT NULL;
CREATE INDEX ix_hr_legacy_identity_unclaimed ON hr_legacy_identity_registry(tenant_id,park_id,mapping_status,source_table)
  WHERE owner_employee_id IS NULL;

CREATE OR REPLACE FUNCTION hr_assert_legacy_identity_t0_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE record_map legacy_record_map%ROWTYPE;
BEGIN
  IF NEW.owner_record_map_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO record_map FROM legacy_record_map WHERE id=NEW.owner_record_map_id;
  IF NOT FOUND
    OR NOT record_map.is_active
    OR record_map.mapping_status NOT IN ('loaded','verified')
    OR record_map.source_system<>'yuzhou-v10'
    OR record_map.source_table<>'dbo.person'
    OR record_map.source_system<>NEW.owner_source_system
    OR record_map.source_table<>NEW.owner_source_table
    OR record_map.source_identity_sha256<>NEW.owner_source_identity_sha256
    OR record_map.target_table<>'hr_employee'
    OR record_map.target_id IS DISTINCT FROM NEW.owner_employee_id
  THEN
    RAISE EXCEPTION 'HR_LEGACY_OWNER_REQUIRES_EXACT_T0_RECORD_MAP';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_legacy_identity_t0_owner
  BEFORE INSERT OR UPDATE OF owner_employee_id,owner_record_map_id,owner_source_system,owner_source_table,owner_source_identity_sha256,mapping_status
  ON hr_legacy_identity_registry FOR EACH ROW EXECUTE FUNCTION hr_assert_legacy_identity_t0_owner();

CREATE OR REPLACE FUNCTION hr_guard_legacy_identity_registry() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'HR_LEGACY_IDENTITY_IMMUTABLE'; END IF;
  IF ROW(OLD.tenant_id,OLD.park_id,OLD.source_system,OLD.source_table,OLD.source_identity_sha256,OLD.source_row_sha256,OLD.identity_kind,OLD.create_time)
    IS DISTINCT FROM ROW(NEW.tenant_id,NEW.park_id,NEW.source_system,NEW.source_table,NEW.source_identity_sha256,NEW.source_row_sha256,NEW.identity_kind,NEW.create_time)
  THEN RAISE EXCEPTION 'HR_LEGACY_IDENTITY_IMMUTABLE'; END IF;
  IF NEW.mapping_status<>OLD.mapping_status AND NOT (
    NEW.mapping_status='resolved' AND OLD.mapping_status IN ('mapped','archive_only','quarantine')
  ) THEN RAISE EXCEPTION 'HR_LEGACY_IDENTITY_TRANSITION_INVALID'; END IF;
  IF OLD.mapping_status IN ('mapped','resolved') AND ROW(OLD.owner_employee_id,OLD.owner_record_map_id,OLD.owner_source_system,OLD.owner_source_table,OLD.owner_source_identity_sha256)
    IS DISTINCT FROM ROW(NEW.owner_employee_id,NEW.owner_record_map_id,NEW.owner_source_system,NEW.owner_source_table,NEW.owner_source_identity_sha256)
  THEN RAISE EXCEPTION 'HR_LEGACY_IDENTITY_OWNER_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_legacy_identity_registry_guard BEFORE UPDATE OR DELETE ON hr_legacy_identity_registry
  FOR EACH ROW EXECUTE FUNCTION hr_guard_legacy_identity_registry();

CREATE TABLE hr_legacy_archive_record (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  identity_registry_id uuid NOT NULL,
  record_type varchar(64) NOT NULL,
  occurred_on date,
  display_title varchar(200) NOT NULL,
  display_safe_projection jsonb NOT NULL DEFAULT '{}'::jsonb,
  restricted_safe_projection jsonb NOT NULL DEFAULT '{}'::jsonb,
  encrypted_source_object_ref varchar(512),
  encrypted_source_object_sha256 char(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_hr_legacy_archive_identity FOREIGN KEY(tenant_id,park_id,identity_registry_id)
    REFERENCES hr_legacy_identity_registry(tenant_id,park_id,id),
  CONSTRAINT ck_hr_legacy_archive_type CHECK (record_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT ck_hr_legacy_archive_title CHECK (btrim(display_title)<>''),
  CONSTRAINT ck_hr_legacy_archive_projection CHECK (
    jsonb_typeof(display_safe_projection)='object' AND jsonb_typeof(restricted_safe_projection)='object'
  ),
  CONSTRAINT ck_hr_legacy_archive_encrypted_source CHECK (
    (encrypted_source_object_ref IS NULL AND encrypted_source_object_sha256 IS NULL)
    OR (encrypted_source_object_ref ~ '^encrypted-object://[A-Za-z0-9._/-]+$'
      AND encrypted_source_object_sha256 ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT uq_hr_legacy_archive_identity UNIQUE(tenant_id,park_id,identity_registry_id)
);
CREATE UNIQUE INDEX uq_hr_legacy_archive_scope_id ON hr_legacy_archive_record(tenant_id,park_id,id);
CREATE INDEX ix_hr_legacy_archive_type_date ON hr_legacy_archive_record(tenant_id,park_id,record_type,occurred_on DESC);

-- Physical content is de-duplicated by digest. Logical photo/file rows keep
-- source ownership and display metadata, never a binary payload or storage path.
CREATE TABLE hr_legacy_file_blob_object (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  content_sha256 char(64) NOT NULL,
  size_bytes bigint NOT NULL,
  media_type varchar(160) NOT NULL,
  encrypted_blob_ref varchar(512),
  availability varchar(32) NOT NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hr_legacy_blob_hash CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_legacy_blob_size CHECK (size_bytes>=0),
  CONSTRAINT ck_hr_legacy_blob_availability CHECK (availability IN ('available','missing','empty','quarantine')),
  CONSTRAINT ck_hr_legacy_blob_ref CHECK (
    (availability='available' AND encrypted_blob_ref IS NOT NULL
      AND encrypted_blob_ref ~ '^encrypted-object://[A-Za-z0-9._/-]+$')
    OR (availability<>'available' AND encrypted_blob_ref IS NULL)
  ),
  CONSTRAINT uq_hr_legacy_blob_scope_hash UNIQUE(tenant_id,park_id,content_sha256)
);
CREATE UNIQUE INDEX uq_hr_legacy_blob_scope_id ON hr_legacy_file_blob_object(tenant_id,park_id,id);

CREATE TABLE hr_legacy_file_logical_record (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  identity_registry_id uuid NOT NULL,
  archive_record_id uuid,
  blob_object_id uuid,
  logical_kind varchar(32) NOT NULL,
  logical_name varchar(255) NOT NULL,
  source_locator_sha256 char(64) NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_hr_legacy_file_identity FOREIGN KEY(tenant_id,park_id,identity_registry_id)
    REFERENCES hr_legacy_identity_registry(tenant_id,park_id,id),
  CONSTRAINT fk_hr_legacy_file_archive FOREIGN KEY(tenant_id,park_id,archive_record_id)
    REFERENCES hr_legacy_archive_record(tenant_id,park_id,id),
  CONSTRAINT fk_hr_legacy_file_blob FOREIGN KEY(tenant_id,park_id,blob_object_id)
    REFERENCES hr_legacy_file_blob_object(tenant_id,park_id,id),
  CONSTRAINT ck_hr_legacy_file_kind CHECK (logical_kind IN ('photo','document','attachment')),
  CONSTRAINT ck_hr_legacy_file_name CHECK (btrim(logical_name)<>''),
  CONSTRAINT ck_hr_legacy_file_locator CHECK (source_locator_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_legacy_file_order CHECK (display_order>=0),
  CONSTRAINT uq_hr_legacy_file_identity UNIQUE(tenant_id,park_id,identity_registry_id)
);
CREATE INDEX ix_hr_legacy_file_archive ON hr_legacy_file_logical_record(tenant_id,park_id,archive_record_id,display_order,id);

CREATE OR REPLACE FUNCTION hr_assert_legacy_archive_identity_kinds() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE registry_kind varchar(32); file_owner uuid; archive_owner uuid;
BEGIN
  IF TG_TABLE_NAME='hr_legacy_archive_record' THEN
    SELECT identity_kind INTO registry_kind FROM hr_legacy_identity_registry
      WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND id=NEW.identity_registry_id;
    IF registry_kind IS DISTINCT FROM 'archive_record' THEN RAISE EXCEPTION 'HR_LEGACY_ARCHIVE_IDENTITY_KIND_INVALID'; END IF;
  ELSE
    SELECT identity_kind,owner_employee_id INTO registry_kind,file_owner FROM hr_legacy_identity_registry
      WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND id=NEW.identity_registry_id;
    IF registry_kind IS DISTINCT FROM 'file_logical' THEN RAISE EXCEPTION 'HR_LEGACY_FILE_IDENTITY_KIND_INVALID'; END IF;
    IF NEW.archive_record_id IS NOT NULL THEN
      SELECT registry.owner_employee_id INTO archive_owner
      FROM hr_legacy_archive_record archive
      JOIN hr_legacy_identity_registry registry ON (registry.tenant_id,registry.park_id,registry.id)=(archive.tenant_id,archive.park_id,archive.identity_registry_id)
      WHERE archive.tenant_id=NEW.tenant_id AND archive.park_id=NEW.park_id AND archive.id=NEW.archive_record_id;
      IF NOT FOUND OR archive_owner IS DISTINCT FROM file_owner THEN RAISE EXCEPTION 'HR_LEGACY_FILE_OWNER_MISMATCH'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_legacy_archive_identity_kind BEFORE INSERT OR UPDATE OF tenant_id,park_id,identity_registry_id ON hr_legacy_archive_record
  FOR EACH ROW EXECUTE FUNCTION hr_assert_legacy_archive_identity_kinds();
CREATE TRIGGER trg_hr_legacy_file_identity_kind BEFORE INSERT OR UPDATE OF tenant_id,park_id,identity_registry_id,archive_record_id ON hr_legacy_file_logical_record
  FOR EACH ROW EXECUTE FUNCTION hr_assert_legacy_archive_identity_kinds();

-- Archive rows are imported evidence. Online API users cannot mutate them;
-- future controlled migration writers use a separate privileged connection.
CREATE OR REPLACE FUNCTION hr_legacy_archive_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'HR_LEGACY_ARCHIVE_IMMUTABLE';
END $$;
CREATE TRIGGER trg_hr_legacy_archive_record_immutable BEFORE UPDATE OR DELETE ON hr_legacy_archive_record
  FOR EACH ROW EXECUTE FUNCTION hr_legacy_archive_immutable();
CREATE TRIGGER trg_hr_legacy_file_logical_immutable BEFORE UPDATE OR DELETE ON hr_legacy_file_logical_record
  FOR EACH ROW EXECUTE FUNCTION hr_legacy_archive_immutable();
CREATE TRIGGER trg_hr_legacy_file_blob_immutable BEFORE UPDATE OR DELETE ON hr_legacy_file_blob_object
  FOR EACH ROW EXECUTE FUNCTION hr_legacy_archive_immutable();

COMMIT;
