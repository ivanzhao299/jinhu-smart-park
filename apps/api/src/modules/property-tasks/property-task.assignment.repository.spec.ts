import assert from "node:assert/strict";
import test, { describe, it } from "node:test";
import type { PropertyTaskAction, PropertyTaskStatus } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import {
  PropertyTaskAssignmentRepository,
  type PropertyTaskAssignmentRow
} from "./property-task.assignment.repository";

test("rebuild materializes missing derived assignments before locking projections", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const repository = new PropertyTaskAssignmentRepository();
  await repository.ensureOpenAssignments({
    query: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return []; }
  } as never, { tenantId: "tenant", parkId: "park" }, [{
    taskKey: "a".repeat(64), taskKind: "inspection", sourceType: "fixture",
    sourceId: "00000000-0000-4000-8000-000000000001", sourceVersion: 3
  }]);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /INSERT INTO biz_property_task_assignment/u);
  assert.match(calls[0]!.sql, /ON CONFLICT DO NOTHING/u);
  assert.match(String(calls[0]!.params[2]), /"source_version":3/u);
});

const scope = { tenantId: "tenant-a", parkId: "park-a" };
const actorId = "11111111-1111-4111-8111-111111111111";
const assignmentId = "22222222-2222-4222-8222-222222222222";

function assignment(
  assignmentStatus: PropertyTaskStatus,
  version = 4
): PropertyTaskAssignmentRow {
  const active = assignmentStatus !== "open";
  return {
    id: assignmentId,
    taskKey: "a".repeat(64),
    taskKind: "test_fixture_task",
    sourceType: "test_fixture_source",
    sourceId: "33333333-3333-4333-8333-333333333333",
    sourceVersionAtGeneration: 6,
    assignmentStatus,
    assigneeId: active ? actorId : null,
    assigneeDisplay: active ? "Operator" : null,
    claimEpoch: active ? 1 : 0,
    claimToken: active ? "44444444-4444-4444-8444-444444444444" : null,
    version,
    claimedAt: active ? "2026-08-01T01:00:00.000Z" : null,
    startedAt: ["in_progress", "blocked"].includes(assignmentStatus)
      ? "2026-08-01T02:00:00.000Z" : null,
    blockedReason: assignmentStatus === "blocked" ? "waiting" : null,
    blockedUntil: null,
    outcomeCode: null,
    outcomeSourceVersion: null,
    outcomeAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T02:00:00.000Z"
  };
}

function transitionManager(
  updated: PropertyTaskAssignmentRow,
  updateResult: unknown = [[updated], 1]
) {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const manager = {
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      if (sql.includes("UPDATE biz_property_task_assignment")) {
        if (updateResult instanceof Error) throw updateResult;
        return updateResult;
      }
      if (sql.includes("INSERT INTO biz_property_task_assignment_audit")) {
        return [{ id: "55555555-5555-4555-8555-555555555555" }];
      }
      if (sql.includes("FROM biz_property_task_assignment assignment")) return [updated];
      return [];
    }
  } as unknown as EntityManager;
  return { manager, calls };
}

