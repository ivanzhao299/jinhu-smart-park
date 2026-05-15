ALTER TABLE sys_role
  ADD COLUMN IF NOT EXISTS role_scope varchar(32) NOT NULL DEFAULT 'park',
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_builtin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_editable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_deletable boolean NOT NULL DEFAULT true;

UPDATE sys_role
   SET level = COALESCE(role_level, level, 1),
       is_builtin = CASE WHEN is_system = true THEN true ELSE is_builtin END,
       is_editable = COALESCE(editable, is_editable, true),
       is_deletable = CASE WHEN is_system = true OR is_builtin = true THEN false ELSE is_deletable END,
       role_scope = CASE
         WHEN code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN', 'AUDITOR') THEN 'platform'
         WHEN code IN ('EXECUTIVE', 'OPERATIONS_OWNER', 'INVEST_MANAGER', 'INVEST_SPECIALIST') THEN 'park'
         ELSE COALESCE(role_scope, 'tenant')
       END
 WHERE is_deleted = false;

DROP INDEX IF EXISTS uq_sys_role_scope_code_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_role_tenant_code_active
  ON sys_role (tenant_id, code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_sys_role_tenant_deleted
  ON sys_role (tenant_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_role_tenant_parent
  ON sys_role (tenant_id, parent_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_role_tenant_scope
  ON sys_role (tenant_id, role_scope, role_type, is_deleted);
