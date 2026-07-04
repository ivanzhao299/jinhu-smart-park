-- Ensure real go-live UAT roles can see the product entry points that their
-- already-granted business permissions allow them to use.
--
-- This migration grants visible menu permissions only. It does not add create,
-- approve, delete, deploy, or production-operation permissions.

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('engineering:terminal', '工程移动终端', 'engineering.terminal', 'page', 'page', 20, '/engineering/terminal', 6805, 'engineering')
),
permission_rows AS (
  SELECT seed_scope.tenant_id, seed_scope.park_id, permissions.*
  FROM seed_scope
  CROSS JOIN permissions
),
updated AS (
  UPDATE sys_permission target
  SET park_id = source.park_id,
      name = source.name,
      resource = source.resource,
      action = source.action,
      permission_type = source.permission_type,
      perm_type = source.perm_type,
      frontend_route = source.frontend_route,
      sort_no = source.sort_no,
      status = 'enabled',
      is_enabled = true,
      is_system = true,
      is_builtin = true,
      visible = true,
      is_deleted = false,
      remark = 'go-live UAT engineering terminal menu visibility',
      update_time = now()
  FROM permission_rows source
  WHERE target.tenant_id = source.tenant_id
    AND target.code = source.code
    AND target.is_deleted = false
  RETURNING target.id
),
inserted AS (
  INSERT INTO sys_permission (
    tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
    frontend_route, sort_no, status, is_enabled, is_system, is_builtin, visible, remark
  )
  SELECT tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
         frontend_route, sort_no, 'enabled', true, true, true, true,
         'go-live UAT engineering terminal menu visibility'
  FROM permission_rows source
  WHERE NOT EXISTS (
    SELECT 1
    FROM sys_permission existing
    WHERE existing.tenant_id = source.tenant_id
      AND existing.code = source.code
      AND existing.is_deleted = false
  )
  RETURNING id
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = parent.code || '/' || child.code,
    permission_level = 2,
    update_time = now()
FROM sys_permission parent
WHERE child.tenant_id = parent.tenant_id
  AND child.park_id = parent.park_id
  AND child.code = 'engineering:terminal'
  AND parent.code = 'engineering'
  AND child.is_deleted = false
  AND parent.is_deleted = false;

WITH role_menu(role_code, permission_code) AS (
  VALUES
    ('PROPERTY_MANAGER', 'engineering'),
    ('PROPERTY_MANAGER', 'engineering:terminal'),
    ('PROPERTY_MANAGER', 'engineering:dashboard'),
    ('PROPERTY_MANAGER', 'engineering:projects'),
    ('PROPERTY_MANAGER', 'engineering:plans'),
    ('PROPERTY_MANAGER', 'engineering:daily-reports'),
    ('PROPERTY_MANAGER', 'engineering:inspections'),
    ('PROPERTY_MANAGER', 'engineering:rectifications'),
    ('PROPERTY_MANAGER', 'engineering:acceptances'),
    ('PROPERTY_MANAGER', 'workorder'),
    ('PROPERTY_MANAGER', 'workorder:center'),
    ('PROPERTY_MANAGER', 'workorder:list-page'),
    ('SAFETY_MANAGER', 'engineering'),
    ('SAFETY_MANAGER', 'engineering:terminal'),
    ('SAFETY_MANAGER', 'engineering:dashboard'),
    ('SAFETY_MANAGER', 'engineering:projects'),
    ('SAFETY_MANAGER', 'engineering:plans'),
    ('SAFETY_MANAGER', 'engineering:daily-reports'),
    ('SAFETY_MANAGER', 'engineering:inspections'),
    ('SAFETY_MANAGER', 'engineering:rectifications'),
    ('SAFETY_MANAGER', 'engineering:acceptances'),
    ('SAFETY_MANAGER', 'workorder'),
    ('SAFETY_MANAGER', 'workorder:center'),
    ('SAFETY_MANAGER', 'workorder:list-page'),
    ('MAINTENANCE_ENGINEER', 'engineering'),
    ('MAINTENANCE_ENGINEER', 'engineering:terminal'),
    ('MAINTENANCE_ENGINEER', 'engineering:dashboard'),
    ('MAINTENANCE_ENGINEER', 'engineering:projects'),
    ('MAINTENANCE_ENGINEER', 'engineering:daily-reports'),
    ('MAINTENANCE_ENGINEER', 'engineering:inspections'),
    ('MAINTENANCE_ENGINEER', 'engineering:rectifications'),
    ('MAINTENANCE_ENGINEER', 'workorder'),
    ('MAINTENANCE_ENGINEER', 'workorder:center'),
    ('MAINTENANCE_ENGINEER', 'workorder:list-page'),
    ('IOT_OPERATOR', 'engineering'),
    ('IOT_OPERATOR', 'engineering:terminal'),
    ('IOT_OPERATOR', 'engineering:dashboard'),
    ('IOT_OPERATOR', 'engineering:projects'),
    ('IOT_OPERATOR', 'engineering:daily-reports'),
    ('IOT_OPERATOR', 'engineering:inspections'),
    ('IOT_OPERATOR', 'engineering:rectifications'),
    ('FINANCE_MANAGER', 'engineering'),
    ('FINANCE_MANAGER', 'engineering:dashboard'),
    ('FINANCE_MANAGER', 'engineering:projects'),
    ('FINANCE_MANAGER', 'engineering:daily-reports'),
    ('FINANCE_MANAGER', 'engineering:acceptances'),
    ('FINANCE_MANAGER', 'leasing'),
    ('FINANCE_MANAGER', 'leasing:receivable'),
    ('FINANCE_MANAGER', 'leasing:payment'),
    ('INVEST_MANAGER', 'engineering'),
    ('INVEST_MANAGER', 'engineering:dashboard'),
    ('INVEST_MANAGER', 'engineering:projects'),
    ('INVEST_MANAGER', 'leasing'),
    ('INVEST_MANAGER', 'leasing:tenant'),
    ('INVEST_MANAGER', 'leasing:lead'),
    ('INVEST_MANAGER', 'leasing:lead-pool'),
    ('INVEST_MANAGER', 'leasing:invest'),
    ('INVEST_MANAGER', 'workorder'),
    ('INVEST_MANAGER', 'workorder:center'),
    ('INVEST_MANAGER', 'workorder:list-page')
),
resolved AS (
  SELECT role.tenant_id, role.park_id, role.id AS role_id, permission.id AS permission_id
    FROM role_menu
    JOIN sys_role role
      ON role.code = role_menu.role_code
     AND role.tenant_id = '10000001'
     AND role.park_id = '20000001'
     AND role.is_deleted = false
    JOIN sys_permission permission
      ON permission.code = role_menu.permission_code
     AND permission.tenant_id = role.tenant_id
     AND permission.park_id = role.park_id
     AND permission.is_deleted = false
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_by, update_by, is_deleted, remark)
SELECT tenant_id,
       park_id,
       role_id,
       permission_id,
       NULL,
       NULL,
       false,
       'go-live UAT role menu visibility'
  FROM resolved
 WHERE NOT EXISTS (
   SELECT 1
     FROM rel_role_perm existing
    WHERE existing.tenant_id = resolved.tenant_id
      AND existing.park_id = resolved.park_id
      AND existing.role_id = resolved.role_id
      AND existing.permission_id = resolved.permission_id
      AND existing.is_deleted = false
 );

WITH role_menu(role_code, permission_code) AS (
  VALUES
    ('PROPERTY_MANAGER', 'engineering'),
    ('PROPERTY_MANAGER', 'engineering:terminal'),
    ('PROPERTY_MANAGER', 'engineering:dashboard'),
    ('PROPERTY_MANAGER', 'engineering:projects'),
    ('PROPERTY_MANAGER', 'engineering:plans'),
    ('PROPERTY_MANAGER', 'engineering:daily-reports'),
    ('PROPERTY_MANAGER', 'engineering:inspections'),
    ('PROPERTY_MANAGER', 'engineering:rectifications'),
    ('PROPERTY_MANAGER', 'engineering:acceptances'),
    ('PROPERTY_MANAGER', 'workorder'),
    ('PROPERTY_MANAGER', 'workorder:center'),
    ('PROPERTY_MANAGER', 'workorder:list-page'),
    ('SAFETY_MANAGER', 'engineering'),
    ('SAFETY_MANAGER', 'engineering:terminal'),
    ('SAFETY_MANAGER', 'engineering:dashboard'),
    ('SAFETY_MANAGER', 'engineering:projects'),
    ('SAFETY_MANAGER', 'engineering:plans'),
    ('SAFETY_MANAGER', 'engineering:daily-reports'),
    ('SAFETY_MANAGER', 'engineering:inspections'),
    ('SAFETY_MANAGER', 'engineering:rectifications'),
    ('SAFETY_MANAGER', 'engineering:acceptances'),
    ('SAFETY_MANAGER', 'workorder'),
    ('SAFETY_MANAGER', 'workorder:center'),
    ('SAFETY_MANAGER', 'workorder:list-page'),
    ('MAINTENANCE_ENGINEER', 'engineering'),
    ('MAINTENANCE_ENGINEER', 'engineering:terminal'),
    ('MAINTENANCE_ENGINEER', 'engineering:dashboard'),
    ('MAINTENANCE_ENGINEER', 'engineering:projects'),
    ('MAINTENANCE_ENGINEER', 'engineering:daily-reports'),
    ('MAINTENANCE_ENGINEER', 'engineering:inspections'),
    ('MAINTENANCE_ENGINEER', 'engineering:rectifications'),
    ('MAINTENANCE_ENGINEER', 'workorder'),
    ('MAINTENANCE_ENGINEER', 'workorder:center'),
    ('MAINTENANCE_ENGINEER', 'workorder:list-page'),
    ('IOT_OPERATOR', 'engineering'),
    ('IOT_OPERATOR', 'engineering:terminal'),
    ('IOT_OPERATOR', 'engineering:dashboard'),
    ('IOT_OPERATOR', 'engineering:projects'),
    ('IOT_OPERATOR', 'engineering:daily-reports'),
    ('IOT_OPERATOR', 'engineering:inspections'),
    ('IOT_OPERATOR', 'engineering:rectifications'),
    ('FINANCE_MANAGER', 'engineering'),
    ('FINANCE_MANAGER', 'engineering:dashboard'),
    ('FINANCE_MANAGER', 'engineering:projects'),
    ('FINANCE_MANAGER', 'engineering:daily-reports'),
    ('FINANCE_MANAGER', 'engineering:acceptances'),
    ('FINANCE_MANAGER', 'leasing'),
    ('FINANCE_MANAGER', 'leasing:receivable'),
    ('FINANCE_MANAGER', 'leasing:payment'),
    ('INVEST_MANAGER', 'engineering'),
    ('INVEST_MANAGER', 'engineering:dashboard'),
    ('INVEST_MANAGER', 'engineering:projects'),
    ('INVEST_MANAGER', 'leasing'),
    ('INVEST_MANAGER', 'leasing:tenant'),
    ('INVEST_MANAGER', 'leasing:lead'),
    ('INVEST_MANAGER', 'leasing:lead-pool'),
    ('INVEST_MANAGER', 'leasing:invest'),
    ('INVEST_MANAGER', 'workorder'),
    ('INVEST_MANAGER', 'workorder:center'),
    ('INVEST_MANAGER', 'workorder:list-page')
),
resolved AS (
  SELECT role.tenant_id, role.park_id, role.id AS role_id, permission.id AS permission_id
    FROM role_menu
    JOIN sys_role role
      ON role.code = role_menu.role_code
     AND role.tenant_id = '10000001'
     AND role.park_id = '20000001'
     AND role.is_deleted = false
    JOIN sys_permission permission
      ON permission.code = role_menu.permission_code
     AND permission.tenant_id = role.tenant_id
     AND permission.park_id = role.park_id
     AND permission.is_deleted = false
)
UPDATE rel_role_perm link
   SET is_deleted = false,
       update_time = now(),
       remark = 'go-live UAT role menu visibility'
  FROM resolved
 WHERE link.tenant_id = resolved.tenant_id
   AND link.park_id = resolved.park_id
   AND link.role_id = resolved.role_id
   AND link.permission_id = resolved.permission_id
   AND link.is_deleted = true;
