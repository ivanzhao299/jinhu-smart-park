-- Go-live decision authority hardening for 2026-07-06.
-- Purpose:
-- 1. Make real Jinhu duty-document roles see the engineering runtime in production.
-- 2. Separate decision/approval authority from field execution authority.
-- 3. Keep the patch idempotent and limited to role-permission links.

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
engineering_view_permissions(permission_code) AS (
  VALUES
    ('engineering'),
    ('engineering:dashboard'),
    ('engineering:projects'),
    ('engineering:plans'),
    ('engineering:daily-reports'),
    ('engineering:inspections'),
    ('engineering:rectifications'),
    ('engineering:acceptances'),
    ('ENGINEERING_DASHBOARD_VIEW'),
    ('ENGINEERING_PROJECT_VIEW'),
    ('ENGINEERING_PLAN_VIEW'),
    ('ENGINEERING_DAILY_REPORT_VIEW'),
    ('ENGINEERING_INSPECTION_VIEW'),
    ('ENGINEERING_RECTIFICATION_VIEW'),
    ('ENGINEERING_ACCEPTANCE_VIEW')
),
engineering_project_decision_permissions(permission_code) AS (
  VALUES
    ('ENGINEERING_PROJECT_CREATE'),
    ('ENGINEERING_PROJECT_UPDATE'),
    ('ENGINEERING_PROJECT_SUBMIT'),
    ('ENGINEERING_PROJECT_APPROVE'),
    ('ENGINEERING_PROJECT_CANCEL'),
    ('ENGINEERING_PROJECT_CLOSE'),
    ('ENGINEERING_PROJECT_ARCHIVE'),
    ('ENGINEERING_PLAN_CREATE'),
    ('ENGINEERING_PLAN_UPDATE'),
    ('ENGINEERING_PLAN_APPROVE'),
    ('ENGINEERING_DAILY_REPORT_REVIEW'),
    ('ENGINEERING_INSPECTION_UPDATE'),
    ('ENGINEERING_RECTIFICATION_ASSIGN'),
    ('ENGINEERING_RECTIFICATION_RECHECK'),
    ('ENGINEERING_RECTIFICATION_CLOSE'),
    ('ENGINEERING_ACCEPTANCE_CREATE'),
    ('ENGINEERING_ACCEPTANCE_UPDATE'),
    ('ENGINEERING_ACCEPTANCE_SUBMIT'),
    ('ENGINEERING_ACCEPTANCE_REVIEW'),
    ('ENGINEERING_ACCEPTANCE_CLOSE')
),
engineering_field_execution_permissions(permission_code) AS (
  VALUES
    ('ENGINEERING_DAILY_REPORT_CREATE'),
    ('ENGINEERING_DAILY_REPORT_UPDATE'),
    ('ENGINEERING_DAILY_REPORT_SUBMIT'),
    ('ENGINEERING_INSPECTION_CREATE'),
    ('ENGINEERING_INSPECTION_UPDATE'),
    ('ENGINEERING_INSPECTION_SUBMIT'),
    ('ENGINEERING_RECTIFICATION_UPDATE'),
    ('ENGINEERING_RECTIFICATION_SUBMIT')
),
property_service_permissions(permission_code) AS (
  VALUES
    ('workorder:read'),
    ('workorder:create'),
    ('workorder:assign'),
    ('workorder:process'),
    ('workorder:confirm'),
    ('workorder:evaluate'),
    ('workorder:stats'),
    ('workorder:manage_all'),
    ('workorder_log:read'),
    ('workorder_log:create'),
    ('safety_hazard:read'),
    ('safety_hazard:create'),
    ('safety_hazard:rectify'),
    ('safety_hazard:recheck'),
    ('safety_hazard:close'),
    ('safety_hazard:manage_all'),
    ('safety_inspect_task:read'),
    ('safety_inspect_task:my'),
    ('safety_inspect_task:manage_all'),
    ('file:read'),
    ('file:upload'),
    ('file:download')
),
role_permissions(role_code, permission_code) AS (
  -- Group leadership: can see the full production picture and approve/close major engineering nodes.
  SELECT 'JH_GROUP_PRESIDENT', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_GROUP_PRESIDENT', permission_code FROM engineering_project_decision_permissions
  UNION ALL SELECT 'JH_GROUP_VP', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_GROUP_VP', permission_code FROM engineering_project_decision_permissions

  -- Engineering/property head: owns engineering and property operation decisions.
  UNION ALL SELECT 'JH_ENGINEERING_PROPERTY_MANAGER', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_ENGINEERING_PROPERTY_MANAGER', permission_code FROM engineering_project_decision_permissions
  UNION ALL SELECT 'JH_ENGINEERING_PROPERTY_MANAGER', permission_code FROM engineering_field_execution_permissions
  UNION ALL SELECT 'JH_ENGINEERING_PROPERTY_MANAGER', permission_code FROM property_service_permissions

  -- Project manager: can create/update/submit project execution records and close project-loop tasks.
  UNION ALL SELECT 'JH_ENGINEERING_PROJECT_MANAGER', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_ENGINEERING_PROJECT_MANAGER', permission_code FROM engineering_field_execution_permissions
  UNION ALL SELECT 'JH_ENGINEERING_PROJECT_MANAGER', permission_code
  FROM (VALUES
    ('ENGINEERING_PROJECT_CREATE'),
    ('ENGINEERING_PROJECT_UPDATE'),
    ('ENGINEERING_PROJECT_SUBMIT'),
    ('ENGINEERING_PLAN_CREATE'),
    ('ENGINEERING_PLAN_UPDATE'),
    ('ENGINEERING_INSPECTION_UPDATE'),
    ('ENGINEERING_RECTIFICATION_ASSIGN'),
    ('ENGINEERING_RECTIFICATION_RECHECK'),
    ('ENGINEERING_RECTIFICATION_CLOSE'),
    ('ENGINEERING_ACCEPTANCE_CREATE'),
    ('ENGINEERING_ACCEPTANCE_SUBMIT'),
    ('file:read'),
    ('file:upload'),
    ('file:download')
  ) permissions(permission_code)

  -- Installation engineer: field execution only; approvals stay with manager/director roles.
  UNION ALL SELECT 'JH_INSTALLATION_ENGINEER', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_INSTALLATION_ENGINEER', permission_code FROM engineering_field_execution_permissions
  UNION ALL SELECT 'JH_INSTALLATION_ENGINEER', permission_code
  FROM (VALUES ('file:read'), ('file:upload'), ('file:download')) permissions(permission_code)

  -- Property site manager: service acceptance and field handover participant.
  UNION ALL SELECT 'JH_PROPERTY_SITE_MANAGER', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_PROPERTY_SITE_MANAGER', permission_code
  FROM (VALUES
    ('ENGINEERING_RECTIFICATION_UPDATE'),
    ('ENGINEERING_RECTIFICATION_SUBMIT'),
    ('ENGINEERING_ACCEPTANCE_VIEW'),
    ('workorder:read'),
    ('workorder:create'),
    ('workorder:assign'),
    ('workorder:process'),
    ('workorder:confirm'),
    ('workorder:evaluate'),
    ('workorder_log:read'),
    ('workorder_log:create'),
    ('file:read'),
    ('file:upload'),
    ('file:download')
  ) permissions(permission_code)

  -- Finance and leasing leaders need read authority for production decision meetings.
  UNION ALL SELECT 'JH_FINANCE_MANAGER', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_FINANCE_DEPUTY', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_LEASING_LEAD', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_SUBSIDIARY_MANAGER', permission_code FROM engineering_view_permissions
),
resolved_permissions AS (
  SELECT DISTINCT
    role.tenant_id,
    role.park_id,
    role.id AS role_id,
    permission.id AS permission_id
  FROM seed_scope
  JOIN role_permissions role_permission ON true
  JOIN sys_role role
    ON role.tenant_id = seed_scope.tenant_id
   AND role.park_id = seed_scope.park_id
   AND role.code = role_permission.role_code
   AND role.is_deleted = false
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.code = role_permission.permission_code
   AND permission.is_deleted = false
)
UPDATE rel_role_perm existing
SET is_deleted = false,
    update_time = now(),
    remark = '2026-07-06 go-live decision authority hardening'
