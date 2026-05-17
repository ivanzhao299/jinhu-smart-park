CREATE TABLE IF NOT EXISTS biz_leasing_contract_action_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  contract_id uuid NOT NULL REFERENCES biz_leasing_contract(id),
  change_id uuid REFERENCES biz_leasing_contract_change(id),
  before_status varchar(32),
  after_status varchar(32),
  action varchar(32) NOT NULL,
  reason varchar(500),
  operator_id varchar(64),
  operator_name varchar(100),
  op_time timestamptz NOT NULL DEFAULT now(),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_biz_leasing_contract_action_log_action CHECK (action IN ('create', 'submit', 'approve', 'reject', 'effective', 'void', 'preview', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_contract_action_log_scope_deleted
  ON biz_leasing_contract_action_log (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_contract_action_log_contract
  ON biz_leasing_contract_action_log (tenant_id, park_id, contract_id, op_time DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_contract_action_log_change
  ON biz_leasing_contract_action_log (tenant_id, park_id, change_id, op_time DESC)
  WHERE is_deleted = false;

WITH permission_rows(code, name, resource, action, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('leasing_contract_change:preview', '合同变更财务影响预览', 'biz.leasing_contract_change', 'preview', 'POST', '/api/v1/leasing/contract-changes/:id/preview-finance-impact', '/leasing/contract-changes', 364),
    ('leasing_contract_change:submit', '提交合同变更审批', 'biz.leasing_contract_change', 'submit', 'POST', '/api/v1/leasing/contract-changes/:id/submit', '/leasing/contract-changes', 365),
    ('leasing_contract_change:approve', '合同变更审批通过', 'biz.leasing_contract_change', 'approve', 'POST', '/api/v1/leasing/contract-changes/:id/approve', '/leasing/contract-changes', 366),
    ('leasing_contract_change:reject', '合同变更审批驳回', 'biz.leasing_contract_change', 'reject', 'POST', '/api/v1/leasing/contract-changes/:id/reject', '/leasing/contract-changes', 367),
    ('leasing_contract_change:effective', '合同变更生效', 'biz.leasing_contract_change', 'effective', 'POST', '/api/v1/leasing/contract-changes/:id/effective', '/leasing/contract-changes', 368)
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
  'leasing.contract_change.' || permission_rows.action,
  'leasing.contract_change.' || permission_rows.action,
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
