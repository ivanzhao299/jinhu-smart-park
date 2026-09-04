import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export class GroupWebTrainingQueryModernRuntimeError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "GroupWebTrainingQueryModernRuntimeError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new GroupWebTrainingQueryModernRuntimeError(code, detail);
};
const sha256 = value => createHash("sha256").update(value).digest("hex");
const canonicalSha256 = value => sha256(`${JSON.stringify(value)}\n`);
const SHA64 = /^[0-9a-f]{64}$/u;
const COVERAGE = {
  groupWebNavigableEntries: { numerator: 0, denominator: 186 },
  legacyInteractionParity: { numerator: 0, denominator: 6 },
};
const READ_PERMISSIONS = [
  "hr:training:read",
  "hr:training:team_read",
  "hr:training:self_read",
];
const API_TASKS = [
  ["park_read_get_filtered", ["hr:training:read"], 200, "tenant_park"],
  ["team_read_get_scoped", ["hr:training:team_read"], 200, "managed_org_tree"],
  ["self_read_get_scoped", ["hr:training:self_read"], 200, "self"],
  ["missing_read_permission_forbidden", [], 403, "none"],
  ["empty_scope_get", ["hr:training:read"], 200, "tenant_park_empty_fixture"],
];
const VIEWPORTS = [
  { id: "desktop", width: 1440, height: 1000, mobile: false },
  { id: "phone_390", width: 390, height: 844, mobile: true },
];
const BROWSER_CHECK_IDS = [
  "training_query_surface",
  "training_query_empty_state",
  "training_query_page_forbidden",
];

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function safeFileReader(root) {
  const canonicalRoot = realpathSync(root);
  const prefix = `${canonicalRoot}${sep}`;
  return relativePath => {
    const candidate = resolve(canonicalRoot, relativePath);
    const stat = lstatSync(candidate);
    const real = realpathSync(candidate);
    if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(prefix)) {
      fail("GROUP_WEB_TRAINING_MODERN_SOURCE_PATH_INVALID", relativePath);
    }
    return readFileSync(real, "utf8");
  };
}

function assertTaskShape(task) {
  if (task?.formatVersion !== 1
    || task.contractKind !== "yuzhou_hr_group_web_training_query_modern_runtime_task"
    || task.taskVersion !== "training-query-modern-runtime-1.0.0") {
    fail("GROUP_WEB_TRAINING_MODERN_TASK_INVALID", "identity");
  }
  if (task.executionBoundary !== "isolated_lab_only"
    || task.status !== "ready_not_executed"
    || task.productionImport !== "HOLD") {
    fail("GROUP_WEB_TRAINING_MODERN_TASK_UNSAFE", "execution state");
  }
  if (task.compatibilityScoreContribution !== 0 || !same(task.coverageCredit, COVERAGE)) {
    fail("GROUP_WEB_TRAINING_MODERN_FALSE_CREDIT", "modern task cannot prove legacy parity");
  }
  if (task.legacyRuntime?.status !== "pending"
    || task.legacyRuntime?.gapCode !== "GROUP_WEB_TRAINING_QUERY_RUNTIME_PARITY_NOT_OBSERVED") {
    fail("GROUP_WEB_TRAINING_MODERN_LEGACY_GAP_INVALID", "legacy runtime must remain pending");
  }
  if (task.runtimeEvidence?.status !== "not_observed"
    || task.runtimeEvidence?.requiredApiObservations !== 5
    || task.runtimeEvidence?.requiredBrowserObservations !== 6
    || task.runtimeEvidence?.sensitiveScan !== "required_pass"
    || task.runtimeEvidence?.credentialsExcluded !== true
    || task.runtimeEvidence?.personalDataExcluded !== true) {
    fail("GROUP_WEB_TRAINING_MODERN_EVIDENCE_GATE_INVALID", "runtime evidence requirements");
  }
}

