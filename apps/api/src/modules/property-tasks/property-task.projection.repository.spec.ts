import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityManager } from "typeorm";
import { PropertyTaskListQueryDto } from "./dto/property-task.dto";
import {
  PropertyTaskProjectionRepository,
  type PropertyTaskProjectionWriteRow
} from "./property-task.projection.repository";

const scope = { tenantId: "tenant-a", parkId: "park-a" };
const sourceId = "22222222-2222-4222-8222-222222222222";

function captureManager(result: unknown[]) {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  return {
    calls,
    manager: {
      async query(sql: string, parameters: unknown[]) {
        calls.push({ sql, parameters });
        return result;
      }
    } as unknown as EntityManager
  };
}

describe("C4 property task projection repository", () => {
  it("builds the frozen list predicate from canonical filters", async () => {
    const fixture = captureManager([]);
    const query = Object.assign(new PropertyTaskListQueryDto(), {
      assignmentStatus: "blocked" as const,
      taskKind: "test_fixture_task",
      assigneeId: "11111111-1111-4111-8111-111111111111",
      sourceType: "test_fixture_source",
      sort: "createdAt" as const
    });
    await new PropertyTaskProjectionRepository().findCandidates(
      fixture.manager,
      scope,
      query
    );

    assert.equal(fixture.calls.length, 1);
    assert.deepEqual(fixture.calls[0]!.parameters, [
      scope.tenantId,
      scope.parkId,
      query.assignmentStatus,
      query.taskKind,
      query.assigneeId,
      query.sourceType
    ]);
    for (const predicate of [
      "projection.tenant_id=$1",
      "projection.park_id=$2",
      "projection.assignment_status=$3",
      "projection.task_kind=$4",
      "projection.assignee_id=$5",
      "projection.source_type=$6"
    ]) assert.match(fixture.calls[0]!.sql, new RegExp(predicate.replace("$", "\\$")));
    assert.match(fixture.calls[0]!.sql,
      /ORDER BY projection\.created_at DESC, projection\.task_id DESC/u);
  });

  it("uses only the signed replace function and forwards its exact ABI", async () => {
    const fixture = captureManager([{
      previousProjectionVersion: 4,
      projectionVersion: 5,
      projectedTaskCount: 0
    }]);
    const input = {
      scope,
      sourceType: "test_fixture_source",
      sourceId,
      actorId: "11111111-1111-4111-8111-111111111111",
      receiptId: "33333333-3333-4333-8333-333333333333",
      replaceMode: "manual-rebuild" as const,
      commandAction: "property.task.rebuild",
      resultVersion: 5,
      expectedProjectionVersion: 4,
      requestHash: "a".repeat(64),
      resultRef: `property-task-rebuild/test_fixture_source/${sourceId}/v5`,
      resultHash: "b".repeat(64),
      reason: "test fixture rebuild",
      rows: [] as readonly PropertyTaskProjectionWriteRow[]
    };
    assert.deepEqual(await new PropertyTaskProjectionRepository().replace(
      fixture.manager,
      input
    ), {
      previousProjectionVersion: 4,
      projectionVersion: 5,
      projectedTaskCount: 0
    });

    assert.equal(fixture.calls.length, 1);
    assert.match(fixture.calls[0]!.sql,
      /FROM public\.fn_property_task_projection_replace_v1\(/u);
    assert.doesNotMatch(fixture.calls[0]!.sql,
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+biz_property_task_projection/iu);
    assert.deepEqual(fixture.calls[0]!.parameters, [
      scope.tenantId,
      scope.parkId,
      input.sourceType,
      input.sourceId,
      input.actorId,
      input.receiptId,
      input.replaceMode,
      input.commandAction,
      input.resultVersion,
      input.expectedProjectionVersion,
      input.requestHash,
      input.resultRef,
      input.resultHash,
      input.reason,
      "[]"
    ]);
  });
});
