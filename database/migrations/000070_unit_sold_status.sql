WITH desired_items AS (
  SELECT
    dict_type.tenant_id,
    dict_type.park_id,
    dict_type.id AS dict_type_id,
    '已售'::varchar AS item_label,
    '70'::varchar AS item_value,
    70::integer AS sort_order,
    'enabled'::varchar AS status,
    'default'::varchar AS tag_type,
    'Add sold status for production asset ledger import'::varchar AS remark
  FROM sys_dict_type dict_type
  WHERE dict_type.dict_code = 'unit_rental_status'
    AND dict_type.is_deleted = false
),
updated_items AS (
  UPDATE sys_dict_item item
     SET item_label = desired_items.item_label,
         sort_order = desired_items.sort_order,
         status = desired_items.status,
         tag_type = desired_items.tag_type,
         remark = desired_items.remark,
         is_deleted = false,
         update_time = now()
    FROM desired_items
   WHERE item.tenant_id = desired_items.tenant_id
     AND item.park_id = desired_items.park_id
     AND item.dict_type_id = desired_items.dict_type_id
     AND item.item_value = desired_items.item_value
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
  desired_items.tenant_id,
  desired_items.park_id,
  desired_items.dict_type_id,
  desired_items.item_label,
  desired_items.item_value,
  desired_items.sort_order,
  desired_items.status,
  desired_items.tag_type,
  desired_items.remark
FROM desired_items
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item existing
  WHERE existing.tenant_id = desired_items.tenant_id
    AND existing.park_id = desired_items.park_id
    AND existing.dict_type_id = desired_items.dict_type_id
    AND existing.item_value = desired_items.item_value
);
