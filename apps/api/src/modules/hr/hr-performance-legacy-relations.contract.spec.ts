import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrPerformanceLegacyRelationsService } from "./hr-performance-legacy-relations.service";

const scope = { tenantId: "tenant-1", parkId: "park-1" };
const page = { page: 2, page_size: 25 };

function actor(...permissions: string[]): JwtPrincipal {
  return {
    sub: "user-1",
    username: "performance-relations-test",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    roles: [],
    permissions,
  };
}

function harness(row: Record<string, unknown> = { sourceSessionId: 7 }) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const dataSource = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return /count\(\*\)::int total/u.test(sql) ? [{ total: "1" }] : [row];
    },
  } as unknown as DataSource;
  const audit = {
    recordOperationRequired: async (input: Record<string, unknown>) => {
      audits.push(input);
    },
  } as never;
  return {
    calls,
    audits,
    service: new HrPerformanceLegacyRelationsService(dataSource, audit),
  };
}

test("legacy session definitions require template authority and stay tenant/park scoped", async () => {
  const denied = harness();
  assert.deepEqual(await denied.service.sessions(scope, actor(), page), {
    items: [], total: 0, page: 2, page_size: 25,
  });
  assert.equal(denied.calls.length, 0);
  assert.equal(denied.audits.length, 0);

  const allowed = harness({
    sourceSessionId: 7,
    sourceSessionName: "session-label",
    sourceDescription: null,
    sourceAssessmentType: "annual",
    sourceYear: 2026,
    sourceMonth: null,
    sourceQuarter: 3,
    sourceMyOrder: 1,
    targetReviewCycleId: null,
    sourceIdentitySha256: "must-not-leak",
  });
  const result = await allowed.service.sessions(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ),
    page,
  );
  assert.deepEqual(result.items, [{
    sourceSessionId: 7,
    sourceSessionName: "session-label",
    sourceDescription: null,
    sourceAssessmentType: "annual",
    sourceYear: 2026,
    sourceMonth: null,
    sourceQuarter: 3,
    sourceMyOrder: 1,
    targetReviewCycleId: null,
  }]);
  assert.deepEqual(allowed.calls[0]?.params, [scope.tenantId, scope.parkId]);
  assert.deepEqual(allowed.calls[1]?.params, [scope.tenantId, scope.parkId, 25, 25]);
  assert.equal(allowed.audits.length, 1);
});

test("person-bearing relations accept only result-read or performance-manage park authority", async () => {
  for (const permission of [
    undefined,
    HR_PERMISSIONS.HR_PERFORMANCE_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ,
  ]) {
    const denied = harness();
    const principal = permission ? actor(permission) : actor();
    assert.deepEqual(await denied.service.scoreSources(scope, principal, page), {
      items: [], total: 0, page: 2, page_size: 25,
    });
    assert.deepEqual(await denied.service.sourcePersonAssignments(scope, principal, page), {
      items: [], total: 0, page: 2, page_size: 25,
    });
    assert.equal(denied.calls.length, 0);
    assert.equal(denied.audits.length, 0);
  }

  for (const permission of [
    HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ,
    HR_PERMISSIONS.HR_PERFORMANCE_MANAGE,
  ]) {
    const allowed = harness({
      sourceScoreId: 1,
      sourceSessionId: 7,
      sourcePersonCode: "subject-code",
      sourceItemId: 2,
      sourceRelationType: 3,
      sourceItemValue: "88.50",
      sourceAssGrade: null,
      sourceAppraisal: null,
      legacySessionId: null,
      legacyDimensionProfileId: null,
    });
    const result = await allowed.service.scoreSources(scope, actor(permission), page);
    assert.equal(result.items.length, 1);
    assert.equal(allowed.calls.length, 2);
    assert.equal(allowed.audits.length, 1);
  }
});

