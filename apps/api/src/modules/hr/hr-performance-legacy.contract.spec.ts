import "reflect-metadata";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrPerformanceLegacyPersonSummaryQueryDto } from "./dto/hr-performance-legacy.dto";
import { HrPerformanceLegacyPersonSummaryRoutineQueryDto } from "./dto/hr-performance-legacy-person-summary.dto";
import { HrPerformanceLegacyService } from "./hr-performance-legacy.service";

const scope = { tenantId: "tenant-1", parkId: "park-1" };
const page = { page: 2, page_size: 25 };

test("ordinary API CI executes the legacy performance routine parity fast contract", () => {
  const repositoryRoot = resolve(__dirname, "../../../../..");
  const result = spawnSync(
    process.execPath,
    ["--test", resolve(repositoryRoot, "scripts/e2e/yuzhou-performance-calculation-print-parity-contract.mjs")],
    { cwd: repositoryRoot, encoding: "utf8", env: process.env },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

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

test("final person projections require verified T0 ownership without relaxing the materializer helper", () => {
  const source = readFileSync(resolve(__dirname, "hr-performance-legacy.service.ts"), "utf8");
  assert.ok(source.includes("${ownerMapAlias}.mapping_status='verified'"));
  assert.ok(!source.includes("${ownerMapAlias}.mapping_status IN('loaded','verified')"));
});

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

test("legacy rubric returns an empty projection when all three source relations are empty", async () => {
  const calls: string[] = [];
  const dataSource = {
    query: async (sql: string) => {
      calls.push(sql);
      return [];
    },
  } as unknown as DataSource;
  const audits: unknown[] = [];
  const audit = {
    recordOperationRequired: async (input: unknown) => {
      audits.push(input);
    },
  } as never;
  const result = await new HrPerformanceLegacyService(dataSource, audit).rubric(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ),
    { source_assessment_id: 3 },
  );
  assert.deepEqual(result, { sourceAssessmentId: 3, levels: [], items: [] });
  assert.equal(calls.length, 2);
  assert.equal(audits.length, 1);
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

  const resultVisibilityOnly = harness();
  assert.deepEqual(
    await resultVisibilityOnly.service.masters(
      scope,
      actor(HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ),
      page,
    ),
    { items: [], total: 0, page: 2, page_size: 25 },
  );
  assert.equal(resultVisibilityOnly.calls.length, 0);
  assert.equal(resultVisibilityOnly.audits.length, 0);

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
  assert.match(team.calls[0]?.sql ?? "", /scope_subject_resolution\.legacy_dimension_result_id/u);
  assert.match(team.calls[0]?.sql ?? "", /scope_subject_resolution\.fact_kind='dimension_result'/u);
  assert.doesNotMatch(team.calls[0]?.sql ?? "", /scope_subject_resolution\.legacy_master_result_id/u);
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

test("legacy master self scope is exact and self payroll permission reveals pay only to self", async () => {
  const self = harness();
  await self.service.masters(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ),
    page,
  );
  assert.match(self.calls[0]?.sql ?? "", /employee\.user_id::text=\$3::text/u);
  assert.match(
    self.calls[0]?.sql ?? "",
    /scope_subject_resolution\.legacy_master_result_id/u,
  );
  assert.match(
    self.calls[0]?.sql ?? "",
    /scope_subject_t0\.candidate_count=1/u,
  );
  assert.match(self.calls[0]?.sql ?? "", /scope_subject_owner_map\.target_table='hr_employee'/u);
  assert.doesNotMatch(self.calls[0]?.sql ?? "", /fact\.target_cycle_employee_id/u);
  assert.match(self.calls[0]?.sql ?? "", /fact\.tenant_id=\$1 AND fact\.park_id=\$2/u);
  assert.deepEqual(self.calls[1]?.params, [scope.tenantId, scope.parkId, "user-1", false, 25, 25]);
  assert.deepEqual(
    (self.audits[0] as { afterJson: { fieldGroups: string[]; projection: string } }).afterJson,
    { fieldGroups: ["legacy_projection"], projection: "self", itemCount: 1 },
  );

  const selfPay = harness();
  const selfPayActor = actor(HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ);
  selfPayActor.permissions.push(HR_PERMISSIONS.HR_PAYROLL_HISTORY_SELF_READ);
  await selfPay.service.masters(
    scope,
    selfPayActor,
    { ...page, source_session_id: 7 },
  );
  assert.match(selfPay.calls[0]?.sql ?? "", /fact\.source_session_id=\$4/u);
  assert.deepEqual(
    selfPay.calls[1]?.params,
    [scope.tenantId, scope.parkId, "user-1", 7, true, 25, 25],
  );
  assert.deepEqual(
    (selfPay.audits[0] as { afterJson: { fieldGroups: string[]; projection: string } }).afterJson,
    { fieldGroups: ["legacy_projection", "compensation"], projection: "self", itemCount: 1 },
  );

  const parkWithSelfPay = harness();
  const parkActor = actor(HR_PERMISSIONS.HR_PERFORMANCE_READ);
  parkActor.permissions.push(HR_PERMISSIONS.HR_PAYROLL_HISTORY_SELF_READ);
  await parkWithSelfPay.service.masters(scope, parkActor, page);
  assert.deepEqual(
    parkWithSelfPay.calls[1]?.params,
    [scope.tenantId, scope.parkId, false, 25, 25],
  );
  assert.deepEqual(
    (parkWithSelfPay.audits[0] as { afterJson: { fieldGroups: string[] } }).afterJson.fieldGroups,
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
    service.masters(scope, actor(HR_PERMISSIONS.HR_PERFORMANCE_READ), page),
    /required audit unavailable/u,
  );
  await assert.rejects(
    service.templates(scope, actor(HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ), page),
    /required audit unavailable/u,
  );
});

test("person-summary accepts observed Unicode letters and rejects patterns, controls, symbols, blank, and overlength input", async () => {
  const accepted = plainToInstance(HrPerformanceLegacyPersonSummaryQueryDto, {
    source_person_code: "  汉01  ",
  });
  assert.equal(accepted.source_person_code, "汉01");
  assert.equal((await validate(accepted)).length, 0);
  for (const source_person_code of ["EMP_01", "A-01", "１２３"]) {
    const dto = plainToInstance(HrPerformanceLegacyPersonSummaryQueryDto, { source_person_code });
    assert.equal((await validate(dto)).length, 0, source_person_code);
  }

  for (const source_person_code of [
    "",
    "   ",
    "EMP 01",
    "EMP%",
    "EMP*",
    "EMP?",
    "EMP.01",
    "EMP' OR 1=1",
    "EMP;01",
    "EMP\\01",
    "EMP\n01",
    "😀01",
    "汉".repeat(11),
    101,
  ]) {
    const dto = plainToInstance(HrPerformanceLegacyPersonSummaryQueryDto, { source_person_code });
    assert.notEqual((await validate(dto)).length, 0, String(source_person_code));
  }
});

test("person-summary requires one explicit closed source routine", async () => {
  for (const source_routine of ["web_ass", "web_assessmentquery"]) {
    const dto = plainToInstance(HrPerformanceLegacyPersonSummaryRoutineQueryDto, {
      source_person_code: "EMP_01",
      source_routine,
    });
    assert.equal((await validate(dto)).length, 0, source_routine);
  }
  for (const source_routine of [undefined, null, "", "web_assquery", "WEB_ASS", 1]) {
    const dto = plainToInstance(HrPerformanceLegacyPersonSummaryRoutineQueryDto, {
      source_person_code: "EMP_01",
      source_routine,
    });
    assert.notEqual((await validate(dto)).length, 0, String(source_routine));
  }
});

test("person-summary endpoint uses base park/team/self permissions and excludes result-read-only access", () => {
  const controller = readFileSync(resolve(__dirname, "hr-performance-legacy.controller.ts"), "utf8");
  const route = controller.slice(controller.indexOf('@Get("query-reports/person-summary")'));
  assert.match(route, /HrPerformanceLegacyPersonSummaryRoutineQueryDto/u);
  assert.match(route, /HR_PERFORMANCE_READ/u);
  assert.match(route, /HR_PERFORMANCE_TEAM_READ/u);
  assert.match(route, /HR_PERFORMANCE_SELF_READ/u);
  assert.doesNotMatch(route, /HR_PERFORMANCE_RESULT_READ/u);
  assert.doesNotMatch(route, /@(Post|Put|Patch|Delete)\(/u);
});

function personSummaryHarness(rows: Record<string, unknown>[] = []) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const audits: unknown[] = [];
  const dataSource = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params: [...params] });
      return /count\(\*\)::int total/u.test(sql) ? [{ total: String(rows.length) }] : rows;
    },
  } as unknown as DataSource;
  const audit = {
    recordOperationRequired: async (input: unknown) => {
      audits.push(input);
    },
  } as never;
  return { calls, audits, service: new HrPerformanceLegacyService(dataSource, audit) };
}

