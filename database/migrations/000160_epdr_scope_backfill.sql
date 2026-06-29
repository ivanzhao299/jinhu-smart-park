WITH engineering_module AS (
  INSERT INTO sys_module (
    module_code, module_name, module_group, description, route_prefix, icon, status, sort_no, remark
  )
  VALUES (
    'engineering',
    '工程管理',
    'business',
    '工程项目交付运行时，覆盖项目、计划、日报、巡检、整改、验收闭环',
    '/engineering',
    'hard-hat',
    1,
    68,
    'EPDR engineering module global backfill'
  )
  ON CONFLICT (module_code) WHERE is_deleted = false DO UPDATE SET
    module_name = EXCLUDED.module_name,
    module_group = EXCLUDED.module_group,
    description = EXCLUDED.description,
    route_prefix = EXCLUDED.route_prefix,
    icon = EXCLUDED.icon,
    status = EXCLUDED.status,
    sort_no = EXCLUDED.sort_no,
    remark = EXCLUDED.remark,
    is_deleted = false,
    update_time = now()
  RETURNING id
),
module_row AS (
  SELECT id FROM engineering_module
  UNION
  SELECT id FROM sys_module WHERE module_code = 'engineering' AND is_deleted = false LIMIT 1
)
UPDATE sys_plan plan
SET module_codes = CASE
                     WHEN COALESCE(plan.module_codes, '[]'::jsonb) @> '["engineering"]'::jsonb THEN COALESCE(plan.module_codes, '[]'::jsonb)
                     ELSE COALESCE(plan.module_codes, '[]'::jsonb) || '["engineering"]'::jsonb
                   END,
    update_time = now()
WHERE plan.plan_code IN ('PROFESSIONAL', 'ENTERPRISE', 'GROUP')
  AND plan.is_deleted = false;

WITH module_row AS (
  SELECT id FROM sys_module WHERE module_code = 'engineering' AND is_deleted = false LIMIT 1
)
INSERT INTO rel_plan_module (
  plan_id, module_id, status, create_time, update_time, is_deleted, version, remark
)
SELECT
  plan.id,
  module_row.id,
  1,
  now(),
  now(),
  false,
  1,
  'EPDR engineering plan-module backfill'
FROM sys_plan plan
CROSS JOIN module_row
WHERE plan.plan_code IN ('PROFESSIONAL', 'ENTERPRISE', 'GROUP')
  AND plan.is_deleted = false
ON CONFLICT (plan_id, module_id) WHERE is_deleted = false DO UPDATE SET
  status = 1,
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH source_scope AS (
  SELECT '10000001'::varchar AS tenant_id, '20000001'::varchar AS park_id
),
entitlement_candidates AS (
  SELECT
    tenant_module.tenant_id,
    tenant_module.park_id,
    tenant_module.tenant_code,
    tenant_module.plan_id,
    plan.plan_code,
    row_number() OVER (
      PARTITION BY tenant_module.tenant_id, tenant_module.park_id
      ORDER BY CASE plan.plan_code
        WHEN 'GROUP' THEN 1
        WHEN 'ENTERPRISE' THEN 2
        WHEN 'PROFESSIONAL' THEN 3
        ELSE 9
      END,
      tenant_module.create_time ASC,
      tenant_module.id ASC
    ) AS scope_rank
  FROM rel_tenant_module tenant_module
  JOIN sys_plan plan
    ON plan.id = tenant_module.plan_id
   AND plan.is_deleted = false
  WHERE tenant_module.is_deleted = false
    AND tenant_module.enabled = true
    AND tenant_module.status = 'enabled'
    AND plan.plan_code IN ('PROFESSIONAL', 'ENTERPRISE', 'GROUP')
),
entitled_scopes AS (
  SELECT tenant_id, park_id, tenant_code, plan_id
  FROM entitlement_candidates
  WHERE scope_rank = 1
),
source_registry AS (
  SELECT
    module_name,
    module_group,
    module_version,
    route_path,
    permission_code,
    icon_key,
    sort_no,
    is_builtin,
    status
  FROM sys_module_registry registry
  JOIN source_scope
    ON source_scope.tenant_id = registry.tenant_id
   AND source_scope.park_id = registry.park_id
  WHERE registry.module_code = 'engineering'
    AND registry.is_deleted = false
  ORDER BY registry.create_time ASC
  LIMIT 1
)
INSERT INTO sys_module_registry (
  tenant_id, park_id, module_code, module_name, module_group, module_version, route_path,
  permission_code, icon_key, sort_no, is_builtin, status, create_time, update_time, is_deleted, version, remark
)
SELECT
  entitled_scopes.tenant_id,
  entitled_scopes.park_id,
  'engineering',
  source_registry.module_name,
  source_registry.module_group,
  source_registry.module_version,
  source_registry.route_path,
  source_registry.permission_code,
  source_registry.icon_key,
  source_registry.sort_no,
  source_registry.is_builtin,
  'enabled',
  now(),
  now(),
  false,
  1,
  'EPDR engineering registry backfill'
