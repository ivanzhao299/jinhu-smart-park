ALTER TABLE sys_role
  ADD COLUMN IF NOT EXISTS role_type varchar(32) NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS role_scope varchar(32) NOT NULL DEFAULT 'tenant',
  ADD COLUMN IF NOT EXISTS parent_id uuid,
  ADD COLUMN IF NOT EXISTS role_path varchar(500),
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS data_scope varchar(32) NOT NULL DEFAULT '50',
  ADD COLUMN IF NOT EXISTS data_scope_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_builtin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_editable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_deletable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_no integer NOT NULL DEFAULT 0;

UPDATE sys_role
   SET role_path = COALESCE(role_path, code),
       level = COALESCE(level, role_level, 1),
       data_scope = CASE data_scope
         WHEN 'self' THEN '10'
         WHEN 'org' THEN '20'
         WHEN 'org_and_children' THEN '30'
         WHEN 'park' THEN '40'
         WHEN 'tenant' THEN '50'
         WHEN 'all' THEN '50'
         WHEN 'custom' THEN '60'
         ELSE data_scope
       END,
       is_builtin = CASE WHEN is_system = true OR code = 'SUPER_ADMIN' THEN true ELSE is_builtin END,
       is_editable = CASE WHEN is_system = true OR code = 'SUPER_ADMIN' THEN false ELSE is_editable END,
       is_deletable = CASE WHEN is_system = true OR is_builtin = true OR code = 'SUPER_ADMIN' THEN false ELSE is_deletable END,
       is_template = CASE
         WHEN code <> 'SUPER_ADMIN'
          AND code IN ('SYSTEM_ADMIN', 'AUDITOR', 'EXECUTIVE', 'OPERATIONS_OWNER', 'INVEST_MANAGER', 'INVEST_SPECIALIST')
         THEN true
         ELSE is_template
       END,
       role_type = CASE
         WHEN code = 'SUPER_ADMIN' THEN 'system'
         WHEN is_template = true THEN 'tenant'
         ELSE role_type
       END
 WHERE is_deleted = false;

ALTER TABLE sys_role
  ALTER COLUMN data_scope SET DEFAULT '50';

ALTER TABLE sys_role
  ALTER COLUMN role_scope SET DEFAULT 'tenant';

DROP INDEX IF EXISTS uq_sys_role_scope_code_active;
DROP INDEX IF EXISTS uq_sys_role_code_active;
ALTER TABLE sys_role DROP CONSTRAINT IF EXISTS uq_sys_role_scope_code;
ALTER TABLE sys_role DROP CONSTRAINT IF EXISTS uq_sys_role_code;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_role_tenant_code_active
  ON sys_role (tenant_id, code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_sys_role_tenant_deleted
  ON sys_role (tenant_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_role_tenant_parent
  ON sys_role (tenant_id, parent_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_role_tenant_path
  ON sys_role (tenant_id, role_path);

CREATE INDEX IF NOT EXISTS idx_sys_role_tenant_scope
  ON sys_role (tenant_id, role_scope, role_type, is_deleted);
