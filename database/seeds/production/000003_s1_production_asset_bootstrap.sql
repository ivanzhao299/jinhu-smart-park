-- Production-safe baseline asset bootstrap.
-- Only inserts minimal building / floor / unit references when the current park
-- has no active asset structure yet.

WITH seed_scope AS (
  SELECT
    '10000001'::varchar AS tenant_id,
    '20000001'::varchar AS park_id
),
buildings(building_code, building_name, floor_count, build_area, sort_no) AS (
  VALUES
    ('A1', 'A1号楼', 8, 16800.00, 10),
    ('A3', 'A3号楼', 6, 13600.00, 20),
    ('A5', 'A5号楼', 8, 18400.00, 30)
),
building_seed_guard AS (
  SELECT 1 AS should_seed
  FROM seed_scope
  WHERE NOT EXISTS (
    SELECT 1
    FROM biz_building building
    WHERE building.tenant_id = seed_scope.tenant_id
      AND building.park_id = seed_scope.park_id
      AND building.is_deleted = false
      AND building.status = 1
  )
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
  'S1 production-safe baseline asset bootstrap'
FROM buildings
CROSS JOIN seed_scope
JOIN building_seed_guard ON true
ON CONFLICT (building_code) WHERE is_deleted = false DO NOTHING;

WITH seed_scope AS (
  SELECT
    '10000001'::varchar AS tenant_id,
    '20000001'::varchar AS park_id
),
floors(building_code, floor_code, floor_no, floor_name, floor_area, sort_no) AS (
  VALUES
    ('A1', 'A1-F01', 1, 'A1 1F', 2100.00, 10),
    ('A1', 'A1-F02', 2, 'A1 2F', 2100.00, 20),
    ('A3', 'A3-F01', 1, 'A3 1F', 2200.00, 10),
    ('A5', 'A5-F01', 1, 'A5 1F', 2300.00, 10),
    ('A5', 'A5-F03', 3, 'A5 3F', 2300.00, 30)
),
floor_seed_guard AS (
  SELECT 1 AS should_seed
  FROM seed_scope
  WHERE NOT EXISTS (
    SELECT 1
    FROM biz_floor floor
    WHERE floor.tenant_id = seed_scope.tenant_id
      AND floor.park_id = seed_scope.park_id
      AND floor.is_deleted = false
      AND floor.status = 1
  )
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
  'S1 production-safe baseline floor bootstrap'
FROM floors
CROSS JOIN seed_scope
JOIN floor_seed_guard ON true
JOIN biz_building building
  ON building.tenant_id = seed_scope.tenant_id
 AND building.park_id = seed_scope.park_id
 AND building.building_code = floors.building_code
 AND building.is_deleted = false
ON CONFLICT (floor_code) WHERE is_deleted = false DO NOTHING;

WITH seed_scope AS (
  SELECT
    '10000001'::varchar AS tenant_id,
    '20000001'::varchar AS park_id
),
units(unit_code, building_code, floor_code, unit_name, usage_type, unit_area, use_area, rental_status, fitting_status, ref_price, available_date) AS (
  VALUES
    ('A1-F01-U01', 'A1', 'A1-F01', 'A1 1F / U01', 10, 126.00, 110.00, 10, 30, 6800.00, CURRENT_DATE),
    ('A1-F02-U01', 'A1', 'A1-F02', 'A1 2F / U01', 10, 132.00, 118.00, 20, 20, 7200.00, CURRENT_DATE + INTERVAL '14 days'),
    ('A3-F01-U01', 'A3', 'A3-F01', 'A3 1F / U01', 20, 280.00, 248.00, 10, 20, 11800.00, CURRENT_DATE),
    ('A5-F01-U01', 'A5', 'A5-F01', 'A5 1F / U01', 40, 196.00, 172.00, 10, 10, 9900.00, CURRENT_DATE),
    ('A5-F03-U01', 'A5', 'A5-F03', 'A5 3F / U01', 50, 420.00, 386.00, 30, 20, 18600.00, CURRENT_DATE + INTERVAL '30 days')
),
unit_seed_guard AS (
  SELECT 1 AS should_seed
  FROM seed_scope
  WHERE NOT EXISTS (
    SELECT 1
    FROM biz_unit unit
    WHERE unit.tenant_id = seed_scope.tenant_id
      AND unit.park_id = seed_scope.park_id
      AND unit.is_deleted = false
      AND unit.status = 1
  )
)
INSERT INTO biz_unit (
  tenant_id,
  park_id,
  unit_code,
  code,
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
  'S1 production-safe baseline unit bootstrap'
FROM units
CROSS JOIN seed_scope
JOIN unit_seed_guard ON true
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
ON CONFLICT (tenant_id, park_id, unit_code) WHERE is_deleted = false DO NOTHING;