FROM entitled_scopes
CROSS JOIN source_registry
ON CONFLICT (tenant_id, park_id, module_code) WHERE is_deleted = false DO UPDATE SET
  module_name = EXCLUDED.module_name,
  module_group = EXCLUDED.module_group,
  module_version = EXCLUDED.module_version,
  route_path = EXCLUDED.route_path,
  permission_code = EXCLUDED.permission_code,
  icon_key = EXCLUDED.icon_key,
  sort_no = EXCLUDED.sort_no,
  is_builtin = EXCLUDED.is_builtin,
  status = 'enabled',
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH source_scope AS (
  SELECT '10000001'::varchar AS tenant_id, '20000001'::varchar AS park_id
),
entitlement_candidates AS (
  SELECT
    tenant_module.tenant_id,
    tenant_module.park_id,
    tenant_module.tenant_code,
    tenant_module.plan_id,
    plan.plan_code,
    row_number() OVER (
      PARTITION BY tenant_module.tenant_id, tenant_module.park_id
      ORDER BY CASE plan.plan_code
        WHEN 'GROUP' THEN 1
        WHEN 'ENTERPRISE' THEN 2
        WHEN 'PROFESSIONAL' THEN 3
        ELSE 9
      END,
      tenant_module.create_time ASC,
      tenant_module.id ASC
    ) AS scope_rank
  FROM rel_tenant_module tenant_module
  JOIN sys_plan plan
    ON plan.id = tenant_module.plan_id
   AND plan.is_deleted = false
  WHERE tenant_module.is_deleted = false
    AND tenant_module.enabled = true
    AND tenant_module.status = 'enabled'
    AND plan.plan_code IN ('PROFESSIONAL', 'ENTERPRISE', 'GROUP')
),
entitled_scopes AS (
  SELECT tenant_id, park_id, tenant_code, plan_id
  FROM entitlement_candidates
  WHERE scope_rank = 1
),
source_permissions AS (
  SELECT
    permission.code,
    permission.name,
    permission.resource,
    permission.action,
    permission.permission_type,
    permission.perm_type,
    permission.api_method,
    permission.api_path,
    permission.frontend_route,
    permission.sort_no
  FROM sys_permission permission
  JOIN source_scope
    ON source_scope.tenant_id = permission.tenant_id
   AND source_scope.park_id = permission.park_id
  WHERE permission.is_deleted = false
    AND (permission.code = 'engineering'
      OR permission.code LIKE 'engineering:%'
      OR permission.code LIKE 'ENGINEERING_%')
)
INSERT INTO sys_permission (
  tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
  api_method, api_path, frontend_route, sort_no, status, is_system, is_builtin, visible, remark
)
SELECT
  entitled_scopes.tenant_id,
  entitled_scopes.park_id,
  source_permissions.code,
  source_permissions.name,
  source_permissions.resource,
  source_permissions.action,
  source_permissions.permission_type,
  source_permissions.perm_type,
  source_permissions.api_method,
  source_permissions.api_path,
  source_permissions.frontend_route,
  source_permissions.sort_no,
  'enabled',
  true,
  true,
  true,
  'EPDR engineering permission backfill'
FROM entitled_scopes
CROSS JOIN source_permissions
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_permission existing
  WHERE existing.tenant_id = entitled_scopes.tenant_id
    AND existing.park_id = entitled_scopes.park_id
    AND existing.code = source_permissions.code
    AND existing.is_deleted = false
);

