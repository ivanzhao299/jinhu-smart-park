ALTER TABLE sys_permission
  ADD COLUMN IF NOT EXISTS icon varchar(128),
  ADD COLUMN IF NOT EXISTS keep_alive boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS always_show boolean NOT NULL DEFAULT true;

ALTER TABLE sys_user
  ADD COLUMN IF NOT EXISTS avatar_url varchar(255),
  ADD COLUMN IF NOT EXISTS gender varchar(16),
  ADD COLUMN IF NOT EXISTS last_login_ip varchar(64),
  ADD COLUMN IF NOT EXISTS last_login_time timestamptz;

CREATE INDEX IF NOT EXISTS idx_sys_permission_tenant_menu_visible
  ON sys_permission (tenant_id, perm_type, visible, sort_no)
  WHERE is_deleted = false;

WITH RECURSIVE seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
menu_nodes(code, name, parent_code, resource, action, perm_type, sort_no, frontend_route, component_key, icon, keep_alive, always_show) AS (
  VALUES
    ('system', '系统管理', NULL, 'system', 'menu', 10, 10, NULL, 'Layout', 'shield-check', true, true),
    ('system:org', '组织管理', 'system', 'system.org', 'page', 20, 10, '/system/orgs', 'system/orgs', 'building-2', true, true),
    ('system:user', '用户管理', 'system', 'system.user', 'page', 20, 20, '/system/users', 'system/users', 'users', true, true),
    ('system:role', '角色管理', 'system', 'system.role', 'page', 20, 30, '/system/roles', 'system/roles', 'shield', true, true),
    ('system:permission', '权限管理', 'system', 'system.permission', 'page', 20, 40, '/system/permissions', 'system/permissions', 'key-round', true, true),
    ('system:data-scope', '数据权限', 'system', 'system.data-scope', 'page', 20, 50, '/system/data-scopes', 'system/data-scopes', 'database', true, true),
    ('system:field-policy', '字段权限', 'system', 'system.field-policy', 'page', 20, 60, '/system/field-policies', 'system/field-policies', 'key-round', true, true),
    ('system:code-rule', '编码规则', 'system', 'system.code-rule', 'page', 20, 70, '/system/code-rules', 'system/code-rules', 'settings', true, true),
    ('system:module', '模块授权', 'system', 'system.module', 'page', 20, 80, '/system/modules', 'system/modules', 'folder-tree', true, true),
    ('system:dict-type', '字典管理', 'system', 'system.dict-type', 'page', 20, 90, '/system/dicts', 'system/dicts', 'tags', true, true),
    ('system:dict-item', '字典项', 'system:dict-type', 'system.dict-item', 'page', 20, 100, '/system/dicts', 'system/dict-items', 'tags', true, false),
    ('system:file', '附件中心', 'system', 'system.file', 'page', 20, 110, '/system/files', 'system/files', 'file-text', true, true),
    ('system:audit', '审计日志', 'system', 'system.audit', 'page', 20, 120, '/system/audit/op-logs', 'system/audit-op-logs', 'scroll-text', true, true),
    ('system:audit-login-log', '登录日志', 'system', 'system.audit', 'page', 20, 121, '/system/audit/login-logs', 'system/audit-login-logs', 'scroll-text', true, true)
),
menu_tree(code, name, parent_code, resource, action, perm_type, sort_no, frontend_route, component_key, icon, keep_alive, always_show, perm_path, level) AS (
  SELECT
    menu_nodes.code,
    menu_nodes.name,
    menu_nodes.parent_code,
    menu_nodes.resource,
    menu_nodes.action,
    menu_nodes.perm_type,
    menu_nodes.sort_no,
    menu_nodes.frontend_route,
    menu_nodes.component_key,
    menu_nodes.icon,
    menu_nodes.keep_alive,
    menu_nodes.always_show,
    menu_nodes.code::varchar(500),
    1
  FROM menu_nodes
  WHERE menu_nodes.parent_code IS NULL
  UNION ALL
  SELECT
    child.code,
    child.name,
    child.parent_code,
    child.resource,
    child.action,
    child.perm_type,
    child.sort_no,
    child.frontend_route,
    child.component_key,
    child.icon,
    child.keep_alive,
    child.always_show,
    (parent.perm_path || '/' || child.code)::varchar(500),
    parent.level + 1
  FROM menu_nodes child
  JOIN menu_tree parent ON parent.code = child.parent_code
),
upsert_menus AS (
  INSERT INTO sys_permission (
    tenant_id,
    park_id,
    code,
    name,
    parent_id,
    resource,
    action,
    permission_path,
    perm_path,
    permission_level,
    level,
    sort_no,
    permission_type,
    perm_type,
    api_method,
    api_path,
    frontend_route,
    component_key,
    icon,
    field_key,
    data_dimension,
    is_system,
    is_builtin,
    is_tenant_custom,
    visible,
    keep_alive,
    always_show,
    is_enabled,
    status,
    remark
  )
  SELECT
    seed_scope.tenant_id,
    seed_scope.park_id,
    menu_tree.code,
    menu_tree.name,
    NULL,
    menu_tree.resource,
    menu_tree.action,
    menu_tree.perm_path,
    menu_tree.perm_path,
    menu_tree.level,
    menu_tree.level,
    menu_tree.sort_no,
    CASE menu_tree.perm_type WHEN 10 THEN 'menu' ELSE 'page' END,
    menu_tree.perm_type,
    NULL,
    NULL,
    menu_tree.frontend_route,
    menu_tree.component_key,
    menu_tree.icon,
    NULL,
    NULL,
    true,
    true,
    false,
    true,
    menu_tree.keep_alive,
    menu_tree.always_show,
    true,
    'enabled',
    'Yudao system RBAC baseline menu'
  FROM menu_tree
  CROSS JOIN seed_scope
  ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO UPDATE SET
    name = EXCLUDED.name,
    resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    permission_path = EXCLUDED.permission_path,
    perm_path = EXCLUDED.perm_path,
    permission_level = EXCLUDED.permission_level,
    level = EXCLUDED.level,
    sort_no = EXCLUDED.sort_no,
    permission_type = EXCLUDED.permission_type,
    perm_type = EXCLUDED.perm_type,
    api_method = EXCLUDED.api_method,
    api_path = EXCLUDED.api_path,
    frontend_route = EXCLUDED.frontend_route,
    component_key = EXCLUDED.component_key,
    icon = EXCLUDED.icon,
    is_system = true,
    is_builtin = true,
    is_tenant_custom = false,
    visible = true,
    keep_alive = EXCLUDED.keep_alive,
    always_show = EXCLUDED.always_show,
    is_enabled = true,
    status = 'enabled',
    remark = EXCLUDED.remark,
    is_deleted = false,
    update_time = now()
  RETURNING id, tenant_id, park_id, code
)
UPDATE sys_permission child
SET parent_id = parent_permission.id,
    permission_path = menu_tree.perm_path,
    perm_path = menu_tree.perm_path,
    permission_level = menu_tree.level,
    level = menu_tree.level,
    update_time = now()