function assertEndpointAndApiTasks(task) {
  if (task.endpoint?.method !== "GET"
    || task.endpoint?.path !== "/hr/training/plans"
    || !same(task.endpoint?.queryKeys, ["page", "page_size", "status"])
    || !same(task.endpoint?.readPermissions, READ_PERMISSIONS)) {
    fail("GROUP_WEB_TRAINING_MODERN_ENDPOINT_DRIFT", "GET/read permissions/query keys");
  }
  if (!Array.isArray(task.apiTasks) || task.apiTasks.length !== API_TASKS.length) {
    fail("GROUP_WEB_TRAINING_MODERN_API_MATRIX_INVALID", "five exact API tasks required");
  }
  if (new Set(task.apiTasks.map(item => item.id)).size !== API_TASKS.length) {
    fail("GROUP_WEB_TRAINING_MODERN_API_MATRIX_INVALID", "duplicate API task");
  }
  for (let index = 0; index < API_TASKS.length; index += 1) {
    const item = task.apiTasks[index];
    const [id, permissions, status, accessScope] = API_TASKS[index];
    if (item?.id !== id
      || !same(item.actorPermissions, permissions)
      || item.expectedStatus !== status
      || item.expectedAccessScope !== accessScope
      || item.query?.page !== "1"
      || item.query?.page_size !== "20"
      || !Array.isArray(item.assertions)
      || item.assertions.length < 2
      || new Set(item.assertions).size !== item.assertions.length) {
      fail("GROUP_WEB_TRAINING_MODERN_API_MATRIX_INVALID", id);
    }
  }
  if (task.apiTasks[0].query.status !== "published"
    || task.apiTasks.slice(1).some(item => Object.hasOwn(item.query, "status"))) {
    fail("GROUP_WEB_TRAINING_MODERN_QUERY_MATRIX_INVALID", "one bounded status-filter case required");
  }
  const forbidden = task.apiTasks[3];
  if (!forbidden.assertions.includes("permission_guard_denies")
    || !forbidden.assertions.includes("no_training_rows_returned")) {
    fail("GROUP_WEB_TRAINING_MODERN_FORBIDDEN_CASE_INVALID", forbidden.id);
  }
  const empty = task.apiTasks[4];
  if (!same(empty.assertions, ["items_empty", "total_zero", "page_shape_preserved"])) {
    fail("GROUP_WEB_TRAINING_MODERN_EMPTY_CASE_INVALID", empty.id);
  }
}

function assertBrowserTask(task) {
  if (task.browserTask?.route !== "/hr/training"
    || !same(task.browserTask?.viewports, VIEWPORTS)
    || !Array.isArray(task.browserTask?.checks)
    || !same(task.browserTask.checks.map(check => check.id), BROWSER_CHECK_IDS)) {
    fail("GROUP_WEB_TRAINING_MODERN_BROWSER_MATRIX_INVALID", "route/viewports/checks");
  }
  const [surface, empty, forbidden] = task.browserTask.checks;
  if (!same(surface.actorPermissions, ["hr:training", "hr:training:read"])
    || surface.fixture !== "scoped_non_sensitive_rows"
    || !surface.visibleTexts.includes("培训管理")
    || !surface.visibleTexts.includes("培训任务")) {
    fail("GROUP_WEB_TRAINING_MODERN_BROWSER_MATRIX_INVALID", surface.id);
  }
  if (empty.fixture !== "empty_tenant_park_scope"
    || !empty.visibleTexts.includes("当前没有可见培训任务。")
    || !empty.assertions.includes("empty_response_rendered")) {
    fail("GROUP_WEB_TRAINING_MODERN_BROWSER_EMPTY_INVALID", empty.id);
  }
  if (!same(forbidden.actorPermissions, [])
    || forbidden.fixture !== "no_hr_page_permission"
    || !forbidden.visibleTexts.includes("403")
    || !forbidden.visibleTexts.includes("无权访问培训管理")
    || !forbidden.assertions.includes("forbidden_surface_rendered")) {
    fail("GROUP_WEB_TRAINING_MODERN_BROWSER_FORBIDDEN_INVALID", forbidden.id);
  }
  for (const check of task.browserTask.checks) {
    if (check.expectedPath !== "/hr/training"
      || !check.assertions.includes("no_runtime_error_surface")
      || !check.assertions.includes("no_horizontal_overflow")) {
      fail("GROUP_WEB_TRAINING_MODERN_BROWSER_MATRIX_INVALID", check.id);
    }
  }
}