WITH source_scope AS (
  SELECT '10000001'::varchar AS tenant_id, '20000001'::varchar AS park_id
),
entitlement_candidates AS (
  SELECT
    tenant_module.tenant_id,
    tenant_module.park_id,
    row_number() OVER (
      PARTITION BY tenant_module.tenant_id, tenant_module.park_id
      ORDER BY CASE plan.plan_code
        WHEN 'GROUP' THEN 1
        WHEN 'ENTERPRISE' THEN 2
        WHEN 'PROFESSIONAL' THEN 3
        ELSE 9
      END,
      tenant_module.create_time ASC,
      tenant_module.id ASC
    ) AS scope_rank
  FROM rel_tenant_module tenant_module
  JOIN sys_plan plan
    ON plan.id = tenant_module.plan_id
   AND plan.is_deleted = false
  WHERE tenant_module.is_deleted = false
    AND tenant_module.enabled = true
    AND tenant_module.status = 'enabled'
    AND plan.plan_code IN ('PROFESSIONAL', 'ENTERPRISE', 'GROUP')
),
entitled_scopes AS (
  SELECT tenant_id, park_id
  FROM entitlement_candidates
  WHERE scope_rank = 1
),
source_permissions AS (
  SELECT
    permission.code,
    permission.name,
    permission.resource,
    permission.action,
    permission.permission_type,
    permission.perm_type,
    permission.api_method,
    permission.api_path,
    permission.frontend_route,
    permission.sort_no
  FROM sys_permission permission
  JOIN source_scope
    ON source_scope.tenant_id = permission.tenant_id
   AND source_scope.park_id = permission.park_id
  WHERE permission.is_deleted = false
    AND (permission.code = 'engineering'
      OR permission.code LIKE 'engineering:%'
      OR permission.code LIKE 'ENGINEERING_%')
)
UPDATE sys_permission permission
SET name = source_permissions.name,
    resource = source_permissions.resource,
    action = source_permissions.action,
    permission_type = source_permissions.permission_type,
    perm_type = source_permissions.perm_type,
    api_method = source_permissions.api_method,
    api_path = source_permissions.api_path,
    frontend_route = source_permissions.frontend_route,
    sort_no = source_permissions.sort_no,
    status = 'enabled',
    is_system = true,
    is_builtin = true,
    visible = true,
    is_enabled = true,
    is_deleted = false,
    remark = 'EPDR engineering permission backfill',
    update_time = now()
FROM source_permissions
WHERE permission.code = source_permissions.code
  AND permission.is_deleted = false
  AND EXISTS (
    SELECT 1
    FROM entitled_scopes scope
    WHERE scope.tenant_id = permission.tenant_id
      AND scope.park_id = permission.park_id
  );

