ALTER TABLE IF EXISTS biz_iot_device_data
  ADD COLUMN IF NOT EXISTS device_code varchar(64),
  ADD COLUMN IF NOT EXISTS point_id uuid,
  ADD COLUMN IF NOT EXISTS value_bool boolean,
  ADD COLUMN IF NOT EXISTS value_json jsonb,
  ADD COLUMN IF NOT EXISTS value_type varchar(32) NOT NULL DEFAULT 'number',
  ADD COLUMN IF NOT EXISTS reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now();

UPDATE biz_iot_device_data data
SET
  device_code = COALESCE(data.device_code, device.device_code),
  reported_at = COALESCE(data.reported_at, data.report_time),
  received_at = COALESCE(data.received_at, data.create_time, now()),
  value_type = COALESCE(data.value_type, 'number')
FROM biz_iot_device device
WHERE data.device_id = device.id;

UPDATE biz_iot_device_data
SET
  device_code = COALESCE(device_code, ''),
  reported_at = COALESCE(reported_at, report_time, create_time, now()),
  received_at = COALESCE(received_at, create_time, now()),
  value_type = COALESCE(value_type, 'number');

ALTER TABLE IF EXISTS biz_iot_device_data
  ALTER COLUMN device_code SET NOT NULL,
  ALTER COLUMN reported_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_biz_iot_device_data_reported
  ON biz_iot_device_data (tenant_id, park_id, device_id, metric_code, reported_at DESC);

CREATE INDEX IF NOT EXISTS idx_biz_iot_device_data_device_code_reported
  ON biz_iot_device_data (tenant_id, park_id, device_code, reported_at DESC);

CREATE INDEX IF NOT EXISTS idx_biz_iot_device_data_point_reported
  ON biz_iot_device_data (tenant_id, park_id, point_id, reported_at DESC);

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS timescaledb;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TimescaleDB extension is not available, keeping biz_iot_device_data as a normal PostgreSQL table: %', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_hypertable') THEN
    BEGIN
      PERFORM create_hypertable('biz_iot_device_data', 'reported_at', if_not_exists => TRUE, migrate_data => TRUE);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'TimescaleDB hypertable creation skipped for biz_iot_device_data: %', SQLERRM;
    END;
  END IF;
END $$;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, permission_type, perm_type, api_method, api_path, frontend_route, sort_no, parent_code) AS (
  VALUES
    ('iot_data:read', 'IoT 历史数据读取', 'biz.iot_device_data', 'read', 'api', 40, 'GET', '/api/v1/iot/devices/:id/history', NULL, 37, 'iot:devices'),
    ('iot_data:trend', 'IoT 趋势数据读取', 'biz.iot_device_data', 'trend', 'api', 40, 'GET', '/api/v1/iot/devices/:id/trend', NULL, 38, 'iot:devices')
),
permission_rows AS (
  SELECT seed_scope.tenant_id, seed_scope.park_id, permissions.*
  FROM seed_scope
  CROSS JOIN permissions
),
updated_permissions AS (
  UPDATE sys_permission target
  SET name = source.name,
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
      remark = 'S6-A IoT history data permission seed',
      update_time = now()
  FROM permission_rows source
  WHERE target.tenant_id = source.tenant_id
    AND target.park_id = source.park_id
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
         'S6-A IoT history data permission seed'
  FROM permission_rows source
  WHERE NOT EXISTS (
    SELECT 1
    FROM sys_permission target
    WHERE target.tenant_id = source.tenant_id
      AND target.park_id = source.park_id
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
role_permissions(role_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN', 'iot_data:read'),
    ('SUPER_ADMIN', 'iot_data:trend'),
    ('PARK_OPERATOR', 'iot_data:read'),
    ('PARK_OPERATOR', 'iot_data:trend'),
    ('PROPERTY_MANAGER', 'iot_data:read'),
    ('PROPERTY_MANAGER', 'iot_data:trend'),
    ('SAFETY_MANAGER', 'iot_data:read'),
    ('SAFETY_MANAGER', 'iot_data:trend'),
    ('EXECUTIVE', 'iot_data:read'),
    ('EXECUTIVE', 'iot_data:trend')
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version, remark)
SELECT seed_scope.tenant_id, seed_scope.park_id, role.id, permission.id, now(), now(), false, 1, 'S6-A IoT history data role permission seed'
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
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false,
  remark = EXCLUDED.remark,
  update_time = now();
