/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  GroupWebTrainingQueryModernRuntimeError,
  validateGroupWebTrainingQueryModernRuntimeReceipt,
  validateGroupWebTrainingQueryModernRuntimeTask,
  validateGroupWebTrainingQueryModernRuntimeTaskSources,
} from "../hr-cutover/group-web-training-query-modern-runtime.mjs";

const root = resolve(import.meta.dirname, "../..");
const load = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const task = load("scripts/hr-cutover/contracts/group-web-training-query-modern-runtime-task-v1.json");
const parent = load(task.sourceCapabilityContract.path);
const sources = () => ({
  parent,
  readSource: path => readFileSync(resolve(root, path), "utf8"),
});
const expectCode = (action, code) => assert.throws(
  action,
  error => error instanceof GroupWebTrainingQueryModernRuntimeError && error.code === code,
);

function passingReceipt() {
  const summary = validateGroupWebTrainingQueryModernRuntimeTask(root, task);
  return {
    formatVersion: 1,
    contractKind: "yuzhou_hr_group_web_training_query_modern_runtime_receipt",
    executionBoundary: "isolated_lab_only",
    runId: "yz-m4-training-query-contract-fixture",
    taskCanonicalSha256: summary.taskSha256,
    status: "PASS",
    sensitiveScan: "PASS",
    apiObservations: task.apiTasks.map(item => ({
      taskId: item.id,
      method: task.endpoint.method,
      path: task.endpoint.path,
      query: structuredClone(item.query),
      actorPermissions: [...item.actorPermissions],
      responseStatus: item.expectedStatus,
      observedAccessScope: item.expectedAccessScope,
      observedAssertions: [...item.assertions],
      itemCount: item.expectedStatus === 403 ? null : item.id === "empty_scope_get" ? 0 : 1,
      total: item.expectedStatus === 403 ? null : item.id === "empty_scope_get" ? 0 : 1,
    })),
    browserObservations: task.browserTask.checks.flatMap(check => task.browserTask.viewports.map(viewport => ({
      checkId: check.id,
      viewportId: viewport.id,
      route: task.browserTask.route,
      renderedPath: check.expectedPath,
      status: "PASS",
      width: viewport.width,
      height: viewport.height,
      mobile: viewport.mobile,
      clientWidth: viewport.width,
      scrollWidth: viewport.width,
      visibleTexts: [...check.visibleTexts],
      observedAssertions: [...check.assertions],
      screenshotSha256: "a".repeat(64),
      domAssertionSha256: "b".repeat(64),
    }))),
    productionImport: "HOLD",
  };
}

test("modern training query task binds five API checks and desktop plus 390px browser cells", () => {
  const result = validateGroupWebTrainingQueryModernRuntimeTask(root, task);
  assert.equal(result.status, "MODERN_RUNTIME_TASK_READY_NOT_EXECUTED");
  assert.equal(result.apiTaskCount, 5);
  assert.equal(result.browserCheckCount, 3);
  assert.equal(result.browserObservationCount, 6);
  assert.match(result.taskSha256, /^[0-9a-f]{64}$/u);
  assert.equal(result.legacyRuntime, "PENDING");
  assert.equal(result.legacyGapCode, "GROUP_WEB_TRAINING_QUERY_RUNTIME_PARITY_NOT_OBSERVED");
  assert.equal(result.compatibilityScoreContribution, 0);
  assert.equal(result.productionImport, "HOLD");
});

test("runtime matrix freezes read permissions, GET, tenant/park scopes, 403 and empty state", () => {
  assert.deepEqual(task.endpoint, {
    method: "GET",
    path: "/hr/training/plans",
    queryKeys: ["page", "page_size", "status"],
    readPermissions: ["hr:training:read", "hr:training:team_read", "hr:training:self_read"],
  });
  assert.deepEqual(
    task.apiTasks.map(item => [item.id, item.expectedStatus, item.expectedAccessScope]),
    [
      ["park_read_get_filtered", 200, "tenant_park"],
      ["team_read_get_scoped", 200, "managed_org_tree"],
      ["self_read_get_scoped", 200, "self"],
      ["missing_read_permission_forbidden", 403, "none"],
      ["empty_scope_get", 200, "tenant_park_empty_fixture"],
    ],
  );
  assert.deepEqual(task.browserTask.viewports.map(viewport => viewport.width), [1440, 390]);
  assert.equal(task.browserTask.checks[1].visibleTexts.includes("当前没有可见培训任务。"), true);
  assert.equal(task.browserTask.checks[2].visibleTexts.includes("无权访问培训管理"), true);
});

test("current controller, service, permission guard, client and tests satisfy the frozen task sources", () => {
  const result = validateGroupWebTrainingQueryModernRuntimeTaskSources(task, sources());
  assert.equal(result.status, "MODERN_RUNTIME_TASK_READY_NOT_EXECUTED");
});

