import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrPerformanceLegacyService } from "./hr-performance-legacy.service";

const scope = { tenantId: "tenant-1", parkId: "park-1" };
const page = { page: 2, page_size: 25 };

function actor(permission?: string): JwtPrincipal {
  return {
    sub: "user-1",
    username: "performance-legacy-test",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    roles: [],
    permissions: permission ? [permission] : [],
  };
}

function harness() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const audits: unknown[] = [];
  const dataSource = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return /count\(\*\)::int total/u.test(sql) ? [{ total: "1" }] : [{ id: "row-1" }];
    },
  } as unknown as DataSource;
  const audit = {
    recordOperationRequired: async (input: unknown) => {
      audits.push(input);
    },
  } as never;
  return {
    calls,
    audits,
    service: new HrPerformanceLegacyService(dataSource, audit),
  };
}

test("legacy definition reads expose all 29 definition fields only from active successful production imports", async () => {
  const source = readFileSync(resolve(__dirname, "hr-performance-legacy.service.ts"), "utf8");
  const definitionColumns = [
    "source_assessment",
    "source_assessment_name",
    "source_department",
    "source_m_percent",
    "source_t_percent",
    "source_x_percent",
    "source_c_percent",
    "source_s_percent",
    "source_timekeep",
    "source_bonus",
    "source_master",
    "source_ass_grade",
    "source_description",
    "source_my_order",
    "source_assessment_id",
    "source_min_value",
    "source_max_value",
    "source_item_id",
    "source_item_name",
    "source_full_value",
    "source_guide_id",
    "source_grade",
  ];
  for (const column of definitionColumns) assert.match(source, new RegExp(`fact\\.${column}\\b`, "u"));
  for (const token of [
    "record_map.is_active=true",
    "record_map.mapping_status='verified'",
    "batch.execution_context='production_import'",
    "batch.status='succeeded'",
  ]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));

  const denied = harness();
  assert.deepEqual(await denied.service.templates(scope, actor(), page), {
    items: [], total: 0, page: 2, page_size: 25,
  });
  assert.equal(denied.calls.length, 0);
  assert.equal(denied.audits.length, 0);

  const allowed = harness();
  const result = await allowed.service.templates(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ),
    page,
  );
  assert.deepEqual(result, { items: [{ id: "row-1" }], total: 1, page: 2, page_size: 25 });
  assert.deepEqual(allowed.calls[1]?.params, [scope.tenantId, scope.parkId, 25, 25]);
  assert.equal(allowed.audits.length, 1);
});

