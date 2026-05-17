ALTER TABLE biz_leasing_contract_action_log
  DROP CONSTRAINT IF EXISTS ck_biz_leasing_contract_action_log_action;

ALTER TABLE biz_leasing_contract_action_log
  ADD CONSTRAINT ck_biz_leasing_contract_action_log_action
  CHECK (action IN ('create', 'submit', 'approve', 'reject', 'effective', 'void', 'preview', 'settlement', 'refund', 'system'));

CREATE TABLE IF NOT EXISTS biz_leasing_refund (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  refund_code varchar(64) NOT NULL,
  checkout_id uuid NOT NULL REFERENCES biz_leasing_checkout(id),
  contract_id uuid NOT NULL REFERENCES biz_leasing_contract(id),
  park_tenant_id uuid NOT NULL REFERENCES biz_park_tenant(id),
  refund_amount numeric(14, 2) NOT NULL,
  refund_method varchar(32) NOT NULL,
  refund_time timestamptz NOT NULL,
  receiver_name varchar(100),
  receiver_bank_account varchar(100),
  bank_serial varchar(100),
  receipt_file_id uuid REFERENCES sys_file(id),
  status varchar(32) NOT NULL DEFAULT '30',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_biz_leasing_refund_amount CHECK (refund_amount > 0),
  CONSTRAINT ck_biz_leasing_refund_status CHECK (status IN ('10', '20', '30', '90'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_leasing_refund_code_active
  ON biz_leasing_refund (tenant_id, park_id, refund_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_refund_scope_deleted
  ON biz_leasing_refund (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_refund_checkout
  ON biz_leasing_refund (tenant_id, park_id, checkout_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_refund_contract
  ON biz_leasing_refund (tenant_id, park_id, contract_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_refund_park_tenant
  ON biz_leasing_refund (tenant_id, park_id, park_tenant_id)
  WHERE is_deleted = false;

WITH permission_rows(code, name, resource, action, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('leasing_checkout:preview_settlement', '退租结算预览', 'biz.leasing_checkout', 'preview_settlement', 'POST', '/api/v1/leasing/checkouts/:id/preview-settlement', '/leasing/checkouts', 377),
    ('leasing_checkout:confirm_settlement', '退租结算确认', 'biz.leasing_checkout', 'confirm_settlement', 'POST', '/api/v1/leasing/checkouts/:id/confirm-settlement', '/leasing/checkouts', 378),
    ('leasing_refund:read', '退租退款读取', 'biz.leasing_refund', 'read', 'GET', '/api/v1/leasing/refunds', '/leasing/checkouts', 379),
    ('leasing_refund:create', '新增退租退款', 'biz.leasing_refund', 'create', 'POST', '/api/v1/leasing/checkouts/:id/refunds', '/leasing/checkouts', 380)
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
    ('leasing_refund_method', '退租退款方式', 'S3-E-A refund method dictionary'),
    ('leasing_refund_status', '退租退款状态', 'S3-E-A refund status dictionary')
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
    ('leasing_refund_method', '银行转账', 'bank_transfer', 10, 'primary'),
    ('leasing_refund_method', '现金', 'cash', 20, 'warning'),
    ('leasing_refund_method', '微信', 'wechat', 30, 'success'),
    ('leasing_refund_method', '支付宝', 'alipay', 40, 'info'),
    ('leasing_refund_method', '其他', 'other', 90, 'default'),
    ('leasing_refund_status', '待退款', '10', 10, 'warning'),
    ('leasing_refund_status', '退款中', '20', 20, 'primary'),
    ('leasing_refund_status', '已退款', '30', 30, 'success'),
    ('leasing_refund_status', '已作废', '90', 90, 'default')
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
  'S3-E-A refund dictionary item'
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