WITH entitlement_candidates AS (
  SELECT
    tenant_module.tenant_id,
    tenant_module.park_id,
    row_number() OVER (
      PARTITION BY tenant_module.tenant_id, tenant_module.park_id
      ORDER BY CASE plan.plan_code
        WHEN 'GROUP' THEN 1
        WHEN 'ENTERPRISE' THEN 2
        WHEN 'PROFESSIONAL' THEN 3
        ELSE 9
      END,
      tenant_module.create_time ASC,
      tenant_module.id ASC
    ) AS scope_rank
  FROM rel_tenant_module tenant_module
  JOIN sys_plan plan
    ON plan.id = tenant_module.plan_id
   AND plan.is_deleted = false
  WHERE tenant_module.is_deleted = false
    AND tenant_module.enabled = true
    AND tenant_module.status = 'enabled'
    AND plan.plan_code IN ('PROFESSIONAL', 'ENTERPRISE', 'GROUP')
),
entitled_scopes AS (
  SELECT tenant_id, park_id
  FROM entitlement_candidates
  WHERE scope_rank = 1
),
hierarchy(permission_code, parent_code, permission_path, permission_level) AS (
  VALUES
    ('engineering', NULL, 'engineering', 1),
    ('engineering:dashboard', 'engineering', 'engineering/engineering:dashboard', 2),
    ('engineering:projects', 'engineering', 'engineering/engineering:projects', 2),
    ('engineering:plans', 'engineering', 'engineering/engineering:plans', 2),
    ('engineering:daily-reports', 'engineering', 'engineering/engineering:daily-reports', 2),
    ('engineering:inspections', 'engineering', 'engineering/engineering:inspections', 2),
    ('engineering:rectifications', 'engineering', 'engineering/engineering:rectifications', 2),
    ('engineering:acceptances', 'engineering', 'engineering/engineering:acceptances', 2),
    ('ENGINEERING_DASHBOARD_VIEW', 'engineering:dashboard', 'engineering/engineering:dashboard/ENGINEERING_DASHBOARD_VIEW', 3),
    ('ENGINEERING_PROJECT_VIEW', 'engineering:projects', 'engineering/engineering:projects/ENGINEERING_PROJECT_VIEW', 3),
    ('ENGINEERING_PROJECT_CREATE', 'engineering:projects', 'engineering/engineering:projects/ENGINEERING_PROJECT_CREATE', 3),
    ('ENGINEERING_PROJECT_UPDATE', 'engineering:projects', 'engineering/engineering:projects/ENGINEERING_PROJECT_UPDATE', 3),
    ('ENGINEERING_PROJECT_SUBMIT', 'engineering:projects', 'engineering/engineering:projects/ENGINEERING_PROJECT_SUBMIT', 3),
    ('ENGINEERING_PROJECT_APPROVE', 'engineering:projects', 'engineering/engineering:projects/ENGINEERING_PROJECT_APPROVE', 3),
    ('ENGINEERING_PROJECT_CANCEL', 'engineering:projects', 'engineering/engineering:projects/ENGINEERING_PROJECT_CANCEL', 3),
    ('ENGINEERING_PROJECT_CLOSE', 'engineering:projects', 'engineering/engineering:projects/ENGINEERING_PROJECT_CLOSE', 3),
    ('ENGINEERING_PROJECT_ARCHIVE', 'engineering:projects', 'engineering/engineering:projects/ENGINEERING_PROJECT_ARCHIVE', 3),
    ('ENGINEERING_PLAN_VIEW', 'engineering:plans', 'engineering/engineering:plans/ENGINEERING_PLAN_VIEW', 3),
    ('ENGINEERING_PLAN_CREATE', 'engineering:plans', 'engineering/engineering:plans/ENGINEERING_PLAN_CREATE', 3),
    ('ENGINEERING_PLAN_UPDATE', 'engineering:plans', 'engineering/engineering:plans/ENGINEERING_PLAN_UPDATE', 3),
    ('ENGINEERING_PLAN_APPROVE', 'engineering:plans', 'engineering/engineering:plans/ENGINEERING_PLAN_APPROVE', 3),
    ('ENGINEERING_DAILY_REPORT_VIEW', 'engineering:daily-reports', 'engineering/engineering:daily-reports/ENGINEERING_DAILY_REPORT_VIEW', 3),
    ('ENGINEERING_DAILY_REPORT_CREATE', 'engineering:daily-reports', 'engineering/engineering:daily-reports/ENGINEERING_DAILY_REPORT_CREATE', 3),
    ('ENGINEERING_DAILY_REPORT_UPDATE', 'engineering:daily-reports', 'engineering/engineering:daily-reports/ENGINEERING_DAILY_REPORT_UPDATE', 3),
    ('ENGINEERING_DAILY_REPORT_SUBMIT', 'engineering:daily-reports', 'engineering/engineering:daily-reports/ENGINEERING_DAILY_REPORT_SUBMIT', 3),
    ('ENGINEERING_DAILY_REPORT_REVIEW', 'engineering:daily-reports', 'engineering/engineering:daily-reports/ENGINEERING_DAILY_REPORT_REVIEW', 3),
    ('ENGINEERING_INSPECTION_VIEW', 'engineering:inspections', 'engineering/engineering:inspections/ENGINEERING_INSPECTION_VIEW', 3),
    ('ENGINEERING_INSPECTION_CREATE', 'engineering:inspections', 'engineering/engineering:inspections/ENGINEERING_INSPECTION_CREATE', 3),
    ('ENGINEERING_INSPECTION_UPDATE', 'engineering:inspections', 'engineering/engineering:inspections/ENGINEERING_INSPECTION_UPDATE', 3),
    ('ENGINEERING_INSPECTION_SUBMIT', 'engineering:inspections', 'engineering/engineering:inspections/ENGINEERING_INSPECTION_SUBMIT', 3),
    ('ENGINEERING_RECTIFICATION_VIEW', 'engineering:rectifications', 'engineering/engineering:rectifications/ENGINEERING_RECTIFICATION_VIEW', 3),
    ('ENGINEERING_RECTIFICATION_ASSIGN', 'engineering:rectifications', 'engineering/engineering:rectifications/ENGINEERING_RECTIFICATION_ASSIGN', 3),
    ('ENGINEERING_RECTIFICATION_UPDATE', 'engineering:rectifications', 'engineering/engineering:rectifications/ENGINEERING_RECTIFICATION_UPDATE', 3),
    ('ENGINEERING_RECTIFICATION_SUBMIT', 'engineering:rectifications', 'engineering/engineering:rectifications/ENGINEERING_RECTIFICATION_SUBMIT', 3),
    ('ENGINEERING_RECTIFICATION_RECHECK', 'engineering:rectifications', 'engineering/engineering:rectifications/ENGINEERING_RECTIFICATION_RECHECK', 3),
    ('ENGINEERING_RECTIFICATION_CLOSE', 'engineering:rectifications', 'engineering/engineering:rectifications/ENGINEERING_RECTIFICATION_CLOSE', 3),
    ('ENGINEERING_ACCEPTANCE_VIEW', 'engineering:acceptances', 'engineering/engineering:acceptances/ENGINEERING_ACCEPTANCE_VIEW', 3),
    ('ENGINEERING_ACCEPTANCE_CREATE', 'engineering:acceptances', 'engineering/engineering:acceptances/ENGINEERING_ACCEPTANCE_CREATE', 3),
    ('ENGINEERING_ACCEPTANCE_UPDATE', 'engineering:acceptances', 'engineering/engineering:acceptances/ENGINEERING_ACCEPTANCE_UPDATE', 3),
    ('ENGINEERING_ACCEPTANCE_SUBMIT', 'engineering:acceptances', 'engineering/engineering:acceptances/ENGINEERING_ACCEPTANCE_SUBMIT', 3),
    ('ENGINEERING_ACCEPTANCE_REVIEW', 'engineering:acceptances', 'engineering/engineering:acceptances/ENGINEERING_ACCEPTANCE_REVIEW', 3),
    ('ENGINEERING_ACCEPTANCE_CLOSE', 'engineering:acceptances', 'engineering/engineering:acceptances/ENGINEERING_ACCEPTANCE_CLOSE', 3)
)
UPDATE sys_permission permission
SET parent_id = parent.id,
    permission_path = hierarchy.permission_path,
    permission_level = hierarchy.permission_level,
    update_time = now()
