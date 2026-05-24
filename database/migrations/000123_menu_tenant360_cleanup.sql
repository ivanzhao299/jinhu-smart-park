-- Cleanup: hide legacy menu routes and align module route prefixes.
-- Business/API permissions remain enabled; this only removes stale navigation entries.

UPDATE sys_module
SET route_prefix = '/leasing',
    description = '招商线索、租赁、合同与财务协同模块',
    update_time = now()
WHERE module_code = 'leasing'
  AND is_deleted = false
  AND route_prefix <> '/leasing';

UPDATE sys_permission
SET visible = false,
    remark = 'Hidden by menu cleanup: legacy route kept for compatibility but not shown in navigation',
    update_time = now()
WHERE is_deleted = false
  AND perm_type IN (10, 20)
  AND frontend_route IN (
    '/assets/rooms',
    '/iot/overview',
    '/system/attachments',
    '/workorders/statistics'
  );

WITH canonical_iot_pages(code, name, frontend_route, sort_no) AS (
  VALUES
    ('iot:dashboard', 'IoT 看板', '/iot/dashboard', 710),
    ('iot:devices', '设备管理', '/iot/devices', 720),
    ('iot:gateways', '网关管理', '/iot/gateways', 730),
    ('iot:metrics', '指标管理', '/iot/metrics', 740),
    ('iot:alert-rules', '告警规则', '/iot/alert-rules', 750),
    ('iot:alerts', '设备告警', '/iot/alerts', 760)
),
iot_parent AS (
  SELECT id, tenant_id, park_id
  FROM sys_permission
  WHERE code = 'iot'
    AND is_deleted = false
),
updated AS (
  UPDATE sys_permission permission
  SET name = canonical_iot_pages.name,
      frontend_route = canonical_iot_pages.frontend_route,
      sort_no = canonical_iot_pages.sort_no,
      parent_id = iot_parent.id,
      visible = true,
      is_enabled = true,
      status = 'enabled',
      remark = 'Canonical IoT menu cleanup',
      update_time = now()
  FROM canonical_iot_pages, iot_parent
  WHERE permission.code = canonical_iot_pages.code
    AND iot_parent.tenant_id = permission.tenant_id
    AND iot_parent.park_id = permission.park_id
    AND permission.is_deleted = false
  RETURNING permission.id
)
SELECT count(*) FROM updated;
