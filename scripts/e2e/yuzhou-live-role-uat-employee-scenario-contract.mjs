import assert from "node:assert/strict";
import test from "node:test";
import { runYuzhouEmployeeScenario } from "../hr-cutover/yuzhou-live-role-uat-employee-scenario.mjs";

const employeeId = "11111111-1111-4111-8111-111111111111";
const outsideEmployeeId = "22222222-2222-4222-8222-222222222222";

test("employee profile scenario closes five full, masked, self and denial cells", async () => {
  const calls = [];
  let auditCount = 0;
  const runner = { execute: async input => {
    calls.push(input.checkId);
    const response = input.checkId === "hr_reads_sensitive_profile"
      ? { status: 200, body: { data: { employeeId, masked: false, personalMobile: "synthetic", idNumber: "synthetic-protected-value", idNumberMasked: "32********34", dateOfBirth: null, remark: null } } }
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
