import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  LegacyGroupWebImplementationCoverageError,
  assessLegacyGroupWebImplementationCoverage
} from "../hr-cutover/legacy-group-web-implementation-coverage-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const mapping = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json"), "utf8"));

test("all 231 Group Web modules receive a conservative implementation score", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root);
  assert.equal(result.summary.total, 231);
  assert.deepEqual(result.summary.statuses, { implemented: 0, partial: 162, mapped_only: 69 });
  assert.deepEqual(result.summary.scoreBands, { score100: 0, score90: 6, score80: 156, score60: 0, score40: 27, score20: 42 });
  assert.equal(result.summary.averageScore, 64.68);
  assert.equal(result.gates.productionImport, "HOLD");
});

test("a mapped destination cannot be called implemented without rule parity and live role UAT", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root);
  const organization = result.items.find(item => item.legacyId === 2);
  assert.equal(organization.implementationStatus, "partial");
  assert.equal(organization.score, 80);
  assert.deepEqual(organization.blockers, ["legacy_rule_parity", "live_role_uat"]);
  const office = result.items.find(item => item.legacyId === 184);
  assert.equal(office.implementationStatus, "mapped_only");
  assert.ok(office.blockers.includes("production_route"));
});

test("Yuzhou work log reaches rule parity but remains below implemented until live role UAT", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root);
  const workLog = result.items.find(item => item.legacyId === 313);
  assert.equal(workLog.score, 90);
  assert.equal(workLog.implementationStatus, "partial");
  assert.equal(workLog.ruleParityOutcome, "work_log_create_update_query_and_audited_cancel");
  assert.deepEqual(workLog.blockers, ["live_role_uat"]);
});

test("Yuzhou onboarding reaches rule parity but still requires three-role live UAT", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root);
  const onboarding = result.items.find(item => item.legacyId === 34);
  assert.equal(onboarding.score, 90);
  assert.equal(onboarding.implementationStatus, "partial");
  assert.equal(onboarding.ruleParityOutcome, "onboarding_application_approval_and_atomic_confirmation");
  assert.deepEqual(onboarding.blockers, ["live_role_uat"]);
});

test("Yuzhou employee basic profile reaches field and privacy parity", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root);
  const profile = result.items.find(item => item.legacyId === 35);
  assert.equal(profile.score, 90);
  assert.equal(profile.ruleParityOutcome, "basic_profile_fields_with_encrypted_identity_and_scoped_audit");
  assert.deepEqual(profile.blockers, ["live_role_uat"]);
});

test("Yuzhou probation confirmation reaches approval and atomic effect parity", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root);
  const probation = result.items.find(item => item.legacyId === 36);
  assert.equal(probation.score, 90);
  assert.equal(probation.dimensions.legacyRuleParity, true);
  assert.equal(probation.ruleParityOutcome, "probation_application_batch_approval_and_atomic_confirmation");
  assert.deepEqual(probation.blockers, ["live_role_uat"]);
});

test("Yuzhou job change combines Group Web approval with the client movement ledger", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root);
  const jobChange = result.items.find(item => item.legacyId === 39);
  assert.equal(jobChange.score, 90);
  assert.equal(jobChange.dimensions.legacyRuleParity, true);
  assert.equal(jobChange.ruleParityOutcome, "dual_source_job_change_approval_manual_apply_and_atomic_event_ledger");
  assert.deepEqual(jobChange.blockers, ["live_role_uat"]);
});

test("production import release and source shrinkage fail closed", () => {
  const released = structuredClone(mapping);
  released.productionImport = "GO";
  assert.throws(
    () => assessLegacyGroupWebImplementationCoverage(released, root),
    error => error instanceof LegacyGroupWebImplementationCoverageError && error.code === "GROUP_WEB_IMPLEMENTATION_IMPORT_NOT_HELD"
  );
  const missing = structuredClone(mapping);
  missing.items.pop();
  assert.throws(
    () => assessLegacyGroupWebImplementationCoverage(missing, root),
    error => error instanceof LegacyGroupWebImplementationCoverageError && error.code === "GROUP_WEB_IMPLEMENTATION_SOURCE_INVALID"
  );
});

test("domain rollups preserve the exact legacy inventory boundary", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root);
  assert.equal(result.summary.domains.organization.total, 8);
  assert.equal(result.summary.domains.recruitment.total, 23);
  assert.equal(result.summary.domains.employee.total, 22);
  assert.equal(result.summary.domains.attendance.total, 29);
  assert.equal(result.summary.domains.compensation.total, 22);
  assert.equal(result.summary.domains.performance.total, 20);
  assert.equal(result.summary.domains.training.total, 31);
  assert.equal(result.summary.domains.enterprise_service.total, 29);
  assert.equal(result.summary.domains.data_configuration.total, 4);
  assert.equal(result.summary.domains.decision_center.total, 16);
  assert.equal(result.summary.domains.system_management.total, 9);
  assert.equal(result.summary.domains.personal_office.total, 18);
});
