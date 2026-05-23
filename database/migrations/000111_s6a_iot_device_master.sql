ALTER TABLE biz_iot_device
  ADD COLUMN IF NOT EXISTS vendor_name varchar(120),
  ADD COLUMN IF NOT EXISTS vendor_device_id varchar(128),
  ADD COLUMN IF NOT EXISTS gps_lng numeric(12, 8),
  ADD COLUMN IF NOT EXISTS gps_lat numeric(12, 8),
  ADD COLUMN IF NOT EXISTS install_date date,
  ADD COLUMN IF NOT EXISTS warranty_end_date date,
  ADD COLUMN IF NOT EXISTS last_offline_time timestamptz,
  ADD COLUMN IF NOT EXISTS last_data_time timestamptz,
  ADD COLUMN IF NOT EXISTS device_secret_hash varchar(128),
  ADD COLUMN IF NOT EXISTS status_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE biz_iot_device
SET vendor_name = COALESCE(vendor_name, vendor_platform),
    last_data_time = COALESCE(last_data_time, last_report_time),
    status_payload = COALESCE(status_payload, metadata, '{}'::jsonb),
    device_secret_hash = CASE
      WHEN device_secret_hash IS NOT NULL THEN device_secret_hash
      WHEN device_secret IS NULL THEN NULL
      WHEN device_secret LIKE 'sha256:%' THEN device_secret
      ELSE concat('legacy-md5:', md5(device_secret))
    END
WHERE vendor_name IS NULL
   OR last_data_time IS NULL
   OR status_payload IS NULL
   OR device_secret_hash IS NULL;

ALTER TABLE biz_iot_device
  ALTER COLUMN device_secret DROP NOT NULL;

UPDATE biz_iot_device
SET device_secret = NULL
WHERE device_secret IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_iot_device_gateway_vendor_active
  ON biz_iot_device (tenant_id, park_id, gateway_id, vendor_device_id)
  WHERE is_deleted = false AND gateway_id IS NOT NULL AND vendor_device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_biz_iot_device_type_status
  ON biz_iot_device (tenant_id, park_id, device_type, status, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_iot_device_online_status
  ON biz_iot_device (tenant_id, park_id, online_status, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_iot_device_building_floor
  ON biz_iot_device (tenant_id, park_id, building_id, floor_id, is_deleted);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('iot_device:enable', '启用 IoT 设备', 'biz.iot_device', 'enable', 'api', 40, 'POST', '/api/v1/iot/devices/:id/enable', NULL, 231, 'iot:devices'),
    ('iot_device:disable', '停用 IoT 设备', 'biz.iot_device', 'disable', 'api', 40, 'POST', '/api/v1/iot/devices/:id/disable', NULL, 232, 'iot:devices'),
    ('iot_device:reset_secret', '重置 IoT 设备密钥', 'biz.iot_device', 'reset_secret', 'api', 40, 'POST', '/api/v1/iot/devices/:id/reset-secret', NULL, 233, 'iot:devices')
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
      remark = 'S6-A IoT device master permission seed',
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
         'S6-A IoT device master permission seed'
  FROM permission_rows source
  WHERE NOT EXISTS (
    SELECT 1
    FROM sys_permission target
    WHERE target.tenant_id = source.tenant_id
      AND target.code = source.code
      AND target.is_deleted = false
  )
  RETURNING id
)
SELECT count(*) FROM updated_permissions
UNION ALL
SELECT count(*) FROM inserted_permissions;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
field_policies(entity, field_key, field_name, policy_type, mask_rule, remark) AS (
  VALUES
    ('iot_device', 'deviceSecret', '设备密钥', 'hidden', NULL, 'S6-A device secret hidden'),
    ('iot_device', 'deviceSecretHash', '设备密钥 Hash', 'hidden', NULL, 'S6-A device secret hash hidden'),
    ('iot_device', 'gpsLng', '设备经度', 'masked', 'custom', 'S6-A device gps longitude masked'),
    ('iot_device', 'gpsLat', '设备纬度', 'masked', 'custom', 'S6-A device gps latitude masked'),
    ('iot_device', 'statusPayload', '设备最近状态载荷', 'visible', NULL, 'S6-A device status payload visible')
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
    ('PARK_OPERATOR', 'iot_device:enable'),
    ('PARK_OPERATOR', 'iot_device:disable'),
    ('PARK_OPERATOR', 'iot_device:reset_secret'),
    ('PROPERTY_MANAGER', 'iot_device:enable'),
    ('PROPERTY_MANAGER', 'iot_device:disable')
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark)
SELECT seed_scope.tenant_id, seed_scope.park_id, role.id, permission.id, now(), now(), false, 1, 'S6-A IoT device master role permission seed'
FROM role_permissions
CROSS JOIN seed_scope
JOIN sys_role role
  ON role.tenant_id = seed_scope.tenant_id
 AND role.park_id = seed_scope.park_id
 AND role.code = role_permissions.role_code
 AND role.is_deleted = false
JOIN sys_permission permission
  ON permission.tenant_id = seed_scope.tenant_id
 AND permission.code = role_permissions.permission_code
 AND permission.is_deleted = false
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
  update_time = now(),
  remark = EXCLUDED.remark;
