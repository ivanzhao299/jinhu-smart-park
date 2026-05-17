ALTER TABLE biz_leasing_contract_action_log
  ADD COLUMN IF NOT EXISTS biz_type varchar(32);

ALTER TABLE biz_leasing_contract_action_log
  ADD COLUMN IF NOT EXISTS biz_id uuid;

UPDATE biz_leasing_contract_action_log
SET
  biz_type = CASE
    WHEN biz_type IS NOT NULL THEN biz_type
    WHEN change_id IS NOT NULL THEN 'contract_change'
    WHEN remark LIKE 'checkout:%' THEN 'checkout'
    WHEN action = 'refund' THEN 'refund'
    ELSE 'contract'
  END,
  biz_id = CASE
    WHEN biz_id IS NOT NULL THEN biz_id
    WHEN change_id IS NOT NULL THEN change_id
    ELSE contract_id
  END
WHERE biz_type IS NULL
   OR biz_id IS NULL;

ALTER TABLE biz_leasing_contract_action_log
  ALTER COLUMN biz_type SET DEFAULT 'contract';

ALTER TABLE biz_leasing_contract_action_log
  ALTER COLUMN biz_type SET NOT NULL;

ALTER TABLE biz_leasing_contract_action_log
  DROP CONSTRAINT IF EXISTS ck_biz_leasing_contract_action_log_biz_type;

ALTER TABLE biz_leasing_contract_action_log
  ADD CONSTRAINT ck_biz_leasing_contract_action_log_biz_type
  CHECK (biz_type IN ('contract_change', 'renewal', 'checkout', 'refund', 'contract'));

ALTER TABLE biz_leasing_contract_action_log
  DROP CONSTRAINT IF EXISTS ck_biz_leasing_contract_action_log_action;

ALTER TABLE biz_leasing_contract_action_log
  ADD CONSTRAINT ck_biz_leasing_contract_action_log_action
  CHECK (action IN (
    'create',
    'submit',
    'approve',
    'reject',
    'sign',
    'archive',
    'effective',
    'void',
    'preview',
    'preview_finance',
    'preview_settlement',
    'confirm_settlement',
    'settlement',
    'refund',
    'cancel',
    'system'
  ));

CREATE INDEX IF NOT EXISTS idx_biz_leasing_contract_action_log_biz
  ON biz_leasing_contract_action_log (tenant_id, park_id, biz_type, biz_id, op_time DESC)
  WHERE is_deleted = false;

WITH permission_rows(code, name, resource, action, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('leasing_contract:action_log', '合同操作日志', 'biz.leasing_contract_action_log', 'action_log', 'GET', '/api/v1/leasing/contracts/:id/action-logs', '/leasing/contracts', 382)
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
  'leasing.contract.action_log',
  'leasing.contract.action_log',
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
  FROM sys_permission existing
  WHERE existing.tenant_id = '10000001'
    AND existing.park_id = '20000001'
    AND existing.code = permission_rows.code
    AND existing.is_deleted = false
);

INSERT INTO rel_role_perm (
  tenant_id,
  park_id,
  role_id,
  permission_id,
  remark
)
SELECT
  role.tenant_id,
  role.park_id,
  role.id,
  permission.id,
  'S3-E-A contract action log role permission migration'
FROM sys_role role
JOIN sys_permission permission
  ON permission.tenant_id = role.tenant_id
 AND permission.park_id = role.park_id
 AND permission.code = 'leasing_contract:action_log'
 AND permission.is_deleted = false
WHERE role.tenant_id = '10000001'
  AND role.park_id = '20000001'
  AND role.is_deleted = false
  AND role.code IN ('SUPER_ADMIN', 'EXECUTIVE', 'OPERATIONS_OWNER', 'INVEST_MANAGER', 'INVEST_SPECIALIST', 'FINANCE_MANAGER', 'FINANCE_SPECIALIST')
  AND NOT EXISTS (
    SELECT 1
    FROM rel_role_perm existing
    WHERE existing.tenant_id = role.tenant_id
      AND existing.park_id = role.park_id
      AND existing.role_id = role.id
      AND existing.permission_id = permission.id
      AND existing.is_deleted = false
  );
