-- Repair real-UAT blockers:
-- 1. finance roles can read tenant master data needed by leasing finance flows;
-- 2. field/safety roles can upload evidence files;
-- 3. property staff can confirm/evaluate work orders they reported;
-- 4. leasing lead source dictionary and stored values are normalized to semantic business codes.

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('FINANCE_MANAGER', 'park_tenant:read'),
    ('FINANCE_MANAGER', 'park_tenant:360'),
    ('FINANCE_MANAGER', 'park_tenant_contact:read'),
    ('FINANCE_MANAGER', 'park_tenant_qualification:read'),
    ('FINANCE_SPECIALIST', 'park_tenant:read'),
    ('FINANCE_SPECIALIST', 'park_tenant:360'),
    ('FINANCE_SPECIALIST', 'park_tenant_contact:read'),
    ('FINANCE_SPECIALIST', 'park_tenant_qualification:read'),
    ('SAFETY_MANAGER', 'file:upload'),
    ('PROPERTY_MANAGER', 'file:read'),
    ('PROPERTY_MANAGER', 'file:upload'),
    ('PROPERTY_MANAGER', 'file:download'),
    ('PROPERTY_STAFF', 'file:read'),
    ('PROPERTY_STAFF', 'file:upload'),
    ('PROPERTY_STAFF', 'file:download'),
    ('PROPERTY_STAFF', 'workorder:confirm'),
    ('PROPERTY_STAFF', 'workorder:evaluate'),
    ('MAINTENANCE_ENGINEER', 'file:read'),
    ('MAINTENANCE_ENGINEER', 'file:upload'),
    ('MAINTENANCE_ENGINEER', 'file:download')
),
resolved_permissions AS (
  SELECT
    role.tenant_id,
    role.park_id,
    role.id AS role_id,
    permission.id AS permission_id
  FROM seed_scope
  JOIN role_permissions role_permission ON true
  JOIN sys_role role
    ON role.tenant_id = seed_scope.tenant_id
   AND role.park_id = seed_scope.park_id
   AND role.code = role_permission.role_code
   AND role.is_deleted = false
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.code = role_permission.permission_code
   AND permission.is_deleted = false
)
UPDATE rel_role_perm existing
SET is_deleted = false,
    update_time = now(),
    remark = 'Real-UAT blocker repair'
FROM resolved_permissions resolved
WHERE existing.tenant_id = resolved.tenant_id
  AND existing.park_id = resolved.park_id
  AND existing.role_id = resolved.role_id
  AND existing.permission_id = resolved.permission_id;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('FINANCE_MANAGER', 'park_tenant:read'),
    ('FINANCE_MANAGER', 'park_tenant:360'),
    ('FINANCE_MANAGER', 'park_tenant_contact:read'),
    ('FINANCE_MANAGER', 'park_tenant_qualification:read'),
    ('FINANCE_SPECIALIST', 'park_tenant:read'),
    ('FINANCE_SPECIALIST', 'park_tenant:360'),
    ('FINANCE_SPECIALIST', 'park_tenant_contact:read'),
    ('FINANCE_SPECIALIST', 'park_tenant_qualification:read'),
    ('SAFETY_MANAGER', 'file:upload'),
    ('PROPERTY_MANAGER', 'file:read'),
    ('PROPERTY_MANAGER', 'file:upload'),
    ('PROPERTY_MANAGER', 'file:download'),
    ('PROPERTY_STAFF', 'file:read'),
    ('PROPERTY_STAFF', 'file:upload'),
    ('PROPERTY_STAFF', 'file:download'),
    ('PROPERTY_STAFF', 'workorder:confirm'),
    ('PROPERTY_STAFF', 'workorder:evaluate'),
    ('MAINTENANCE_ENGINEER', 'file:read'),
    ('MAINTENANCE_ENGINEER', 'file:upload'),
    ('MAINTENANCE_ENGINEER', 'file:download')
),
resolved_permissions AS (
  SELECT
    role.tenant_id,
    role.park_id,
    role.id AS role_id,
    permission.id AS permission_id
  FROM seed_scope
  JOIN role_permissions role_permission ON true
  JOIN sys_role role
    ON role.tenant_id = seed_scope.tenant_id
   AND role.park_id = seed_scope.park_id
   AND role.code = role_permission.role_code
   AND role.is_deleted = false
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.code = role_permission.permission_code
   AND permission.is_deleted = false
)
INSERT INTO rel_role_perm (
  id,
  tenant_id,
  park_id,
  role_id,
  permission_id,
  create_time,
  update_time,
  is_deleted,
  version,
  remark
)
SELECT
  uuid_generate_v4(),
  resolved.tenant_id,
  resolved.park_id,
  resolved.role_id,
  resolved.permission_id,
  now(),
  now(),
  false,
  1,
  'Real-UAT blocker repair'
