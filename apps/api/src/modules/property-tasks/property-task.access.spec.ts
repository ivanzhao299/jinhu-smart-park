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
});
