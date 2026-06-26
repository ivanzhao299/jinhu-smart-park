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
    'EPDR Phase 1 engineering module seed'
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
    update_time = now()
  RETURNING id
),
module_row AS (
  SELECT id FROM engineering_module
  UNION
  SELECT id FROM sys_module WHERE module_code = 'engineering' AND is_deleted = false LIMIT 1
),
target_plans AS (
  SELECT id
  FROM sys_plan
  WHERE plan_code IN ('PROFESSIONAL', 'ENTERPRISE', 'GROUP')
    AND is_deleted = false
)
INSERT INTO rel_plan_module (plan_id, module_id, status, create_time, update_time, is_deleted, version, remark)
SELECT target_plans.id, module_row.id, 1, now(), now(), false, 1, 'EPDR engineering module plan grant'
FROM target_plans
CROSS JOIN module_row
ON CONFLICT (plan_id, module_id) WHERE is_deleted = false DO UPDATE SET
  status = EXCLUDED.status,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
module_row AS (
  SELECT id FROM sys_module WHERE module_code = 'engineering' AND is_deleted = false LIMIT 1
)
INSERT INTO rel_tenant_module (
  tenant_id, park_id, module_id, enabled, status, create_time, update_time, is_deleted, version, remark
)
SELECT seed_scope.tenant_id, seed_scope.park_id, module_row.id, true, 'enabled', now(), now(), false, 1, 'Enable EPDR engineering module for Jinhu seed tenant'
FROM seed_scope
CROSS JOIN module_row
ON CONFLICT (tenant_id, park_id, module_id) WHERE is_deleted = false DO UPDATE SET
  enabled = true,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

