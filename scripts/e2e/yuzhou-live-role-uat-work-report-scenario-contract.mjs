import assert from "node:assert/strict";
import test from "node:test";
import { runYuzhouWorkReportScenario } from "../hr-cutover/yuzhou-live-role-uat-work-report-scenario.mjs";

const created = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

test("the work-report scenario executes all five legacy cells with real chained state", async () => {
  const calls = [];
  let state = "confirmed";
  const runner = { execute: async input => {
    calls.push(`${input.legacyId}:${input.kind}:${input.checkId}`);
    let responses;
    if (input.checkId === "employee_create_update_submit") {
      responses = [
        { status: 201, body: { data: { id: created, status: "draft" } } },
        { status: 200, body: { data: { id: created, completedWork: "完成隔离演练并复核" } } },
        { status: 200, body: { data: { id: created, status: "submitted" } } }
      ];
      await input.afterOperation({ index: 0, response: responses[0] });
    } else if (input.checkId === "manager_reads_team_and_reviews") {
      responses = [{ status: 200, body: { data: [{ id: created }] } }, { status: 200, body: { data: { status: "confirmed" } } }];
    } else if (input.checkId === "employee_reads_action_history") {
      responses = [{ status: 200, body: { data: [{ actionType: "confirmed" }] } }];
    } else if (input.checkId === "employee_cannot_review") {
      responses = [{ status: 403, body: { code: "FORBIDDEN" } }];
    } else {
      responses = [{ status: 404, body: { code: "NOT_FOUND" } }];
    }
    const assertions = await input.assert(responses);
    assert.ok(Object.values(assertions).every(Boolean));
    return { checkId: input.checkId, assertions };
  } };
  const result = await runYuzhouWorkReportScenario({ runner, inspect: { reportState: async () => state, auditCount: async () => 4 }, otherWorkReportId: other, businessDate: "2026-08-28" });
  assert.equal(result.workReportId, created);
  assert.equal(result.observations.length, 5);
  assert.deepEqual(calls, [
    "313:positive:employee_create_update_submit",
    "313:positive:manager_reads_team_and_reviews",
    "313:positive:employee_reads_action_history",
    "313:negative:employee_cannot_review",
    "313:negative:employee_cannot_read_other_report"
  ]);
  state = "changed";
  await assert.rejects(() => runYuzhouWorkReportScenario({ runner, inspect: { reportState: async () => state, auditCount: async () => 0 }, otherWorkReportId: other, businessDate: "bad" }), /invalid dependencies/u);
});
