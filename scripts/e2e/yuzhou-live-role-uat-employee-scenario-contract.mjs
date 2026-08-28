import assert from "node:assert/strict";
import test from "node:test";
import { runYuzhouEmployeeScenario } from "../hr-cutover/yuzhou-live-role-uat-employee-scenario.mjs";

const employeeId = "11111111-1111-4111-8111-111111111111";
const outsideEmployeeId = "22222222-2222-4222-8222-222222222222";

test("employee profile scenario closes five full, masked, self and denial cells", async () => {
  const calls = [];
  const runner = { execute: async input => {
    calls.push(input.checkId);
    const response = input.checkId === "hr_reads_sensitive_profile"
      ? { status: 200, body: { data: { personalMobile: "synthetic", idNumber: null } } }
      : input.checkId === "manager_reads_masked_team_profile" || input.checkId === "employee_reads_masked_self_profile"
        ? { status: 200, body: { data: { id: employeeId, employeeCode: "synthetic" } } }
        : { status: input.checkId === "manager_cannot_read_sensitive_profile" ? 403 : 404, body: { code: "DENIED" } };
    const assertions = await input.assert([response]);
    assert.ok(Object.values(assertions).every(Boolean));
    return { checkId: input.checkId, assertions };
  } };
  const result = await runYuzhouEmployeeScenario({ runner, inspect: { auditCount: async () => 1, managerProfileSuccessAuditCount: async () => 0 }, employeeId, outsideEmployeeId });
  assert.equal(result.observations.length, 5);
  assert.deepEqual(calls, ["hr_reads_sensitive_profile", "manager_reads_masked_team_profile", "employee_reads_masked_self_profile", "manager_cannot_read_sensitive_profile", "employee_cannot_read_other_employee"]);
  await assert.rejects(() => runYuzhouEmployeeScenario({ runner, inspect: {}, employeeId, outsideEmployeeId }), /invalid dependencies/u);
});
