import assert from "node:assert/strict";
import test from "node:test";
import { runYuzhouOnboardingScenario } from "../hr-cutover/yuzhou-live-role-uat-onboarding-scenario.mjs";
const employeeId = "11111111-1111-4111-8111-111111111111", onboardingId = "22222222-2222-4222-8222-222222222222";
test("onboarding scenario separates maker and reviewer and confirms employee state", async () => {
  const calls = [];
  const runner = { execute: async input => {
    calls.push(input.checkId);
    let responses;
    if (input.checkId === "hr_maker_create_submit") { responses = [{ status: 201, body: { data: { id: onboardingId, status: "draft" } } }, { status: 200, body: { data: { status: "submitted" } } }]; await input.afterOperation({ index: 0, response: responses[0] }); }
    else if (input.checkId === "hr_reviewer_approve") responses = [{ status: 200, body: { data: { status: "approved" } } }];
    else if (input.checkId === "hr_reviewer_confirm") responses = [{ status: 200, body: { data: { status: "confirmed" } } }];
    else responses = [{ status: 403, body: { code: "FORBIDDEN" } }];
    const assertions = await input.assert(responses); assert.ok(Object.values(assertions).every(Boolean)); return { checkId: input.checkId, assertions };
  } };
  const result = await runYuzhouOnboardingScenario({ runner, inspect: { applicationStatus: async () => "submitted", employeeStatus: async () => "probation", auditCount: async () => 3, makerReviewSuccessCount: async () => 0 }, employeeId, businessDate: "2026-08-28", attendanceCardNo: "260828001" });
  assert.equal(result.onboardingId, onboardingId); assert.equal(result.observations.length, 5);
  assert.deepEqual(calls, ["hr_maker_create_submit", "maker_cannot_review_own", "employee_cannot_list_all", "hr_reviewer_approve", "hr_reviewer_confirm"]);
});
