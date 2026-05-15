-- DEV ONLY. DO NOT RUN IN PROD.
-- S1 development-only accounts for local self-test.
-- Password for both users: Jinhu@123456
-- Replace or remove this seed before any shared/staging/production deployment.

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id,
    '00000000-0000-4000-8000-000000000201'::uuid AS org_id,
    '00000000-0000-4000-8000-000000001001'::uuid AS admin_user_id,
    '00000000-0000-4000-8000-000000001002'::uuid AS normal_user_id,
    '00000000-0000-4000-8000-000000002001'::uuid AS admin_role_id,
    '00000000-0000-4000-8000-000000002002'::uuid AS normal_role_id
),
upsert_org AS (
  INSERT INTO sys_org (
    id,
    tenant_id,
    park_id,
    org_code,
    org_name,
    org_type,
    sort_order,
    status,
    remark
  )
  SELECT
    org_id,
    tenant_id,
    park_id,
    'JH_ROOT',
    '金湖科创产业园',
    'park',
    0,
    'enabled',
    'S1 dev seed organization'
  FROM seed_scope
  ON CONFLICT (tenant_id, park_id, org_code) WHERE is_deleted = false DO UPDATE SET
    org_name = EXCLUDED.org_name,
    org_type = EXCLUDED.org_type,
    status = 'enabled',
    update_time = now()
  RETURNING id
),
upsert_roles AS (
  INSERT INTO sys_role (
    id,
    tenant_id,
    park_id,
    code,
    name,
    is_enabled,
    status,
    remark
  )
  SELECT admin_role_id, tenant_id, park_id, 'SUPER_ADMIN', '超级管理员', true, 'enabled', 'S1 dev seed role'
  FROM seed_scope
  UNION ALL
  SELECT normal_role_id, tenant_id, park_id, 'S1_NORMAL', 'S1 普通用户', true, 'enabled', 'S1 dev seed role'
  FROM seed_scope
  ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO UPDATE SET
    name = EXCLUDED.name,
    is_enabled = true,
    status = 'enabled',
    update_time = now()
  RETURNING id, code
),
upsert_users AS (
  INSERT INTO sys_user (
    id,
    tenant_id,
    park_id,
    username,
    display_name,
    password_hash,
    mobile,
    email,
    is_enabled,
    status,
    remark
  )
  SELECT
    admin_user_id,
    tenant_id,
    park_id,
    'admin',
    '系统管理员',
    '$2b$12$tS1KYDt3dKKsYOsyiEMpbujHOIehHVKLGvoO5zQVwCKxE.oyvdG06',
    '13800000001',
    'admin@jinhu.local',
    true,
    'enabled',
    'S1 dev seed user'
  FROM seed_scope
  UNION ALL
  SELECT
    normal_user_id,
    tenant_id,
    park_id,
    's1_user',
    'S1 普通用户',
    '$2b$12$1VDxTxrK9XgWgYf4DCbGy.jYpSgEtypK90x/kEcG8GOVRO7BgAoHe',
    '13800000002',
    's1_user@jinhu.local',
    true,
    'enabled',
    'S1 dev seed user'
  FROM seed_scope
  ON CONFLICT (tenant_id, park_id, username) WHERE is_deleted = false DO UPDATE SET
    display_name = EXCLUDED.display_name,
    password_hash = EXCLUDED.password_hash,
    mobile = EXCLUDED.mobile,
    email = EXCLUDED.email,
    is_enabled = true,
    status = 'enabled',
    update_time = now()
  RETURNING id, username
),
upsert_user_org AS (
  INSERT INTO rel_user_org (
    tenant_id,
    park_id,
    user_id,
    org_id,
    is_primary,
    remark
  )
  SELECT tenant_id, park_id, admin_user_id, org_id, true, 'S1 dev seed user org'
  FROM seed_scope s
  WHERE NOT EXISTS (
    SELECT 1
    FROM rel_user_org ruo
    WHERE ruo.tenant_id = s.tenant_id
      AND ruo.park_id = s.park_id
      AND ruo.user_id = s.admin_user_id
      AND ruo.org_id = s.org_id
      AND ruo.is_deleted = false
  )
  UNION ALL
  SELECT tenant_id, park_id, normal_user_id, org_id, true, 'S1 dev seed user org'
  FROM seed_scope s
  WHERE NOT EXISTS (
    SELECT 1
    FROM rel_user_org ruo
    WHERE ruo.tenant_id = s.tenant_id
      AND ruo.park_id = s.park_id
      AND ruo.user_id = s.normal_user_id
      AND ruo.org_id = s.org_id
      AND ruo.is_deleted = false
  )
  RETURNING id
),
upsert_user_role AS (
  INSERT INTO rel_user_role (
    tenant_id,
    park_id,
    user_id,
    role_id,
    remark
  )
  SELECT tenant_id, park_id, admin_user_id, admin_role_id, 'S1 dev seed user role'
  FROM seed_scope
  UNION ALL
  SELECT tenant_id, park_id, normal_user_id, normal_role_id, 'S1 dev seed user role'
  FROM seed_scope
  ON CONFLICT (tenant_id, park_id, user_id, role_id) WHERE is_deleted = false DO UPDATE SET
    is_deleted = false,
    update_time = now()
  RETURNING id
),
admin_role_permissions AS (
  INSERT INTO rel_role_perm (
    tenant_id,
    park_id,
    role_id,
    permission_id,
    remark
  )
  SELECT p.tenant_id, p.park_id, s.admin_role_id, p.id, 'S1 dev seed admin permissions'
  FROM sys_permission p
  CROSS JOIN seed_scope s
  WHERE p.tenant_id = s.tenant_id
    AND p.park_id = s.park_id
    AND p.is_deleted = false
  ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
    is_deleted = false,
    update_time = now()
  RETURNING id
),
normal_role_permissions AS (
  INSERT INTO rel_role_perm (
    tenant_id,
    park_id,
    role_id,
    permission_id,
    remark
  )
  SELECT p.tenant_id, p.park_id, s.normal_role_id, p.id, 'S1 dev seed normal permissions'
  FROM sys_permission p
  CROSS JOIN seed_scope s
  WHERE p.tenant_id = s.tenant_id
    AND p.park_id = s.park_id
    AND p.is_deleted = false
    AND p.code IN (
      'system:user:me',
      'system:org:list',
      'system:user:list',
      'system:role:list',
      'system:permission:list',
      'system:dict-type:list',
      'system:dict-item:list',
      'file:read',
      'file:upload'
    )
  ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
    is_deleted = false,
    update_time = now()
  RETURNING id
)
SELECT
  (SELECT count(*) FROM upsert_users) AS users_seeded,
  (SELECT count(*) FROM upsert_roles) AS roles_seeded,
  (SELECT count(*) FROM admin_role_permissions) AS admin_permissions_seeded,
  (SELECT count(*) FROM normal_role_permissions) AS normal_permissions_seeded;

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
buildings(building_code, building_name, floor_count, build_area, sort_no) AS (
  VALUES
    ('JH-B01', '1号楼', 12, 32000.00, 10),
    ('JH-B02', '2号楼', 10, 28000.00, 20),
    ('JH-B03', '3号楼', 8, 22000.00, 30)
)
INSERT INTO biz_building (
  tenant_id,
  park_id,
  building_code,
  building_name,
  floor_count,
  build_area,
  status,
  sort_no,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  buildings.building_code,
  buildings.building_name,
  buildings.floor_count,
  buildings.build_area,
  1,
  buildings.sort_no,
  'S2-02 dev-only test building seed'
FROM buildings
CROSS JOIN seed_scope
ON CONFLICT (building_code) WHERE is_deleted = false DO UPDATE SET
  building_name = EXCLUDED.building_name,
  floor_count = EXCLUDED.floor_count,
  build_area = EXCLUDED.build_area,
  status = EXCLUDED.status,
  sort_no = EXCLUDED.sort_no,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
floors(building_code, floor_code, floor_no, floor_name, floor_area, sort_no) AS (
  VALUES
    ('JH-B01', 'JH-B01-F01', 1, '1号楼1层', 2600.00, 10),
    ('JH-B01', 'JH-B01-F02', 2, '1号楼2层', 2600.00, 20),
    ('JH-B01', 'JH-B01-F03', 3, '1号楼3层', 2600.00, 30),
    ('JH-B02', 'JH-B02-F01', 1, '2号楼1层', 2400.00, 10),
    ('JH-B02', 'JH-B02-F02', 2, '2号楼2层', 2400.00, 20)
)
INSERT INTO biz_floor (
  tenant_id,
  park_id,
  building_id,
  floor_code,
  floor_no,
  floor_name,
  floor_area,
  status,
  sort_no,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  building.id,
  floors.floor_code,
  floors.floor_no,
  floors.floor_name,
  floors.floor_area,
  1,
  floors.sort_no,
  'S2-03 dev-only test floor seed'
FROM floors
CROSS JOIN seed_scope
JOIN biz_building building
  ON building.tenant_id = seed_scope.tenant_id
 AND building.park_id = seed_scope.park_id
 AND building.building_code = floors.building_code
 AND building.is_deleted = false
ON CONFLICT (floor_code) WHERE is_deleted = false DO UPDATE SET
  building_id = EXCLUDED.building_id,
  floor_no = EXCLUDED.floor_no,
  floor_name = EXCLUDED.floor_name,
  floor_area = EXCLUDED.floor_area,
  status = EXCLUDED.status,
  sort_no = EXCLUDED.sort_no,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
units(unit_code, building_code, floor_code, unit_name, usage_type, unit_area, use_area, rental_status, fitting_status, ref_price, available_date) AS (
  VALUES
    ('JH-B01-F01-R0101', 'JH-B01', 'JH-B01-F01', '1号楼101', 10, 128.00, 112.00, 10, 30, 6800.00, CURRENT_DATE),
    ('JH-B01-F01-R0102', 'JH-B01', 'JH-B01-F01', '1号楼102', 10, 156.00, 138.00, 20, 20, 7800.00, CURRENT_DATE + INTERVAL '15 days'),
    ('JH-B01-F02-R0201', 'JH-B01', 'JH-B01-F02', '1号楼201', 50, 320.00, 290.00, 10, 30, 16800.00, CURRENT_DATE),
    ('JH-B01-F03-R0301', 'JH-B01', 'JH-B01-F03', '1号楼301', 20, 520.00, 480.00, 30, 20, 26000.00, CURRENT_DATE),
    ('JH-B02-F01-R0101', 'JH-B02', 'JH-B02-F01', '2号楼101', 40, 220.00, 198.00, 10, 10, 9900.00, CURRENT_DATE + INTERVAL '30 days')
)
INSERT INTO biz_unit (
  tenant_id,
  park_id,
  unit_code,
  building_id,
  floor_id,
  unit_name,
  usage_type,
  unit_area,
  use_area,
  rental_status,
  fitting_status,
  ref_price,
  available_date,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  units.unit_code,
  building.id,
  floor.id,
  units.unit_name,
  units.usage_type,
  units.unit_area,
  units.use_area,
  units.rental_status,
  units.fitting_status,
  units.ref_price,
  units.available_date::date,
  1,
  'S2-04 dev-only test unit seed'
FROM units
CROSS JOIN seed_scope
JOIN biz_building building
  ON building.tenant_id = seed_scope.tenant_id
 AND building.park_id = seed_scope.park_id
 AND building.building_code = units.building_code
 AND building.is_deleted = false
JOIN biz_floor floor
  ON floor.tenant_id = seed_scope.tenant_id
 AND floor.park_id = seed_scope.park_id
 AND floor.floor_code = units.floor_code
 AND floor.building_id = building.id
 AND floor.is_deleted = false
ON CONFLICT (tenant_id, park_id, unit_code) WHERE is_deleted = false DO UPDATE SET
  building_id = EXCLUDED.building_id,
  floor_id = EXCLUDED.floor_id,
  unit_name = EXCLUDED.unit_name,
  usage_type = EXCLUDED.usage_type,
  unit_area = EXCLUDED.unit_area,
  use_area = EXCLUDED.use_area,
  rental_status = EXCLUDED.rental_status,
  fitting_status = EXCLUDED.fitting_status,
  ref_price = EXCLUDED.ref_price,
  available_date = EXCLUDED.available_date,
  status = EXCLUDED.status,
  is_deleted = false,
  update_time = now();

INSERT INTO rel_user_park (
  tenant_id,
  user_id,
  park_id,
  is_default,
  status,
  remark
)
VALUES
  ('10000001', '00000000-0000-4000-8000-000000001001'::uuid, '20000001', true, 'enabled', 'DEV ONLY default park authorization for admin'),
  ('10000001', '00000000-0000-4000-8000-000000001002'::uuid, '20000001', true, 'enabled', 'DEV ONLY default park authorization for normal user')
ON CONFLICT (tenant_id, user_id, park_id) WHERE is_deleted = false DO UPDATE SET
  is_default = EXCLUDED.is_default,
  status = EXCLUDED.status,
  remark = EXCLUDED.remark,
  update_time = now();
