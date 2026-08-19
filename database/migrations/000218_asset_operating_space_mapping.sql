BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

SELECT pg_advisory_xact_lock(hashtextextended('000218-asset-operating-space-mapping', 0));

ALTER TABLE biz_building ADD COLUMN IF NOT EXISTS asset_building_id uuid REFERENCES asset_building(id);
ALTER TABLE biz_floor ADD COLUMN IF NOT EXISTS asset_floor_id uuid REFERENCES asset_floor(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_building_asset_mapping_active
  ON biz_building (tenant_id, park_id, asset_building_id)
  WHERE is_deleted=false AND asset_building_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_biz_floor_asset_mapping_active
  ON biz_floor (tenant_id, park_id, asset_floor_id)
  WHERE is_deleted=false AND asset_floor_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS biz_asset_space_mapping_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  entity_type varchar(16) NOT NULL,
  asset_id uuid NOT NULL,
  business_id uuid NOT NULL,
  action varchar(16) NOT NULL,
  reason varchar(500) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  operator_id uuid NOT NULL,
  mapping_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_asset_space_mapping_entity CHECK (entity_type IN ('building','floor','unit')),
  CONSTRAINT ck_asset_space_mapping_action CHECK (action IN ('create','link','unlink')),
  CONSTRAINT ck_asset_space_mapping_reason CHECK (length(btrim(reason)) > 0),
  CONSTRAINT ck_asset_space_mapping_key CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 128),
  CONSTRAINT uq_asset_space_mapping_audit_idempotency
    UNIQUE (tenant_id, park_id, entity_type, action, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_asset_space_mapping_audit_asset
  ON biz_asset_space_mapping_audit (tenant_id, park_id, entity_type, asset_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_space_mapping_audit_business
  ON biz_asset_space_mapping_audit (tenant_id, park_id, entity_type, business_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION enforce_asset_operating_space_mapping()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_asset_building_id uuid;
  parent_asset_floor_id uuid;
BEGIN
  IF NEW.is_deleted THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'biz_building' AND (to_jsonb(NEW)->>'asset_building_id') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM asset_building source
      WHERE source.id=NEW.asset_building_id AND source.is_deleted=false
        AND source.tenant_id::text=NEW.tenant_id AND source.park_id::text=NEW.park_id
    ) THEN
      RAISE EXCEPTION 'asset building mapping does not belong to business building scope'
        USING ERRCODE='23503';
    END IF;
  ELSIF TG_TABLE_NAME = 'biz_floor' AND (to_jsonb(NEW)->>'asset_floor_id') IS NOT NULL THEN
    SELECT building_id INTO parent_asset_building_id
    FROM asset_floor source
    WHERE source.id=NEW.asset_floor_id AND source.is_deleted=false
      AND source.tenant_id::text=NEW.tenant_id AND source.park_id::text=NEW.park_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'asset floor mapping does not belong to business floor scope'
        USING ERRCODE='23503';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM biz_building parent
      WHERE parent.id=NEW.building_id AND parent.tenant_id=NEW.tenant_id
        AND parent.park_id=NEW.park_id AND parent.is_deleted=false
        AND parent.asset_building_id=parent_asset_building_id
    ) THEN
      RAISE EXCEPTION 'asset floor mapping parent building mismatch'
        USING ERRCODE='23503';
    END IF;
  ELSIF TG_TABLE_NAME = 'biz_unit' AND (to_jsonb(NEW)->>'asset_unit_id') IS NOT NULL THEN
    SELECT source.building_id, source.floor_id
      INTO parent_asset_building_id, parent_asset_floor_id
    FROM asset_unit source
    WHERE source.id=NEW.asset_unit_id AND source.is_deleted=false
      AND source.tenant_id::text=NEW.tenant_id AND source.park_id::text=NEW.park_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'asset unit mapping does not belong to business unit scope'
        USING ERRCODE='23503';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM biz_building building
      JOIN biz_floor floor ON floor.id=NEW.floor_id
        AND floor.tenant_id=NEW.tenant_id AND floor.park_id=NEW.park_id
        AND floor.building_id=NEW.building_id AND floor.is_deleted=false
      WHERE building.id=NEW.building_id AND building.tenant_id=NEW.tenant_id
        AND building.park_id=NEW.park_id AND building.is_deleted=false
        AND building.asset_building_id=parent_asset_building_id
        AND floor.asset_floor_id=parent_asset_floor_id
    ) THEN
      RAISE EXCEPTION 'asset unit mapping parent building or floor mismatch'
        USING ERRCODE='23503';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_biz_building_asset_mapping ON biz_building;
CREATE TRIGGER trg_biz_building_asset_mapping
BEFORE INSERT OR UPDATE OF tenant_id, park_id, asset_building_id, is_deleted ON biz_building
FOR EACH ROW EXECUTE FUNCTION enforce_asset_operating_space_mapping();

DROP TRIGGER IF EXISTS trg_biz_floor_asset_mapping ON biz_floor;
CREATE TRIGGER trg_biz_floor_asset_mapping
BEFORE INSERT OR UPDATE OF tenant_id, park_id, building_id, asset_floor_id, is_deleted ON biz_floor
FOR EACH ROW EXECUTE FUNCTION enforce_asset_operating_space_mapping();

DROP TRIGGER IF EXISTS trg_biz_unit_asset_mapping_chain ON biz_unit;
CREATE TRIGGER trg_biz_unit_asset_mapping_chain
BEFORE INSERT OR UPDATE OF tenant_id, park_id, building_id, floor_id, asset_unit_id, is_deleted ON biz_unit
FOR EACH ROW EXECUTE FUNCTION enforce_asset_operating_space_mapping();

CREATE OR REPLACE FUNCTION enforce_asset_space_mapping_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'asset-space-mapping-audit-immutable' USING ERRCODE='55000';
END $$;

DROP TRIGGER IF EXISTS trg_asset_space_mapping_audit_immutable ON biz_asset_space_mapping_audit;
CREATE TRIGGER trg_asset_space_mapping_audit_immutable
BEFORE UPDATE OR DELETE ON biz_asset_space_mapping_audit
FOR EACH ROW EXECUTE FUNCTION enforce_asset_space_mapping_audit_immutable();

REVOKE UPDATE, DELETE ON biz_asset_space_mapping_audit FROM PUBLIC;

COMMIT;
