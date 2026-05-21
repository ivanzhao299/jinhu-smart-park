ALTER TABLE biz_work_order_log
  ADD COLUMN IF NOT EXISTS reason varchar(500),
  ADD COLUMN IF NOT EXISTS attachment_file_ids uuid[] DEFAULT ARRAY[]::uuid[];

CREATE INDEX IF NOT EXISTS idx_biz_work_order_log_order_time_asc
  ON biz_work_order_log (tenant_id, park_id, work_order_id, op_time ASC, is_deleted);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, method, api_path) AS (
  VALUES
    ('workorder_log:read', '工单日志读取', 'biz.work_order_log', 'read', 'GET', '/api/v1/work-orders/:id/logs'),
    ('workorder_log:create', '新增工单日志', 'biz.work_order_log', 'create', 'POST', '/api/v1/work-orders/:id/logs')
)
INSERT INTO sys_permission (
  tenant_id,
  park_id,
  code,
  name,
  resource,
  action,
  permission_type,
  perm_type,
  api_method,
  api_path,
  frontend_route,
  status,
  is_system,
  is_builtin,
  visible
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  permissions.code,
  permissions.name,
  permissions.resource,
  permissions.action,
  'api',
  40,
  permissions.method,
  permissions.api_path,
  '/workorders/list',
  'enabled',
  true,
  true,
  true
FROM seed_scope
CROSS JOIN permissions
ON CONFLICT (tenant_id, code) WHERE is_deleted = false
DO UPDATE SET
  park_id = EXCLUDED.park_id,
  name = EXCLUDED.name,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  api_method = EXCLUDED.api_method,
  api_path = EXCLUDED.api_path,
  frontend_route = EXCLUDED.frontend_route,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permission(role_code, permission_code) AS (
  VALUES
    ('OPERATIONS_OWNER', 'workorder_log:read'),
    ('OPERATIONS_OWNER', 'workorder_log:create'),
    ('PROPERTY_MANAGER', 'workorder_log:read'),
    ('PROPERTY_MANAGER', 'workorder_log:create')
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted)
SELECT seed_scope.tenant_id, seed_scope.park_id, role.id, permission.id, now(), now(), false
FROM seed_scope
JOIN role_permission ON true
JOIN sys_role role
  ON role.tenant_id = seed_scope.tenant_id
 AND role.park_id = seed_scope.park_id
 AND role.code = role_permission.role_code
 AND role.is_deleted = false
JOIN sys_permission permission
  ON permission.tenant_id = seed_scope.tenant_id
 AND permission.park_id = seed_scope.park_id
 AND permission.code = role_permission.permission_code
 AND permission.is_deleted = false
ON CONFLICT DO NOTHING;
