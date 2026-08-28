import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { YuzhouLiveRoleUatBrowserRunnerError, missingVisibleTexts, observeSameOriginApiNetworkEvent, runYuzhouLiveRoleUatBrowserMatrix, validateYuzhouBrowserObservation } from "../hr-cutover/yuzhou-live-role-uat-browser-runner.mjs";

const check = { legacyId: 35, roleType: "department_manager", actor: "manager", route: "/hr/employees" };
const viewport = { id: "phone_390", width: 390, height: 844, mobile: true };
const assertions = ["authenticated_route_reached", "no_runtime_error_surface", "no_horizontal_overflow", "role_allowed_actions_visible", "role_forbidden_actions_absent", "sensitive_values_not_rendered_for_masked_roles", "session_cleanup_removes_sensitive_dom_and_storage"];
const root = resolve(import.meta.dirname, "../..");
const taskCard = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/yuzhou-live-role-uat-task-card-v1.json"), "utf8"));
const browserMatrix = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/yuzhou-live-role-uat-browser-matrix-v1.json"), "utf8"));
const triple = { codeSha: "1".repeat(40), sourceSnapshotHash: "2".repeat(64), mappingContractHash: "3".repeat(64) };
const hash = value => createHash("sha256").update(value).digest("hex");
const passing = () => {
  const value = { runId: "yzfull-browser-contract-rA", rehearsal: "A", triple, legacyId: 35, roleType: "department_manager", actor: "manager", actorSubjectHash: "4".repeat(64), route: "/hr/employees", renderedPath: "/hr/employees", viewportId: "phone_390", status: "PASS", width: 390, height: 844, mobile: true, clientWidth: 390, scrollWidth: 390, networkFailureCount: 0, assertions: [...assertions], screenshotSha256: "a".repeat(64), domAssertionSha256: "b".repeat(64) };
  value.cellEvidenceSha256 = hash(JSON.stringify({ runId: value.runId, rehearsal: value.rehearsal, triple: value.triple, legacyId: value.legacyId, roleType: value.roleType, actor: value.actor, actorSubjectHash: value.actorSubjectHash, route: value.route, renderedPath: value.renderedPath, viewportId: value.viewportId, width: value.width, height: value.height, mobile: value.mobile, screenshotSha256: value.screenshotSha256, domAssertionSha256: value.domAssertionSha256, networkFailureCount: value.networkFailureCount }));
  return value;
};

test("browser runner observation is role, route, viewport, layout and screenshot bound", () => {
  assert.equal(validateYuzhouBrowserObservation(passing(), check, viewport, assertions).status, "PASS");
});

test("browser observation drift and horizontal overflow fail closed", () => {
  const cases = [
    value => { value.roleType = "hr_manager"; }, value => { value.route = "/dashboard"; }, value => { value.renderedPath = "/403"; },
    value => { value.width = 500; }, value => { value.scrollWidth = 391; },
    value => { value.assertions.pop(); }, value => { value.screenshotSha256 = "not-a-hash"; },
    value => { value.runId = "other"; }, value => { value.triple.codeSha = "f".repeat(40); },
    value => { value.runId = "yzfull-browser-contract-rB"; },
    value => { value.actorSubjectHash = "5".repeat(64); }, value => { value.domAssertionSha256 = "c".repeat(64); }
  ];
  for (const mutate of cases) {
    const value = passing(); mutate(value);
    assert.throws(() => validateYuzhouBrowserObservation(value, check, viewport, assertions), error => error instanceof YuzhouLiveRoleUatBrowserRunnerError);
  }
});

test("visible-text diagnostics report only missing contract labels", () => {
  assert.deepEqual(missingVisibleTexts("团队员工档案", ["团队员工档案", "查看与办理"]), ["查看与办理"]);
  assert.deepEqual(missingVisibleTexts("", ["团队员工档案", "查看与办理"]), ["团队员工档案", "查看与办理"]);
});

test("same-origin API 4xx, 5xx and loading failures cannot be hidden by static page text", () => {
  const requests = new Map(), failures = [], origin = "http://127.0.0.1:4301";
  observeSameOriginApiNetworkEvent({ method: "Network.requestWillBeSent", params: { requestId: "a", type: "Fetch", request: { url: `${origin}/api/v1/hr/employees` } } }, origin, requests, failures);
  observeSameOriginApiNetworkEvent({ method: "Network.responseReceived", params: { requestId: "a", response: { status: 403 } } }, origin, requests, failures);
  observeSameOriginApiNetworkEvent({ method: "Network.requestWillBeSent", params: { requestId: "b", type: "XHR", request: { url: `${origin}/api/v1/hr/payroll` } } }, origin, requests, failures);
  observeSameOriginApiNetworkEvent({ method: "Network.responseReceived", params: { requestId: "b", response: { status: 500 } } }, origin, requests, failures);
  observeSameOriginApiNetworkEvent({ method: "Network.requestWillBeSent", params: { requestId: "c", type: "Fetch", request: { url: `${origin}/api/v1/hr/contracts` } } }, origin, requests, failures);
  observeSameOriginApiNetworkEvent({ method: "Network.responseReceived", params: { requestId: "c", response: { status: 200 } } }, origin, requests, failures);
  observeSameOriginApiNetworkEvent({ method: "Network.loadingFailed", params: { requestId: "c", canceled: false } }, origin, requests, failures);
  observeSameOriginApiNetworkEvent({ method: "Network.requestWillBeSent", params: { requestId: "d", type: "Fetch", request: { url: `${origin}/api/v1/hr/rewards` } } }, origin, requests, failures);
  observeSameOriginApiNetworkEvent({ method: "Network.responseReceived", params: { requestId: "d", response: { status: 200 } } }, origin, requests, failures);
  observeSameOriginApiNetworkEvent({ method: "Network.loadingFinished", params: { requestId: "d" } }, origin, requests, failures);
  observeSameOriginApiNetworkEvent({ method: "Network.requestWillBeSent", params: { requestId: "x", type: "Fetch", request: { url: "https://example.invalid/api" } } }, origin, requests, failures);
  observeSameOriginApiNetworkEvent({ method: "Network.responseReceived", params: { requestId: "x", response: { status: 500 } } }, origin, requests, failures);
  assert.deepEqual(failures, ["http:403", "http:500", "loading_failed"]);
  assert.equal(requests.size, 0);
});

test("browser execution without immutable run and C/S/M binding fails before launch", async () => {
  await assert.rejects(
    () => runYuzhouLiveRoleUatBrowserMatrix({ taskCard, browserMatrix }),
    error => error instanceof YuzhouLiveRoleUatBrowserRunnerError && error.code === "YUZHOU_UAT_BROWSER_BINDING_REQUIRED"
  );
});
