#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const migration = readFileSync(
  resolve(root, "database/migrations/000307_hr_performance_yuzhou_ass_compute_weight_relation.sql"),
  "utf8",
);

test("weight source keeps person-assessment evidence and master comparison append-only", () => {
  assert.match(migration, /CREATE TABLE hr_performance_legacy_person_assessment_evidence/u);
  assert.match(migration, /CREATE TABLE hr_performance_legacy_ass_compute_weight_resolution/u);
  assert.match(migration, /legacy_master_result_id uuid NOT NULL/u);
  assert.match(migration, /person_template_profile_id uuid/u);
  assert.match(migration, /detail_template_profile_id uuid/u);
  assert.match(migration, /comparison_status varchar\(24\) NOT NULL/u);
  assert.match(migration, /never selects or overwrites a winner/u);
});

test("bs_ass_compute person and detail relationship paths are derived independently", () => {
  assert.ok(migration.includes("hr_performance_yuzhou_person_identity_sha256(master.source_person_code)"));
  assert.match(migration, /profile\.source_assessment\)=/u);
  assert.match(migration, /result\.source_session_id IS NOT DISTINCT FROM person_template\.source_session_id/u);
  assert.match(migration, /result\.source_person_code IS NOT DISTINCT FROM person_template\.source_person_code/u);
  assert.match(migration, /SELECT DISTINCT dimension\.legacy_template_profile_id profile_id/u);
  assert.match(migration, /v_master\.legacy_template_profile_id IS DISTINCT FROM v_expected\.detail_template_profile_id/u);
});

test("missing detail, missing assessment, missing template and ambiguity are explicit", () => {
  for (const status of [
    "not_applicable",
    "evidence_unmatched",
    "evidence_ambiguous",
    "assessment_missing",
    "template_unmatched",
    "template_ambiguous",
    "resolved",
  ]) assert.ok(migration.includes(`'${status}'`), status);
  for (const status of ["unmatched", "ambiguous", "resolved"]) {
    assert.match(migration, new RegExp(`detail_resolution_status='${status}'`, "u"));
  }
  assert.ok(migration.includes("detail_template_candidate_count>1"));
  assert.ok(migration.includes("source_person_evidence_count>1"));
  assert.ok(migration.includes("person_template_candidate_count>1"));
});

test("writer is lab-only, serializable, replay-safe and rollback is reverse ordered", () => {
  assert.match(migration, /materialize_yuzhou_performance_ass_compute_weight_relation_lab/u);
  assert.match(migration, /execution_context='lab_rehearsal'/u);
  assert.match(migration, /transaction_isolation'\)<>'serializable'/u);
  assert.match(migration, /HR_PERFORMANCE_ASS_COMPUTE_WEIGHT_REPLAY_DRIFT/u);
  assert.match(migration, /PERSON_EVIDENCE_CONSERVATION_FAILED/u);
  assert.match(migration, /RESOLUTION_CONSERVATION_FAILED/u);
  const rollback = migration.slice(migration.indexOf("rollback_yuzhou_performance_ass_compute_weight_relation_lab"));
  assert.ok(
    rollback.indexOf("DELETE FROM hr_performance_legacy_ass_compute_weight_resolution")
      < rollback.indexOf("DELETE FROM hr_performance_legacy_person_assessment_evidence"),
  );
});

test("migration never updates source, legacy master, detail, template or modern workflow rows", () => {
  assert.doesNotMatch(
    migration,
    /UPDATE\s+(?:hr_performance_legacy_master_result|hr_performance_legacy_dimension_result|hr_performance_legacy_dimension_profile|hr_performance_legacy_template_profile|hr_performance_cycle_employee)\b/iu,
  );
  assert.doesNotMatch(migration, /execution_context='production_import'|productionImport\s*=\s*['"]READY/iu);
  assert.match(migration, /REVOKE ALL ON hr_performance_legacy_person_assessment_evidence FROM PUBLIC/u);
  assert.match(migration, /REVOKE ALL ON hr_performance_legacy_ass_compute_weight_resolution FROM PUBLIC/u);
});
