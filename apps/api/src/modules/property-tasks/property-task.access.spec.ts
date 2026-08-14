import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  EntityManagerPort,
  PropertyTaskSourceAccessDescriptor
} from "@jinhu/shared";
import { PropertyTaskAccessEvaluatorService } from "./property-task.access";

const scope = { tenantId: "tenant-a", parkId: "park-a" };
const actor = { actorId: "11111111-1111-4111-8111-111111111111" };
const sourceId = "22222222-2222-4222-8222-222222222222";
const descriptor: Extract<PropertyTaskSourceAccessDescriptor, { tag: "workspace" }> = {
  tag: "workspace",
  sourceType: "test_fixture_source",
  requiredModules: ["test_fixture_module"],
  surfaceId: "test_fixture_surface",
  pagePermission: "test_fixture_page:read",
  queueCode: "test_fixture_queue",
  domainRoute: "/test_fixture_source",
  sourceDetailPermission: "test_fixture_source:read"
};
const repairDescriptor: Extract<PropertyTaskSourceAccessDescriptor, { tag: "workspace" }> = {
  ...descriptor,
  sourceType: "housing_repair",
  queueCode: "housing_repair",
  sourceDetailPermission: "housing:repair:read"
};
const endpoint = {
  requiredPermissions: ["property_task:read"],
  authorizationAlternatives: []
};

function managerWithScope(options: {
  sourceAllowed: boolean;
  queueAllowed: boolean;
  grants?: readonly string[];
}) {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const manager = {
    transactionContext: null,
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      if (sql.includes("sys_permission")) {
        return (options.grants ?? [
          "property_task:read",
          "property_task:release",
          "property_task:supervise",
          descriptor.pagePermission,
          descriptor.sourceDetailPermission
        ]).map((code) => ({ code }));
      }
      if (sql.includes("rel_tenant_module")) {
        return [{ code: descriptor.requiredModules[0] }];
      }
      if (sql.includes("rel_user_park")) return [{}];
      if (sql.includes("biz_property_task_projection")) {
        return options.sourceAllowed && options.queueAllowed ? [{}] : [];
      }
      return [];
    }
  } as unknown as EntityManagerPort;
  return { manager, calls };
}

