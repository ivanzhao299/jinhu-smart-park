import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const migration = readFileSync(
  resolve(root, "database/migrations/000301_hr_performance_yuzhou_legacy_writer.sql"),
  "utf8",
);

for (const sourceTable of [
  "dbo.assessmentcode",
  "dbo.assgradecode",
  "dbo.assitem",
  "dbo.assitemgradedes",
  "dbo.assessmentdetail",
]) {
  assert.match(migration, new RegExp(`'${sourceTable.replace(".", "\\.")}'`, "u"));
}

for (const targetTable of [
  "hr_performance_legacy_template_profile",
  "hr_performance_legacy_level_rule",
  "hr_performance_legacy_dimension_profile",
  "hr_performance_legacy_dimension_level_guide",
  "hr_performance_legacy_dimension_result",
]) {
  assert.match(migration, new RegExp(`'${targetTable}'`, "u"));
}

const sourceFields = [
  "assessment", "assessmentname", "department", "mpercent", "tpercent", "xpercent", "cpercent", "spercent", "timekeep", "bonus", "master",
  "assgrade", "description", "myorder", "assessmentid", "minvalue", "maxvalue",
  "id", "assid", "assitem", "fullvalue", "myorder",
  "id", "assitemid", "grade", "description", "minvalue", "maxvalue", "myorder",
  "id", "asssessionid", "person", "assitemid", "selfvalue", "mitemvalue", "itemvalue", "xitemvalue", "citemvalue", "selfgrade", "assgrade", "appraisal",
];
assert.equal(sourceFields.length, 41);
for (const field of new Set(sourceFields)) {
  assert.match(migration, new RegExp(`'${field}'`, "u"));
}

assert.match(migration, /execution_context='lab_rehearsal'/u);
assert.match(migration, /current_setting\('transaction_isolation'\)<>'serializable'/u);
assert.match(migration, /batch\.target_database=current_database\(\)/u);
assert.match(migration, /HR_PERFORMANCE_LEGACY_WRITER_REPLAY_DRIFT/u);
assert.match(migration, /HR_PERFORMANCE_LEGACY_WRITER_CONSERVATION_FAILED/u);
assert.match(migration, /uuid_generate_v5/u);
assert.match(migration, /p_target_table<>\(CASE p_source_table/u);
assert.match(migration, /source_pk_canonical[\s\S]*'sha256:'\|\|p_source_identity_sha256/u);
assert.match(migration, /legacy_template_profile_id IS NOT DISTINCT FROM v_parent_id/u);
assert.match(migration, /legacy_dimension_profile_id IS NOT DISTINCT FROM v_parent_id/u);
assert.match(migration, /legacy_level_rule_id IS NOT DISTINCT FROM v_level_id/u);
assert.match(migration, /ON CONFLICT\(migration_batch_id,tenant_id,park_id,source_assessment\) DO NOTHING/u);
assert.match(migration, /ON CONFLICT\(migration_batch_id,tenant_id,park_id,source_ass_grade\) DO NOTHING/u);
assert.match(migration, /ON CONFLICT\(migration_batch_id,tenant_id,park_id,source_item_id\) DO NOTHING/u);
assert.match(migration, /ON CONFLICT\(migration_batch_id,tenant_id,park_id,source_guide_id\) DO NOTHING/u);
assert.match(migration, /ON CONFLICT\(migration_batch_id,tenant_id,park_id,source_detail_id\) DO NOTHING/u);
assert.match(migration, /REVOKE ALL ON PROCEDURE materialize_yuzhou_performance_legacy_lab/u);

console.log("Yuzhou performance legacy writer contract passed (41 fields, lab-only, idempotent, relation-aware).");
