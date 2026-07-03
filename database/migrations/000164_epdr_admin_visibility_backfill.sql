-- Backfill EPDR Phase 1 runtime visibility for real administrator roles.
-- This closes the gap where production-facing administrator principals could
-- see the tenant module enabled but still miss the engineering menu because
-- role-level engineering permissions were never granted in older scopes.

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
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SYSTEM_ADMIN', 'engineering'),
    ('SYSTEM_ADMIN', 'engineering:dashboard'),
    ('SYSTEM_ADMIN', 'engineering:projects'),
    ('SYSTEM_ADMIN', 'engineering:plans'),
    ('SYSTEM_ADMIN', 'engineering:daily-reports'),
    ('SYSTEM_ADMIN', 'engineering:inspections'),
    ('SYSTEM_ADMIN', 'engineering:rectifications'),
    ('SYSTEM_ADMIN', 'engineering:acceptances'),
    ('SYSTEM_ADMIN', 'ENGINEERING_DASHBOARD_VIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PROJECT_VIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PROJECT_CREATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PROJECT_UPDATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PROJECT_SUBMIT'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PROJECT_APPROVE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PROJECT_CANCEL'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PROJECT_CLOSE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PROJECT_ARCHIVE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PLAN_VIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PLAN_CREATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PLAN_UPDATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PLAN_APPROVE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_DAILY_REPORT_CREATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_DAILY_REPORT_UPDATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_DAILY_REPORT_SUBMIT'),
    ('SYSTEM_ADMIN', 'ENGINEERING_DAILY_REPORT_REVIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_INSPECTION_VIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_INSPECTION_CREATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_INSPECTION_UPDATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_INSPECTION_SUBMIT'),
    ('SYSTEM_ADMIN', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_RECTIFICATION_ASSIGN'),
    ('SYSTEM_ADMIN', 'ENGINEERING_RECTIFICATION_UPDATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_RECTIFICATION_SUBMIT'),
    ('SYSTEM_ADMIN', 'ENGINEERING_RECTIFICATION_RECHECK'),
    ('SYSTEM_ADMIN', 'ENGINEERING_RECTIFICATION_CLOSE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_ACCEPTANCE_VIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_ACCEPTANCE_CREATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_ACCEPTANCE_UPDATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_ACCEPTANCE_SUBMIT'),
    ('SYSTEM_ADMIN', 'ENGINEERING_ACCEPTANCE_REVIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_ACCEPTANCE_CLOSE'),

    ('PARK_GENERAL_MANAGER', 'engineering'),
    ('PARK_GENERAL_MANAGER', 'engineering:dashboard'),
    ('PARK_GENERAL_MANAGER', 'engineering:projects'),
    ('PARK_GENERAL_MANAGER', 'engineering:plans'),
    ('PARK_GENERAL_MANAGER', 'engineering:daily-reports'),
    ('PARK_GENERAL_MANAGER', 'engineering:inspections'),
    ('PARK_GENERAL_MANAGER', 'engineering:rectifications'),
    ('PARK_GENERAL_MANAGER', 'engineering:acceptances'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PROJECT_VIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PROJECT_CREATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PROJECT_UPDATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PROJECT_SUBMIT'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PROJECT_APPROVE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PROJECT_CANCEL'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PROJECT_CLOSE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PROJECT_ARCHIVE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PLAN_VIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PLAN_CREATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PLAN_UPDATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PLAN_APPROVE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_DAILY_REPORT_CREATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_DAILY_REPORT_UPDATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_DAILY_REPORT_SUBMIT'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_DAILY_REPORT_REVIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_INSPECTION_VIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_INSPECTION_CREATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_INSPECTION_UPDATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_INSPECTION_SUBMIT'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_RECTIFICATION_ASSIGN'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_RECTIFICATION_UPDATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_RECTIFICATION_SUBMIT'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_RECTIFICATION_RECHECK'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_RECTIFICATION_CLOSE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_ACCEPTANCE_VIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_ACCEPTANCE_CREATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_ACCEPTANCE_UPDATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_ACCEPTANCE_SUBMIT'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_ACCEPTANCE_REVIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_ACCEPTANCE_CLOSE')
),
resolved_permissions AS (
  SELECT
    entitled_scopes.tenant_id,
    entitled_scopes.park_id,
    role.id AS role_id,
    permission.id AS permission_id
  FROM entitled_scopes
  JOIN role_permissions
    ON true
  JOIN sys_role role
    ON role.tenant_id = entitled_scopes.tenant_id
   AND role.park_id = entitled_scopes.park_id
   AND role.code = role_permissions.role_code
   AND role.is_deleted = false
  JOIN sys_permission permission
    ON permission.tenant_id = entitled_scopes.tenant_id
   AND permission.park_id = entitled_scopes.park_id
   AND permission.code = role_permissions.permission_code
   AND permission.is_deleted = false
)
UPDATE rel_role_perm existing
SET is_deleted = false,
    update_time = now(),
    remark = 'EPDR administrator engineering visibility backfill'
FROM resolved_permissions resolved
WHERE existing.tenant_id = resolved.tenant_id
  AND existing.park_id = resolved.park_id
  AND existing.role_id = resolved.role_id
  AND existing.permission_id = resolved.permission_id;

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
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SYSTEM_ADMIN', 'engineering'),
    ('SYSTEM_ADMIN', 'engineering:dashboard'),
    ('SYSTEM_ADMIN', 'engineering:projects'),
    ('SYSTEM_ADMIN', 'engineering:plans'),
    ('SYSTEM_ADMIN', 'engineering:daily-reports'),
    ('SYSTEM_ADMIN', 'engineering:inspections'),
    ('SYSTEM_ADMIN', 'engineering:rectifications'),
    ('SYSTEM_ADMIN', 'engineering:acceptances'),
    ('SYSTEM_ADMIN', 'ENGINEERING_DASHBOARD_VIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PROJECT_VIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PROJECT_CREATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PROJECT_UPDATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PROJECT_SUBMIT'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PROJECT_APPROVE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PROJECT_CANCEL'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PROJECT_CLOSE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PROJECT_ARCHIVE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PLAN_VIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PLAN_CREATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PLAN_UPDATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_PLAN_APPROVE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_DAILY_REPORT_CREATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_DAILY_REPORT_UPDATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_DAILY_REPORT_SUBMIT'),
    ('SYSTEM_ADMIN', 'ENGINEERING_DAILY_REPORT_REVIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_INSPECTION_VIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_INSPECTION_CREATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_INSPECTION_UPDATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_INSPECTION_SUBMIT'),
    ('SYSTEM_ADMIN', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_RECTIFICATION_ASSIGN'),
    ('SYSTEM_ADMIN', 'ENGINEERING_RECTIFICATION_UPDATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_RECTIFICATION_SUBMIT'),
    ('SYSTEM_ADMIN', 'ENGINEERING_RECTIFICATION_RECHECK'),
    ('SYSTEM_ADMIN', 'ENGINEERING_RECTIFICATION_CLOSE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_ACCEPTANCE_VIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_ACCEPTANCE_CREATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_ACCEPTANCE_UPDATE'),
    ('SYSTEM_ADMIN', 'ENGINEERING_ACCEPTANCE_SUBMIT'),
    ('SYSTEM_ADMIN', 'ENGINEERING_ACCEPTANCE_REVIEW'),
    ('SYSTEM_ADMIN', 'ENGINEERING_ACCEPTANCE_CLOSE'),

    ('PARK_GENERAL_MANAGER', 'engineering'),
    ('PARK_GENERAL_MANAGER', 'engineering:dashboard'),
    ('PARK_GENERAL_MANAGER', 'engineering:projects'),
    ('PARK_GENERAL_MANAGER', 'engineering:plans'),
    ('PARK_GENERAL_MANAGER', 'engineering:daily-reports'),
    ('PARK_GENERAL_MANAGER', 'engineering:inspections'),
    ('PARK_GENERAL_MANAGER', 'engineering:rectifications'),
    ('PARK_GENERAL_MANAGER', 'engineering:acceptances'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_DASHBOARD_VIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PROJECT_VIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PROJECT_CREATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PROJECT_UPDATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PROJECT_SUBMIT'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PROJECT_APPROVE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PROJECT_CANCEL'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PROJECT_CLOSE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PROJECT_ARCHIVE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PLAN_VIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PLAN_CREATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PLAN_UPDATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_PLAN_APPROVE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_DAILY_REPORT_VIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_DAILY_REPORT_CREATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_DAILY_REPORT_UPDATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_DAILY_REPORT_SUBMIT'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_DAILY_REPORT_REVIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_INSPECTION_VIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_INSPECTION_CREATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_INSPECTION_UPDATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_INSPECTION_SUBMIT'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_RECTIFICATION_VIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_RECTIFICATION_ASSIGN'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_RECTIFICATION_UPDATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_RECTIFICATION_SUBMIT'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_RECTIFICATION_RECHECK'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_RECTIFICATION_CLOSE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_ACCEPTANCE_VIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_ACCEPTANCE_CREATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_ACCEPTANCE_UPDATE'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_ACCEPTANCE_SUBMIT'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_ACCEPTANCE_REVIEW'),
    ('PARK_GENERAL_MANAGER', 'ENGINEERING_ACCEPTANCE_CLOSE')
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
  entitled_scopes.tenant_id,
  entitled_scopes.park_id,
  role.id,
  permission.id,
  now(),
  now(),
  false,
  1,
  'EPDR administrator engineering visibility backfill'
FROM entitled_scopes
JOIN role_permissions
  ON true
JOIN sys_role role
  ON role.tenant_id = entitled_scopes.tenant_id
 AND role.park_id = entitled_scopes.park_id
 AND role.code = role_permissions.role_code
 AND role.is_deleted = false
JOIN sys_permission permission
  ON permission.tenant_id = entitled_scopes.tenant_id
 AND permission.park_id = entitled_scopes.park_id
 AND permission.code = role_permissions.permission_code
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
