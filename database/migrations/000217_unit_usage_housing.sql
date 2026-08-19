WITH housing_usage AS (
  SELECT
    dict_type.tenant_id,
    dict_type.park_id,
    dict_type.id AS dict_type_id,
    '住房'::varchar AS item_label,
    '70'::varchar AS item_value,
    70::integer AS sort_order,
    'success'::varchar AS tag_type
  FROM sys_dict_type dict_type
  WHERE dict_type.dict_code = 'unit_usage_type'
    AND dict_type.is_deleted = false
),
updated AS (
  UPDATE sys_dict_item item
     SET item_label = housing_usage.item_label,
         sort_order = housing_usage.sort_order,
         status = 'enabled',
         tag_type = housing_usage.tag_type,
         remark = 'Housing unit usage for shared property control-plane',
         is_deleted = false,
         update_time = now()
    FROM housing_usage
   WHERE item.tenant_id = housing_usage.tenant_id
     AND item.park_id = housing_usage.park_id
     AND item.dict_type_id = housing_usage.dict_type_id
     AND item.item_value = housing_usage.item_value
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
  housing_usage.tenant_id,
  housing_usage.park_id,
  housing_usage.dict_type_id,
  housing_usage.item_label,
  housing_usage.item_value,
  housing_usage.sort_order,
  'enabled',
  housing_usage.tag_type,
  'Housing unit usage for shared property control-plane'
FROM housing_usage
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item item
  WHERE item.tenant_id = housing_usage.tenant_id
    AND item.park_id = housing_usage.park_id
    AND item.dict_type_id = housing_usage.dict_type_id
    AND item.item_value = housing_usage.item_value
);
