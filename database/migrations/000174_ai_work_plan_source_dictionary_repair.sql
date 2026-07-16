WITH target_types AS (
  SELECT id, tenant_id, park_id
  FROM sys_dict_type
  WHERE dict_code = 'workorder_source_type'
    AND is_deleted = false
),
updated_items AS (
  UPDATE sys_dict_item item
  SET item_label = 'AI 工作计划',
      sort_order = 65,
      status = 'enabled',
      tag_type = 'primary',
      is_deleted = false,
      remark = 'Natural language work orchestration source',
      update_time = now()
  FROM target_types target
  WHERE item.tenant_id = target.tenant_id
    AND item.park_id = target.park_id
    AND item.dict_type_id = target.id
    AND item.item_value = 'ai_work_plan'
  RETURNING item.id
)
INSERT INTO sys_dict_item (
  tenant_id,
  park_id,
  dict_type_id,
  item_label,
  item_value,
  sort_order,
  status,
  tag_type,
  remark
)
SELECT
  target.tenant_id,
  target.park_id,
  target.id,
  'AI 工作计划',
  'ai_work_plan',
  65,
  'enabled',
  'primary',
  'Natural language work orchestration source'
FROM target_types target
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item item
  WHERE item.tenant_id = target.tenant_id
    AND item.park_id = target.park_id
    AND item.dict_type_id = target.id
    AND item.item_value = 'ai_work_plan'
    AND item.is_deleted = false
);
