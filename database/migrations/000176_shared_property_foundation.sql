CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE biz_unit
  ADD COLUMN IF NOT EXISTS asset_unit_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_asset_unit_id_scope'
  ) THEN
    ALTER TABLE asset_unit
      ADD CONSTRAINT uq_asset_unit_id_scope UNIQUE (id, tenant_id, park_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_biz_unit_asset_unit_scope'
  ) THEN
    ALTER TABLE biz_unit
      ADD CONSTRAINT fk_biz_unit_asset_unit_scope
      FOREIGN KEY (asset_unit_id, tenant_id, park_id)
      REFERENCES asset_unit (id, tenant_id, park_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_unit_asset_unit_active
  ON biz_unit (tenant_id, park_id, asset_unit_id)
  WHERE is_deleted = false AND asset_unit_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS biz_property_operation_config (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  unit_id uuid NOT NULL REFERENCES biz_unit(id),
  operating_mode varchar(32) NOT NULL DEFAULT 'none',
  operating_status varchar(32) NOT NULL DEFAULT 'enabled',
  effective_time timestamptz,
  suspend_reason varchar(500),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_property_operation_mode CHECK (operating_mode IN ('none', 'short_stay', 'long_rent')),
  CONSTRAINT ck_property_operation_status CHECK (operating_status IN ('enabled', 'suspended', 'disabled')),
  CONSTRAINT ck_property_operation_suspend_reason CHECK (
    operating_status = 'enabled' OR nullif(btrim(suspend_reason), '') IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_property_operation_config_scope_unit
  ON biz_property_operation_config (tenant_id, park_id, unit_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_property_operation_config_scope_mode
  ON biz_property_operation_config (tenant_id, park_id, operating_mode, operating_status)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS biz_property_mode_transition_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  unit_id uuid NOT NULL REFERENCES biz_unit(id),
  from_mode varchar(32) NOT NULL,
  to_mode varchar(32) NOT NULL,
  reason varchar(500) NOT NULL,
  check_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  operator_id uuid NOT NULL,
  operator_name varchar(100) NOT NULL,
  transition_time timestamptz NOT NULL DEFAULT now(),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_property_mode_transition_from CHECK (from_mode IN ('none', 'short_stay', 'long_rent')),
  CONSTRAINT ck_property_mode_transition_to CHECK (to_mode IN ('none', 'short_stay', 'long_rent')),
  CONSTRAINT ck_property_mode_transition_changed CHECK (from_mode <> to_mode)
);

CREATE INDEX IF NOT EXISTS idx_property_mode_transition_scope_unit_time
  ON biz_property_mode_transition_log (tenant_id, park_id, unit_id, transition_time DESC)
  WHERE is_deleted = false;

CREATE TABLE IF NOT EXISTS biz_property_occupancy (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  unit_id uuid NOT NULL REFERENCES biz_unit(id),
  source_domain varchar(32) NOT NULL,
  source_type varchar(64) NOT NULL,
  source_id varchar(64) NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status varchar(32) NOT NULL,
  hold_expires_at timestamptz,
  idempotency_key varchar(128),
  release_reason varchar(500),
  released_at timestamptz,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_property_occupancy_domain CHECK (
    source_domain IN ('commercial_leasing', 'homestay', 'housing_rental', 'maintenance', 'operations')
  ),
  CONSTRAINT ck_property_occupancy_status CHECK (
    status IN ('held', 'active', 'released', 'completed', 'cancelled')
  ),
  CONSTRAINT ck_property_occupancy_period CHECK (start_at < end_at),
  CONSTRAINT ck_property_occupancy_hold_expiry CHECK (
    status <> 'held' OR hold_expires_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_property_occupancy_scope_unit_period
  ON biz_property_occupancy (tenant_id, park_id, unit_id, start_at, end_at)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_property_occupancy_expiring_holds
  ON biz_property_occupancy (hold_expires_at)
  WHERE is_deleted = false AND status = 'held';

CREATE UNIQUE INDEX IF NOT EXISTS uq_property_occupancy_scope_source
  ON biz_property_occupancy (tenant_id, park_id, source_domain, source_type, source_id)
  WHERE is_deleted = false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ex_property_occupancy_active_period'
  ) THEN
    ALTER TABLE biz_property_occupancy
      ADD CONSTRAINT ex_property_occupancy_active_period
      EXCLUDE USING gist (
        tenant_id WITH =,
        park_id WITH =,
        unit_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
      )
      WHERE (is_deleted = false AND status IN ('held', 'active'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION lock_property_unit_scope(
  target_tenant_id varchar,
  target_park_id varchar,
  target_unit_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(target_tenant_id || ':' || target_park_id || ':' || target_unit_id::text, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION enforce_property_occupancy_contract_exclusion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_deleted = false AND NEW.status IN ('held', 'active') THEN
    PERFORM lock_property_unit_scope(NEW.tenant_id, NEW.park_id, NEW.unit_id);
    IF EXISTS (
      SELECT 1
      FROM rel_leasing_contract_unit relation
      JOIN biz_leasing_contract contract ON contract.id = relation.contract_id
      WHERE relation.tenant_id = NEW.tenant_id
        AND relation.park_id = NEW.park_id
        AND relation.unit_id = NEW.unit_id
        AND relation.is_deleted = false
        AND relation.status = 1
        AND contract.is_deleted = false
        AND contract.status NOT IN ('90', '91')
        AND relation.start_date::timestamptz < NEW.end_at
        AND (relation.end_date + interval '1 day')::timestamptz > NEW.start_at
        AND NOT (
          NEW.source_type = 'leasing_contract'
          AND NEW.source_id = contract.id::text
        )
    ) THEN
      RAISE EXCEPTION 'property occupancy conflicts with commercial leasing contract'
        USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_property_occupancy_contract_exclusion ON biz_property_occupancy;
CREATE TRIGGER trg_property_occupancy_contract_exclusion
BEFORE INSERT OR UPDATE OF unit_id, start_at, end_at, status, is_deleted
ON biz_property_occupancy
FOR EACH ROW
EXECUTE FUNCTION enforce_property_occupancy_contract_exclusion();

CREATE OR REPLACE FUNCTION enforce_contract_unit_property_exclusion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_deleted = false AND NEW.status = 1 THEN
    PERFORM lock_property_unit_scope(NEW.tenant_id, NEW.park_id, NEW.unit_id);
    IF EXISTS (
      SELECT 1
      FROM biz_property_operation_config config
      WHERE config.tenant_id = NEW.tenant_id
        AND config.park_id = NEW.park_id
        AND config.unit_id = NEW.unit_id
        AND config.is_deleted = false
        AND config.operating_mode = 'short_stay'
    ) THEN
      RAISE EXCEPTION 'short-stay unit cannot be linked to commercial leasing contract'
        USING ERRCODE = '23P01';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM biz_property_occupancy occupancy
      WHERE occupancy.tenant_id = NEW.tenant_id
        AND occupancy.park_id = NEW.park_id
        AND occupancy.unit_id = NEW.unit_id
        AND occupancy.is_deleted = false
        AND (
          occupancy.status = 'active'
          OR (
            occupancy.status = 'held'
            AND (occupancy.hold_expires_at IS NULL OR occupancy.hold_expires_at > now())
          )
        )
        AND occupancy.start_at < (NEW.end_date + interval '1 day')::timestamptz
        AND occupancy.end_at > NEW.start_date::timestamptz
        AND NOT (
          occupancy.source_type = 'leasing_contract'
          AND occupancy.source_id = NEW.contract_id::text
        )
    ) THEN
      RAISE EXCEPTION 'commercial leasing contract conflicts with shared property occupancy'
        USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_unit_property_exclusion ON rel_leasing_contract_unit;
CREATE TRIGGER trg_contract_unit_property_exclusion
BEFORE INSERT OR UPDATE OF unit_id, start_date, end_date, status, is_deleted
ON rel_leasing_contract_unit
FOR EACH ROW
EXECUTE FUNCTION enforce_contract_unit_property_exclusion();

CREATE TABLE IF NOT EXISTS biz_party (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  party_type varchar(32) NOT NULL,
  display_name varchar(200) NOT NULL,
  mobile varchar(32),
  email varchar(200),
  identity_document_type varchar(32),
  identity_number_encrypted text,
  identity_number_hash varchar(80),
  identity_number_masked varchar(64),
  source_domain varchar(32),
  verification_status varchar(32) NOT NULL DEFAULT 'unverified',
  consent_status varchar(32) NOT NULL DEFAULT 'pending',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_biz_party_type CHECK (party_type IN ('person', 'organization')),
  CONSTRAINT ck_biz_party_source_domain CHECK (
    source_domain IS NULL OR source_domain IN ('commercial_leasing', 'homestay', 'housing_rental', 'maintenance', 'operations')
  ),
  CONSTRAINT ck_biz_party_verification CHECK (verification_status IN ('unverified', 'verified', 'rejected')),
  CONSTRAINT ck_biz_party_consent CHECK (consent_status IN ('pending', 'granted', 'withdrawn')),
  CONSTRAINT ck_biz_party_identity_pair CHECK (
    (identity_number_encrypted IS NULL AND identity_number_hash IS NULL AND identity_number_masked IS NULL)
    OR
    (identity_document_type IS NOT NULL AND identity_number_encrypted IS NOT NULL
      AND identity_number_hash IS NOT NULL AND identity_number_masked IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_biz_party_scope_type_name
  ON biz_party (tenant_id, park_id, party_type, display_name)
  WHERE is_deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_party_scope_identity_hash
  ON biz_party (tenant_id, park_id, identity_document_type, identity_number_hash)
  WHERE is_deleted = false AND identity_number_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS rel_party_role (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  party_id uuid NOT NULL REFERENCES biz_party(id),
  role_type varchar(32) NOT NULL,
  source_type varchar(64),
  source_id varchar(64),
  status varchar(32) NOT NULL DEFAULT 'active',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_rel_party_role_status CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_party_role_scope
  ON rel_party_role (
    tenant_id,
    park_id,
    party_id,
    role_type,
    coalesce(source_type, ''),
    coalesce(source_id, '')
  )
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rel_party_role_scope_source
  ON rel_party_role (tenant_id, park_id, source_type, source_id)
  WHERE is_deleted = false;

WITH permission_rows(code, name, resource, action, api_method, api_path, sort_no) AS (
  VALUES
    ('property_operation:read', '房源经营配置读取', 'biz.property_operation_config', 'read', 'GET', '/api/v1/property/units/:unitId/operation', 1320),
    ('property_operation:update', '房源经营配置修改', 'biz.property_operation_config', 'update', 'PUT', '/api/v1/property/units/:unitId/operation', 1321),
    ('property_operation:transition_mode', '房源经营模式切换', 'biz.property_operation_config', 'transition_mode', 'POST', '/api/v1/property/units/:unitId/mode-transitions', 1322),
    ('property_occupancy:read', '房源占用读取', 'biz.property_occupancy', 'read', 'GET', '/api/v1/property/occupancies', 1323),
    ('property_occupancy:create', '房源占用创建', 'biz.property_occupancy', 'create', 'POST', '/api/v1/property/occupancies', 1324),
    ('property_occupancy:activate', '房源占用生效', 'biz.property_occupancy', 'activate', 'POST', '/api/v1/property/occupancies/:id/activate', 1325),
    ('property_occupancy:release', '房源占用释放', 'biz.property_occupancy', 'release', 'POST', '/api/v1/property/occupancies/:id/release', 1326),
    ('property_occupancy:force_release', '房源占用强制释放', 'biz.property_occupancy', 'force_release', 'POST', '/api/v1/property/occupancies/:id/release', 1327),
    ('party:read', '业务相对方读取', 'biz.party', 'read', 'GET', '/api/v1/property/parties', 1328),
    ('party:create', '业务相对方新增', 'biz.party', 'create', 'POST', '/api/v1/property/parties', 1329),
    ('party:update', '业务相对方修改', 'biz.party', 'update', 'PUT', '/api/v1/property/parties/:id', 1330),
    ('party:sensitive_read', '业务相对方敏感信息读取', 'biz.party', 'sensitive_read', 'GET', '/api/v1/property/parties/:id', 1331),
    ('party_role:manage', '业务相对方角色管理', 'rel.party_role', 'manage', 'POST', '/api/v1/property/parties/roles', 1332)
)
INSERT INTO sys_permission (
  id, tenant_id, park_id, code, name, resource, action,
  is_enabled, status, permission_type, perm_type,
  permission_path, perm_path, permission_level, level,
  api_method, api_path, frontend_route, sort_no,
  is_system, is_builtin, is_tenant_custom, visible,
  create_time, update_time, is_deleted, version
)
SELECT
  uuid_generate_v4(), '10000001', '20000001',
  permission_rows.code, permission_rows.name, permission_rows.resource, permission_rows.action,
  true, 'enabled', 'api', 40,
  permission_rows.code, permission_rows.code, 3, 3,
  permission_rows.api_method, permission_rows.api_path, '/assets/units', permission_rows.sort_no,
  true, true, false, true,
  now(), now(), false, 1
FROM permission_rows
WHERE NOT EXISTS (
  SELECT 1 FROM sys_permission existing
  WHERE existing.tenant_id = '10000001'
    AND existing.park_id = '20000001'
    AND existing.code = permission_rows.code
    AND existing.is_deleted = false
);

WITH role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'property_operation:read'),
    ('SUPER_ADMIN', 'property_operation:update'),
    ('SUPER_ADMIN', 'property_operation:transition_mode'),
    ('SUPER_ADMIN', 'property_occupancy:read'),
    ('SUPER_ADMIN', 'property_occupancy:create'),
    ('SUPER_ADMIN', 'property_occupancy:activate'),
    ('SUPER_ADMIN', 'property_occupancy:release'),
    ('SUPER_ADMIN', 'property_occupancy:force_release'),
    ('SUPER_ADMIN', 'party:read'),
    ('SUPER_ADMIN', 'party:create'),
    ('SUPER_ADMIN', 'party:update'),
    ('SUPER_ADMIN', 'party:sensitive_read'),
    ('SUPER_ADMIN', 'party_role:manage'),
    ('OPERATIONS_OWNER', 'property_operation:read'),
    ('OPERATIONS_OWNER', 'property_operation:update'),
    ('OPERATIONS_OWNER', 'property_operation:transition_mode'),
    ('OPERATIONS_OWNER', 'property_occupancy:read'),
    ('OPERATIONS_OWNER', 'property_occupancy:create'),
    ('OPERATIONS_OWNER', 'property_occupancy:activate'),
    ('OPERATIONS_OWNER', 'property_occupancy:release'),
    ('OPERATIONS_OWNER', 'party:read'),
    ('OPERATIONS_OWNER', 'party:create'),
    ('OPERATIONS_OWNER', 'party:update'),
    ('OPERATIONS_OWNER', 'party_role:manage'),
    ('PROPERTY_MANAGER', 'property_operation:read'),
    ('PROPERTY_MANAGER', 'property_operation:update'),
    ('PROPERTY_MANAGER', 'property_operation:transition_mode'),
    ('PROPERTY_MANAGER', 'property_occupancy:read'),
    ('PROPERTY_MANAGER', 'property_occupancy:create'),
    ('PROPERTY_MANAGER', 'property_occupancy:activate'),
    ('PROPERTY_MANAGER', 'property_occupancy:release'),
    ('PROPERTY_MANAGER', 'party:read'),
    ('PROPERTY_MANAGER', 'party:create'),
    ('PROPERTY_MANAGER', 'party:update'),
    ('PROPERTY_MANAGER', 'party_role:manage'),
    ('PROPERTY_STAFF', 'property_operation:read'),
    ('PROPERTY_STAFF', 'property_occupancy:read'),
    ('PROPERTY_STAFF', 'property_occupancy:create'),
    ('PROPERTY_STAFF', 'property_occupancy:activate'),
    ('PROPERTY_STAFF', 'property_occupancy:release'),
    ('PROPERTY_STAFF', 'party:read'),
    ('PROPERTY_STAFF', 'party:create'),
    ('PROPERTY_STAFF', 'party:update'),
    ('PROPERTY_STAFF', 'party_role:manage'),
    ('INVEST_MANAGER', 'property_operation:read'),
    ('INVEST_MANAGER', 'property_occupancy:read'),
    ('INVEST_MANAGER', 'party:read'),
    ('AUDITOR', 'property_operation:read'),
    ('AUDITOR', 'property_occupancy:read'),
    ('AUDITOR', 'party:read')
)
INSERT INTO rel_role_perm (
  tenant_id, park_id, role_id, permission_id,
  create_time, update_time, is_deleted, version, remark
)
SELECT
  '10000001', '20000001', role.id, permission.id,
  now(), now(), false, 1, 'Shared property foundation permission grant'
FROM role_permissions
JOIN sys_role role
  ON role.tenant_id = '10000001'
 AND role.park_id = '20000001'
 AND role.code = role_permissions.role_code
 AND role.is_deleted = false
JOIN sys_permission permission
  ON permission.tenant_id = '10000001'
 AND permission.park_id = '20000001'
 AND permission.code = role_permissions.permission_code
 AND permission.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1 FROM rel_role_perm existing
  WHERE existing.tenant_id = '10000001'
    AND existing.park_id = '20000001'
    AND existing.role_id = role.id
    AND existing.permission_id = permission.id
    AND existing.is_deleted = false
);
