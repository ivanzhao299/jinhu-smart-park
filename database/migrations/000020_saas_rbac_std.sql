CREATE TABLE IF NOT EXISTS sys_code_rule (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  rule_code varchar(64) NOT NULL,
  rule_name varchar(100) NOT NULL,
  target_module varchar(64) NOT NULL,
  target_entity varchar(64) NOT NULL,
  prefix varchar(32) NOT NULL,
  date_pattern varchar(32),
  sequence_length integer NOT NULL DEFAULT 6,
  current_sequence integer NOT NULL DEFAULT 0,
  reset_strategy varchar(32) NOT NULL DEFAULT 'daily',
  next_reset_time timestamptz,
  separator varchar(8) NOT NULL DEFAULT '',
  sample_code varchar(128),
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_code_rule_scope_code_active
  ON sys_code_rule (tenant_id, park_id, rule_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_sys_code_rule_scope_deleted
  ON sys_code_rule (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_code_rule_target
  ON sys_code_rule (tenant_id, park_id, target_module, target_entity, is_deleted);

CREATE TABLE IF NOT EXISTS sys_module_registry (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  module_code varchar(64) NOT NULL,
  module_name varchar(100) NOT NULL,
  module_group varchar(64) NOT NULL,
  module_version varchar(32) NOT NULL DEFAULT '1.0.0',
  route_path varchar(255),
  permission_code varchar(128),
  icon_key varchar(64),
  sort_no integer NOT NULL DEFAULT 0,
  is_builtin boolean NOT NULL DEFAULT true,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_module_registry_scope_code_active
  ON sys_module_registry (tenant_id, park_id, module_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_sys_module_registry_scope_deleted
  ON sys_module_registry (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_module_registry_group
  ON sys_module_registry (tenant_id, park_id, module_group, is_deleted);

CREATE TABLE IF NOT EXISTS sys_plan (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  plan_code varchar(64) NOT NULL,
  plan_name varchar(100) NOT NULL,
  plan_type varchar(32) NOT NULL DEFAULT 'standard',
  module_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_users integer NOT NULL DEFAULT 0,
  max_parks integer NOT NULL DEFAULT 0,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_plan_scope_code_active
  ON sys_plan (tenant_id, park_id, plan_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_sys_plan_scope_deleted
  ON sys_plan (tenant_id, park_id, is_deleted);

CREATE TABLE IF NOT EXISTS rel_tenant_module (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  tenant_code varchar(64),
  module_id uuid NOT NULL,
  plan_id uuid,
  start_time timestamptz,
  expire_time timestamptz,
  feature_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_tenant_module_active
  ON rel_tenant_module (tenant_id, park_id, module_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rel_tenant_module_scope_deleted
  ON rel_tenant_module (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_rel_tenant_module_module
  ON rel_tenant_module (tenant_id, module_id, is_deleted);