FROM resolved_permissions resolved
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_role_perm existing
  WHERE existing.tenant_id = resolved.tenant_id
    AND existing.park_id = resolved.park_id
    AND existing.role_id = resolved.role_id
    AND existing.permission_id = resolved.permission_id
    AND existing.is_deleted = false
);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
lead_source_type AS (
  SELECT dict_type.id, dict_type.tenant_id, dict_type.park_id
  FROM sys_dict_type dict_type
  JOIN seed_scope
    ON seed_scope.tenant_id = dict_type.tenant_id
   AND seed_scope.park_id = dict_type.park_id
  WHERE dict_type.dict_code = 'leasing_lead_source'
    AND dict_type.is_deleted = false
),
legacy_numeric_values(item_value) AS (
  VALUES ('10'), ('20'), ('30'), ('40'), ('50'), ('90')
)
UPDATE sys_dict_item item
SET status = 'disabled',
    is_deleted = true,
    remark = 'Retired legacy leasing lead source numeric value',
    update_time = now()
FROM lead_source_type
JOIN legacy_numeric_values legacy ON true
WHERE item.tenant_id = lead_source_type.tenant_id
  AND item.park_id = lead_source_type.park_id
  AND item.dict_type_id = lead_source_type.id
  AND item.item_value = legacy.item_value
  AND item.is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
lead_source_type AS (
  SELECT dict_type.id, dict_type.tenant_id, dict_type.park_id
  FROM sys_dict_type dict_type
  JOIN seed_scope
    ON seed_scope.tenant_id = dict_type.tenant_id
   AND seed_scope.park_id = dict_type.park_id
  WHERE dict_type.dict_code = 'leasing_lead_source'
    AND dict_type.is_deleted = false
),
desired_items(item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('人工录入', 'manual', 5, 'default'),
    ('渠道商', 'channel', 10, 'default'),
    ('主动来访', 'visit', 20, 'primary'),
    ('老客户介绍', 'referral', 30, 'success'),
    ('线上推广', 'online', 40, 'warning'),
    ('政府推荐', 'government', 50, 'primary'),
    ('其他', 'other', 90, 'default')
),
desired AS (
  SELECT lead_source_type.tenant_id,
         lead_source_type.park_id,
         lead_source_type.id AS dict_type_id,
         desired_items.item_label,
         desired_items.item_value,
         desired_items.sort_order,
         desired_items.tag_type
  FROM lead_source_type
  CROSS JOIN desired_items
),
updated_items AS (
  UPDATE sys_dict_item item
  SET item_label = desired.item_label,
      sort_order = desired.sort_order,
      status = 'enabled',
      tag_type = desired.tag_type,
      remark = 'Leasing lead source semantic normalization',
      is_deleted = false,
      update_time = now()
  FROM desired
  WHERE item.tenant_id = desired.tenant_id
    AND item.park_id = desired.park_id
    AND item.dict_type_id = desired.dict_type_id
    AND item.item_value = desired.item_value
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
  desired.tenant_id,
  desired.park_id,
  desired.dict_type_id,
  desired.item_label,
  desired.item_value,
  desired.sort_order,
  'enabled',
  desired.tag_type,
  'Leasing lead source semantic normalization'
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
source_aliases(old_value, new_value) AS (
  VALUES
    ('10', 'channel'),
    ('20', 'visit'),
    ('30', 'referral'),
    ('40', 'online'),
    ('50', 'government'),
    ('90', 'other'),
    ('manual', 'manual'),
    ('channel', 'channel'),
    ('partner', 'channel'),
    ('visit', 'visit'),
    ('walk_in', 'visit'),
    ('onsite', 'visit'),
    ('referral', 'referral'),
    ('online', 'online'),
    ('web', 'online'),
    ('government', 'government'),
    ('gov', 'government'),
    ('other', 'other')
)
UPDATE biz_leasing_lead lead
SET source = source_aliases.new_value,
    update_time = now()
FROM seed_scope, source_aliases
WHERE lead.tenant_id = seed_scope.tenant_id
  AND lead.park_id = seed_scope.park_id
  AND lead.is_deleted = false
  AND lead.source IS NOT NULL
  AND lead.source = source_aliases.old_value
  AND lead.source <> source_aliases.new_value;
