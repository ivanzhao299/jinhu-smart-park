ALTER TABLE IF EXISTS biz_iot_alert
  ADD COLUMN IF NOT EXISTS point_id uuid,
  ADD COLUMN IF NOT EXISTS trigger_payload jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS acknowledge_time timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledge_by uuid;

UPDATE biz_iot_alert
SET trigger_payload = COALESCE(trigger_payload, payload, '{}'::jsonb),
    acknowledge_time = COALESCE(acknowledge_time, ack_time),
    acknowledge_by = COALESCE(acknowledge_by, ack_by)
WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_iot_alert_status_time
  ON biz_iot_alert (tenant_id, park_id, status, last_trigger_time DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_iot_alert_level_time
  ON biz_iot_alert (tenant_id, park_id, alert_level, last_trigger_time DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_iot_alert_point
  ON biz_iot_alert (tenant_id, park_id, point_id, is_deleted);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('iot_alert:acknowledge', '确认 IoT 告警', 'biz.iot_alert', 'acknowledge', 'api', 40, 'POST', '/api/v1/iot/alerts/:id/acknowledge', NULL, 510, 'iot:alerts'),
    ('iot_alert:process', '处理 IoT 告警', 'biz.iot_alert', 'process', 'api', 40, 'POST', '/api/v1/iot/alerts/:id/process', NULL, 520, 'iot:alerts'),
    ('iot_alert:ignore', '忽略 IoT 告警', 'biz.iot_alert', 'ignore', 'api', 40, 'POST', '/api/v1/iot/alerts/:id/ignore', NULL, 535, 'iot:alerts'),
    ('iot_alert_log:read', 'IoT 告警日志读取', 'biz.iot_alert_log', 'read', 'api', 40, 'GET', '/api/v1/iot/alerts/:id/logs', NULL, 545, 'iot:alerts')
),
permission_rows AS (
  SELECT seed_scope.tenant_id, seed_scope.park_id, permissions.code, permissions.name, permissions.resource,
         permissions.action, permissions.permission_type, permissions.perm_type, permissions.api_method,
         permissions.api_path, permissions.frontend_route, permissions.sort_no, permissions.parent_code
  FROM permissions
  CROSS JOIN seed_scope
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
      is_system = true,
      is_builtin = true,
      visible = true,
      remark = 'S6-A IoT alert center permission patch',
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
    api_method, api_path, frontend_route, sort_no, status, is_system, is_builtin, visible, remark
  )
  SELECT source.tenant_id, source.park_id, source.code, source.name, source.resource,
         source.action, source.permission_type, source.perm_type, source.api_method,
         source.api_path, source.frontend_route, source.sort_no, 'enabled', true, true, true,
         'S6-A IoT alert center permission patch'
  FROM permission_rows source
  WHERE NOT EXISTS (
    SELECT 1 FROM sys_permission target
    WHERE target.tenant_id = source.tenant_id
      AND target.code = source.code
      AND target.is_deleted = false
  )
  RETURNING id
),
target_permissions AS (
  SELECT permission.id, permissions.parent_code
  FROM permissions
  CROSS JOIN seed_scope
  JOIN sys_permission permission
    ON permission.tenant_id = seed_scope.tenant_id
   AND permission.park_id = seed_scope.park_id
   AND permission.code = permissions.code
   AND permission.is_deleted = false
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = COALESCE(parent.permission_path, parent.code) || '/' || child.code,
    permission_level = COALESCE(parent.permission_level, 1) + 1,
    update_time = now()
FROM target_permissions, sys_permission parent
WHERE child.id = target_permissions.id
  AND parent.tenant_id = child.tenant_id
  AND parent.park_id = child.park_id
  AND parent.code = target_permissions.parent_code
  AND parent.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
field_policies(entity, field_key, field_name, policy_type, mask_rule, remark) AS (
  VALUES
    ('iot_alert', 'triggerPayload', '告警触发载荷', 'visible', NULL, 'S6-A alert trigger payload visible'),
    ('iot_alert', 'alertContent', '告警内容', 'visible', NULL, 'S6-A alert content visible')
)
INSERT INTO sys_field_policy (
  id, tenant_id, park_id, module, entity, field_key, field_name, policy_type,
  mask_rule, status, create_time, update_time, is_deleted, version, remark
)
SELECT uuid_generate_v4(), seed_scope.tenant_id, seed_scope.park_id, 'iot', field_policies.entity,
       field_policies.field_key, field_policies.field_name, field_policies.policy_type,
       field_policies.mask_rule, 'enabled', now(), now(), false, 1, field_policies.remark
FROM seed_scope
CROSS JOIN field_policies
ON CONFLICT (tenant_id, module, entity, field_key) WHERE is_deleted = false DO UPDATE SET
  field_name = EXCLUDED.field_name,
  policy_type = EXCLUDED.policy_type,
  mask_rule = EXCLUDED.mask_rule,
  status = 'enabled',
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('PARK_OPERATOR', 'iot_alert:acknowledge'),
    ('PARK_OPERATOR', 'iot_alert:process'),
    ('PARK_OPERATOR', 'iot_alert:ignore'),
    ('PARK_OPERATOR', 'iot_alert_log:read'),
    ('PROPERTY_MANAGER', 'iot_alert:acknowledge'),
    ('PROPERTY_MANAGER', 'iot_alert:process'),
    ('PROPERTY_MANAGER', 'iot_alert_log:read'),
    ('SAFETY_MANAGER', 'iot_alert:acknowledge'),
    ('SAFETY_MANAGER', 'iot_alert:process'),
    ('SAFETY_MANAGER', 'iot_alert:ignore'),
    ('SAFETY_MANAGER', 'iot_alert_log:read'),
    ('EXECUTIVE', 'iot_alert_log:read')
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark)
SELECT seed_scope.tenant_id, seed_scope.park_id, role.id, permission.id, now(), now(), false, 1, 'S6-A IoT alert center role permission patch'
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
WHERE NOT EXISTS (
  SELECT 1 FROM rel_role_perm existing
  WHERE existing.tenant_id = seed_scope.tenant_id
    AND existing.park_id = seed_scope.park_id
    AND existing.role_id = role.id
    AND existing.permission_id = permission.id
    AND existing.is_deleted = false
);