describe("C4 property task assignment repository", () => {
  it("executes each signed command as CAS then audit then locked reread", async () => {
    const cases: readonly [PropertyTaskAction, PropertyTaskStatus, PropertyTaskStatus][] = [
      ["property.task.claim", "open", "claimed"],
      ["property.task.start", "claimed", "in_progress"],
      ["property.task.block", "in_progress", "blocked"],
      ["property.task.unblock", "blocked", "in_progress"],
      ["property.task.release", "claimed", "open"]
    ];
    for (const [action, from, to] of cases) {
      const before = assignment(from);
      const after = { ...assignment(to, before.version + 1), id: before.id };
      const fixture = transitionManager(after);
      const result = await new PropertyTaskAssignmentRepository().transition(
        fixture.manager,
        {
          scope,
          assignment: before,
          actorId,
          action,
          requestHash: "b".repeat(64),
          reason: action === "property.task.block" ? "fixture reason" : undefined,
          blockedUntil: null
        }
      );

      assert.equal(result.assignmentStatus, to, action);
      assert.equal(result.version, before.version + 1, action);
      assert.equal(fixture.calls.length, 3, action);
      assert.match(fixture.calls[0]!.sql, /^UPDATE biz_property_task_assignment/mu);
      assert.match(fixture.calls[1]!.sql,
        /^\s*INSERT INTO biz_property_task_assignment_audit/mu);
      assert.match(fixture.calls[2]!.sql,
        /FOR UPDATE OF assignment/u);
      assert.deepEqual(fixture.calls[1]!.parameters.slice(4, 9), [
        action,
        from,
        to,
        before.version,
        before.version + 1
      ]);
    }
  });

  it("rejects every unsigned command adjacency before database mutation", async () => {
    const signed = new Set([
      "property.task.claim:open",
      "property.task.start:claimed",
      "property.task.block:in_progress",
      "property.task.unblock:blocked",
      "property.task.release:claimed",
      "property.task.release:in_progress",
      "property.task.release:blocked"
    ]);
    const actions: readonly PropertyTaskAction[] = [
      "property.task.claim",
      "property.task.start",
      "property.task.block",
      "property.task.unblock",
      "property.task.release"
    ];
    const statuses: readonly PropertyTaskStatus[] = [
      "open", "claimed", "in_progress", "blocked", "closed", "cancelled"
    ];
    for (const action of actions) {
      for (const status of statuses) {
        if (signed.has(`${action}:${status}`)) continue;
        const fixture = transitionManager(assignment(status));
        await assert.rejects(new PropertyTaskAssignmentRepository().transition(
          fixture.manager,
          {
            scope,
            assignment: assignment(status),
            actorId,
            action,
            requestHash: "b".repeat(64)
          }
        ));
        assert.equal(fixture.calls.length, 0, `${action}:${status}`);
      }
    }
  });

  it("applies both source terminals as one CAS plus one audit", async () => {
    for (const terminal of ["closed", "cancelled"] as const) {
      const before = assignment("in_progress");
      const after = {
        ...assignment(terminal, before.version + 1),
        outcomeCode: `fixture-${terminal}`,
        outcomeSourceVersion: 7,
        outcomeAt: "2026-08-01T03:00:00.000Z"
      };
      const fixture = transitionManager(after);
      const result = await new PropertyTaskAssignmentRepository().terminal(
        fixture.manager,
        {
          scope,
          assignment: before,
          actorId,
          terminal,
          outcomeCode: after.outcomeCode,
          outcomeSourceVersion: 7,
          outcomeAt: after.outcomeAt,
          requestHash: "c".repeat(64),
          actionId: `property.task.source-terminal.${terminal}`
        }
      );
      assert.equal(result.assignmentStatus, terminal);
      assert.equal(fixture.calls.length, 3);
      assert.match(fixture.calls[0]!.sql, /^UPDATE biz_property_task_assignment/mu);
      assert.match(fixture.calls[1]!.sql,
        /^\s*INSERT INTO biz_property_task_assignment_audit/mu);
      assert.match(fixture.calls[2]!.sql, /FOR UPDATE OF assignment/u);
    }
  });

  it("keeps direct row-array mutation fixtures compatible", async () => {
    const before = assignment("open");
    const after = assignment("claimed", before.version + 1);
    const transitionFixture = transitionManager(after, [after]);
    assert.equal((await new PropertyTaskAssignmentRepository().transition(
      transitionFixture.manager,
      {
        scope,
        assignment: before,
        actorId,
        action: "property.task.claim",
        requestHash: "d".repeat(64)
      }
    )).assignmentStatus, "claimed");

    const terminalBefore = assignment("in_progress");
    const terminalAfter = {
      ...assignment("closed", terminalBefore.version + 1),
      outcomeCode: "fixture-closed",
      outcomeSourceVersion: 7,
      outcomeAt: "2026-08-01T03:00:00.000Z"
    };
    const terminalFixture = transitionManager(terminalAfter, [terminalAfter]);
    assert.equal((await new PropertyTaskAssignmentRepository().terminal(
      terminalFixture.manager,
      {
        scope,
        assignment: terminalBefore,
        actorId,
        terminal: "closed",
        outcomeCode: terminalAfter.outcomeCode,
        outcomeSourceVersion: 7,
        outcomeAt: terminalAfter.outcomeAt,
        requestHash: "e".repeat(64),
        actionId: "property.task.source-terminal.closed"
      }
    )).assignmentStatus, "closed");
  });

  it("maps exact PostgreSQL zero-row CAS results to the signed conflicts", async () => {
    const before = assignment("open");
    const transitionFixture = transitionManager(assignment("claimed", 5), [[], 0]);
    await assert.rejects(
      new PropertyTaskAssignmentRepository().transition(transitionFixture.manager, {
        scope,
        assignment: before,
        actorId,
        action: "property.task.claim",
        requestHash: "f".repeat(64)
      }),
      (error) => errorCode(error) === "task-version-conflict"
    );
    assert.equal(transitionFixture.calls.length, 1);

    const terminalBefore = assignment("in_progress");
    const terminalFixture = transitionManager(assignment("closed", 5), [[], 0]);
    await assert.rejects(
      new PropertyTaskAssignmentRepository().terminal(terminalFixture.manager, {
        scope,
        assignment: terminalBefore,
        actorId,
        terminal: "closed",
        outcomeCode: "fixture-closed",
        outcomeSourceVersion: 7,
        outcomeAt: "2026-08-01T03:00:00.000Z",
        requestHash: "1".repeat(64),
        actionId: "property.task.source-terminal.closed"
      }),
      (error) => errorCode(error) === "property-version-conflict"
    );
    assert.equal(terminalFixture.calls.length, 1);
  });

  it("fails closed on malformed, multi-row, or inconsistent mutation results", async () => {
    const after = assignment("claimed", 5);
    const invalidResults: readonly unknown[] = [
      null,
      {},
      [after, { ...after, id: "66666666-6666-4666-8666-666666666666" }],
      [[after, { ...after, id: "66666666-6666-4666-8666-666666666666" }], 2],
      [[after], 1, "unexpected"],
      [[after], 0],
      [[after], 2],
      [[], 1],
      [[after], "1"]
    ];
    for (const result of invalidResults) {
      const transitionFixture = transitionManager(after, result);
      await assert.rejects(
        new PropertyTaskAssignmentRepository().transition(transitionFixture.manager, {
          scope,
          assignment: assignment("open"),
          actorId,
          action: "property.task.claim",
          requestHash: "2".repeat(64)
        }),
        (error) => errorCode(error) === "property-runtime-unavailable"
      );
      assert.equal(transitionFixture.calls.length, 1);

      const terminalFixture = transitionManager(after, result);
      await assert.rejects(
        new PropertyTaskAssignmentRepository().terminal(terminalFixture.manager, {
          scope,
          assignment: assignment("in_progress"),
          actorId,
          terminal: "closed",
          outcomeCode: "fixture-closed",
          outcomeSourceVersion: 7,
          outcomeAt: "2026-08-01T03:00:00.000Z",
          requestHash: "3".repeat(64),
          actionId: "property.task.source-terminal.closed"
        }),
        (error) => errorCode(error) === "property-runtime-unavailable"
      );
      assert.equal(terminalFixture.calls.length, 1);
    }
  });

  it("preserves database mutation failures without audit or reread", async () => {
    const failure = new Error("database-update-failed");
    for (const kind of ["transition", "terminal"] as const) {
      const fixture = transitionManager(assignment("claimed", 5), failure);
      const repository = new PropertyTaskAssignmentRepository();
      const operation = kind === "transition"
        ? repository.transition(fixture.manager, {
            scope,
            assignment: assignment("open"),
            actorId,
            action: "property.task.claim",
            requestHash: "4".repeat(64)
          })
        : repository.terminal(fixture.manager, {
            scope,
            assignment: assignment("in_progress"),
            actorId,
            terminal: "closed",
            outcomeCode: "fixture-closed",
            outcomeSourceVersion: 7,
            outcomeAt: "2026-08-01T03:00:00.000Z",
            requestHash: "5".repeat(64),
            actionId: "property.task.source-terminal.closed"
          });
      await assert.rejects(operation, (error) => error === failure);
      assert.equal(fixture.calls.length, 1);
    }
  });
});

function errorCode(error: unknown): unknown {
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  return response && (response as { errorCode?: unknown }).errorCode;
}
