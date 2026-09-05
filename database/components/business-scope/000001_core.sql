BEGIN;

DO $$
DECLARE
  tenant_status_type text;
  user_status_type text;
  tenant_id_type text;
  user_tenant_id_type text;
  tenant_row_id_type text;
  user_row_id_type text;
  tenant_expire_type text;
  tenant_deleted_type text;
  user_enabled_type text;
  user_deleted_type text;
BEGIN
  IF to_regclass('public.sys_tenant') IS NULL THEN
    RAISE EXCEPTION 'BUSINESS_SCOPE_CORE_REQUIRES_SYS_TENANT';
  END IF;
  IF to_regclass('public.sys_user') IS NULL THEN
    RAISE EXCEPTION 'BUSINESS_SCOPE_CORE_REQUIRES_SYS_USER';
  END IF;

  SELECT data_type INTO tenant_status_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sys_tenant' AND column_name = 'status';
  SELECT data_type INTO user_status_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sys_user' AND column_name = 'status';
  SELECT data_type INTO tenant_id_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sys_tenant' AND column_name = 'tenant_id';
  SELECT data_type INTO user_tenant_id_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sys_user' AND column_name = 'tenant_id';
  SELECT data_type INTO tenant_row_id_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sys_tenant' AND column_name = 'id';
  SELECT data_type INTO user_row_id_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sys_user' AND column_name = 'id';
  SELECT data_type INTO tenant_expire_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sys_tenant' AND column_name = 'expire_time';
  SELECT data_type INTO tenant_deleted_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sys_tenant' AND column_name = 'is_deleted';
  SELECT data_type INTO user_enabled_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sys_user' AND column_name = 'is_enabled';
  SELECT data_type INTO user_deleted_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sys_user' AND column_name = 'is_deleted';

  IF tenant_status_type IS DISTINCT FROM 'integer' THEN
    RAISE EXCEPTION 'BUSINESS_SCOPE_CORE_REQUIRES_INTEGER_TENANT_STATUS';
  END IF;
  IF user_status_type IS DISTINCT FROM 'character varying' THEN
    RAISE EXCEPTION 'BUSINESS_SCOPE_CORE_REQUIRES_VARCHAR_USER_STATUS';
  END IF;
  IF tenant_id_type IS DISTINCT FROM 'character varying'
     OR user_tenant_id_type IS DISTINCT FROM 'character varying' THEN
    RAISE EXCEPTION 'BUSINESS_SCOPE_CORE_REQUIRES_VARCHAR_TENANT_IDENTITIES';
  END IF;
  IF tenant_row_id_type IS DISTINCT FROM 'uuid'
     OR user_row_id_type IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'BUSINESS_SCOPE_CORE_REQUIRES_UUID_ROW_IDENTITIES';
  END IF;
  IF tenant_expire_type IS DISTINCT FROM 'timestamp with time zone' THEN
    RAISE EXCEPTION 'BUSINESS_SCOPE_CORE_REQUIRES_TENANT_EXPIRY';
  END IF;
  IF tenant_deleted_type IS DISTINCT FROM 'boolean'
     OR user_enabled_type IS DISTINCT FROM 'boolean'
     OR user_deleted_type IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'BUSINESS_SCOPE_CORE_REQUIRES_ACTIVITY_FLAGS';
  END IF;
  IF to_regprocedure('gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'BUSINESS_SCOPE_CORE_REQUIRES_UUID_GENERATOR';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_tenant_row_tenant_identity
  ON sys_tenant (id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_user_row_tenant_identity
  ON sys_user (id, tenant_id);

CREATE TABLE sys_business_scope (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_row_id uuid NOT NULL,
  tenant_id varchar(64) NOT NULL,
  scope_kind varchar(16) NOT NULL,
  scope_code varchar(64) NOT NULL,
  scope_name varchar(100) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_sys_business_scope_kind CHECK (scope_kind IN ('enterprise', 'park')),
  CONSTRAINT ck_sys_business_scope_code CHECK (
    scope_code = btrim(scope_code)
    AND scope_code <> ''
  ),
  CONSTRAINT ck_sys_business_scope_name CHECK (
    scope_name = btrim(scope_name)
    AND scope_name <> ''
  ),
  CONSTRAINT ck_sys_business_scope_status CHECK (status IN ('enabled', 'disabled')),
  CONSTRAINT ck_sys_business_scope_version CHECK (version >= 1),
  CONSTRAINT uq_sys_business_scope_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT fk_sys_business_scope_tenant_identity
    FOREIGN KEY (tenant_row_id, tenant_id)
    REFERENCES sys_tenant (id, tenant_id)
);

CREATE UNIQUE INDEX uq_sys_business_scope_code_active
  ON sys_business_scope (tenant_id, lower(scope_code))
  WHERE is_deleted = false;

CREATE INDEX idx_sys_business_scope_resolve
  ON sys_business_scope (tenant_id, id, scope_kind, status, is_deleted);

CREATE TABLE sys_user_business_scope_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  scope_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_sys_user_business_scope_membership_status CHECK (status IN ('enabled', 'disabled')),
  CONSTRAINT ck_sys_user_business_scope_membership_version CHECK (version >= 1),
  CONSTRAINT fk_sys_user_business_scope_membership_scope
    FOREIGN KEY (tenant_id, scope_id)
    REFERENCES sys_business_scope (tenant_id, id),
  CONSTRAINT fk_sys_user_business_scope_membership_user
    FOREIGN KEY (user_id, tenant_id)
    REFERENCES sys_user (id, tenant_id)
);

CREATE UNIQUE INDEX uq_sys_user_business_scope_membership_active
  ON sys_user_business_scope_membership (tenant_id, scope_id, user_id)
  WHERE is_deleted = false;

CREATE INDEX idx_sys_user_business_scope_membership_resolve
  ON sys_user_business_scope_membership (tenant_id, user_id, scope_id, status, is_deleted);

CREATE TABLE sys_business_scope_module (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  scope_id uuid NOT NULL,
  module_code varchar(64) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_sys_business_scope_module_code CHECK (
    module_code = lower(btrim(module_code))
    AND module_code <> ''
  ),
  CONSTRAINT ck_sys_business_scope_module_status CHECK (status IN ('enabled', 'disabled')),
  CONSTRAINT ck_sys_business_scope_module_version CHECK (version >= 1),
  CONSTRAINT fk_sys_business_scope_module_scope
    FOREIGN KEY (tenant_id, scope_id)
    REFERENCES sys_business_scope (tenant_id, id)
);

CREATE UNIQUE INDEX uq_sys_business_scope_module_active
  ON sys_business_scope_module (tenant_id, scope_id, module_code)
  WHERE is_deleted = false;

CREATE INDEX idx_sys_business_scope_module_resolve
  ON sys_business_scope_module (tenant_id, scope_id, module_code, status, is_deleted);

COMMIT;
