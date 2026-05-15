CREATE TABLE IF NOT EXISTS sys_field_policy (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  module varchar(64) NOT NULL,
  entity varchar(64) NOT NULL,
  field_key varchar(128) NOT NULL,
  field_name varchar(100) NOT NULL,
  policy_type varchar(32) NOT NULL,
  mask_rule varchar(64),
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_sys_field_policy_type CHECK (policy_type IN ('visible', 'masked', 'hidden', 'readonly', 'editable'))
);

CREATE TABLE IF NOT EXISTS rel_role_field_policy (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES sys_role(id),
  field_policy_id uuid NOT NULL REFERENCES sys_field_policy(id),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_field_policy_scope_field_active
  ON sys_field_policy (tenant_id, module, entity, field_key)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_sys_field_policy_scope_deleted
  ON sys_field_policy (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_field_policy_scope_module
  ON sys_field_policy (tenant_id, module, entity, status, is_deleted);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_role_field_policy_active
  ON rel_role_field_policy (tenant_id, role_id, field_policy_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rel_role_field_policy_role
  ON rel_role_field_policy (tenant_id, role_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_rel_role_field_policy_policy
  ON rel_role_field_policy (tenant_id, field_policy_id, is_deleted);
