import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

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
