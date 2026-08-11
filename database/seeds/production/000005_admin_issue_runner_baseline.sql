BEGIN;

WITH seed_scope AS (SELECT '10000001' AS tenant_id, '20000001' AS park_id),
permissions(code, name, action, method, api_path) AS (
  VALUES
    ('admin_issue:create', '提交问题反馈', 'create', 'POST', '/api/v1/admin-issues'),
    ('admin_issue:read', '查看问题反馈', 'read', 'GET', '/api/v1/admin-issues'),
    ('admin_issue:manage', '管理问题修复', 'manage', 'PATCH', '/api/v1/admin-issues/:issueNo/triage'),
    ('admin_issue:runner', '问题修复 Runner', 'runner', 'POST', '/api/v1/admin-issues/:issueNo/runner/*')
)
INSERT INTO sys_permission (
  tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
  api_method, api_path, status, is_system, is_builtin, visible
)
SELECT seed_scope.tenant_id, seed_scope.park_id, permissions.code, permissions.name,
       'ops.admin_issue', permissions.action, 'api', 40, permissions.method,
       permissions.api_path, 'enabled', true, true, true
FROM seed_scope CROSS JOIN permissions
ON CONFLICT (tenant_id, code) WHERE is_deleted = false
DO UPDATE SET park_id = EXCLUDED.park_id, name = EXCLUDED.name, action = EXCLUDED.action,
              api_method = EXCLUDED.api_method, api_path = EXCLUDED.api_path,
              update_time = now(), is_deleted = false;

-- Management is granted only to roles that already manage users.
WITH seed_scope AS (SELECT '10000001' AS tenant_id, '20000001' AS park_id)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted)
SELECT seed_scope.tenant_id, seed_scope.park_id, source_role.role_id, target.id, now(), now(), false
FROM seed_scope
JOIN rel_role_perm source_role ON source_role.tenant_id = seed_scope.tenant_id
  AND source_role.park_id = seed_scope.park_id AND source_role.is_deleted = false
JOIN sys_permission source ON source.id = source_role.permission_id
  AND source.code = 'system:user:update' AND source.is_deleted = false
JOIN sys_permission target ON target.tenant_id = seed_scope.tenant_id
  AND target.code IN ('admin_issue:read','admin_issue:manage') AND target.is_deleted = false
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false, update_time = now();

-- Dedicated machine identity: disabled and unusable until the protected credential workflow activates it.
WITH seed_scope AS (SELECT '10000001' AS tenant_id, '20000001' AS park_id)
INSERT INTO sys_role (tenant_id, park_id, code, name, is_enabled, status, is_system, is_builtin, remark)
SELECT tenant_id, park_id, 'SMART_PARK_RUNNER', 'Smart Park 问题修复 Runner', true, 'enabled', true, true,
       'Dedicated machine role; must not receive interactive administrator permissions'
FROM seed_scope
ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO UPDATE SET
  park_id = EXCLUDED.park_id, name = EXCLUDED.name, is_enabled = true,
  status = 'enabled', update_time = now();

WITH seed_scope AS (SELECT '10000001' AS tenant_id, '20000001' AS park_id)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, remark)
SELECT seed_scope.tenant_id, seed_scope.park_id, role.id, permission.id, 'Dedicated Runner minimum permission'
FROM seed_scope
JOIN sys_role role ON role.tenant_id = seed_scope.tenant_id
  AND role.code = 'SMART_PARK_RUNNER' AND role.is_deleted = false
JOIN sys_permission permission ON permission.tenant_id = seed_scope.tenant_id
  AND permission.code = 'admin_issue:runner' AND permission.is_deleted = false
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false, update_time = now(), remark = EXCLUDED.remark;

-- Feedback submission is an authenticated-user capability, not a machine-role permission.
-- Defensively remove an accidental grant from an earlier execution of this repair seed.
WITH seed_scope AS (SELECT '10000001' AS tenant_id, '20000001' AS park_id)
UPDATE rel_role_perm relation
SET is_deleted = true, update_time = now(), remark = 'Removed from dedicated Runner role'
FROM seed_scope, sys_role role, sys_permission permission
WHERE relation.tenant_id = seed_scope.tenant_id
  AND relation.park_id = seed_scope.park_id
  AND relation.role_id = role.id
  AND relation.permission_id = permission.id
  AND relation.is_deleted = false
  AND role.tenant_id = seed_scope.tenant_id
  AND role.code = 'SMART_PARK_RUNNER'
  AND role.is_deleted = false
  AND permission.tenant_id = seed_scope.tenant_id
  AND permission.code = 'admin_issue:create'
  AND permission.is_deleted = false;

WITH seed_scope AS (SELECT '10000001' AS tenant_id, '20000001' AS park_id)
INSERT INTO sys_user (tenant_id, park_id, username, display_name, password_hash, is_enabled, status, remark)
SELECT tenant_id, park_id, 'studio_runner', 'Studio 问题修复 Runner',
       '!SMART_PARK_RUNNER_CREDENTIAL_NOT_INITIALIZED!', false, 'disabled',
       'Activation requires the protected Smart Park Runner credential workflow'
FROM seed_scope
ON CONFLICT (tenant_id, park_id, username) WHERE is_deleted = false DO NOTHING;

WITH seed_scope AS (SELECT '10000001' AS tenant_id, '20000001' AS park_id)
INSERT INTO rel_user_role (tenant_id, park_id, user_id, role_id, remark)
SELECT seed_scope.tenant_id, seed_scope.park_id, app_user.id, role.id, 'Dedicated Runner role binding'
FROM seed_scope
JOIN sys_user app_user ON app_user.tenant_id = seed_scope.tenant_id
  AND app_user.park_id = seed_scope.park_id AND app_user.username = 'studio_runner' AND app_user.is_deleted = false
JOIN sys_role role ON role.tenant_id = seed_scope.tenant_id
  AND role.code = 'SMART_PARK_RUNNER' AND role.is_deleted = false
ON CONFLICT (tenant_id, park_id, user_id, role_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false, update_time = now(), remark = EXCLUDED.remark;

WITH seed_scope AS (SELECT '10000001' AS tenant_id, '20000001' AS park_id)
INSERT INTO rel_user_park (tenant_id, user_id, park_id, is_default, status, remark)
SELECT seed_scope.tenant_id, app_user.id, seed_scope.park_id, true, 'enabled', 'Dedicated Runner park binding'
FROM seed_scope
JOIN sys_user app_user ON app_user.tenant_id = seed_scope.tenant_id
  AND app_user.park_id = seed_scope.park_id AND app_user.username = 'studio_runner' AND app_user.is_deleted = false
ON CONFLICT (tenant_id, user_id, park_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false, is_default = true, status = 'enabled', update_time = now();

COMMIT;
