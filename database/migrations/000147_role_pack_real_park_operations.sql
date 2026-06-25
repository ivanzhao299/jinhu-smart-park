-- Phase-1 productization role pack:
-- - Normalize sys_file tenant / park scope columns to match the current varchar entity model.
-- - Add missing real-park operation roles.
-- - Grant only production-operation permissions needed for daily park work.

ALTER TABLE sys_file
  ALTER COLUMN tenant_id TYPE varchar(64) USING tenant_id::text,
  ALTER COLUMN park_id TYPE varchar(64) USING park_id::text;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
roles(code, name, data_scope, role_scope, sort_no, remark) AS (
  VALUES
    ('PARK_GENERAL_MANAGER', '园区总经理', '40', 'park', 35, 'Phase-1 real park operation role pack'),
    ('PARK_OPERATOR', '园区运营专员', '40', 'park', 45, 'Phase-1 real park operation role pack'),
    ('CUSTOMER_SERVICE', '客服专员', '40', 'park', 96, 'Phase-1 real park operation role pack'),
    ('SECURITY_MANAGER', '安保主管', '40', 'park', 97, 'Phase-1 real park operation role pack'),
    ('SECURITY_GUARD', '安保巡检员', '10', 'park', 99, 'Phase-1 real park operation role pack'),
    ('SAFETY_INSPECTOR', '安全巡检员', '10', 'park', 100, 'Phase-1 real park operation role pack'),
    ('IOT_MANAGER', '设备物联管理员', '40', 'park', 120, 'Phase-1 real park operation role pack'),
    ('TENANT_ADMIN', '租户管理员', '10', 'tenant', 210, 'Phase-1 tenant portal role template'),
    ('TENANT_STAFF', '租户员工', '10', 'tenant', 220, 'Phase-1 tenant portal role template')
),
role_rows AS (
  SELECT seed_scope.tenant_id, seed_scope.park_id, roles.*
  FROM seed_scope
  CROSS JOIN roles
)
INSERT INTO sys_role (
  id,
  tenant_id,
  park_id,
  code,
  name,
  parent_id,
  role_path,
  role_level,
  level,
  sort_no,
  role_type,
  role_scope,
  data_scope,
  data_scope_config,
  is_template,
  is_system,
  is_builtin,
  is_super,
  editable,
  is_editable,
  is_deletable,
  is_enabled,
  status,
  remark
)
SELECT
  uuid_generate_v4(),
  role_rows.tenant_id,
  role_rows.park_id,
  role_rows.code,
  role_rows.name,
  NULL,
  role_rows.code,
  1,
  1,
  role_rows.sort_no,
  role_rows.role_scope,
  role_rows.role_scope,
  role_rows.data_scope,
  '{}'::jsonb,
  true,
  false,
  false,
  false,
  true,
  true,
  true,
  true,
  'enabled',
  role_rows.remark
FROM role_rows
ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO UPDATE SET
  park_id = EXCLUDED.park_id,
  name = EXCLUDED.name,
  role_path = EXCLUDED.role_path,
  role_level = EXCLUDED.role_level,
  level = EXCLUDED.level,
  sort_no = EXCLUDED.sort_no,
  role_type = EXCLUDED.role_type,
  role_scope = EXCLUDED.role_scope,
  data_scope = EXCLUDED.data_scope,
  data_scope_config = EXCLUDED.data_scope_config,
  is_template = EXCLUDED.is_template,
  is_enabled = true,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_rule_codes(role_code, rule_code) AS (
  VALUES
    ('PARK_GENERAL_MANAGER', 'current_park'),
    ('PARK_OPERATOR', 'current_park'),
    ('CUSTOMER_SERVICE', 'current_park'),
    ('SECURITY_MANAGER', 'current_park'),
    ('IOT_MANAGER', 'current_park'),
    ('SECURITY_GUARD', 'self_only'),
    ('SAFETY_INSPECTOR', 'self_only'),
    ('TENANT_ADMIN', 'self_only'),
    ('TENANT_STAFF', 'self_only')
)
INSERT INTO rel_role_data_scope (tenant_id, park_id, role_id, rule_id, create_time, update_time, is_deleted, version, remark)
SELECT DISTINCT
  seed_scope.tenant_id,
  seed_scope.park_id,
  role.id,
  rule.id,
  now(),
  now(),
  false,
  1,
  'Phase-1 real park operation data scope'
