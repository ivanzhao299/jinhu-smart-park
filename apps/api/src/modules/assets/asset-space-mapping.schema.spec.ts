import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(process.cwd(), "../../database/migrations/000218_asset_operating_space_mapping.sql"),
  "utf8"
);

test("asset operating-space mapping migration is forward-only and keeps existing mappings compatible", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS asset_building_id uuid REFERENCES asset_building\(id\)/u);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS asset_floor_id uuid REFERENCES asset_floor\(id\)/u);
  assert.match(migration, /WHERE is_deleted=false AND asset_building_id IS NOT NULL/u);
  assert.match(migration, /WHERE is_deleted=false AND asset_floor_id IS NOT NULL/u);
  assert.doesNotMatch(migration, /UPDATE\s+biz_(?:building|floor|unit)\b/iu);
});

test("database mapping guards enforce scope and the complete parent chain", () => {
  assert.match(migration, /source\.tenant_id::text=NEW\.tenant_id/u);
  assert.match(migration, /source\.park_id::text=NEW\.park_id/u);
  assert.match(migration, /asset floor mapping parent building mismatch/u);
  assert.match(migration, /asset unit mapping parent building or floor mismatch/u);
  assert.match(migration, /building\.asset_building_id=parent_asset_building_id/u);
  assert.match(migration, /floor\.asset_floor_id=parent_asset_floor_id/u);
  assert.match(migration, /to_jsonb\(NEW\)->>'asset_building_id'/u);
  assert.match(migration, /to_jsonb\(NEW\)->>'asset_floor_id'/u);
  assert.match(migration, /to_jsonb\(NEW\)->>'asset_unit_id'/u);
  assert.match(migration, /CREATE TRIGGER trg_biz_building_asset_mapping/u);
  assert.match(migration, /CREATE TRIGGER trg_biz_floor_asset_mapping/u);
  assert.match(migration, /CREATE TRIGGER trg_biz_unit_asset_mapping_chain/u);
});

test("mapping audit is append-only, reasoned, scoped and replay-safe", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS biz_asset_space_mapping_audit/u);
  assert.match(migration, /entity_type IN \('building','floor','unit'\)/u);
  assert.match(migration, /action IN \('create','link','unlink'\)/u);
  assert.match(migration, /length\(btrim\(reason\)\) > 0/u);
  assert.match(migration, /UNIQUE \(tenant_id, park_id, entity_type, action, idempotency_key\)/u);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON biz_asset_space_mapping_audit/u);
  assert.match(migration, /REVOKE UPDATE, DELETE ON biz_asset_space_mapping_audit FROM PUBLIC/u);
});