function assertSourceEvidence(task, readSource) {
  if (!Array.isArray(task.sourceEvidence) || task.sourceEvidence.length !== 8) {
    fail("GROUP_WEB_TRAINING_MODERN_SOURCE_SET_INVALID", "eight source bindings required");
  }
  if (new Set(task.sourceEvidence.map(source => source.path)).size !== task.sourceEvidence.length) {
    fail("GROUP_WEB_TRAINING_MODERN_SOURCE_SET_INVALID", "duplicate source path");
  }
  for (const source of task.sourceEvidence) {
    if (typeof source.path !== "string"
      || !Array.isArray(source.requiredTokens)
      || source.requiredTokens.length === 0
      || source.requiredTokens.some(token => typeof token !== "string" || token.length < 4)) {
      fail("GROUP_WEB_TRAINING_MODERN_SOURCE_SET_INVALID", String(source.path));
    }
    const text = readSource(source.path);
    for (const token of source.requiredTokens) {
      if (!text.includes(token)) {
        fail("GROUP_WEB_TRAINING_MODERN_SOURCE_TOKEN_MISSING", `${source.path}:${token}`);
      }
    }
  }
}

function assertParentCapability(task, parent) {
  if (task.sourceCapabilityContract?.path !== "scripts/hr-cutover/contracts/group-web-training-query-capability-v1.json"
    || !SHA64.test(task.sourceCapabilityContract?.canonicalSha256 ?? "")
    || canonicalSha256(parent) !== task.sourceCapabilityContract.canonicalSha256) {
    fail("GROUP_WEB_TRAINING_MODERN_PARENT_DRIFT", "static capability contract hash");
  }
  if (parent?.candidate?.id !== "GROUP-WEB-INTERACTION-128-TRAINING-QUERY"
    || parent.status !== "pending_runtime_parity"
    || parent.review?.gapCode !== task.legacyRuntime.gapCode
    || parent.compatibilityScoreContribution !== 0
    || !same(parent.coverageCredit, COVERAGE)) {
    fail("GROUP_WEB_TRAINING_MODERN_PARENT_INVALID", "legacy pending/credit binding");
  }
}

export function validateGroupWebTrainingQueryModernRuntimeTaskSources(task, { parent, readSource }) {
  assertTaskShape(task);
  assertParentCapability(task, parent);
  assertEndpointAndApiTasks(task);
  assertBrowserTask(task);
  assertSourceEvidence(task, readSource);
  return {
    status: "MODERN_RUNTIME_TASK_READY_NOT_EXECUTED",
    taskSha256: canonicalSha256(task),
    apiTaskCount: task.apiTasks.length,
    browserCheckCount: task.browserTask.checks.length,
    browserObservationCount: task.browserTask.checks.length * task.browserTask.viewports.length,
    legacyRuntime: "PENDING",
    legacyGapCode: task.legacyRuntime.gapCode,
    coverageCredit: task.coverageCredit,
    compatibilityScoreContribution: 0,
    productionImport: "HOLD",
  };
}

export function validateGroupWebTrainingQueryModernRuntimeTask(root, task) {
  const readSource = safeFileReader(root);
  const parent = JSON.parse(readSource(task.sourceCapabilityContract?.path));
  return validateGroupWebTrainingQueryModernRuntimeTaskSources(task, { parent, readSource });
}

function rejectSensitiveReceiptKeys(value, path = "receipt") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSensitiveReceiptKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (["password", "token", "accessToken", "username", "fullName", "phone", "email", "salary", "payroll"].includes(key)) {
      fail("GROUP_WEB_TRAINING_MODERN_RECEIPT_SENSITIVE_KEY", `${path}.${key}`);
    }
    rejectSensitiveReceiptKeys(child, `${path}.${key}`);
  }
}

