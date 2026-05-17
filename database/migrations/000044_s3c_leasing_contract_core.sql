CREATE TABLE IF NOT EXISTS biz_leasing_contract (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  code varchar(64),
  contract_code varchar(64) NOT NULL,
  contract_name varchar(200) NOT NULL,
  contract_type varchar(32),
  park_tenant_id uuid NOT NULL,
  source_type varchar(32) NOT NULL DEFAULT 'manual',
  source_lead_id uuid,
  source_quote_id uuid,
  start_date date NOT NULL,
  end_date date NOT NULL,
  sign_date date,
  effective_date date,
  rent_unit_price numeric(14, 2) NOT NULL DEFAULT 0,
  total_area numeric(14, 2) NOT NULL DEFAULT 0,
  rent_per_month numeric(14, 2) NOT NULL DEFAULT 0,
  total_amount numeric(14, 2) NOT NULL DEFAULT 0,
  deposit_months numeric(8, 2) NOT NULL DEFAULT 0,
  deposit_amount numeric(14, 2) NOT NULL DEFAULT 0,
  free_rent_months numeric(8, 2) NOT NULL DEFAULT 0,
  payment_period varchar(32),
  payment_advance_days integer NOT NULL DEFAULT 0,
  late_fee_rule text,
  property_fee_unit_price numeric(14, 2) NOT NULL DEFAULT 0,
  other_fee_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(32) NOT NULL DEFAULT '10',
  approve_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  contract_pdf_file_id uuid,
  scan_pdf_file_id uuid,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT fk_biz_leasing_contract_park_tenant FOREIGN KEY (park_tenant_id) REFERENCES biz_park_tenant(id),
  CONSTRAINT fk_biz_leasing_contract_source_lead FOREIGN KEY (source_lead_id) REFERENCES biz_leasing_lead(id),
  CONSTRAINT fk_biz_leasing_contract_source_quote FOREIGN KEY (source_quote_id) REFERENCES biz_leasing_quote(id),
  CONSTRAINT fk_biz_leasing_contract_contract_pdf FOREIGN KEY (contract_pdf_file_id) REFERENCES sys_file(id),
  CONSTRAINT fk_biz_leasing_contract_scan_pdf FOREIGN KEY (scan_pdf_file_id) REFERENCES sys_file(id),
  CONSTRAINT ck_biz_leasing_contract_date_range CHECK (start_date <= end_date),
  CONSTRAINT ck_biz_leasing_contract_amount_nonnegative CHECK (
    rent_unit_price >= 0
    AND total_area >= 0
    AND rent_per_month >= 0
    AND total_amount >= 0
    AND deposit_months >= 0
    AND deposit_amount >= 0
    AND free_rent_months >= 0
    AND property_fee_unit_price >= 0
    AND payment_advance_days >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_leasing_contract_code_active
  ON biz_leasing_contract (tenant_id, park_id, contract_code)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_contract_scope_deleted
  ON biz_leasing_contract (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_contract_status
  ON biz_leasing_contract (tenant_id, park_id, status)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_contract_park_tenant
  ON biz_leasing_contract (tenant_id, park_id, park_tenant_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_leasing_contract_source_quote
  ON biz_leasing_contract (tenant_id, park_id, source_quote_id)
  WHERE is_deleted = false;

UPDATE sys_code_rule
SET target_module = 'leasing',
    update_time = now()
WHERE entity_type = 'contract'
  AND is_deleted = false;

UPDATE sys_permission
SET code = 'leasing_contract:read',
    resource = 'biz.leasing_contract',
    action = 'read',
    frontend_route = '/leasing/contracts',
    update_time = now()
WHERE tenant_id = '10000001'
  AND code = 'contract:read'
  AND is_deleted = false;

WITH permission_rows(code, name, resource, action, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('leasing_contract:read', '合同读取', 'biz.leasing_contract', 'read', 'GET', '/api/v1/leasing/contracts', '/leasing/contracts', 310),
    ('leasing_contract:create', '新增合同', 'biz.leasing_contract', 'create', 'POST', '/api/v1/leasing/contracts', '/leasing/contracts', 311),
    ('leasing_contract:update', '编辑合同', 'biz.leasing_contract', 'update', 'PUT', '/api/v1/leasing/contracts/:id', '/leasing/contracts', 312),
    ('leasing_contract:delete', '删除合同', 'biz.leasing_contract', 'delete', 'DELETE', '/api/v1/leasing/contracts/:id', '/leasing/contracts', 313)
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

WITH dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('leasing_contract_status', '租赁合同状态', 'S3-C-A leasing contract status dictionary'),
    ('leasing_contract_type', '租赁合同类型', 'S3-C-A leasing contract type dictionary'),
    ('leasing_contract_source_type', '租赁合同来源', 'S3-C-A leasing contract source type dictionary')
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
    ('leasing_contract_status', '草稿', '10', 10, 'default'),
    ('leasing_contract_status', '已提交', '20', 20, 'primary'),
    ('leasing_contract_status', '审批中', '30', 30, 'warning'),
    ('leasing_contract_status', '已通过', '40', 40, 'success'),
    ('leasing_contract_status', '已驳回', '50', 50, 'danger'),
    ('leasing_contract_status', '待签章', '60', 60, 'warning'),
    ('leasing_contract_status', '已签章', '70', 70, 'primary'),
    ('leasing_contract_status', '已生效', '75', 75, 'success'),
    ('leasing_contract_status', '已终止', '90', 90, 'danger'),
    ('leasing_contract_status', '已作废', '91', 91, 'default'),
    ('leasing_contract_type', '主合同', '10', 10, 'primary'),
    ('leasing_contract_type', '补充协议', '20', 20, 'info'),
    ('leasing_contract_type', '续租合同', '30', 30, 'default'),
    ('leasing_contract_type', '退租结算', '40', 40, 'warning'),
    ('leasing_contract_source_type', '手工创建', 'manual', 10, 'default'),
    ('leasing_contract_source_type', '报价转合同', 'quote', 20, 'primary'),
    ('leasing_contract_source_type', '续租', 'renewal', 30, 'info'),
    ('leasing_contract_source_type', '变更', 'change', 40, 'warning')
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
  version
)
SELECT
  uuid_generate_v4(),
  '10000001',
  '20000001',
  dict_type.id,
  items.item_label,
  items.item_value,
  items.sort_order,
  'enabled',
  items.tag_type,
  now(),
  now(),
  false,
  1
FROM items
JOIN sys_dict_type dict_type
  ON dict_type.tenant_id = '10000001'
 AND dict_type.park_id = '20000001'
 AND dict_type.dict_code = items.dict_code
 AND dict_type.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item existing
  WHERE existing.tenant_id = '10000001'
    AND existing.park_id = '20000001'
    AND existing.dict_type_id = dict_type.id
    AND existing.item_value = items.item_value
    AND existing.is_deleted = false
);

UPDATE sys_dict_item item
SET status = 'disabled',
    remark = 'Reserved for later contract phases',
    update_time = now()
FROM sys_dict_type dict_type
WHERE item.tenant_id = '10000001'
  AND item.park_id = '20000001'
  AND item.dict_type_id = dict_type.id
  AND dict_type.tenant_id = '10000001'
  AND dict_type.park_id = '20000001'
  AND dict_type.dict_code = 'leasing_contract_type'
  AND item.item_value IN ('20', '30', '40')
  AND item.is_deleted = false;

WITH field_policies(entity, field_key, field_name, policy_type, mask_rule, remark) AS (
  VALUES
    ('leasing_contract', 'total_amount', '合同总金额', 'masked', 'amount', 'leasing contract total amount default policy'),
    ('leasing_contract', 'totalAmount', '合同总金额', 'masked', 'amount', 'leasing contract totalAmount default policy'),
    ('leasing_contract', 'rent_per_month', '月租金', 'masked', 'amount', 'leasing contract rent per month default policy'),
    ('leasing_contract', 'rentPerMonth', '月租金', 'masked', 'amount', 'leasing contract rentPerMonth default policy'),
    ('leasing_contract', 'deposit_amount', '押金金额', 'masked', 'amount', 'leasing contract deposit amount default policy'),
    ('leasing_contract', 'depositAmount', '押金金额', 'masked', 'amount', 'leasing contract depositAmount default policy'),
    ('leasing_contract', 'contract_pdf_file_id', '合同正文文件', 'visible', 'file_name', 'leasing contract pdf file default policy'),
    ('leasing_contract', 'contractPdfFileId', '合同正文文件', 'visible', 'file_name', 'leasing contractPdfFileId default policy'),
    ('leasing_contract', 'scan_pdf_file_id', '合同扫描件', 'visible', 'file_name', 'leasing contract scan file default policy'),
    ('leasing_contract', 'scanPdfFileId', '合同扫描件', 'visible', 'file_name', 'leasing contract scanPdfFileId default policy')
)
INSERT INTO sys_field_policy (
  id,
  tenant_id,
  park_id,
  module,
  entity,
  field_key,
  field_name,
  policy_type,
  mask_rule,
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
  'leasing',
  field_policies.entity,
  field_policies.field_key,
  field_policies.field_name,
  field_policies.policy_type,
  field_policies.mask_rule,
  'enabled',
  now(),
  now(),
  false,
  1,
  field_policies.remark
FROM field_policies
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_field_policy p
  WHERE p.tenant_id = '10000001'
    AND p.module = 'leasing'
    AND p.entity = field_policies.entity
    AND p.field_key = field_policies.field_key
    AND p.is_deleted = false
);