FROM hierarchy
LEFT JOIN sys_permission parent
  ON parent.tenant_id = permission.tenant_id
 AND parent.park_id = permission.park_id
 AND parent.code = hierarchy.parent_code
 AND parent.is_deleted = false
WHERE permission.code = hierarchy.permission_code
  AND permission.is_deleted = false
  AND EXISTS (
    SELECT 1
    FROM entitled_scopes scope
    WHERE scope.tenant_id = permission.tenant_id
      AND scope.park_id = permission.park_id
  );

WITH entitlement_candidates AS (
  SELECT
    tenant_module.tenant_id,
    tenant_module.park_id,
    tenant_module.tenant_code,
    tenant_module.plan_id,
    plan.plan_code,
    row_number() OVER (
      PARTITION BY tenant_module.tenant_id, tenant_module.park_id
      ORDER BY CASE plan.plan_code
        WHEN 'GROUP' THEN 1
        WHEN 'ENTERPRISE' THEN 2
        WHEN 'PROFESSIONAL' THEN 3
        ELSE 9
      END,
      tenant_module.create_time ASC,
      tenant_module.id ASC
    ) AS scope_rank
  FROM rel_tenant_module tenant_module
  JOIN sys_plan plan
    ON plan.id = tenant_module.plan_id
   AND plan.is_deleted = false
  WHERE tenant_module.is_deleted = false
    AND tenant_module.enabled = true
    AND tenant_module.status = 'enabled'
    AND plan.plan_code IN ('PROFESSIONAL', 'ENTERPRISE', 'GROUP')
),
entitled_scopes AS (
  SELECT tenant_id, park_id, tenant_code, plan_id
  FROM entitlement_candidates
  WHERE scope_rank = 1
),
module_row AS (
  SELECT id FROM sys_module WHERE module_code = 'engineering' AND is_deleted = false LIMIT 1
)
INSERT INTO rel_tenant_module (
  tenant_id, park_id, tenant_code, module_id, plan_id, enabled, status, create_time, update_time, is_deleted, version, remark
)
SELECT
  entitled_scopes.tenant_id,
  entitled_scopes.park_id,
  entitled_scopes.tenant_code,
  module_row.id,
  entitled_scopes.plan_id,
  true,
  'enabled',
  now(),
  now(),
  false,
  1,
  'EPDR engineering tenant-module backfill'