test("legacy performance API is read-only, HR-module gated, and wired through exact permissions", () => {
  const controller = readFileSync(resolve(__dirname, "hr-performance-legacy.controller.ts"), "utf8");
  const module = readFileSync(resolve(__dirname, "hr.module.ts"), "utf8");
  assert.match(controller, /@Controller\("hr\/performance-legacy"\)/u);
  assert.match(controller, /@RequireModule\("hr"\)/u);
  for (const route of ["templates", "levels", "dimensions", "guides", "rubric", "results", "masters"]) {
    assert.match(controller, new RegExp(`@Get\\("${route}"\\)`, "u"));
  }
  assert.doesNotMatch(controller, /@(Post|Put|Patch|Delete)\(/u);
  for (const permission of [
    "HR_PERFORMANCE_TEMPLATE_READ",
    "HR_PERFORMANCE_TEMPLATE_MANAGE",
    "HR_PERFORMANCE_READ",
    "HR_PERFORMANCE_TEAM_READ",
    "HR_PERFORMANCE_SELF_READ",
  ]) assert.match(controller, new RegExp(`HR_PERMISSIONS\\.${permission}\\b`, "u"));
  assert.match(module, /HrPerformanceLegacyController/u);
  assert.match(module, /HrPerformanceLegacyService/u);
});

test("legacy rubric reproduces u_printassessment item-by-grade projection without dynamic SQL", async () => {
  const denied = harness();
  assert.deepEqual(await denied.service.rubric(scope, actor(), { source_assessment_id: 3 }), {
    sourceAssessmentId: 3,
    levels: [],
    items: [],
  });
  assert.equal(denied.calls.length, 0);
  assert.equal(denied.audits.length, 0);

  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const audits: unknown[] = [];
  const dataSource = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (/FROM hr_performance_legacy_level_rule fact/u.test(sql)) {
        return [
          { _batchId: "batch-1", sourceAssGrade: "A", sourceDescription: null, sourceMyOrder: "1", sourceMinValue: 90, sourceMaxValue: 100 },
          { _batchId: "batch-1", sourceAssGrade: "B", sourceDescription: null, sourceMyOrder: "2", sourceMinValue: 0, sourceMaxValue: 89 },
        ];
      }
      if (/FROM hr_performance_legacy_dimension_profile fact/u.test(sql)) {
        return [{ _batchId: "batch-1", sourceItemId: 7, sourceItemName: "Delivery", sourceFullValue: "100.00", sourceMyOrder: 1 }];
      }
      return [
        { _batchId: "batch-1", sourceItemId: 7, sourceGrade: "A", sourceDescription: "Exceeds" },
        { _batchId: "batch-1", sourceItemId: 7, sourceGrade: "B", sourceDescription: "Meets" },
      ];
    },
  } as unknown as DataSource;
  const audit = { recordOperationRequired: async (input: unknown) => audits.push(input) } as never;
  const service = new HrPerformanceLegacyService(dataSource, audit);
  const result = await service.rubric(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ),
    { source_assessment_id: 3 },
  );
  assert.deepEqual(result, {
    sourceAssessmentId: 3,
    levels: [
      { sourceAssGrade: "A", sourceDescription: null, sourceMyOrder: "1", sourceMinValue: 90, sourceMaxValue: 100 },
      { sourceAssGrade: "B", sourceDescription: null, sourceMyOrder: "2", sourceMinValue: 0, sourceMaxValue: 89 },
    ],
    items: [{
      sourceItemId: 7,
      sourceItemName: "Delivery",
      sourceFullValue: "100.00",
      sourceMyOrder: 1,
      descriptions: { A: "Exceeds", B: "Meets" },
    }],
  });
  assert.equal(calls.length, 3);
  assert.match(calls[2]?.sql ?? "", /fact\.source_item_id=ANY\(\$3::int\[\]\)/u);
  assert.deepEqual(calls[2]?.params, [scope.tenantId, scope.parkId, [7]]);
  assert.equal(audits.length, 1);
});

test("legacy rubric preserves items when source level definitions are absent", async () => {
  const dataSource = {
    query: async (sql: string) => {
      if (/FROM hr_performance_legacy_level_rule fact/u.test(sql)) return [];
      if (/FROM hr_performance_legacy_dimension_profile fact/u.test(sql)) {
        return [{ _batchId: "batch-1", sourceItemId: 8, sourceItemName: null, sourceFullValue: null, sourceMyOrder: null }];
      }
      return [{ _batchId: "batch-1", sourceItemId: 8, sourceGrade: "orphan", sourceDescription: null }];
    },
  } as unknown as DataSource;
  const audit = { recordOperationRequired: async () => undefined } as never;
  const service = new HrPerformanceLegacyService(dataSource, audit);
  const result = await service.rubric(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ),
    { source_assessment_id: 3 },
  );
  assert.deepEqual(result.levels, []);
  assert.deepEqual(result.items, [{
    sourceItemId: 8,
    sourceItemName: null,
    sourceFullValue: null,
    sourceMyOrder: null,
    descriptions: {},
  }]);
});

test("legacy rubric fails closed for mixed batches or duplicate item-grade descriptions", async () => {
  const mixed = {
    query: async (sql: string) => {
      if (/FROM hr_performance_legacy_level_rule fact/u.test(sql)) return [{ _batchId: "batch-a", sourceAssGrade: "A" }];
      if (/FROM hr_performance_legacy_dimension_profile fact/u.test(sql)) return [{ _batchId: "batch-b", sourceItemId: 7 }];
      return [];
    },
  } as unknown as DataSource;
  const audit = { recordOperationRequired: async () => undefined } as never;
  await assert.rejects(
    new HrPerformanceLegacyService(mixed, audit).rubric(scope, actor(HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ), { source_assessment_id: 3 }),
    /multiple active source batches/u,
  );

  const duplicate = {
    query: async (sql: string) => {
      if (/FROM hr_performance_legacy_level_rule fact/u.test(sql)) return [{ _batchId: "batch-a", sourceAssGrade: "A" }];
      if (/FROM hr_performance_legacy_dimension_profile fact/u.test(sql)) return [{ _batchId: "batch-a", sourceItemId: 7 }];
      return [
        { _batchId: "batch-a", sourceItemId: 7, sourceGrade: "A", sourceDescription: "first" },
        { _batchId: "batch-a", sourceItemId: 7, sourceGrade: "A", sourceDescription: "second" },
      ];
    },
  } as unknown as DataSource;
  await assert.rejects(
    new HrPerformanceLegacyService(duplicate, audit).rubric(scope, actor(HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ), { source_assessment_id: 3 }),
    /duplicate item-grade descriptions/u,
  );
});

