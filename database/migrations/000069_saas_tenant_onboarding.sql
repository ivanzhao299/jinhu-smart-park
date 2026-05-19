ALTER TABLE sys_tenant
  ADD COLUMN IF NOT EXISTS contact_user_id uuid,
  ADD COLUMN IF NOT EXISTS websites jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS feature_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE sys_plan
  ADD COLUMN IF NOT EXISTS permission_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS feature_config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_sys_tenant_websites_gin
  ON sys_tenant USING gin (websites)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_sys_tenant_domains_gin
  ON sys_tenant USING gin (domains)
  WHERE is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
system_parent AS (
  SELECT permission.*
  FROM sys_permission permission
  JOIN seed_scope
    ON seed_scope.tenant_id = permission.tenant_id
   AND seed_scope.park_id = permission.park_id
  WHERE permission.code = 'system'
    AND permission.is_deleted = false
  LIMIT 1
),
upsert_menu AS (
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
    frontend_route,
    component_key,
    icon,
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
    'system:tenant',
    '租户管理',
    system_parent.id,
    'system.tenant',
    'page',
    COALESCE(system_parent.perm_path || '/', 'system/') || 'system:tenant',
    COALESCE(system_parent.perm_path || '/', 'system/') || 'system:tenant',
    COALESCE(system_parent.level, 1) + 1,
    COALESCE(system_parent.level, 1) + 1,
    75,
    'page',
    20,
    '/system/tenants',
    'system/tenants',
    'building-2',
    true,
    true,
    false,
    true,
    true,
    true,
    true,
    'enabled',
    'SaaS tenant management menu'
  FROM seed_scope
  LEFT JOIN system_parent ON true
  ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO UPDATE SET
    name = EXCLUDED.name,
    parent_id = EXCLUDED.parent_id,
    resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    permission_path = EXCLUDED.permission_path,
    perm_path = EXCLUDED.perm_path,
    permission_level = EXCLUDED.permission_level,
    level = EXCLUDED.level,
    sort_no = EXCLUDED.sort_no,
    permission_type = EXCLUDED.permission_type,
    perm_type = EXCLUDED.perm_type,
    frontend_route = EXCLUDED.frontend_route,
    component_key = EXCLUDED.component_key,
    icon = EXCLUDED.icon,
    is_system = true,
    is_builtin = true,
    is_tenant_custom = false,
    visible = true,
    keep_alive = true,
    always_show = true,
    is_enabled = true,
    status = 'enabled',
    remark = EXCLUDED.remark,
    is_deleted = false,
    update_time = now()
  RETURNING id, tenant_id, park_id, code, perm_path, level
)
UPDATE sys_permission permission
SET parent_id = upsert_menu.id,
    permission_path = upsert_menu.perm_path || '/' || permission.code,
    perm_path = upsert_menu.perm_path || '/' || permission.code,
    permission_level = upsert_menu.level + 1,
    level = upsert_menu.level + 1,
    update_time = now()
FROM upsert_menu
WHERE permission.tenant_id = upsert_menu.tenant_id
  AND permission.park_id = upsert_menu.park_id
  AND permission.code LIKE 'tenant:%'
  AND permission.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'system:tenant'),
    ('SUPER_ADMIN', 'tenant:read'),
    ('SUPER_ADMIN', 'tenant:manage')
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark)
SELECT seed_scope.tenant_id,
       seed_scope.park_id,
       role.id,
       permission.id,
       now(),
       now(),
       false,
       1,
       'SaaS tenant management permission'
FROM seed_scope
JOIN role_permissions ON true
JOIN sys_role role
  ON role.tenant_id = seed_scope.tenant_id
 AND role.park_id = seed_scope.park_id
 AND role.code = role_permissions.role_code
 AND role.is_deleted = false
JOIN sys_permission permission
  ON permission.tenant_id = seed_scope.tenant_id
 AND permission.park_id = seed_scope.park_id
 AND permission.code = role_permissions.permission_code
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

UPDATE sys_plan
SET permission_codes = CASE plan_code
    WHEN 'BASIC' THEN '["module:system","module:asset","module:workorder"]'::jsonb
    WHEN 'PROFESSIONAL' THEN '["module:system","module:asset","module:workorder","module:iot","module:energy","module:robot","module:video"]'::jsonb
    WHEN 'ENTERPRISE' THEN '["module:system","module:asset","module:workorder","module:iot","module:energy","module:robot","module:video","module:bim","module:ai"]'::jsonb
    WHEN 'GROUP' THEN '["module:system","module:asset","module:leasing","module:workorder","module:iot","module:energy","module:robot","module:video","module:bim","module:ai"]'::jsonb
    ELSE permission_codes
  END,
  feature_config = COALESCE(feature_config, '{}'::jsonb),
  update_time = now()
WHERE plan_code IN ('BASIC', 'PROFESSIONAL', 'ENTERPRISE', 'GROUP')
  AND is_deleted = false;
