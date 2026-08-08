import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ConflictException } from "@nestjs/common";
import type { EntityManagerPort, TenantParkScope } from "@jinhu/shared";
import { HomestayTurnoverTaskResolver } from "./homestay-task.adapter";

const scope: TenantParkScope = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  parkId: "22222222-2222-4222-8222-222222222222"
};
const sourceId = "33333333-3333-4333-8333-333333333333";
const actorId = "44444444-4444-4444-8444-444444444444";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: sourceId,
    bookingId: "55555555-5555-4555-8555-555555555555",
    unitId: "66666666-6666-4666-8666-666666666666",
    status: "pending",
    version: 3,
    assigneeId: null,
    assigneeName: null,
    createTime: "2026-08-03T01:00:00.000Z",
    updateTime: "2026-08-03T02:00:00.000Z",
    startedAt: null,
    completedAt: null,
    exceptionDescription: null,
    blockedUntil: null,
    ...overrides
  };
}

function port(query: (sql: string, parameters: unknown[]) => Promise<unknown>): EntityManagerPort {
  return { transactionContext: { query } };
}

describe("HomestayTurnoverTaskResolver", () => {
  test("freezes the owning source identity and rejects stale projection versions", async () => {
    const statements: string[] = [];
    const resolver = new HomestayTurnoverTaskResolver();
    const manager = port(async (sql) => {
      statements.push(sql);
      return [row()];
    });

    const snapshot = await resolver.lockAndResolve({
      manager,
      scope,
      sourceId,
      businessOccurrenceKey: `homestay-turnover:${sourceId}`,
      expectedSourceVersion: 3,
      taskKey: "a".repeat(64)
    });

    assert.equal(snapshot?.sourceVersion, 3);
    assert.equal(snapshot?.owningAssignment?.status, "open");
    assert.match(statements[0] ?? "", /FOR UPDATE/);
    await assert.rejects(
      resolver.lockAndResolve({
        manager,
        scope,
        sourceId,
        businessOccurrenceKey: `homestay-turnover:${sourceId}`,
        expectedSourceVersion: 2,
        taskKey: "a".repeat(64)
      }),
      ConflictException
    );
  });

  test("claims through the owning aggregate with one version CAS", async () => {
    const statements: Array<{ sql: string; parameters: unknown[] }> = [];
    const resolver = new HomestayTurnoverTaskResolver();
    const manager = port(async (sql, parameters) => {
      statements.push({ sql, parameters });
      return sql.startsWith("SELECT") ? [row()] : [[{ version: 4 }], 1];
    });

    await resolver.invokeOwningCommand({
      manager,
      scope,
      actor: { actorId },
      action: "property.task.claim",
      sourceId,
      businessOccurrenceKey: `homestay-turnover:${sourceId}`,
      taskKey: "b".repeat(64),
      expectedSourceVersion: 3,
      expectedAssignmentVersion: 3
    });

    assert.equal(statements.length, 2);
    assert.match(statements[1]?.sql ?? "", /version=version\+1/);
    assert.match(statements[1]?.sql ?? "", /version=\$4 AND status=\$5/);
    assert.equal(statements[1]?.parameters[6], actorId);
  });

  test("rejects an invalid owning transition before issuing an update", async () => {
    let calls = 0;
    const resolver = new HomestayTurnoverTaskResolver();
    const manager = port(async () => {
      calls += 1;
      return [row({ status: "completed", completedAt: "2026-08-03T03:00:00.000Z" })];
    });

    await assert.rejects(
      resolver.invokeOwningCommand({
        manager,
        scope,
        actor: { actorId },
        action: "property.task.claim",
        sourceId,
        businessOccurrenceKey: `homestay-turnover:${sourceId}`,
        taskKey: "c".repeat(64),
        expectedSourceVersion: 3,
        expectedAssignmentVersion: 3
      }),
      ConflictException
    );
    assert.equal(calls, 1);
  });

  test("forwards block reason and deadline and permits a supervisor release from active work", async () => {
    const statements: Array<{ sql: string; parameters: unknown[] }> = [];
    const resolver = new HomestayTurnoverTaskResolver();
    const manager = port(async (sql, parameters) => {
      statements.push({ sql, parameters });
      return sql.startsWith("SELECT")
        ? [row({ status: "cleaning", assigneeId: actorId })]
        : [[{ version: 4 }], 1];
    });
    await resolver.invokeOwningCommand({
      manager, scope, actor: { actorId }, action: "property.task.block", sourceId,
      businessOccurrenceKey: `homestay-turnover:${sourceId}`,
      taskKey: "d".repeat(64), expectedSourceVersion: 3, expectedAssignmentVersion: 3,
      reason: "等待备件", blockedUntil: "2026-08-09T00:00:00.000Z"
    });
    assert.equal(statements[1]?.parameters[7], "等待备件");
    assert.equal(statements[1]?.parameters[8], "2026-08-09T00:00:00.000Z");

    statements.length = 0;
    await resolver.invokeOwningCommand({
      manager, scope, actor: { actorId: "77777777-7777-4777-8777-777777777777" },
      action: "property.task.release", sourceId,
      businessOccurrenceKey: `homestay-turnover:${sourceId}`,
      taskKey: "e".repeat(64), expectedSourceVersion: 3, expectedAssignmentVersion: 3
    });
    assert.equal(statements[1]?.parameters[6], null);
  });

  test("projects terminal outcome and a stable rebuild cursor", async () => {
    const resolver = new HomestayTurnoverTaskResolver();
    const manager = port(async () => [row({
      status: "completed",
      version: 7,
      completedAt: "2026-08-03T03:00:00.000Z"
    })]);

    const page = await resolver.scanCandidates({ manager, scope, after: null, limit: 1 });

    assert.equal(page.items[0]?.lifecycle, "succeeded");
    assert.equal(page.items[0]?.owningAssignment?.status, "closed");
    assert.equal(page.items[0]?.owningAssignment?.outcomeSourceVersion, 7);
    assert.deepEqual(page.next, {
      sourceId,
      businessOccurrenceKey: `homestay-turnover:${sourceId}`
    });
  });
});