INSERT INTO sys_module_registry (
  tenant_id, park_id, module_code, module_name, module_group, module_version, route_path,
  permission_code, icon_key, sort_no, is_builtin, status, create_time, update_time, is_deleted, version, remark
)
VALUES (
  '10000001', '20000001', 'engineering', '工程管理', 'business', '1.0.0', '/engineering',
  'ENGINEERING_DASHBOARD_VIEW', 'hard-hat', 68, true, 'enabled', now(), now(), false, 1, 'EPDR Phase 1 engineering module registry seed'
)
ON CONFLICT (tenant_id, park_id, module_code) WHERE is_deleted = false DO UPDATE SET
  module_name = EXCLUDED.module_name,
  module_group = EXCLUDED.module_group,
  route_path = EXCLUDED.route_path,
  permission_code = EXCLUDED.permission_code,
  icon_key = EXCLUDED.icon_key,
  sort_no = EXCLUDED.sort_no,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('engineering', '工程管理', NULL, 'engineering', 'menu', 10, NULL, NULL, '/engineering', 68),
    ('engineering:dashboard', '工程看板', NULL, 'engineering.dashboard', 'menu', 20, NULL, NULL, '/engineering/dashboard', 681),
    ('engineering:projects', '工程项目', NULL, 'engineering.project', 'menu', 20, NULL, NULL, '/engineering/projects', 682),
    ('engineering:plans', '工程计划', NULL, 'engineering.plan', 'menu', 20, NULL, NULL, '/engineering/plans', 683),
    ('engineering:daily-reports', '施工日报', NULL, 'engineering.daily_report', 'menu', 20, NULL, NULL, '/engineering/daily-reports', 684),
    ('engineering:inspections', '工程巡检', NULL, 'engineering.inspection', 'menu', 20, NULL, NULL, '/engineering/inspections', 685),
    ('engineering:rectifications', '整改任务', NULL, 'engineering.rectification', 'menu', 20, NULL, NULL, '/engineering/rectifications', 686),
    ('engineering:acceptances', '工程验收', NULL, 'engineering.acceptance', 'menu', 20, NULL, NULL, '/engineering/acceptances', 687),

    ('ENGINEERING_DASHBOARD_VIEW', '工程看板查看', 'biz.engineering_dashboard', 'view', 'api', 40, 'GET', '/api/v1/engineering/dashboard', '/engineering/dashboard', 6811),

    ('ENGINEERING_PROJECT_VIEW', '工程项目查看', 'biz.engineering_project', 'view', 'api', 40, 'GET', '/api/v1/engineering/projects', '/engineering/projects', 6821),
    ('ENGINEERING_PROJECT_CREATE', '工程项目创建', 'biz.engineering_project', 'create', 'api', 40, 'POST', '/api/v1/engineering/projects', '/engineering/projects/new', 6822),
    ('ENGINEERING_PROJECT_UPDATE', '工程项目编辑', 'biz.engineering_project', 'update', 'api', 40, 'PATCH', '/api/v1/engineering/projects/:id', '/engineering/projects/:id/edit', 6823),
    ('ENGINEERING_PROJECT_SUBMIT', '工程项目提交', 'biz.engineering_project', 'submit', 'api', 40, 'POST', '/api/v1/engineering/projects/:id/actions/SUBMIT', '/engineering/projects/:id', 6824),
    ('ENGINEERING_PROJECT_APPROVE', '工程项目批准', 'biz.engineering_project', 'approve', 'api', 40, 'POST', '/api/v1/engineering/projects/:id/actions/APPROVE', '/engineering/projects/:id', 6825),
    ('ENGINEERING_PROJECT_CANCEL', '工程项目取消', 'biz.engineering_project', 'cancel', 'api', 40, 'POST', '/api/v1/engineering/projects/:id/actions/CANCEL', '/engineering/projects/:id', 6826),
    ('ENGINEERING_PROJECT_CLOSE', '工程项目关闭', 'biz.engineering_project', 'close', 'api', 40, 'POST', '/api/v1/engineering/projects/:id/actions/CLOSE', '/engineering/projects/:id', 6827),
    ('ENGINEERING_PROJECT_ARCHIVE', '工程项目归档', 'biz.engineering_project', 'archive', 'api', 40, 'POST', '/api/v1/engineering/projects/:id/actions/ARCHIVE', '/engineering/projects/:id', 6828),

    ('ENGINEERING_PLAN_VIEW', '工程计划查看', 'biz.engineering_plan', 'view', 'api', 40, 'GET', '/api/v1/engineering/plans', '/engineering/plans', 6831),
    ('ENGINEERING_PLAN_CREATE', '工程计划创建', 'biz.engineering_plan', 'create', 'api', 40, 'POST', '/api/v1/engineering/plans', '/engineering/plans/new', 6832),
    ('ENGINEERING_PLAN_UPDATE', '工程计划编辑', 'biz.engineering_plan', 'update', 'api', 40, 'PATCH', '/api/v1/engineering/plans/:id', '/engineering/plans/:id/edit', 6833),
    ('ENGINEERING_PLAN_APPROVE', '工程计划审批', 'biz.engineering_plan', 'approve', 'api', 40, 'PATCH', '/api/v1/engineering/plans/:id/status', '/engineering/plans/:id', 6834),

    ('ENGINEERING_DAILY_REPORT_VIEW', '施工日报查看', 'biz.engineering_daily_report', 'view', 'api', 40, 'GET', '/api/v1/engineering/daily-reports', '/engineering/daily-reports', 6841),
    ('ENGINEERING_DAILY_REPORT_CREATE', '施工日报创建', 'biz.engineering_daily_report', 'create', 'api', 40, 'POST', '/api/v1/engineering/daily-reports', '/engineering/daily-reports/new', 6842),
    ('ENGINEERING_DAILY_REPORT_UPDATE', '施工日报编辑', 'biz.engineering_daily_report', 'update', 'api', 40, 'PATCH', '/api/v1/engineering/daily-reports/:id', '/engineering/daily-reports/:id/edit', 6843),
    ('ENGINEERING_DAILY_REPORT_SUBMIT', '施工日报提交', 'biz.engineering_daily_report', 'submit', 'api', 40, 'POST', '/api/v1/engineering/daily-reports/:id/submit', '/engineering/daily-reports/:id', 6844),
    ('ENGINEERING_DAILY_REPORT_REVIEW', '施工日报审核', 'biz.engineering_daily_report', 'review', 'api', 40, 'POST', '/api/v1/engineering/daily-reports/:id/review', '/engineering/daily-reports/:id', 6845),

    ('ENGINEERING_INSPECTION_VIEW', '工程巡检查看', 'biz.engineering_inspection', 'view', 'api', 40, 'GET', '/api/v1/engineering/inspections', '/engineering/inspections', 6851),
    ('ENGINEERING_INSPECTION_CREATE', '工程巡检创建', 'biz.engineering_inspection', 'create', 'api', 40, 'POST', '/api/v1/engineering/inspections', '/engineering/inspections/new', 6852),
    ('ENGINEERING_INSPECTION_UPDATE', '工程巡检编辑', 'biz.engineering_inspection', 'update', 'api', 40, 'PATCH', '/api/v1/engineering/inspections/:id', '/engineering/inspections/:id/edit', 6853),
    ('ENGINEERING_INSPECTION_SUBMIT', '工程巡检提交', 'biz.engineering_inspection', 'submit', 'api', 40, 'POST', '/api/v1/engineering/inspections/:id/submit', '/engineering/inspections/:id', 6854),

    ('ENGINEERING_RECTIFICATION_VIEW', '整改任务查看', 'biz.engineering_rectification', 'view', 'api', 40, 'GET', '/api/v1/engineering/rectifications', '/engineering/rectifications', 6861),
    ('ENGINEERING_RECTIFICATION_ASSIGN', '整改任务分派', 'biz.engineering_rectification', 'assign', 'api', 40, 'POST', '/api/v1/engineering/issues/:id/generate-rectification', '/engineering/rectifications', 6862),
    ('ENGINEERING_RECTIFICATION_UPDATE', '整改任务编辑', 'biz.engineering_rectification', 'update', 'api', 40, 'PATCH', '/api/v1/engineering/rectifications/:id', '/engineering/rectifications/:id', 6863),
    ('ENGINEERING_RECTIFICATION_SUBMIT', '整改反馈提交', 'biz.engineering_rectification', 'submit', 'api', 40, 'POST', '/api/v1/engineering/rectifications/:id/actions', '/engineering/rectifications/:id', 6864),
    ('ENGINEERING_RECTIFICATION_RECHECK', '整改复查', 'biz.engineering_rectification', 'recheck', 'api', 40, 'POST', '/api/v1/engineering/rectifications/:id/actions', '/engineering/rectifications/:id', 6865),
    ('ENGINEERING_RECTIFICATION_CLOSE', '整改关闭', 'biz.engineering_rectification', 'close', 'api', 40, 'POST', '/api/v1/engineering/rectifications/:id/actions', '/engineering/rectifications/:id', 6866),

    ('ENGINEERING_ACCEPTANCE_VIEW', '工程验收查看', 'biz.engineering_acceptance', 'view', 'api', 40, 'GET', '/api/v1/engineering/acceptances', '/engineering/acceptances', 6871),
    ('ENGINEERING_ACCEPTANCE_CREATE', '工程验收创建', 'biz.engineering_acceptance', 'create', 'api', 40, 'POST', '/api/v1/engineering/acceptances', '/engineering/acceptances/new', 6872),
    ('ENGINEERING_ACCEPTANCE_UPDATE', '工程验收编辑', 'biz.engineering_acceptance', 'update', 'api', 40, 'PATCH', '/api/v1/engineering/acceptances/:id', '/engineering/acceptances/:id/edit', 6873),
    ('ENGINEERING_ACCEPTANCE_SUBMIT', '工程验收提交', 'biz.engineering_acceptance', 'submit', 'api', 40, 'POST', '/api/v1/engineering/acceptances/:id/submit', '/engineering/acceptances/:id', 6874),
    ('ENGINEERING_ACCEPTANCE_REVIEW', '工程验收评审', 'biz.engineering_acceptance', 'review', 'api', 40, 'POST', '/api/v1/engineering/acceptances/:id/review', '/engineering/acceptances/:id', 6875),
    ('ENGINEERING_ACCEPTANCE_CLOSE', '工程验收关闭', 'biz.engineering_acceptance', 'close', 'api', 40, 'POST', '/api/v1/engineering/acceptances/:id/close', '/engineering/acceptances/:id', 6876)
),
updated_permissions AS (
  UPDATE sys_permission existing
  SET park_id = seed_scope.park_id,
      name = permissions.name,
      resource = permissions.resource,
      action = permissions.action,
      permission_type = permissions.permission_type,
      perm_type = permissions.perm_type,
      api_method = permissions.api_method,
      api_path = permissions.api_path,
      frontend_route = permissions.frontend_route,
      sort_no = permissions.sort_no,
      status = 'enabled',
      visible = true,
      is_system = true,
      is_builtin = true,
      is_deleted = false,
      remark = 'EPDR Phase 1 engineering RBAC seed',
      update_time = now()
  FROM permissions
  CROSS JOIN seed_scope
  WHERE existing.tenant_id = seed_scope.tenant_id
    AND existing.code = permissions.code
    AND existing.is_deleted = false
  RETURNING existing.id
),
inserted_permissions AS (
  INSERT INTO sys_permission (
    tenant_id, park_id, code, name, resource, action, permission_type, perm_type,
    api_method, api_path, frontend_route, sort_no, status, is_system, is_builtin, visible, remark
  )
  SELECT
    seed_scope.tenant_id, seed_scope.park_id, permissions.code, permissions.name,
    permissions.resource, permissions.action, permissions.permission_type, permissions.perm_type,
    permissions.api_method, permissions.api_path, permissions.frontend_route, permissions.sort_no,
    'enabled', true, true, true, 'EPDR Phase 1 engineering RBAC seed'
  FROM permissions
  CROSS JOIN seed_scope
  WHERE NOT EXISTS (
    SELECT 1
    FROM sys_permission existing
    WHERE existing.tenant_id = seed_scope.tenant_id
      AND existing.code = permissions.code
      AND existing.is_deleted = false
  )
  RETURNING id
),
touched_permissions AS (
  SELECT id FROM updated_permissions
  UNION ALL
  SELECT id FROM inserted_permissions
)
UPDATE sys_permission permission
SET permission_path = permission.code,
    permission_level = 1,
    parent_id = NULL,
    update_time = now()
