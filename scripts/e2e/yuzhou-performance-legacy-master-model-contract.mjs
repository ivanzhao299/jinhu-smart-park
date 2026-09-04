import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const migration = readFileSync(
  resolve(root, "database/migrations/000302_hr_performance_yuzhou_legacy_master.sql"),
  "utf8",
);

assert.match(migration, /CREATE TABLE hr_performance_legacy_master_result \(/u);
assert.match(migration, /source_master_id integer NOT NULL/u);

const sourceColumns = [
  ["source_master_id", "integer NOT NULL"],
  ["source_session_id", "integer"],
  ["source_person_code", "varchar\\(10\\)"],
  ["source_self_grade", "varchar\\(12\\)"],
  ["source_ass_grade", "varchar\\(12\\)"],
  ["source_self_value", "numeric\\(18,2\\)"],
  ["source_item_value", "numeric\\(18,2\\)"],
  ["source_m_item_value", "numeric\\(18,0\\)"],
  ["source_x_item_value", "numeric\\(18,0\\)"],
  ["source_c_item_value", "numeric\\(18,0\\)"],
  ["source_master_value", "numeric\\(18,2\\)"],
  ["source_timekeep_value", "numeric\\(18,2\\)"],
  ["source_bonus_value", "numeric\\(18,2\\)"],
  ["source_total_value", "numeric\\(18,2\\)"],
  ["source_self_appraisal", "varchar\\(500\\)"],
  ["source_appraisal", "varchar\\(500\\)"],
  ["source_pay", "numeric\\(19,4\\)"],
  ["source_assessment_person", "varchar\\(50\\)"],
  ["source_recorded_at", "timestamp without time zone"],
  ["source_operator_code", "varchar\\(10\\)"],
  ["source_description", "varchar\\(500\\)"],
];
assert.equal(sourceColumns.length, 21);
for (const [column, type] of sourceColumns) {
  assert.match(migration, new RegExp(`\\b${column} ${type}[,\\n]`, "u"));
}

assert.match(migration, /v_map\.source_table<>'dbo\.assessmentmaster'/u);
assert.match(migration, /v_map\.target_table<>'hr_performance_legacy_master_result'/u);
assert.match(migration, /HR_PERFORMANCE_LEGACY_MASTER_RECORD_MAP_MISMATCH/u);
assert.match(migration, /trg_hr_perf_legacy_master_immutable/u);
assert.match(migration, /EXECUTE FUNCTION hr_performance_yuzhou_legacy_fact_guard\(\)/u);
assert.match(migration, /REVOKE ALL ON hr_performance_legacy_master_result FROM PUBLIC/u);

for (const component of ["m", "x", "c"]) {
  assert.match(
    migration,
    new RegExp(`sum\\(COALESCE\\(result\\.source_${component}_item_value,0\\)\\)::numeric\\(18,0\\)`, "u"),
  );
}
assert.match(migration, /CREATE OR REPLACE FUNCTION hr_performance_yuzhou_legacy_full_total/u);
assert.match(migration, /COALESCE\(master\.source_master_value,0\)/u);
assert.match(migration, /COALESCE\(master\.source_timekeep_value,0\)/u);
assert.match(migration, /COALESCE\(master\.source_bonus_value,0\)/u);
assert.match(migration, /source_total_value remains the comparison baseline/u);

console.log("Yuzhou performance master model contract passed (21/21 source fields and full legacy total semantics).")
