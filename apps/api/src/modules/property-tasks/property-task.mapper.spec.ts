import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validatePropertyTaskDetailWire,
  validatePropertyTaskListItemWire
} from "@jinhu/shared";
import { PropertyTaskMapper } from "./property-task.mapper";
import type { PropertyTaskProjectionRow } from
  "./property-task.projection.repository";

const taskId = "11111111-1111-4111-8111-111111111111";
const sourceId = "22222222-2222-4222-8222-222222222222";
const row: PropertyTaskProjectionRow = {
  taskId,
  taskKey: "a".repeat(64),
  assignmentAuthority: "derived",
  derivedAssignmentId: "33333333-3333-4333-8333-333333333333",
  sourceType: "test_fixture_source",
  sourceId,
  sourceVersion: 2,
  businessOccurrenceKey: "fixture-occurrence",
  taskKind: "test_fixture_task",
  queueCode: "test_fixture_queue",
  title: "Fixture task",
  kindLabel: "Fixture",
  sourceLabel: "Fixture source",
  priority: 10,
  dueAt: null,
  assignmentStatus: "blocked",
  assignmentVersion: 3,
  assigneeId: "44444444-4444-4444-8444-444444444444",
  assigneeDisplay: "Operator",
  claimedAt: "2026-08-01T01:00:00.000Z",
  startedAt: "2026-08-01T02:00:00.000Z",
  blockedReason: "sensitive fixture reason",
  blockedUntil: "2026-08-02T02:00:00.000Z",
  outcomeCode: null,
  outcomeSourceVersion: null,
  outcomeAt: null,
  sourceDeepLink: "/test_fixture_source/22222222-2222-4222-8222-222222222222",
  projectionVersion: 4,
  contentHash: "b".repeat(64),
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T03:00:00.000Z"
};

describe("C4 property task mapper wire boundary", () => {
  it("emits the same exact list shape for owning and derived authority", () => {
    const mapper = new PropertyTaskMapper();
    for (const assignmentAuthority of ["owning", "derived"] as const) {
      const item = mapper.toListItem(
        { ...row, assignmentAuthority },
        ["property.task.unblock"],
        true
      );
      assert.deepEqual(validatePropertyTaskListItemWire(item, true), []);
      assert.equal(item.assignmentAuthority, assignmentAuthority);
      assert.deepEqual(item.allowedActions, ["property.task.unblock"]);
    }
  });

  it("does not leak blocked/source/outcome details without source-detail access", () => {
    const mapper = new PropertyTaskMapper();
    const item = mapper.toListItem(row, [], false);
    const detail = mapper.toDetail(row, [], false);
    assert.equal("blockedReason" in item, false);
    assert.equal("blockedReason" in detail, false);
    assert.equal("sourceId" in detail, false);
    assert.equal("sourceDeepLink" in detail, false);
    assert.equal("outcome" in detail, false);
    assert.deepEqual(validatePropertyTaskListItemWire(item, false), []);
    assert.deepEqual(validatePropertyTaskDetailWire(detail, false), []);
  });

  it("exposes only signed detail fields after source-detail authorization", () => {
    const detail = new PropertyTaskMapper().toDetail(row, [], true);
    assert.equal(detail.sourceId, sourceId);
    assert.equal(detail.sourceDeepLink, row.sourceDeepLink);
    assert.equal(detail.blockedReason, row.blockedReason);
    assert.deepEqual(validatePropertyTaskDetailWire(detail, true), []);
  });
});
