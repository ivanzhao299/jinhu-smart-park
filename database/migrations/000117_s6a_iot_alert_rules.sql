ALTER TABLE IF EXISTS biz_iot_alert_rule
  ADD COLUMN IF NOT EXISTS code varchar(64),
  ADD COLUMN IF NOT EXISTS point_id uuid,
  ALTER COLUMN threshold_value DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS threshold_text varchar(200),
  ADD COLUMN IF NOT EXISTS alert_title_template varchar(300),
  ADD COLUMN IF NOT EXISTS alert_content_template text,
  ADD COLUMN IF NOT EXISTS cooldown_seconds integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true;

UPDATE biz_iot_alert_rule
SET code = COALESCE(code, rule_code),
    enabled = COALESCE(enabled, status = 'enabled'),
    status = CASE WHEN COALESCE(enabled, status = 'enabled') THEN 'enabled' ELSE 'disabled' END,
    cooldown_seconds = COALESCE(cooldown_seconds, 0)
WHERE is_deleted = false;

ALTER TABLE IF EXISTS biz_iot_alert_rule
  ALTER COLUMN enabled SET DEFAULT true,
  ALTER COLUMN enabled SET NOT NULL,
  ALTER COLUMN cooldown_seconds SET DEFAULT 0,
  ALTER COLUMN cooldown_seconds SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_biz_iot_alert_rule_metric_enabled
  ON biz_iot_alert_rule (tenant_id, park_id, metric_code, enabled, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_iot_alert_rule_point
  ON biz_iot_alert_rule (tenant_id, park_id, point_id, is_deleted);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('iot_alert_rule:enable', '启用 IoT 告警规则', 'biz.iot_alert_rule', 'enable', 'api', 40, 'POST', '/api/v1/iot/alert-rules/:id/enable', NULL, 440, 'iot:alert-rules'),
    ('iot_alert_rule:disable', '停用 IoT 告警规则', 'biz.iot_alert_rule', 'disable', 'api', 40, 'POST', '/api/v1/iot/alert-rules/:id/disable', NULL, 450, 'iot:alert-rules')
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
      remark = 'S6-A IoT alert rule permission patch',
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
         'S6-A IoT alert rule permission patch'
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
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('iot_alert_rule_operator', '包含', 'contains', 70, 'primary'),
    ('iot_alert_rule_operator', '离线', 'offline', 80, 'danger'),
    ('iot_alert_level', '严重', 'major', 30, 'danger'),
    ('iot_alert_level', '紧急', 'critical', 40, 'danger')
),
dict_item_rows AS (
  SELECT dict_type.tenant_id, dict_type.park_id, dict_type.id AS dict_type_id,
         dict_items.item_label, dict_items.item_value, dict_items.sort_order, dict_items.tag_type
  FROM dict_items
  JOIN sys_dict_type dict_type
    ON dict_type.tenant_id = (SELECT tenant_id FROM seed_scope)
   AND dict_type.park_id = (SELECT park_id FROM seed_scope)
   AND dict_type.dict_code = dict_items.dict_code
   AND dict_type.is_deleted = false
),
updated_items AS (
  UPDATE sys_dict_item target
  SET item_label = source.item_label,
      sort_order = source.sort_order,
      tag_type = source.tag_type,
      status = 'enabled',
      remark = 'S6-A IoT alert rule dictionary patch',
      update_time = now()
  FROM dict_item_rows source
  WHERE target.tenant_id = source.tenant_id
    AND target.park_id = source.park_id
    AND target.dict_type_id = source.dict_type_id
    AND target.item_value = source.item_value
    AND target.is_deleted = false
  RETURNING target.id
)
INSERT INTO sys_dict_item (
  tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, tag_type, status, remark
)
SELECT source.tenant_id, source.park_id, source.dict_type_id, source.item_label, source.item_value,
       source.sort_order, source.tag_type, 'enabled', 'S6-A IoT alert rule dictionary patch'
FROM dict_item_rows source
WHERE NOT EXISTS (
  SELECT 1 FROM sys_dict_item target
  WHERE target.tenant_id = source.tenant_id
    AND target.park_id = source.park_id
    AND target.dict_type_id = source.dict_type_id
    AND target.item_value = source.item_value
    AND target.is_deleted = false
);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('PARK_OPERATOR', 'iot_alert_rule:enable'),
    ('PARK_OPERATOR', 'iot_alert_rule:disable')
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark)
SELECT seed_scope.tenant_id, seed_scope.park_id, role.id, permission.id, now(), now(), false, 1, 'S6-A IoT alert rule role permission patch'
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
