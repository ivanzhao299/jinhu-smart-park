import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  YuzhouLiveRoleUatEvidenceError,
  validateYuzhouLiveRoleUatEvidencePair
} from "../hr-cutover/yuzhou-live-role-uat-evidence-lib.mjs";
import { taskCardHash } from "../hr-cutover/yuzhou-live-role-uat-task-card-lib.mjs";
import { apiMatrixHash } from "../hr-cutover/yuzhou-live-role-uat-api-matrix-lib.mjs";
import { browserMatrixHash } from "../hr-cutover/yuzhou-live-role-uat-browser-matrix-lib.mjs";
import { assessLegacyGroupWebImplementationCoverage } from "../hr-cutover/legacy-group-web-implementation-coverage-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const taskCard = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/yuzhou-live-role-uat-task-card-v1.json"), "utf8"));
const apiMatrix = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/yuzhou-live-role-uat-api-matrix-v1.json"), "utf8"));
const browserMatrix = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/yuzhou-live-role-uat-browser-matrix-v1.json"), "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
const triple = { codeSha: "1".repeat(40), sourceSnapshotHash: "2".repeat(64), mappingContractHash: "3".repeat(64) };
const statusFor = outcome => outcome === "success" ? 200 : outcome === "forbidden" ? 403 : outcome === "conflict" ? 409 : 404;
function observation(legacyId, kind, checkId) {
  const check = apiMatrix.checks.find(candidate => candidate.legacyId === legacyId && candidate.kind === kind && candidate.checkId === checkId);
  const operations = check.operations.map(operation => ({ method: operation.method, routeTemplate: operation.route, outcome: operation.outcome, statusCode: statusFor(operation.outcome), requestBodySha256: hash("request"), responseShapeSha256: hash("response") }));
  const assertions = Object.fromEntries(check.assertions.map(assertion => [assertion, true]));
  return { actor: check.actor, checkKeySha256: hash(`${legacyId}:${kind}:${checkId}`), operations, assertions, observationSha256: hash(JSON.stringify({ actor: check.actor, operations, assertions })) };
}

function browserEvidence(item, rehearsal) {
  return Object.fromEntries(item.roleTypes.map(roleType => [
    roleType,
    Object.fromEntries(taskCard.viewports.map(viewport => [viewport.id, {
      status: "PASS",
      actor: browserMatrix.checks.find(check => check.legacyId === item.legacyId && check.roleType === roleType).actor,
      width: viewport.width,
      height: viewport.height,
      mobile: viewport.mobile,
      clientWidth: viewport.width,
      scrollWidth: viewport.width,
      screenshotSha256: hash(`${rehearsal}:${item.legacyId}:${roleType}:${viewport.id}`),
      assertions: taskCard.browserAssertions
    }]))
  ]));
}

function passingEvidence(rehearsal) {
  return {
    formatVersion: 1,
    contractKind: "yuzhou_hr_live_role_uat_evidence",
    status: "PASS",
    executionBoundary: "isolated_lab_only",
    rehearsal,
    runId: `yzfull-contract-r${rehearsal}`,
    targetIdentityHash: hash(`target-${rehearsal}`),
    taskCardSha256: taskCardHash(taskCard),
    apiMatrixSha256: apiMatrixHash(apiMatrix),
    browserMatrixSha256: browserMatrixHash(browserMatrix),
    triple: { ...triple },
    actors: ["maker", "reviewer", "manager", "employee"].map((actor, index) => ({
      roleType: index < 2 ? "hr_manager" : index === 2 ? "department_manager" : "employee_self_service",
      subjectHash: hash(`${rehearsal}-${actor}`)
    })),
    items: taskCard.items.map(item => ({
      legacyId: item.legacyId,
      status: "PASS",
      positive: item.positive.map(id => ({ id, status: "PASS", observation: observation(item.legacyId, "positive", id) })),
      negative: item.negative.map(id => ({ id, status: "PASS", observation: observation(item.legacyId, "negative", id) })),
      browser: browserEvidence(item, rehearsal),
      auditStatus: "PASS"
    })),
    p0P1Count: 0,
    sensitiveScan: "PASS",
    auditStatus: "PASS",
    humanAttestation: "HOLD",
    productionImport: "HOLD"
  };
}

