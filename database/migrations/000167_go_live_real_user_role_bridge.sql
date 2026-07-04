-- 2026-07-06 go-live P0 bridge:
-- The production UAT users are bound to existing operational roles such as
-- PROPERTY_MANAGER / MAINTENANCE_ENGINEER / FINANCE_MANAGER rather than the
-- newer JH_* decision roles. This migration grants the minimum role-based
-- menus and actions needed for Monday production operation without using
-- personal user-id allowlists.

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
common_visibility(permission_code) AS (
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
    ('ENGINEERING_ACCEPTANCE_VIEW'),
    ('safety:operations-terminal'),
    ('safety_inspect_task:my'),
    ('workorder:read'),
    ('workorder_log:read'),
    ('file:read')
),
management_decision(permission_code) AS (
  VALUES
    ('ENGINEERING_PROJECT_CREATE'),
    ('ENGINEERING_PROJECT_UPDATE'),
    ('ENGINEERING_PROJECT_SUBMIT'),
    ('ENGINEERING_PROJECT_APPROVE'),
    ('ENGINEERING_PROJECT_CANCEL'),
    ('ENGINEERING_PROJECT_CLOSE'),
    ('ENGINEERING_PLAN_CREATE'),
    ('ENGINEERING_PLAN_UPDATE'),
    ('ENGINEERING_PLAN_APPROVE'),
    ('ENGINEERING_DAILY_REPORT_REVIEW'),
    ('ENGINEERING_INSPECTION_CREATE'),
    ('ENGINEERING_INSPECTION_UPDATE'),
    ('ENGINEERING_INSPECTION_SUBMIT'),
    ('ENGINEERING_RECTIFICATION_ASSIGN'),
    ('ENGINEERING_RECTIFICATION_UPDATE'),
    ('ENGINEERING_RECTIFICATION_RECHECK'),
    ('ENGINEERING_RECTIFICATION_CLOSE'),
    ('ENGINEERING_ACCEPTANCE_CREATE'),
    ('ENGINEERING_ACCEPTANCE_UPDATE'),
    ('ENGINEERING_ACCEPTANCE_REVIEW'),
    ('ENGINEERING_ACCEPTANCE_CLOSE'),
    ('workorder:create'),
    ('workorder:assign'),
    ('workorder:confirm'),
    ('workorder:evaluate'),
    ('workorder_log:create'),
    ('safety_hazard:read'),
    ('safety_hazard:create'),
    ('safety_hazard:update'),
    ('safety_hazard:assign_rectify'),
    ('safety_hazard:rectify'),
    ('safety_hazard:recheck'),
    ('safety_hazard:close'),
    ('safety_hazard:manage_all'),
    ('file:upload')
),
field_execution(permission_code) AS (
  VALUES
    ('ENGINEERING_DAILY_REPORT_CREATE'),
    ('ENGINEERING_DAILY_REPORT_UPDATE'),
    ('ENGINEERING_DAILY_REPORT_SUBMIT'),
    ('ENGINEERING_INSPECTION_CREATE'),
    ('ENGINEERING_INSPECTION_UPDATE'),
    ('ENGINEERING_INSPECTION_SUBMIT'),
    ('ENGINEERING_RECTIFICATION_UPDATE'),
    ('ENGINEERING_RECTIFICATION_SUBMIT'),
    ('workorder:create'),
    ('workorder_log:create'),
    ('safety_hazard:read'),
    ('safety_hazard:create'),
    ('safety_hazard:rectify'),
    ('file:upload')
),
finance_review(permission_code) AS (
  VALUES
    ('ENGINEERING_ACCEPTANCE_REVIEW'),
    ('ENGINEERING_DAILY_REPORT_REVIEW'),
    ('leasing_contract:read'),
    ('leasing_receivable:read'),
    ('leasing_payment:read'),
    ('leasing_invoice:read')
),
investment_operation(permission_code) AS (
  VALUES
    ('park_tenant:read'),
    ('park_tenant:360'),
    ('leasing_lead:read'),
    ('leasing_lead:create'),
    ('leasing_lead:update'),
    ('leasing_follow:read'),
    ('leasing_follow:create'),
    ('leasing_contract:read'),
    ('workorder:create'),
    ('workorder_log:create')
),
role_permissions(role_code, permission_code) AS (
  SELECT role_code, permission_code
  FROM (VALUES
    ('PROPERTY_MANAGER'),
    ('SAFETY_MANAGER'),
    ('IOT_MANAGER')
  ) roles(role_code)
  CROSS JOIN (
    SELECT permission_code FROM common_visibility
    UNION
    SELECT permission_code FROM management_decision
  ) permissions

  UNION

  SELECT role_code, permission_code
  FROM (VALUES
    ('MAINTENANCE_ENGINEER'),
    ('PROPERTY_STAFF'),
    ('IOT_OPERATOR')
  ) roles(role_code)
  CROSS JOIN (
    SELECT permission_code FROM common_visibility
    UNION
    SELECT permission_code FROM field_execution
  ) permissions

  UNION

  SELECT 'FINANCE_MANAGER', permission_code
  FROM (
    SELECT permission_code FROM common_visibility
    UNION
    SELECT permission_code FROM finance_review
  ) permissions

  UNION

  SELECT 'INVEST_MANAGER', permission_code
  FROM (
    SELECT permission_code FROM common_visibility
    UNION
    SELECT permission_code FROM investment_operation
  ) permissions
),
resolved AS (
  SELECT DISTINCT
    seed_scope.tenant_id,
    seed_scope.park_id,
    role.id AS role_id,
    permission.id AS permission_id
  FROM role_permissions
  CROSS JOIN seed_scope
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
)
INSERT INTO rel_role_perm (
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
  tenant_id,
  park_id,
  role_id,
  permission_id,
  now(),
  now(),
  false,
  1,
  '2026-07-06 go-live real user role bridge'
FROM resolved
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false,
  remark = EXCLUDED.remark,
  update_time = now();
