BEGIN;

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

DO $$
BEGIN
  IF EXISTS (
    WITH housing_unit_candidates AS (
      SELECT DISTINCT occupancy.tenant_id, occupancy.park_id, occupancy.unit_id
      FROM biz_property_occupancy occupancy
      WHERE occupancy.is_deleted = false
        AND occupancy.end_at > now()
        AND occupancy.source_domain IN ('housing_rental', 'homestay', 'apartment', 'maintenance', 'operations')
        AND (
          occupancy.status = 'active'
          OR (occupancy.status = 'held' AND (occupancy.hold_expires_at IS NULL OR occupancy.hold_expires_at > now()))
        )
      UNION
      SELECT DISTINCT lease.tenant_id, lease.park_id, lease.unit_id
      FROM biz_housing_lease lease
      WHERE lease.is_deleted = false
        AND lease.status IN ('draft', 'pending_approval', 'pending_signature', 'active', 'expiring', 'checkout_pending')
      UNION
      SELECT DISTINCT booking.tenant_id, booking.park_id, booking.unit_id
      FROM biz_homestay_booking booking
      WHERE booking.is_deleted = false
        AND booking.status IN ('confirmed', 'checked_in')
      UNION
      SELECT DISTINCT room.tenant_id, room.park_id, room.unit_id
      FROM biz_apartment_room room
      WHERE room.is_deleted = false
        AND room.management_status = 'enabled'
      UNION
      SELECT DISTINCT config.tenant_id, config.park_id, config.unit_id
      FROM biz_property_operation_config config
      WHERE config.is_deleted = false
        AND config.operating_mode = 'short_stay'
    )
    SELECT 1
    FROM housing_unit_candidates candidate
    JOIN rel_leasing_contract_unit relation
      ON relation.tenant_id = candidate.tenant_id
     AND relation.park_id = candidate.park_id
     AND relation.unit_id = candidate.unit_id
     AND relation.is_deleted = false
     AND relation.status = 1
    JOIN biz_leasing_contract contract
      ON contract.id = relation.contract_id
     AND contract.is_deleted = false
     AND contract.status NOT IN ('90', '91')
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'unit-usage-housing-mixed-commercial-conflict';
  END IF;
END $$;

WITH housing_unit_candidates AS (
  SELECT DISTINCT occupancy.tenant_id, occupancy.park_id, occupancy.unit_id
  FROM biz_property_occupancy occupancy
  WHERE occupancy.is_deleted = false
    AND occupancy.end_at > now()
    AND occupancy.source_domain IN ('housing_rental', 'homestay', 'apartment', 'maintenance', 'operations')
    AND (
      occupancy.status = 'active'
      OR (occupancy.status = 'held' AND (occupancy.hold_expires_at IS NULL OR occupancy.hold_expires_at > now()))
    )
  UNION
  SELECT DISTINCT lease.tenant_id, lease.park_id, lease.unit_id
  FROM biz_housing_lease lease
  WHERE lease.is_deleted = false
    AND lease.status IN ('draft', 'pending_approval', 'pending_signature', 'active', 'expiring', 'checkout_pending')
  UNION
  SELECT DISTINCT booking.tenant_id, booking.park_id, booking.unit_id
  FROM biz_homestay_booking booking
  WHERE booking.is_deleted = false
    AND booking.status IN ('confirmed', 'checked_in')
  UNION
  SELECT DISTINCT room.tenant_id, room.park_id, room.unit_id
  FROM biz_apartment_room room
  WHERE room.is_deleted = false
    AND room.management_status = 'enabled'
  UNION
  SELECT DISTINCT config.tenant_id, config.park_id, config.unit_id
  FROM biz_property_operation_config config
  WHERE config.is_deleted = false
    AND config.operating_mode = 'short_stay'
)
UPDATE biz_unit unit
   SET usage_type = 70,
       update_time = now()
  FROM housing_unit_candidates candidate
 WHERE unit.tenant_id = candidate.tenant_id
   AND unit.park_id = candidate.park_id
   AND unit.id = candidate.unit_id
   AND unit.is_deleted = false
   AND unit.usage_type <> 70
   AND NOT EXISTS (
     SELECT 1
     FROM rel_leasing_contract_unit relation
     JOIN biz_leasing_contract contract ON contract.id = relation.contract_id
    WHERE relation.tenant_id = unit.tenant_id
      AND relation.park_id = unit.park_id
      AND relation.unit_id = unit.id
      AND relation.is_deleted = false
      AND relation.status = 1
      AND contract.is_deleted = false
      AND contract.status NOT IN ('90', '91')
      AND (relation.end_date + interval '1 day') > (now() AT TIME ZONE 'Asia/Shanghai')::date
   );

COMMIT;
