CREATE TABLE IF NOT EXISTS biz_leasing_contract_change (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  change_code varchar(64) NOT NULL,
  contract_id uuid NOT NULL REFERENCES biz_leasing_contract(id),
  park_tenant_id uuid NOT NULL REFERENCES biz_park_tenant(id),
  change_type varchar(32) NOT NULL,
  change_reason varchar(500) NOT NULL,
  effective_date date NOT NULL,
  before_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  finance_impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  receivable_policy varchar(32) NOT NULL DEFAULT 'manual_review',
  status varchar(32) NOT NULL DEFAULT '10',
  submit_time timestamptz,
  approve_time timestamptz,
  approve_by uuid,
  reject_reason varchar(500),
  approve_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT ck_biz_leasing_contract_change_status CHECK (status IN ('10', '20', '30', '40', '50', '60', '91')),
  CONSTRAINT ck_biz_leasing_contract_change_type CHECK (change_type IN ('term_change', 'amount_change', 'unit_change', 'payment_change', 'fee_change', 'mixed', 'other')),
  CONSTRAINT ck_biz_leasing_contract_change_receivable_policy CHECK (receivable_policy IN ('no_action', 'adjust_future', 'manual_review'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_leasing_contract_change_code_active
  ON biz_leasing_contract_change (tenant_id, park_id, change_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_contract_change_scope_deleted
  ON biz_leasing_contract_change (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_contract_change_contract
  ON biz_leasing_contract_change (tenant_id, park_id, contract_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_contract_change_park_tenant
  ON biz_leasing_contract_change (tenant_id, park_id, park_tenant_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_contract_change_status_effective
  ON biz_leasing_contract_change (tenant_id, park_id, status, effective_date)
  WHERE is_deleted = false;

WITH permission_rows(code, name, resource, action, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('leasing_contract_change:read', '合同变更读取', 'biz.leasing_contract_change', 'read', 'GET', '/api/v1/leasing/contract-changes', '/leasing/contract-changes', 360),
    ('leasing_contract_change:create', '新增合同变更', 'biz.leasing_contract_change', 'create', 'POST', '/api/v1/leasing/contracts/:contractId/changes', '/leasing/contract-changes', 361),
    ('leasing_contract_change:update', '编辑合同变更', 'biz.leasing_contract_change', 'update', 'PUT', '/api/v1/leasing/contract-changes/:id', '/leasing/contract-changes', 362),
    ('leasing_contract_change:delete', '删除合同变更', 'biz.leasing_contract_change', 'delete', 'DELETE', '/api/v1/leasing/contract-changes/:id', '/leasing/contract-changes', 363)
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

WITH dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('leasing_contract_change_type', '合同变更类型', 'S3-E-A contract change type dictionary'),
    ('leasing_contract_change_status', '合同变更状态', 'S3-E-A contract change status dictionary'),
    ('leasing_receivable_adjust_policy', '应收调整策略', 'S3-E-A receivable adjustment policy dictionary')
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
    ('leasing_contract_change_type', '租期变更', 'term_change', 10, 'primary'),
    ('leasing_contract_change_type', '金额变更', 'amount_change', 20, 'warning'),
    ('leasing_contract_change_type', '房源变更', 'unit_change', 30, 'primary'),
    ('leasing_contract_change_type', '付款周期变更', 'payment_change', 40, 'default'),
    ('leasing_contract_change_type', '物业费 / 其他费用变更', 'fee_change', 50, 'warning'),
    ('leasing_contract_change_type', '综合变更', 'mixed', 60, 'danger'),
    ('leasing_contract_change_type', '其他', 'other', 90, 'default'),
    ('leasing_contract_change_status', '草稿', '10', 10, 'default'),
    ('leasing_contract_change_status', '已提交', '20', 20, 'primary'),
    ('leasing_contract_change_status', '审批中', '30', 30, 'warning'),
    ('leasing_contract_change_status', '已通过', '40', 40, 'success'),
    ('leasing_contract_change_status', '已驳回', '50', 50, 'danger'),
    ('leasing_contract_change_status', '已生效', '60', 60, 'success'),
    ('leasing_contract_change_status', '已作废', '91', 91, 'default'),
    ('leasing_receivable_adjust_policy', '不处理既有应收', 'no_action', 10, 'default'),
    ('leasing_receivable_adjust_policy', '调整未收款未来应收', 'adjust_future', 20, 'warning'),
    ('leasing_receivable_adjust_policy', '人工复核', 'manual_review', 30, 'primary')
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
  'S3-E-A contract change dictionary item'
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