function personSummaryOrphanHarness() {
  const matched = {
    sourcePersonCode: "LEGACY_01",
    employeeDisplayName: "Synthetic mapped employee",
    sourceSelfGrade: "A",
    sourceAssGrade: "A",
    sourceItemValue: "88.0000",
    sourceTotalValue: "91.0000",
  };
  const orphan = {
    sourcePersonCode: "LEGACY_01",
    employeeDisplayName: null,
    sourceSelfGrade: "B",
    sourceAssGrade: null,
    sourceItemValue: "75.0000",
    sourceTotalValue: null,
  };
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const audits: unknown[] = [];
  const dataSource = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params: [...params] });
      const rows = /summary_employee\.id IS NOT NULL/u.test(sql)
        ? [matched]
        : [matched, orphan];
      return /count\(\*\)::int total/u.test(sql)
        ? [{ total: String(rows.length) }]
        : rows;
    },
  } as unknown as DataSource;
  const audit = {
    recordOperationRequired: async (input: unknown) => audits.push(input),
  } as never;
  return {
    matched,
    orphan,
    calls,
    audits,
    service: new HrPerformanceLegacyService(dataSource, audit),
  };
}

test("person-summary keeps web_ass and web_assessmentquery orphan semantics explicit", async () => {
  const webAss = personSummaryOrphanHarness();
  const matchedOnly = await webAss.service.personSummary(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    {
      page: 2,
      page_size: 25,
      source_person_code: "LEGACY_01",
      source_routine: "web_ass",
    },
  );
  assert.deepEqual(matchedOnly, {
    items: [webAss.matched], total: 1, page: 2, page_size: 25,
  });
  assert.equal(webAss.calls.length, 2);
  for (const call of webAss.calls) {
    assert.match(call.sql, /JOIN hr_performance_legacy_identity_resolution summary_subject_resolution/u);
    assert.match(call.sql, /summary_subject_resolution\.person_resolution_status='resolved'/u);
    assert.match(call.sql, /summary_subject_t0\.candidate_count=1/u);
    assert.match(call.sql, /JOIN hr_employee summary_employee/u);
    assert.match(call.sql, /summary_employee\.id IS NOT NULL/u);
    assert.doesNotMatch(call.sql, /fact\.target_cycle_employee_id|summary_cycle_employee/u);
    assert.doesNotMatch(call.sql, /web_ass/u);
  }
  assert.deepEqual(webAss.calls[1]?.params, [scope.tenantId, scope.parkId, "LEGACY_01", 25, 25]);
  assert.match(String((webAss.audits[0] as { action?: string })?.action), /web_ass 语义/u);

  const assessmentQuery = personSummaryOrphanHarness();
  const withOrphan = await assessmentQuery.service.personSummary(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    {
      page: 1,
      page_size: 50,
      source_person_code: "LEGACY_01",
      source_routine: "web_assessmentquery",
    },
  );
  assert.deepEqual(withOrphan, {
    items: [assessmentQuery.matched, assessmentQuery.orphan],
    total: 2,
    page: 1,
    page_size: 50,
  });
  assert.equal(withOrphan.items[1]?.employeeDisplayName, null);
  for (const call of assessmentQuery.calls) {
    assert.match(call.sql, /LEFT JOIN hr_performance_legacy_identity_resolution summary_subject_resolution/u);
    assert.match(call.sql, /LEFT JOIN LATERAL/u);
    assert.match(call.sql, /LEFT JOIN legacy_record_map summary_subject_owner_map/u);
    assert.match(
      call.sql,
      /summary_subject_owner_map\.id=summary_subject_t0\.owner_t0_record_map_id/u,
    );
    assert.match(call.sql, /LEFT JOIN hr_employee summary_employee/u);
    assert.doesNotMatch(call.sql, /summary_employee\.id IS NOT NULL/u);
    assert.doesNotMatch(call.sql, /fact\.target_cycle_employee_id|summary_cycle_employee/u);
    assert.doesNotMatch(call.sql, /web_assessmentquery/u);
  }
  assert.match(
    String((assessmentQuery.audits[0] as { action?: string })?.action),
    /web_assessmentquery 语义/u,
  );
});