test("legacy masters expose all 21 source fields, parity, paging-first SQL, and field-level pay control", async () => {
  const source = readFileSync(resolve(__dirname, "hr-performance-legacy.service.ts"), "utf8");
  const masterColumns = [
    "source_master_id", "source_session_id", "source_person_code", "source_self_grade",
    "source_ass_grade", "source_self_value", "source_item_value", "source_m_item_value",
    "source_x_item_value", "source_c_item_value", "source_master_value", "source_timekeep_value",
    "source_bonus_value", "source_total_value", "source_self_appraisal", "source_appraisal",
    "source_pay", "source_assessment_person", "source_recorded_at", "source_operator_code",
    "source_description",
  ];
  for (const column of masterColumns) assert.match(source, new RegExp(`fact\\.${column}\\b`, "u"));
  assert.match(source, /WITH page_fact AS[\s\S]*LIMIT \$[\s\S]*LEFT JOIN LATERAL hr_performance_yuzhou_legacy_grade_parity/u);
  assert.match(source, /CASE WHEN \$\$\{payVisibilityParameter\}::boolean THEN fact\.source_pay::text END/u);
  assert.match(source, /HR_PAYROLL_DETAIL_READ/u);
  assert.match(source, /HR_PAYROLL_HISTORY_READ/u);
  assert.match(source, /HR_PAYROLL_HISTORY_SELF_READ/u);
  assert.doesNotMatch(source, /"sourceIdentitySha256"|"sourceRowSha256"|"migrationBatchId"|"legacyRecordMapId"/u);

  const denied = harness();
  assert.deepEqual(await denied.service.masters(scope, actor(), page), {
    items: [], total: 0, page: 2, page_size: 25,
  });
  assert.equal(denied.calls.length, 0);

  const allowed = harness();
  await allowed.service.masters(scope, actor(HR_PERMISSIONS.HR_PERFORMANCE_READ), page);
  assert.deepEqual(allowed.calls[1]?.params, [scope.tenantId, scope.parkId, false, 25, 25]);
  assert.equal(allowed.audits.length, 1);

  const payAllowed = harness();
  const payActor = actor(HR_PERMISSIONS.HR_PERFORMANCE_READ);
  payActor.permissions.push(HR_PERMISSIONS.HR_PAYROLL_HISTORY_READ);
  await payAllowed.service.masters(scope, payActor, page);
  assert.deepEqual(payAllowed.calls[1]?.params, [scope.tenantId, scope.parkId, true, 25, 25]);
  assert.deepEqual(
    (payAllowed.audits[0] as { afterJson: { fieldGroups: string[] } }).afterJson.fieldGroups,
    ["legacy_projection", "compensation"],
  );
});

test("legacy results expose all 12 source fields and preserve decimal values as text", () => {
  const source = readFileSync(resolve(__dirname, "hr-performance-legacy.service.ts"), "utf8");
  const resultColumns = [
    "source_detail_id",
    "source_session_id",
    "source_person_code",
    "source_item_id",
    "source_self_value",
    "source_m_item_value",
    "source_item_value",
    "source_x_item_value",
    "source_c_item_value",
    "source_self_grade",
    "source_ass_grade",
    "source_appraisal",
  ];
  for (const column of resultColumns) assert.match(source, new RegExp(`fact\\.${column}\\b`, "u"));
  for (const column of [
    "source_self_value",
    "source_m_item_value",
    "source_item_value",
    "source_x_item_value",
    "source_c_item_value",
  ]) assert.match(source, new RegExp(`fact\\.${column}::text`, "u"));
  assert.doesNotMatch(source, /"sourceIdentitySha256"|"sourceRowSha256"|"migrationBatchId"|"legacyRecordMapId"/u);
});

