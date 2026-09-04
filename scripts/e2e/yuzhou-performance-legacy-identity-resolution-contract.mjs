import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const sql = readFileSync(
  resolve(root, "database/migrations/000306_hr_performance_yuzhou_identity_resolution.sql"),
  "utf8",
);

for (const table of [
  "hr_performance_legacy_session_binding",
  "hr_performance_legacy_identity_resolution",
]) {
  assert.match(sql, new RegExp(`CREATE TABLE ${table}\\b`, "u"));
  assert.match(sql, new RegExp(`REVOKE ALL ON ${table} FROM PUBLIC`, "u"));
}

assert.match(sql, /convert_to\('dbo\.person','UTF8'\)\s*\|\| decode\('00','hex'\)/u);
assert.match(sql, /convert_to\(btrim\(p_source_person_code\),'UTF8'\)/u);
assert.doesNotMatch(sql, /lower\(p_source_person_code\)|upper\(p_source_person_code\)/u);
assert.match(sql, /source_map\.mapping_status IN\('loaded','verified'\)/u);
assert.match(sql, /source_map\.is_active/u);
assert.match(sql, /source_batch\.execution_context='production_import'/u);
assert.match(sql, /source_batch\.production_import_phase='T0'/u);
assert.match(sql, /source_batch\.status='succeeded'/u);
assert.match(sql, /import_phase\.status='succeeded'/u);
assert.match(sql, /import_operation\.status='succeeded'/u);
assert.match(sql, /import_operation\.target_tenant_id,import_operation\.target_park_id/u);
assert.match(sql, /v_candidate_count=1/u);
assert.match(sql, /v_candidate_count=0/u);
assert.match(sql, /T0_PERSON_MAP_AMBIGUOUS/u);
assert.match(sql, /ASSESSOR_CODE_EMPTY/u);
assert.match(sql, /ASSESSOR_SEMANTICS_UNVERIFIED/u);
assert.match(sql, /execution_context<>'lab_rehearsal'/u);
assert.match(sql, /HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_REPLAY_DRIFT/u);
assert.match(sql, /HR_PERFORMANCE_LEGACY_IDENTITY_WRITER_FACT_CONSERVATION_FAILED/u);
assert.match(sql, /rollback_yuzhou_performance_legacy_identity_resolution_lab/u);
assert.match(sql, /HR_PERFORMANCE_LEGACY_IDENTITY_ROLLBACK_RESIDUAL/u);
assert.doesNotMatch(sql, /INSERT INTO hr_employee\b/u);
assert.doesNotMatch(sql, /INSERT INTO hr_performance_review_cycle\b/u);
assert.doesNotMatch(sql, /INSERT INTO hr_performance_cycle_employee\b/u);
assert.doesNotMatch(sql, /full_name|work_email|work_mobile|personal_email|personal_mobile/u);

console.log(
  "Yuzhou performance identity-resolution contract passed (exact T0 evidence, fail-closed ambiguity, lab-only writer, no inferred identities).",
);