FROM menu_tree
JOIN upsert_menus current_permission
  ON current_permission.code = menu_tree.code
LEFT JOIN upsert_menus parent_permission
  ON parent_permission.code = menu_tree.parent_code
WHERE child.id = current_permission.id;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_menu_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'system'),
    ('SUPER_ADMIN', 'system:org'),
    ('SUPER_ADMIN', 'system:user'),
    ('SUPER_ADMIN', 'system:role'),
    ('SUPER_ADMIN', 'system:permission'),
    ('SUPER_ADMIN', 'system:data-scope'),
    ('SUPER_ADMIN', 'system:field-policy'),
    ('SUPER_ADMIN', 'system:code-rule'),
    ('SUPER_ADMIN', 'system:module'),
    ('SUPER_ADMIN', 'system:dict-type'),
    ('SUPER_ADMIN', 'system:dict-item'),
    ('SUPER_ADMIN', 'system:file'),
    ('SUPER_ADMIN', 'system:audit'),
    ('SUPER_ADMIN', 'system:audit-login-log'),
    ('SYSTEM_ADMIN', 'system'),
    ('SYSTEM_ADMIN', 'system:org'),
    ('SYSTEM_ADMIN', 'system:user'),
    ('SYSTEM_ADMIN', 'system:role'),
    ('SYSTEM_ADMIN', 'system:permission'),
    ('SYSTEM_ADMIN', 'system:data-scope'),
    ('SYSTEM_ADMIN', 'system:field-policy'),
    ('SYSTEM_ADMIN', 'system:code-rule'),
    ('SYSTEM_ADMIN', 'system:module'),
    ('SYSTEM_ADMIN', 'system:dict-type'),
    ('SYSTEM_ADMIN', 'system:dict-item'),
    ('SYSTEM_ADMIN', 'system:file'),
    ('SYSTEM_ADMIN', 'system:audit'),
    ('SYSTEM_ADMIN', 'system:audit-login-log'),
    ('AUDITOR', 'system'),
    ('AUDITOR', 'system:audit'),
    ('AUDITOR', 'system:audit-login-log')
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version)
SELECT seed_scope.tenant_id,
       seed_scope.park_id,
       role.id,
       permission.id,
       now(),
       now(),
       false,
       1
FROM seed_scope
JOIN role_menu_permissions ON true
JOIN sys_role role
  ON role.tenant_id = seed_scope.tenant_id
 AND role.park_id = seed_scope.park_id
 AND role.code = role_menu_permissions.role_code
 AND role.is_deleted = false
JOIN sys_permission permission
  ON permission.tenant_id = seed_scope.tenant_id
 AND permission.park_id = seed_scope.park_id
 AND permission.code = role_menu_permissions.permission_code
 AND permission.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_role_perm existing
  WHERE existing.tenant_id = seed_scope.tenant_id
    AND existing.park_id = seed_scope.park_id
    AND existing.role_id = role.id
    AND existing.permission_id = permission.id
    AND existing.is_deleted = false
);
