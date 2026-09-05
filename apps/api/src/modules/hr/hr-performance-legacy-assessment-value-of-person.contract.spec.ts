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
import { HrPerformanceLegacyPersonSummaryQueryDto } from "./dto/hr-performance-legacy.dto";
import { HrPerformanceLegacyService } from "./hr-performance-legacy.service";

const scope = { tenantId: "tenant-1", parkId: "park-1" };
const query = { source_person_code: "员工_01", page: 2, page_size: 25 };
const row = {
  compatibleLegacySessionText: "Synthetic session",
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
    username: "assessment-value-person-query-test",
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

test("u_assessmentvalueofperson uses the shared exact legacy person-code contract", async () => {
  const dto = plainToInstance(HrPerformanceLegacyPersonSummaryQueryDto, {
    ...query,
    source_person_code: "  员工_01  ",
  });
  assert.equal((await validate(dto)).length, 0);
  assert.equal(dto.source_person_code, "员工_01");
  for (const sourcePersonCode of ["", "A B", "A%", "A/1", "A".repeat(11)]) {
    const invalid = plainToInstance(HrPerformanceLegacyPersonSummaryQueryDto, {
      ...query,
      source_person_code: sourcePersonCode,
    });
    assert.ok((await validate(invalid)).length > 0);
  }
});

test("u_assessmentvalueofperson projects exactly eight columns without guessing grade", async () => {
  const allowed = harness();
  const result = await allowed.service.assessmentValueOfPersonQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    query,
  );
  assert.deepEqual(Object.keys(result.items[0] ?? {}), [
    "compatibleLegacySessionText",
    "unresolvedLegacyGrade",
    "sourceItemValue",
    "sourceMasterValue",
    "sourceTimekeepValue",
    "sourceBonusValue",
    "legacyLastValueWithoutMaster",
    "sourceAppraisal",
  ]);
  assert.deepEqual(result, { items: [row], total: 1, page: 2, page_size: 25 });
  const sql = allowed.calls[1]?.sql ?? "";
  assert.match(sql, /NULL::text "unresolvedLegacyGrade"/u);
  assert.doesNotMatch(sql, /fact\.(?:grade|asssession)\b/iu);
  assert.doesNotMatch(sql, /sourceAssGrade|sourceTotalValue|sourcePay|sourceSelfAppraisal/u);
});

test("u_assessmentvalueofperson exposes only verified related session text", async () => {
  const allowed = harness();
  await allowed.service.assessmentValueOfPersonQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    query,
  );
  const sql = allowed.calls[1]?.sql ?? "";
  assert.match(sql, /LEFT JOIN hr_performance_legacy_session person_value_session/u);
  assert.match(sql, /LEFT JOIN legacy_record_map person_value_session_map/u);
  assert.match(sql, /person_value_session_map\.target_table='hr_performance_legacy_session'/u);
  assert.match(sql, /person_value_session_map\.mapping_status='verified'/u);
  assert.match(
    sql,
    /CASE WHEN person_value_session_map\.id IS NOT NULL\s*THEN person_value_session\.source_session_name\s*ELSE NULL\s*END "compatibleLegacySessionText"/u,
  );
  assert.doesNotMatch(allowed.calls[0]?.sql ?? "", /person_value_session/u);
});

test("u_assessmentvalueofperson keeps the null-propagating final separate from mastervalue", async () => {
  const allowed = harness();
  await allowed.service.assessmentValueOfPersonQuery(
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

test("u_assessmentvalueofperson binds person, scope, paging and required audit", async () => {
  const allowed = harness();
  await allowed.service.assessmentValueOfPersonQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    query,
  );
  assert.match(allowed.calls[0]?.sql ?? "", /fact\.source_person_code=\$3/u);
  assert.deepEqual(allowed.calls[0]?.params, [scope.tenantId, scope.parkId, "员工_01"]);
  assert.deepEqual(allowed.calls[1]?.params, [
    scope.tenantId,
    scope.parkId,
    "员工_01",
    25,
    25,
  ]);
  assert.match(
    allowed.calls[1]?.sql ?? "",
    /ORDER BY fact\.source_session_id DESC NULLS LAST,\s*fact\.source_master_id ASC,\s*fact\.id ASC\s*LIMIT \$4 OFFSET \$5/u,
  );
  assert.deepEqual(
    (allowed.audits[0] as { afterJson: Record<string, unknown> }).afterJson,
    { fieldGroups: ["legacy_projection"], projection: "park", itemCount: 1 },
  );
});

test("u_assessmentvalueofperson preserves park team self and fails closed", async () => {
  for (const permissions of [[], [HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ]]) {
    const denied = harness();
    assert.deepEqual(
      await denied.service.assessmentValueOfPersonQuery(scope, actor(...permissions), query),
      { items: [], total: 0, page: 2, page_size: 25 },
    );
    assert.equal(denied.calls.length, 0);
    assert.equal(denied.audits.length, 0);
  }

  const team = harness();
  await team.service.assessmentValueOfPersonQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ),
    query,
  );
  assert.match(team.calls[0]?.sql ?? "", /WITH RECURSIVE managed_org/u);
  assert.match(team.calls[0]?.sql ?? "", /employee\.primary_org_id IN/u);

  const self = harness();
  await self.service.assessmentValueOfPersonQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ),
    query,
  );
  assert.match(self.calls[0]?.sql ?? "", /employee\.user_id::text=\$3::text/u);
  assert.equal(self.calls[0]?.params[3], "员工_01");

  const invalid = harness();
  await assert.rejects(
    invalid.service.assessmentValueOfPersonQuery(
      scope,
      actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
      { ...query, source_person_code: "A%" },
    ),
    /Unsupported legacy assessment-value person code/u,
  );
  assert.equal(invalid.calls.length, 0);

  const auditFailure = harness();
  (auditFailure.service as unknown as { auditService: { recordOperationRequired: () => Promise<never> } })
    .auditService = { recordOperationRequired: async () => { throw new Error("audit unavailable"); } };
  await assert.rejects(
    auditFailure.service.assessmentValueOfPersonQuery(
      scope,
      actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
      query,
    ),
    /audit unavailable/u,
  );
});

test("u_assessmentvalueofperson controller route is read only", () => {
  const controller = readFileSync(resolve(__dirname, "hr-performance-legacy.controller.ts"), "utf8");
  assert.match(controller, /@Get\("query-reports\/assessment-value-of-person"\)/u);
  assert.match(
    controller,
    /assessmentValueOfPersonQuery\([\s\S]*?return this\.service\.assessmentValueOfPersonQuery/u,
  );
  assert.doesNotMatch(
    controller,
    /@(Post|Put|Patch|Delete)\("query-reports\/assessment-value-of-person"\)/u,
  );
});
