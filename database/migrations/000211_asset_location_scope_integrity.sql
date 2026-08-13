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
  WHERE b.is_deleted = false
    AND NOT (
      (SELECT count(*) FROM biz_park p
       WHERE p.tenant_id = b.tenant_id AND p.park_id = b.park_id
         AND p.status = 1 AND p.is_deleted = false) = 1
      OR (
        b.tenant_id = '10000001' AND b.park_id = '20000001'
        AND (SELECT count(*) FROM biz_park exact_source
             WHERE exact_source.tenant_id = b.tenant_id AND exact_source.park_id = b.park_id
               AND exact_source.status = 1 AND exact_source.is_deleted = false) = 0
        AND (SELECT count(*) FROM biz_park fallback
             WHERE fallback.park_code = 'JH' AND fallback.status = 1 AND fallback.is_deleted = false) = 1
      )
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

CREATE OR REPLACE FUNCTION enforce_biz_building_active_park_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_deleted THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('asset-park-canonical-source', 0));
  IF NOT (
    (SELECT count(*) FROM biz_park p
     WHERE p.tenant_id = NEW.tenant_id AND p.park_id = NEW.park_id
       AND p.status = 1 AND p.is_deleted = false) = 1
    OR (
      NEW.tenant_id = '10000001' AND NEW.park_id = '20000001'
      AND (SELECT count(*) FROM biz_park exact_source
           WHERE exact_source.tenant_id = NEW.tenant_id AND exact_source.park_id = NEW.park_id
             AND exact_source.status = 1 AND exact_source.is_deleted = false) = 0
      AND (SELECT count(*) FROM biz_park fallback
           WHERE fallback.park_code = 'JH' AND fallback.status = 1 AND fallback.is_deleted = false) = 1
    )
  ) THEN
    RAISE EXCEPTION 'building requires an active park scope' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_biz_building_active_park_scope
BEFORE INSERT OR UPDATE OF tenant_id, park_id, is_deleted ON biz_building
FOR EACH ROW EXECUTE FUNCTION enforce_biz_building_active_park_scope();

CREATE OR REPLACE FUNCTION protect_biz_park_active_scope_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 1 OR NEW.is_deleted THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('asset-park-canonical-source', 0));
  IF EXISTS (
    SELECT 1 FROM biz_building b
    WHERE b.tenant_id = NEW.tenant_id AND b.park_id = NEW.park_id AND b.is_deleted = false
  ) AND EXISTS (
    SELECT 1 FROM biz_park source
    WHERE source.tenant_id = NEW.tenant_id AND source.park_id = NEW.park_id
      AND source.status = 1 AND source.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'active park scope with buildings already has a canonical park' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_biz_park_active_scope_insert
BEFORE INSERT ON biz_park
FOR EACH ROW EXECUTE FUNCTION protect_biz_park_active_scope_insert();

CREATE OR REPLACE FUNCTION protect_biz_park_building_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  removes_active_jh boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('asset-park-canonical-source', 0));

  IF TG_OP = 'UPDATE'
     AND NEW.status = 1 AND NEW.is_deleted = false
     AND (
       OLD.status <> 1 OR OLD.is_deleted = true
       OR (OLD.tenant_id, OLD.park_id) IS DISTINCT FROM (NEW.tenant_id, NEW.park_id)
     )
     AND EXISTS (
       SELECT 1 FROM biz_building b
       WHERE b.tenant_id = NEW.tenant_id AND b.park_id = NEW.park_id AND b.is_deleted = false
     )
     AND EXISTS (
       SELECT 1 FROM biz_park source
       WHERE source.tenant_id = NEW.tenant_id AND source.park_id = NEW.park_id
         AND source.status = 1 AND source.is_deleted = false AND source.id <> OLD.id
     )
  THEN
    RAISE EXCEPTION 'active park scope with buildings already has a canonical park' USING ERRCODE = '23505';
  END IF;

  removes_active_jh := TG_OP = 'DELETE';
  IF TG_OP = 'UPDATE' THEN
    removes_active_jh := NEW.park_code <> 'JH' OR NEW.status <> 1 OR NEW.is_deleted = true;
  END IF;

  IF OLD.park_code = 'JH' AND OLD.status = 1 AND OLD.is_deleted = false
     AND EXISTS (
       SELECT 1 FROM biz_building b
       WHERE b.tenant_id = '10000001' AND b.park_id = '20000001' AND b.is_deleted = false
     )
     AND NOT EXISTS (
       SELECT 1 FROM biz_park exact_source
       WHERE exact_source.tenant_id = '10000001' AND exact_source.park_id = '20000001'
         AND exact_source.status = 1 AND exact_source.is_deleted = false
         AND exact_source.id <> OLD.id
     )
     AND removes_active_jh
     AND NOT EXISTS (
       SELECT 1 FROM biz_park fallback
       WHERE fallback.park_code = 'JH' AND fallback.status = 1 AND fallback.is_deleted = false
         AND fallback.id <> OLD.id
     )
  THEN
    RAISE EXCEPTION 'active park scope with buildings requires a surviving canonical park' USING ERRCODE = '23503';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM biz_building b
      WHERE b.tenant_id = OLD.tenant_id AND b.park_id = OLD.park_id
        AND b.is_deleted = false
    ) AND NOT EXISTS (
      SELECT 1 FROM biz_park survivor
      WHERE survivor.tenant_id = OLD.tenant_id AND survivor.park_id = OLD.park_id
        AND survivor.id <> OLD.id AND survivor.status = 1 AND survivor.is_deleted = false
      FOR KEY SHARE
    ) THEN
      RAISE EXCEPTION 'active park scope with buildings requires a surviving canonical park' USING ERRCODE = '23503';
    END IF;
    RETURN OLD;
  END IF;

  IF (OLD.tenant_id, OLD.park_id, OLD.status, OLD.is_deleted)
     IS DISTINCT FROM (NEW.tenant_id, NEW.park_id, NEW.status, NEW.is_deleted)
     AND OLD.status = 1 AND OLD.is_deleted = false
     AND EXISTS (
       SELECT 1 FROM biz_building b
       WHERE b.tenant_id = OLD.tenant_id AND b.park_id = OLD.park_id
         AND b.is_deleted = false
     )
     AND NOT EXISTS (
       SELECT 1 FROM biz_park survivor
       WHERE survivor.tenant_id = OLD.tenant_id AND survivor.park_id = OLD.park_id
         AND survivor.id <> OLD.id AND survivor.status = 1 AND survivor.is_deleted = false
       FOR KEY SHARE
     )
  THEN
    RAISE EXCEPTION 'active park scope with buildings requires a surviving canonical park' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_biz_park_building_scope
BEFORE UPDATE OF tenant_id, park_id, park_code, status, is_deleted ON biz_park
FOR EACH ROW EXECUTE FUNCTION protect_biz_park_building_scope();

CREATE TRIGGER trg_biz_park_building_scope_delete
BEFORE DELETE ON biz_park
FOR EACH ROW EXECUTE FUNCTION protect_biz_park_building_scope();

COMMIT;