test("person-summary rejects an unknown routine before query or audit", async () => {
  const fixture = personSummaryHarness();
  await assert.rejects(
    fixture.service.personSummary(
      scope,
      actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
      {
        page: 1,
        page_size: 50,
        source_person_code: "EMP_01",
        source_routine: "web_assquery" as never,
      },
    ),
    /Unsupported legacy performance person-summary routine/u,
  );
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.audits.length, 0);
});

test("person-summary returns only the six legacy report fields with exact parameterized filtering and stable paging", async () => {
  const row = {
    sourcePersonCode: "EMP_01",
    employeeDisplayName: "Synthetic employee",
    sourceSelfGrade: "A",
    sourceAssGrade: "B",
    sourceItemValue: "88.0000",
    sourceTotalValue: "91.0000",
  };
  const fixture = personSummaryHarness([row]);
  const result = await fixture.service.personSummary(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    { page: 2, page_size: 25, source_person_code: "EMP_01", source_routine: "web_assessmentquery" },
  );
  assert.deepEqual(result, { items: [row], total: 1, page: 2, page_size: 25 });
  assert.deepEqual(Object.keys(result.items[0] ?? {}).sort(), [
    "employeeDisplayName",
    "sourceAssGrade",
    "sourceItemValue",
    "sourcePersonCode",
    "sourceSelfGrade",
    "sourceTotalValue",
  ]);
  assert.deepEqual(fixture.calls[0]?.params, [scope.tenantId, scope.parkId, "EMP_01"]);
  assert.deepEqual(fixture.calls[1]?.params, [scope.tenantId, scope.parkId, "EMP_01", 25, 25]);
  assert.match(fixture.calls[1]?.sql ?? "", /fact\.source_person_code=\$3/u);
  assert.match(fixture.calls[1]?.sql ?? "", /summary_employee\.full_name "employeeDisplayName"/u);
  assert.match(fixture.calls[1]?.sql ?? "", /LEFT JOIN hr_performance_legacy_identity_resolution summary_subject_resolution/u);
  assert.match(fixture.calls[1]?.sql ?? "", /LEFT JOIN hr_employee summary_employee/u);
  assert.doesNotMatch(fixture.calls[1]?.sql ?? "", /fact\.target_cycle_employee_id|summary_cycle_employee/u);
  assert.match(
    fixture.calls[1]?.sql ?? "",
    /ORDER BY fact\.source_session_id DESC NULLS LAST,\s*fact\.source_master_id ASC,\s*fact\.id ASC/u,
  );
  assert.doesNotMatch(fixture.calls[1]?.sql ?? "", /EMP_01/u);
  const selectProjection = (fixture.calls[1]?.sql ?? "").split("FROM")[0] ?? "";
  assert.doesNotMatch(
    selectProjection,
    /source_session_id|source_pay|source_appraisal|source_self_appraisal|source_identity_sha256|source_row_sha256|migration_batch_id|legacy_record_map_id/u,
  );
  assert.equal(fixture.audits.length, 1);
});

