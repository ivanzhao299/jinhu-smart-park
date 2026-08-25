import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrFeedback360Service } from "./hr-feedback360.service";
const root = path.resolve(__dirname, "../../../../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const scope = { tenantId: "10000001", parkId: "20000001" };
const actor = {
  sub: "00000000-0000-4000-8000-000000000001",
  username: "none",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: [],
};
test("feedback360 direct service calls fail closed without atomic permissions", async () => {
  const db = {
    query: async () => {
      throw new Error("database must not be queried");
    },
    transaction: async () => {
      throw new Error("transaction must not start");
    },
  };
  const service = new HrFeedback360Service(
    db as never,
    {
      recordOperationRequired: async () => {
        throw new Error("audit must not run");
      },
    } as never,
    {} as never,
  );
  assert.deepEqual(await service.cycles(scope, actor, {}), []);
  assert.deepEqual(await service.results(scope, actor, {}), []);
  assert.deepEqual(await service.myAssignments(scope, actor), []);
  const foreignActor = {
    ...actor,
    tenantId: "foreign-tenant",
    permissions: [HR_PERMISSIONS.HR_FEEDBACK_READ],
  };
  assert.deepEqual(await service.cycles(scope, foreignActor, {}), []);
  await assert.rejects(
    service.createCycle(scope, {
      ...foreignActor,
      permissions: [HR_PERMISSIONS.HR_FEEDBACK_CYCLE_MANAGE],
    }, {} as never),
    ForbiddenException,
  );
  await assert.rejects(service.options(scope, actor), ForbiddenException);
  await assert.rejects(
    service.createCycle(scope, actor, {} as never),
    ForbiddenException,
  );
  await assert.rejects(
    service.nominate(scope, actor, {} as never),
    ForbiddenException,
  );
  await assert.rejects(
    service.publishResult(scope, actor, "00000000-0000-4000-8000-000000000002"),
    ForbiddenException,
  );
});
test("every feedback360 POST owns one exact atom, idempotency and body-free audit", () => {
  const c = read("apps/api/src/modules/hr/hr-feedback360.controller.ts");
  for (
    const atom of [
      "HR_FEEDBACK_MODEL_MANAGE",
      "HR_FEEDBACK_CYCLE_MANAGE",
      "HR_FEEDBACK_NOMINATE",
      "HR_FEEDBACK_NOMINATION_REVIEW",
      "HR_FEEDBACK_RESPOND",
      "HR_FEEDBACK_RESULT_PUBLISH",
    ]
  ) {
    assert.match(
      c,
      new RegExp(
        `@Post\\([\\s\\S]{0,500}@UseInterceptors\\(new IdempotencyInterceptor\\(\\)\\)[\\s\\S]{0,300}@RequirePermissions\\(HR_PERMISSIONS\\.${atom}\\)[\\s\\S]{0,700}captureBody: false`,
      ),
      atom,
    );
  }
  assert.doesNotMatch(c, /@Post\([^\n]+@RequireAnyPermissions/);
});
test("migration freezes evidence and enforces database anonymous threshold", () => {
  const sql = read("database/migrations/000260_hr_competency_feedback360.sql");
  for (
    const table of [
      "hr_competency_model_version",
      "hr_competency_dimension",
      "hr_competency_behavior_anchor",
      "hr_feedback_questionnaire_version",
      "hr_feedback_question",
      "hr_feedback360_cycle",
      "hr_feedback360_subject",
      "hr_feedback360_nomination",
      "hr_feedback360_assignment",
      "hr_feedback360_response",
      "hr_feedback360_dimension_result",
      "hr_feedback360_action",
    ]
  ) assert.match(sql, new RegExp(`CREATE TABLE ${table} \\(`));
  assert.match(sql, /minimum_anonymous_responses integer NOT NULL DEFAULT 3/);
  assert.match(sql, /minimum_anonymous_responses>=3/);
  assert.match(sql, /response_count>=minimum_required/);
  assert.match(sql, /360 anonymous result threshold has not been reached/);
  assert.match(sql, /trg_hr_feedback360_response_append_only/);
  assert.match(sql, /trg_hr_feedback360_result_append_only/);
  assert.match(sql, /published 360 subject is immutable/);
  assert.match(sql, /trg_hr_competency_model_version_frozen/);
  assert.match(sql, /trg_hr_feedback_questionnaire_version_frozen/);
  assert.match(sql, /trg_hr_feedback360_cycle_frozen/);
  assert.match(sql, /trg_hr_feedback360_nomination_valid/);
  assert.match(sql, /360 nomination and approval must be separated/);
  assert.match(sql, /360 assignment must exactly match an approved nomination/);
  assert.match(sql, /360 result average must be database-derived/);
  assert.doesNotMatch(
    sql,
    /UPDATE hr_performance|UPDATE hr_payroll|UPDATE hr_employee SET/,
  );
});
test("anonymous result projection excludes reviewer, assignment and free text", () => {
  const s = read("apps/api/src/modules/hr/hr-feedback360.service.ts");
  const result = s.slice(
    s.indexOf("async results("),
    s.indexOf("private async action"),
  );
  assert.doesNotMatch(
    result,
    /reviewer_employee_id|assignment_id|answers|response_hash|free.?text/i,
  );
  assert.match(result, /dimensionCode/);
  assert.match(result, /averageScore/);
  assert.doesNotMatch(result, /"subjectId"|relationGroup|responseCount/);
  assert.equal(
    HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE,
    "hr:feedback:model_manage",
  );
  assert.equal(
    HR_PERMISSIONS.HR_FEEDBACK_RESULT_PUBLISH,
    "hr:feedback:result_publish",
  );
});
test("production seed is least privilege for department manager and employee", () => {
  const seed = read("database/seeds/production/000026_hr_feedback360_rbac.sql");
  assert.match(seed, /DEPARTMENT_MANAGER','hr:feedback:team_read/);
  assert.match(seed, /EMPLOYEE_SELF_SERVICE','hr:feedback:self_read/);
  assert.match(seed, /EMPLOYEE_SELF_SERVICE','hr:feedback:respond/);
  assert.match(seed, /broad permission leaked/);
  assert.doesNotMatch(
    seed,
    /\('EMPLOYEE_SELF_SERVICE','hr:feedback:(read|team_read|model_manage|cycle_manage|nomination_review|result_publish|result_read)'\)/,
  );
});
