import assert from "node:assert/strict";
import test from "node:test";
import { YuzhouLiveRoleUatBrowserRunnerError, validateYuzhouBrowserObservation } from "../hr-cutover/yuzhou-live-role-uat-browser-runner.mjs";

const check = { legacyId: 35, roleType: "department_manager", actor: "manager", route: "/hr/employees" };
const viewport = { id: "phone_390", width: 390, height: 844, mobile: true };
const assertions = ["authenticated_route_reached", "no_runtime_error_surface", "no_horizontal_overflow", "role_allowed_actions_visible", "role_forbidden_actions_absent", "sensitive_values_not_rendered_for_masked_roles", "session_cleanup_removes_sensitive_dom_and_storage"];
const passing = () => ({ legacyId: 35, roleType: "department_manager", actor: "manager", route: "/hr/employees", viewportId: "phone_390", status: "PASS", width: 390, height: 844, mobile: true, clientWidth: 390, scrollWidth: 390, assertions: [...assertions], screenshotSha256: "a".repeat(64) });

test("browser runner observation is role, route, viewport, layout and screenshot bound", () => {
  assert.equal(validateYuzhouBrowserObservation(passing(), check, viewport, assertions).status, "PASS");
});

test("browser observation drift and horizontal overflow fail closed", () => {
  const cases = [
    value => { value.roleType = "hr_manager"; }, value => { value.route = "/dashboard"; },
    value => { value.width = 500; }, value => { value.scrollWidth = 391; },
    value => { value.assertions.pop(); }, value => { value.screenshotSha256 = "not-a-hash"; }
  ];
  for (const mutate of cases) {
    const value = passing(); mutate(value);
    assert.throws(() => validateYuzhouBrowserObservation(value, check, viewport, assertions), error => error instanceof YuzhouLiveRoleUatBrowserRunnerError);
  }
});
