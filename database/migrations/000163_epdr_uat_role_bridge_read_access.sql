-- Bridge EPDR Phase 1 runtime visibility into real operational roles used by Jinhu UAT.
-- These roles receive read-only engineering menu/page/view access so the production-facing
-- frontend can surface the entire engineering runtime without prematurely opening write flows.

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('PROPERTY_MANAGER', 'engineering'),
    ('PROPERTY_MANAGER', 'engineering:dashboard'),
    ('PROPERTY_MANAGER', 'engineering:projects'),
    ('PROPERTY_MANAGER', 'engineering:plans'),
    ('PROPERTY_MANAGER', 'engineering:daily-reports'),
    ('PROPERTY_MANAGER', 'engineering:inspections'),
    ('PROPERTY_MANAGER', 'engineering:rectifications'),
    ('PROPERTY_MANAGER', 'engineering:acceptances'),
    ('PROPERTY_MANAGER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('PROPERTY_MANAGER', 'ENGINEERING_PROJECT_VIEW'),
    ('PROPERTY_MANAGER', 'ENGINEERING_PLAN_VIEW'),
    ('PROPERTY_MANAGER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('PROPERTY_MANAGER', 'ENGINEERING_INSPECTION_VIEW'),
    ('PROPERTY_MANAGER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('PROPERTY_MANAGER', 'ENGINEERING_ACCEPTANCE_VIEW'),

    ('PROPERTY_STAFF', 'engineering'),
    ('PROPERTY_STAFF', 'engineering:dashboard'),
    ('PROPERTY_STAFF', 'engineering:projects'),
    ('PROPERTY_STAFF', 'engineering:plans'),
    ('PROPERTY_STAFF', 'engineering:daily-reports'),
    ('PROPERTY_STAFF', 'engineering:inspections'),
    ('PROPERTY_STAFF', 'engineering:rectifications'),
    ('PROPERTY_STAFF', 'engineering:acceptances'),
    ('PROPERTY_STAFF', 'ENGINEERING_DASHBOARD_VIEW'),
    ('PROPERTY_STAFF', 'ENGINEERING_PROJECT_VIEW'),
    ('PROPERTY_STAFF', 'ENGINEERING_PLAN_VIEW'),
    ('PROPERTY_STAFF', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('PROPERTY_STAFF', 'ENGINEERING_INSPECTION_VIEW'),
    ('PROPERTY_STAFF', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('PROPERTY_STAFF', 'ENGINEERING_ACCEPTANCE_VIEW'),

    ('MAINTENANCE_ENGINEER', 'engineering'),
    ('MAINTENANCE_ENGINEER', 'engineering:dashboard'),
    ('MAINTENANCE_ENGINEER', 'engineering:projects'),
    ('MAINTENANCE_ENGINEER', 'engineering:plans'),
    ('MAINTENANCE_ENGINEER', 'engineering:daily-reports'),
    ('MAINTENANCE_ENGINEER', 'engineering:inspections'),
    ('MAINTENANCE_ENGINEER', 'engineering:rectifications'),
    ('MAINTENANCE_ENGINEER', 'engineering:acceptances'),
    ('MAINTENANCE_ENGINEER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('MAINTENANCE_ENGINEER', 'ENGINEERING_PROJECT_VIEW'),
    ('MAINTENANCE_ENGINEER', 'ENGINEERING_PLAN_VIEW'),
    ('MAINTENANCE_ENGINEER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('MAINTENANCE_ENGINEER', 'ENGINEERING_INSPECTION_VIEW'),
    ('MAINTENANCE_ENGINEER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('MAINTENANCE_ENGINEER', 'ENGINEERING_ACCEPTANCE_VIEW'),

    ('SAFETY_MANAGER', 'engineering'),
    ('SAFETY_MANAGER', 'engineering:dashboard'),
    ('SAFETY_MANAGER', 'engineering:projects'),
    ('SAFETY_MANAGER', 'engineering:plans'),
    ('SAFETY_MANAGER', 'engineering:daily-reports'),
    ('SAFETY_MANAGER', 'engineering:inspections'),
    ('SAFETY_MANAGER', 'engineering:rectifications'),
    ('SAFETY_MANAGER', 'engineering:acceptances'),
    ('SAFETY_MANAGER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('SAFETY_MANAGER', 'ENGINEERING_PROJECT_VIEW'),
    ('SAFETY_MANAGER', 'ENGINEERING_PLAN_VIEW'),
    ('SAFETY_MANAGER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('SAFETY_MANAGER', 'ENGINEERING_INSPECTION_VIEW'),
    ('SAFETY_MANAGER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('SAFETY_MANAGER', 'ENGINEERING_ACCEPTANCE_VIEW'),

    ('IOT_MANAGER', 'engineering'),
    ('IOT_MANAGER', 'engineering:dashboard'),
    ('IOT_MANAGER', 'engineering:projects'),
    ('IOT_MANAGER', 'engineering:plans'),
    ('IOT_MANAGER', 'engineering:daily-reports'),
    ('IOT_MANAGER', 'engineering:inspections'),
    ('IOT_MANAGER', 'engineering:rectifications'),
    ('IOT_MANAGER', 'engineering:acceptances'),
    ('IOT_MANAGER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('IOT_MANAGER', 'ENGINEERING_PROJECT_VIEW'),
    ('IOT_MANAGER', 'ENGINEERING_PLAN_VIEW'),
    ('IOT_MANAGER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('IOT_MANAGER', 'ENGINEERING_INSPECTION_VIEW'),
    ('IOT_MANAGER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('IOT_MANAGER', 'ENGINEERING_ACCEPTANCE_VIEW'),

    ('IOT_OPERATOR', 'engineering'),
    ('IOT_OPERATOR', 'engineering:dashboard'),
    ('IOT_OPERATOR', 'engineering:projects'),
    ('IOT_OPERATOR', 'engineering:plans'),
    ('IOT_OPERATOR', 'engineering:daily-reports'),
    ('IOT_OPERATOR', 'engineering:inspections'),
    ('IOT_OPERATOR', 'engineering:rectifications'),
    ('IOT_OPERATOR', 'engineering:acceptances'),
    ('IOT_OPERATOR', 'ENGINEERING_DASHBOARD_VIEW'),
    ('IOT_OPERATOR', 'ENGINEERING_PROJECT_VIEW'),
    ('IOT_OPERATOR', 'ENGINEERING_PLAN_VIEW'),
    ('IOT_OPERATOR', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('IOT_OPERATOR', 'ENGINEERING_INSPECTION_VIEW'),
    ('IOT_OPERATOR', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('IOT_OPERATOR', 'ENGINEERING_ACCEPTANCE_VIEW'),

    ('FINANCE_MANAGER', 'engineering'),
    ('FINANCE_MANAGER', 'engineering:dashboard'),
    ('FINANCE_MANAGER', 'engineering:projects'),
    ('FINANCE_MANAGER', 'engineering:plans'),
    ('FINANCE_MANAGER', 'engineering:daily-reports'),
    ('FINANCE_MANAGER', 'engineering:inspections'),
    ('FINANCE_MANAGER', 'engineering:rectifications'),
    ('FINANCE_MANAGER', 'engineering:acceptances'),
    ('FINANCE_MANAGER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('FINANCE_MANAGER', 'ENGINEERING_PROJECT_VIEW'),
    ('FINANCE_MANAGER', 'ENGINEERING_PLAN_VIEW'),
    ('FINANCE_MANAGER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('FINANCE_MANAGER', 'ENGINEERING_INSPECTION_VIEW'),
    ('FINANCE_MANAGER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('FINANCE_MANAGER', 'ENGINEERING_ACCEPTANCE_VIEW'),

    ('INVEST_MANAGER', 'engineering'),
    ('INVEST_MANAGER', 'engineering:dashboard'),
    ('INVEST_MANAGER', 'engineering:projects'),
    ('INVEST_MANAGER', 'engineering:plans'),
    ('INVEST_MANAGER', 'engineering:daily-reports'),
    ('INVEST_MANAGER', 'engineering:inspections'),
    ('INVEST_MANAGER', 'engineering:rectifications'),
    ('INVEST_MANAGER', 'engineering:acceptances'),
    ('INVEST_MANAGER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('INVEST_MANAGER', 'ENGINEERING_PROJECT_VIEW'),
    ('INVEST_MANAGER', 'ENGINEERING_PLAN_VIEW'),
    ('INVEST_MANAGER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('INVEST_MANAGER', 'ENGINEERING_INSPECTION_VIEW'),
    ('INVEST_MANAGER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('INVEST_MANAGER', 'ENGINEERING_ACCEPTANCE_VIEW')
),
resolved_permissions AS (
  SELECT
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
    remark = 'EPDR read-only role bridge for production UAT'
FROM resolved_permissions resolved
WHERE existing.tenant_id = resolved.tenant_id
  AND existing.park_id = resolved.park_id
  AND existing.role_id = resolved.role_id
  AND existing.permission_id = resolved.permission_id;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('PROPERTY_MANAGER', 'engineering'),
    ('PROPERTY_MANAGER', 'engineering:dashboard'),
    ('PROPERTY_MANAGER', 'engineering:projects'),
    ('PROPERTY_MANAGER', 'engineering:plans'),
    ('PROPERTY_MANAGER', 'engineering:daily-reports'),
    ('PROPERTY_MANAGER', 'engineering:inspections'),
    ('PROPERTY_MANAGER', 'engineering:rectifications'),
    ('PROPERTY_MANAGER', 'engineering:acceptances'),
    ('PROPERTY_MANAGER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('PROPERTY_MANAGER', 'ENGINEERING_PROJECT_VIEW'),
    ('PROPERTY_MANAGER', 'ENGINEERING_PLAN_VIEW'),
    ('PROPERTY_MANAGER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('PROPERTY_MANAGER', 'ENGINEERING_INSPECTION_VIEW'),
    ('PROPERTY_MANAGER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('PROPERTY_MANAGER', 'ENGINEERING_ACCEPTANCE_VIEW'),

    ('PROPERTY_STAFF', 'engineering'),
    ('PROPERTY_STAFF', 'engineering:dashboard'),
    ('PROPERTY_STAFF', 'engineering:projects'),
    ('PROPERTY_STAFF', 'engineering:plans'),
    ('PROPERTY_STAFF', 'engineering:daily-reports'),
    ('PROPERTY_STAFF', 'engineering:inspections'),
    ('PROPERTY_STAFF', 'engineering:rectifications'),
    ('PROPERTY_STAFF', 'engineering:acceptances'),
    ('PROPERTY_STAFF', 'ENGINEERING_DASHBOARD_VIEW'),
    ('PROPERTY_STAFF', 'ENGINEERING_PROJECT_VIEW'),
    ('PROPERTY_STAFF', 'ENGINEERING_PLAN_VIEW'),
    ('PROPERTY_STAFF', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('PROPERTY_STAFF', 'ENGINEERING_INSPECTION_VIEW'),
    ('PROPERTY_STAFF', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('PROPERTY_STAFF', 'ENGINEERING_ACCEPTANCE_VIEW'),

    ('MAINTENANCE_ENGINEER', 'engineering'),
    ('MAINTENANCE_ENGINEER', 'engineering:dashboard'),
    ('MAINTENANCE_ENGINEER', 'engineering:projects'),
    ('MAINTENANCE_ENGINEER', 'engineering:plans'),
    ('MAINTENANCE_ENGINEER', 'engineering:daily-reports'),
    ('MAINTENANCE_ENGINEER', 'engineering:inspections'),
    ('MAINTENANCE_ENGINEER', 'engineering:rectifications'),
    ('MAINTENANCE_ENGINEER', 'engineering:acceptances'),
    ('MAINTENANCE_ENGINEER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('MAINTENANCE_ENGINEER', 'ENGINEERING_PROJECT_VIEW'),
    ('MAINTENANCE_ENGINEER', 'ENGINEERING_PLAN_VIEW'),
    ('MAINTENANCE_ENGINEER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('MAINTENANCE_ENGINEER', 'ENGINEERING_INSPECTION_VIEW'),
    ('MAINTENANCE_ENGINEER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('MAINTENANCE_ENGINEER', 'ENGINEERING_ACCEPTANCE_VIEW'),

    ('SAFETY_MANAGER', 'engineering'),
    ('SAFETY_MANAGER', 'engineering:dashboard'),
    ('SAFETY_MANAGER', 'engineering:projects'),
    ('SAFETY_MANAGER', 'engineering:plans'),
    ('SAFETY_MANAGER', 'engineering:daily-reports'),
    ('SAFETY_MANAGER', 'engineering:inspections'),
    ('SAFETY_MANAGER', 'engineering:rectifications'),
    ('SAFETY_MANAGER', 'engineering:acceptances'),
    ('SAFETY_MANAGER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('SAFETY_MANAGER', 'ENGINEERING_PROJECT_VIEW'),
    ('SAFETY_MANAGER', 'ENGINEERING_PLAN_VIEW'),
    ('SAFETY_MANAGER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('SAFETY_MANAGER', 'ENGINEERING_INSPECTION_VIEW'),
    ('SAFETY_MANAGER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('SAFETY_MANAGER', 'ENGINEERING_ACCEPTANCE_VIEW'),

    ('IOT_MANAGER', 'engineering'),
    ('IOT_MANAGER', 'engineering:dashboard'),
    ('IOT_MANAGER', 'engineering:projects'),
    ('IOT_MANAGER', 'engineering:plans'),
    ('IOT_MANAGER', 'engineering:daily-reports'),
    ('IOT_MANAGER', 'engineering:inspections'),
    ('IOT_MANAGER', 'engineering:rectifications'),
    ('IOT_MANAGER', 'engineering:acceptances'),
    ('IOT_MANAGER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('IOT_MANAGER', 'ENGINEERING_PROJECT_VIEW'),
    ('IOT_MANAGER', 'ENGINEERING_PLAN_VIEW'),
    ('IOT_MANAGER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('IOT_MANAGER', 'ENGINEERING_INSPECTION_VIEW'),
    ('IOT_MANAGER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('IOT_MANAGER', 'ENGINEERING_ACCEPTANCE_VIEW'),

    ('IOT_OPERATOR', 'engineering'),
    ('IOT_OPERATOR', 'engineering:dashboard'),
    ('IOT_OPERATOR', 'engineering:projects'),
    ('IOT_OPERATOR', 'engineering:plans'),
    ('IOT_OPERATOR', 'engineering:daily-reports'),
    ('IOT_OPERATOR', 'engineering:inspections'),
    ('IOT_OPERATOR', 'engineering:rectifications'),
    ('IOT_OPERATOR', 'engineering:acceptances'),
    ('IOT_OPERATOR', 'ENGINEERING_DASHBOARD_VIEW'),
    ('IOT_OPERATOR', 'ENGINEERING_PROJECT_VIEW'),
    ('IOT_OPERATOR', 'ENGINEERING_PLAN_VIEW'),
    ('IOT_OPERATOR', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('IOT_OPERATOR', 'ENGINEERING_INSPECTION_VIEW'),
    ('IOT_OPERATOR', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('IOT_OPERATOR', 'ENGINEERING_ACCEPTANCE_VIEW'),

    ('FINANCE_MANAGER', 'engineering'),
    ('FINANCE_MANAGER', 'engineering:dashboard'),
    ('FINANCE_MANAGER', 'engineering:projects'),
    ('FINANCE_MANAGER', 'engineering:plans'),
    ('FINANCE_MANAGER', 'engineering:daily-reports'),
    ('FINANCE_MANAGER', 'engineering:inspections'),
    ('FINANCE_MANAGER', 'engineering:rectifications'),
    ('FINANCE_MANAGER', 'engineering:acceptances'),
    ('FINANCE_MANAGER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('FINANCE_MANAGER', 'ENGINEERING_PROJECT_VIEW'),
    ('FINANCE_MANAGER', 'ENGINEERING_PLAN_VIEW'),
    ('FINANCE_MANAGER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('FINANCE_MANAGER', 'ENGINEERING_INSPECTION_VIEW'),
    ('FINANCE_MANAGER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('FINANCE_MANAGER', 'ENGINEERING_ACCEPTANCE_VIEW'),

    ('INVEST_MANAGER', 'engineering'),
    ('INVEST_MANAGER', 'engineering:dashboard'),
    ('INVEST_MANAGER', 'engineering:projects'),
    ('INVEST_MANAGER', 'engineering:plans'),
    ('INVEST_MANAGER', 'engineering:daily-reports'),
    ('INVEST_MANAGER', 'engineering:inspections'),
    ('INVEST_MANAGER', 'engineering:rectifications'),
    ('INVEST_MANAGER', 'engineering:acceptances'),
    ('INVEST_MANAGER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('INVEST_MANAGER', 'ENGINEERING_PROJECT_VIEW'),
    ('INVEST_MANAGER', 'ENGINEERING_PLAN_VIEW'),
    ('INVEST_MANAGER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('INVEST_MANAGER', 'ENGINEERING_INSPECTION_VIEW'),
    ('INVEST_MANAGER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('INVEST_MANAGER', 'ENGINEERING_ACCEPTANCE_VIEW')
),
resolved_permissions AS (
  SELECT
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
  'EPDR read-only role bridge for production UAT'
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
