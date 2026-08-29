import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ConflictException } from "@nestjs/common";
import type { EntityManagerPort, TenantParkScope } from "@jinhu/shared";
import { createHousingTaskResolvers } from "./housing-task.adapter";

const scope: TenantParkScope = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  parkId: "22222222-2222-4222-8222-222222222222"
};
const sourceId = "33333333-3333-4333-8333-333333333333";

function port(query: (sql: string, parameters: unknown[]) => Promise<unknown>): EntityManagerPort {
  return { transactionContext: { query } };
}

describe("housing derived property-task resolvers", () => {
  test("registers the five non-owning housing queues with exact access boundaries", () => {
    const resolvers = Object.values(createHousingTaskResolvers());
    assert.deepEqual(resolvers.map((resolver) => resolver.sourceType), [
      "housing_lease", "housing_handover", "housing_billing", "housing_purchase", "housing_repair"
    ]);
    for (const resolver of resolvers) {
      assert.equal(resolver.assignmentAuthority, "derived");
      if (resolver.access.tag !== "workspace") assert.fail("housing task must use workspace access");
      assert.deepEqual(resolver.access.requiredModules, ["asset", "housing_rental"]);
      assert.equal(resolver.access.pagePermission, "housing:tasks:page");
      assert.equal(resolver.access.domainRoute, "/housing/tasks/[taskId]");
    }
  });

  test("locks the source row and freezes version plus occurrence identity", async () => {
    const statements: string[] = [];
    const resolver = createHousingTaskResolvers().lease;
    const manager = port(async (sql) => {
      statements.push(sql);
      return [{
        id: sourceId,
        version: 4,
        lifecycle: "eligible",
        title: "租约 · H-001",
        sourceLabel: "H-001",
        priority: 60,
        dueAt: "2026-08-04T16:00:00.000Z",
        createTime: "2026-08-03T01:00:00.000Z",
        updateTime: "2026-08-03T02:00:00.000Z"
      }];
    });

    const snapshot = await resolver.lockAndResolve({
      manager,
      scope,
      sourceId,
      businessOccurrenceKey: `housing-lease:${sourceId}`,
      expectedSourceVersion: 4,
      taskKey: "a".repeat(64)
    });

    assert.equal(snapshot?.owningAssignment, null);
    assert.equal(snapshot?.sourceDeepLink, `/housing/leases/${sourceId}`);
    assert.match(statements[0] ?? "", /FOR UPDATE OF source/);
    assert.match(statements[0] ?? "", /source\.tenant_id=\$1::varchar\(64\)/);
    assert.match(statements[0] ?? "", /source\.park_id=\$2::varchar\(64\)/);
    assert.match(statements[0] ?? "", /source\.id=\$3::uuid/);
    await assert.rejects(resolver.lockAndResolve({
      manager,
      scope,
      sourceId,
      businessOccurrenceKey: `housing-lease:${sourceId}`,
      expectedSourceVersion: 3,
      taskKey: "a".repeat(64)
    }), ConflictException);
  });

  test("uses a stable UUID cursor and preserves terminal lifecycle", async () => {
    const resolver = createHousingTaskResolvers().purchase;
    let statement = "";
    const manager = port(async (sql) => {
      statement = sql;
      return [{
        id: sourceId,
        version: 8,
        lifecycle: "cancelled",
        title: "采购 · P-001",
        sourceLabel: "P-001",
        priority: 50,
        dueAt: null,
        createTime: "2026-08-03T01:00:00.000Z",
        updateTime: "2026-08-03T02:00:00.000Z"
      }];
    });

    const page = await resolver.scanCandidates({ manager, scope, after: null, limit: 1 });
    assert.equal(page.items[0]?.lifecycle, "cancelled");
    assert.deepEqual(page.next, {
      sourceId,
      businessOccurrenceKey: `housing-purchase:${sourceId}`
    });
    assert.match(statement, /LIMIT \$4::integer/);
  });

  test("projects tenant repair work orders into the shared task runtime", async () => {
    const statements: string[] = [];
    const resolver = createHousingTaskResolvers().repair;
    const manager = port(async (sql) => {
      statements.push(sql);
      return [{
        id: sourceId,
        version: 6,
        lifecycle: "eligible",
        title: "报修 · WO-001 · 水管漏水",
        sourceLabel: "WO-001 · 水管漏水",
        priority: 70,
        dueAt: "2026-08-03T01:00:00.000Z",
        createTime: "2026-08-03T01:00:00.000Z",
        updateTime: "2026-08-03T02:00:00.000Z"
      }];
    });

    const snapshot = await resolver.lockAndResolve({
      manager,
      scope,
      sourceId,
      businessOccurrenceKey: `housing-repair:${sourceId}`,
      expectedSourceVersion: 6,
      taskKey: "b".repeat(64)
    });

    if (resolver.access.tag !== "workspace") assert.fail("housing repair task must use workspace access");
    assert.equal(resolver.access.sourceDetailPermission, "housing:repair:read");
    assert.equal(resolver.taskKind, "repair");
    assert.equal(snapshot?.sourceDeepLink, `/housing/repairs/${sourceId}`);
    assert.equal(snapshot?.kindLabel, "长租报修");
    assert.match(statements[0] ?? "", /biz_work_order source/);
    assert.match(statements[0] ?? "", /source\.source_type='tenant_request'/);
    assert.match(statements[0] ?? "", /source\.create_time \+ \(\(COALESCE\(source\.sla_dispatch_min,30\)\)/);
    assert.match(statements[0] ?? "", /COALESCE\(source\.accept_time,source\.dispatch_time,source\.create_time\)/);
    assert.match(statements[0] ?? "", /COALESCE\(source\.sla_finish_min,240\)/);
    assert.match(statements[0] ?? "", /FOR UPDATE OF source/);
  });
});
