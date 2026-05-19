ALTER TABLE biz_leasing_contract_change
  DROP CONSTRAINT IF EXISTS ck_biz_leasing_contract_change_status;

ALTER TABLE biz_leasing_contract_change
  ADD CONSTRAINT ck_biz_leasing_contract_change_status
  CHECK (status IN ('10', '20', '30', '40', '50', '60', '90', '91'));

ALTER TABLE biz_leasing_checkout
  DROP CONSTRAINT IF EXISTS ck_biz_leasing_checkout_type;

UPDATE biz_leasing_checkout
SET checkout_type = CASE checkout_type
  WHEN 'normal_expiry' THEN 'normal'
  WHEN 'early_termination' THEN 'early'
  WHEN 'breach_termination' THEN 'breach'
  ELSE checkout_type
END
WHERE checkout_type IN ('normal_expiry', 'early_termination', 'breach_termination');

ALTER TABLE biz_leasing_checkout
  ADD CONSTRAINT ck_biz_leasing_checkout_type
  CHECK (checkout_type IN ('normal', 'early', 'breach', 'force', 'other', 'normal_expiry', 'early_termination', 'breach_termination'));

ALTER TABLE biz_leasing_checkout
  DROP CONSTRAINT IF EXISTS ck_biz_leasing_checkout_status;

ALTER TABLE biz_leasing_checkout
  ADD CONSTRAINT ck_biz_leasing_checkout_status
  CHECK (status IN ('10', '20', '30', '40', '50', '60', '70', '90', '91'));

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('leasing_unit_release_status', '退租后房源状态', 'S3-E-A unit release status dictionary alias')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', dict_types.remark
  FROM seed_scope
  CROSS JOIN dict_types
  ON CONFLICT (tenant_id, park_id, dict_code) WHERE is_deleted = false DO UPDATE SET
    dict_name = EXCLUDED.dict_name,
    status = 'enabled',
    remark = EXCLUDED.remark,
    update_time = now()
  RETURNING id, tenant_id, park_id, dict_code
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('leasing_contract_change_status', '已作废', '90', 90, 'default'),
    ('leasing_checkout_type', '到期退租', 'normal', 10, 'primary'),
    ('leasing_checkout_type', '提前退租', 'early', 20, 'warning'),
    ('leasing_checkout_type', '违约终止', 'breach', 30, 'danger'),
    ('leasing_checkout_type', '强制终止', 'force', 40, 'danger'),
    ('leasing_checkout_type', '其他', 'other', 90, 'default'),
    ('leasing_unit_release_status', '可招商', 'rentable', 10, 'success'),
    ('leasing_unit_release_status', '维修中', 'maintenance', 20, 'warning'),
    ('leasing_settlement_status', '未结算', '10', 10, 'warning'),
    ('leasing_settlement_status', '结算中', '20', 20, 'primary'),
    ('leasing_settlement_status', '已结算', '30', 30, 'success'),
    ('leasing_checkout_status', '已提交', '20', 20, 'primary'),
    ('leasing_checkout_status', '已通过待结算', '40', 40, 'primary'),
    ('leasing_checkout_status', '已结算', '60', 60, 'warning'),
    ('leasing_checkout_status', '已生效', '70', 70, 'success'),
    ('leasing_checkout_status', '已作废', '90', 90, 'default'),
    ('leasing_refund_status', '已登记', '10', 10, 'warning'),
    ('leasing_refund_status', '已完成', '20', 20, 'primary')
),
existing_types AS (
  SELECT dict_type.id, dict_type.tenant_id, dict_type.park_id, dict_type.dict_code
  FROM sys_dict_type dict_type
  JOIN seed_scope
    ON seed_scope.tenant_id = dict_type.tenant_id
   AND seed_scope.park_id = dict_type.park_id
  WHERE dict_type.is_deleted = false
    AND dict_type.dict_code IN (
      'leasing_contract_change_status',
      'leasing_checkout_type',
      'leasing_unit_release_status',
      'leasing_settlement_status',
      'leasing_checkout_status',
      'leasing_refund_status'
    )
  UNION
  SELECT id, tenant_id, park_id, dict_code FROM upsert_types
),
desired_items AS (
  SELECT existing_types.id AS dict_type_id,
         existing_types.tenant_id,
         existing_types.park_id,
         dict_items.item_label,
         dict_items.item_value,
         dict_items.sort_order,
         dict_items.tag_type
  FROM dict_items
  JOIN existing_types ON existing_types.dict_code = dict_items.dict_code
),
updated_items AS (
  UPDATE sys_dict_item item
  SET item_label = desired_items.item_label,
      sort_order = desired_items.sort_order,
      status = 'enabled',
      tag_type = desired_items.tag_type,
      remark = 'S3-E-A permissions/menu/dictionary seed patch',
      is_deleted = false,
      update_time = now()
  FROM desired_items
  WHERE item.tenant_id = desired_items.tenant_id
    AND item.park_id = desired_items.park_id
    AND item.dict_type_id = desired_items.dict_type_id
    AND item.item_value = desired_items.item_value
    AND item.is_deleted = false
  RETURNING item.id
)
INSERT INTO sys_dict_item (tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, status, tag_type, remark)
SELECT desired_items.tenant_id,
       desired_items.park_id,
       desired_items.dict_type_id,
       desired_items.item_label,
       desired_items.item_value,
       desired_items.sort_order,
       'enabled',
       desired_items.tag_type,
       'S3-E-A permissions/menu/dictionary seed patch'
FROM desired_items
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item existing
  WHERE existing.tenant_id = desired_items.tenant_id
    AND existing.park_id = desired_items.park_id
    AND existing.dict_type_id = desired_items.dict_type_id
    AND existing.item_value = desired_items.item_value
    AND existing.is_deleted = false
);

UPDATE sys_field_policy
SET policy_type = 'masked',
    mask_rule = 'custom',
    status = 'enabled',
    update_time = now()
WHERE tenant_id = '10000001'
  AND park_id = '20000001'
  AND module = 'leasing'
  AND entity = 'leasing_contract_change'
  AND field_key IN ('finance_impact', 'financeImpact')
  AND is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('EXECUTIVE', 'leasing_checkout:read'),
    ('EXECUTIVE', 'leasing_refund:read'),
    ('FINANCE_MANAGER', 'leasing_contract_change:effective'),
    ('FINANCE_SPECIALIST', 'leasing_checkout:read'),
    ('FINANCE_SPECIALIST', 'leasing_checkout:preview_settlement'),
    ('FINANCE_SPECIALIST', 'leasing_refund:read'),
    ('FINANCE_SPECIALIST', 'leasing_refund:create'),
    ('PROPERTY_MANAGER', 'leasing_checkout:read'),
    ('PROPERTY_MANAGER', 'leasing_contract:action_log')
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version)
SELECT seed_scope.tenant_id,
       seed_scope.park_id,
       role.id,
       permission.id,
       now(),
       now(),
       false,
       1
FROM seed_scope
JOIN role_permissions ON true
JOIN sys_role role
  ON role.tenant_id = seed_scope.tenant_id
 AND role.park_id = seed_scope.park_id
 AND role.code = role_permissions.role_code
 AND role.is_deleted = false
JOIN sys_permission permission
  ON permission.tenant_id = seed_scope.tenant_id
 AND permission.park_id = seed_scope.park_id
 AND permission.code = role_permissions.permission_code
 AND permission.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_role_perm existing
  WHERE existing.tenant_id = seed_scope.tenant_id
    AND existing.park_id = seed_scope.park_id
    AND existing.role_id = role.id
    AND existing.permission_id = permission.id
    AND existing.is_deleted = false
);
