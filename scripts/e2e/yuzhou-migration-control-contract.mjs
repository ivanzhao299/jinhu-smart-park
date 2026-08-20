#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(resolve(import.meta.dirname, "../../database/migrations/000222_hr_legacy_migration_control.sql"), "utf8");
const integritySql = readFileSync(resolve(import.meta.dirname, "../../database/migrations/000223_hr_legacy_migration_control_integrity.sql"), "utf8");
for (const table of ["legacy_source_object","migration_batch","migration_batch_item","legacy_record_map","migration_error","migration_check","migration_rollback_point"]) {
  assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
}
assert.match(sql, /uq_legacy_record_map_active_source[\s\S]*WHERE is_active/);
assert.match(sql, /source_row_sha256/);
assert.match(sql, /evidence_redacted AND/);
assert.match(sql, /jinhu_hr_migration_lab_/);
assert.match(sql, /rolled_back/);
assert.match(sql, /cleanup_manifest/);
assert.doesNotMatch(sql, /password|idcard|bank_account/i);
assert.match(integritySql, /loaded_count<=valid_count/);
assert.match(integritySql, /FOREIGN KEY\(batch_item_id,batch_id\)/g);
console.log("Yuzhou migration control contract passed.");
