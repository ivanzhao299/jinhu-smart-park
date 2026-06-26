import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { EngineeringDataScopeAdapter } from "./policies/engineering-data-scope.adapter";

class FakeQueryBuilder {
  public clauses: string[] = [];
  public params: Array<Record<string, unknown> | undefined> = [];

  andWhere(clause: string, params?: Record<string, unknown>): this {
    this.clauses.push(clause);
    this.params.push(params);
    return this;
  }
}

function makeScope(): TenantParkScope {
  return { tenantId: "tenant-1", parkId: "park-1" };
}

function makeActor(dataScope: string, permissions: string[] = ["ENGINEERING_PROJECT_VIEW"]): JwtPrincipal {
  return {
    sub: "user-1",
    username: "engineer",
    tenantId: "tenant-1",
    parkId: "park-1",
    roles: ["ENGINEER"],
    permissions,
    dataScope
  };
}

function makeAdapter(calls: unknown[] = []) {
  return new EngineeringDataScopeAdapter({
    applyToQueryBuilder: async (...args: unknown[]) => {
      calls.push(args);
      const [builder] = args as [FakeQueryBuilder];
      builder.andWhere("delegated_scope = true");
      return builder;
    }
  } as never);
}

describe("EngineeringDataScopeAdapter", () => {
  it("skips filtering for super users and wildcard permissions", async () => {
    const adapter = makeAdapter();
    const superBuilder = new FakeQueryBuilder();
    await adapter.applyProjectScope(superBuilder as never, makeScope(), { ...makeActor("self"), isSuper: true });
    assert.deepEqual(superBuilder.clauses, []);

    const wildcardBuilder = new FakeQueryBuilder();
    await adapter.applyProjectScope(wildcardBuilder as never, makeScope(), makeActor("self", ["*"]));
    assert.deepEqual(wildcardBuilder.clauses, []);
  });

  it("applies project self scope to manager, director and creator", async () => {
    const adapter = makeAdapter();
    const builder = new FakeQueryBuilder();

    await adapter.applyProjectScope(builder as never, makeScope(), makeActor("self"));

    assert.equal(builder.clauses[0], "(project.project_manager_id = :actorUserId OR project.engineering_director_id = :actorUserId OR project.create_by = :actorUserId)");
    assert.deepEqual(builder.params[0], { actorUserId: "user-1" });
  });

  it("applies plan self scope to owner and creator", async () => {
    const adapter = makeAdapter();
    const builder = new FakeQueryBuilder();

    await adapter.applyPlanScope(builder as never, makeScope(), makeActor("self"));

    assert.equal(builder.clauses[0], "(plan.owner_user_id = :actorUserId OR plan.create_by = :actorUserId)");
    assert.deepEqual(builder.params[0], { actorUserId: "user-1" });
  });

  it("applies responsibility self scopes for reports, inspections, issues, rectifications and acceptances", async () => {
    const adapter = makeAdapter();
    const actor = makeActor("self");
    const checks: Array<[string, (builder: FakeQueryBuilder) => Promise<void>]> = [
      ["report.create_by = :actorUserId OR report.submitted_by = :actorUserId", (builder) => adapter.applyDailyReportScope(builder as never, makeScope(), actor)],
      ["inspection.inspector_user_id = :actorUserId OR inspection.create_by = :actorUserId", (builder) => adapter.applyInspectionScope(builder as never, makeScope(), actor)],
      ["issue.responsible_user_id = :actorUserId OR issue.create_by = :actorUserId", (builder) => adapter.applyIssueScope(builder as never, makeScope(), actor)],
      ["rectification.responsible_user_id = :actorUserId OR rectification.create_by = :actorUserId", (builder) => adapter.applyRectificationScope(builder as never, makeScope(), actor)],
      ["acceptance.responsible_user_id = :actorUserId OR acceptance.create_by = :actorUserId", (builder) => adapter.applyAcceptanceScope(builder as never, makeScope(), actor)]
    ];

    for (const [expected, apply] of checks) {
      const builder = new FakeQueryBuilder();
      await apply(builder);
      assert.equal(builder.clauses[0], `(${expected})`);
      assert.deepEqual(builder.params[0], { actorUserId: "user-1" });
    }
  });

  it("delegates org scope to the platform DataScope service with EPDR aliases", async () => {
    const calls: unknown[] = [];
    const adapter = makeAdapter(calls);

    await adapter.applyProjectScope(new FakeQueryBuilder() as never, makeScope(), makeActor("org"));
    await adapter.applyPlanScope(new FakeQueryBuilder() as never, makeScope(), makeActor("org"));
    await adapter.applyDailyReportScope(new FakeQueryBuilder() as never, makeScope(), makeActor("org"));
    await adapter.applyInspectionScope(new FakeQueryBuilder() as never, makeScope(), makeActor("org"));
    await adapter.applyIssueScope(new FakeQueryBuilder() as never, makeScope(), makeActor("org"));
    await adapter.applyRectificationScope(new FakeQueryBuilder() as never, makeScope(), makeActor("org"));
    await adapter.applyAcceptanceScope(new FakeQueryBuilder() as never, makeScope(), makeActor("org"));

    assert.deepEqual(
      calls.map((call) => (call as unknown[]).slice(3, 6)),
      [
        ["org", "project", { org: "org_id" }],
        ["org", "plan", { org: "owner_org_id" }],
        ["org", "report", { org: "org_id" }],
        ["org", "inspection", { org: "org_id" }],
        ["org", "issue", { org: "org_id" }],
        ["org", "rectification", { org: "org_id" }],
        ["org", "acceptance", { org: "org_id" }]
      ]
    );
  });
});
