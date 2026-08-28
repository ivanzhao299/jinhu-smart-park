import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrDepartureService } from "./hr-departure.service";

const root = resolve(__dirname, "../../../../../");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const controller = read("apps/api/src/modules/hr/hr-departure.controller.ts");
const service = read("apps/api/src/modules/hr/hr-departure.service.ts");
const foundationService = read("apps/api/src/modules/hr/hr.service.ts");
const migration = read("database/migrations/000274_hr_departure_clearance_parity.sql");
const seed = read("database/seeds/production/000029_hr_departure_rbac.sql");

test("departure compatibility is scoped, maker-checker controlled and atomic", () => {
  for (const atom of [
    "HR_DEPARTURE_READ",
    "HR_DEPARTURE_TEAM_READ",
    "HR_DEPARTURE_SELF_READ",
    "HR_DEPARTURE_MANAGE",
    "HR_DEPARTURE_REVIEW",
    "HR_DEPARTURE_INTERVIEW",
    "HR_DEPARTURE_SURVEY",
    "HR_DEPARTURE_HANDOVER",
    "HR_DEPARTURE_WAGE_SETTLE",
    "HR_DEPARTURE_ARCHIVE_CLOSE",
    "HR_DEPARTURE_APPLY",
  ]) assert.match(controller, new RegExp(atom));
  assert.match(service, /managed_org_tree/);
  assert.match(service, /Applicants cannot review their own/);
  assert.match(service, /Departure clearance is incomplete/);
  assert.match(service, /changed after approval/);
  assert.match(service, /hireDate:dateOnly\(e\.hire_date/);
  assert.match(service, /departureDate:dateOnly\(e\.departure_date/);
  assert.match(service, /evidence is already closed/);
  assert.match(service, /this\.sensitive\(a\)/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(controller, /IdempotencyInterceptor/g);
  assert.match(migration, /HR_DEPARTURE_SUBMITTED_FACTS_IMMUTABLE/);
  assert.match(migration, /hr_departure_action_append_only/);
  assert.match(migration, /HR_DEPARTURE_INTERVIEW_IMMUTABLE/);
  assert.match(migration, /HR_EMPLOYEE_DEPARTURE_WORKFLOW_REQUIRED/);
  assert.match(seed, /broad permission leaked/);
  assert.match(foundationService, /departure must be completed through an approved departure application/);
  assert.match(foundationService, /Departure date must be changed through the approved departure workflow/);
});

test("departure snapshots preserve date-only employee facts across the Shanghai timezone", async () => {
  const scope = { tenantId: "tenant", parkId: "park" };
  const actor: JwtPrincipal = {
    sub: "00000000-0000-4000-8000-000000000001",
    username: "hr-departure-test",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    roles: [],
    permissions: [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_MANAGE],
  };
  let snapshot: Record<string, unknown> | undefined;
  const application = {
    id: "00000000-0000-4000-8000-000000000010",
    application_no: "LZ2026080001",
    application_name: "Date-only test",
    applicant_user_id: actor.sub,
    subject_employee_id: "00000000-0000-4000-8000-000000000011",
    application_date: "2026-08-28",
    planned_departure_date: "2026-08-28",
    departure_type: "resignation",
    reason: "test",
    before_snapshot: {},
    status: "draft",
    interview_status: "pending",
    survey_status: "pending",
    handover_status: "pending",
    wage_status: "pending",
    archive_status: "open",
  };
  const manager = {
    query: async (sql: string, params: unknown[]) => {
      if (sql.includes("FROM hr_employee e LEFT JOIN")) {
        return [{
          id: application.subject_employee_id,
          employee_code: "E-1",
          full_name: "Test employee",
          user_id: null,
          primary_org_id: null,
          position_id: null,
          manager_employee_id: null,
          employment_type: "full_time",
          employment_status: "active",
          hire_date: new Date("2026-02-28T16:00:00.000Z"),
          departure_date: null,
          org_name: null,
          position_name: null,
        }];
      }
      if (sql.includes("FROM hr_departure_application WHERE") && sql.includes("status IN")) return [];
      if (sql.includes("COALESCE(MAX(right(candidate_no")) return [{ n: 1 }];
      if (sql.startsWith("INSERT INTO hr_departure_application(")) {
        snapshot = JSON.parse(String(params[10])) as Record<string, unknown>;
        return [application];
      }
      if (sql.startsWith("SELECT d.*")) return [application];
      return [];
    },
  };
  const db = {
    transaction: async (work: (m: typeof manager) => unknown) => work(manager),
  } as unknown as DataSource;

  await new HrDepartureService(db, {} as never).create(scope, actor, {
    applicationName: application.application_name,
    employeeId: application.subject_employee_id,
    applicationDate: application.application_date,
    plannedDepartureDate: application.planned_departure_date,
    departureType: "resignation",
    reason: application.reason,
  });

  assert.equal(snapshot?.hireDate, "2026-03-01");
  assert.equal(snapshot?.departureDate, null);
});
