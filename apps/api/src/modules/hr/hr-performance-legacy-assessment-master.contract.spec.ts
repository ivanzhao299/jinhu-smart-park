import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrPerformanceLegacyAssessmentMasterQueryDto } from "./dto/hr-performance-legacy-assessment-master.dto";
import { HrPerformanceLegacyService } from "./hr-performance-legacy.service";

const scope = { tenantId: "tenant-1", parkId: "park-1" };
const query = {
  ass_session: "2026-Q3",
  assessment_type: "YEAR",
  department_like: "001%",
  department_match_mode: "legacy_like" as const,
  page: 2,
  page_size: 25,
};
const row = {
  unresolvedLegacyAssessmentMasterId: null,
  sourcePersonCode: "legacy-code",
  employeeDisplayName: "Synthetic employee",
  sourceAssGrade: "A",
  sourceItemValue: "90.00",
  sourceMasterValue: "1.00",
  sourceTimekeepValue: "-0.50",
  sourceBonusValue: "2.00",
  sourceAppraisal: "Synthetic appraisal",
  sourceAssessmentPerson: "synthetic-assessor",
  sourceRecordedAt: "2026-01-01T00:00:00.000Z",
  sourceOperatorCode: "synthetic-op",
};

function actor(...permissions: string[]): JwtPrincipal {
  return {
    sub: "user-1",
    username: "assessment-master-query-test",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    roles: [],
    permissions,
  };
}

function harness(resultRow: Record<string, unknown> = row) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const dataSource = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return /count\(\*\)::int total/u.test(sql) ? [{ total: "1" }] : [resultRow];
    },
  } as unknown as DataSource;
  const audit = {
    recordOperationRequired: async (input: Record<string, unknown>) => {
      audits.push(input);
    },
  } as never;
  return { calls, audits, service: new HrPerformanceLegacyService(dataSource, audit) };
}

test("u_assessmentmaster DTO accepts only bounded exact or legacy-like filters", async () => {
  for (const departmentMatchMode of ["exact", "legacy_like"]) {
    const dto = plainToInstance(HrPerformanceLegacyAssessmentMasterQueryDto, {
      ...query,
      department_match_mode: departmentMatchMode,
      ass_session: "  2026-Q3  ",
    });
    assert.equal((await validate(dto)).length, 0);
    assert.equal(dto.ass_session, "2026-Q3");
  }
  for (const candidate of [
    { ...query, department_match_mode: "prefix" },
    { ...query, department_like: "001\\%" },
    { ...query, department_like: "001*" },
    { ...query, ass_session: "x".repeat(31) },
    { ...query, assessment_type: "x".repeat(5) },
    { ...query, assessment_type: "x\ny" },
  ]) {
    const dto = plainToInstance(HrPerformanceLegacyAssessmentMasterQueryDto, candidate);
    assert.ok((await validate(dto)).length > 0);
  }
});

test("u_assessmentmaster query projects exactly twelve source columns without guessing drifted fields", async () => {
  const allowed = harness();
  const result = await allowed.service.assessmentMasterQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    query,
  );
  assert.deepEqual(Object.keys(result.items[0] ?? {}), [
    "unresolvedLegacyAssessmentMasterId",
    "sourcePersonCode",
    "employeeDisplayName",
    "sourceAssGrade",
    "sourceItemValue",
    "sourceMasterValue",
    "sourceTimekeepValue",
    "sourceBonusValue",
    "sourceAppraisal",
    "sourceAssessmentPerson",
    "sourceRecordedAt",
    "sourceOperatorCode",
  ]);
  assert.equal(result.items[0]?.unresolvedLegacyAssessmentMasterId, null);
  assert.deepEqual(result, { items: [row], total: 1, page: 2, page_size: 25 });
  assert.equal(allowed.audits.length, 1);

  const sql = allowed.calls[1]?.sql ?? "";
  assert.match(sql, /NULL::text "unresolvedLegacyAssessmentMasterId"/u);
  assert.doesNotMatch(sql, /fact\.(?:assid|asssession|assessmenttype)\b/iu);
  assert.doesNotMatch(sql, /sourceMasterId|sourceSessionId|sourcePay|sourceSelfAppraisal/u);
});

