ALTER TABLE sys_permission
  ADD COLUMN IF NOT EXISTS perm_type integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS perm_path varchar(500),
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS api_method varchar(16),
  ADD COLUMN IF NOT EXISTS api_path varchar(255),
  ADD COLUMN IF NOT EXISTS frontend_route varchar(255),
  ADD COLUMN IF NOT EXISTS component_key varchar(128),
  ADD COLUMN IF NOT EXISTS field_key varchar(128),
  ADD COLUMN IF NOT EXISTS data_dimension varchar(128),
  ADD COLUMN IF NOT EXISTS is_builtin boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_tenant_custom boolean NOT NULL DEFAULT false;

UPDATE sys_permission
   SET perm_path = COALESCE(perm_path, permission_path, code),
       level = COALESCE(permission_level, level, 1),
       perm_type = CASE
         WHEN permission_type = 'menu' THEN 10
         WHEN permission_type = 'page' THEN 20
         WHEN permission_type = 'button' THEN 30
         WHEN permission_type = 'api' THEN 40
         WHEN permission_type = 'data' THEN 50
         WHEN permission_type = 'field' THEN 60
         WHEN permission_type = 'report' THEN 70
         WHEN permission_type = 'approval' THEN 80
         WHEN permission_type = 'custom' THEN 90
         ELSE perm_type
       END,
       is_builtin = CASE WHEN is_system = true THEN true ELSE is_builtin END,
       is_tenant_custom = CASE WHEN is_system = false THEN true ELSE is_tenant_custom END
 WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_sys_permission_tenant_deleted
  ON sys_permission (tenant_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_permission_tenant_parent
  ON sys_permission (tenant_id, parent_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_permission_tenant_type
  ON sys_permission (tenant_id, perm_type, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_permission_tenant_frontend_route
  ON sys_permission (tenant_id, frontend_route, is_deleted);

CREATE INDEX IF NOT EXISTS idx_sys_permission_tenant_api
  ON sys_permission (tenant_id, api_method, api_path, is_deleted);
