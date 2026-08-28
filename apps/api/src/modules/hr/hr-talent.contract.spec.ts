import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { HrTalentService } from "./hr-talent.service";
const root = resolve(__dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const controller = read("apps/api/src/modules/hr/hr-talent.controller.ts"),
  service = read("apps/api/src/modules/hr/hr-talent.service.ts"),
  migration = read("database/migrations/000261_hr_talent_management.sql"),
  seed = read("database/seeds/production/000027_hr_talent_rbac.sql"),
  web = read("apps/web/app/hr/talent/HrTalentClient.tsx"),
  notification = read("apps/api/src/modules/hr/hr-notification.service.ts");
test("talent writes use exact atoms, idempotency, body-free audit and required audited reads", () => {
  for (const atom of [
    "HR_TALENT_PROFILE_CREATE",
    "HR_TALENT_REVIEW",
    "HR_SUCCESSION_MANAGE",
    "HR_DEVELOPMENT_MANAGE",
    "HR_DEVELOPMENT_SELF_ACTION",
  ])
    assert.match(controller, new RegExp(atom));
  assert.ok((controller.match(/IdempotencyInterceptor/g) ?? []).length >= 9);
  assert.ok((controller.match(/captureBody:\s*false/g) ?? []).length >= 9);
  assert.match(service, /recordHrSensitiveRead/);
  assert.match(
    service,
    /type Access\s*=\s*"park"\s*\|\s*"managed_org_tree"\s*\|\s*"self"\s*\|\s*"none"/,
  );
});
test("talent sources and judgments are frozen or append-only", () => {
  for (const table of [
    "hr_talent_profile_snapshot",
    "hr_talent_review_session",
    "hr_talent_review_subject",
    "hr_talent_review_decision",
    "hr_critical_position",
    "hr_succession_candidate_version",
    "hr_development_plan",
    "hr_development_plan_history",
    "hr_development_action",
    "hr_development_action_history",
  ])
    assert.match(migration, new RegExp(`CREATE TABLE ${table}`));
  assert.match(migration, /hr_talent_append_only_guard/);
  assert.match(migration, /supersedes_id/);
  assert.match(service, /source_digest/);
  assert.match(service, /profile_snapshot_id/);
  assert.match(migration, /fk_hr_talent_subject_profile[\s\S]*employee_id/);
  assert.match(migration, /fk_hr_talent_decision_previous[\s\S]*subject_id/);
  assert.match(migration, /fk_hr_succession_previous[\s\S]*critical_position_id[\s\S]*employee_id/);
  assert.match(migration, /hr_talent_decision_insert_guard/);
  assert.match(migration, /hr_succession_insert_guard/);
  assert.match(migration, /hr_development_action_insert_guard/);
  assert.equal((service.match(/SELECT \$1::varchar,\$2::varchar,\$3::uuid/g) ?? []).length, 4);
  assert.match(service, /p\.tenant_id=\$1::varchar AND p\.park_id=\$2::varchar/);
});
test("development actions enter the shared privacy-safe Workflow Inbox", () => {
  assert.match(notification, /publishDevelopmentAction/);
  assert.match(notification, /sourceType:"hr_development_action"/);
  assert.match(notification, /targetUrl:"\/hr\/talent"/);
  assert.doesNotMatch(notification, /riskReason}/);
});
test("seed keeps succession away from managers and employees", () => {
  assert.match(seed, /HR talent broad permission leaked/);
  assert.doesNotMatch(seed, /\('EMPLOYEE_SELF_SERVICE','hr:succession/);
  assert.doesNotMatch(seed, /\('DEPARTMENT_MANAGER','hr:succession/);
  assert.match(seed, /'hr:development:self_action'/);
});
test("Web provides desktop review and mobile development actions", () => {
  assert.match(web, /desktopSensitive/);
  assert.match(web, /ds-mobile-record-list/);
  assert.match(web, /九宫格决策/);
  assert.match(web, /关键岗位与候选/);
  assert.match(web, /发展计划与行动/);
  assert.doesNotMatch(web, /placeholder=["'].*UUID/i);
  assert.match(web, /action\.canAct/);
  assert.match(service, /'canAct'/);
});
test("talent service never mutates employee performance or payroll facts", () => {
  assert.doesNotMatch(
    service,
    /UPDATE\s+hr_(payslip|payroll|performance_cycle_employee)/i,
  );
  assert.doesNotMatch(service, /UPDATE\s+hr_employee/i);
});
test("direct service calls fail closed before database access", async () => {
  const db = {
    query: async () => {
      throw new Error("database must not be queried");
    },
    transaction: async () => {
      throw new Error("transaction must not start");
    },
  };
  const talent = new HrTalentService(
    db as never,
    {
      recordOperationRequired: async () => {
        throw new Error("audit must not run");
      },
    } as never,
    {} as never,
  );
  const scope = { tenantId: "10000001", parkId: "20000001" };
  const actor = {
    sub: "00000000-0000-4000-8000-000000000001",
    username: "none",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    roles: [],
    permissions: [],
  };
  assert.deepEqual(await talent.profiles(scope, actor, {}), []);
  assert.deepEqual(await talent.plans(scope, actor), []);
  await assert.rejects(
    talent.createProfile(scope, actor, {
      employeeId: "00000000-0000-4000-8000-000000000002",
      asOfDate: "2026-08-25",
    }),
    ForbiddenException,
  );
  await assert.rejects(talent.options(scope, actor), ForbiddenException);
});