FROM resolved_permissions resolved
WHERE existing.tenant_id = resolved.tenant_id
  AND existing.park_id = resolved.park_id
  AND existing.role_id = resolved.role_id
  AND existing.permission_id = resolved.permission_id;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
engineering_view_permissions(permission_code) AS (
  VALUES
    ('engineering'),
    ('engineering:dashboard'),
    ('engineering:projects'),
    ('engineering:plans'),
    ('engineering:daily-reports'),
    ('engineering:inspections'),
    ('engineering:rectifications'),
    ('engineering:acceptances'),
    ('ENGINEERING_DASHBOARD_VIEW'),
    ('ENGINEERING_PROJECT_VIEW'),
    ('ENGINEERING_PLAN_VIEW'),
    ('ENGINEERING_DAILY_REPORT_VIEW'),
    ('ENGINEERING_INSPECTION_VIEW'),
    ('ENGINEERING_RECTIFICATION_VIEW'),
    ('ENGINEERING_ACCEPTANCE_VIEW')
),
engineering_project_decision_permissions(permission_code) AS (
  VALUES
    ('ENGINEERING_PROJECT_CREATE'),
    ('ENGINEERING_PROJECT_UPDATE'),
    ('ENGINEERING_PROJECT_SUBMIT'),
    ('ENGINEERING_PROJECT_APPROVE'),
    ('ENGINEERING_PROJECT_CANCEL'),
    ('ENGINEERING_PROJECT_CLOSE'),
    ('ENGINEERING_PROJECT_ARCHIVE'),
    ('ENGINEERING_PLAN_CREATE'),
    ('ENGINEERING_PLAN_UPDATE'),
    ('ENGINEERING_PLAN_APPROVE'),
    ('ENGINEERING_DAILY_REPORT_REVIEW'),
    ('ENGINEERING_INSPECTION_UPDATE'),
    ('ENGINEERING_RECTIFICATION_ASSIGN'),
    ('ENGINEERING_RECTIFICATION_RECHECK'),
    ('ENGINEERING_RECTIFICATION_CLOSE'),
    ('ENGINEERING_ACCEPTANCE_CREATE'),
    ('ENGINEERING_ACCEPTANCE_UPDATE'),
    ('ENGINEERING_ACCEPTANCE_SUBMIT'),
    ('ENGINEERING_ACCEPTANCE_REVIEW'),
    ('ENGINEERING_ACCEPTANCE_CLOSE')
),
engineering_field_execution_permissions(permission_code) AS (
  VALUES
    ('ENGINEERING_DAILY_REPORT_CREATE'),
    ('ENGINEERING_DAILY_REPORT_UPDATE'),
    ('ENGINEERING_DAILY_REPORT_SUBMIT'),
    ('ENGINEERING_INSPECTION_CREATE'),
    ('ENGINEERING_INSPECTION_UPDATE'),
    ('ENGINEERING_INSPECTION_SUBMIT'),
    ('ENGINEERING_RECTIFICATION_UPDATE'),
    ('ENGINEERING_RECTIFICATION_SUBMIT')
),
property_service_permissions(permission_code) AS (
  VALUES
    ('workorder:read'),
    ('workorder:create'),
    ('workorder:assign'),
    ('workorder:process'),
    ('workorder:confirm'),
    ('workorder:evaluate'),
    ('workorder:stats'),
    ('workorder:manage_all'),
    ('workorder_log:read'),
    ('workorder_log:create'),
    ('safety_hazard:read'),
    ('safety_hazard:create'),
    ('safety_hazard:rectify'),
    ('safety_hazard:recheck'),
    ('safety_hazard:close'),
    ('safety_hazard:manage_all'),
    ('safety_inspect_task:read'),
    ('safety_inspect_task:my'),
    ('safety_inspect_task:manage_all'),
    ('file:read'),
    ('file:upload'),
    ('file:download')
),
role_permissions(role_code, permission_code) AS (
  SELECT 'JH_GROUP_PRESIDENT', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_GROUP_PRESIDENT', permission_code FROM engineering_project_decision_permissions
  UNION ALL SELECT 'JH_GROUP_VP', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_GROUP_VP', permission_code FROM engineering_project_decision_permissions
  UNION ALL SELECT 'JH_ENGINEERING_PROPERTY_MANAGER', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_ENGINEERING_PROPERTY_MANAGER', permission_code FROM engineering_project_decision_permissions
  UNION ALL SELECT 'JH_ENGINEERING_PROPERTY_MANAGER', permission_code FROM engineering_field_execution_permissions
  UNION ALL SELECT 'JH_ENGINEERING_PROPERTY_MANAGER', permission_code FROM property_service_permissions
  UNION ALL SELECT 'JH_ENGINEERING_PROJECT_MANAGER', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_ENGINEERING_PROJECT_MANAGER', permission_code FROM engineering_field_execution_permissions
  UNION ALL SELECT 'JH_ENGINEERING_PROJECT_MANAGER', permission_code FROM (VALUES
    ('ENGINEERING_PROJECT_CREATE'), ('ENGINEERING_PROJECT_UPDATE'), ('ENGINEERING_PROJECT_SUBMIT'),
    ('ENGINEERING_PLAN_CREATE'), ('ENGINEERING_PLAN_UPDATE'), ('ENGINEERING_INSPECTION_UPDATE'),
    ('ENGINEERING_RECTIFICATION_ASSIGN'), ('ENGINEERING_RECTIFICATION_RECHECK'), ('ENGINEERING_RECTIFICATION_CLOSE'),
    ('ENGINEERING_ACCEPTANCE_CREATE'), ('ENGINEERING_ACCEPTANCE_SUBMIT'),
    ('file:read'), ('file:upload'), ('file:download')
  ) permissions(permission_code)
  UNION ALL SELECT 'JH_INSTALLATION_ENGINEER', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_INSTALLATION_ENGINEER', permission_code FROM engineering_field_execution_permissions
  UNION ALL SELECT 'JH_INSTALLATION_ENGINEER', permission_code FROM (VALUES ('file:read'), ('file:upload'), ('file:download')) permissions(permission_code)
  UNION ALL SELECT 'JH_PROPERTY_SITE_MANAGER', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_PROPERTY_SITE_MANAGER', permission_code FROM (VALUES
    ('ENGINEERING_RECTIFICATION_UPDATE'), ('ENGINEERING_RECTIFICATION_SUBMIT'), ('ENGINEERING_ACCEPTANCE_VIEW'),
    ('workorder:read'), ('workorder:create'), ('workorder:assign'), ('workorder:process'),
    ('workorder:confirm'), ('workorder:evaluate'), ('workorder_log:read'), ('workorder_log:create'),
    ('file:read'), ('file:upload'), ('file:download')
  ) permissions(permission_code)
  UNION ALL SELECT 'JH_FINANCE_MANAGER', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_FINANCE_DEPUTY', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_LEASING_LEAD', permission_code FROM engineering_view_permissions
  UNION ALL SELECT 'JH_SUBSIDIARY_MANAGER', permission_code FROM engineering_view_permissions
),
resolved_permissions AS (
  SELECT DISTINCT
    role.tenant_id,
    role.park_id,
    role.id AS role_id,
    permission.id AS permission_id
  FROM seed_scope
  JOIN role_permissions role_permission ON true
  JOIN sys_role role
    ON role.tenant_id = seed_scope.tenant_id
   AND role.park_id = seed_scope.park_id
   AND role.code = role_permission.role_code
   AND role.is_deleted = false
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.code = role_permission.permission_code
   AND permission.is_deleted = false
)
INSERT INTO rel_role_perm (
  id,
  tenant_id,
  park_id,
  role_id,
  permission_id,
  create_time,
  update_time,
  is_deleted,
  version,
  remark
)
SELECT
  uuid_generate_v4(),
  resolved.tenant_id,
  resolved.park_id,
  resolved.role_id,
  resolved.permission_id,
  now(),
  now(),
  false,
  1,
  '2026-07-06 go-live decision authority hardening'
FROM resolved_permissions resolved
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_role_perm existing
  WHERE existing.tenant_id = resolved.tenant_id
    AND existing.park_id = resolved.park_id
    AND existing.role_id = resolved.role_id
    AND existing.permission_id = resolved.permission_id
    AND existing.is_deleted = false
);
