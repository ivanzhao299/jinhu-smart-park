CREATE TABLE IF NOT EXISTS sys_module (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_code varchar(64) NOT NULL,
  module_name varchar(100) NOT NULL,
  module_group varchar(64) NOT NULL,
  description varchar(500),
  route_prefix varchar(255),
  icon varchar(64),
  status integer NOT NULL DEFAULT 1,
  sort_no integer NOT NULL DEFAULT 0,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_module_code_active
  ON sys_module (module_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_sys_module_group_deleted
  ON sys_module (module_group, is_deleted);

ALTER TABLE sys_plan ADD COLUMN IF NOT EXISTS description varchar(500);
ALTER TABLE sys_plan ADD COLUMN IF NOT EXISTS sort_no integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS rel_plan_module (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id uuid NOT NULL,
  module_id uuid NOT NULL,
  status integer NOT NULL DEFAULT 1,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_plan_module_active
  ON rel_plan_module (plan_id, module_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rel_plan_module_plan_deleted
  ON rel_plan_module (plan_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_rel_plan_module_module_deleted
  ON rel_plan_module (module_id, is_deleted);

ALTER TABLE rel_tenant_module ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_rel_tenant_module_enabled_expire
  ON rel_tenant_module (tenant_id, park_id, enabled, status, expire_time, is_deleted);
