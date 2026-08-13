import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(resolve(process.cwd(), "../../database/migrations/000211_asset_location_scope_integrity.sql"), "utf8");

test("asset location migration fails closed before installing scoped constraints", () => {
  assert.match(migration, /LOCK TABLE biz_park, biz_building, biz_floor, biz_unit IN SHARE ROW EXCLUSIVE MODE/u);
  assert.match(migration, /building .* references missing active park scope/u);
  assert.match(migration, /10000001[\s\S]*20000001[\s\S]*park_code = 'JH'/u);
  assert.match(migration, /floor .* scope differs from building/u);
  assert.match(migration, /unit .* scope\/building differs from floor/u);
  assert.ok(migration.indexOf("preflight failed") < migration.indexOf("ADD CONSTRAINT uq_biz_building_scope_id"));
});

test("asset location migration constrains the complete tenant park parent chain", () => {
  assert.match(migration, /FOREIGN KEY \(tenant_id, park_id, building_id\)[\s\S]*REFERENCES biz_building \(tenant_id, park_id, id\)/u);
  assert.match(migration, /FOREIGN KEY \(tenant_id, park_id, building_id, floor_id\)[\s\S]*REFERENCES biz_floor \(tenant_id, park_id, building_id, id\)/u);
  assert.match(migration, /ON biz_building \(tenant_id, park_id, building_code\)[\s\S]*WHERE is_deleted = false/u);
  assert.match(migration, /ON biz_floor \(tenant_id, park_id, floor_code\)[\s\S]*WHERE is_deleted = false/u);
  assert.match(migration, /DROP INDEX IF EXISTS idx_biz_building_entity_code/u);
  assert.match(migration, /DROP INDEX IF EXISTS idx_biz_floor_entity_code/u);
  assert.match(migration, /CREATE TRIGGER trg_biz_building_active_park_scope/u);
  assert.match(migration, /CREATE TRIGGER trg_biz_park_building_scope/u);
  assert.match(migration, /CREATE TRIGGER trg_biz_park_active_scope_insert/u);
  assert.match(migration, /CREATE TRIGGER trg_biz_park_building_scope_delete/u);
  assert.match(migration, /OLD\.park_code = 'JH'[\s\S]*b\.tenant_id = '10000001'[\s\S]*b\.park_id = '20000001'/u);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('asset-park-canonical-source'/u);
  assert.match(migration, /BEFORE UPDATE OF tenant_id, park_id, park_code, status, is_deleted ON biz_park/u);
  assert.match(migration, /UPDATE OF tenant_id, park_id, is_deleted ON biz_building/u);
});
