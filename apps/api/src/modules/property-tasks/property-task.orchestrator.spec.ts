import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  PropertyMutationReceiptAcquireInput,
  PropertyMutationReceiptPort,
  PropertyTaskAction,
  PropertyTaskMutationResponse,
  PropertyTaskProjectorSource,
  PropertyTaskRebuildResponse,
  PropertyTaskSourceResolver,
  PropertyTaskSourceSnapshot,
  PropertyTaskSourceTerminalRequestV1
} from "@jinhu/shared";
import type { DataSource, EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DatabasePropertyMutationReceiptAdapter } from
  "../property-approvals/property-mutation-receipt.adapter";
import type { PropertyTaskAccessEvaluatorService } from "./property-task.access";
import type {
  PropertyTaskAssignmentRepository,
  PropertyTaskAssignmentRow
} from "./property-task.assignment.repository";
import { canonicalPropertyTaskRequestHash } from "./property-task.canonical";
import { PropertyTaskMapper } from "./property-task.mapper";
import { PropertyTaskOrchestrator } from "./property-task.orchestrator";
import type {
  PropertyTaskProjectionRepository,
  PropertyTaskProjectionRow,
  PropertyTaskProjectionWriteRow
} from "./property-task.projection.repository";
import type { PropertyTaskSourceRegistryProvider } from "./property-task.registry";

const scope = { tenantId: "tenant-a", parkId: "park-a" };
const actor: JwtPrincipal = {
  sub: "11111111-1111-4111-8111-111111111111",
  username: "fixture",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};
const taskId = "22222222-2222-4222-8222-222222222222";
const sourceId = "33333333-3333-4333-8333-333333333333";
const assignmentId = "44444444-4444-4444-8444-444444444444";
const taskKey = "a".repeat(64);

function projection(
  assignmentStatus: PropertyTaskProjectionRow["assignmentStatus"] = "claimed",
  assignmentVersion = 4
): PropertyTaskProjectionRow {
  return {
    taskId,
    taskKey,
    assignmentAuthority: "derived",
    derivedAssignmentId: assignmentId,
    sourceType: "test_fixture_source",
    sourceId,
    sourceVersion: 7,
    businessOccurrenceKey: "fixture-occurrence",
    taskKind: "test_fixture_task",
    queueCode: "test_fixture_queue",
    title: "Fixture task",
    kindLabel: "Fixture",
    sourceLabel: "Fixture source",
    priority: 10,
    dueAt: null,
    assignmentStatus,
    assignmentVersion,
    assigneeId: assignmentStatus === "open" ? null : actor.sub,
    assigneeDisplay: assignmentStatus === "open" ? null : "Operator",
    claimedAt: assignmentStatus === "open" ? null : "2026-08-01T01:00:00.000Z",
    startedAt: ["in_progress", "blocked"].includes(assignmentStatus)
      ? "2026-08-01T02:00:00.000Z" : null,
    blockedReason: assignmentStatus === "blocked" ? "waiting" : null,
    blockedUntil: null,
    outcomeCode: ["closed", "cancelled"].includes(assignmentStatus)
      ? `fixture-${assignmentStatus}` : null,
    outcomeSourceVersion: ["closed", "cancelled"].includes(assignmentStatus) ? 7 : null,
    outcomeAt: ["closed", "cancelled"].includes(assignmentStatus)
      ? "2026-08-01T03:00:00.000Z" : null,
    sourceDeepLink: `/test_fixture_source/${sourceId}`,
    projectionVersion: 8,
    contentHash: "b".repeat(64),
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T03:00:00.000Z"
  };
}