test("legacy result access is park, managed organization tree, self, or fail-closed none", async () => {
  const denied = harness();
  assert.deepEqual(await denied.service.results(scope, actor(), page), {
    items: [], total: 0, page: 2, page_size: 25,
  });
  assert.equal(denied.calls.length, 0);
  assert.equal(denied.audits.length, 0);

  const resultVisibilityOnly = harness();
  assert.deepEqual(
    await resultVisibilityOnly.service.results(
      scope,
      actor(HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ),
      page,
    ),
    { items: [], total: 0, page: 2, page_size: 25 },
  );
  assert.equal(resultVisibilityOnly.calls.length, 0);
  assert.equal(resultVisibilityOnly.audits.length, 0);

  const park = harness();
  await park.service.results(scope, actor(HR_PERMISSIONS.HR_PERFORMANCE_READ), page);
  assert.doesNotMatch(park.calls[0]?.sql ?? "", /JOIN hr_employee employee/u);
  assert.deepEqual(park.calls[1]?.params, [scope.tenantId, scope.parkId, 25, 25]);
  assert.equal(park.audits.length, 1);

  const team = harness();
  const teamActor = actor(HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ);
  teamActor.permissions.push(HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ);
  await team.service.results(scope, teamActor, page);
  assert.match(team.calls[0]?.sql ?? "", /WITH RECURSIVE managed_org/u);
  assert.match(team.calls[0]?.sql ?? "", /employee\.primary_org_id IN/u);
  assert.deepEqual(team.calls[1]?.params, [scope.tenantId, scope.parkId, "user-1", 25, 25]);
  assert.equal(team.audits.length, 1);

  const self = harness();
  const selfActor = actor(HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ);
  selfActor.permissions.push(HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ);
  await self.service.results(scope, selfActor, page);
  assert.match(self.calls[0]?.sql ?? "", /employee\.user_id::text=\$3::text/u);
  assert.deepEqual(self.calls[1]?.params, [scope.tenantId, scope.parkId, "user-1", 25, 25]);
  assert.equal(self.audits.length, 1);
});

test("legacy master pay visibility never widens team scope with self-only payroll permission", async () => {
  const team = harness();
  const teamActor = actor(HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ);
  teamActor.permissions.push(HR_PERMISSIONS.HR_PAYROLL_HISTORY_SELF_READ);
  await team.service.masters(scope, teamActor, page);
  assert.match(team.calls[0]?.sql ?? "", /WITH RECURSIVE managed_org/u);
  assert.deepEqual(
    team.calls[1]?.params,
    [scope.tenantId, scope.parkId, "user-1", false, 25, 25],
  );
  assert.deepEqual(
    (team.audits[0] as { afterJson: { fieldGroups: string[] } }).afterJson.fieldGroups,
    ["legacy_projection"],
  );
});

test("legacy result filters narrow but cannot widen the resolved access scope", async () => {
  const self = harness();
  await self.service.results(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ),
    { ...page, source_session_id: 7 },
  );
  assert.match(self.calls[0]?.sql ?? "", /employee\.user_id::text=\$3::text/u);
  assert.match(self.calls[0]?.sql ?? "", /fact\.source_session_id=\$4/u);
  assert.deepEqual(self.calls[1]?.params, [scope.tenantId, scope.parkId, "user-1", 7, 25, 25]);
});

test("authorized empty legacy reads still require a successful audit", async () => {
  const dataSource = {
    query: async (sql: string) => /count\(\*\)::int total/u.test(sql) ? [{ total: "0" }] : [],
  } as unknown as DataSource;
  const audit = {
    recordOperationRequired: async () => {
      throw new Error("required audit unavailable");
    },
  } as never;
  const service = new HrPerformanceLegacyService(dataSource, audit);
  await assert.rejects(
    service.results(scope, actor(HR_PERMISSIONS.HR_PERFORMANCE_READ), page),
    /required audit unavailable/u,
  );
  await assert.rejects(
    service.templates(scope, actor(HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ), page),
    /required audit unavailable/u,
  );
});
