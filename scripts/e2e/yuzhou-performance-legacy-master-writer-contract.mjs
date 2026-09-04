import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const migration = readFileSync(resolve(root, "database/migrations/000303_hr_performance_yuzhou_legacy_master_writer.sql"), "utf8");

for (const marker of [
  "HR_PERFORMANCE_LEGACY_MASTER_WRITER_REQUIRES_SERIALIZABLE",
  "HR_PERFORMANCE_LEGACY_MASTER_WRITER_BATCH_INVALID",
  "HR_PERFORMANCE_LEGACY_MASTER_WRITER_SCOPE_INVALID",
  "HR_PERFORMANCE_LEGACY_MASTER_WRITER_PAYLOAD_INVALID",
  "HR_PERFORMANCE_LEGACY_MASTER_WRITER_ROW_INVALID",
  "HR_PERFORMANCE_LEGACY_MASTER_WRITER_REPLAY_DRIFT",
  "HR_PERFORMANCE_LEGACY_MASTER_WRITER_CONSERVATION_FAILED",
]) assert.match(migration, new RegExp(marker, "u"));

assert.match(migration, /batch\.target_database=current_database\(\)/u);
assert.match(migration, /batch\.execution_context='lab_rehearsal'/u);
assert.match(migration, /source_table='dbo\.assessmentmaster'/u);
assert.match(migration, /target_table<>'hr_performance_legacy_master_result'/u);
assert.match(migration, /ON CONFLICT\(migration_batch_id,tenant_id,park_id,source_master_id\) DO NOTHING/u);
assert.match(migration, /SELECT DISTINCT dimension\.legacy_template_profile_id/u);
assert.match(migration, /HAVING count\(\*\)=1/u);
assert.match(migration, /SET CONSTRAINTS ALL IMMEDIATE/u);
assert.match(migration, /REVOKE ALL ON PROCEDURE materialize_yuzhou_performance_legacy_master_lab/u);

const exactRowKeys = migration.match(/hr_performance_yuzhou_jsonb_exact_keys\(v_row,ARRAY\[([\s\S]*?)\]\)/u)?.[1];
assert.ok(exactRowKeys);
assert.equal(exactRowKeys.match(/'[^']+'/gu)?.length, 23);

console.log("Yuzhou performance master writer contract passed (lab-only, exact 21-field row, replay and conservation guards).")
