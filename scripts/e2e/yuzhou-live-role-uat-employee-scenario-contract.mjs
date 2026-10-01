import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runYuzhouEmployeeScenario, EMPLOYEE_UAT_SYNTHETIC_IDENTITY } from "../hr-cutover/yuzhou-live-role-uat-employee-scenario.mjs";
import { YuzhouLiveRoleUatHttpRunner } from "../hr-cutover/yuzhou-live-role-uat-http-runner.mjs";

const employeeId = "11111111-1111-4111-8111-111111111111";
const outsideEmployeeId = "22222222-2222-4222-8222-222222222222";

test("null or wrong decryption and masked identity leaks cannot pass UAT", async () => {
  for (const idNumber of [null, "wrong-synthetic-value", ""]) {
    const observations = new Map();
    let auditCount = 0;
    const runner = { execute: async input => {
      auditCount += 1;
      const full = input.checkId === "hr_reads_sensitive_profile";
      const response = { status: 200, body: { data: { employeeId, masked: !full,
        personalMobile: "synthetic", idNumberMasked: "MASKED", idNumber,
        ...(full ? { dateOfBirth: null } : {}) } } };
      const assertions = await input.assert([response]);
      observations.set(input.checkId, assertions);
      return { checkId: input.checkId, assertions };
    } };
    await runYuzhouEmployeeScenario({ runner, inspect: { auditCount: async () => auditCount,
      managerProfileSuccessAuditCount: async () => 0 }, employeeId, outsideEmployeeId });
    assert.equal(observations.get("hr_reads_sensitive_profile").full_profile_projection, false);
    assert.equal(observations.get("manager_reads_masked_team_profile").no_sensitive_fields, false);
    assert.equal(observations.get("employee_reads_masked_self_profile").no_sensitive_fields, false);
  }
});

function actualRunnerFixture(idNumber = EMPLOYEE_UAT_SYNTHETIC_IDENTITY) {
  const taskCard = JSON.parse(readFileSync(new URL("../hr-cutover/contracts/yuzhou-live-role-uat-task-card-v1.json", import.meta.url)));
  const apiMatrix = JSON.parse(readFileSync(new URL("../hr-cutover/contracts/yuzhou-live-role-uat-api-matrix-v1.json", import.meta.url)));
  const tokens = Object.fromEntries(["hr_maker", "hr_reviewer", "manager", "employee"].map(actor => [actor, `synthetic-only-${actor}-token`]));
  let auditCount = 0;
  const runner = new YuzhouLiveRoleUatHttpRunner({ apiBase: "http://127.0.0.1:3999/api/v1", taskCard, apiMatrix, tokens, idempotencyPrefix: "synthetic-profile-contract", request: async (url, options) => {
    const full = options.headers.authorization === `Bearer ${tokens.hr_reviewer}`;
    const outside = url.includes(outsideEmployeeId);
    if (!outside) auditCount += 1;
    const payload = outside ? { code: "DENIED" } : { data: full
      ? { employeeId, masked: false, personalMobile: "synthetic", idNumber, idNumberMasked: "MASKED", dateOfBirth: null, remark: null }
      : { employeeId, masked: true, idNumberMasked: "MASKED", personalMobile: "masked" } };
    return { status: outside ? 403 : 200, json: async () => payload };
  } });
  return { runner, inspect: { auditCount: async () => auditCount, managerProfileSuccessAuditCount: async () => 0 }, employeeId, outsideEmployeeId };
}

test("profile scenario passes the real HTTP runner's declared assertion shape", async () => {
  const result = await runYuzhouEmployeeScenario(actualRunnerFixture());
  assert.equal(result.observations.length, 5);
  assert.deepEqual(result.observations[0].assertions, { full_profile_projection: true, required_audit_written: true });
});

test("real HTTP runner still rejects missing, empty and incorrect decrypted identity", async () => {
  for (const idNumber of [null, "", "wrong-synthetic-value"]) {
    await assert.rejects(runYuzhouEmployeeScenario(actualRunnerFixture(idNumber)), error => error.code === "YUZHOU_UAT_HTTP_ASSERTION_FAILED" && error.message.endsWith(": full_profile_projection"));
  }
});

test("employee profile scenario closes five full, masked, self and denial cells", async () => {
  const calls = [];
  let auditCount = 0;
  const runner = { execute: async input => {
    calls.push(input.checkId);
    const response = input.checkId === "hr_reads_sensitive_profile"
      ? { status: 200, body: { data: { employeeId, masked: false, personalMobile: "synthetic", idNumber: EMPLOYEE_UAT_SYNTHETIC_IDENTITY, idNumberMasked: "32********34", dateOfBirth: null, remark: null } } }
      : input.checkId === "manager_reads_masked_team_profile" || input.checkId === "employee_reads_masked_self_profile"
        ? { status: 200, body: { data: { employeeId, masked: true, idNumberMasked: "32********34", personalMobile: "138****5678", personalEmail: "s***@example.test", address: "***", emergencyContactName: "王**", emergencyContactMobile: "139****4321" } } }
        : { status: input.checkId === "manager_cannot_read_cross_tree_profile" ? 403 : 404, body: { code: "DENIED" } };
    if (["hr_reads_sensitive_profile", "manager_reads_masked_team_profile", "employee_reads_masked_self_profile"].includes(input.checkId)) auditCount += 1;
    const assertions = await input.assert([response]);
    assert.ok(Object.values(assertions).every(Boolean));
    return { checkId: input.checkId, assertions };
  } };
  const result = await runYuzhouEmployeeScenario({ runner, inspect: { auditCount: async () => auditCount, managerProfileSuccessAuditCount: async () => 0 }, employeeId, outsideEmployeeId });
  assert.equal(result.observations.length, 5);
  assert.deepEqual(calls, ["hr_reads_sensitive_profile", "manager_reads_masked_team_profile", "employee_reads_masked_self_profile", "manager_cannot_read_cross_tree_profile", "employee_cannot_read_other_employee"]);
  await assert.rejects(() => runYuzhouEmployeeScenario({ runner, inspect: {}, employeeId, outsideEmployeeId }), /invalid dependencies/u);
});
