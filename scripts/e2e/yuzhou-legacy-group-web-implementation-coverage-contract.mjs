import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  LegacyGroupWebImplementationCoverageError,
  assessLegacyGroupWebImplementationCoverage
} from "../hr-cutover/legacy-group-web-implementation-coverage-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const mapping = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json"), "utf8"));
const observedAt = "2026-08-28T08:00:00.000Z";
const hash = value => createHash("sha256").update(value).digest("hex");
const legacyRuntimeEvidence = legacyIds => {
  const evidence = {
  formatVersion: 1,
  contractKind: "yuzhou_hr_legacy_runtime_uat_evidence",
  status: "PASS",
  evidenceSource: "legacy_group_web_live_read_only_traversal",
  surface: "group_web",
  observedAt,
  artifactSha256: "",
  items: legacyIds.map(legacyId => ({
    legacyId,
    status: "PASS",
    observations: ["hr_manager", "department_manager", "employee_self_service"].map((role, index) => ({
      role,
      pageId: `group-web:${legacyId}`,
      route: `/legacy/page-${legacyId}`,
      observedAt,
      artifactSha256: `${String(legacyId).padStart(4, "0")}${String(index).padStart(2, "0")}`.padEnd(64, "b")
    }))
  })),
  productionImport: "HOLD"
  };
  evidence.artifactSha256 = hash(JSON.stringify({
    contractKind: evidence.contractKind,
    evidenceSource: evidence.evidenceSource,
    surface: evidence.surface,
    observedAt: evidence.observedAt,
    items: evidence.items
  }));
  return evidence;
};

test("all 231 Group Web modules receive a conservative implementation score", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root);
  assert.equal(result.summary.total, 231);
  assert.deepEqual(result.summary.statuses, { implemented: 0, partial: 180, mapped_only: 51 });
  assert.deepEqual(result.summary.scoreBands, { score100: 0, score90: 12, score80: 168, score60: 0, score40: 21, score20: 30 });
  assert.equal(result.summary.averageScore, 69.09);
  assert.equal(result.summary.scoreMeaning, "legacy_group_web_runtime_compatibility");
  assert.deepEqual(result.summary.targetImplementation, {
    statuses: { implemented: 0, partial: 180, mapped_only: 51 },
    averageScore: 69.09,
    scoreMeaning: "smart_park_target_technical_implementation"
  });
  assert.equal(result.gates.productionImport, "HOLD");
});

test("decision-center coverage reflects only the shipped aggregate workforce capabilities", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root);
  for (const legacyId of [166, 167, 228, 229, 230, 246]) {
    const item = result.items.find(candidate => candidate.legacyId === legacyId);
    assert.equal(item.selectedRoute, "/hr/decision-center");
    assert.equal(item.score, 80);
    assert.equal(item.implementationStatus, "partial");
    assert.deepEqual(item.blockers, ["legacy_rule_parity", "legacy_runtime_uat"]);
  }
  for (const legacyId of [168, 231, 232, 233, 234, 235, 247]) {
    const item = result.items.find(candidate => candidate.legacyId === legacyId);
    assert.notEqual(item.selectedRoute, "/hr/decision-center");
  }
  assert.deepEqual(result.summary.domains.decision_center, {
    total: 16,
    implemented: 0,
    partial: 6,
    mapped_only: 10,
    averageScore: 55
  });
});

test("a mapped destination cannot be called implemented without rule parity and live role UAT", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root);
  const organization = result.items.find(item => item.legacyId === 2);
  assert.equal(organization.implementationStatus, "partial");
  assert.equal(organization.score, 80);
  assert.deepEqual(organization.blockers, ["legacy_rule_parity", "legacy_runtime_uat"]);
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
  assert.deepEqual(workLog.blockers, ["legacy_runtime_uat"]);
});

test("Yuzhou onboarding reaches rule parity but still requires three-role live UAT", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root);
  const onboarding = result.items.find(item => item.legacyId === 34);
  assert.equal(onboarding.score, 90);
  assert.equal(onboarding.implementationStatus, "partial");
  assert.equal(onboarding.ruleParityOutcome, "onboarding_application_approval_and_atomic_confirmation");
  assert.deepEqual(onboarding.blockers, ["legacy_runtime_uat"]);
});

test("Yuzhou employee basic profile reaches field and privacy parity", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root);
  const profile = result.items.find(item => item.legacyId === 35);
  assert.equal(profile.score, 90);
  assert.equal(profile.ruleParityOutcome, "basic_profile_fields_with_encrypted_identity_and_scoped_audit");
  assert.deepEqual(profile.blockers, ["legacy_runtime_uat"]);
});