test("independent Smart Park A/B evidence promotes only target implementation and never legacy runtime", () => {
  const pair = { A: passingEvidence("A"), B: passingEvidence("B") };
  const result = validateYuzhouLiveRoleUatEvidencePair(pair, taskCard, triple, apiMatrix, browserMatrix);
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.eligibleLegacyIds, [34, 35, 36, 37, 39, 42, 43, 44, 45, 46, 47, 313]);
  assert.equal(result.productionImport, "HOLD");
  const mapping = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json"), "utf8"));
  const coverage = assessLegacyGroupWebImplementationCoverage(mapping, root, { targetTechnicalUatEvidencePair: pair, expectedTriple: triple });
  assert.deepEqual(coverage.summary.scoreBands, { score100: 0, score90: 12, score80: 150, score60: 0, score40: 27, score20: 42 });
  assert.deepEqual(coverage.summary.statuses, { implemented: 0, partial: 162, mapped_only: 69 });
  assert.equal(coverage.summary.averageScore, 64.94);
  assert.equal(coverage.summary.scoreMeaning, "legacy_group_web_runtime_compatibility");
  assert.deepEqual(coverage.summary.targetImplementation.statuses, { implemented: 12, partial: 150, mapped_only: 69 });
  assert.equal(coverage.summary.targetImplementation.averageScore, 65.45);
  for (const legacyId of result.eligibleLegacyIds) {
    const item = coverage.items.find(candidate => candidate.legacyId === legacyId);
    assert.equal(item.dimensions.targetTechnicalUat, true);
    assert.equal(item.dimensions.legacyRuntimeUat, false);
    assert.equal(item.targetImplementationScore, 100);
    assert.equal(item.targetImplementationStatus, "implemented");
    assert.equal(item.score, 90);
    assert.equal(item.implementationStatus, "partial");
  }
  assert.equal(coverage.gates.productionImport, "HOLD");
});

test("the former ambiguous live role option fails closed", () => {
  const pair = { A: passingEvidence("A"), B: passingEvidence("B") };
  const mapping = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json"), "utf8"));
  assert.throws(
    () => assessLegacyGroupWebImplementationCoverage(mapping, root, { liveRoleUatEvidencePair: pair, expectedTriple: triple }),
    error => error?.code === "GROUP_WEB_IMPLEMENTATION_MIXED_UAT_EVIDENCE"
  );
});

test("failed, incomplete, drifted, unsafe or resource-reused evidence fails closed", () => {
  const cases = [
    [pair => { pair.A.items[0].positive[0].status = "FAIL"; }, "YUZHOU_UAT_EVIDENCE_CHECK_FAILED"],
    [pair => { pair.A.items[0].positive[0].observation.operations[0].statusCode = 403; }, "YUZHOU_UAT_EVIDENCE_HTTP_OPERATION_INVALID"],
    [pair => { pair.B.items.pop(); }, "YUZHOU_UAT_EVIDENCE_ITEM_DRIFT"],
    [pair => { pair.A.items[0].browser.hr_manager.phone_390.status = "FAIL"; }, "YUZHOU_UAT_EVIDENCE_BROWSER_FAILED"],
    [pair => { pair.A.items[0].browser.hr_manager.phone_390.scrollWidth = 391; }, "YUZHOU_UAT_EVIDENCE_BROWSER_FAILED"],
    [pair => { pair.B.triple.mappingContractHash = "4".repeat(64); }, "YUZHOU_UAT_EVIDENCE_TRIPLE_MISMATCH"],
    [pair => { pair.B.apiMatrixSha256 = "4".repeat(64); }, "YUZHOU_UAT_EVIDENCE_BINDING_INVALID"],
    [pair => { pair.B.targetIdentityHash = pair.A.targetIdentityHash; }, "YUZHOU_UAT_EVIDENCE_RESOURCE_REUSE"],
    [pair => { pair.A.productionImport = "GO"; }, "YUZHOU_UAT_EVIDENCE_BOUNDARY_UNSAFE"],
    [pair => { pair.A.actors[1].subjectHash = pair.A.actors[0].subjectHash; }, "YUZHOU_UAT_EVIDENCE_ACTOR_REUSE"]
  ];
  for (const [mutate, code] of cases) {
    const pair = { A: passingEvidence("A"), B: passingEvidence("B") };
    mutate(pair);
    assert.throws(
      () => validateYuzhouLiveRoleUatEvidencePair(pair, taskCard, triple, apiMatrix, browserMatrix),
      error => error instanceof YuzhouLiveRoleUatEvidenceError && error.code === code
    );
  }
});
