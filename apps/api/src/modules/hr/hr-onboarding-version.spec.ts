import assert from "node:assert/strict";
import test from "node:test";
import type {DataSource, EntityManager} from "typeorm";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HrOnboardingService} from "./hr-onboarding.service";

const scope = {tenantId: "synthetic-tenant", parkId: "synthetic-park"};
const actor: JwtPrincipal = {...scope, sub: "reviewer", username: "synthetic", roles: [], permissions: ["hr:employee:manage", "hr:employment:transition"]};
const application = {
  id: "application", version: 36, entry_type: "rehire", employee_id: "employee", candidate_id: null,
  applicant_user_id: "maker", application_no: "SYN-RE-001", application_name: "Synthetic rehire",
  application_date: "2026-10-01", planned_hire_date: "2026-10-01", probation_months: 0,
  attendance_card_no: "1001", status: "returned", expected_employee_version: 7,
  target_org_id: "org", target_position_id: "position", target_manager_employee_id: null,
};
const employee = {id: "employee", employment_status: "departed", version: 7, departure_date: "2026-07-01"};
const save = {
  entryType: "rehire" as const, employeeId: "employee", applicationName: application.application_name,
  applicationDate: application.application_date, plannedHireDate: application.planned_hire_date,
  probationMonths: 0, attendanceCardNo: "1001", expectedEmployeeVersion: 7,
  targetOrgId: "org", targetPositionId: "position", targetManagerEmployeeId: null,
};

test("public onboarding list selects and returns the actual application version with scoped filters", async () => {
  const db = {query: async (sql: string, params: unknown[]) => {
    assert.deepEqual(params.slice(0, 4), [scope.tenantId, scope.parkId, "rehire", "employee"]);
    assert.match(sql, /a\.entry_type=\$3/); assert.match(sql, /a\.employee_id=\$4/);
    if (sql.includes("count(*)")) return [{total: 1}];
    assert.match(sql, /SELECT a\.version,/);
    return [{id: "application", entryType: "rehire", employeeId: "employee", version: 36}];
  }} as unknown as DataSource;
  const result = await new HrOnboardingService(db).list(scope, {page: 1, page_size: 20, entryType: "rehire", employeeId: "employee"});
  assert.equal(result.items[0].version, 36); assert.equal(result.total, 1);
});

for (const operation of ["create", "update", "act", "review", "confirm"] as const) {
  test(`public ${operation} projects the persisted RETURNING version and preserves transactional audit`, async () => {
    const queries: string[] = [];
    const nextStatus = operation === "act" ? "submitted" : operation === "review" ? "returned" : operation === "confirm" ? "confirmed" : "draft";
    const locked = {...application, status: operation === "review" ? "submitted" : operation === "confirm" ? "approved" : operation === "act" ? "draft" : "returned"};
    const returned = {...application, version: 91, status: nextStatus, review_comment: operation === "review" ? "Actual review" : null, reviewed_at: operation === "review" ? "2026-10-10T01:00:00Z" : null, confirmed_at: operation === "confirm" ? "2026-10-10T02:00:00Z" : null};
    const manager = {query: async (sql: string, params: unknown[]) => {
      queries.push(sql);
      if (sql.includes("FROM hr_onboarding_application") && sql.includes("FOR UPDATE")) { assert.deepEqual(params, ["application", scope.tenantId, scope.parkId]); return [locked]; }
      if (sql.includes("FROM hr_employee") && (sql.includes("FOR SHARE") || sql.includes("FOR UPDATE"))) return [employee];
      if (sql.includes("FROM hr_position")) return [{id: "position"}];
      if (sql.includes("AT TIME ZONE")) return [{today: "2026-10-10"}];
      if (sql.startsWith("UPDATE hr_employee")) { assert.equal(params[8], 7); return [[{...employee, version: 8, employment_status: "active"}], 1]; }
      if (sql.startsWith("INSERT INTO hr_onboarding_application(")) return [returned];
      if (sql.startsWith("UPDATE hr_onboarding_application")) { assert.match(sql, /version=version\+1/); return [[returned], 1]; }
      return [];
    }};
    let committed = false;
    const db = {transaction: async <T>(work: (m: EntityManager) => Promise<T>) => {const result = await work(manager as unknown as EntityManager); committed = true; return result;}} as unknown as DataSource;
    const service = new HrOnboardingService(db);
    const result = operation === "create" ? await service.create(scope, actor, save)
      : operation === "update" ? await service.update(scope, actor, "application", save)
      : operation === "act" ? await service.act(scope, actor, "application", {action: "submit"})
      : operation === "review" ? await service.review(scope, actor, "application", {action: "return", comment: "Actual review"})
      : await service.confirm(scope, actor, "application");
    assert.ok(committed); assert.ok(result); assert.equal(result.version, 91); assert.equal(result.employeeId, "employee");
    assert.equal(result.entryType, "rehire"); assert.equal(result.status, nextStatus); assert.equal(result.probationMonths, 0);
    assert.ok(queries.some(sql => sql.startsWith("INSERT INTO hr_onboarding_application_action")));
    if (operation === "review") {assert.equal(result.reviewComment, "Actual review"); assert.equal(result.reviewedAt, returned.reviewed_at);}
    if (operation === "confirm") {assert.equal(result.confirmedAt, returned.confirmed_at); assert.ok(queries.some(sql => sql.startsWith("INSERT INTO hr_employment_event")));}
    assert.equal("expected_employee_version" in result, false);
  });
}