test("Yuzhou probation confirmation reaches approval and atomic effect parity", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root);
  const probation = result.items.find(item => item.legacyId === 36);
  assert.equal(probation.score, 90);
  assert.equal(probation.dimensions.legacyRuleParity, true);
  assert.equal(probation.ruleParityOutcome, "probation_application_batch_approval_and_atomic_confirmation");
  assert.deepEqual(probation.blockers, ["legacy_runtime_uat"]);
});

test("Yuzhou job change combines Group Web approval with the client movement ledger", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root);
  const jobChange = result.items.find(item => item.legacyId === 39);
  assert.equal(jobChange.score, 90);
  assert.equal(jobChange.dimensions.legacyRuleParity, true);
  assert.equal(jobChange.ruleParityOutcome, "dual_source_job_change_approval_manual_apply_and_atomic_event_ledger");
  assert.deepEqual(jobChange.blockers, ["legacy_runtime_uat"]);
});

test("Yuzhou departure closes all six legacy operations without duplicating the client ledger", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root);
  for (const legacyId of [42, 43, 44, 45, 46, 47]) {
    const item = result.items.find(candidate => candidate.legacyId === legacyId);
    assert.equal(item.score, 90);
    assert.equal(item.dimensions.legacyRuleParity, true);
    assert.deepEqual(item.blockers, ["legacy_runtime_uat"]);
  }
  assert.equal(result.summary.domains.employee.averageScore, 85);
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

test("only frozen Group Web runtime observations can close the legacy runtime dimension", () => {
  const result = assessLegacyGroupWebImplementationCoverage(mapping, root, { legacyRuntimeUatEvidence: legacyRuntimeEvidence([313]) });
  const workLog = result.items.find(item => item.legacyId === 313);
  assert.equal(workLog.dimensions.targetTechnicalUat, false);
  assert.equal(workLog.dimensions.legacyRuntimeUat, true);
  assert.equal(workLog.score, 100);
  assert.equal(workLog.implementationStatus, "implemented");
  assert.equal(result.gates.legacyRuntimeUatEvidence.surface, "group_web");
  assert.equal(result.gates.legacyRuntimeUatEvidence.artifactSha256, legacyRuntimeEvidence([313]).artifactSha256);
});

test("source DB evidence client evidence and incomplete roles cannot impersonate Group Web runtime", () => {
  const cases = [
    evidence => { evidence.evidenceSource = "legacy_group_web_source_audit"; },
    evidence => { evidence.surface = "client"; },
    evidence => { evidence.items[0].observations.pop(); },
    evidence => { evidence.items[0].observations[0].artifactSha256 = "not-a-hash"; },
    evidence => { evidence.items[0].observations[0].route = "https://example.invalid/page"; },
    evidence => { evidence.items[0].observations[0].route = "/legacy/page?password=value"; },
    evidence => { evidence.items[0].observations[0].route = "/legacy/%3Fpassword=value"; },
    evidence => { evidence.items[0].observations[0].route = "/legacy/password/value"; },
    evidence => { evidence.items[0].observations[0].observedAt = "2026-08-27T08:00:00.000Z"; }
  ];
  for (const mutate of cases) {
    const evidence = legacyRuntimeEvidence([313]);
    mutate(evidence);
    assert.throws(
      () => assessLegacyGroupWebImplementationCoverage(mapping, root, { legacyRuntimeUatEvidence: evidence }),
      error => error instanceof LegacyGroupWebImplementationCoverageError
    );
  }
});

test("empty future duplicated and cross-entry artifact evidence fails closed", () => {
  const cases = [
    evidence => { evidence.items = []; },
    evidence => { evidence.observedAt = "2999-01-01T00:00:00.000Z"; },
    evidence => { evidence.items[0].observations[1].role = "hr_manager"; },
    evidence => { evidence.items.push(structuredClone(evidence.items[0])); },
    evidence => { evidence.items[0].legacyId = 999999; },
    evidence => { evidence.items[0].observations[0].artifactSha256 = evidence.artifactSha256; },
    evidence => {
      evidence.items.push(structuredClone(legacyRuntimeEvidence([34]).items[0]));
      evidence.items[1].observations[0].artifactSha256 = evidence.items[0].observations[0].artifactSha256;
    }
  ];
  for (const mutate of cases) {
    const evidence = legacyRuntimeEvidence([313]);
    mutate(evidence);
    assert.throws(
      () => assessLegacyGroupWebImplementationCoverage(mapping, root, { legacyRuntimeUatEvidence: evidence }),
      error => error instanceof LegacyGroupWebImplementationCoverageError
    );
  }
});