describe("C4 property task access evaluator", () => {
  it("uses current tenant/park/source/queue scope as authorization authority", async () => {
    const fixture = managerWithScope({ sourceAllowed: true, queueAllowed: true });
    const allowed = await new PropertyTaskAccessEvaluatorService().authorizeTaskRead({
      manager: fixture.manager,
      scope,
      actor,
      endpoint,
      descriptor,
      sourceId
    });

    assert.equal(allowed, true);
    const authorityCalls = fixture.calls.filter((call) =>
      call.sql.includes("biz_property_task_projection"));
    assert.equal(authorityCalls.length, 1, "source and queue scope need one authority query");
    assert.ok(authorityCalls[0]!.parameters.includes(scope.tenantId));
    assert.ok(authorityCalls[0]!.parameters.includes(scope.parkId));
    assert.ok(authorityCalls[0]!.parameters.includes(descriptor.sourceType));
    assert.ok(authorityCalls[0]!.parameters.includes(sourceId));
    assert.ok(authorityCalls[0]!.parameters.includes(descriptor.queueCode));
  });

  it("fails closed when the source or queue is outside the current scope", async () => {
    for (const options of [
      { sourceAllowed: false, queueAllowed: true },
      { sourceAllowed: true, queueAllowed: false }
    ]) {
      const fixture = managerWithScope(options);
      const evaluator = new PropertyTaskAccessEvaluatorService();
      assert.equal(await evaluator.authorizeTaskRead({
        manager: fixture.manager,
        scope,
        actor,
        endpoint,
        descriptor,
        sourceId
      }), false);
      assert.equal(await evaluator.canReadSourceDetails({
        manager: fixture.manager,
        scope,
        actor,
        descriptor,
        sourceId
      }), false);
      assert.equal(await evaluator.authorizeCommand({
        manager: fixture.manager,
        scope,
        actor,
        endpoint: {
          requiredPermissions: [],
          authorizationAlternatives: [{
            requiredPermissions: ["property_task:supervise"],
            actorPredicate: "queue-supervisor"
          }]
        },
        descriptor,
        sourceId,
        action: "property.task.release",
        relation: "queue-supervisor",
        sourceLifecycle: "eligible"
      }), false);
    }
  });

  it("evaluates both release OR branches without caller-declared supervision", async () => {
    const releaseEndpoint = {
      requiredPermissions: [],
      authorizationAlternatives: [
        {
          requiredPermissions: ["property_task:release"],
          actorPredicate: "current-assignee" as const
        },
        {
          requiredPermissions: ["property_task:supervise"],
          actorPredicate: "queue-supervisor" as const
        }
      ]
    };
    const evaluate = async (grants: readonly string[], relation: "unassigned" |
    "current-assignee") => {
      const fixture = managerWithScope({
        sourceAllowed: true,
        queueAllowed: true,
        grants: ["property_task:read", descriptor.pagePermission, ...grants]
      });
      return new PropertyTaskAccessEvaluatorService().authorizeCommand({
        manager: fixture.manager,
        scope,
        actor,
        endpoint: releaseEndpoint,
        descriptor,
        sourceId,
        action: "property.task.release",
        relation,
        sourceLifecycle: "eligible"
      });
    };

    assert.equal(await evaluate(["property_task:release"], "current-assignee"), true);
    assert.equal(await evaluate(["property_task:supervise"], "unassigned"), true);
    assert.equal(await evaluate([], "unassigned"), false);
  });

  it("applies housing repair unit and handler scope before exposing shared tasks", async () => {
    const calls: Array<{ sql: string; parameters: unknown[] }> = [];
    const manager = {
      transactionContext: null,
      async query(sql: string, parameters: unknown[]) {
        calls.push({ sql, parameters });
        if (sql.includes("sys_permission")) {
          return [
            "property_task:read",
            repairDescriptor.pagePermission,
            repairDescriptor.sourceDetailPermission
          ].map((code) => ({ code }));
        }
        if (sql.includes("rel_tenant_module")) return [{ code: repairDescriptor.requiredModules[0] }];
        if (sql.includes("rel_user_park")) return [{}];
        if (sql.includes("biz_property_task_projection")) return [{}];
        if (sql.includes("role.data_scope")) {
          return [{ code: "HOUSING_REPAIR_OPERATOR", isSuper: false, dataScope: "10" }];
        }
        if (sql.includes("biz_work_order work_order")) {
          return [{
            assigneeId: actor.actorId,
            reporterId: null,
            createBy: null,
            unitId: "unit-a"
          }];
        }
        return [];
      }
    } as unknown as EntityManagerPort;
    const dataScopeService = {
      buildScopeFilter: async () => ({
        dimension: "workorder_handler",
        unrestricted: false,
        allowed_ids: [actor.actorId],
        scope_types: ["self"]
      })
    };
    const unitAccessService = {
      allowedUnitIds: async () => ["unit-a"]
    };
    const evaluator = new PropertyTaskAccessEvaluatorService(
      dataScopeService as never,
      unitAccessService as never
    );

    assert.equal(await evaluator.authorizeTaskRead({
      manager,
      scope,
      actor,
      endpoint,
      descriptor: repairDescriptor,
      sourceId
    }), true);
    assert.ok(calls.some((call) => call.sql.includes("biz_work_order work_order")));
  });

  it("fails housing repair closed when handler or unit scope rejects the source", async () => {
    const manager = {
      transactionContext: null,
      async query(sql: string) {
        if (sql.includes("sys_permission")) {
          return [
            "property_task:read",
            repairDescriptor.pagePermission,
            repairDescriptor.sourceDetailPermission
          ].map((code) => ({ code }));
        }
        if (sql.includes("rel_tenant_module")) return [{ code: repairDescriptor.requiredModules[0] }];
        if (sql.includes("rel_user_park")) return [{}];
        if (sql.includes("biz_property_task_projection")) return [{}];
        if (sql.includes("role.data_scope")) {
          return [{ code: "HOUSING_REPAIR_OPERATOR", isSuper: false, dataScope: "10" }];
        }
        if (sql.includes("biz_work_order work_order")) {
          return [{
            assigneeId: "33333333-3333-4333-8333-333333333333",
            reporterId: null,
            createBy: null,
            unitId: "unit-outside"
          }];
        }
        return [];
      }
    } as unknown as EntityManagerPort;
    const dataScopeService = {
      buildScopeFilter: async () => ({
        dimension: "workorder_handler",
        unrestricted: false,
        allowed_ids: [actor.actorId],
        scope_types: ["self"]
      })
    };
    const unitAccessService = {
      allowedUnitIds: async () => ["unit-a"]
    };
    const evaluator = new PropertyTaskAccessEvaluatorService(
      dataScopeService as never,
      unitAccessService as never
    );

    assert.equal(await evaluator.authorizeTaskRead({
      manager,
      scope,
      actor,
      endpoint,
      descriptor: repairDescriptor,
      sourceId
    }), false);
  });

  it("preserves role fallback data scope and caches repair actor scope per transaction", async () => {
    const calls: Array<{ sql: string; parameters: unknown[] }> = [];
    const manager = {
      transactionContext: null,
      async query(sql: string, parameters: unknown[]) {
        calls.push({ sql, parameters });
        if (sql.includes("sys_permission")) {
          return [
            "property_task:read",
            "property_task:release",
            repairDescriptor.pagePermission,
            repairDescriptor.sourceDetailPermission
          ].map((code) => ({ code }));
        }
        if (sql.includes("rel_tenant_module")) return [{ code: repairDescriptor.requiredModules[0] }];
        if (sql.includes("rel_user_park")) return [{}];
        if (sql.includes("biz_property_task_projection")) return [{}];
        if (sql.includes("role.data_scope")) {
          return [{ code: "PARK_REPAIR_OPERATOR", isSuper: false, dataScope: "40" }];
        }
        if (sql.includes("biz_work_order work_order")) {
          return [{
            assigneeId: actor.actorId,
            reporterId: null,
            createBy: null,
            unitId: "unit-from-park-scope"
          }];
        }
        return [];
      }
    } as unknown as EntityManagerPort;
    let unitAccessCalls = 0;
    let handlerScopeCalls = 0;
    const observedDataScopes: string[] = [];
    const dataScopeService = {
      buildScopeFilter: async (principal: { dataScope: string }) => {
        handlerScopeCalls += 1;
        observedDataScopes.push(principal.dataScope);
        return {
          dimension: "workorder_handler",
          unrestricted: true,
          allowed_ids: [],
          scope_types: ["park"]
        };
      }
    };
    const unitAccessService = {
      allowedUnitIds: async (unusedScope: unknown, principal: { dataScope: string }) => {
        unitAccessCalls += 1;
        observedDataScopes.push(principal.dataScope);
        return null;
      }
    };
    const evaluator = new PropertyTaskAccessEvaluatorService(
      dataScopeService as never,
      unitAccessService as never
    );

    assert.equal(await evaluator.authorizeTaskRead({
      manager,
      scope,
      actor,
      endpoint,
      descriptor: repairDescriptor,
      sourceId
    }), true);
    assert.equal(await evaluator.canReadSourceDetails({
      manager,
      scope,
      actor,
      descriptor: repairDescriptor,
      sourceId
    }), true);
    assert.equal(await evaluator.authorizeCommand({
      manager,
      scope,
      actor,
      endpoint: {
        requiredPermissions: [],
        authorizationAlternatives: [{
          requiredPermissions: ["property_task:release"],
          actorPredicate: "current-assignee"
        }]
      },
      descriptor: repairDescriptor,
      sourceId,
      action: "property.task.release",
      relation: "current-assignee",
      sourceLifecycle: "eligible"
    }), true);
    assert.deepEqual([...new Set(observedDataScopes)], ["park"]);
    assert.equal(unitAccessCalls, 1);
    assert.equal(handlerScopeCalls, 1);
    assert.equal(calls.filter((call) => call.sql.includes("biz_work_order work_order")).length, 1);
  });
});
