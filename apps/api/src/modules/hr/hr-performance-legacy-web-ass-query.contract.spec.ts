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
import { HrPerformanceLegacyWebAssQueryDto } from "./dto/hr-performance-legacy-web-ass-query.dto";
import { HrPerformanceLegacyService } from "./hr-performance-legacy.service";

const scope = { tenantId: "tenant-1", parkId: "park-1" };
const query = {
  ass_session: "Synthetic period",
  person_like: "员工_%",
  right_scope_prefix: "ORG-01",
  item_value_min: 60,
  item_value_max: 100,
  page: 2,
  page_size: 25,
};
const row = {
  sourcePersonCode: "Synthetic-01",
  employeeDisplayName: "Synthetic employee",
  sourceSelfGrade: "B",
  sourceAssGrade: "A",
  sourceItemValue: "86.00",
  sourceTotalValue: "91.00",
};

function actor(...permissions: string[]): JwtPrincipal {
  return {
    sub: "user-1",
    username: "web-ass-query-test",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    roles: [],
    permissions,
  };
}

function harness(resultRow: Record<string, unknown> | null = row) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const dataSource = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return /count\(\*\)::int total/u.test(sql)
        ? [{ total: resultRow === null ? "0" : "1" }]
        : resultRow === null ? [] : [resultRow];
    },
  } as unknown as DataSource;
  const audit = {
    recordOperationRequired: async (input: Record<string, unknown>) => {
      audits.push(input);
    },
  } as never;
  return { calls, audits, service: new HrPerformanceLegacyService(dataSource, audit) };
}

test("web_assquery validates bounded session person rightscope and finite score filters", async () => {
  const dto = plainToInstance(HrPerformanceLegacyWebAssQueryDto, {
    ...query,
    ass_session: "  Synthetic period  ",
    person_like: "  员工_%  ",
    right_scope_prefix: "  ORG-01  ",
    item_value_min: "60",
    item_value_max: "100",
  });
  assert.equal((await validate(dto)).length, 0);
  assert.equal(dto.ass_session, "Synthetic period");
  assert.equal(dto.person_like, "员工_%");
  assert.equal(dto.right_scope_prefix, "ORG-01");
  assert.equal(dto.item_value_min, 60);
  assert.equal(dto.item_value_max, 100);

  for (const invalidFields of [
    { ass_session: "" },
    { person_like: "A' OR 1=1" },
    { right_scope_prefix: "ORG%" },
    { item_value_min: "" },
    { item_value_min: "NaN" },
    { item_value_max: "Infinity" },
  ]) {
    const invalid = plainToInstance(HrPerformanceLegacyWebAssQueryDto, {
      ...query,
      ...invalidFields,
    });
    assert.ok((await validate(invalid)).length > 0);
  }

  const allPeople = plainToInstance(HrPerformanceLegacyWebAssQueryDto, {
    ...query,
    person_like: "   ",
  });
  assert.equal((await validate(allPeople)).length, 0);
  assert.equal(allPeople.person_like, undefined);
});

test("web_assquery honors period through a verified session relationship", async () => {
  const allowed = harness();
  await allowed.service.webAssQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    query,
  );
  const sql = allowed.calls[1]?.sql ?? "";
  assert.match(sql, /JOIN hr_performance_legacy_session web_query_session/u);
  assert.match(sql, /web_query_session\.source_session_name=\$3/u);
  assert.match(sql, /JOIN legacy_record_map web_query_session_map/u);
  assert.match(sql, /web_query_session_map\.mapping_status='verified'/u);
  assert.doesNotMatch(sql, /source_session_name LIKE '%'/u);
  assert.doesNotMatch(sql, /fact\.asssession\b/u);
});

test("web_assquery projects exactly its sealed six output columns", async () => {
  const allowed = harness();
  const result = await allowed.service.webAssQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    query,
  );
  assert.deepEqual(Object.keys(result.items[0] ?? {}), [
    "sourcePersonCode",
    "employeeDisplayName",
    "sourceSelfGrade",
    "sourceAssGrade",
    "sourceItemValue",
    "sourceTotalValue",
  ]);
  assert.deepEqual(result, { items: [row], total: 1, page: 2, page_size: 25 });
  const sql = allowed.calls[1]?.sql ?? "";
  assert.doesNotMatch(sql, /sourcePay|sourceAppraisal|sourceMasterValue|migrationBatchId/u);
});

