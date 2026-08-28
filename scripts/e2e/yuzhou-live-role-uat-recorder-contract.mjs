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
import { browserMatrixHash } from "../hr-cutover/yuzhou-live-role-uat-browser-matrix-lib.mjs";

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

function complete(rehearsal) {
  const recorder = new YuzhouLiveRoleUatRecorder(taskCard, {
    rehearsal,
    runId: `yzfull-recorder-r${rehearsal}`,
    targetIdentityHash: hash(`target-${rehearsal}`),
    apiMatrixSha256: apiMatrixHash(apiMatrix),
    browserMatrixSha256: browserMatrixHash(browserMatrix),
    triple,
    actors: ["hr_maker", "hr_reviewer", "manager", "employee"].map((actor, index) => ({
      actor,
      roleType: index < 2 ? "hr_manager" : index === 2 ? "department_manager" : "employee_self_service",
      subjectHash: hash(`${rehearsal}-${actor}`)
    }))
  });
  for (const item of taskCard.items) {
    for (const id of item.positive) recorder.passCheck(item.legacyId, "positive", id, observation(item.legacyId, "positive", id));
    for (const id of item.negative) recorder.passCheck(item.legacyId, "negative", id, observation(item.legacyId, "negative", id));
    for (const roleType of item.roleTypes) for (const viewport of taskCard.viewports) recorder.passBrowser(item.legacyId, roleType, viewport.id, {
      runId: `yzfull-recorder-r${rehearsal}`, rehearsal, triple, legacyId: item.legacyId, viewportId: viewport.id,
      route: item.route,
      roleType,
      actor: browserMatrix.checks.find(check => check.legacyId === item.legacyId && check.roleType === roleType).actor,
      actorSubjectHash: hash(`${rehearsal}-${roleType === "hr_manager" ? "hr_reviewer" : roleType === "department_manager" ? "manager" : "employee"}`),
      renderedPath: browserMatrix.checks.find(check => check.legacyId === item.legacyId && check.roleType === roleType).expectedPath ?? item.route,
      width: viewport.width,
      height: viewport.height,
      mobile: viewport.mobile,
      clientWidth: viewport.width,
      scrollWidth: viewport.width,
      networkFailureCount: 0,
      screenshotSha256: hash(`${rehearsal}:${item.legacyId}:${roleType}:${viewport.id}`),
      domAssertionSha256: hash(`dom:${rehearsal}:${item.legacyId}:${roleType}:${viewport.id}`),
      cellEvidenceSha256: hash(JSON.stringify({ runId: `yzfull-recorder-r${rehearsal}`, rehearsal, triple, legacyId: item.legacyId, roleType, actor: browserMatrix.checks.find(check => check.legacyId === item.legacyId && check.roleType === roleType).actor, actorSubjectHash: hash(`${rehearsal}-${roleType === "hr_manager" ? "hr_reviewer" : roleType === "department_manager" ? "manager" : "employee"}`), route: item.route, renderedPath: browserMatrix.checks.find(check => check.legacyId === item.legacyId && check.roleType === roleType).expectedPath ?? item.route, viewportId: viewport.id, width: viewport.width, height: viewport.height, mobile: viewport.mobile, screenshotSha256: hash(`${rehearsal}:${item.legacyId}:${roleType}:${viewport.id}`), domAssertionSha256: hash(`dom:${rehearsal}:${item.legacyId}:${roleType}:${viewport.id}`), networkFailureCount: 0 }))
    });
  }
  return recorder.finalize();
}

test("the recorder emits a pair only after every task-card cell is observed", () => {
  const pair = { A: complete("A"), B: complete("B") };
  const result = validateRecordedYuzhouLiveRoleUatPair(pair, taskCard, triple, apiMatrix, browserMatrix);
  assert.equal(result.status, "PASS");
  assert.equal(result.eligibleLegacyIds.length, 12);
});

test("missing checks, audit or browser measurements cannot be finalized", () => {
  const meta = {
    rehearsal: "A",
    runId: "yzfull-recorder-negative-rA",
    targetIdentityHash: hash("negative-target"),
    apiMatrixSha256: apiMatrixHash(apiMatrix),
    browserMatrixSha256: browserMatrixHash(browserMatrix),
    triple,
    actors: ["hr_maker", "hr_reviewer", "manager", "employee"].map((actor, index) => ({
      actor,
      roleType: index < 2 ? "hr_manager" : index === 2 ? "department_manager" : "employee_self_service",
      subjectHash: hash(`negative-${actor}`)
    }))
  };
  const recorder = new YuzhouLiveRoleUatRecorder(taskCard, meta);
  const swapped = structuredClone(meta);[swapped.actors[0],swapped.actors[1]]=[swapped.actors[1],swapped.actors[0]];
  assert.throws(() => new YuzhouLiveRoleUatRecorder(taskCard, swapped), error => error instanceof YuzhouLiveRoleUatRecorderError && error.code === "YUZHOU_UAT_RECORDER_META_INVALID");
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

test("recorder independently rejects a replayed or drifted browser cell hash", () => {
  const rehearsal = "A", item = taskCard.items[0], roleType = item.roleTypes[0], viewport = taskCard.viewports[0];
  const recorder = new YuzhouLiveRoleUatRecorder(taskCard, {
    rehearsal, runId: "yzfull-recorder-replay-rA", targetIdentityHash: hash("replay-target"),
    apiMatrixSha256: apiMatrixHash(apiMatrix), browserMatrixSha256: browserMatrixHash(browserMatrix), triple,
    actors: [
      { actor: "hr_maker", roleType: "hr_manager", subjectHash: hash("replay-maker") },
      { actor: "hr_reviewer", roleType: "hr_manager", subjectHash: hash("replay-reviewer") },
      { actor: "manager", roleType: "department_manager", subjectHash: hash("replay-manager") },
      { actor: "employee", roleType: "employee_self_service", subjectHash: hash("replay-employee") }
    ]
  });
  const check = browserMatrix.checks.find(row => row.legacyId === item.legacyId && row.roleType === roleType);
  const measurement = { runId: "yzfull-recorder-replay-rA", rehearsal, triple, legacyId: item.legacyId, roleType, actor: check.actor, actorSubjectHash: hash("replay-reviewer"), route: check.route, renderedPath: check.expectedPath ?? check.route, viewportId: viewport.id, width: viewport.width, height: viewport.height, mobile: viewport.mobile, clientWidth: viewport.width, scrollWidth: viewport.width, networkFailureCount: 0, screenshotSha256: hash("shot"), domAssertionSha256: hash("dom"), cellEvidenceSha256: "f".repeat(64) };
  assert.throws(() => recorder.passBrowser(item.legacyId, roleType, viewport.id, measurement), error => error instanceof YuzhouLiveRoleUatRecorderError && error.code === "YUZHOU_UAT_RECORDER_BROWSER_CELL_HASH_INVALID");
});
