import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";
import { AssetSpaceMappingService } from "./asset-space-mapping.service";

const databaseUrl = process.env.DATABASE_URL;

test("PostgreSQL serializes competing asset-unit conversions and replays the winning key", {
  skip: databaseUrl ? false : "DATABASE_URL is required for PostgreSQL concurrency coverage"
}, async () => {
  const dataSource = new DataSource({ type: "postgres", url: databaseUrl });
  await dataSource.initialize();
  const schema = `asset_mapping_${randomUUID().replaceAll("-", "")}`;
  const tenantId = randomUUID();
  const parkId = randomUUID();
  const actorId = randomUUID();
  const assetBuildingId = randomUUID();
  const assetFloorId = randomUUID();
  const assetUnitId = randomUUID();
  const scope = { tenantId, parkId };
  try {
    await dataSource.query(`CREATE SCHEMA "${schema}"`);
    await dataSource.query(`SET search_path TO "${schema}", public`);
    await dataSource.query(`
      CREATE TABLE asset_building (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, park_id uuid NOT NULL, building_code varchar(64) NOT NULL,
        building_name varchar(100) NOT NULL, floor_count integer NOT NULL DEFAULT 0, total_area numeric(14,2) NOT NULL DEFAULT 0,
        sort_order integer NOT NULL DEFAULT 0, status varchar(32) NOT NULL DEFAULT 'enabled', is_deleted boolean NOT NULL DEFAULT false
      );
      CREATE TABLE asset_floor (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, park_id uuid NOT NULL, building_id uuid NOT NULL,
        floor_code varchar(64) NOT NULL, floor_name varchar(100) NOT NULL, floor_no integer NOT NULL,
        gross_area numeric(14,2) NOT NULL DEFAULT 0, rentable_area numeric(14,2) NOT NULL DEFAULT 0,
        sort_order integer NOT NULL DEFAULT 0, status varchar(32) NOT NULL DEFAULT 'enabled', is_deleted boolean NOT NULL DEFAULT false
      );
      CREATE TABLE asset_unit (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, park_id uuid NOT NULL, building_id uuid NOT NULL, floor_id uuid NOT NULL,
        unit_code varchar(64) NOT NULL, unit_name varchar(100) NOT NULL, unit_no varchar(64) NOT NULL,
        building_area numeric(14,2) NOT NULL DEFAULT 0, rentable_area numeric(14,2) NOT NULL DEFAULT 0,
        is_deleted boolean NOT NULL DEFAULT false
      );
      CREATE TABLE biz_building (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
        building_code varchar(64) NOT NULL, building_name varchar(100) NOT NULL, floor_count integer NOT NULL DEFAULT 0,
        build_area numeric(14,2) NOT NULL DEFAULT 0, status smallint NOT NULL DEFAULT 1, sort_no integer NOT NULL DEFAULT 0,
        create_by varchar(64), update_by varchar(64), create_time timestamptz NOT NULL DEFAULT now(), update_time timestamptz NOT NULL DEFAULT now(),
        is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1
      );
      CREATE UNIQUE INDEX uq_biz_building_code_active ON biz_building(tenant_id,park_id,building_code) WHERE is_deleted=false;
      CREATE TABLE biz_floor (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, building_id uuid NOT NULL,
        floor_code varchar(64) NOT NULL, floor_no integer NOT NULL, floor_name varchar(100) NOT NULL, floor_area numeric(14,2) NOT NULL DEFAULT 0,
        status smallint NOT NULL DEFAULT 1, sort_no integer NOT NULL DEFAULT 0, create_by varchar(64), update_by varchar(64),
        create_time timestamptz NOT NULL DEFAULT now(), update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false,
        version integer NOT NULL DEFAULT 1
      );
      CREATE UNIQUE INDEX uq_biz_floor_code_active ON biz_floor(tenant_id,park_id,floor_code) WHERE is_deleted=false;
      CREATE TABLE biz_unit (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
        unit_code varchar(64) NOT NULL, asset_unit_id uuid, code varchar(64), building_id uuid NOT NULL, floor_id uuid NOT NULL,
        unit_name varchar(100) NOT NULL, usage_type smallint NOT NULL, unit_area numeric(14,2) NOT NULL, use_area numeric(14,2) NOT NULL DEFAULT 0,
        rental_status smallint NOT NULL, fitting_status smallint NOT NULL, ref_price numeric(14,2) NOT NULL DEFAULT 0, available_date date,
        status smallint NOT NULL DEFAULT 1, create_by varchar(64), update_by varchar(64), create_time timestamptz NOT NULL DEFAULT now(),
        update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1, remark varchar(500)
      );
      CREATE UNIQUE INDEX idx_biz_unit_entity_scope_code ON biz_unit(tenant_id,park_id,unit_code) WHERE is_deleted=false;
      CREATE UNIQUE INDEX uq_biz_unit_asset_unit_active ON biz_unit(tenant_id,park_id,asset_unit_id) WHERE is_deleted=false AND asset_unit_id IS NOT NULL;
    `);
    const migration = readFileSync(resolve(process.cwd(), "../../database/migrations/000218_asset_operating_space_mapping.sql"), "utf8");
    await dataSource.query(`SET search_path TO "${schema}", public; ${migration}`);
    await dataSource.query(`INSERT INTO asset_building VALUES ($1,$2,$3,'B1','一号楼',1,'100.10',0,'enabled',false)`,
      [assetBuildingId, tenantId, parkId]);
    await dataSource.query(`INSERT INTO asset_floor VALUES ($1,$2,$3,$4,'F1','一层',1,'100.10','80.08',0,'enabled',false)`,
      [assetFloorId, tenantId, parkId, assetBuildingId]);
    await dataSource.query(`INSERT INTO asset_unit VALUES ($1,$2,$3,$4,$5,'101','101','101','50.05','40.04',false)`,
      [assetUnitId, tenantId, parkId, assetBuildingId, assetFloorId]);
    const transactionalDataSource = {
      transaction: async <T>(run: (manager: EntityManager) => Promise<T>) => dataSource.transaction(async (manager) => {
        await manager.query(`SET LOCAL search_path TO "${schema}", public`);
        return run(manager);
      })
    };
    const service = new AssetSpaceMappingService(transactionalDataSource as never);
    await service.mapBuilding(scope, actorId, assetBuildingId, "building-key-0001", { mode: "create", reason: "test" });
    await service.mapFloor(scope, actorId, assetFloorId, "floor-key-000001", { mode: "create", reason: "test" });
    const dto = { usageType: 10, rentalStatus: 10, fittingStatus: 10, reason: "test" };
    const results = await Promise.allSettled([
      service.convertUnit(scope, actorId, assetUnitId, "unit-key-winner-1", dto),
      service.convertUnit(scope, actorId, assetUnitId, "unit-key-rival-001", dto)
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1,
      results.map((result) => result.status === "rejected" ? String(result.reason) : "fulfilled").join(" | "));
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.ok(rejected?.reason instanceof ConflictException);
    const winner = results.find((result): result is PromiseFulfilledResult<Record<string, unknown>> => result.status === "fulfilled")!.value;
    const replay = await service.convertUnit(scope, actorId, assetUnitId, "unit-key-winner-1", dto);
    assert.equal(replay.id, winner.id);
    assert.equal(replay.unit_area, "50.05");
    assert.equal(replay.use_area, "40.04");
    const [{ count }] = await dataSource.query(`SELECT count(*)::int AS count FROM "${schema}".biz_unit WHERE asset_unit_id=$1`, [assetUnitId]);
    assert.equal(count, 1);
  } finally {
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await dataSource.destroy();
  }
});
