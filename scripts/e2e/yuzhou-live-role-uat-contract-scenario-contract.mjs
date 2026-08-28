import assert from "node:assert/strict";
import test from "node:test";
import { runYuzhouContractScenario } from "../hr-cutover/yuzhou-live-role-uat-contract-scenario.mjs";

const employeeId = "11111111-1111-4111-8111-111111111111";
const contractTypeId = "22222222-2222-4222-8222-222222222222";
const otherContractId = "33333333-3333-4333-8333-333333333333";
const contractId = "44444444-4444-4444-8444-444444444444";

test("contract scenario proves salary projection and write denials across five cells", async () => {
  const calls = [];
  const runner = { execute: async input => {
    calls.push(input.checkId);
    let responses;
    if (input.checkId === "hr_manages_contract") {
      responses = [{ status: 201, body: { data: { id: contractId, status: "draft" } } }, { status: 200, body: { data: { id: contractId, status: "active", baseSalary: "2000.00", probationSalary: "1000.00" } } }];
      await input.afterOperation({ index: 0, response: responses[0] });
    } else if (input.checkId === "manager_reads_team_contract_without_salary") responses = [{ status: 200, body: { data: { id: contractId, status: "active" } } }];
    else if (input.checkId === "employee_reads_self_contract_without_salary") responses = [{ status: 200, body: { data: { items: [{ id: contractId, status: "active" }] } } }];
    else responses = [{ status: input.checkId === "manager_cannot_manage_contract" ? 403 : 404, body: { code: "DENIED" } }];
    const assertions = await input.assert(responses);
    assert.ok(Object.values(assertions).every(Boolean));
    return { checkId: input.checkId, assertions };
  } };
  const result = await runYuzhouContractScenario({ runner, inspect: { auditCount: async () => 1, contractNoCount: async () => 0 }, employeeId, contractTypeId, otherContractId, businessDate: "2026-08-28", contractNo: "UAT-CONTRACT-001" });
  assert.equal(result.contractId, contractId);
  assert.equal(result.observations.length, 5);
  assert.deepEqual(calls, ["hr_manages_contract", "manager_reads_team_contract_without_salary", "employee_reads_self_contract_without_salary", "manager_cannot_manage_contract", "employee_cannot_read_other_contract"]);
});
