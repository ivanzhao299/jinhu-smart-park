WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('workorder_type', '工单类型', 'Workorder business dictionary defaults'),
    ('workorder_priority', '工单优先级', 'Workorder business dictionary defaults'),
    ('workorder_urgency', '工单紧急程度', 'Workorder business dictionary defaults'),
    ('workorder_status', '工单状态', 'Workorder business dictionary defaults'),
    ('workorder_source_type', '工单来源', 'Workorder business dictionary defaults')
),
upsert_types AS (
  INSERT INTO sys_dict_type (tenant_id, park_id, dict_code, dict_name, status, remark)
  SELECT seed_scope.tenant_id, seed_scope.park_id, dict_types.dict_code, dict_types.dict_name, 'enabled', dict_types.remark
  FROM dict_types
  CROSS JOIN seed_scope
  ON CONFLICT (tenant_id, park_id, dict_code) WHERE is_deleted = false DO UPDATE SET
    dict_name = EXCLUDED.dict_name,
    status = 'enabled',
    is_deleted = false,
    remark = EXCLUDED.remark,
    update_time = now()
  RETURNING id, tenant_id, park_id, dict_code
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('workorder_type', '维修报修', 'repair', 10, 'primary'),
    ('workorder_type', '投诉建议', 'complaint', 20, 'danger'),
    ('workorder_type', '服务申请', 'request', 30, 'success'),
    ('workorder_type', '服务申请(兼容旧值)', 'service', 35, 'success'),
    ('workorder_type', '咨询', 'consultation', 40, 'default'),
    ('workorder_type', '设备维保', 'maintenance', 50, 'primary'),
    ('workorder_type', '环境保洁', 'cleaning', 60, 'success'),
    ('workorder_type', '安防处理', 'security', 70, 'warning'),
    ('workorder_type', '消防安全', 'fire_safety', 75, 'danger'),
    ('workorder_type', '停车管理', 'parking', 80, 'primary'),
    ('workorder_type', '绿化养护', 'landscaping', 85, 'success'),
    ('workorder_type', '水电能源', 'energy', 86, 'warning'),
    ('workorder_type', '门禁通行', 'access', 87, 'primary'),
    ('workorder_type', '其他', 'other', 90, 'default'),
    ('workorder_priority', '高', 'high', 10, 'danger'),
    ('workorder_priority', '中', 'medium', 20, 'warning'),
    ('workorder_priority', '低', 'low', 30, 'default'),
    ('workorder_urgency', '特急', 'critical', 5, 'danger'),
    ('workorder_urgency', '紧急', 'urgent', 10, 'danger'),
    ('workorder_urgency', '一般', 'normal', 20, 'primary'),
    ('workorder_urgency', '低', 'low', 30, 'default'),
    ('workorder_status', '已提交', '10', 10, 'default'),
    ('workorder_status', '已派单', '20', 20, 'primary'),
    ('workorder_status', '已接单', '30', 30, 'primary'),
    ('workorder_status', '处理中', '40', 40, 'warning'),
    ('workorder_status', '待物料', '45', 45, 'warning'),
    ('workorder_status', '已处理', '50', 50, 'success'),
    ('workorder_status', '已确认', '60', 60, 'primary'),
    ('workorder_status', '已评价', '70', 70, 'success'),
    ('workorder_status', '已超时', '80', 80, 'danger'),
    ('workorder_status', '已取消', '90', 90, 'default'),
    ('workorder_status', '已退回', '91', 91, 'danger'),
    ('workorder_status', '已关闭', '100', 100, 'success'),
    ('workorder_source_type', '手工创建', 'manual', 10, 'default'),
    ('workorder_source_type', '业主/租户诉求', 'tenant_request', 20, 'primary'),
    ('workorder_source_type', '巡检发现', 'inspection', 30, 'warning'),
    ('workorder_source_type', '设备告警', 'alert', 40, 'warning'),
    ('workorder_source_type', 'IoT 告警', 'iot_alert', 45, 'warning'),
    ('workorder_source_type', '应急事件', 'safety_emergency', 50, 'danger'),
    ('workorder_source_type', '作业许可', 'work_permit', 55, 'warning'),
    ('workorder_source_type', '机器人异常', 'robot', 60, 'default'),
    ('workorder_source_type', '系统生成', 'system', 70, 'default')
),
desired AS (
  SELECT
    upsert_types.tenant_id,
    upsert_types.park_id,
    upsert_types.id AS dict_type_id,
    dict_items.item_label,
    dict_items.item_value,
    dict_items.sort_order,
    dict_items.tag_type
  FROM dict_items
  JOIN upsert_types ON upsert_types.dict_code = dict_items.dict_code
),
updated_items AS (
  UPDATE sys_dict_item item
  SET item_label = desired.item_label,
      sort_order = desired.sort_order,
      status = 'enabled',
      tag_type = desired.tag_type,
      remark = 'Workorder business dictionary defaults',
      is_deleted = false,
      update_time = now()
  FROM desired
  WHERE item.tenant_id = desired.tenant_id
    AND item.park_id = desired.park_id
    AND item.dict_type_id = desired.dict_type_id
    AND item.item_value = desired.item_value
    AND item.is_deleted = false
  RETURNING item.id
)
INSERT INTO sys_dict_item (tenant_id, park_id, dict_type_id, item_label, item_value, sort_order, status, tag_type, remark)
SELECT desired.tenant_id,
       desired.park_id,
       desired.dict_type_id,
       desired.item_label,
       desired.item_value,
       desired.sort_order,
       'enabled',
       desired.tag_type,
       'Workorder business dictionary defaults'
FROM desired
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item item
  WHERE item.tenant_id = desired.tenant_id
    AND item.park_id = desired.park_id
    AND item.dict_type_id = desired.dict_type_id
    AND item.item_value = desired.item_value
    AND item.is_deleted = false
);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
priority_type AS (
  SELECT dict_type.id, dict_type.tenant_id, dict_type.park_id
  FROM sys_dict_type dict_type
  JOIN seed_scope
    ON seed_scope.tenant_id = dict_type.tenant_id
   AND seed_scope.park_id = dict_type.park_id
  WHERE dict_type.dict_code = 'workorder_priority'
    AND dict_type.is_deleted = false
)
UPDATE sys_dict_item item
SET status = 'disabled',
    is_deleted = true,
    remark = 'Retired legacy workorder priority value by business dictionary defaults',
    update_time = now()
FROM priority_type
WHERE item.tenant_id = priority_type.tenant_id
  AND item.park_id = priority_type.park_id
  AND item.dict_type_id = priority_type.id
  AND item.is_deleted = false
  AND item.item_value IN ('10', '20', '30', '40', 'normal');
