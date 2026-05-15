ALTER TABLE sys_permission
  ADD COLUMN IF NOT EXISTS perm_type integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS parent_id uuid,
  ADD COLUMN IF NOT EXISTS perm_path varchar(500),
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS api_method varchar(16),
  ADD COLUMN IF NOT EXISTS api_path varchar(255),
  ADD COLUMN IF NOT EXISTS frontend_route varchar(255),
  ADD COLUMN IF NOT EXISTS component_key varchar(128),
  ADD COLUMN IF NOT EXISTS field_key varchar(128),
  ADD COLUMN IF NOT EXISTS data_dimension varchar(128),
  ADD COLUMN IF NOT EXISTS sort_no integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_builtin boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_tenant_custom boolean NOT NULL DEFAULT false;

UPDATE sys_permission
   SET perm_path = COALESCE(perm_path, permission_path, code),
       level = COALESCE(level, permission_level, 1),
       permission_path = COALESCE(permission_path, perm_path, code),
       permission_level = COALESCE(permission_level, level, 1),
       permission_type = CASE perm_type
         WHEN 10 THEN 'menu'
         WHEN 20 THEN 'page'
         WHEN 30 THEN 'button'
         WHEN 40 THEN 'api'
         WHEN 50 THEN 'data'
         WHEN 60 THEN 'field'
         WHEN 70 THEN 'report'
         WHEN 80 THEN 'approval'
         WHEN 90 THEN 'custom'
         ELSE COALESCE(permission_type, 'api')
       END,
       is_builtin = CASE WHEN is_system = true THEN true ELSE is_builtin END,
       is_tenant_custom = CASE WHEN is_system = false THEN true ELSE is_tenant_custom END
 WHERE is_deleted = false;

DROP INDEX IF EXISTS uq_sys_permission_scope_code_active;
DROP INDEX IF EXISTS uq_sys_permission_code_active;
ALTER TABLE sys_permission DROP CONSTRAINT IF EXISTS uq_sys_permission_scope_code;
ALTER TABLE sys_permission DROP CONSTRAINT IF EXISTS uq_sys_permission_code;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_permission_tenant_code_active
  ON sys_permission (tenant_id, code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_sys_permission_tenant_deleted
  ON sys_permission (tenant_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_permission_tenant_parent
  ON sys_permission (tenant_id, parent_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_permission_tenant_path
  ON sys_permission (tenant_id, perm_path);

CREATE INDEX IF NOT EXISTS idx_sys_permission_tenant_type
  ON sys_permission (tenant_id, perm_type, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_permission_tenant_frontend_route
  ON sys_permission (tenant_id, frontend_route, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_permission_tenant_api
  ON sys_permission (tenant_id, api_method, api_path, is_deleted);