function assignment(row: PropertyTaskProjectionRow): PropertyTaskAssignmentRow {
  return {
    id: assignmentId,
    taskKey: row.taskKey,
    taskKind: row.taskKind,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceVersionAtGeneration: row.sourceVersion,
    assignmentStatus: row.assignmentStatus,
    assigneeId: row.assigneeId,
    assigneeDisplay: row.assigneeDisplay,
    claimEpoch: row.assignmentStatus === "open" ? 0 : 1,
    claimToken: row.assignmentStatus === "open"
      ? null : "55555555-5555-4555-8555-555555555555",
    version: row.assignmentVersion,
    claimedAt: row.claimedAt,
    startedAt: row.startedAt,
    blockedReason: row.blockedReason,
    blockedUntil: row.blockedUntil,
    outcomeCode: row.outcomeCode,
    outcomeSourceVersion: row.outcomeSourceVersion,
    outcomeAt: row.outcomeAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function terminalRequest(
  terminal: "closed" | "cancelled",
  expectedAssignmentVersion: number
): PropertyTaskSourceTerminalRequestV1 {
  return {
    schemaVersion: "property-task-source-terminal-v1",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    terminalActorId: actor.sub,
    actionId: `property.task.source-terminal.${terminal}`,
    targetId: sourceId,
    sourceType: "test_fixture_source",
    sourceId,
    businessOccurrenceKey: "fixture-occurrence",
    taskKey,
    terminal,
    sourceVersion: 7,
    expectedAssignmentVersion,
    outcomeCode: `fixture-${terminal}`,
    outcomeAt: "2026-08-01T03:00:00.000Z"
  };
}

function callSourceTerminal(
  orchestrator: PropertyTaskOrchestrator,
  request: PropertyTaskSourceTerminalRequestV1
): Promise<PropertyTaskMutationResponse> {
  return (orchestrator as unknown as {
    sourceTerminal(value: PropertyTaskSourceTerminalRequestV1):
    Promise<PropertyTaskMutationResponse>;
  }).sourceTerminal(request);
}

function runtime(options: {
  row: PropertyTaskProjectionRow;
  lockedRows?: readonly PropertyTaskProjectionRow[];
  lockedProjectionVersion?: number;
  receipt: "execute" | "replay" | "execute-then-replay";
  sourceLifecycle?: "eligible" | "succeeded" | "cancelled";
  lockedAssignmentRow?: PropertyTaskProjectionRow;
  replaceError?: Error;
  authority?: "derived" | "owning";
  authorizeCommand?: boolean;
  canReadSourceDetails?: boolean;
  missingProjection?: boolean;
}) {
  const events: string[] = [];
  const isolations: string[] = [];
  const manager = { marker: "raw-transaction-manager" } as unknown as EntityManager;
  const dataSource = {
    async transaction(isolation: string, work: (value: EntityManager) => Promise<unknown>) {
      isolations.push(isolation);
      events.push("transaction:begin");
      try {
        const result = await work(manager);
        events.push("transaction:commit");
        return result;
      } catch (error) {
        events.push("transaction:rollback");
        throw error;
      }
    }
  } as unknown as DataSource;
  let currentRow = options.row;
  let sourceResolveCount = 0;
  const resolver: PropertyTaskSourceResolver = {
    sourceType: options.row.sourceType,
    taskKind: options.row.taskKind,
    assignmentAuthority: options.authority ?? "derived",
    access: {
      tag: "workspace",
      sourceType: options.row.sourceType,
      requiredModules: ["test_fixture_module"],
      surfaceId: "test_fixture_surface",
      pagePermission: "test_fixture_page:read",
      queueCode: options.row.queueCode,
      domainRoute: "/test_fixture_source",
      sourceDetailPermission: "test_fixture_source:read"
    },
    async lockAndResolve(input) {
      events.push("source:lock");
      assert.equal(input.manager.transactionContext, manager);
      sourceResolveCount += 1;
      return {
        sourceId,
        sourceVersion: options.authority === "owning" && sourceResolveCount > 1 ? 8 : 7,
        lifecycle: options.sourceLifecycle
          ?? (options.row.assignmentStatus === "closed" ? "succeeded"
          : options.row.assignmentStatus === "cancelled" ? "cancelled" : "eligible"),
        businessOccurrenceKey: "fixture-occurrence",
        title: options.row.title,
        kindLabel: options.row.kindLabel,
        sourceLabel: options.row.sourceLabel,
        priority: options.row.priority,
        dueAt: null,
        sourceDeepLink: options.row.sourceDeepLink,
        owningAssignment: options.authority === "owning" ? {
          status: currentRow.assignmentStatus,
          version: currentRow.assignmentVersion,
          assigneeId: currentRow.assigneeId,
          assigneeDisplay: currentRow.assigneeDisplay,
          claimedAt: currentRow.claimedAt as string | null,
          startedAt: currentRow.startedAt as string | null,
          blockedReason: currentRow.blockedReason,
          blockedUntil: currentRow.blockedUntil as string | null,
          outcomeCode: currentRow.outcomeCode,
          outcomeSourceVersion: currentRow.outcomeSourceVersion,
          outcomeAt: currentRow.outcomeAt as string | null,
          createdAt: currentRow.createdAt as string,
          updatedAt: currentRow.updatedAt as string
        } : null
      };
    },
    async invokeOwningCommand(input) {
      events.push("source:owning-command");
      currentRow = {
        ...transitionedProjection(currentRow, input.action),
        sourceVersion: 8
      };
    }
  };
  let receiptAccessCount = 0;
  let receiptCompleteCount = 0;
  let transitionCount = 0;
  let terminalCount = 0;
  let replaceCount = 0;
  let replaceInput: Parameters<PropertyTaskProjectionRepository["replace"]>[1] | null
    = null;
  let acquireInput: PropertyMutationReceiptAcquireInput | null = null;
  const receipts: PropertyMutationReceiptPort = {
    async acquire(receiptManager, input) {
      events.push("receipt:acquire");
      assert.equal(receiptManager, manager, "receipt port must receive the raw manager");
      receiptAccessCount += 1;
      acquireInput = input;
      const replay = options.receipt === "replay"
        || (options.receipt === "execute-then-replay" && receiptAccessCount > 1);
      return replay
        ? { kind: "replay", resultHash: "c".repeat(64),
            resultRef: `property-task/${taskId}/v${currentRow.assignmentVersion}`,
            resultVersion: currentRow.assignmentVersion }
        : { kind: "execute", receiptId: "66666666-6666-4666-8666-666666666666" };
    },
    async complete(receiptManager) {
      events.push("receipt:complete");
      assert.equal(receiptManager, manager);
      receiptCompleteCount += 1;
    }
  };
  const assignments = {
    async lockById() {
      events.push("assignment:lock");
      return assignment(options.lockedAssignmentRow ?? currentRow);
    },
    async transition(
      _manager: EntityManager,
      input: Parameters<PropertyTaskAssignmentRepository["transition"]>[1]
    ) {
      events.push("assignment:transition");
      transitionCount += 1;
      currentRow = transitionedProjection(currentRow, input.action);
      return assignment(currentRow);
    },
    async terminal(
      _manager: EntityManager,
      input: Parameters<PropertyTaskAssignmentRepository["terminal"]>[1]
    ) {
      events.push("assignment:terminal");
      terminalCount += 1;
      currentRow = {
        ...currentRow,
        assignmentStatus: input.terminal,
        assignmentVersion: currentRow.assignmentVersion + 1,
        assigneeId: null,
        assigneeDisplay: null,
        blockedReason: null,
        blockedUntil: null,
        outcomeCode: input.outcomeCode,
        outcomeSourceVersion: input.outcomeSourceVersion,
        outcomeAt: input.outcomeAt
      };
      return assignment(currentRow);
    }
  } as unknown as PropertyTaskAssignmentRepository;
  const projections = {
    async findByTaskId() {
      events.push("projection:find-task");
      return options.missingProjection ? null : currentRow;
    },
    async findByTaskKey() {
      events.push("projection:find-key");
      return options.row;
    },
    async lockSourceProjection() {
      events.push("projection:lock-head-rows");
      const rows = options.lockedRows ?? [currentRow];
      const lockedCurrent = rows.find((row) => row.taskId === options.row.taskId);
      if (lockedCurrent) currentRow = lockedCurrent;
      return {
        projectionVersion: options.lockedProjectionVersion
          ?? rows[0]?.projectionVersion
          ?? options.row.projectionVersion,
        rows
      };
    },
    async findBySource() {
      events.push("projection:find-source");
      return [currentRow];
    },
    async withDatabaseContentHashes(
      _manager: EntityManager,
      rows: readonly Omit<PropertyTaskProjectionWriteRow, "contentHash">[]
    ) {
      events.push("projection:hash");
      return rows.map((row) => ({ ...row, contentHash: "d".repeat(64) }));
    },
    async replace(
      _manager: EntityManager,
      input: Parameters<PropertyTaskProjectionRepository["replace"]>[1]
    ) {
      events.push("projection:replace");
      replaceCount += 1;
      replaceInput = input;
      if (options.replaceError) throw options.replaceError;
      return { previousProjectionVersion: input.expectedProjectionVersion,
        projectionVersion: input.expectedProjectionVersion + 1,
        projectedTaskCount: 1 };
    }
  } as unknown as PropertyTaskProjectionRepository;
  const registry = { resolve: () => resolver } as unknown as
  PropertyTaskSourceRegistryProvider;
  const access = {
    authorizeCommand: async () => {
      events.push("access:command");
      return options.authorizeCommand ?? true;
    },
    canReadSourceDetails: async () => options.canReadSourceDetails ?? true
  } as unknown as
  PropertyTaskAccessEvaluatorService;
  const orchestrator = new PropertyTaskOrchestrator(
    dataSource,
    assignments,
    projections,
    registry,
    access,
    new PropertyTaskMapper(),
    receipts
  );
  return {
    orchestrator,
    events,
    counts: () => ({ receiptAccessCount, receiptCompleteCount,
      transitionCount, terminalCount, replaceCount }),
    acquire: () => acquireInput,
    isolations: () => isolations,
    replaceInput: () => replaceInput,
    current: () => currentRow
  };
}

function transitionedProjection(
  row: PropertyTaskProjectionRow,
  action: PropertyTaskAction
): PropertyTaskProjectionRow {
  const common = { ...row, assignmentVersion: row.assignmentVersion + 1 };
  if (action === "property.task.claim") {
    return { ...common, assignmentStatus: "claimed", assigneeId: actor.sub,
      assigneeDisplay: "Operator", claimedAt: "2026-08-01T01:00:00.000Z" };
  }
  if (action === "property.task.start" || action === "property.task.unblock") {
    return { ...common, assignmentStatus: "in_progress",
      startedAt: "2026-08-01T02:00:00.000Z", blockedReason: null,
      blockedUntil: null };
  }
  if (action === "property.task.block") {
    return { ...common, assignmentStatus: "blocked", blockedReason: "fixture reason" };
  }
  return { ...common, assignmentStatus: "open", assigneeId: null,
    assigneeDisplay: null, claimedAt: null, startedAt: null,
    blockedReason: null, blockedUntil: null };
}

function rebuildReplayRuntime(options: { receiptDatabaseError?: unknown } = {}) {
  const events: string[] = [];
  const acquireInputs: PropertyMutationReceiptAcquireInput[] = [];
  const manager = {
    marker: "rebuild-replay-manager",
    async query() {
      if (options.receiptDatabaseError) throw options.receiptDatabaseError;
      return [];
    }
  } as unknown as EntityManager;
  let projectionVersion = 8;
  let replaceCount = 0;
  let completeCount = 0;
  let completedClientKey: string | null = null;
  const snapshot: PropertyTaskSourceSnapshot = {
    sourceId,
    sourceVersion: 9,
    lifecycle: "eligible",
    businessOccurrenceKey: "fixture-rebuild-replay-occurrence",
    title: "Rebuild replay authority",
    kindLabel: "Fixture",
    sourceLabel: "Fixture source",
    priority: 10,
    dueAt: null,
    sourceDeepLink: `/test_fixture_source/${sourceId}`,
    owningAssignment: {
      status: "open",
      version: 3,
      assigneeId: null,
      assigneeDisplay: null,
      claimedAt: null,
      startedAt: null,
      blockedReason: null,
      blockedUntil: null,
      outcomeCode: null,
      outcomeSourceVersion: null,
      outcomeAt: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z"
    }
  };
  const projector: PropertyTaskSourceResolver & PropertyTaskProjectorSource = {
    sourceType: "test_fixture_source",
    taskKind: "test_fixture_task",
    assignmentAuthority: "owning",
    access: {
      tag: "workspace",
      sourceType: "test_fixture_source",
      requiredModules: ["test_fixture_module"],
      surfaceId: "test_fixture_surface",
      pagePermission: "test_fixture_page:read",
      queueCode: "test_fixture_queue",
      domainRoute: "/test_fixture_source",
      sourceDetailPermission: "test_fixture_source:read"
    },
    async scanCandidates() {
      events.push("projector:scan");
      return { items: [snapshot], next: null };
    },
    async lockAndResolve(input) {
      events.push("projector:source-lock");
      assert.equal(input.manager.transactionContext, manager);
      return snapshot;
    }
  };
  const dataSource = {
    async transaction(isolation: string,
      work: (value: EntityManager) => Promise<PropertyTaskRebuildResponse>) {
      assert.equal(isolation, "SERIALIZABLE");
      events.push("transaction:begin");
      try {
        const result = await work(manager);
        events.push("transaction:commit");
        return result;
      } catch (error) {
        events.push("transaction:rollback");
        throw error;
      }
    }
  } as unknown as DataSource;
  const assignments = {
    async ensureOpenAssignments() {
      events.push("assignment:ensure-open");
    },
    async lockByTaskKeys() {
      events.push("assignment:lock-keys");
      return [];
    }
  } as unknown as PropertyTaskAssignmentRepository;
  const projections = {
    async lockSourceProjection() {
      events.push("projection:lock-head-rows");
      return { projectionVersion, rows: [] };
    },
    async withDatabaseContentHashes(_manager: EntityManager,
      rows: readonly Omit<PropertyTaskProjectionWriteRow, "contentHash">[]) {
      events.push("projection:hash-authority");
      return rows.map((row) => ({ ...row, contentHash: "e".repeat(64) }));
    },
    async replace(_manager: EntityManager,
      input: Parameters<PropertyTaskProjectionRepository["replace"]>[1]) {
      events.push("projection:replace");
      replaceCount += 1;
      projectionVersion = input.expectedProjectionVersion + 1;
      return { previousProjectionVersion: input.expectedProjectionVersion,
        projectionVersion, projectedTaskCount: input.rows.length };
    }
  } as unknown as PropertyTaskProjectionRepository;
  const receipts: PropertyMutationReceiptPort = {
    async acquire(receiptManager, input) {
      events.push("receipt:acquire");
      assert.equal(receiptManager, manager);
      acquireInputs.push(input);
      if (options.receiptDatabaseError) {
        return new DatabasePropertyMutationReceiptAdapter().acquire(
          receiptManager,
          input
        );
      }
      if (input.clientKey === completedClientKey) {
        assert.equal(input.identity.tag, "property-task-source-rebuild");
        return {
          kind: "replay",
          resultHash: "c".repeat(64),
          resultRef: `property-task-rebuild/${input.identity.sourceType}/${sourceId}/v9`,
          resultVersion: 9
        };
      }
      return { kind: "execute", receiptId: "66666666-6666-4666-8666-666666666666" };
    },
    async complete(receiptManager, input) {
      events.push("receipt:complete");
      assert.equal(receiptManager, manager);
      completeCount += 1;
      completedClientKey = input.clientKey;
    }
  };
  const orchestrator = new PropertyTaskOrchestrator(
    dataSource,
    assignments,
    projections,
    { projectorsForSourceType: () => {
      events.push("registry:projectors");
      return [projector];
    } } as unknown as PropertyTaskSourceRegistryProvider,
    { authorizeTaskRead: async () => {
      events.push("access:rebuild");
      return true;
    } } as unknown as PropertyTaskAccessEvaluatorService,
    new PropertyTaskMapper(),
    receipts
  );
  return {
    orchestrator,
    events,
    acquireInputs,
    counts: () => ({ replaceCount, completeCount, projectionVersion })
  };
}

describe("C4 property task orchestrator receipt fences", () => {
  it("normalizes only an adapter-preserved rebuild serialization failure", async () => {
    for (const [databaseError, expectedStatus, expectedCode] of [
      [{ code: "40001" }, 409, "task-version-conflict"],
      [{ code: "23514" }, 503, "property-runtime-unavailable"]
    ] as const) {
      const fixture = rebuildReplayRuntime({ receiptDatabaseError: databaseError });
      await assert.rejects(fixture.orchestrator.rebuild(scope, actor, {
        clientKey: `fixture-rebuild-database-${databaseError.code}`,
        sourceType: "test_fixture_source",
        sourceId,
        expectedProjectionVersion: 8,
        reason: "fixture database error"
      }), (error: unknown) => {
        const exception = error as {
          getStatus(): number;
          getResponse(): { errorCode?: unknown };
        };
        assert.equal(exception.getStatus(), expectedStatus);
        assert.equal(exception.getResponse().errorCode, expectedCode);
        return true;
      });
      assert.equal(fixture.events.at(-1), "transaction:rollback");
      assert.equal(fixture.counts().replaceCount, 0);
      assert.equal(fixture.counts().completeCount, 0);
    }
  });

  it("makes the completed same-clientKey command replay reachable after success", async () => {
    const fixture = runtime({
      row: projection("claimed", 4),
      receipt: "execute-then-replay"
    });
    const request = {
      clientKey: "fixture-reachable-replay",
      expectedAssignmentVersion: 4,
      expectedSourceVersion: 7,
      businessOccurrenceKey: "fixture-occurrence"
    };
    const first = await fixture.orchestrator.command(
      scope, actor, taskId, "property.task.start", request
    );
    const replay = await fixture.orchestrator.command(
      scope, actor, taskId, "property.task.start", request
    );
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(replay.originalResultVersion, 5);
    assert.equal(fixture.acquire()?.acquireMode, "execute-or-replay");
    assert.deepEqual(fixture.counts(), {
      receiptAccessCount: 2,
      receiptCompleteCount: 1,
      transitionCount: 1,
      terminalCount: 0,
      replaceCount: 1
    });
  });

  it("rolls back a new-client receipt before mutation when the expected version drifted", async () => {
    const fixture = runtime({
      row: projection("in_progress", 5),
      receipt: "execute"
    });
    await assert.rejects(fixture.orchestrator.command(
      scope,
      actor,
      taskId,
      "property.task.start",
      {
        clientKey: "fixture-new-key-after-success",
        expectedAssignmentVersion: 4,
        expectedSourceVersion: 7,
        businessOccurrenceKey: "fixture-occurrence"
      }
    ));
    assert.equal(fixture.acquire()?.acquireMode, "execute-or-replay");
    assert.deepEqual(fixture.counts(), {
      receiptAccessCount: 1,
      receiptCompleteCount: 0,
      transitionCount: 0,
      terminalCount: 0,
      replaceCount: 0
    });
    assert.equal(fixture.events.at(-1), "transaction:rollback");
  });

  it("uses source-detail authorization for mutation and replay response shaping", async () => {
    for (const receipt of ["execute", "replay"] as const) {
      const fixture = runtime({
        row: projection("claimed", 4),
        receipt,
        canReadSourceDetails: false
      });
      const result = await fixture.orchestrator.command(
        scope,
        actor,
        taskId,
        "property.task.start",
        {
          clientKey: `fixture-redacted-${receipt}`,
          expectedAssignmentVersion: 4,
          expectedSourceVersion: 7,
          businessOccurrenceKey: "fixture-occurrence"
        }
      );
      assert.equal("sourceId" in result.task, false, receipt);
      assert.equal("sourceDeepLink" in result.task, false, receipt);
      assert.equal("blockedReason" in result.task, false, receipt);
      assert.equal("outcome" in result.task, false, receipt);
    }
  });

  it("requires the current assignee for start and block before receipt access", async () => {
    const otherActor = { ...actor,
      sub: "77777777-7777-4777-8777-777777777777" };
    for (const [action, status] of [
      ["property.task.start", "claimed"],
      ["property.task.block", "in_progress"]
    ] as const) {
      const fixture = runtime({ row: projection(status, 4), receipt: "execute" });
      await assert.rejects(fixture.orchestrator.command(
        scope,
        otherActor,
        taskId,
        action,
        {
          clientKey: `fixture-non-assignee-${action}`,
          expectedAssignmentVersion: 4,
          expectedSourceVersion: 7,
          businessOccurrenceKey: "fixture-occurrence",
          ...(action === "property.task.block"
            ? { reason: "must reject", blockedUntil: null } : {})
        }
      ));
      assert.equal(fixture.counts().receiptAccessCount, 0, action);
      assert.equal(fixture.counts().transitionCount, 0, action);
    }
  });

  it("normalizes an authorized open-claim race loser to already-claimed", async () => {
    const winningActorId = "77777777-7777-4777-8777-777777777777";
    const fixture = runtime({
      row: projection("open", 4),
      lockedAssignmentRow: {
        ...projection("claimed", 5),
        assigneeId: winningActorId,
        assigneeDisplay: "Winning operator"
      },
      receipt: "execute"
    });
    await assert.rejects(fixture.orchestrator.command(
      scope,
      actor,
      taskId,
      "property.task.claim",
      {
        clientKey: "fixture-concurrent-claim-loser",
        expectedAssignmentVersion: 4,
        expectedSourceVersion: 7,
        businessOccurrenceKey: "fixture-occurrence"
      }
    ), (error: unknown) => {
      const exception = error as {
        getStatus(): number;
        getResponse(): unknown;
      };
      assert.equal(exception.getStatus(), 409);
      assert.deepEqual(exception.getResponse(), {
        message: "task-already-claimed",
        errorCode: "task-already-claimed",
        retryable: false,
        details: { assigneeDisplay: "Winning operator" },
        recoveryAction: "property.task.refresh"
      });
      return true;
    });
    assert.deepEqual(fixture.events, [
      "transaction:begin",
      "projection:find-task",
      "source:lock",
      "assignment:lock",
      "access:command",
      "transaction:rollback"
    ]);
    assert.deepEqual(fixture.counts(), {
      receiptAccessCount: 0,
      receiptCompleteCount: 0,
      transitionCount: 0,
      terminalCount: 0,
      replaceCount: 0
    });
  });

  it("keeps an unauthorized open-claim race loser on the not-found boundary", async () => {
    const fixture = runtime({
      row: projection("open", 4),
      lockedAssignmentRow: {
        ...projection("claimed", 5),
        assigneeId: "77777777-7777-4777-8777-777777777777",
        assigneeDisplay: "Must stay hidden"
      },
      receipt: "execute",
      authorizeCommand: false
    });
    await assert.rejects(fixture.orchestrator.command(
      scope,
      actor,
      taskId,
      "property.task.claim",
      {
        clientKey: "fixture-unauthorized-concurrent-claim-loser",
        expectedAssignmentVersion: 4,
        expectedSourceVersion: 7,
        businessOccurrenceKey: "fixture-occurrence"
      }
    ), (error: unknown) => {
      const exception = error as {
        getStatus(): number;
        getResponse(): unknown;
      };
      assert.equal(exception.getStatus(), 404);
      assert.deepEqual(exception.getResponse(), {
        message: "property-resource-not-found",
        errorCode: "property-resource-not-found",
        retryable: false,
        details: {}
      });
      return true;
    });
    assert.equal(fixture.events.includes("receipt:acquire"), false);
    assert.equal(fixture.events.includes("assignment:transition"), false);
  });

  it("keeps unauthorized absent and version-drift probes on the no-version-leak boundary", async () => {
    const request = {
      clientKey: "fixture-no-version-leak",
      expectedAssignmentVersion: 4,
      expectedSourceVersion: 7,
      businessOccurrenceKey: "fixture-occurrence"
    };
    const probes = [
      runtime({
        row: projection("claimed", 5),
        receipt: "execute",
        authorizeCommand: false
      }),
      runtime({
        row: projection("claimed", 5),
        receipt: "execute",
        authorizeCommand: false,
        missingProjection: true
      })
    ];
    const bodies: Record<string, unknown>[] = [];
    for (const fixture of probes) {
      try {
        await fixture.orchestrator.command(
          scope, actor, taskId, "property.task.start", request
        );
        assert.fail("probe unexpectedly succeeded");
      } catch (error) {
        const body = (error as { getResponse(): unknown }).getResponse() as
          Record<string, unknown>;
        assert.equal("latestVersion" in body, false);
        assert.deepEqual(body.details, {});
        bodies.push(body);
      }
      assert.equal(fixture.counts().receiptAccessCount, 0);
    }
    assert.deepEqual(bodies[0], bodies[1]);
  });

  it("returns the signed source-ineligible error before receipt or mutation", async () => {
    for (const [canReadSourceDetails, deepLink] of [
      [true, `/test_fixture_source/${sourceId}`],
      [false, null]
    ] as const) {
      const fixture = runtime({
        row: projection("claimed", 4),
        lockedAssignmentRow: {
          ...projection("closed", 5),
          assigneeId: null,
          assigneeDisplay: null
        },
        receipt: "execute",
        sourceLifecycle: "succeeded",
        canReadSourceDetails
      });
      await assert.rejects(fixture.orchestrator.command(
        scope,
        actor,
        taskId,
        "property.task.start",
        {
          clientKey: `fixture-source-ineligible-${canReadSourceDetails}`,
          expectedAssignmentVersion: 4,
          expectedSourceVersion: 7,
          businessOccurrenceKey: "fixture-occurrence"
        }
      ), (error: unknown) => {
        const exception = error as {
          getStatus(): number;
          getResponse(): unknown;
        };
        assert.equal(exception.getStatus(), 409);
        assert.deepEqual(exception.getResponse(), {
          message: "task-source-ineligible",
          errorCode: "task-source-ineligible",
          retryable: false,
          details: { deepLink },
          recoveryAction: "property.task.return-to-workspace"
        });
        return true;
      });
      assert.deepEqual(fixture.counts(), {
        receiptAccessCount: 0,
        receiptCompleteCount: 0,
        transitionCount: 0,
        terminalCount: 0,
        replaceCount: 0
      });
      assert.equal(fixture.events.includes("projection:lock-head-rows"), false);
      assert.equal(fixture.events.includes("assignment:lock"), false);
    }
  });

  it("keeps an unauthorized terminal source on the not-found boundary", async () => {
    const fixture = runtime({
      row: projection("claimed", 4),
      receipt: "execute",
      sourceLifecycle: "succeeded",
      authorizeCommand: false
    });
    await assert.rejects(fixture.orchestrator.command(
      scope,
      actor,
      taskId,
      "property.task.start",
      {
        clientKey: "fixture-unauthorized-terminal-source",
        expectedAssignmentVersion: 4,
        expectedSourceVersion: 7,
        businessOccurrenceKey: "fixture-occurrence"
      }
    ), (error: unknown) => {
      const exception = error as {
        getStatus(): number;
        getResponse(): unknown;
      };
      assert.equal(exception.getStatus(), 404);
      assert.deepEqual(exception.getResponse(), {
        message: "property-resource-not-found",
        errorCode: "property-resource-not-found",
        retryable: false,
        details: {}
      });
      return true;
    });
    assert.deepEqual(fixture.counts(), {
      receiptAccessCount: 0,
      receiptCompleteCount: 0,
      transitionCount: 0,
      terminalCount: 0,
      replaceCount: 0
    });
    assert.equal(fixture.events.includes("projection:lock-head-rows"), false);
  });

  it("runs all five commands in the signed lock/receipt/sync order", async () => {
    const cases = [
      ["property.task.claim", "open", {}],
      ["property.task.start", "claimed", {}],
      ["property.task.block", "in_progress", {
        reason: "fixture reason", blockedUntil: null
      }],
      ["property.task.unblock", "blocked", {}],
      ["property.task.release", "claimed", { reason: "fixture release" }]
    ] as const;
    for (const [action, status, extra] of cases) {
      const fixture = runtime({ row: projection(status, 4), receipt: "execute" });
      const result = await fixture.orchestrator.command(
        scope,
        actor,
        taskId,
        action,
        {
          clientKey: `fixture-${action}`,
          expectedAssignmentVersion: 4,
          expectedSourceVersion: 7,
          businessOccurrenceKey: "fixture-occurrence",
          ...extra
        }
      );
      assert.equal(result.replayed, false, action);
      assert.deepEqual(fixture.events, [
        "transaction:begin",
        "projection:find-task",
        "source:lock",
        "assignment:lock",
        "access:command",
        "projection:lock-head-rows",
        "receipt:acquire",
        "assignment:transition",
        "projection:find-source",
        "projection:hash",
        "projection:replace",
        "receipt:complete",
        "projection:find-task",
        "transaction:commit"
      ], action);
      assert.deepEqual(fixture.counts(), {
        receiptAccessCount: 1,
        receiptCompleteCount: 1,
        transitionCount: 1,
        terminalCount: 0,
        replaceCount: 1
      });
    }
  });

  it("rebases command and source-terminal authority-sync onto the locked current head",
    async () => {
      const commandInitial = projection("claimed", 4);
      const commandCurrent = {
        ...commandInitial,
        projectionVersion: 9,
        title: "Rebuilt current title"
      };
      const commandFixture = runtime({
        row: commandInitial,
        lockedRows: [commandCurrent],
        lockedProjectionVersion: 9,
        receipt: "execute"
      });
      await commandFixture.orchestrator.command(
        scope,
        actor,
        taskId,
        "property.task.start",
        {
          clientKey: "fixture-command-after-rebuild",
          expectedAssignmentVersion: 4,
          expectedSourceVersion: 7,
          businessOccurrenceKey: "fixture-occurrence"
        }
      );
      assert.deepEqual(commandFixture.isolations(), ["READ COMMITTED"]);
      assert.equal(commandFixture.replaceInput()?.expectedProjectionVersion, 9);
      assert.equal(commandFixture.replaceInput()?.rows[0]?.title, "Rebuilt current title");

      const terminalInitial = projection("in_progress", 4);
      const terminalCurrent = {
        ...terminalInitial,
        projectionVersion: 9,
        title: "Rebuilt terminal title"
      };
      const terminalFixture = runtime({
        row: terminalInitial,
        lockedRows: [terminalCurrent],
        lockedProjectionVersion: 9,
        receipt: "execute",
        sourceLifecycle: "succeeded"
      });
      await callSourceTerminal(
        terminalFixture.orchestrator,
        terminalRequest("closed", 4)
      );
      assert.deepEqual(terminalFixture.isolations(), ["READ COMMITTED"]);
      assert.equal(terminalFixture.replaceInput()?.expectedProjectionVersion, 9);
      assert.equal(terminalFixture.replaceInput()?.rows[0]?.title,
        "Rebuilt terminal title");
    });

  it("fails closed before receipt access when the locked current row drifts or is missing",
    async () => {
      const initial = projection("claimed", 4);
      const driftedRows: readonly [string, PropertyTaskProjectionRow[]][] = [
        ["missing", []],
        ["task id", [{ ...initial, taskId: sourceId }]],
        ["task key", [{ ...initial, taskKey: "f".repeat(64) }]],
        ["task kind", [{ ...initial, taskKind: "other_fixture_task" }]],
        ["source type", [{ ...initial, sourceType: "other_fixture_source" }]],
        ["source id", [{ ...initial, sourceId: taskId }]],
        ["occurrence", [{ ...initial, businessOccurrenceKey: "other-occurrence" }]],
        ["authority", [{ ...initial, assignmentAuthority: "owning",
          derivedAssignmentId: null }]],
        ["derived assignment", [{ ...initial, derivedAssignmentId: taskId }]],
        ["source snapshot", [{ ...initial, sourceVersion: 8 }]],
        ["assignment snapshot", [{ ...initial, assignmentVersion: 5 }]]
      ];
      for (const [label, rows] of driftedRows) {
        const fixture = runtime({
          row: initial,
          lockedRows: rows,
          lockedProjectionVersion: rows[0]?.projectionVersion ?? 8,
          receipt: "execute"
        });
        await assert.rejects(fixture.orchestrator.command(
          scope,
          actor,
          taskId,
          "property.task.start",
          {
            clientKey: `fixture-drift-${label}`,
            expectedAssignmentVersion: 4,
            expectedSourceVersion: 7,
            businessOccurrenceKey: "fixture-occurrence"
          }
        ), label);
        assert.deepEqual(fixture.counts(), {
          receiptAccessCount: 0,
          receiptCompleteCount: 0,
          transitionCount: 0,
          terminalCount: 0,
          replaceCount: 0
        }, label);
      }
    });

  it("fails source-terminal closed before receipt when its locked current row drifts",
    async () => {
      const initial = projection("in_progress", 4);
      for (const [label, rows] of [
        ["missing", []],
        ["identity", [{ ...initial, businessOccurrenceKey: "other-occurrence" }]],
        ["assignment", [{ ...initial, assignmentVersion: 5 }]]
      ] as const) {
        const fixture = runtime({
          row: initial,
          lockedRows: rows,
          lockedProjectionVersion: rows[0]?.projectionVersion ?? 8,
          receipt: "execute",
          sourceLifecycle: "succeeded"
        });
        await assert.rejects(callSourceTerminal(
          fixture.orchestrator,
          terminalRequest("closed", 4)
        ), label);
        assert.deepEqual(fixture.counts(), {
          receiptAccessCount: 0,
          receiptCompleteCount: 0,
          transitionCount: 0,
          terminalCount: 0,
          replaceCount: 0
        }, label);
      }
    });

  it("returns the locked current projection on completed command replay", async () => {
    const initial = projection("claimed", 4);
    const fixture = runtime({
      row: initial,
      lockedRows: [{ ...initial, projectionVersion: 9,
        title: "Rebuilt replay title" }],
      lockedProjectionVersion: 9,
      receipt: "replay"
    });
    const result = await fixture.orchestrator.command(
      scope,
      actor,
      taskId,
      "property.task.start",
      {
        clientKey: "fixture-rebased-replay",
        expectedAssignmentVersion: 4,
        expectedSourceVersion: 7,
        businessOccurrenceKey: "fixture-occurrence"
      }
    );
    assert.equal(result.task.title, "Rebuilt replay title");
    assert.deepEqual(fixture.counts(), {
      receiptAccessCount: 1,
      receiptCompleteCount: 0,
      transitionCount: 0,
      terminalCount: 0,
      replaceCount: 0
    });
  });

  it("completed command replay returns original result with zero authority sync/audit", async () => {
    const fixture = runtime({ row: projection("claimed", 4), receipt: "replay" });
    const result = await fixture.orchestrator.command(
      scope,
      actor,
      taskId,
      "property.task.start",
      {
        clientKey: "fixture-command-key",
        expectedAssignmentVersion: 4,
        expectedSourceVersion: 7,
        businessOccurrenceKey: "fixture-occurrence"
      }
    );
    assert.equal(result.replayed, true);
    assert.equal(result.originalResultVersion, 4);
    assert.deepEqual(fixture.counts(), {
      receiptAccessCount: 1,
      receiptCompleteCount: 0,
      transitionCount: 0,
      terminalCount: 0,
      replaceCount: 0
    });
    assert.equal(fixture.events.at(-1), "transaction:commit");
  });

  it("rereads owning authority after command before projection synchronization", async () => {
    const owning = {
      ...projection("claimed", 4),
      assignmentAuthority: "owning" as const,
      derivedAssignmentId: null
    };
    const fixture = runtime({
      row: owning,
      receipt: "execute",
      authority: "owning"
    });
    const result = await fixture.orchestrator.command(
      scope,
      actor,
      taskId,
      "property.task.start",
      {
        clientKey: "fixture-owning-start",
        expectedAssignmentVersion: 4,
        expectedSourceVersion: 7,
        businessOccurrenceKey: "fixture-occurrence"
      }
    );
    assert.equal(result.replayed, false);
    assert.equal(fixture.current().assignmentStatus, "in_progress");
    assert.equal(fixture.current().assignmentVersion, 5);
    assert.equal(fixture.current().sourceVersion, 8);
    assert.deepEqual(fixture.events, [
      "transaction:begin",
      "projection:find-task",
      "source:lock",
      "access:command",
      "projection:lock-head-rows",
      "receipt:acquire",
      "source:owning-command",
      "source:lock",
      "projection:find-source",
      "projection:hash",
      "projection:replace",
      "receipt:complete",
      "projection:find-task",
      "transaction:commit"
    ]);
    assert.equal(fixture.counts().transitionCount, 0);
    assert.equal(fixture.counts().replaceCount, 1);
  });

  it("same-terminal replay uses existing-only and performs zero mutation", async () => {
    for (const terminal of ["closed", "cancelled"] as const) {
      const fixture = runtime({ row: projection(terminal, 5), receipt: "replay" });
      const result = await callSourceTerminal(fixture.orchestrator,
        terminalRequest(terminal, 4)
      );
      assert.equal(result.replayed, true);
      assert.equal(fixture.acquire()?.acquireMode, "existing-only");
      assert.deepEqual(fixture.counts(), {
        receiptAccessCount: 1,
        receiptCompleteCount: 0,
        transitionCount: 0,
        terminalCount: 0,
        replaceCount: 0
      });
    }
  });

  it("runs both active source terminals with execute-or-replay and one sync", async () => {
    for (const terminal of ["closed", "cancelled"] as const) {
      const fixture = runtime({
        row: projection("in_progress", 4),
        receipt: "execute",
        sourceLifecycle: terminal === "closed" ? "succeeded" : "cancelled"
      });
      const result = await callSourceTerminal(
        fixture.orchestrator,
        terminalRequest(terminal, 4)
      );
      assert.equal(result.replayed, false);
      assert.equal(fixture.acquire()?.acquireMode, "execute-or-replay");
      assert.deepEqual(fixture.events, [
        "transaction:begin",
        "projection:find-key",
        "source:lock",
        "assignment:lock",
        "projection:lock-head-rows",
        "receipt:acquire",
        "assignment:terminal",
        "projection:find-source",
        "projection:hash",
        "projection:replace",
        "receipt:complete",
        "projection:find-task",
        "transaction:commit"
      ]);
      assert.deepEqual(fixture.counts(), {
        receiptAccessCount: 1,
        receiptCompleteCount: 1,
        transitionCount: 0,
        terminalCount: 1,
        replaceCount: 1
      });
    }
  });

  it("rejects invalid same-terminal versions before any receipt access", async () => {
    for (const expectedAssignmentVersion of [5, 3, 0, 1.5, 2147483648]) {
      const fixture = runtime({ row: projection("closed", 5), receipt: "replay" });
      await assert.rejects(callSourceTerminal(fixture.orchestrator,
        terminalRequest("closed", expectedAssignmentVersion)
      ));
      assert.deepEqual(fixture.counts(), {
        receiptAccessCount: 0,
        receiptCompleteCount: 0,
        transitionCount: 0,
        terminalCount: 0,
        replaceCount: 0
      });
      assert.equal(fixture.events.at(-1), "transaction:rollback");
    }
  });

  it("rolls back and never completes the receipt when authority sync fails", async () => {
    const fixture = runtime({
      row: projection("claimed", 4),
      receipt: "execute",
      replaceError: new Error("projection sync failed")
    });
    await assert.rejects(fixture.orchestrator.command(
      scope,
      actor,
      taskId,
      "property.task.start",
      {
        clientKey: "fixture-rollback",
        expectedAssignmentVersion: 4,
        expectedSourceVersion: 7,
        businessOccurrenceKey: "fixture-occurrence"
      }
    ));
    assert.equal(fixture.counts().receiptCompleteCount, 0);
    assert.equal(fixture.events.at(-1), "transaction:rollback");
  });

  it("returns a completed rebuild replay after re-reading current authority and head", async () => {
    const fixture = rebuildReplayRuntime();
    const request = {
      clientKey: "fixture-rebuild-completed-replay",
      sourceType: "test_fixture_source",
      sourceId,
      expectedProjectionVersion: 8,
      reason: "fixture completed rebuild replay"
    };
    const first = await fixture.orchestrator.rebuild(scope, actor, request);
    assert.equal(first.replayed, false);
    assert.equal(first.projectionVersion, 9);
    const firstAcquire = fixture.acquireInputs[0]!;
    assert.deepEqual(firstAcquire.identity, {
      tag: "property-task-source-rebuild",
      sourceType: request.sourceType,
      sourceId
    });
    assert.equal(firstAcquire.requestHash, canonicalPropertyTaskRequestHash(request));

    fixture.events.length = 0;
    const replay = await fixture.orchestrator.rebuild(scope, actor, request);
    assert.deepEqual(replay, {
      sourceType: request.sourceType,
      sourceId,
      previousProjectionVersion: 8,
      projectionVersion: 9,
      projectedTaskCount: 1,
      assignmentMutationCount: 0,
      replayed: true,
      replayedResultRef: `property-task-rebuild/${request.sourceType}/${sourceId}/v9`,
      originalResultVersion: 9
    });
    assert.deepEqual(fixture.acquireInputs[1], firstAcquire,
      "completed replay must preserve the exact identity and requestHash");
    assert.deepEqual(fixture.counts(), {
      replaceCount: 1,
      completeCount: 1,
      projectionVersion: 9
    });
    assert.deepEqual(fixture.events, [
      "transaction:begin",
      "access:rebuild",
      "registry:projectors",
      "projector:scan",
      "projector:source-lock",
      "assignment:ensure-open",
      "assignment:lock-keys",
      "projection:lock-head-rows",
      "projection:hash-authority",
      "receipt:acquire",
      "transaction:commit"
    ]);
  });

  it("rolls back a stale new-key rebuild after receipt acquire and before replacement", async () => {
    const fixture = rebuildReplayRuntime();
    const completedRequest = {
      clientKey: "fixture-rebuild-original-key",
      sourceType: "test_fixture_source",
      sourceId,
      expectedProjectionVersion: 8,
      reason: "fixture rebuild original"
    };
    await fixture.orchestrator.rebuild(scope, actor, completedRequest);
    const completedAcquire = fixture.acquireInputs[0]!;
    fixture.events.length = 0;
    const staleRequest = {
      ...completedRequest,
      clientKey: "fixture-rebuild-new-stale-key",
      reason: "fixture rebuild stale new key"
    };
    await assert.rejects(
      fixture.orchestrator.rebuild(scope, actor, staleRequest),
      (error: unknown) => {
        const response = (error as { getResponse?: () => unknown }).getResponse?.();
        return (response as { errorCode?: unknown } | undefined)?.errorCode
          === "task-version-conflict";
      }
    );
    const staleAcquire = fixture.acquireInputs[1]!;
    assert.deepEqual(staleAcquire.identity, completedAcquire.identity);
    assert.equal(staleAcquire.requestHash, canonicalPropertyTaskRequestHash(staleRequest));
    assert.notEqual(staleAcquire.requestHash, completedAcquire.requestHash,
      "a changed client key/payload must retain requestHash conflict authority");
    assert.equal(staleAcquire.clientKey, staleRequest.clientKey);
    assert.equal(staleAcquire.acquireMode, "execute-or-replay");
    assert.deepEqual(fixture.counts(), {
      replaceCount: 1,
      completeCount: 1,
      projectionVersion: 9
    });
    assert.deepEqual(fixture.events, [
      "transaction:begin",
      "access:rebuild",
      "registry:projectors",
      "projector:scan",
      "projector:source-lock",
      "assignment:ensure-open",
      "assignment:lock-keys",
      "projection:lock-head-rows",
      "projection:hash-authority",
      "receipt:acquire",
      "transaction:rollback"
    ]);
  });

  it("rebuilds only from projector authority and never rehashes existing projection rows", async () => {
    const events: string[] = [];
    const manager = { marker: "rebuild-manager" } as unknown as EntityManager;
    const sourceSnapshot = {
      sourceId,
      sourceVersion: 9,
      lifecycle: "eligible" as const,
      businessOccurrenceKey: "fixture-rebuild-occurrence",
      title: "Authoritative fresh title",
      kindLabel: "Authoritative kind",
      sourceLabel: "Authoritative source",
      priority: 20,
      dueAt: null,
      sourceDeepLink: `/test_fixture_source/${sourceId}`,
      owningAssignment: {
        status: "open" as const,
        version: 3,
        assigneeId: null,
        assigneeDisplay: null,
        claimedAt: null,
        startedAt: null,
        blockedReason: null,
        blockedUntil: null,
        outcomeCode: null,
        outcomeSourceVersion: null,
        outcomeAt: null,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T01:00:00.000Z"
      }
    };
    const projector: PropertyTaskSourceResolver & PropertyTaskProjectorSource = {
      sourceType: "test_fixture_source",
      taskKind: "test_fixture_task",
      assignmentAuthority: "owning",
      access: {
        tag: "workspace",
        sourceType: "test_fixture_source",
        requiredModules: ["test_fixture_module"],
        surfaceId: "test_fixture_surface",
        pagePermission: "test_fixture_page:read",
        queueCode: "test_fixture_queue",
        domainRoute: "/test_fixture_source",
        sourceDetailPermission: "test_fixture_source:read"
      },
      async scanCandidates(input) {
        events.push("projector:scan");
        assert.equal(input.manager.transactionContext, manager);
        return { items: [sourceSnapshot], next: null };
      },
      async lockAndResolve(input) {
        events.push("projector:source-lock");
        assert.equal(input.manager.transactionContext, manager);
        return sourceSnapshot;
      }
    };
    let replaceRows: readonly PropertyTaskProjectionWriteRow[] = [];
    let receiptAccess = 0;
    const orchestrator = new PropertyTaskOrchestrator(
      {
        async transaction(isolation: string,
          work: (value: EntityManager) => Promise<PropertyTaskRebuildResponse>) {
          assert.equal(isolation, "SERIALIZABLE");
          events.push("transaction:begin");
          const result = await work(manager);
          events.push("transaction:commit");
          return result;
        }
      } as unknown as DataSource,
      {
        async ensureOpenAssignments() {
          events.push("assignment:ensure-open");
        },
        async lockByTaskKeys() {
          events.push("assignment:lock-keys");
          return [];
        }
      } as unknown as PropertyTaskAssignmentRepository,
      {
        async lockSourceProjection() {
          events.push("projection:lock-head-rows");
          return { projectionVersion: 8, rows: [] };
        },
        async withDatabaseContentHashes(_manager: EntityManager,
          rows: readonly Omit<PropertyTaskProjectionWriteRow, "contentHash">[]) {
          events.push("projection:hash-authority");
          return rows.map((row) => ({ ...row, contentHash: "e".repeat(64) }));
        },
        async replace(_manager: EntityManager,
          input: Parameters<PropertyTaskProjectionRepository["replace"]>[1]) {
          events.push("projection:replace");
          replaceRows = input.rows;
          return { previousProjectionVersion: 8, projectionVersion: 9,
            projectedTaskCount: input.rows.length };
        },
        async findBySource() {
          throw new Error("rebuild must not source rows from existing projection");
        }
      } as unknown as PropertyTaskProjectionRepository,
      {
        projectorsForSourceType: () => {
          events.push("registry:projectors");
          return [projector];
        }
      } as unknown as PropertyTaskSourceRegistryProvider,
      {
        async authorizeTaskRead() {
          events.push("access:rebuild");
          return true;
        }
      } as unknown as PropertyTaskAccessEvaluatorService,
      new PropertyTaskMapper(),
      {
        async acquire(receiptManager) {
          events.push("receipt:acquire");
          assert.equal(receiptManager, manager);
          receiptAccess += 1;
          return { kind: "execute", receiptId:
            "66666666-6666-4666-8666-666666666666" };
        },
        async complete(receiptManager) {
          events.push("receipt:complete");
          assert.equal(receiptManager, manager);
        }
      } as PropertyMutationReceiptPort
    );
    const result = await orchestrator.rebuild(scope, actor, {
      clientKey: "fixture-rebuild",
      sourceType: "test_fixture_source",
      sourceId,
      expectedProjectionVersion: 8,
      reason: "fixture authoritative rebuild"
    });
    assert.equal(result.projectedTaskCount, 1);
    assert.equal(result.assignmentMutationCount, 0);
    assert.equal(receiptAccess, 1);
    assert.equal(replaceRows.length, 1);
    assert.equal(replaceRows[0]!.title, "Authoritative fresh title");
    assert.equal(replaceRows[0]!.sourceVersion, 9);
    assert.deepEqual(events, [
      "transaction:begin",
      "access:rebuild",
      "registry:projectors",
      "projector:scan",
      "projector:source-lock",
      "assignment:ensure-open",
      "assignment:lock-keys",
      "projection:lock-head-rows",
      "projection:hash-authority",
      "receipt:acquire",
      "projection:replace",
      "receipt:complete",
      "transaction:commit"
    ]);
  });

  it("keeps exact-empty production rebuild fail-closed with zero receipt/projection mutation", async () => {
    let receiptAccess = 0;
    let projectionMutation = 0;
    const manager = {} as EntityManager;
    const emptyDataSource = {
      transaction: async (_isolation: string,
        work: (value: EntityManager) => Promise<unknown>) => work(manager)
    } as unknown as DataSource;
    const emptyProjections = {
      replace: async () => { projectionMutation += 1; }
    } as unknown as PropertyTaskProjectionRepository;
    const emptyRegistry = {
      projectorsForSourceType: () => []
    } as unknown as PropertyTaskSourceRegistryProvider;
    const allowedAccess = {
      authorizeTaskRead: async () => true
    } as unknown as PropertyTaskAccessEvaluatorService;
    const orchestrator = new PropertyTaskOrchestrator(
      emptyDataSource,
      {} as PropertyTaskAssignmentRepository,
      emptyProjections,
      emptyRegistry,
      allowedAccess,
      new PropertyTaskMapper(),
      { acquire: async () => {
        receiptAccess += 1;
        return { kind: "execute", receiptId:
          "66666666-6666-4666-8666-666666666666" };
      }, complete: async () => undefined } as PropertyMutationReceiptPort
    );
    await assert.rejects(orchestrator.rebuild(scope, actor, {
      clientKey: "fixture-empty-rebuild",
      sourceType: "unregistered",
      sourceId,
      expectedProjectionVersion: 0,
      reason: "fixture must fail closed"
    }));
    assert.equal(receiptAccess, 0);
    assert.equal(projectionMutation, 0);
  });

  it("rejects malformed projector pages and the prospective 200-row overflow", async () => {
    const snapshot = (ordinal: number): PropertyTaskSourceSnapshot => ({
      sourceId,
      sourceVersion: 1,
      lifecycle: "eligible",
      businessOccurrenceKey: `fixture-page-${ordinal.toString().padStart(3, "0")}`,
      title: `Fixture ${ordinal}`,
      kindLabel: "Fixture",
      sourceLabel: "Fixture source",
      priority: 1,
      dueAt: null,
      sourceDeepLink: null,
      owningAssignment: {
        status: "open",
        version: 1,
        assigneeId: null,
        assigneeDisplay: null,
        claimedAt: null,
        startedAt: null,
        blockedReason: null,
        blockedUntil: null,
        outcomeCode: null,
        outcomeSourceVersion: null,
        outcomeAt: null,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      }
    });
    const scenarios = ["items-over-limit", "next-not-last", "total-over-200"] as const;
    for (const scenario of scenarios) {
      let scanCalls = 0;
      let lockCalls = 0;
      let receiptAccess = 0;
      const projector: PropertyTaskSourceResolver & PropertyTaskProjectorSource = {
        sourceType: "test_fixture_source",
        taskKind: "test_fixture_task",
        assignmentAuthority: "owning",
        access: {
          tag: "workspace",
          sourceType: "test_fixture_source",
          requiredModules: ["test_fixture_module"],
          surfaceId: "test_fixture_surface",
          pagePermission: "test_fixture_page:read",
          queueCode: "test_fixture_queue",
          domainRoute: "/test_fixture_source",
          sourceDetailPermission: "test_fixture_source:read"
        },
        async scanCandidates() {
          scanCalls += 1;
          if (scenario === "items-over-limit") {
            return { items: Array.from({ length: 201 }, (_, index) => snapshot(index)),
              next: null };
          }
          if (scenario === "next-not-last") {
            return { items: [snapshot(1)],
              next: { sourceId, businessOccurrenceKey: "fixture-page-not-last" } };
          }
          const start = scanCalls === 1 ? 0 : 150;
          const length = scanCalls === 1 ? 150 : 51;
          const items = Array.from({ length }, (_, index) => snapshot(start + index));
          return { items, next: scanCalls === 1 ? {
            sourceId,
            businessOccurrenceKey: items.at(-1)!.businessOccurrenceKey
          } : null };
        },
        async lockAndResolve(input) {
          lockCalls += 1;
          const ordinal = Number(input.businessOccurrenceKey.split("-").at(-1));
          return snapshot(ordinal);
        }
      };
      const manager = {} as EntityManager;
      const malformedDataSource = {
        transaction: async (
          _isolation: string,
          work: (value: EntityManager) => Promise<unknown>
        ) => work(manager)
      } as unknown as DataSource;
      const malformedAssignments = {
        lockByTaskKeys: async () => {
          throw new Error("assignment lock must not be reached");
        }
      } as unknown as PropertyTaskAssignmentRepository;
      const malformedProjections = {
        lockSourceProjection: async () => {
          throw new Error("projection lock must not be reached");
        }
      } as unknown as PropertyTaskProjectionRepository;
      const malformedRegistry = {
        projectorsForSourceType: () => [projector]
      } as unknown as PropertyTaskSourceRegistryProvider;
      const malformedAccess = {
        authorizeTaskRead: async () => true
      } as unknown as PropertyTaskAccessEvaluatorService;
      const orchestrator = new PropertyTaskOrchestrator(
        malformedDataSource,
        malformedAssignments,
        malformedProjections,
        malformedRegistry,
        malformedAccess,
        new PropertyTaskMapper(),
        { acquire: async () => {
          receiptAccess += 1;
          return { kind: "execute", receiptId:
            "66666666-6666-4666-8666-666666666666" };
        }, complete: async () => undefined } as PropertyMutationReceiptPort
      );
      await assert.rejects(orchestrator.rebuild(scope, actor, {
        clientKey: `fixture-${scenario}`,
        sourceType: "test_fixture_source",
        sourceId,
        expectedProjectionVersion: 0,
        reason: "fixture malformed projector page"
      }));
      assert.equal(receiptAccess, 0, scenario);
      if (scenario === "items-over-limit" || scenario === "next-not-last") {
        assert.equal(scanCalls, 1, scenario);
        assert.equal(lockCalls, 0, scenario);
      } else {
        assert.equal(scanCalls, 2, scenario);
        assert.equal(lockCalls, 150, scenario);
      }
    }
  });
});