FROM entitled_scopes
CROSS JOIN module_row
ON CONFLICT (tenant_id, park_id, module_id) WHERE is_deleted = false DO UPDATE SET
  tenant_code = EXCLUDED.tenant_code,
  plan_id = EXCLUDED.plan_id,
  enabled = true,
  status = 'enabled',
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH source_scope AS (
  SELECT '10000001'::varchar AS tenant_id, '20000001'::varchar AS park_id
),
entitlement_candidates AS (
  SELECT
    tenant_module.tenant_id,
    tenant_module.park_id,
    row_number() OVER (
      PARTITION BY tenant_module.tenant_id, tenant_module.park_id
      ORDER BY CASE plan.plan_code
        WHEN 'GROUP' THEN 1
        WHEN 'ENTERPRISE' THEN 2
        WHEN 'PROFESSIONAL' THEN 3
        ELSE 9
      END,
      tenant_module.create_time ASC,
      tenant_module.id ASC
    ) AS scope_rank
  FROM rel_tenant_module tenant_module
  JOIN sys_plan plan
    ON plan.id = tenant_module.plan_id
   AND plan.is_deleted = false
  WHERE tenant_module.is_deleted = false
    AND tenant_module.enabled = true
    AND tenant_module.status = 'enabled'
    AND plan.plan_code IN ('PROFESSIONAL', 'ENTERPRISE', 'GROUP')
),
entitled_scopes AS (
  SELECT tenant_id, park_id
  FROM entitlement_candidates
  WHERE scope_rank = 1
),
source_role_permissions AS (
  SELECT DISTINCT
    role.code AS role_code,
    permission.code AS permission_code
  FROM rel_role_perm role_permission
  JOIN sys_role role
    ON role.id = role_permission.role_id
   AND role.is_deleted = false
  JOIN sys_permission permission
    ON permission.id = role_permission.permission_id
   AND permission.is_deleted = false
  JOIN source_scope
    ON source_scope.tenant_id = role_permission.tenant_id
   AND source_scope.park_id = role_permission.park_id
  WHERE role_permission.is_deleted = false
    AND (permission.code = 'engineering'
      OR permission.code LIKE 'engineering:%'
      OR permission.code LIKE 'ENGINEERING_%')
)
INSERT INTO rel_role_perm (
  tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark
)
SELECT
  entitled_scopes.tenant_id,
  entitled_scopes.park_id,
  role.id,
  permission.id,
  now(),
  now(),
  false,
  1,
  'EPDR engineering role-permission backfill'
FROM entitled_scopes
JOIN source_role_permissions
  ON true
JOIN sys_role role
  ON role.tenant_id = entitled_scopes.tenant_id
 AND role.park_id = entitled_scopes.park_id
 AND role.code = source_role_permissions.role_code
 AND role.is_deleted = false
JOIN sys_permission permission
  ON permission.tenant_id = entitled_scopes.tenant_id
 AND permission.park_id = entitled_scopes.park_id
 AND permission.code = source_role_permissions.permission_code
 AND permission.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_role_perm existing
  WHERE existing.tenant_id = entitled_scopes.tenant_id
    AND existing.park_id = entitled_scopes.park_id
    AND existing.role_id = role.id
    AND existing.permission_id = permission.id
    AND existing.is_deleted = false
);