FROM role_rule_codes
JOIN seed_scope ON true
JOIN sys_role role
  ON role.tenant_id = seed_scope.tenant_id
 AND role.park_id = seed_scope.park_id
 AND role.code = role_rule_codes.role_code
 AND role.is_deleted = false
JOIN sys_data_scope_rule rule
  ON rule.tenant_id = seed_scope.tenant_id
 AND rule.park_id = seed_scope.park_id
 AND rule.rule_code = role_rule_codes.rule_code
 AND rule.is_deleted = false
ON CONFLICT (tenant_id, role_id, rule_id) WHERE is_deleted = false DO UPDATE SET
  park_id = EXCLUDED.park_id,
  is_deleted = false,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
executive_read_permissions(permission_code) AS (
  VALUES
    ('safety'), ('safety:dashboard'), ('safety:hazards'), ('safety:hazards-overdue'),
    ('safety:inspect-tasks'), ('safety_statistics:read'), ('safety_hazard:read'),
    ('safety_hazard:overdue'), ('safety_inspect_task:read'),
    ('workorder:read'), ('workorder:stats'), ('workorder_log:read'),
    ('park_tenant:read'), ('park_tenant:360'), ('leasing_contract:read'),
    ('leasing_receivable:read'), ('leasing_payment:read'), ('iot_dashboard:read'),
    ('iot_device:read'), ('iot_alert:read'), ('iot_data:read'), ('energy_dashboard:read'),
    ('video_camera:read'), ('video_alert:read'), ('video_security_dashboard:read'),
    ('robot:read'), ('asset:statistics:read')
),
service_permissions(permission_code) AS (
  VALUES
    ('workorder:read'), ('workorder:create'), ('workorder:assign'), ('workorder_log:read'), ('workorder_log:create'),
    ('park_tenant:read'), ('park_tenant:360'), ('park_tenant_contact:read'),
    ('safety:operations-terminal'), ('safety_hazard:read'), ('safety_hazard:create')
),
field_inspection_permissions(permission_code) AS (
  VALUES
    ('safety'), ('safety:operations-terminal'), ('safety:my-inspect-tasks'), ('safety:hazards'),
    ('safety_inspect_task:my'), ('safety_inspect_task:start'), ('safety_inspect_task:check_in'),
    ('safety_inspect_task:submit_results'), ('safety_inspect_task:read'),
    ('safety_hazard:read'), ('safety_hazard:create'), ('safety_hazard:rectify'),
    ('workorder:read'), ('workorder:create'), ('workorder_log:create')
),
safety_manager_permissions(permission_code) AS (
  VALUES
    ('safety'), ('safety:dashboard'), ('safety:operations-terminal'), ('safety:inspect-points'),
    ('safety:inspect-templates'), ('safety:inspect-plans'), ('safety:inspect-tasks'),
    ('safety:my-inspect-tasks'), ('safety:hazards'), ('safety:hazards-overdue'),
    ('safety_statistics:read'), ('safety_inspect_point:read'), ('safety_inspect_point:create'),
    ('safety_inspect_point:update'), ('safety_inspect_template:read'), ('safety_inspect_template:create'),
    ('safety_inspect_template:update'), ('safety_inspect_plan:read'), ('safety_inspect_plan:create'),
    ('safety_inspect_plan:update'), ('safety_inspect_plan:enable'), ('safety_inspect_plan:disable'),
    ('safety_inspect_task:read'), ('safety_inspect_task:generate'), ('safety_inspect_task:my'),
    ('safety_inspect_task:start'), ('safety_inspect_task:check_in'), ('safety_inspect_task:submit_results'),
    ('safety_inspect_task:manage_all'), ('safety_hazard:read'), ('safety_hazard:create'),
    ('safety_hazard:update'), ('safety_hazard:assign_rectify'), ('safety_hazard:rectify'),
    ('safety_hazard:recheck'), ('safety_hazard:reject_rectify'), ('safety_hazard:close'),
    ('safety_hazard:recalculate_overdue'), ('safety_hazard:overdue'), ('safety_hazard:upgrade'),
    ('safety_hazard:create_workorder'), ('safety_hazard:manage_all'),
    ('workorder:read'), ('workorder:create'), ('workorder:assign'), ('workorder_log:read'), ('workorder_log:create'),
    ('video_camera:read'), ('video_alert:read'), ('video_alert:process'), ('video_alert:close'),
    ('video_security_dashboard:read')
),
iot_manager_permissions(permission_code) AS (
  VALUES
    ('iot'), ('iot:dashboard'), ('iot:devices'), ('iot:gateways'), ('iot:metrics'), ('iot:alert-rules'), ('iot:alerts'),
    ('iot_gateway:read'), ('iot_gateway:create'), ('iot_gateway:update'), ('iot_gateway:test'),
    ('iot_device:read'), ('iot_device:create'), ('iot_device:update'), ('iot_device:enable'), ('iot_device:disable'),
    ('iot_device:latest'), ('iot_protocol_config:read'), ('iot_metric:read'), ('iot_metric:create'), ('iot_metric:update'),
    ('iot_point:read'), ('iot_point:create'), ('iot_point:update'), ('iot_data:read'), ('iot_data:trend'),
    ('iot_alert_rule:read'), ('iot_alert_rule:create'), ('iot_alert_rule:update'), ('iot_alert_rule:enable'),
    ('iot_alert_rule:disable'), ('iot_alert:read'), ('iot_alert:acknowledge'), ('iot_alert:process'),
    ('iot_alert:resolve'), ('iot_alert:close'), ('iot_alert:create_workorder'), ('iot_alert_log:read'),
    ('iot_mqtt:status'), ('iot_dashboard:read'), ('iot_stats:read'), ('energy_dashboard:read'),
    ('energy_meter:read'), ('energy_reading:read'), ('energy_alert:read'), ('energy_alert:process'),
    ('robot:read'), ('robot_command_log:read')
),
tenant_permissions(permission_code) AS (
  VALUES
    ('park_tenant:read'), ('park_tenant:360'), ('park_tenant_contact:read'),
    ('leasing_contract:read'), ('leasing_receivable:read'), ('leasing_payment:read'),
    ('workorder:read'), ('workorder:create'), ('workorder:evaluate'), ('workorder_log:read'), ('workorder_log:create'),
    ('file:read'), ('file:download')
),
role_permissions(role_code, permission_code) AS (
  SELECT 'PARK_GENERAL_MANAGER', permission_code FROM executive_read_permissions
  UNION ALL SELECT 'PARK_OPERATOR', permission_code FROM safety_manager_permissions
  UNION ALL SELECT 'CUSTOMER_SERVICE', permission_code FROM service_permissions
  UNION ALL SELECT 'SECURITY_MANAGER', permission_code FROM safety_manager_permissions
  UNION ALL SELECT 'SECURITY_GUARD', permission_code FROM field_inspection_permissions
  UNION ALL SELECT 'SAFETY_INSPECTOR', permission_code FROM field_inspection_permissions
  UNION ALL SELECT 'IOT_MANAGER', permission_code FROM iot_manager_permissions
  UNION ALL SELECT 'TENANT_ADMIN', permission_code FROM tenant_permissions
  UNION ALL SELECT 'TENANT_STAFF', permission_code
  FROM (VALUES ('park_tenant:read'), ('workorder:read'), ('workorder:create'), ('workorder:evaluate'), ('workorder_log:read'), ('workorder_log:create')) permissions(permission_code)
),
resolved AS (
  SELECT DISTINCT role.id AS role_id, permission.id AS permission_id
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
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark)
SELECT seed_scope.tenant_id,
       seed_scope.park_id,
       resolved.role_id,
       resolved.permission_id,
       now(),
       now(),
       false,
       1,
       'Phase-1 real park operation role permission pack'
FROM resolved
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false,
  remark = EXCLUDED.remark,
  update_time = now();
