-- Production-safe least-privilege convergence for the reviewed Jinhu
-- engineering project manager responsibility. This seed creates the canonical
-- role when absent, freezes its permission set, and replaces the two legacy
-- broad role bindings on the explicitly reviewed account.

BEGIN;

LOCK TABLE sys_role, rel_role_perm, rel_user_role IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE jh_engineering_project_manager_permissions (
  permission_code varchar(128) PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO jh_engineering_project_manager_permissions (permission_code)
VALUES
  ('system:user:me'),
  ('engineering'),
  ('engineering:terminal'),
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
  ('ENGINEERING_PROJECT_CREATE'),
  ('ENGINEERING_PROJECT_UPDATE'),
  ('ENGINEERING_PROJECT_SUBMIT'),
  ('ENGINEERING_PLAN_CREATE'),
  ('ENGINEERING_PLAN_UPDATE'),
  ('ENGINEERING_DAILY_REPORT_CREATE'),
  ('ENGINEERING_DAILY_REPORT_UPDATE'),
  ('ENGINEERING_DAILY_REPORT_SUBMIT'),
  ('ENGINEERING_INSPECTION_CREATE'),
  ('ENGINEERING_INSPECTION_UPDATE'),
  ('ENGINEERING_INSPECTION_SUBMIT'),
  ('ENGINEERING_RECTIFICATION_UPDATE'),
  ('ENGINEERING_RECTIFICATION_SUBMIT'),
  ('ENGINEERING_RECTIFICATION_ASSIGN'),
  ('ENGINEERING_RECTIFICATION_RECHECK'),
  ('ENGINEERING_RECTIFICATION_CLOSE'),
  ('ENGINEERING_ACCEPTANCE_CREATE'),
  ('ENGINEERING_ACCEPTANCE_SUBMIT'),
  ('workorder:create'),
  ('file:read'),
  ('file:upload'),
  ('file:download');

DO $$
DECLARE
  tenant_count integer;
  park_count integer;
  user_count integer;
  role_count integer;
  expected_permission_count integer;
  resolved_permission_count integer;
  unexpected_binding_count integer;
BEGIN
  SELECT count(*) INTO tenant_count
  FROM sys_tenant tenant
  WHERE tenant.tenant_id = '10000001'
    AND tenant.status = 1
    AND tenant.is_deleted = false;

  SELECT count(*) INTO park_count
  FROM biz_park park
  WHERE park.tenant_id = '10000001'
    AND park.park_id = '20000001'
    AND park.status = 1
    AND park.is_deleted = false;

  SELECT count(*) INTO user_count
  FROM sys_user app_user
  WHERE app_user.tenant_id = '10000001'
    AND app_user.park_id = '20000001'
    AND app_user.username = 'shao_minghong'
    AND app_user.is_enabled = true
    AND app_user.status = 'enabled'
    AND app_user.is_deleted = false;

  SELECT count(*) INTO role_count
  FROM sys_role role
  WHERE role.tenant_id = '10000001'
    AND role.code = 'JH_ENGINEERING_PROJECT_MANAGER';

  SELECT count(*) INTO expected_permission_count
  FROM jh_engineering_project_manager_permissions;

  SELECT count(*) INTO resolved_permission_count
  FROM jh_engineering_project_manager_permissions expected
  JOIN sys_permission permission
    ON permission.tenant_id = '10000001'
   AND permission.park_id = '20000001'
   AND permission.code = expected.permission_code
   AND permission.is_enabled = true
   AND permission.status = 'enabled'
   AND permission.is_deleted = false;

  SELECT count(*) INTO unexpected_binding_count
  FROM rel_user_role relation
  JOIN sys_user app_user ON app_user.id = relation.user_id
  JOIN sys_role role ON role.id = relation.role_id
  WHERE relation.tenant_id = '10000001'
    AND relation.park_id = '20000001'
    AND relation.is_deleted = false
    AND app_user.tenant_id = relation.tenant_id
    AND app_user.park_id = relation.park_id
    AND app_user.username = 'shao_minghong'
    AND app_user.is_deleted = false
    AND role.tenant_id = relation.tenant_id
    AND role.code NOT IN (
      'PROPERTY_STAFF',
      'MAINTENANCE_ENGINEER',
      'JH_ENGINEERING_PROJECT_MANAGER'
    );

  IF tenant_count <> 1
     OR park_count < 1
     OR user_count > 1
     OR role_count > 1
     OR expected_permission_count <> resolved_permission_count
     OR unexpected_binding_count <> 0 THEN
    RAISE EXCEPTION
      'jh-engineering-project-manager-preflight-failed: tenant=%, park=%, user=%, role=%, expected_permissions=%, resolved_permissions=%, unexpected_bindings=%',
      tenant_count, park_count, user_count, role_count, expected_permission_count,
      resolved_permission_count, unexpected_binding_count
      USING ERRCODE = '23514';
  END IF;
END;
$$;

INSERT INTO sys_role (
  tenant_id, park_id, code, name, role_path, level, sort_no,
  role_type, role_scope, data_scope, data_scope_config,
  is_template, is_system, is_builtin, is_super,
  editable, is_editable, is_deletable, is_enabled, status, remark
)
SELECT
  '10000001', '20000001', 'JH_ENGINEERING_PROJECT_MANAGER', '工程项目经理',
  'JH_ENGINEERING_PROJECT_MANAGER', 1, 100,
  'custom', 'park', '40', '{}'::jsonb,
  false, false, false, false,
  true, true, true, true, 'enabled',
  '2026 responsibility baseline: engineering technology, quality, progress and acceptance.'
WHERE NOT EXISTS (
  SELECT 1 FROM sys_role role
  WHERE role.tenant_id = '10000001'
    AND role.code = 'JH_ENGINEERING_PROJECT_MANAGER'
);

UPDATE sys_role role
SET park_id = '20000001',
    name = '工程项目经理',
    role_path = 'JH_ENGINEERING_PROJECT_MANAGER',
    level = 1,
    sort_no = 100,
    role_type = 'custom',
    role_scope = 'park',
    data_scope = '40',
    data_scope_config = '{}'::jsonb,
    is_template = false,
    is_system = false,
    is_builtin = false,
    is_super = false,
    editable = true,
    is_editable = true,
    is_deletable = true,
    is_enabled = true,
    status = 'enabled',
    is_deleted = false,
    update_time = clock_timestamp(),
    remark = '2026 responsibility baseline: engineering technology, quality, progress and acceptance.'
WHERE role.tenant_id = '10000001'
  AND role.code = 'JH_ENGINEERING_PROJECT_MANAGER';

UPDATE rel_role_perm relation
SET is_deleted = true,
    update_time = clock_timestamp(),
    remark = 'Removed by exact engineering project manager permission convergence.'
FROM sys_role role, sys_permission permission
WHERE relation.tenant_id = '10000001'
  AND relation.park_id = '20000001'
  AND relation.role_id = role.id
  AND relation.permission_id = permission.id
  AND relation.is_deleted = false
  AND role.tenant_id = relation.tenant_id
  AND role.code = 'JH_ENGINEERING_PROJECT_MANAGER'
  AND role.is_deleted = false
  AND permission.tenant_id = relation.tenant_id
  AND NOT EXISTS (
    SELECT 1
    FROM jh_engineering_project_manager_permissions expected
    WHERE expected.permission_code = permission.code
  );

INSERT INTO rel_role_perm (
  tenant_id, park_id, role_id, permission_id,
  create_time, update_time, is_deleted, version, remark
)
SELECT
  '10000001', '20000001', role.id, permission.id,
  clock_timestamp(), clock_timestamp(), false, 1,
  'Reviewed engineering project manager least-privilege permission.'
FROM sys_role role
JOIN jh_engineering_project_manager_permissions expected ON true
JOIN sys_permission permission
  ON permission.tenant_id = role.tenant_id
 AND permission.park_id = role.park_id
 AND permission.code = expected.permission_code
 AND permission.is_enabled = true
 AND permission.status = 'enabled'
 AND permission.is_deleted = false
WHERE role.tenant_id = '10000001'
  AND role.park_id = '20000001'
  AND role.code = 'JH_ENGINEERING_PROJECT_MANAGER'
  AND role.is_deleted = false
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false
DO UPDATE SET
  update_time = clock_timestamp(),
  is_deleted = false,
  remark = EXCLUDED.remark;

INSERT INTO rel_user_role (
  tenant_id, park_id, user_id, role_id,
  create_time, update_time, is_deleted, version, remark
)
SELECT
  '10000001', '20000001', app_user.id, role.id,
  clock_timestamp(), clock_timestamp(), false, 1,
  'Reviewed 2026 responsibility binding: engineering project manager.'
FROM sys_user app_user
JOIN sys_role role
  ON role.tenant_id = app_user.tenant_id
 AND role.park_id = app_user.park_id
 AND role.code = 'JH_ENGINEERING_PROJECT_MANAGER'
 AND role.is_deleted = false
WHERE app_user.tenant_id = '10000001'
  AND app_user.park_id = '20000001'
  AND app_user.username = 'shao_minghong'
  AND app_user.is_deleted = false
ON CONFLICT (tenant_id, park_id, user_id, role_id) WHERE is_deleted = false
DO UPDATE SET
  update_time = clock_timestamp(),
  is_deleted = false,
  remark = EXCLUDED.remark;

UPDATE rel_user_role relation
SET is_deleted = true,
    update_time = clock_timestamp(),
    remark = 'Replaced by reviewed JH_ENGINEERING_PROJECT_MANAGER responsibility binding.'
FROM sys_user app_user, sys_role role
WHERE relation.tenant_id = '10000001'
  AND relation.park_id = '20000001'
  AND relation.user_id = app_user.id
  AND relation.role_id = role.id
  AND relation.is_deleted = false
  AND app_user.tenant_id = relation.tenant_id
  AND app_user.park_id = relation.park_id
  AND app_user.username = 'shao_minghong'
  AND app_user.is_deleted = false
  AND role.tenant_id = relation.tenant_id
  AND role.code IN ('PROPERTY_STAFF', 'MAINTENANCE_ENGINEER')
  AND role.is_deleted = false;

DO $$
DECLARE
  expected_permission_count integer;
  actual_permission_count integer;
  reviewed_user_count integer;
  active_role_count integer;
  canonical_role_count integer;
  forbidden_permission_count integer;
BEGIN
  SELECT count(*) INTO expected_permission_count
  FROM jh_engineering_project_manager_permissions;

  SELECT count(*) INTO reviewed_user_count
  FROM sys_user app_user
  WHERE app_user.tenant_id = '10000001'
    AND app_user.park_id = '20000001'
    AND app_user.username = 'shao_minghong'
    AND app_user.is_enabled = true
    AND app_user.status = 'enabled'
    AND app_user.is_deleted = false;

  SELECT count(*) INTO actual_permission_count
  FROM rel_role_perm relation
  JOIN sys_role role ON role.id = relation.role_id
  JOIN sys_permission permission ON permission.id = relation.permission_id
  WHERE relation.tenant_id = '10000001'
    AND relation.park_id = '20000001'
    AND relation.is_deleted = false
    AND role.tenant_id = relation.tenant_id
    AND role.code = 'JH_ENGINEERING_PROJECT_MANAGER'
    AND role.is_deleted = false
    AND permission.tenant_id = relation.tenant_id
    AND permission.is_deleted = false
    AND EXISTS (
      SELECT 1
      FROM jh_engineering_project_manager_permissions expected
      WHERE expected.permission_code = permission.code
    );

  SELECT count(*), count(*) FILTER (WHERE role.code = 'JH_ENGINEERING_PROJECT_MANAGER')
  INTO active_role_count, canonical_role_count
  FROM rel_user_role relation
  JOIN sys_user app_user ON app_user.id = relation.user_id
  JOIN sys_role role ON role.id = relation.role_id
  WHERE relation.tenant_id = '10000001'
    AND relation.park_id = '20000001'
    AND relation.is_deleted = false
    AND app_user.tenant_id = relation.tenant_id
    AND app_user.park_id = relation.park_id
    AND app_user.username = 'shao_minghong'
    AND app_user.is_deleted = false
    AND role.tenant_id = relation.tenant_id
    AND role.is_deleted = false;

  SELECT count(*) INTO forbidden_permission_count
  FROM rel_user_role user_role
  JOIN sys_user app_user ON app_user.id = user_role.user_id
  JOIN rel_role_perm role_permission
    ON role_permission.tenant_id = user_role.tenant_id
   AND role_permission.park_id = user_role.park_id
   AND role_permission.role_id = user_role.role_id
   AND role_permission.is_deleted = false
  JOIN sys_permission permission
    ON permission.id = role_permission.permission_id
   AND permission.is_deleted = false
  WHERE user_role.tenant_id = '10000001'
    AND user_role.park_id = '20000001'
    AND user_role.is_deleted = false
    AND app_user.username = 'shao_minghong'
    AND app_user.is_deleted = false
    AND (
      permission.code LIKE 'homestay:%'
      OR permission.code LIKE 'housing:%'
      OR permission.code IN ('homestay', 'housing', 'housing_rental')
    );

  IF actual_permission_count <> expected_permission_count
     OR active_role_count <> reviewed_user_count
     OR canonical_role_count <> reviewed_user_count
     OR forbidden_permission_count <> 0 THEN
    RAISE EXCEPTION
      'jh-engineering-project-manager-postcondition-failed: expected_permissions=%, actual_permissions=%, active_roles=%, canonical_roles=%, forbidden_permissions=%',
      expected_permission_count, actual_permission_count, active_role_count,
      canonical_role_count, forbidden_permission_count
      USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMIT;