test("person-summary park projection preserves an unbound employee name as null without guessing", async () => {
  const row = {
    sourcePersonCode: "EMP_02",
    employeeDisplayName: null,
    sourceSelfGrade: null,
    sourceAssGrade: null,
    sourceItemValue: null,
    sourceTotalValue: null,
  };
  const fixture = personSummaryHarness([row]);
  const result = await fixture.service.personSummary(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    { page: 1, page_size: 50, source_person_code: "EMP_02", source_routine: "web_assessmentquery" },
  );
  assert.deepEqual(result.items, [row]);
  assert.equal(result.items[0]?.employeeDisplayName, null);
  assert.doesNotMatch(
    fixture.calls[1]?.sql ?? "",
    /lower\(|upper\(|ilike|full_name\s*=|employee_code\s*=|source_person_code\s*=\s*employee/u,
  );
});

test("person-summary fails closed for no permission and result-read-only permission", async () => {
  for (const deniedActor of [actor(), actor(HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ)]) {
    for (const source_routine of ["web_ass", "web_assessmentquery"] as const) {
      const fixture = personSummaryHarness();
      assert.deepEqual(
        await fixture.service.personSummary(
          scope,
          deniedActor,
          { page: 1, page_size: 50, source_person_code: "EMP_01", source_routine },
        ),
        { items: [], total: 0, page: 1, page_size: 50 },
      );
      assert.equal(fixture.calls.length, 0);
      assert.equal(fixture.audits.length, 0);
    }
  }
});

test("person-summary self and team scopes require active employee mapping and only narrow by source code", async () => {
  const team = personSummaryHarness();
  await team.service.personSummary(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ),
    { page: 1, page_size: 50, source_person_code: "EMP_01", source_routine: "web_assessmentquery" },
  );
  assert.match(team.calls[0]?.sql ?? "", /scope_subject_resolution\.legacy_master_result_id/u);
  assert.match(team.calls[0]?.sql ?? "", /scope_subject_t0\.candidate_count=1/u);
  assert.match(team.calls[0]?.sql ?? "", /JOIN hr_employee employee/u);
  assert.doesNotMatch(team.calls[0]?.sql ?? "", /fact\.target_cycle_employee_id/u);
  assert.match(team.calls[0]?.sql ?? "", /WITH RECURSIVE managed_org/u);
  assert.match(team.calls[0]?.sql ?? "", /employee\.primary_org_id IN/u);
  assert.deepEqual(team.calls[0]?.params, [scope.tenantId, scope.parkId, "user-1", "EMP_01"]);
  assert.match(team.calls[1]?.sql ?? "", /employee\.full_name "employeeDisplayName"/u);
  assert.doesNotMatch(team.calls[1]?.sql ?? "", /summary_cycle_employee|summary_employee/u);

  const self = personSummaryHarness();
  await self.service.personSummary(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ),
    { page: 1, page_size: 50, source_person_code: "EMP_01", source_routine: "web_assessmentquery" },
  );
  assert.match(self.calls[0]?.sql ?? "", /scope_subject_resolution\.legacy_master_result_id/u);
  assert.match(self.calls[0]?.sql ?? "", /scope_subject_t0\.candidate_count=1/u);
  assert.match(self.calls[0]?.sql ?? "", /employee\.user_id::text=\$3::text/u);
  assert.match(self.calls[0]?.sql ?? "", /fact\.source_person_code=\$4/u);
  assert.deepEqual(self.calls[0]?.params, [scope.tenantId, scope.parkId, "user-1", "EMP_01"]);
  assert.match(self.calls[1]?.sql ?? "", /employee\.full_name "employeeDisplayName"/u);
  assert.doesNotMatch(self.calls[1]?.sql ?? "", /summary_cycle_employee|summary_employee/u);
});

