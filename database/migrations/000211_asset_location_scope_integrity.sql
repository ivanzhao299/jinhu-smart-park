BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

SELECT pg_advisory_xact_lock(hashtextextended('000211-asset-location-scope-integrity', 0));

LOCK TABLE biz_park, biz_building, biz_floor, biz_unit IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  drift record;
BEGIN
  SELECT b.id, b.tenant_id, b.park_id INTO drift
  FROM biz_building b
  WHERE NOT EXISTS (
    SELECT 1
    FROM biz_park p
    WHERE p.tenant_id = b.tenant_id
      AND p.park_id = b.park_id
      AND p.status = 1
      AND p.is_deleted = false
  )
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'asset location scope preflight failed: building % references missing active park scope %/%', drift.id, drift.tenant_id, drift.park_id;
  END IF;

  SELECT f.id, f.building_id INTO drift
  FROM biz_floor f
  JOIN biz_building b ON b.id = f.building_id
  WHERE (f.tenant_id, f.park_id) IS DISTINCT FROM (b.tenant_id, b.park_id)
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'asset location scope preflight failed: floor % scope differs from building %', drift.id, drift.building_id;
  END IF;

  SELECT u.id, u.building_id INTO drift
  FROM biz_unit u
  JOIN biz_building b ON b.id = u.building_id
  WHERE (u.tenant_id, u.park_id) IS DISTINCT FROM (b.tenant_id, b.park_id)
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'asset location scope preflight failed: unit % scope differs from building %', drift.id, drift.building_id;
  END IF;

  SELECT u.id, u.floor_id INTO drift
  FROM biz_unit u
  JOIN biz_floor f ON f.id = u.floor_id
  WHERE (u.tenant_id, u.park_id) IS DISTINCT FROM (f.tenant_id, f.park_id)
     OR u.building_id IS DISTINCT FROM f.building_id
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'asset location scope preflight failed: unit % scope/building differs from floor %', drift.id, drift.floor_id;
  END IF;
END $$;

ALTER TABLE biz_building
  ADD CONSTRAINT uq_biz_building_scope_id UNIQUE (tenant_id, park_id, id);
ALTER TABLE biz_floor
  ADD CONSTRAINT uq_biz_floor_scope_id UNIQUE (tenant_id, park_id, id),
  ADD CONSTRAINT uq_biz_floor_scope_building_id UNIQUE (tenant_id, park_id, building_id, id);

ALTER TABLE biz_floor
  ADD CONSTRAINT fk_biz_floor_building_scope
  FOREIGN KEY (tenant_id, park_id, building_id)
  REFERENCES biz_building (tenant_id, park_id, id) NOT VALID;

ALTER TABLE biz_unit
  ADD CONSTRAINT fk_biz_unit_building_scope
  FOREIGN KEY (tenant_id, park_id, building_id)
  REFERENCES biz_building (tenant_id, park_id, id) NOT VALID,
  ADD CONSTRAINT fk_biz_unit_floor_scope
  FOREIGN KEY (tenant_id, park_id, building_id, floor_id)
  REFERENCES biz_floor (tenant_id, park_id, building_id, id) NOT VALID;

DROP INDEX IF EXISTS uq_biz_building_code_active;
DROP INDEX IF EXISTS idx_biz_building_entity_code;
CREATE UNIQUE INDEX uq_biz_building_code_active
  ON biz_building (tenant_id, park_id, building_code)
  WHERE is_deleted = false;

DROP INDEX IF EXISTS uq_biz_floor_code_active;
DROP INDEX IF EXISTS idx_biz_floor_entity_code;
CREATE UNIQUE INDEX uq_biz_floor_code_active
  ON biz_floor (tenant_id, park_id, floor_code)
  WHERE is_deleted = false;

ALTER TABLE biz_floor VALIDATE CONSTRAINT fk_biz_floor_building_scope;
ALTER TABLE biz_unit VALIDATE CONSTRAINT fk_biz_unit_building_scope;
ALTER TABLE biz_unit VALIDATE CONSTRAINT fk_biz_unit_floor_scope;

COMMIT;
