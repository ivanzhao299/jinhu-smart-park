CREATE TABLE IF NOT EXISTS sys_tenant (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL DEFAULT '0',
  tenant_code varchar(64) NOT NULL,
  tenant_name varchar(100) NOT NULL,
  tenant_type varchar(32) NOT NULL DEFAULT 'park_operator',
  contact_name varchar(100),
  contact_mobile varchar(32),
  status varchar(32) NOT NULL DEFAULT 'enabled',
  expire_time timestamptz,
  max_users integer NOT NULL DEFAULT 0,
  max_parks integer NOT NULL DEFAULT 0,
  plan_code varchar(64),
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_tenant_tenant_id_active
  ON sys_tenant (tenant_id)
  WHERE is_deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_tenant_code_active
  ON sys_tenant (tenant_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_sys_tenant_scope_deleted
  ON sys_tenant (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_tenant_status
  ON sys_tenant (status, is_deleted);