test("relation visibility is verified active successful production-import evidence only", () => {
  const source = readFileSync(
    resolve(__dirname, "hr-performance-legacy-relations.service.ts"),
    "utf8",
  );
  for (const token of [
    "fact.tenant_id=$1 AND fact.park_id=$2",
    "record_map.mapping_status='verified'",
    "record_map.is_active=true",
    "batch.execution_context='production_import'",
    "batch.status='succeeded'",
  ]) {
    assert.match(
      source,
      new RegExp(token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
    );
  }
  assert.doesNotMatch(source, /JOIN hr_employee|WITH RECURSIVE managed_org/u);
});

test("relation queries use bounded pagination, stable ordering, and narrowing session filter", async () => {
  const allowed = harness({
    sourceAssignmentId: 5,
    sourceSessionId: 7,
    sourcePersonCode: "subject-code",
    sourceAssessorCode: "assessor-code",
    sourceRelationType: 1,
    legacySessionId: null,
  });
  const result = await allowed.service.sourcePersonAssignments(
    scope,
    actor(HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ),
    { ...page, source_session_id: 7 },
  );
  assert.deepEqual(allowed.calls[0]?.params, [scope.tenantId, scope.parkId, 7]);
  assert.deepEqual(allowed.calls[1]?.params, [scope.tenantId, scope.parkId, 7, 25, 25]);
  assert.match(allowed.calls[0]?.sql ?? "", /fact\.source_session_id=\$3/u);
  assert.match(
    allowed.calls[1]?.sql ?? "",
    /ORDER BY fact\.source_session_id DESC NULLS LAST,[\s\S]*fact\.source_assignment_id ASC[\s\S]*LIMIT \$4 OFFSET \$5/u,
  );
  assert.deepEqual(Object.keys(result.items[0] ?? {}).sort(), [
    "legacySessionId",
    "sourceAssessorCode",
    "sourceAssignmentId",
    "sourcePersonCode",
    "sourceRelationType",
    "sourceSessionId",
  ]);
});

test("relation response allowlists never expose migration provenance or rich employee records", () => {
  const source = readFileSync(
    resolve(__dirname, "hr-performance-legacy-relations.service.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /SELECT\s+fact\.\*/u);
  for (const responseKey of [
    "sourceIdentitySha256",
    "sourceRowSha256",
    "migrationBatchId",
    "legacyRecordMapId",
    "sourcePath",
    "fullName",
    "mobile",
    "identityNumber",
  ]) {
    assert.doesNotMatch(source, new RegExp(`${responseKey}:`, "u"));
  }
});

test("authorized relation reads fail closed when required audit persistence fails", async () => {
  const dataSource = {
    query: async (sql: string) =>
      /count\(\*\)::int total/u.test(sql) ? [{ total: "0" }] : [],
  } as unknown as DataSource;
  const audit = {
    recordOperationRequired: async () => {
      throw new Error("required audit unavailable");
    },
  } as never;
  const service = new HrPerformanceLegacyRelationsService(dataSource, audit);
  await assert.rejects(
    service.sessions(scope, actor(HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ), page),
    /required audit unavailable/u,
  );
  await assert.rejects(
    service.scoreSources(scope, actor(HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ), page),
    /required audit unavailable/u,
  );
  await assert.rejects(
    service.sourcePersonAssignments(scope, actor(HR_PERMISSIONS.HR_PERFORMANCE_MANAGE), page),
    /required audit unavailable/u,
  );
});

test("legacy relation controller is read-only and module wiring is complete", () => {
  const controller = readFileSync(
    resolve(__dirname, "hr-performance-legacy-relations.controller.ts"),
    "utf8",
  );
  const moduleSource = readFileSync(resolve(__dirname, "hr.module.ts"), "utf8");
  assert.match(controller, /@Controller\("hr\/performance-legacy\/relations"\)/u);
  assert.match(controller, /@RequireModule\("hr"\)/u);
  for (const route of ["sessions", "score-sources", "source-person-assignments"]) {
    assert.match(controller, new RegExp(`@Get\\("${route}"\\)`, "u"));
  }
  assert.doesNotMatch(controller, /@(Post|Put|Patch|Delete)\(/u);
  for (const permission of [
    "HR_PERFORMANCE_TEMPLATE_READ",
    "HR_PERFORMANCE_TEMPLATE_MANAGE",
    "HR_PERFORMANCE_RESULT_READ",
    "HR_PERFORMANCE_MANAGE",
  ]) {
    assert.match(controller, new RegExp(`HR_PERMISSIONS\\.${permission}\\b`, "u"));
  }
  assert.match(moduleSource, /HrPerformanceLegacyRelationsController/u);
  assert.match(moduleSource, /HrPerformanceLegacyRelationsService/u);
});
