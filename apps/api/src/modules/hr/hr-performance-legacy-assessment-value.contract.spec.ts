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
import { HrPerformanceLegacyAssessmentValueQueryDto } from "./dto/hr-performance-legacy-assessment-value.dto";
import { HrPerformanceLegacyService } from "./hr-performance-legacy.service";

const scope = { tenantId: "tenant-1", parkId: "park-1" };
const query = {
  ass_session: "synthetic-session",
  department_prefix: "001",
  page: 2,
  page_size: 25,
};
const row = {
  sourcePersonCode: "synthetic-code",
  employeeDisplayName: "Synthetic employee",
  unresolvedLegacyGrade: null,
  sourceItemValue: "80.00",
  sourceMasterValue: "9.00",
  sourceTimekeepValue: "1.00",
  sourceBonusValue: "2.00",
  legacyLastValueWithoutMaster: "83.00",
  sourceAppraisal: "Synthetic appraisal",
};

function actor(...permissions: string[]): JwtPrincipal {
  return {
    sub: "user-1",
    username: "assessment-value-query-test",
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

test("u_assessmentvalue DTO accepts only a bounded literal department prefix", async () => {
  const dto = plainToInstance(HrPerformanceLegacyAssessmentValueQueryDto, {
    ...query,
    ass_session: "  synthetic-session  ",
    department_prefix: "  OPS_A  ",
  });
  assert.equal((await validate(dto)).length, 0);
  assert.equal(dto.ass_session, "synthetic-session");
  assert.equal(dto.department_prefix, "OPS_A");
  for (const candidate of [
    { ...query, ass_session: "x".repeat(31) },
    { ...query, ass_session: "x\ny" },
    { ...query, department_prefix: "001%" },
    { ...query, department_prefix: "001\\" },
    { ...query, department_prefix: "x".repeat(31) },
  ]) {
    const invalid = plainToInstance(HrPerformanceLegacyAssessmentValueQueryDto, candidate);
    assert.ok((await validate(invalid)).length > 0);
  }
});

test("u_assessmentvalue projects exactly nine columns and keeps legacy grade unresolved", async () => {
  const allowed = harness();
  const result = await allowed.service.assessmentValueQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    query,
  );
  assert.deepEqual(Object.keys(result.items[0] ?? {}), [
    "sourcePersonCode",
    "employeeDisplayName",
    "unresolvedLegacyGrade",
    "sourceItemValue",
    "sourceMasterValue",
    "sourceTimekeepValue",
    "sourceBonusValue",
    "legacyLastValueWithoutMaster",
    "sourceAppraisal",
  ]);
  assert.equal(result.items[0]?.unresolvedLegacyGrade, null);
  assert.deepEqual(result, { items: [row], total: 1, page: 2, page_size: 25 });
  const sql = allowed.calls[1]?.sql ?? "";
  assert.match(sql, /NULL::text "unresolvedLegacyGrade"/u);
  assert.doesNotMatch(sql, /fact\.(?:grade|asssession)\b/iu);
  assert.doesNotMatch(sql, /sourceAssGrade|sourceTotalValue|sourcePay|sourceSelfAppraisal/u);
});

test("u_assessmentvalue computes the null-propagating legacy final without mastervalue", async () => {
  const allowed = harness();
  await allowed.service.assessmentValueQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    query,
  );
  const sql = allowed.calls[1]?.sql ?? "";
  assert.match(
    sql,
    /\(fact\.source_item_value\s*\+ fact\.source_timekeep_value\s*\+ fact\.source_bonus_value\)::text "legacyLastValueWithoutMaster"/u,
  );
  const formula = sql.match(/\((fact\.source_item_value[\s\S]*?)\)::text "legacyLastValueWithoutMaster"/u)?.[1] ?? "";
  assert.doesNotMatch(formula, /master_value|COALESCE/iu);
  assert.match(sql, /fact\.source_master_value::text "sourceMasterValue"/u);
});

