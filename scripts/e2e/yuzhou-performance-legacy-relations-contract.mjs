import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const sql = readFileSync(resolve(root, "database/migrations/000305_hr_performance_yuzhou_legacy_relations.sql"), "utf8");

for (const table of [
  "hr_performance_legacy_session",
  "hr_performance_legacy_score_source",
  "hr_performance_legacy_source_person_assignment",
]) {
  assert.match(sql, new RegExp(`CREATE TABLE ${table}\\b`, "u"));
  assert.match(sql, new RegExp(`REVOKE ALL ON ${table} FROM PUBLIC`, "u"));
}
for (const field of [
  "source_session_id", "source_session_name", "source_description", "source_assessment_type",
  "source_year", "source_month", "source_quarter", "source_my_order",
  "source_score_id", "source_person_code", "source_item_id", "source_relation_type",
  "source_item_value", "source_ass_grade", "source_appraisal", "source_assignment_id",
  "source_assessor_code",
]) assert.match(sql, new RegExp(`\\b${field}\\b`, "u"));

assert.match(sql, /ARRAY\['asssession','asssour','asssourperson'\]/u);
assert.match(sql, /execution_context='lab_rehearsal'/u);
assert.match(sql, /HR_PERFORMANCE_LEGACY_RELATION_WRITER_REQUIRES_SERIALIZABLE/u);
assert.match(sql, /legacy_session_id IS NOT DISTINCT FROM v_session_id/u);
assert.match(sql, /legacy_dimension_profile_id IS NOT DISTINCT FROM v_dimension_id/u);
assert.match(sql, /HR_PERFORMANCE_LEGACY_RELATION_WRITER_CONSERVATION_FAILED/u);
assert.match(sql, /SET CONSTRAINTS ALL IMMEDIATE/u);
assert.match(sql, /materialize_yuzhou_performance_legacy_relations_lab/u);
assert.match(sql, /hr_performance_yuzhou_legacy_fact_guard/u);

console.log("Yuzhou performance relation contract passed (session, source score, scorer assignment, replay and rollback guards).");
