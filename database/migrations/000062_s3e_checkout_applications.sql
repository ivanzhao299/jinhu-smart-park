CREATE TABLE IF NOT EXISTS biz_leasing_checkout (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  checkout_code varchar(64) NOT NULL,
  contract_id uuid NOT NULL REFERENCES biz_leasing_contract(id),
  park_tenant_id uuid NOT NULL REFERENCES biz_park_tenant(id),
  checkout_type varchar(32) NOT NULL,
  planned_checkout_date date NOT NULL,
  actual_checkout_date date,
  reason varchar(500) NOT NULL,
  release_unit_status varchar(32) NOT NULL,
  unpaid_amount numeric(14, 2) NOT NULL DEFAULT 0,
  late_fee_amount numeric(14, 2) NOT NULL DEFAULT 0,
  deposit_amount numeric(14, 2) NOT NULL DEFAULT 0,
  deduction_amount numeric(14, 2) NOT NULL DEFAULT 0,
  additional_charge_amount numeric(14, 2) NOT NULL DEFAULT 0,
  refund_amount numeric(14, 2) NOT NULL DEFAULT 0,
  amount_due_from_tenant numeric(14, 2) NOT NULL DEFAULT 0,
  settlement_remark varchar(500),
  settlement_status varchar(32) NOT NULL DEFAULT '10',
  status varchar(32) NOT NULL DEFAULT '10',
  submit_time timestamptz,
  approve_time timestamptz,
  approve_by varchar(64),
  reject_reason varchar(500),
  approve_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_biz_leasing_checkout_type CHECK (checkout_type IN ('normal_expiry', 'early_termination', 'breach_termination', 'other')),
  CONSTRAINT ck_biz_leasing_checkout_release_unit_status CHECK (release_unit_status IN ('rentable', 'maintenance')),
  CONSTRAINT ck_biz_leasing_checkout_settlement_status CHECK (settlement_status IN ('10', '20', '30', '40')),
  CONSTRAINT ck_biz_leasing_checkout_status CHECK (status IN ('10', '30', '40', '50', '60', '70', '91')),
  CONSTRAINT ck_biz_leasing_checkout_amounts CHECK (
    unpaid_amount >= 0
    AND late_fee_amount >= 0
    AND deposit_amount >= 0
    AND deduction_amount >= 0
    AND additional_charge_amount >= 0
    AND refund_amount >= 0
    AND amount_due_from_tenant >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_leasing_checkout_code_active
  ON biz_leasing_checkout (tenant_id, park_id, checkout_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_checkout_scope_deleted
  ON biz_leasing_checkout (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_checkout_contract
  ON biz_leasing_checkout (tenant_id, park_id, contract_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_checkout_park_tenant
  ON biz_leasing_checkout (tenant_id, park_id, park_tenant_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_checkout_status_planned
  ON biz_leasing_checkout (tenant_id, park_id, status, planned_checkout_date)
  WHERE is_deleted = false;

WITH permission_rows(code, name, resource, action, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('leasing_checkout:read', '退租申请读取', 'biz.leasing_checkout', 'read', 'GET', '/api/v1/leasing/checkouts', '/leasing/checkouts', 370),
    ('leasing_checkout:create', '新增退租申请', 'biz.leasing_checkout', 'create', 'POST', '/api/v1/leasing/contracts/:contractId/checkouts', '/leasing/checkouts', 371),
    ('leasing_checkout:update', '编辑退租申请', 'biz.leasing_checkout', 'update', 'PUT', '/api/v1/leasing/checkouts/:id', '/leasing/checkouts', 372),
    ('leasing_checkout:delete', '删除退租申请', 'biz.leasing_checkout', 'delete', 'DELETE', '/api/v1/leasing/checkouts/:id', '/leasing/checkouts', 373),
    ('leasing_checkout:submit', '提交退租审批', 'biz.leasing_checkout', 'submit', 'POST', '/api/v1/leasing/checkouts/:id/submit', '/leasing/checkouts', 374),
    ('leasing_checkout:approve', '退租审批通过', 'biz.leasing_checkout', 'approve', 'POST', '/api/v1/leasing/checkouts/:id/approve', '/leasing/checkouts', 375),
    ('leasing_checkout:reject', '退租审批驳回', 'biz.leasing_checkout', 'reject', 'POST', '/api/v1/leasing/checkouts/:id/reject', '/leasing/checkouts', 376)
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
  'leasing.checkout.' || permission_rows.action,
  'leasing.checkout.' || permission_rows.action,
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

WITH dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('leasing_checkout_type', '退租类型', 'S3-E-A checkout type dictionary'),
    ('leasing_release_unit_status', '退租后房源状态', 'S3-E-A checkout release unit status dictionary'),
    ('leasing_settlement_status', '退租结算状态', 'S3-E-A checkout settlement status dictionary'),
    ('leasing_checkout_status', '退租申请状态', 'S3-E-A checkout status dictionary')
)
INSERT INTO sys_dict_type (
  id,
  tenant_id,
  park_id,
  dict_code,
  dict_name,
  status,
  create_time,
  update_time,
  is_deleted,
  version,
  remark
)
SELECT
  uuid_generate_v4(),
  '10000001',
  '20000001',
  dict_types.dict_code,
  dict_types.dict_name,
  'enabled',
  now(),
  now(),
  false,
  1,
  dict_types.remark
FROM dict_types
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_type t
  WHERE t.tenant_id = '10000001'
    AND t.park_id = '20000001'
    AND t.dict_code = dict_types.dict_code
    AND t.is_deleted = false
);

WITH items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('leasing_checkout_type', '正常到期退租', 'normal_expiry', 10, 'primary'),
    ('leasing_checkout_type', '提前退租', 'early_termination', 20, 'warning'),
    ('leasing_checkout_type', '违约终止', 'breach_termination', 30, 'danger'),
    ('leasing_checkout_type', '其他', 'other', 90, 'default'),
    ('leasing_release_unit_status', '可招商', 'rentable', 10, 'success'),
    ('leasing_release_unit_status', '维修中', 'maintenance', 20, 'warning'),
    ('leasing_settlement_status', '待结算', '10', 10, 'warning'),
    ('leasing_settlement_status', '结算中', '20', 20, 'primary'),
    ('leasing_settlement_status', '已确认', '30', 30, 'success'),
    ('leasing_settlement_status', '已退款', '40', 40, 'default'),
    ('leasing_checkout_status', '草稿', '10', 10, 'default'),
    ('leasing_checkout_status', '审批中', '30', 30, 'warning'),
    ('leasing_checkout_status', '待结算', '40', 40, 'primary'),
    ('leasing_checkout_status', '已驳回', '50', 50, 'danger'),
    ('leasing_checkout_status', '结算已确认', '60', 60, 'warning'),
    ('leasing_checkout_status', '已退租生效', '70', 70, 'success'),
    ('leasing_checkout_status', '已作废', '91', 91, 'default')
)
INSERT INTO sys_dict_item (
  id,
  tenant_id,
  park_id,
  dict_type_id,
  item_label,
  item_value,
  sort_order,
  status,
  tag_type,
  create_time,
  update_time,
  is_deleted,
  version,
  remark
)
SELECT
  uuid_generate_v4(),
  dict_type.tenant_id,
  dict_type.park_id,
  dict_type.id,
  items.item_label,
  items.item_value,
  items.sort_order,
  'enabled',
  items.tag_type,
  now(),
  now(),
  false,
  1,
  'S3-E-A checkout dictionary item'
FROM items
JOIN sys_dict_type dict_type
  ON dict_type.tenant_id = '10000001'
 AND dict_type.park_id = '20000001'
 AND dict_type.dict_code = items.dict_code
 AND dict_type.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item existing
  WHERE existing.tenant_id = dict_type.tenant_id
    AND existing.park_id = dict_type.park_id
    AND existing.dict_type_id = dict_type.id
    AND existing.item_value = items.item_value
    AND existing.is_deleted = false
);