test("u_assessmentmaster filters through verified session, mapped employee and scoped organization facts", async () => {
  const allowed = harness();
  await allowed.service.assessmentMasterQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    query,
  );
  const countSql = allowed.calls[0]?.sql ?? "";
  assert.match(countSql, /JOIN hr_performance_legacy_session query_session/u);
  assert.match(countSql, /query_session\.source_session_name=\$3/u);
  assert.match(countSql, /query_session\.source_assessment_type=\$4/u);
  assert.match(countSql, /query_session_map\.target_table='hr_performance_legacy_session'/u);
  assert.match(countSql, /query_session_map\.mapping_status='verified'/u);
  assert.match(countSql, /JOIN hr_performance_cycle_employee query_cycle_employee/u);
  assert.match(countSql, /JOIN hr_employee query_employee/u);
  assert.match(countSql, /JOIN sys_org query_org/u);
  assert.match(countSql, /query_org\.org_code LIKE \$5 ESCAPE '\\'/u);
  assert.match(countSql, /fact\.tenant_id=\$1 AND fact\.park_id=\$2/u);
  assert.deepEqual(allowed.calls[0]?.params, [
    scope.tenantId,
    scope.parkId,
    "2026-Q3",
    "YEAR",
    "001%",
  ]);
  assert.deepEqual(allowed.calls[1]?.params, [
    scope.tenantId,
    scope.parkId,
    "2026-Q3",
    "YEAR",
    "001%",
    25,
    25,
  ]);
  assert.match(
    allowed.calls[1]?.sql ?? "",
    /ORDER BY fact\.source_session_id DESC NULLS LAST,\s*fact\.source_person_code ASC NULLS LAST,\s*fact\.source_master_id ASC,\s*fact\.id ASC\s*LIMIT \$6 OFFSET \$7/u,
  );

  const exact = harness();
  await exact.service.assessmentMasterQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    { ...query, department_match_mode: "exact", department_like: "001" },
  );
  assert.match(exact.calls[0]?.sql ?? "", /query_org\.org_code=\$5/u);
  assert.doesNotMatch(exact.calls[0]?.sql ?? "", /query_org\.org_code LIKE/u);
});

test("u_assessmentmaster permission matrix stays park, team, self or fail-closed none", async () => {
  for (const permissions of [[], [HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ]]) {
    const denied = harness();
    assert.deepEqual(
      await denied.service.assessmentMasterQuery(scope, actor(...permissions), query),
      { items: [], total: 0, page: 2, page_size: 25 },
    );
    assert.equal(denied.calls.length, 0);
    assert.equal(denied.audits.length, 0);
  }

  const team = harness();
  await team.service.assessmentMasterQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ),
    query,
  );
  assert.match(team.calls[0]?.sql ?? "", /WITH RECURSIVE managed_org/u);
  assert.match(team.calls[0]?.sql ?? "", /employee\.primary_org_id IN/u);
  assert.match(team.calls[0]?.sql ?? "", /\(employee\.primary_org_id,employee\.tenant_id,employee\.park_id\)/u);
  assert.deepEqual(team.calls[0]?.params, [
    scope.tenantId,
    scope.parkId,
    "user-1",
    "2026-Q3",
    "YEAR",
    "001%",
  ]);

  const self = harness();
  await self.service.assessmentMasterQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ),
    query,
  );
  assert.match(self.calls[0]?.sql ?? "", /employee\.user_id::text=\$3::text/u);
  assert.match(self.calls[0]?.sql ?? "", /\(employee\.primary_org_id,employee\.tenant_id,employee\.park_id\)/u);
  assert.deepEqual(
    (self.audits[0] as { afterJson: Record<string, unknown> }).afterJson,
    {
      fieldGroups: ["legacy_projection"],
      projection: "self",
      itemCount: 1,
    },
  );
});

test("u_assessmentmaster invalid direct-service filters and audit failure both fail closed", async () => {
  const invalid = harness();
  await assert.rejects(
    invalid.service.assessmentMasterQuery(
      scope,
      actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
      { ...query, department_like: "001\\%" },
    ),
    /Unsupported legacy assessment-master query parameters/u,
  );
  assert.equal(invalid.calls.length, 0);
  assert.equal(invalid.audits.length, 0);

  const calls: string[] = [];
  const dataSource = {
    query: async (sql: string) => {
      calls.push(sql);
      return /count\(\*\)::int total/u.test(sql) ? [{ total: "0" }] : [];
    },
  } as unknown as DataSource;
  const audit = {
    recordOperationRequired: async () => {
      throw new Error("required audit unavailable");
    },
  } as never;
  await assert.rejects(
    new HrPerformanceLegacyService(dataSource, audit).assessmentMasterQuery(
      scope,
      actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
      query,
    ),
    /required audit unavailable/u,
  );
  assert.equal(calls.length, 2);
});

test("u_assessmentmaster controller route is read-only and uses the existing exact result atoms", () => {
  const controller = readFileSync(
    resolve(__dirname, "hr-performance-legacy.controller.ts"),
    "utf8",
  );
  assert.match(controller, /@Get\("query-reports\/assessment-master"\)/u);
  assert.match(controller, /HrPerformanceLegacyAssessmentMasterQueryDto/u);
  assert.match(controller, /HR_PERMISSIONS\.HR_PERFORMANCE_READ/u);
  assert.match(controller, /HR_PERMISSIONS\.HR_PERFORMANCE_TEAM_READ/u);
  assert.match(controller, /HR_PERMISSIONS\.HR_PERFORMANCE_SELF_READ/u);
  assert.doesNotMatch(controller, /@(Post|Put|Patch|Delete)\("query-reports\/assessment-master"/u);
});