test("web_assquery binds every legacy filter and keeps rightscope subordinate to server scope", async () => {
  const allowed = harness();
  await allowed.service.webAssQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    query,
  );
  assert.deepEqual(allowed.calls[0]?.params, [
    scope.tenantId,
    scope.parkId,
    "Synthetic period",
    "ORG-01%",
    60,
    100,
    "员工_%",
  ]);
  const sql = allowed.calls[0]?.sql ?? "";
  assert.match(sql, /fact\.tenant_id=\$1 AND fact\.park_id=\$2/u);
  assert.match(sql, /web_query_org\.org_code LIKE \$4 ESCAPE '\\'/u);
  assert.match(sql, /fact\.source_total_value >= \$5/u);
  assert.match(sql, /fact\.source_total_value <= \$6/u);
  assert.match(sql, /fact\.source_person_code LIKE \$7 ESCAPE '\\'/u);
  assert.match(sql, /web_query_subject_resolution\.legacy_master_result_id/u);
  assert.match(sql, /web_query_subject_resolution\.person_resolution_status='resolved'/u);
  assert.match(sql, /hr_performance_yuzhou_t0_person_candidate/u);
  assert.match(sql, /web_query_subject_t0\.candidate_count=1/u);
  assert.match(sql, /web_query_subject_owner_map\.source_identity_sha256=/u);
  assert.match(sql, /web_query_org\.is_deleted=false/u);
  assert.doesNotMatch(sql, /web_query_cycle_employee|fact\.target_cycle_employee_id/u);
  assert.doesNotMatch(sql, /Synthetic period|ORG-01|员工_/u);
  assert.deepEqual(allowed.calls[1]?.params, [
    scope.tenantId,
    scope.parkId,
    "Synthetic period",
    "ORG-01%",
    60,
    100,
    "员工_%",
    25,
    25,
  ]);
  assert.match(
    allowed.calls[1]?.sql ?? "",
    /ORDER BY fact\.source_session_id DESC NULLS LAST,[\s\S]*?LIMIT \$8 OFFSET \$9/u,
  );
  assert.deepEqual(
    (allowed.audits[0] as { afterJson: Record<string, unknown> }).afterJson,
    { fieldGroups: ["legacy_projection"], projection: "park", itemCount: 1 },
  );
});

test("web_assquery supports omitted person filtering without injecting a wildcard", async () => {
  const allowed = harness();
  await allowed.service.webAssQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    { ...query, person_like: undefined },
  );
  assert.equal(allowed.calls[0]?.params.length, 6);
  assert.doesNotMatch(allowed.calls[0]?.sql ?? "", /source_person_code LIKE/u);
});

test("web_assquery preserves park team self boundaries and fails closed", async () => {
  for (const permissions of [[], [HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ]]) {
    const denied = harness();
    assert.deepEqual(
      await denied.service.webAssQuery(scope, actor(...permissions), query),
      { items: [], total: 0, page: 2, page_size: 25 },
    );
    assert.equal(denied.calls.length, 0);
    assert.equal(denied.audits.length, 0);
  }

  const team = harness();
  await team.service.webAssQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ),
    query,
  );
  assert.match(team.calls[0]?.sql ?? "", /WITH RECURSIVE managed_org/u);
  assert.match(team.calls[0]?.sql ?? "", /employee\.primary_org_id IN/u);

  const self = harness();
  await self.service.webAssQuery(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ),
    query,
  );
  assert.match(self.calls[0]?.sql ?? "", /employee\.user_id::text=\$3::text/u);

  const inverted = harness();
  await assert.rejects(
    inverted.service.webAssQuery(
      scope,
      actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
      { ...query, item_value_min: 101 },
    ),
    /Unsupported legacy web-ass query parameters/u,
  );
  assert.equal(inverted.calls.length, 0);

  const auditFailure = harness();
  (auditFailure.service as unknown as { auditService: { recordOperationRequired: () => Promise<never> } })
    .auditService = { recordOperationRequired: async () => { throw new Error("audit unavailable"); } };
  await assert.rejects(
    auditFailure.service.webAssQuery(
      scope,
      actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
      query,
    ),
    /audit unavailable/u,
  );
});

test("web_assquery audits an authorized empty result and closes on empty-result audit failure", async () => {
  const empty = harness(null);
  assert.deepEqual(
    await empty.service.webAssQuery(
      scope,
      actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
      query,
    ),
    { items: [], total: 0, page: 2, page_size: 25 },
  );
  assert.equal(empty.calls.length, 2);
  assert.deepEqual(
    (empty.audits[0] as { afterJson: Record<string, unknown> }).afterJson,
    { fieldGroups: ["legacy_projection"], projection: "park", itemCount: 0 },
  );

  const auditFailure = harness(null);
  (auditFailure.service as unknown as { auditService: { recordOperationRequired: () => Promise<never> } })
    .auditService = { recordOperationRequired: async () => { throw new Error("audit unavailable"); } };
  await assert.rejects(
    auditFailure.service.webAssQuery(
      scope,
      actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
      query,
    ),
    /audit unavailable/u,
  );
});

test("web_assquery rejects a direct-call actor from another tenant or park", async () => {
  for (const principal of [
    { ...actor(HR_PERMISSIONS.HR_PERFORMANCE_READ), tenantId: "tenant-2" },
    { ...actor(HR_PERMISSIONS.HR_PERFORMANCE_READ), parkId: "park-2" },
  ]) {
    const foreign = harness();
    assert.deepEqual(
      await foreign.service.webAssQuery(scope, principal, query),
      { items: [], total: 0, page: 2, page_size: 25 },
    );
    assert.equal(foreign.calls.length, 0);
    assert.equal(foreign.audits.length, 0);
  }
});

test("web_assquery controller route is read only", () => {
  const controller = readFileSync(resolve(__dirname, "hr-performance-legacy.controller.ts"), "utf8");
  assert.match(controller, /@Get\("query-reports\/web-ass-query"\)/u);
  assert.match(controller, /webAssQuery\([\s\S]*?return this\.service\.webAssQuery/u);
  assert.doesNotMatch(
    controller,
    /@(Post|Put|Patch|Delete)\("query-reports\/web-ass-query"\)/u,
  );
});
