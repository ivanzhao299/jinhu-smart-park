/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  YuzhouLiveRoleUatApiMatrixError,
  validateYuzhouLiveRoleUatApiMatrix
} from "../hr-cutover/yuzhou-live-role-uat-api-matrix-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const load = relative => JSON.parse(readFileSync(resolve(root, relative), "utf8"));
const taskCard = load("scripts/hr-cutover/contracts/yuzhou-live-role-uat-task-card-v1.json");
const matrix = load("scripts/hr-cutover/contracts/yuzhou-live-role-uat-api-matrix-v1.json");
const p0Matrix = load("scripts/hr-cutover/contracts/yuzhou-live-role-uat-p0-matrix-v1.json");

test("the API matrix binds every task-card check to an isolated real HTTP operation", () => {
  const result = validateYuzhouLiveRoleUatApiMatrix(matrix, taskCard);
  assert.equal(result.status, "PASS");
  assert.equal(result.checkCount, 46);
  assert.deepEqual(result.legacyIds, [34, 35, 36, 37, 39, 42, 43, 44, 45, 46, 47, 313]);
  assert.match(result.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(result.productionImport, "HOLD");
});

test("legacy and P0 matrices share the executable full, team, self and cross-tree profile contract",()=>{
  const legacyById=Object.fromEntries(matrix.checks.filter(check=>check.legacyId===35).map(check=>[check.checkId,check]));
  const p0ById=Object.fromEntries(p0Matrix.checks.map(check=>[check.id,check]));
  const routeShape=route=>route.replace(/\{[^}]+\}/gu,"{employeeId}");
  assert.equal(routeShape(legacyById.hr_reads_sensitive_profile.operations[0].route),routeShape(p0ById.profile_full_projection.route));
  assert.equal(legacyById.manager_reads_masked_team_profile.operations[0].route,"/hr/employees/{teamEmployeeId}/profile");
  assert.equal(p0ById.profile_team_projection.route,"/hr/employees/{employeeId}/profile");
  assert.equal(legacyById.employee_reads_masked_self_profile.operations[0].route,p0ById.profile_self_projection.route);
  assert.equal(legacyById.manager_cannot_read_cross_tree_profile.operations[0].route,p0ById.profile_cross_tree_hidden.route);
  assert.equal(legacyById.manager_cannot_read_cross_tree_profile.operations[0].outcome,"not_found_or_forbidden");
  for(const id of ["hr_reads_sensitive_profile","manager_reads_masked_team_profile","employee_reads_masked_self_profile"]){
    assert.ok(legacyById[id].assertions.includes("required_audit_written"));
  }
});

test("missing cells, unsafe routes, actor drift and proof-free negatives fail closed", () => {
  const cases = [
    [draft => { draft.checks.pop(); }, "YUZHOU_UAT_API_MATRIX_CHECK_DRIFT"],
    [draft => { draft.checks[0].actor = "admin"; }, "YUZHOU_UAT_API_MATRIX_ACTOR_INVALID"],
    [draft => { draft.checks[0].operations[0].route = "/admin/users"; }, "YUZHOU_UAT_API_MATRIX_OPERATION_INVALID"],
    [draft => { draft.checks[0].operations[0].outcome = "forbidden"; }, "YUZHOU_UAT_API_MATRIX_OUTCOME_INVALID"],
    [draft => { draft.checks[3].assertions = ["state_observed"]; }, "YUZHOU_UAT_API_MATRIX_NEGATIVE_PROOF_MISSING"],
    [draft => { draft.productionImport = "GO"; }, "YUZHOU_UAT_API_MATRIX_UNSAFE"]
  ];
  for (const [mutate, code] of cases) {
    const draft = structuredClone(matrix);
    mutate(draft);
    assert.throws(
      () => validateYuzhouLiveRoleUatApiMatrix(draft, taskCard),
      error => error instanceof YuzhouLiveRoleUatApiMatrixError && error.code === code
    );
  }
});
