import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  YuzhouLiveRoleUatRecorder,
  YuzhouLiveRoleUatRecorderError,
  validateRecordedYuzhouLiveRoleUatPair
} from "../hr-cutover/yuzhou-live-role-uat-recorder.mjs";
import { apiMatrixHash } from "../hr-cutover/yuzhou-live-role-uat-api-matrix-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const taskCard = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/yuzhou-live-role-uat-task-card-v1.json"), "utf8"));
const apiMatrix = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/yuzhou-live-role-uat-api-matrix-v1.json"), "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
const triple = { codeSha: "1".repeat(40), sourceSnapshotHash: "2".repeat(64), mappingContractHash: "3".repeat(64) };
const statusFor = outcome => outcome === "success" ? 200 : outcome === "forbidden" ? 403 : outcome === "conflict" ? 409 : 404;
function observation(legacyId, kind, checkId) {
  const check = apiMatrix.checks.find(candidate => candidate.legacyId === legacyId && candidate.kind === kind && candidate.checkId === checkId);
  const operations = check.operations.map(operation => ({ method: operation.method, routeTemplate: operation.route, outcome: operation.outcome, statusCode: statusFor(operation.outcome), requestBodySha256: hash("request"), responseShapeSha256: hash("response") }));
  const assertions = Object.fromEntries(check.assertions.map(assertion => [assertion, true]));
  return { actor: check.actor, checkKeySha256: hash(`${legacyId}:${kind}:${checkId}`), operations, assertions, observationSha256: hash(JSON.stringify({ actor: check.actor, operations, assertions })) };
}

function complete(rehearsal) {
  const recorder = new YuzhouLiveRoleUatRecorder(taskCard, {
    rehearsal,
    runId: `yzfull-recorder-r${rehearsal}`,
    targetIdentityHash: hash(`target-${rehearsal}`),
    apiMatrixSha256: apiMatrixHash(apiMatrix),
    triple,
    actors: ["maker", "reviewer", "manager", "employee"].map((actor, index) => ({
      roleType: index < 2 ? "hr_manager" : index === 2 ? "department_manager" : "employee_self_service",
      subjectHash: hash(`${rehearsal}-${actor}`)
    }))
  });
  for (const item of taskCard.items) {
    for (const id of item.positive) recorder.passCheck(item.legacyId, "positive", id, observation(item.legacyId, "positive", id));
    for (const id of item.negative) recorder.passCheck(item.legacyId, "negative", id, observation(item.legacyId, "negative", id));
    for (const viewport of taskCard.viewports) recorder.passBrowser(item.legacyId, viewport.id, {
      route: item.route,
      width: viewport.width,
      height: viewport.height,
      mobile: viewport.mobile,
      clientWidth: viewport.width,
      scrollWidth: viewport.width
    });
    recorder.passAudit(item.legacyId);
  }
  return recorder.finalize();
}

test("the recorder emits a pair only after every task-card cell is observed", () => {
  const pair = { A: complete("A"), B: complete("B") };
  const result = validateRecordedYuzhouLiveRoleUatPair(pair, taskCard, triple, apiMatrix);
  assert.equal(result.status, "PASS");
  assert.equal(result.eligibleLegacyIds.length, 12);
});

test("missing checks, audit or browser measurements cannot be finalized", () => {
  const meta = {
    rehearsal: "A",
    runId: "yzfull-recorder-negative-rA",
    targetIdentityHash: hash("negative-target"),
    apiMatrixSha256: apiMatrixHash(apiMatrix),
    triple,
    actors: ["maker", "reviewer", "manager", "employee"].map((actor, index) => ({
      roleType: index < 2 ? "hr_manager" : index === 2 ? "department_manager" : "employee_self_service",
      subjectHash: hash(`negative-${actor}`)
    }))
  };
  const recorder = new YuzhouLiveRoleUatRecorder(taskCard, meta);
  assert.throws(
    () => recorder.finalize(),
    error => error instanceof YuzhouLiveRoleUatRecorderError && error.code === "YUZHOU_UAT_RECORDER_CHECK_MISSING"
  );
  assert.throws(
    () => recorder.passCheck(34, "positive", "invented", {}),
    error => error instanceof YuzhouLiveRoleUatRecorderError && error.code === "YUZHOU_UAT_RECORDER_CHECK_UNKNOWN"
  );
  assert.throws(
    () => recorder.passCheck(34, "positive", "hr_maker_create_submit"),
    error => error instanceof YuzhouLiveRoleUatRecorderError && error.code === "YUZHOU_UAT_RECORDER_OBSERVATION_MISSING"
  );
});