export function validateGroupWebTrainingQueryModernRuntimeReceipt(task, receipt) {
  assertTaskShape(task);
  assertEndpointAndApiTasks(task);
  assertBrowserTask(task);
  rejectSensitiveReceiptKeys(receipt);
  if (receipt?.formatVersion !== 1
    || receipt.contractKind !== "yuzhou_hr_group_web_training_query_modern_runtime_receipt"
    || receipt.executionBoundary !== "isolated_lab_only"
    || receipt.status !== "PASS"
    || receipt.productionImport !== "HOLD"
    || receipt.sensitiveScan !== "PASS"
    || receipt.taskCanonicalSha256 !== canonicalSha256(task)
    || !/^yz-m4-training-query-[a-z0-9._-]+$/u.test(receipt.runId ?? "")) {
    fail("GROUP_WEB_TRAINING_MODERN_RECEIPT_INVALID", "identity/binding/safety");
  }
  if (!Array.isArray(receipt.apiObservations)
    || receipt.apiObservations.length !== task.apiTasks.length
    || !same(receipt.apiObservations.map(item => item.taskId), task.apiTasks.map(item => item.id))) {
    fail("GROUP_WEB_TRAINING_MODERN_RECEIPT_API_INVALID", "exact API observations required");
  }
  for (let index = 0; index < task.apiTasks.length; index += 1) {
    const expected = task.apiTasks[index];
    const observed = receipt.apiObservations[index];
    if (observed.method !== task.endpoint.method
      || observed.path !== task.endpoint.path
      || !same(observed.query, expected.query)
      || !same(observed.actorPermissions, expected.actorPermissions)
      || observed.responseStatus !== expected.expectedStatus
      || observed.observedAccessScope !== expected.expectedAccessScope
      || !same(observed.observedAssertions, expected.assertions)) {
      fail("GROUP_WEB_TRAINING_MODERN_RECEIPT_API_INVALID", expected.id);
    }
    if (expected.expectedStatus === 403) {
      if (observed.itemCount !== null || observed.total !== null) {
        fail("GROUP_WEB_TRAINING_MODERN_RECEIPT_FORBIDDEN_INVALID", expected.id);
      }
    } else if (!Number.isInteger(observed.itemCount)
      || observed.itemCount < 0
      || !Number.isInteger(observed.total)
      || observed.total < observed.itemCount) {
      fail("GROUP_WEB_TRAINING_MODERN_RECEIPT_PAGE_INVALID", expected.id);
    }
    if (expected.id === "empty_scope_get" && (observed.itemCount !== 0 || observed.total !== 0)) {
      fail("GROUP_WEB_TRAINING_MODERN_RECEIPT_EMPTY_INVALID", expected.id);
    }
  }

  const expectedCells = task.browserTask.checks.flatMap(check => task.browserTask.viewports.map(viewport => ({ check, viewport })));
  if (!Array.isArray(receipt.browserObservations)
    || receipt.browserObservations.length !== expectedCells.length
    || !same(receipt.browserObservations.map(item => `${item.checkId}:${item.viewportId}`), expectedCells.map(({ check, viewport }) => `${check.id}:${viewport.id}`))) {
    fail("GROUP_WEB_TRAINING_MODERN_RECEIPT_BROWSER_INVALID", "exact browser cells required");
  }
  for (let index = 0; index < expectedCells.length; index += 1) {
    const { check, viewport } = expectedCells[index];
    const observed = receipt.browserObservations[index];
    if (observed.route !== task.browserTask.route
      || observed.renderedPath !== check.expectedPath
      || observed.status !== "PASS"
      || observed.width !== viewport.width
      || observed.height !== viewport.height
      || observed.mobile !== viewport.mobile
      || !Number.isInteger(observed.clientWidth)
      || !Number.isInteger(observed.scrollWidth)
      || observed.clientWidth > viewport.width
      || observed.scrollWidth > observed.clientWidth
      || !same(observed.visibleTexts, check.visibleTexts)
      || !same(observed.observedAssertions, check.assertions)
      || !SHA64.test(observed.screenshotSha256 ?? "")
      || !SHA64.test(observed.domAssertionSha256 ?? "")) {
      fail("GROUP_WEB_TRAINING_MODERN_RECEIPT_BROWSER_INVALID", `${check.id}:${viewport.id}`);
    }
  }
  return {
    status: "MODERN_RUNTIME_CONTRACT_PASS",
    apiObservations: receipt.apiObservations.length,
    browserObservations: receipt.browserObservations.length,
    legacyRuntime: "PENDING",
    legacyGapCode: task.legacyRuntime.gapCode,
    coverageCredit: task.coverageCredit,
    compatibilityScoreContribution: 0,
    productionImport: "HOLD",
  };
}
