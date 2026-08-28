BEGIN;

CREATE TABLE hr_legacy_dictionary_version (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  source_system varchar(32) NOT NULL DEFAULT 'yuzhou-v10',
  dictionary_code varchar(64) NOT NULL,
  source_table varchar(128) NOT NULL,
  source_snapshot_sha256 char(64) NOT NULL,
  source_row_count integer NOT NULL,
  decision_items_sha256 char(64),
  status varchar(16) NOT NULL DEFAULT 'draft',
  approved_by uuid,
  approved_at timestamptz,
  decision_note varchar(500),
  create_by uuid NOT NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid NOT NULL,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_hr_legacy_dictionary_source_system
    CHECK (source_system = 'yuzhou-v10'),
  CONSTRAINT ck_hr_legacy_dictionary_code
    CHECK (dictionary_code IN (
      'employee_job_state',
      'employment_event_type',
      'employment_event_state',
      'contract_type',
      'contract_state'
    )),
  CONSTRAINT ck_hr_legacy_dictionary_snapshot_sha
    CHECK (source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_legacy_dictionary_source_rows
    CHECK (source_row_count >= 0),
  CONSTRAINT ck_hr_legacy_dictionary_items_sha
    CHECK (
      (status = 'draft' AND decision_items_sha256 IS NULL)
      OR
      (status IN ('approved','superseded') AND decision_items_sha256 ~ '^[0-9a-f]{64}$')
    ),
  CONSTRAINT ck_hr_legacy_dictionary_status
    CHECK (status IN ('draft','approved','superseded')),
  CONSTRAINT ck_hr_legacy_dictionary_approval
    CHECK (
      (status = 'draft' AND approved_by IS NULL AND approved_at IS NULL)
      OR
      (status IN ('approved','superseded') AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),
  CONSTRAINT ck_hr_legacy_dictionary_four_eyes
    CHECK (approved_by IS NULL OR (approved_by <> create_by AND approved_by <> update_by)),
  CONSTRAINT uq_hr_legacy_dictionary_scope_id UNIQUE (tenant_id,park_id,id),
  CONSTRAINT uq_hr_legacy_dictionary_snapshot UNIQUE (
    tenant_id,park_id,source_system,dictionary_code,source_snapshot_sha256
  )
);

CREATE UNIQUE INDEX uq_hr_legacy_dictionary_approved
  ON hr_legacy_dictionary_version(tenant_id,park_id,source_system,dictionary_code)
  WHERE status = 'approved' AND is_deleted = false;
CREATE INDEX ix_hr_legacy_dictionary_list
  ON hr_legacy_dictionary_version(tenant_id,park_id,dictionary_code,status,create_time DESC)
  WHERE is_deleted = false;

CREATE TABLE hr_legacy_dictionary_item (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  version_id uuid NOT NULL,
  source_code varchar(128),
  source_name varchar(255),
  source_value varchar(255),
  source_identity_sha256 char(64) NOT NULL,
  source_row_sha256 char(64) NOT NULL,
  decision varchar(24) NOT NULL,
  target_domain varchar(64),
  target_value varchar(64),
  reason_code varchar(64) NOT NULL,
  review_note varchar(500),
  create_by uuid NOT NULL,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid NOT NULL,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT fk_hr_legacy_dictionary_item_version
    FOREIGN KEY (tenant_id,park_id,version_id)
    REFERENCES hr_legacy_dictionary_version(tenant_id,park_id,id),
  CONSTRAINT ck_hr_legacy_dictionary_item_source
    CHECK (
      NULLIF(btrim(source_code),'') IS NOT NULL
      OR NULLIF(btrim(source_name),'') IS NOT NULL
      OR NULLIF(btrim(source_value),'') IS NOT NULL
    ),
  CONSTRAINT ck_hr_legacy_dictionary_item_identity_sha
    CHECK (source_identity_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_legacy_dictionary_item_row_sha
    CHECK (source_row_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_legacy_dictionary_item_decision
    CHECK (decision IN ('map','raw_only','reject')),
  CONSTRAINT ck_hr_legacy_dictionary_item_target
    CHECK (
      (decision = 'map'
        AND NULLIF(btrim(target_domain),'') IS NOT NULL
        AND NULLIF(btrim(target_value),'') IS NOT NULL)
      OR
      (decision <> 'map' AND target_domain IS NULL AND target_value IS NULL)
    ),
  CONSTRAINT ck_hr_legacy_dictionary_item_reason
    CHECK (NULLIF(btrim(reason_code),'') IS NOT NULL),
  CONSTRAINT uq_hr_legacy_dictionary_item_scope_id UNIQUE (tenant_id,park_id,id),
  CONSTRAINT uq_hr_legacy_dictionary_item_identity UNIQUE (version_id,source_identity_sha256)
);

CREATE UNIQUE INDEX uq_hr_legacy_dictionary_item_source_key
  ON hr_legacy_dictionary_item(
    version_id,
    lower(coalesce(NULLIF(btrim(source_code),''),E'\\x00')),
    lower(coalesce(NULLIF(btrim(source_name),''),E'\\x00')),
    lower(coalesce(NULLIF(btrim(source_value),''),E'\\x00'))
  )
  WHERE is_deleted = false;
CREATE UNIQUE INDEX uq_hr_legacy_dictionary_item_source_code
  ON hr_legacy_dictionary_item(version_id,lower(btrim(source_code)))
  WHERE is_deleted = false AND NULLIF(btrim(source_code),'') IS NOT NULL;
CREATE UNIQUE INDEX uq_hr_legacy_dictionary_item_source_name
  ON hr_legacy_dictionary_item(version_id,lower(btrim(source_name)))
  WHERE is_deleted = false AND NULLIF(btrim(source_name),'') IS NOT NULL;
CREATE UNIQUE INDEX uq_hr_legacy_dictionary_item_source_value
  ON hr_legacy_dictionary_item(version_id,lower(btrim(source_value)))
  WHERE is_deleted = false AND NULLIF(btrim(source_value),'') IS NOT NULL;
CREATE INDEX ix_hr_legacy_dictionary_item_version
  ON hr_legacy_dictionary_item(tenant_id,park_id,version_id,create_time,id)
  WHERE is_deleted = false;

CREATE FUNCTION hr_legacy_dictionary_items_sha256(
  p_tenant_id varchar,
  p_park_id varchar,
  p_version_id uuid
)
RETURNS char(64) LANGUAGE sql STABLE AS $$
  SELECT encode(digest(convert_to(coalesce(jsonb_agg(
    jsonb_build_object(
      'source_code',source_code,'source_name',source_name,'source_value',source_value,
      'source_identity_sha256',source_identity_sha256,'source_row_sha256',source_row_sha256,
      'decision',decision,'target_domain',target_domain,'target_value',target_value,
      'reason_code',reason_code,'review_note',review_note
    ) ORDER BY source_identity_sha256,id)::text,'[]'),'UTF8'),'sha256'),'hex')
  FROM hr_legacy_dictionary_item
  WHERE tenant_id=p_tenant_id AND park_id=p_park_id AND version_id=p_version_id AND is_deleted=false
$$;

CREATE FUNCTION hr_legacy_dictionary_version_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'HR_LEGACY_DICTIONARY_APPROVED_IMMUTABLE';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'approved' THEN
    IF NEW.status <> 'superseded'
       OR (NEW.tenant_id,NEW.park_id,NEW.source_system,NEW.dictionary_code,
           NEW.source_table,NEW.source_snapshot_sha256,NEW.source_row_count,NEW.decision_items_sha256,
           NEW.approved_by,NEW.approved_at,NEW.decision_note,NEW.create_by,
           NEW.create_time,NEW.is_deleted,NEW.remark)
          IS DISTINCT FROM
          (OLD.tenant_id,OLD.park_id,OLD.source_system,OLD.dictionary_code,
           OLD.source_table,OLD.source_snapshot_sha256,OLD.source_row_count,OLD.decision_items_sha256,
           OLD.approved_by,OLD.approved_at,OLD.decision_note,OLD.create_by,
           OLD.create_time,OLD.is_deleted,OLD.remark) THEN
      RAISE EXCEPTION 'HR_LEGACY_DICTIONARY_APPROVED_IMMUTABLE';
    END IF;
  ELSIF OLD.status = 'superseded' THEN
    RAISE EXCEPTION 'HR_LEGACY_DICTIONARY_SUPERSEDED_IMMUTABLE';
  ELSIF NEW.status NOT IN ('draft','approved') THEN
    RAISE EXCEPTION 'HR_LEGACY_DICTIONARY_TRANSITION_INVALID';
  END IF;
  IF OLD.status = 'draft' AND NEW.status = 'approved' THEN
    IF NEW.decision_items_sha256 IS DISTINCT FROM
       hr_legacy_dictionary_items_sha256(NEW.tenant_id,NEW.park_id,NEW.id) THEN
      RAISE EXCEPTION 'HR_LEGACY_DICTIONARY_ITEMS_SHA_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_hr_legacy_dictionary_version_guard
BEFORE UPDATE OR DELETE ON hr_legacy_dictionary_version
FOR EACH ROW EXECUTE FUNCTION hr_legacy_dictionary_version_guard();

CREATE FUNCTION hr_legacy_dictionary_item_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status varchar(16);
BEGIN
  SELECT status INTO parent_status
  FROM hr_legacy_dictionary_version
  WHERE id = COALESCE(NEW.version_id,OLD.version_id)
    AND tenant_id = COALESCE(NEW.tenant_id,OLD.tenant_id)
    AND park_id = COALESCE(NEW.park_id,OLD.park_id)
  FOR SHARE;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'HR_LEGACY_DICTIONARY_ITEM_IMMUTABLE';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_hr_legacy_dictionary_item_guard
BEFORE INSERT OR UPDATE OR DELETE ON hr_legacy_dictionary_item
FOR EACH ROW EXECUTE FUNCTION hr_legacy_dictionary_item_guard();

CREATE FUNCTION hr_legacy_dictionary_item_touch_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE hr_legacy_dictionary_version
  SET update_by=CASE WHEN TG_OP='DELETE' THEN OLD.update_by ELSE NEW.update_by END,
      update_time=now(),version=version+1
  WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.version_id ELSE NEW.version_id END
    AND tenant_id=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END
    AND park_id=CASE WHEN TG_OP='DELETE' THEN OLD.park_id ELSE NEW.park_id END
    AND status='draft';
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER trg_hr_legacy_dictionary_item_touch_version
AFTER INSERT OR UPDATE OR DELETE ON hr_legacy_dictionary_item
FOR EACH ROW EXECUTE FUNCTION hr_legacy_dictionary_item_touch_version();

CREATE FUNCTION hr_resolve_legacy_dictionary(
  p_tenant_id varchar,
  p_park_id varchar,
  p_dictionary_code varchar,
  p_source_snapshot_sha256 char(64),
  p_source_code varchar DEFAULT NULL,
  p_source_name varchar DEFAULT NULL,
  p_source_value varchar DEFAULT NULL
)
RETURNS TABLE(
  dictionary_version_id uuid,
  dictionary_item_id uuid,
  decision varchar,
  target_domain varchar,
  target_value varchar,
  reason_code varchar
)
LANGUAGE plpgsql STABLE AS $$
DECLARE matched_count integer;
BEGIN
  SELECT count(*) INTO matched_count
  FROM hr_legacy_dictionary_version dictionary_version
  JOIN hr_legacy_dictionary_item item
    ON item.version_id = dictionary_version.id
   AND item.tenant_id = dictionary_version.tenant_id
   AND item.park_id = dictionary_version.park_id
   AND item.is_deleted = false
  WHERE dictionary_version.tenant_id = p_tenant_id
    AND dictionary_version.park_id = p_park_id
    AND dictionary_version.source_system = 'yuzhou-v10'
    AND dictionary_version.dictionary_code = p_dictionary_code
    AND dictionary_version.source_snapshot_sha256 = p_source_snapshot_sha256
    AND dictionary_version.status = 'approved'
    AND dictionary_version.is_deleted = false
    AND lower(coalesce(NULLIF(btrim(item.source_code),''),E'\\x00')) =
        lower(coalesce(NULLIF(btrim(p_source_code),''),E'\\x00'))
    AND lower(coalesce(NULLIF(btrim(item.source_name),''),E'\\x00')) =
        lower(coalesce(NULLIF(btrim(p_source_name),''),E'\\x00'))
    AND lower(coalesce(NULLIF(btrim(item.source_value),''),E'\\x00')) =
        lower(coalesce(NULLIF(btrim(p_source_value),''),E'\\x00'));

  IF matched_count <> 1 THEN
    RAISE EXCEPTION 'HR_LEGACY_DICTIONARY_UNRESOLVED: %/%/%/%',
      p_tenant_id,p_park_id,p_dictionary_code,matched_count;
  END IF;

  RETURN QUERY
  SELECT dictionary_version.id,item.id,item.decision,item.target_domain,item.target_value,item.reason_code
  FROM hr_legacy_dictionary_version dictionary_version
  JOIN hr_legacy_dictionary_item item
    ON item.version_id = dictionary_version.id
   AND item.tenant_id = dictionary_version.tenant_id
   AND item.park_id = dictionary_version.park_id
   AND item.is_deleted = false
  WHERE dictionary_version.tenant_id = p_tenant_id
    AND dictionary_version.park_id = p_park_id
    AND dictionary_version.source_system = 'yuzhou-v10'
    AND dictionary_version.dictionary_code = p_dictionary_code
    AND dictionary_version.source_snapshot_sha256 = p_source_snapshot_sha256
    AND dictionary_version.status = 'approved'
    AND dictionary_version.is_deleted = false
    AND lower(coalesce(NULLIF(btrim(item.source_code),''),E'\\x00')) =
        lower(coalesce(NULLIF(btrim(p_source_code),''),E'\\x00'))
    AND lower(coalesce(NULLIF(btrim(item.source_name),''),E'\\x00')) =
        lower(coalesce(NULLIF(btrim(p_source_name),''),E'\\x00'))
    AND lower(coalesce(NULLIF(btrim(item.source_value),''),E'\\x00')) =
        lower(coalesce(NULLIF(btrim(p_source_value),''),E'\\x00'));
END $$;

COMMIT;
