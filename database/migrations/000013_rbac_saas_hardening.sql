ALTER TABLE sys_role
  ADD COLUMN IF NOT EXISTS parent_id uuid,
  ADD COLUMN IF NOT EXISTS role_path varchar(500),
  ADD COLUMN IF NOT EXISTS role_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sort_no integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS role_type varchar(32) NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS data_scope varchar(32) NOT NULL DEFAULT 'tenant',
  ADD COLUMN IF NOT EXISTS data_scope_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_super boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS editable boolean NOT NULL DEFAULT true;

ALTER TABLE sys_permission
  ADD COLUMN IF NOT EXISTS parent_id uuid,
  ADD COLUMN IF NOT EXISTS permission_path varchar(500),
  ADD COLUMN IF NOT EXISTS permission_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sort_no integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS permission_type varchar(32) NOT NULL DEFAULT 'api',
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS visible boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS rel_role_field_perm (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  park_id uuid NOT NULL,
  role_id uuid NOT NULL REFERENCES sys_role(id),
  resource varchar(128) NOT NULL,
  field_key varchar(128) NOT NULL,
  field_name varchar(100) NOT NULL,
  access_mode varchar(32) NOT NULL DEFAULT 'read',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

UPDATE sys_role
   SET role_path = COALESCE(role_path, code),
       role_level = COALESCE(role_level, 1),
       role_type = CASE WHEN code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN', 'AUDITOR', 'EXECUTIVE', 'OPERATIONS_OWNER', 'INVEST_MANAGER', 'INVEST_SPECIALIST') THEN 'template' ELSE role_type END,
       is_template = CASE WHEN code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN', 'AUDITOR', 'EXECUTIVE', 'OPERATIONS_OWNER', 'INVEST_MANAGER', 'INVEST_SPECIALIST') THEN true ELSE is_template END,
       is_system = CASE WHEN code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN', 'AUDITOR', 'EXECUTIVE', 'OPERATIONS_OWNER', 'INVEST_MANAGER', 'INVEST_SPECIALIST') THEN true ELSE is_system END,
       is_super = CASE WHEN code = 'SUPER_ADMIN' THEN true ELSE is_super END,
       data_scope = CASE
         WHEN code = 'SUPER_ADMIN' THEN 'all'
         WHEN code IN ('SYSTEM_ADMIN', 'AUDITOR', 'EXECUTIVE', 'OPERATIONS_OWNER') THEN 'park'
         ELSE COALESCE(data_scope, 'tenant')
       END
 WHERE is_deleted = false;

UPDATE sys_permission
   SET permission_path = COALESCE(permission_path, code),
       permission_level = COALESCE(permission_level, 1),
       permission_type = COALESCE(permission_type, 'api'),
       is_system = true,
       visible = true
 WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_sys_role_scope_parent
  ON sys_role (tenant_id, park_id, parent_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_role_scope_path
  ON sys_role (tenant_id, park_id, role_path);

CREATE INDEX IF NOT EXISTS idx_sys_role_scope_data_scope
  ON sys_role (tenant_id, park_id, data_scope, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_permission_scope_parent
  ON sys_permission (tenant_id, park_id, parent_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_permission_scope_path
  ON sys_permission (tenant_id, park_id, permission_path);

CREATE INDEX IF NOT EXISTS idx_sys_permission_scope_type
  ON sys_permission (tenant_id, park_id, permission_type, is_deleted);

CREATE INDEX IF NOT EXISTS idx_rel_role_field_perm_scope_deleted
  ON rel_role_field_perm (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_rel_role_field_perm_scope_role
  ON rel_role_field_perm (tenant_id, park_id, role_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_role_field_perm_active
  ON rel_role_field_perm (tenant_id, park_id, role_id, resource, field_key)
  WHERE is_deleted = false;
