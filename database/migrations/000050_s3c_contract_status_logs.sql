ALTER TABLE biz_leasing_contract_status_log
  ADD COLUMN IF NOT EXISTS action varchar(32) NOT NULL DEFAULT 'system';

UPDATE biz_leasing_contract_status_log
SET action = CASE
  WHEN after_status = '30' THEN 'submit'
  WHEN after_status = '60' THEN 'approve'
  WHEN after_status = '50' THEN 'reject'
  WHEN after_status = '70' THEN 'archive'
  WHEN after_status = '75' THEN 'effective'
  WHEN after_status = '91' THEN 'void'
  ELSE action
END
WHERE action = 'system'
  AND is_deleted = false;

WITH permission_rows(code, name, resource, action, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('leasing_contract:status_log', '合同状态日志', 'biz.leasing_contract_status_log', 'status_log', 'GET', '/api/v1/leasing/contracts/:id/status-logs', '/leasing/contracts', 330)
)
INSERT INTO sys_permission (
  id,
  tenant_id,
  park_id,
  code,
  name,
  resource,
  action,
  is_enabled,
  status,
  permission_type,
  perm_type,
  permission_path,
  perm_path,
  permission_level,
  level,
  api_method,
  api_path,
  frontend_route,
  sort_no,
  is_system,
  is_builtin,
  is_tenant_custom,
  visible,
  create_time,
  update_time,
  is_deleted,
  version
)
SELECT
  uuid_generate_v4(),
  '10000001',
  '20000001',
  permission_rows.code,
  permission_rows.name,
  permission_rows.resource,
  permission_rows.action,
  true,
  'enabled',
  'api',
  40,
  'leasing.contract.' || permission_rows.action,
  'leasing.contract.' || permission_rows.action,
  3,
  3,
  permission_rows.api_method,
  permission_rows.api_path,
  permission_rows.frontend_route,
  permission_rows.sort_no,
  true,
  true,
  false,
  true,
  now(),
  now(),
  false,
  1
FROM permission_rows
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_permission p
  WHERE p.tenant_id = '10000001'
    AND p.code = permission_rows.code
    AND p.is_deleted = false
);
