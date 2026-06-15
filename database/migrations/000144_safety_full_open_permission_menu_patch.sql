-- Safety module full-open phase 1:
-- Align menu permissions for operations terminal, overdue hazards, and emergency/work-permit dashboard.
-- This patch only repairs RBAC permission/menu metadata and role-permission links.

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code, visible) AS (
  VALUES
    ('safety:operations-terminal', '现场工作台', 'safety.operations_terminal', 'page', 'page', 20, NULL, NULL, '/operations/terminal', 8, 'safety', true),
    ('safety:hazards-overdue', '超期隐患', 'safety.hazard_overdue', 'page', 'page', 20, NULL, NULL, '/safety/hazards/overdue', 55, 'safety', true),
    ('safety:emergency-dashboard', '应急作业看板', 'safety.emergency_work_permit_statistics', 'page', 'page', 20, NULL, NULL, '/safety/emergency-dashboard', 79, 'safety', true),
    ('safety_hazard:overdue', '超期隐患读取', 'biz.safety_hazard', 'overdue', 'api', 40, 'GET', '/api/v1/safety/hazards/overdue', '/safety/hazards/overdue', 615, 'safety:hazards-overdue', true),
    ('safety_emergency_statistics:read', '应急事件统计', 'biz.safety_emergency_statistics', 'read', 'api', 40, 'GET', '/api/v1/safety/emergency-dashboard', '/safety/emergency-dashboard', 780, 'safety:emergency-dashboard', true),
    ('safety_work_permit_statistics:read', '作业许可统计', 'biz.safety_work_permit_statistics', 'read', 'api', 40, 'GET', '/api/v1/safety/emergency-dashboard', '/safety/emergency-dashboard', 781, 'safety:emergency-dashboard', true)
),
permission_rows AS (
  SELECT seed_scope.tenant_id, seed_scope.park_id, permissions.*
  FROM seed_scope
  CROSS JOIN permissions
),
updated_permissions AS (
  UPDATE sys_permission target
  SET park_id = source.park_id,
      name = source.name,
      resource = source.resource,
      action = source.action,
      permission_type = source.permission_type,
      perm_type = source.perm_type,
      api_method = source.api_method,
      api_path = source.api_path,
      frontend_route = source.frontend_route,
      sort_no = source.sort_no,
      status = 'enabled',
      is_enabled = true,
      is_system = true,
      is_builtin = true,
      visible = source.visible,
      is_deleted = false,
      remark = 'Safety full-open phase 1 permission/menu alignment',
      update_time = now()
  FROM permission_rows source
  WHERE target.tenant_id = source.tenant_id
    AND target.code = source.code
    AND target.is_deleted = false
  RETURNING target.id
),
inserted_permissions AS (
  INSERT INTO sys_permission (
    tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
    api_method, api_path, frontend_route, sort_no, status, is_enabled,
    is_system, is_builtin, visible, remark
  )
  SELECT tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
         api_method, api_path, frontend_route, sort_no, 'enabled', true,
         true, true, visible, 'Safety full-open phase 1 permission/menu alignment'
  FROM permission_rows source
  WHERE NOT EXISTS (
    SELECT 1
    FROM sys_permission target
    WHERE target.tenant_id = source.tenant_id
      AND target.code = source.code
      AND target.is_deleted = false
  )
  RETURNING id
),
touched_permissions AS (
  SELECT id FROM updated_permissions
  UNION ALL
  SELECT id FROM inserted_permissions
),
target_permissions AS (
  SELECT permission.id, source.parent_code
  FROM permission_rows source
  JOIN sys_permission permission
    ON permission.tenant_id = source.tenant_id
   AND permission.park_id = source.park_id
   AND permission.code = source.code
   AND permission.is_deleted = false
  JOIN touched_permissions touched ON touched.id = permission.id
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = COALESCE(parent.permission_path, parent.code) || '/' || child.code,
    permission_level = COALESCE(parent.permission_level, 1) + 1,
    update_time = now()
FROM target_permissions target, sys_permission parent
WHERE child.id = target.id
  AND target.parent_code IS NOT NULL
  AND parent.tenant_id = child.tenant_id
  AND parent.park_id = child.park_id
  AND parent.code = target.parent_code
  AND parent.is_deleted = false
  AND child.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
source_menu_permissions(source_permission_code, menu_permission_code) AS (
  VALUES
    ('safety_inspect_task:my', 'safety:operations-terminal'),
    ('safety_hazard:overdue', 'safety:hazards-overdue')
),
eligible_menu_grants AS (
  SELECT DISTINCT seed_scope.tenant_id, seed_scope.park_id, role.id AS role_id, menu_permission.id AS permission_id
  FROM seed_scope
  JOIN sys_role role
    ON role.tenant_id = seed_scope.tenant_id
   AND role.park_id = seed_scope.park_id
   AND role.is_deleted = false
  JOIN source_menu_permissions pair ON true
  JOIN sys_permission source_permission
    ON source_permission.tenant_id = seed_scope.tenant_id
   AND source_permission.park_id = seed_scope.park_id
   AND source_permission.code = pair.source_permission_code
   AND source_permission.is_deleted = false
  JOIN rel_role_perm source_relation
    ON source_relation.tenant_id = seed_scope.tenant_id
   AND source_relation.park_id = seed_scope.park_id
   AND source_relation.role_id = role.id
   AND source_relation.permission_id = source_permission.id
   AND source_relation.is_deleted = false
  JOIN sys_permission menu_permission
    ON menu_permission.tenant_id = seed_scope.tenant_id
   AND menu_permission.park_id = seed_scope.park_id
   AND menu_permission.code = pair.menu_permission_code
   AND menu_permission.is_deleted = false
),
emergency_dashboard_grants AS (
  SELECT DISTINCT seed_scope.tenant_id, seed_scope.park_id, role.id AS role_id, dashboard_permission.id AS permission_id
  FROM seed_scope
  JOIN sys_role role
    ON role.tenant_id = seed_scope.tenant_id
   AND role.park_id = seed_scope.park_id
   AND role.is_deleted = false
  JOIN sys_permission emergency_stats
    ON emergency_stats.tenant_id = seed_scope.tenant_id
   AND emergency_stats.park_id = seed_scope.park_id
   AND emergency_stats.code = 'safety_emergency_statistics:read'
   AND emergency_stats.is_deleted = false
  JOIN rel_role_perm emergency_relation
    ON emergency_relation.tenant_id = seed_scope.tenant_id
   AND emergency_relation.park_id = seed_scope.park_id
   AND emergency_relation.role_id = role.id
   AND emergency_relation.permission_id = emergency_stats.id
   AND emergency_relation.is_deleted = false
  JOIN sys_permission permit_stats
    ON permit_stats.tenant_id = seed_scope.tenant_id
   AND permit_stats.park_id = seed_scope.park_id
   AND permit_stats.code = 'safety_work_permit_statistics:read'
   AND permit_stats.is_deleted = false
  JOIN rel_role_perm permit_relation
    ON permit_relation.tenant_id = seed_scope.tenant_id
   AND permit_relation.park_id = seed_scope.park_id
   AND permit_relation.role_id = role.id
   AND permit_relation.permission_id = permit_stats.id
   AND permit_relation.is_deleted = false
  JOIN sys_permission dashboard_permission
    ON dashboard_permission.tenant_id = seed_scope.tenant_id
   AND dashboard_permission.park_id = seed_scope.park_id
   AND dashboard_permission.code = 'safety:emergency-dashboard'
   AND dashboard_permission.is_deleted = false
),
grant_rows AS (
  SELECT * FROM eligible_menu_grants
  UNION
  SELECT * FROM emergency_dashboard_grants
),
updated_grants AS (
  UPDATE rel_role_perm existing
  SET remark = 'Safety full-open phase 1 menu permission alignment',
      update_time = now()
  FROM grant_rows
  WHERE existing.tenant_id = grant_rows.tenant_id
    AND existing.park_id = grant_rows.park_id
    AND existing.role_id = grant_rows.role_id
    AND existing.permission_id = grant_rows.permission_id
    AND existing.is_deleted = false
  RETURNING existing.id
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark)
SELECT grant_rows.tenant_id, grant_rows.park_id, grant_rows.role_id, grant_rows.permission_id,
       now(), now(), false, 1, 'Safety full-open phase 1 menu permission alignment'
FROM grant_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_role_perm existing
  WHERE existing.tenant_id = grant_rows.tenant_id
    AND existing.park_id = grant_rows.park_id
    AND existing.role_id = grant_rows.role_id
    AND existing.permission_id = grant_rows.permission_id
    AND existing.is_deleted = false
);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
super_role AS (
  SELECT role.id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'SUPER_ADMIN'
    AND role.is_deleted = false
),
super_permissions AS (
  SELECT permission.id, permission.tenant_id, permission.park_id
  FROM sys_permission permission
  JOIN seed_scope
    ON seed_scope.tenant_id = permission.tenant_id
   AND seed_scope.park_id = permission.park_id
  WHERE permission.is_deleted = false
    AND (
      permission.code = 'safety'
      OR permission.code LIKE 'safety:%'
      OR permission.code LIKE 'safety\_%' ESCAPE '\'
      OR permission.code = 'video'
      OR permission.code LIKE 'video:%'
      OR permission.code LIKE 'video\_%' ESCAPE '\'
      OR permission.code LIKE 'MENU_VIDEO%'
      OR permission.code LIKE 'VIDEO_%'
    )
),
super_grants AS (
  SELECT super_role.tenant_id, super_role.park_id, super_role.id AS role_id, super_permissions.id AS permission_id
  FROM super_role
  JOIN super_permissions
    ON super_permissions.tenant_id = super_role.tenant_id
   AND super_permissions.park_id = super_role.park_id
),
updated_super_grants AS (
  UPDATE rel_role_perm existing
  SET remark = 'Safety full-open phase 1 SUPER_ADMIN safety/video coverage',
      update_time = now()
  FROM super_grants
  WHERE existing.tenant_id = super_grants.tenant_id
    AND existing.park_id = super_grants.park_id
    AND existing.role_id = super_grants.role_id
    AND existing.permission_id = super_grants.permission_id
    AND existing.is_deleted = false
  RETURNING existing.id
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark)
SELECT super_grants.tenant_id, super_grants.park_id, super_grants.role_id, super_grants.permission_id,
       now(), now(), false, 1, 'Safety full-open phase 1 SUPER_ADMIN safety/video coverage'
FROM super_grants
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_role_perm existing
  WHERE existing.tenant_id = super_grants.tenant_id
    AND existing.park_id = super_grants.park_id
    AND existing.role_id = super_grants.role_id
    AND existing.permission_id = super_grants.permission_id
    AND existing.is_deleted = false
);