WHERE permission.tenant_id = (SELECT tenant_id FROM seed_scope)
  AND permission.park_id = (SELECT park_id FROM seed_scope)
  AND permission.code = 'engineering'
  AND permission.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
children(code) AS (
  VALUES
    ('engineering:dashboard'),
    ('engineering:projects'),
    ('engineering:plans'),
    ('engineering:daily-reports'),
    ('engineering:inspections'),
    ('engineering:rectifications'),
    ('engineering:acceptances')
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = parent.code || '/' || child.code,
    permission_level = 2,
    update_time = now()
FROM sys_permission parent, children
WHERE child.tenant_id = parent.tenant_id
  AND child.park_id = parent.park_id
  AND child.code = children.code
  AND parent.code = 'engineering'
  AND parent.is_deleted = false
  AND child.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permission_parent(permission_code, parent_code) AS (
  VALUES
    ('ENGINEERING_DASHBOARD_VIEW', 'engineering:dashboard'),
    ('ENGINEERING_PROJECT_VIEW', 'engineering:projects'),
    ('ENGINEERING_PROJECT_CREATE', 'engineering:projects'),
    ('ENGINEERING_PROJECT_UPDATE', 'engineering:projects'),
    ('ENGINEERING_PROJECT_SUBMIT', 'engineering:projects'),
    ('ENGINEERING_PROJECT_APPROVE', 'engineering:projects'),
    ('ENGINEERING_PROJECT_CANCEL', 'engineering:projects'),
    ('ENGINEERING_PROJECT_CLOSE', 'engineering:projects'),
    ('ENGINEERING_PROJECT_ARCHIVE', 'engineering:projects'),
    ('ENGINEERING_PLAN_VIEW', 'engineering:plans'),
    ('ENGINEERING_PLAN_CREATE', 'engineering:plans'),
    ('ENGINEERING_PLAN_UPDATE', 'engineering:plans'),
    ('ENGINEERING_PLAN_APPROVE', 'engineering:plans'),
    ('ENGINEERING_DAILY_REPORT_VIEW', 'engineering:daily-reports'),
    ('ENGINEERING_DAILY_REPORT_CREATE', 'engineering:daily-reports'),
    ('ENGINEERING_DAILY_REPORT_UPDATE', 'engineering:daily-reports'),
    ('ENGINEERING_DAILY_REPORT_SUBMIT', 'engineering:daily-reports'),
    ('ENGINEERING_DAILY_REPORT_REVIEW', 'engineering:daily-reports'),
    ('ENGINEERING_INSPECTION_VIEW', 'engineering:inspections'),
    ('ENGINEERING_INSPECTION_CREATE', 'engineering:inspections'),
    ('ENGINEERING_INSPECTION_UPDATE', 'engineering:inspections'),
    ('ENGINEERING_INSPECTION_SUBMIT', 'engineering:inspections'),
    ('ENGINEERING_RECTIFICATION_VIEW', 'engineering:rectifications'),
    ('ENGINEERING_RECTIFICATION_ASSIGN', 'engineering:rectifications'),
    ('ENGINEERING_RECTIFICATION_UPDATE', 'engineering:rectifications'),
    ('ENGINEERING_RECTIFICATION_SUBMIT', 'engineering:rectifications'),
    ('ENGINEERING_RECTIFICATION_RECHECK', 'engineering:rectifications'),
    ('ENGINEERING_RECTIFICATION_CLOSE', 'engineering:rectifications'),
    ('ENGINEERING_ACCEPTANCE_VIEW', 'engineering:acceptances'),
    ('ENGINEERING_ACCEPTANCE_CREATE', 'engineering:acceptances'),
    ('ENGINEERING_ACCEPTANCE_UPDATE', 'engineering:acceptances'),
    ('ENGINEERING_ACCEPTANCE_SUBMIT', 'engineering:acceptances'),
    ('ENGINEERING_ACCEPTANCE_REVIEW', 'engineering:acceptances'),
    ('ENGINEERING_ACCEPTANCE_CLOSE', 'engineering:acceptances')
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = parent.permission_path || '/' || child.code,
    permission_level = 3,
    update_time = now()
FROM sys_permission parent, permission_parent
WHERE child.tenant_id = parent.tenant_id
  AND child.park_id = parent.park_id
  AND child.code = permission_parent.permission_code
  AND parent.code = permission_parent.parent_code
  AND parent.is_deleted = false
  AND child.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'engineering'),
    ('SUPER_ADMIN', 'engineering:dashboard'),
    ('SUPER_ADMIN', 'engineering:projects'),
    ('SUPER_ADMIN', 'engineering:plans'),
    ('SUPER_ADMIN', 'engineering:daily-reports'),
    ('SUPER_ADMIN', 'engineering:inspections'),
    ('SUPER_ADMIN', 'engineering:rectifications'),
    ('SUPER_ADMIN', 'engineering:acceptances'),
    ('SUPER_ADMIN', 'ENGINEERING_DASHBOARD_VIEW'),
    ('SUPER_ADMIN', 'ENGINEERING_PROJECT_VIEW'),
    ('SUPER_ADMIN', 'ENGINEERING_PROJECT_CREATE'),
    ('SUPER_ADMIN', 'ENGINEERING_PROJECT_UPDATE'),
    ('SUPER_ADMIN', 'ENGINEERING_PROJECT_SUBMIT'),
    ('SUPER_ADMIN', 'ENGINEERING_PROJECT_APPROVE'),
    ('SUPER_ADMIN', 'ENGINEERING_PROJECT_CANCEL'),
    ('SUPER_ADMIN', 'ENGINEERING_PROJECT_CLOSE'),
    ('SUPER_ADMIN', 'ENGINEERING_PROJECT_ARCHIVE'),
    ('SUPER_ADMIN', 'ENGINEERING_PLAN_VIEW'),
    ('SUPER_ADMIN', 'ENGINEERING_PLAN_CREATE'),
    ('SUPER_ADMIN', 'ENGINEERING_PLAN_UPDATE'),
    ('SUPER_ADMIN', 'ENGINEERING_PLAN_APPROVE'),
    ('SUPER_ADMIN', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('SUPER_ADMIN', 'ENGINEERING_DAILY_REPORT_CREATE'),
    ('SUPER_ADMIN', 'ENGINEERING_DAILY_REPORT_UPDATE'),
    ('SUPER_ADMIN', 'ENGINEERING_DAILY_REPORT_SUBMIT'),
    ('SUPER_ADMIN', 'ENGINEERING_DAILY_REPORT_REVIEW'),
    ('SUPER_ADMIN', 'ENGINEERING_INSPECTION_VIEW'),
    ('SUPER_ADMIN', 'ENGINEERING_INSPECTION_CREATE'),
    ('SUPER_ADMIN', 'ENGINEERING_INSPECTION_UPDATE'),
    ('SUPER_ADMIN', 'ENGINEERING_INSPECTION_SUBMIT'),
    ('SUPER_ADMIN', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('SUPER_ADMIN', 'ENGINEERING_RECTIFICATION_ASSIGN'),
    ('SUPER_ADMIN', 'ENGINEERING_RECTIFICATION_UPDATE'),
    ('SUPER_ADMIN', 'ENGINEERING_RECTIFICATION_SUBMIT'),
    ('SUPER_ADMIN', 'ENGINEERING_RECTIFICATION_RECHECK'),
    ('SUPER_ADMIN', 'ENGINEERING_RECTIFICATION_CLOSE'),
    ('SUPER_ADMIN', 'ENGINEERING_ACCEPTANCE_VIEW'),
    ('SUPER_ADMIN', 'ENGINEERING_ACCEPTANCE_CREATE'),
    ('SUPER_ADMIN', 'ENGINEERING_ACCEPTANCE_UPDATE'),
    ('SUPER_ADMIN', 'ENGINEERING_ACCEPTANCE_SUBMIT'),
    ('SUPER_ADMIN', 'ENGINEERING_ACCEPTANCE_REVIEW'),
    ('SUPER_ADMIN', 'ENGINEERING_ACCEPTANCE_CLOSE'),

    ('OPERATIONS_OWNER', 'engineering'),
    ('OPERATIONS_OWNER', 'engineering:dashboard'),
    ('OPERATIONS_OWNER', 'engineering:projects'),
    ('OPERATIONS_OWNER', 'engineering:plans'),
    ('OPERATIONS_OWNER', 'engineering:daily-reports'),
    ('OPERATIONS_OWNER', 'engineering:inspections'),
    ('OPERATIONS_OWNER', 'engineering:rectifications'),
    ('OPERATIONS_OWNER', 'engineering:acceptances'),
    ('OPERATIONS_OWNER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('OPERATIONS_OWNER', 'ENGINEERING_PROJECT_VIEW'),
    ('OPERATIONS_OWNER', 'ENGINEERING_PROJECT_CREATE'),
    ('OPERATIONS_OWNER', 'ENGINEERING_PROJECT_UPDATE'),
    ('OPERATIONS_OWNER', 'ENGINEERING_PROJECT_SUBMIT'),
    ('OPERATIONS_OWNER', 'ENGINEERING_PROJECT_APPROVE'),
    ('OPERATIONS_OWNER', 'ENGINEERING_PROJECT_CANCEL'),
    ('OPERATIONS_OWNER', 'ENGINEERING_PROJECT_CLOSE'),
    ('OPERATIONS_OWNER', 'ENGINEERING_PLAN_VIEW'),
    ('OPERATIONS_OWNER', 'ENGINEERING_PLAN_CREATE'),
    ('OPERATIONS_OWNER', 'ENGINEERING_PLAN_UPDATE'),
    ('OPERATIONS_OWNER', 'ENGINEERING_PLAN_APPROVE'),
    ('OPERATIONS_OWNER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('OPERATIONS_OWNER', 'ENGINEERING_DAILY_REPORT_CREATE'),
    ('OPERATIONS_OWNER', 'ENGINEERING_DAILY_REPORT_UPDATE'),
    ('OPERATIONS_OWNER', 'ENGINEERING_DAILY_REPORT_SUBMIT'),
    ('OPERATIONS_OWNER', 'ENGINEERING_DAILY_REPORT_REVIEW'),
    ('OPERATIONS_OWNER', 'ENGINEERING_INSPECTION_VIEW'),
    ('OPERATIONS_OWNER', 'ENGINEERING_INSPECTION_CREATE'),
    ('OPERATIONS_OWNER', 'ENGINEERING_INSPECTION_UPDATE'),
    ('OPERATIONS_OWNER', 'ENGINEERING_INSPECTION_SUBMIT'),
    ('OPERATIONS_OWNER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('OPERATIONS_OWNER', 'ENGINEERING_RECTIFICATION_ASSIGN'),
    ('OPERATIONS_OWNER', 'ENGINEERING_RECTIFICATION_UPDATE'),
    ('OPERATIONS_OWNER', 'ENGINEERING_RECTIFICATION_SUBMIT'),
    ('OPERATIONS_OWNER', 'ENGINEERING_RECTIFICATION_RECHECK'),
    ('OPERATIONS_OWNER', 'ENGINEERING_RECTIFICATION_CLOSE'),
    ('OPERATIONS_OWNER', 'ENGINEERING_ACCEPTANCE_VIEW'),
    ('OPERATIONS_OWNER', 'ENGINEERING_ACCEPTANCE_CREATE'),
    ('OPERATIONS_OWNER', 'ENGINEERING_ACCEPTANCE_UPDATE'),
    ('OPERATIONS_OWNER', 'ENGINEERING_ACCEPTANCE_SUBMIT'),
    ('OPERATIONS_OWNER', 'ENGINEERING_ACCEPTANCE_REVIEW'),
    ('OPERATIONS_OWNER', 'ENGINEERING_ACCEPTANCE_CLOSE'),

    ('EXECUTIVE', 'engineering'),
    ('EXECUTIVE', 'engineering:dashboard'),
    ('EXECUTIVE', 'engineering:projects'),
    ('EXECUTIVE', 'engineering:plans'),
    ('EXECUTIVE', 'engineering:daily-reports'),
    ('EXECUTIVE', 'engineering:inspections'),
    ('EXECUTIVE', 'engineering:rectifications'),
    ('EXECUTIVE', 'engineering:acceptances'),
    ('EXECUTIVE', 'ENGINEERING_DASHBOARD_VIEW'),
    ('EXECUTIVE', 'ENGINEERING_PROJECT_VIEW'),
    ('EXECUTIVE', 'ENGINEERING_PLAN_VIEW'),
    ('EXECUTIVE', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('EXECUTIVE', 'ENGINEERING_INSPECTION_VIEW'),
    ('EXECUTIVE', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('EXECUTIVE', 'ENGINEERING_ACCEPTANCE_VIEW'),

    ('ENGINEERING_DIRECTOR', 'engineering'),
    ('ENGINEERING_DIRECTOR', 'engineering:dashboard'),
    ('ENGINEERING_DIRECTOR', 'engineering:projects'),
    ('ENGINEERING_DIRECTOR', 'engineering:plans'),
    ('ENGINEERING_DIRECTOR', 'engineering:daily-reports'),
    ('ENGINEERING_DIRECTOR', 'engineering:inspections'),
    ('ENGINEERING_DIRECTOR', 'engineering:rectifications'),
    ('ENGINEERING_DIRECTOR', 'engineering:acceptances'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_DASHBOARD_VIEW'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_PROJECT_VIEW'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_PROJECT_CREATE'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_PROJECT_UPDATE'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_PROJECT_SUBMIT'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_PROJECT_APPROVE'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_PROJECT_CLOSE'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_PLAN_VIEW'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_PLAN_CREATE'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_PLAN_UPDATE'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_PLAN_APPROVE'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_DAILY_REPORT_REVIEW'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_INSPECTION_VIEW'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_INSPECTION_CREATE'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_INSPECTION_UPDATE'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_INSPECTION_SUBMIT'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_RECTIFICATION_ASSIGN'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_RECTIFICATION_RECHECK'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_RECTIFICATION_CLOSE'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_ACCEPTANCE_VIEW'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_ACCEPTANCE_CREATE'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_ACCEPTANCE_UPDATE'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_ACCEPTANCE_SUBMIT'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_ACCEPTANCE_REVIEW'),
    ('ENGINEERING_DIRECTOR', 'ENGINEERING_ACCEPTANCE_CLOSE'),

    ('PROJECT_MANAGER', 'engineering'),
    ('PROJECT_MANAGER', 'engineering:dashboard'),
    ('PROJECT_MANAGER', 'engineering:projects'),
    ('PROJECT_MANAGER', 'engineering:plans'),
    ('PROJECT_MANAGER', 'engineering:daily-reports'),
    ('PROJECT_MANAGER', 'engineering:inspections'),
    ('PROJECT_MANAGER', 'engineering:rectifications'),
    ('PROJECT_MANAGER', 'engineering:acceptances'),
    ('PROJECT_MANAGER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('PROJECT_MANAGER', 'ENGINEERING_PROJECT_VIEW'),
    ('PROJECT_MANAGER', 'ENGINEERING_PROJECT_CREATE'),
    ('PROJECT_MANAGER', 'ENGINEERING_PROJECT_UPDATE'),
    ('PROJECT_MANAGER', 'ENGINEERING_PROJECT_SUBMIT'),
    ('PROJECT_MANAGER', 'ENGINEERING_PLAN_VIEW'),
    ('PROJECT_MANAGER', 'ENGINEERING_PLAN_CREATE'),
    ('PROJECT_MANAGER', 'ENGINEERING_PLAN_UPDATE'),
    ('PROJECT_MANAGER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('PROJECT_MANAGER', 'ENGINEERING_DAILY_REPORT_REVIEW'),
    ('PROJECT_MANAGER', 'ENGINEERING_INSPECTION_VIEW'),
    ('PROJECT_MANAGER', 'ENGINEERING_INSPECTION_CREATE'),
    ('PROJECT_MANAGER', 'ENGINEERING_INSPECTION_UPDATE'),
    ('PROJECT_MANAGER', 'ENGINEERING_INSPECTION_SUBMIT'),
    ('PROJECT_MANAGER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('PROJECT_MANAGER', 'ENGINEERING_RECTIFICATION_ASSIGN'),
    ('PROJECT_MANAGER', 'ENGINEERING_RECTIFICATION_RECHECK'),
    ('PROJECT_MANAGER', 'ENGINEERING_ACCEPTANCE_VIEW'),
    ('PROJECT_MANAGER', 'ENGINEERING_ACCEPTANCE_CREATE'),
    ('PROJECT_MANAGER', 'ENGINEERING_ACCEPTANCE_SUBMIT'),
    ('PROJECT_MANAGER', 'ENGINEERING_ACCEPTANCE_REVIEW'),

    ('ENGINEER', 'engineering'),
    ('ENGINEER', 'engineering:dashboard'),
    ('ENGINEER', 'engineering:projects'),
    ('ENGINEER', 'engineering:plans'),
    ('ENGINEER', 'engineering:daily-reports'),
    ('ENGINEER', 'engineering:inspections'),
    ('ENGINEER', 'engineering:rectifications'),
    ('ENGINEER', 'engineering:acceptances'),
    ('ENGINEER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('ENGINEER', 'ENGINEERING_PROJECT_VIEW'),
    ('ENGINEER', 'ENGINEERING_PLAN_VIEW'),
    ('ENGINEER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('ENGINEER', 'ENGINEERING_INSPECTION_VIEW'),
    ('ENGINEER', 'ENGINEERING_INSPECTION_CREATE'),
    ('ENGINEER', 'ENGINEERING_INSPECTION_UPDATE'),
    ('ENGINEER', 'ENGINEERING_INSPECTION_SUBMIT'),
    ('ENGINEER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('ENGINEER', 'ENGINEERING_RECTIFICATION_RECHECK'),
    ('ENGINEER', 'ENGINEERING_ACCEPTANCE_VIEW'),
    ('ENGINEER', 'ENGINEERING_ACCEPTANCE_CREATE'),
    ('ENGINEER', 'ENGINEERING_ACCEPTANCE_SUBMIT'),

    ('SUPERVISOR', 'engineering'),
    ('SUPERVISOR', 'engineering:projects'),
    ('SUPERVISOR', 'engineering:plans'),
    ('SUPERVISOR', 'engineering:daily-reports'),
    ('SUPERVISOR', 'engineering:inspections'),
    ('SUPERVISOR', 'engineering:rectifications'),
    ('SUPERVISOR', 'engineering:acceptances'),
    ('SUPERVISOR', 'ENGINEERING_PROJECT_VIEW'),
    ('SUPERVISOR', 'ENGINEERING_PLAN_VIEW'),
    ('SUPERVISOR', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('SUPERVISOR', 'ENGINEERING_DAILY_REPORT_REVIEW'),
    ('SUPERVISOR', 'ENGINEERING_INSPECTION_VIEW'),
    ('SUPERVISOR', 'ENGINEERING_INSPECTION_CREATE'),
    ('SUPERVISOR', 'ENGINEERING_INSPECTION_UPDATE'),
    ('SUPERVISOR', 'ENGINEERING_INSPECTION_SUBMIT'),
    ('SUPERVISOR', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('SUPERVISOR', 'ENGINEERING_RECTIFICATION_RECHECK'),
    ('SUPERVISOR', 'ENGINEERING_ACCEPTANCE_VIEW'),
    ('SUPERVISOR', 'ENGINEERING_ACCEPTANCE_REVIEW'),

    ('CONTRACTOR_MANAGER', 'engineering'),
    ('CONTRACTOR_MANAGER', 'engineering:projects'),
    ('CONTRACTOR_MANAGER', 'engineering:plans'),
    ('CONTRACTOR_MANAGER', 'engineering:daily-reports'),
    ('CONTRACTOR_MANAGER', 'engineering:rectifications'),
    ('CONTRACTOR_MANAGER', 'ENGINEERING_PROJECT_VIEW'),
    ('CONTRACTOR_MANAGER', 'ENGINEERING_PLAN_VIEW'),
    ('CONTRACTOR_MANAGER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('CONTRACTOR_MANAGER', 'ENGINEERING_DAILY_REPORT_CREATE'),
    ('CONTRACTOR_MANAGER', 'ENGINEERING_DAILY_REPORT_UPDATE'),
    ('CONTRACTOR_MANAGER', 'ENGINEERING_DAILY_REPORT_SUBMIT'),
    ('CONTRACTOR_MANAGER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('CONTRACTOR_MANAGER', 'ENGINEERING_RECTIFICATION_UPDATE'),
    ('CONTRACTOR_MANAGER', 'ENGINEERING_RECTIFICATION_SUBMIT'),

    ('PROPERTY_MANAGER', 'engineering'),
    ('PROPERTY_MANAGER', 'engineering:dashboard'),
    ('PROPERTY_MANAGER', 'engineering:projects'),
    ('PROPERTY_MANAGER', 'engineering:acceptances'),
    ('PROPERTY_MANAGER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('PROPERTY_MANAGER', 'ENGINEERING_PROJECT_VIEW'),
    ('PROPERTY_MANAGER', 'ENGINEERING_ACCEPTANCE_VIEW'),

    ('FINANCE_USER', 'engineering'),
    ('FINANCE_USER', 'engineering:projects'),
    ('FINANCE_USER', 'ENGINEERING_PROJECT_VIEW'),

    ('AUDITOR', 'engineering'),
    ('AUDITOR', 'engineering:dashboard'),
    ('AUDITOR', 'engineering:projects'),
    ('AUDITOR', 'engineering:plans'),
    ('AUDITOR', 'engineering:daily-reports'),
    ('AUDITOR', 'engineering:inspections'),
    ('AUDITOR', 'engineering:rectifications'),
    ('AUDITOR', 'engineering:acceptances'),
    ('AUDITOR', 'ENGINEERING_DASHBOARD_VIEW'),
    ('AUDITOR', 'ENGINEERING_PROJECT_VIEW'),
    ('AUDITOR', 'ENGINEERING_PLAN_VIEW'),
    ('AUDITOR', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('AUDITOR', 'ENGINEERING_INSPECTION_VIEW'),
    ('AUDITOR', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('AUDITOR', 'ENGINEERING_ACCEPTANCE_VIEW')
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
       'EPDR Phase 1 engineering role permission seed'
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
