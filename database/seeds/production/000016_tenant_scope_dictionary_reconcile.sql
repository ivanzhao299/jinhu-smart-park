-- Production-safe dictionary baseline reconcile for tenant/park scopes.
-- Copies missing default-scope dictionary types and items into every active park scope.

WITH source_scope AS (
  SELECT '10000001'::varchar AS tenant_id, '20000001'::varchar AS park_id
),
target_scopes AS (
  SELECT DISTINCT park.tenant_id::varchar AS tenant_id, park.park_id::varchar AS park_id
  FROM biz_park park
  CROSS JOIN source_scope
  WHERE park.is_deleted = false
    AND NOT (park.tenant_id::varchar = source_scope.tenant_id AND park.park_id::varchar = source_scope.park_id)
),
source_types AS (
  SELECT
    source_type.dict_code,
    source_type.dict_name,
    source_type.status,
    source_type.remark
  FROM sys_dict_type source_type
  JOIN source_scope
    ON source_type.tenant_id::varchar = source_scope.tenant_id
   AND source_type.park_id::varchar = source_scope.park_id
  WHERE source_type.is_deleted = false
)
INSERT INTO sys_dict_type (
  tenant_id,
  park_id,
  dict_code,
  dict_name,
  status,
  create_by,
  update_by,
  is_deleted,
  remark
)
SELECT
  target_scopes.tenant_id,
  target_scopes.park_id,
  source_types.dict_code,
  source_types.dict_name,
  source_types.status,
  NULL,
  NULL,
  false,
  source_types.remark
FROM target_scopes
CROSS JOIN source_types
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_type target_type
  WHERE target_type.tenant_id::varchar = target_scopes.tenant_id
    AND target_type.park_id::varchar = target_scopes.park_id
    AND target_type.dict_code = source_types.dict_code
    AND target_type.is_deleted = false
);

WITH source_scope AS (
  SELECT '10000001'::varchar AS tenant_id, '20000001'::varchar AS park_id
),
target_scopes AS (
  SELECT DISTINCT park.tenant_id::varchar AS tenant_id, park.park_id::varchar AS park_id
  FROM biz_park park
  CROSS JOIN source_scope
  WHERE park.is_deleted = false
    AND NOT (park.tenant_id::varchar = source_scope.tenant_id AND park.park_id::varchar = source_scope.park_id)
),
source_items AS (
  SELECT
    source_type.dict_code,
    source_item.item_label,
    source_item.item_value,
    source_item.sort_order,
    source_item.status,
    source_item.tag_type,
    source_item.remark,
    row_number() OVER (
      PARTITION BY source_type.dict_code, source_item.item_value
      ORDER BY source_item.sort_order ASC, source_item.create_time ASC, source_item.id ASC
    ) AS row_number
  FROM sys_dict_type source_type
  JOIN source_scope
    ON source_type.tenant_id::varchar = source_scope.tenant_id
   AND source_type.park_id::varchar = source_scope.park_id
  JOIN sys_dict_item source_item
    ON source_item.dict_type_id = source_type.id
   AND source_item.tenant_id = source_type.tenant_id
   AND source_item.park_id = source_type.park_id
   AND source_item.is_deleted = false
  WHERE source_type.is_deleted = false
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
  create_by,
  update_by,
  is_deleted,
  remark
)
SELECT
  target_scopes.tenant_id,
  target_scopes.park_id,
  target_type.id,
  source_items.item_label,
  source_items.item_value,
  source_items.sort_order,
  source_items.status,
  source_items.tag_type,
  NULL,
  NULL,
  false,
  source_items.remark
FROM target_scopes
JOIN sys_dict_type target_type
  ON target_type.tenant_id::varchar = target_scopes.tenant_id
 AND target_type.park_id::varchar = target_scopes.park_id
 AND target_type.is_deleted = false
JOIN source_items
  ON source_items.dict_code = target_type.dict_code
WHERE source_items.row_number = 1
  AND NOT EXISTS (
    SELECT 1
    FROM sys_dict_item target_item
    WHERE target_item.tenant_id = target_type.tenant_id
      AND target_item.park_id = target_type.park_id
      AND target_item.dict_type_id = target_type.id
      AND target_item.item_value = source_items.item_value
      AND target_item.is_deleted = false
  );