test("person-summary reuses verified production-import visibility and never concatenates source code into SQL", async () => {
  const injected = "EMP' OR 1=1 --";
  const fixture = personSummaryHarness();
  await fixture.service.personSummary(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    { page: 1, page_size: 50, source_person_code: injected, source_routine: "web_assessmentquery" },
  );
  for (const call of fixture.calls) {
    assert.doesNotMatch(call.sql, /EMP' OR 1=1/u);
    assert.match(call.sql, /record_map\.mapping_status='verified'/u);
    assert.match(call.sql, /record_map\.is_active=true/u);
    assert.match(call.sql, /batch\.execution_context='production_import'/u);
    assert.match(call.sql, /batch\.status='succeeded'/u);
    assert.deepEqual(call.params.slice(0, 3), [scope.tenantId, scope.parkId, injected]);
  }
});

test("person-summary binds an exact Unicode source code without case folding or SQL pattern semantics", async () => {
  const fixture = personSummaryHarness();
  await fixture.service.personSummary(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
    { page: 1, page_size: 50, source_person_code: "汉01", source_routine: "web_assessmentquery" },
  );
  for (const call of fixture.calls) {
    assert.doesNotMatch(call.sql, /汉01/u);
    assert.doesNotMatch(call.sql, /\b(?:LIKE|ILIKE|LOWER|UPPER)\b/iu);
    assert.match(call.sql, /fact\.source_person_code=\$3/u);
    assert.equal(call.params[2], "汉01");
  }
});

test("person-summary blocks authorized empty responses when required audit persistence fails", async () => {
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
    service.personSummary(
      scope,
      actor(HR_PERMISSIONS.HR_PERFORMANCE_READ),
      { page: 1, page_size: 50, source_person_code: "EMP_01", source_routine: "web_assessmentquery" },
    ),
    /required audit unavailable/u,
  );
});