test("u_assessmentvalue binds verified session and literal department-prefix scope", async () => {
  const allowed = harness();
  await allowed.service.assessmentValueQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    query,
  );
  const sql = allowed.calls[0]?.sql ?? "";
  assert.match(sql, /JOIN hr_performance_legacy_session value_session/u);
  assert.match(sql, /value_session\.source_session_name=\$3/u);
  assert.match(sql, /value_session_map\.target_table='hr_performance_legacy_session'/u);
  assert.match(sql, /value_session_map\.mapping_status='verified'/u);
  assert.match(sql, /JOIN hr_performance_cycle_employee value_cycle_employee/u);
  assert.match(sql, /JOIN hr_employee value_employee/u);
  assert.match(sql, /JOIN sys_org value_org/u);
  assert.match(sql, /value_org\.org_code LIKE \$4 ESCAPE '\\'/u);
  assert.deepEqual(allowed.calls[0]?.params, [
    scope.tenantId,
    scope.parkId,
    "synthetic-session",
    "001%",
  ]);
  assert.deepEqual(allowed.calls[1]?.params, [
    scope.tenantId,
    scope.parkId,
    "synthetic-session",
    "001%",
    25,
    25,
  ]);
  assert.match(
    allowed.calls[1]?.sql ?? "",
    /ORDER BY fact\.source_session_id DESC NULLS LAST,\s*fact\.source_person_code ASC NULLS LAST,\s*fact\.source_master_id ASC,\s*fact\.id ASC\s*LIMIT \$5 OFFSET \$6/u,
  );

  const escaped = harness();
  await escaped.service.assessmentValueQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    { ...query, department_prefix: "OPS_A" },
  );
  assert.equal(escaped.calls[0]?.params[3], "OPS\\_A%");
});

test("u_assessmentvalue preserves park, team, self and fail-closed audit rules", async () => {
  for (const permissions of [[], [HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ]]) {
    const denied = harness();
    assert.deepEqual(
      await denied.service.assessmentValueQuery(scope, actor(...permissions), query),
      { items: [], total: 0, page: 2, page_size: 25 },
    );
    assert.equal(denied.calls.length, 0);
    assert.equal(denied.audits.length, 0);
  }

  const team = harness();
  await team.service.assessmentValueQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ),
    query,
  );
  assert.match(team.calls[0]?.sql ?? "", /WITH RECURSIVE managed_org/u);
  assert.match(team.calls[0]?.sql ?? "", /employee\.primary_org_id IN/u);

  const self = harness();
  await self.service.assessmentValueQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ),
    query,
  );
  assert.match(self.calls[0]?.sql ?? "", /employee\.user_id::text=\$3::text/u);
  assert.deepEqual(
    (self.audits[0] as { afterJson: Record<string, unknown> }).afterJson,
    { fieldGroups: ["legacy_projection"], projection: "self", itemCount: 1 },
  );

  const auditFailure = harness();
  (auditFailure.service as unknown as { auditService: { recordOperationRequired: () => Promise<never> } })
    .auditService = { recordOperationRequired: async () => { throw new Error("audit unavailable"); } };
  await assert.rejects(
    auditFailure.service.assessmentValueQuery(
      scope,
      actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
      query,
    ),
    /audit unavailable/u,
  );
});

test("u_assessmentvalue rejects invalid direct input and exposes a read-only route", async () => {
  const invalid = harness();
  await assert.rejects(
    invalid.service.assessmentValueQuery(
      scope,
      actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
      { ...query, department_prefix: "001%" },
    ),
    /Unsupported legacy assessment-value query parameters/u,
  );
  assert.equal(invalid.calls.length, 0);
  assert.equal(invalid.audits.length, 0);

  const controller = readFileSync(resolve(__dirname, "hr-performance-legacy.controller.ts"), "utf8");
  assert.match(controller, /@Get\("query-reports\/assessment-value"\)/u);
  assert.match(controller, /assessmentValueQuery\([\s\S]*?return this\.service\.assessmentValueQuery/u);
  assert.doesNotMatch(controller, /@(Post|Put|Patch|Delete)\("query-reports\/assessment-value"\)/u);
});
