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
import { assessLegacyGroupWebImplementationCoverage } from "../hr-cutover/legacy-group-web-implementation-coverage-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const taskCard = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/yuzhou-live-role-uat-task-card-v1.json"), "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
const triple = { codeSha: "1".repeat(40), sourceSnapshotHash: "2".repeat(64), mappingContractHash: "3".repeat(64) };

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
    triple: { ...triple },
    actors: ["maker", "reviewer", "manager", "employee"].map((actor, index) => ({
      roleType: index < 2 ? "hr_manager" : index === 2 ? "department_manager" : "employee_self_service",
      subjectHash: hash(`${rehearsal}-${actor}`)
    })),
    items: taskCard.items.map(item => ({
      legacyId: item.legacyId,
      status: "PASS",
      positive: item.positive.map(id => ({ id, status: "PASS" })),
      negative: item.negative.map(id => ({ id, status: "PASS" })),
      browser: Object.fromEntries(taskCard.viewports.map(viewport => [viewport.id, {
        status: "PASS",
        width: viewport.width,
        height: viewport.height,
        mobile: viewport.mobile,
        clientWidth: viewport.width,
        scrollWidth: viewport.width,
        assertions: taskCard.browserAssertions
      }])),
      auditStatus: "PASS"
    })),
    p0P1Count: 0,
    sensitiveScan: "PASS",
    auditStatus: "PASS",
    humanAttestation: "HOLD",
    productionImport: "HOLD"
  };
}

test("independent A/B evidence promotes only the exact twelve bound items", () => {
  const pair = { A: passingEvidence("A"), B: passingEvidence("B") };
  const result = validateYuzhouLiveRoleUatEvidencePair(pair, taskCard, triple);
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.eligibleLegacyIds, [34, 35, 36, 37, 39, 42, 43, 44, 45, 46, 47, 313]);
  assert.equal(result.productionImport, "HOLD");
  const mapping = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-group-web-module-mapping-v1.json"), "utf8"));
  const coverage = assessLegacyGroupWebImplementationCoverage(mapping, root, { liveRoleUatEvidencePair: pair, expectedTriple: triple });
  assert.deepEqual(coverage.summary.scoreBands, { score100: 12, score90: 0, score80: 150, score60: 0, score40: 27, score20: 42 });
  assert.deepEqual(coverage.summary.statuses, { implemented: 12, partial: 150, mapped_only: 69 });
  assert.equal(coverage.summary.averageScore, 65.45);
  assert.equal(coverage.gates.productionImport, "HOLD");
});

test("failed, incomplete, drifted, unsafe or resource-reused evidence fails closed", () => {
  const cases = [
    [pair => { pair.A.items[0].positive[0].status = "FAIL"; }, "YUZHOU_UAT_EVIDENCE_CHECK_FAILED"],
    [pair => { pair.B.items.pop(); }, "YUZHOU_UAT_EVIDENCE_ITEM_DRIFT"],
    [pair => { pair.A.items[0].browser.phone_390.status = "FAIL"; }, "YUZHOU_UAT_EVIDENCE_BROWSER_FAILED"],
    [pair => { pair.A.items[0].browser.phone_390.scrollWidth = 391; }, "YUZHOU_UAT_EVIDENCE_BROWSER_FAILED"],
    [pair => { pair.B.triple.mappingContractHash = "4".repeat(64); }, "YUZHOU_UAT_EVIDENCE_TRIPLE_MISMATCH"],
    [pair => { pair.B.targetIdentityHash = pair.A.targetIdentityHash; }, "YUZHOU_UAT_EVIDENCE_RESOURCE_REUSE"],
    [pair => { pair.A.productionImport = "GO"; }, "YUZHOU_UAT_EVIDENCE_BOUNDARY_UNSAFE"],
    [pair => { pair.A.actors[1].subjectHash = pair.A.actors[0].subjectHash; }, "YUZHOU_UAT_EVIDENCE_ACTOR_REUSE"]
  ];
  for (const [mutate, code] of cases) {
    const pair = { A: passingEvidence("A"), B: passingEvidence("B") };
    mutate(pair);
    assert.throws(
      () => validateYuzhouLiveRoleUatEvidencePair(pair, taskCard, triple),
      error => error instanceof YuzhouLiveRoleUatEvidenceError && error.code === code
    );
  }
});
