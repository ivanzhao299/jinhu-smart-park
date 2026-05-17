CREATE TABLE IF NOT EXISTS rel_leasing_contract_unit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  contract_id uuid NOT NULL REFERENCES biz_leasing_contract(id),
  unit_id uuid NOT NULL REFERENCES biz_unit(id),
  unit_code varchar(64) NOT NULL,
  unit_name varchar(100) NOT NULL,
  area numeric(14, 2) NOT NULL,
  rent_unit_price numeric(14, 2) NOT NULL,
  rent_amount_per_month numeric(14, 2) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status smallint NOT NULL DEFAULT 1,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_rel_leasing_contract_unit_date_range CHECK (start_date <= end_date),
  CONSTRAINT ck_rel_leasing_contract_unit_amount_nonnegative CHECK (
    area > 0
    AND rent_unit_price >= 0
    AND rent_amount_per_month >= 0
  ),
  CONSTRAINT ck_rel_leasing_contract_unit_status CHECK (status IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_rel_leasing_contract_unit_scope_deleted
  ON rel_leasing_contract_unit (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_rel_leasing_contract_unit_contract
  ON rel_leasing_contract_unit (tenant_id, park_id, contract_id, status)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_rel_leasing_contract_unit_unit_period
  ON rel_leasing_contract_unit (tenant_id, park_id, unit_id, start_date, end_date)
  WHERE is_deleted = false AND status = 1;

WITH permission_rows(code, name, resource, action, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('leasing_contract_unit:read', '合同房源读取', 'rel.leasing_contract_unit', 'read', 'GET', '/api/v1/leasing/contracts/:contractId/units', '/leasing/contracts', 314),
    ('leasing_contract_unit:create', '新增合同房源', 'rel.leasing_contract_unit', 'create', 'POST', '/api/v1/leasing/contracts/:contractId/units', '/leasing/contracts', 315),
    ('leasing_contract_unit:update', '编辑合同房源', 'rel.leasing_contract_unit', 'update', 'PUT', '/api/v1/leasing/contracts/:contractId/units/:relId', '/leasing/contracts', 316),
    ('leasing_contract_unit:delete', '删除合同房源', 'rel.leasing_contract_unit', 'delete', 'DELETE', '/api/v1/leasing/contracts/:contractId/units/:relId', '/leasing/contracts', 317),
    ('leasing_contract:recalculate', '合同金额重算', 'biz.leasing_contract', 'recalculate', 'POST', '/api/v1/leasing/contracts/:contractId/recalculate', '/leasing/contracts', 318),
    ('leasing_contract:override_area', '合同房源面积超额覆盖', 'rel.leasing_contract_unit', 'override_area', 'POST', '/api/v1/leasing/contracts/:contractId/units', '/leasing/contracts', 319),
    ('leasing_contract:force_bind_unit', '合同强制绑定房源', 'rel.leasing_contract_unit', 'force_bind_unit', 'POST', '/api/v1/leasing/contracts/:contractId/units', '/leasing/contracts', 320),
    ('leasing_contract:edit_after_submit', '提交后编辑合同房源', 'rel.leasing_contract_unit', 'edit_after_submit', 'PUT', '/api/v1/leasing/contracts/:contractId/units/:relId', '/leasing/contracts', 321)
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
