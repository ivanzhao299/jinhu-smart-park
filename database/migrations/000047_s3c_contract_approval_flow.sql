CREATE TABLE IF NOT EXISTS biz_leasing_contract_status_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  contract_id uuid NOT NULL REFERENCES biz_leasing_contract(id),
  before_status varchar(32),
  after_status varchar(32) NOT NULL,
  reason varchar(500),
  operator_id uuid,
  operator_name varchar(100),
  op_time timestamptz NOT NULL DEFAULT now(),
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_contract_status_log_scope_deleted
  ON biz_leasing_contract_status_log (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_leasing_contract_status_log_contract_time
  ON biz_leasing_contract_status_log (tenant_id, park_id, contract_id, op_time)
  WHERE is_deleted = false;

WITH permission_rows(code, name, resource, action, api_method, api_path, frontend_route, sort_no) AS (
  VALUES
    ('leasing_contract:submit', '提交合同审批', 'biz.leasing_contract', 'submit', 'POST', '/api/v1/leasing/contracts/:id/submit', '/leasing/contracts', 323),
    ('leasing_contract:approve', '合同审批通过', 'biz.leasing_contract', 'approve', 'POST', '/api/v1/leasing/contracts/:id/approve', '/leasing/contracts', 324),
    ('leasing_contract:reject', '合同审批驳回', 'biz.leasing_contract', 'reject', 'POST', '/api/v1/leasing/contracts/:id/reject', '/leasing/contracts', 325),
    ('leasing_contract:void', '合同作废', 'biz.leasing_contract', 'void', 'POST', '/api/v1/leasing/contracts/:id/void', '/leasing/contracts', 326)
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

WITH target_type AS (
  SELECT id
  FROM sys_dict_type
  WHERE tenant_id = '10000001'
    AND park_id = '20000001'
    AND dict_code = 'leasing_contract_status'
    AND is_deleted = false
),
desired_items(item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('草稿', '10', 10, 'default'),
    ('已提交', '20', 20, 'primary'),
    ('审批中', '30', 30, 'warning'),
    ('已通过', '40', 40, 'success'),
    ('已驳回', '50', 50, 'danger'),
    ('待签章', '60', 60, 'warning'),
    ('已签章', '70', 70, 'primary'),
    ('已生效', '75', 75, 'success'),
    ('已终止', '90', 90, 'danger'),
    ('已作废', '91', 91, 'default')
),
updated AS (
  UPDATE sys_dict_item item
  SET item_label = desired.item_label,
      sort_order = desired.sort_order,
      tag_type = desired.tag_type,
      status = 'enabled',
      is_deleted = false,
      update_time = now()
  FROM target_type, desired_items desired
  WHERE item.tenant_id = '10000001'
    AND item.park_id = '20000001'
    AND item.dict_type_id = target_type.id
    AND item.item_value = desired.item_value
  RETURNING item.id
),
retired AS (
  UPDATE sys_dict_item item
  SET is_deleted = true,
      status = 'disabled',
      remark = 'Retired by S3-C-A contract approval status migration',
      update_time = now()
  FROM target_type
  WHERE item.tenant_id = '10000001'
    AND item.park_id = '20000001'
    AND item.dict_type_id = target_type.id
    AND item.item_value NOT IN (SELECT item_value FROM desired_items)
    AND item.is_deleted = false
  RETURNING item.id
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
  target_type.id,
  desired.item_label,
  desired.item_value,
  desired.sort_order,
  'enabled',
  desired.tag_type,
  now(),
  now(),
  false,
  1
FROM target_type
CROSS JOIN desired_items desired
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item item
  WHERE item.tenant_id = '10000001'
    AND item.park_id = '20000001'
    AND item.dict_type_id = target_type.id
    AND item.item_value = desired.item_value
    AND item.is_deleted = false
);