test("synthetic receipt proves the verifier but is not committed runtime or legacy evidence", () => {
  const result = validateGroupWebTrainingQueryModernRuntimeReceipt(task, passingReceipt());
  assert.equal(result.status, "MODERN_RUNTIME_CONTRACT_PASS");
  assert.equal(result.apiObservations, 5);
  assert.equal(result.browserObservations, 6);
  assert.equal(result.legacyRuntime, "PENDING");
  assert.deepEqual(result.coverageCredit, {
    groupWebNavigableEntries: { numerator: 0, denominator: 186 },
    legacyInteractionParity: { numerator: 0, denominator: 6 },
  });
  assert.equal(result.compatibilityScoreContribution, 0);
});

test("task completion, endpoint, permission, scope, 403, empty and viewport drift fail closed", () => {
  const cases = [
    [draft => { draft.status = "verified"; }, "GROUP_WEB_TRAINING_MODERN_TASK_UNSAFE"],
    [draft => { draft.compatibilityScoreContribution = 1; }, "GROUP_WEB_TRAINING_MODERN_FALSE_CREDIT"],
    [draft => { draft.endpoint.method = "POST"; }, "GROUP_WEB_TRAINING_MODERN_ENDPOINT_DRIFT"],
    [draft => { draft.endpoint.readPermissions.pop(); }, "GROUP_WEB_TRAINING_MODERN_ENDPOINT_DRIFT"],
    [draft => { draft.apiTasks[1].expectedAccessScope = "tenant_park"; }, "GROUP_WEB_TRAINING_MODERN_API_MATRIX_INVALID"],
    [draft => { draft.apiTasks[3].expectedStatus = 200; }, "GROUP_WEB_TRAINING_MODERN_API_MATRIX_INVALID"],
    [draft => { draft.apiTasks[4].assertions = ["items_empty", "page_shape_preserved"]; }, "GROUP_WEB_TRAINING_MODERN_EMPTY_CASE_INVALID"],
    [draft => { draft.browserTask.viewports[1].width = 391; }, "GROUP_WEB_TRAINING_MODERN_BROWSER_MATRIX_INVALID"],
    [draft => { draft.legacyRuntime.status = "verified"; }, "GROUP_WEB_TRAINING_MODERN_LEGACY_GAP_INVALID"],
  ];
  for (const [mutate, code] of cases) {
    const draft = structuredClone(task);
    mutate(draft);
    expectCode(() => validateGroupWebTrainingQueryModernRuntimeTaskSources(draft, sources()), code);
  }
});

test("missing source symbol and parent capability drift fail closed", () => {
  const sourceDrift = sources();
  sourceDrift.readSource = path => path.endsWith("hr-training.controller.ts") ? "" : readFileSync(resolve(root, path), "utf8");
  expectCode(
    () => validateGroupWebTrainingQueryModernRuntimeTaskSources(task, sourceDrift),
    "GROUP_WEB_TRAINING_MODERN_SOURCE_TOKEN_MISSING",
  );

  const parentDrift = sources();
  parentDrift.parent = structuredClone(parent);
  parentDrift.parent.status = "verified";
  expectCode(
    () => validateGroupWebTrainingQueryModernRuntimeTaskSources(task, parentDrift),
    "GROUP_WEB_TRAINING_MODERN_PARENT_DRIFT",
  );
});

test("runtime receipt rejects scope, forbidden, empty, overflow, binding and sensitive-key drift", () => {
  const cases = [
    [receipt => { receipt.apiObservations[1].observedAccessScope = "tenant_park"; }, "GROUP_WEB_TRAINING_MODERN_RECEIPT_API_INVALID"],
    [receipt => { receipt.apiObservations[3].responseStatus = 200; }, "GROUP_WEB_TRAINING_MODERN_RECEIPT_API_INVALID"],
    [receipt => { receipt.apiObservations[3].itemCount = 0; }, "GROUP_WEB_TRAINING_MODERN_RECEIPT_FORBIDDEN_INVALID"],
    [receipt => { receipt.apiObservations[4].total = 1; }, "GROUP_WEB_TRAINING_MODERN_RECEIPT_EMPTY_INVALID"],
    [receipt => { receipt.browserObservations[1].scrollWidth = 391; }, "GROUP_WEB_TRAINING_MODERN_RECEIPT_BROWSER_INVALID"],
    [receipt => { receipt.taskCanonicalSha256 = "f".repeat(64); }, "GROUP_WEB_TRAINING_MODERN_RECEIPT_INVALID"],
    [receipt => { receipt.password = "never-store-this"; }, "GROUP_WEB_TRAINING_MODERN_RECEIPT_SENSITIVE_KEY"],
  ];
  for (const [mutate, code] of cases) {
    const receipt = passingReceipt();
    mutate(receipt);
    expectCode(() => validateGroupWebTrainingQueryModernRuntimeReceipt(task, receipt), code);
  }
});
