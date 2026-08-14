import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(__dirname, "../../../../../database/migrations/000213_code_rule_scope_provisioning.sql"),
  "utf8"
);

test("000213 backfills only live scopes and persisted provisionable modules", () => {
  assert.match(migration, /tenant\.status = 1/);
  assert.match(migration, /park\.status = 1/);
  assert.match(migration, /assignment\.enabled = true/);
  assert.match(migration, /assignment\.status = 'enabled'/);
  assert.match(migration, /assignment\.expire_time IS NULL OR assignment\.expire_time > now\(\)/);
  assert.match(migration, /module\.status = 1/);
  assert.doesNotMatch(migration, /assignment\.start_time/);
  assert.match(migration, /source\.tenant_id = '10000001'/);
  assert.match(migration, /source\.park_id = '20000001'/);
});

test("000213 preserves every target history shape and resets only newly inserted sequences", () => {
  assert.match(migration, /target\.rule_code = source\.rule_code/);
  assert.match(migration, /target\.entity_type = source\.entity_type/);
  assert.doesNotMatch(migration, /target\.is_deleted/);
  assert.match(migration, /source\.sequence_length, 0, 0/);
  assert.doesNotMatch(migration, /ON CONFLICT[\s\S]*DO UPDATE/);
  assert.doesNotMatch(migration, /\bUPDATE\s+sys_code_rule\b/i);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\s+sys_code_rule\b/i);
});

test("000213 fails closed only when non-default asset targets require a missing standard core", () => {
  assert.match(migration, /\(park\.tenant_id, park\.park_id\) <> \('10000001', '20000001'\)/);
  assert.match(migration, /source_core_count <> 3/);
  assert.match(migration, /\(rule_code, target_module, entity_type, target_entity\) IN/);
  assert.match(migration, /\('BUILDING_CODE', 'asset', 'building', 'building'\)/);
  assert.match(migration, /\('FLOOR_CODE', 'asset', 'floor', 'floor'\)/);
  assert.match(migration, /\('UNIT_CODE', 'asset', 'unit', 'unit'\)/);
  assert.match(migration, /000213-code-rule-source-preflight-failed/);
});
