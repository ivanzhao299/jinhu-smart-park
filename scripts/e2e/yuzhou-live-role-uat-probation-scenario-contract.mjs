import assert from "node:assert/strict";
import test from "node:test";
import { runYuzhouProbationScenario } from "../hr-cutover/yuzhou-live-role-uat-probation-scenario.mjs";
const employeeId = "11111111-1111-4111-8111-111111111111", probationId = "22222222-2222-4222-8222-222222222222";
test("probation scenario proves participant snapshot, maker segregation and confirmation", async () => {
  const calls = [], runner = { execute: async input => { calls.push(input.checkId); let responses; if (input.checkId === "hr_maker_create_submit") { responses = [{ status: 201, body: { data: { id: probationId } } }, { status: 200, body: { data: { status: "submitted", participants: [{ employeeId }] } } }]; await input.afterOperation({ index: 0, response: responses[0] }); } else if (input.checkId === "hr_reviewer_approve_confirm") responses = [{ status: 200, body: { data: { status: "approved" } } }, { status: 200, body: { data: { status: "confirmed" } } }]; else responses = [{ status: 403, body: { code: "FORBIDDEN" } }]; const assertions = await input.assert(responses); assert.ok(Object.values(assertions).every(Boolean)); return { checkId: input.checkId, assertions }; } };
  const result = await runYuzhouProbationScenario({ runner, inspect: { applicationStatus: async () => "submitted", employeeStatus: async () => "active", auditCount: async () => 3, makerReviewSuccessCount: async () => 0 }, employeeId, businessDate: "2026-08-28" });
  assert.equal(result.probationId, probationId); assert.equal(result.observations.length, 4); assert.deepEqual(calls, ["hr_maker_create_submit", "maker_cannot_review_own", "employee_cannot_confirm", "hr_reviewer_approve_confirm"]);
});
