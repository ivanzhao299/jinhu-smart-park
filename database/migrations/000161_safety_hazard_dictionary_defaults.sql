WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('safety_risk_level', '安全风险等级', 'Safety hazard business dictionary defaults'),
    ('safety_hazard_source_type', '隐患来源', 'Safety hazard business dictionary defaults'),
    ('safety_hazard_type', '安全隐患类型', 'Safety hazard business dictionary defaults'),
    ('safety_hazard_status', '安全隐患状态', 'Safety hazard business dictionary defaults'),
    ('safety_emergency_incident_type', '应急事件类型', 'Safety hazard business dictionary defaults'),
    ('safety_emergency_severity', '应急严重等级', 'Safety hazard business dictionary defaults')
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
    ('safety_risk_level', '一般', '10', 10, 'success'),
    ('safety_risk_level', '较大', '20', 20, 'warning'),
    ('safety_risk_level', '重大', '30', 30, 'danger'),

    ('safety_hazard_source_type', '人工登记', 'manual', 10, 'primary'),
    ('safety_hazard_source_type', '巡检发现', 'inspection', 20, 'warning'),
    ('safety_hazard_source_type', '工单转入', 'workorder', 30, 'primary'),
    ('safety_hazard_source_type', '投诉', 'complaint', 40, 'warning'),
    ('safety_hazard_source_type', '系统告警', 'alert', 50, 'danger'),
    ('safety_hazard_source_type', '视频告警', 'video_alert', 55, 'danger'),
    ('safety_hazard_source_type', '机器人发现', 'robot', 60, 'primary'),
    ('safety_hazard_source_type', '系统生成', 'system', 90, 'default'),

    ('safety_hazard_type', '消防', 'fire', 10, 'danger'),
    ('safety_hazard_type', '电气', 'electrical', 20, 'warning'),
    ('safety_hazard_type', '装修施工', 'decoration', 30, 'primary'),
    ('safety_hazard_type', '锂电池', 'battery', 40, 'danger'),
    ('safety_hazard_type', '仓储堆放', 'warehouse', 50, 'warning'),
    ('safety_hazard_type', '通道占用', 'passage', 60, 'warning'),
    ('safety_hazard_type', '提升平台', 'lift_platform', 70, 'primary'),
    ('safety_hazard_type', '视频安防', 'video_security', 80, 'primary'),
    ('safety_hazard_type', '其他', 'other', 90, 'default'),

    ('safety_hazard_status', '已登记', '10', 10, 'warning'),
    ('safety_hazard_status', '已下发整改', '20', 20, 'primary'),
    ('safety_hazard_status', '整改中', '30', 30, 'primary'),
    ('safety_hazard_status', '已整改', '40', 40, 'success'),
    ('safety_hazard_status', '复查中', '50', 50, 'warning'),
    ('safety_hazard_status', '已闭环', '60', 60, 'success'),
    ('safety_hazard_status', '已超期', '70', 70, 'danger'),
    ('safety_hazard_status', '已升级', '80', 80, 'danger'),
    ('safety_hazard_status', '已豁免', '90', 90, 'default'),
    ('safety_hazard_status', '已转工单', '91', 91, 'primary'),
    ('safety_hazard_status', '已转应急', '92', 92, 'danger'),

    ('safety_emergency_incident_type', '火情', 'fire', 10, 'danger'),
    ('safety_emergency_incident_type', '电气', 'electrical', 20, 'warning'),
    ('safety_emergency_incident_type', '机械设备', 'mechanical', 30, 'primary'),
    ('safety_emergency_incident_type', '医疗', 'medical', 40, 'danger'),
    ('safety_emergency_incident_type', '治安', 'security', 50, 'warning'),
    ('safety_emergency_incident_type', '极端天气', 'weather', 60, 'primary'),
    ('safety_emergency_incident_type', '危化品', 'chemical', 70, 'danger'),
    ('safety_emergency_incident_type', '其他', 'other', 90, 'default'),

    ('safety_emergency_severity', '一般', '10', 10, 'success'),
    ('safety_emergency_severity', '较大', '20', 20, 'warning'),
    ('safety_emergency_severity', '重大', '30', 30, 'danger'),
    ('safety_emergency_severity', '特别重大', '40', 40, 'danger')
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
      remark = 'Safety hazard business dictionary defaults',
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
       'Safety hazard business dictionary defaults'
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
