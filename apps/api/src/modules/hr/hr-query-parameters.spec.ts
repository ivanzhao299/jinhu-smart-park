import assert from "node:assert/strict";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrGoalReportService } from "./hr-goal-report.service";
import { HrLifecycleService } from "./hr-lifecycle.service";
import { HrPerformanceEvaluationService } from "./hr-performance-evaluation.service";
import { HrPerformanceReviewService } from "./hr-performance-review.service";

const scope = { tenantId: "10000001", parkId: "20000001" };

function actor(permission: string): JwtPrincipal {
  return {
    sub: "30000001",
    username: "hr-query-test",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    roles: [],
    permissions: [permission],
  };
}

function queryRecorder() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return [];
    },
  } as unknown as DataSource;
  return { calls, db };
}

const audit = { recordOperationRequired: async () => undefined } as never;

test("park HR lifecycle list binds only the four parameters referenced by SQL", async () => {
  const { calls, db } = queryRecorder();
  const service = new HrLifecycleService(db, {} as never, audit);

  await service.list(scope, actor(HR_PERMISSIONS.HR_LIFECYCLE_READ), {
    page: 1,
    page_size: 20,
  });

  assert.equal(calls[0]?.params.length, 4);
  assert.doesNotMatch(calls[0]?.sql ?? "", /\$5/);
});

test("park goal reads and management options omit the unused actor parameter", async () => {
  const { calls, db } = queryRecorder();
  const service = new HrGoalReportService(db, {} as never, audit);
  const parkActor = actor(HR_PERMISSIONS.HR_GOAL_READ);

  await service.listGoals(scope, parkActor, {});
  assert.deepEqual(calls[0]?.params, [scope.tenantId, scope.parkId]);
  assert.doesNotMatch(calls[0]?.sql ?? "", /\$3/);

  await service.goalOptions(scope, {
    ...parkActor,
    permissions: [HR_PERMISSIONS.HR_GOAL_READ, HR_PERMISSIONS.HR_GOAL_MANAGE],
  });
  for (const call of calls.slice(1)) {
    assert.deepEqual(call.params, [scope.tenantId, scope.parkId]);
    assert.doesNotMatch(call.sql, /\$3/);
  }
});

test("park performance lists omit the unused actor parameter", async () => {
  const cycleRecorder = queryRecorder();
  const cycles = new HrPerformanceReviewService(cycleRecorder.db, audit);
  await cycles.cycles(scope, actor(HR_PERMISSIONS.HR_PERFORMANCE_READ), {});
  assert.deepEqual(cycleRecorder.calls[0]?.params, [scope.tenantId, scope.parkId]);
  assert.doesNotMatch(cycleRecorder.calls[0]?.sql ?? "", /\$3/);

  const reviewRecorder = queryRecorder();
  const reviews = new HrPerformanceEvaluationService(reviewRecorder.db, audit);
  await reviews.reviews(scope, actor(HR_PERMISSIONS.HR_PERFORMANCE_READ), {});
  assert.deepEqual(reviewRecorder.calls[0]?.params, [scope.tenantId, scope.parkId]);
  assert.doesNotMatch(reviewRecorder.calls[0]?.sql ?? "", /\$3/);
});

test("scoped HR reads retain the actor parameter before optional filters", async () => {
  const lifecycleRecorder = queryRecorder();
  const lifecycle = new HrLifecycleService(lifecycleRecorder.db, {} as never, audit);
  await lifecycle.list(scope, actor(HR_PERMISSIONS.HR_LIFECYCLE_TEAM_READ), {
    page: 1,
    page_size: 20,
    status: "open",
  });
  assert.deepEqual(lifecycleRecorder.calls[0]?.params.slice(4), ["30000001", "open"]);
  assert.match(lifecycleRecorder.calls[0]?.sql ?? "", /leader_user_id=\$5/);
  assert.match(lifecycleRecorder.calls[0]?.sql ?? "", /c\.status=\$6/);

  const goalRecorder = queryRecorder();
  const goals = new HrGoalReportService(goalRecorder.db, {} as never, audit);
  await goals.listGoals(scope, actor(HR_PERMISSIONS.HR_GOAL_SELF_READ), {
    status: "active",
  });
  assert.deepEqual(goalRecorder.calls[0]?.params, [scope.tenantId, scope.parkId, "30000001", "active"]);
  assert.match(goalRecorder.calls[0]?.sql ?? "", /user_id=\$3/);
  assert.match(goalRecorder.calls[0]?.sql ?? "", /g\.status=\$4/);
});
