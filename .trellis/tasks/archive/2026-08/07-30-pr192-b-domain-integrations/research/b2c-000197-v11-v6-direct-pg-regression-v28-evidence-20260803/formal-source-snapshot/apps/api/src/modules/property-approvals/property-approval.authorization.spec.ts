import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import { DatabasePropertyApprovalAuthorizationAdapter } from
  "./property-approval.authorization";
import { hash } from "./property-approval.service";

const scope: TenantParkScope = { tenantId: "tenant-a", parkId: "park-a" };
const actorId = "10000000-0000-4000-8000-000000000001";
const requestId = "20000000-0000-4000-8000-000000000001";
const sourceId = "30000000-0000-4000-8000-000000000001";
const stageId = "40000000-0000-4000-8000-000000000001";

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    requiredPermissions: ["property_approval:decide"],
    eligibleActorIds: [actorId],
    auditorActorIds: [],
    incidentActorIds: [actorId],
    sourceScopes: [{ sourceType: "property-unit", sourceId }],
    ...overrides
  };
}

function authFixture(options: {
  moduleActive?: boolean;
  permissions?: string[];
  sourceId?: string;
  executionStatus?: "infra_exhausted" | "executing";
  parkAssigned?: boolean;
  actorActive?: boolean;
  policy?: Record<string, unknown>;
} = {}) {
  const policy = options.policy ?? snapshot();
  const permissions = options.permissions ?? [
    "property_approval:read",
    "property_approval:decide",
    "property:approval-incidents:page",
    "property_approval:read_incident",
    "property_approval:retry"
  ];
  const queries: string[] = [];
  const query = async (sql: string) => {
    queries.push(sql);
    if (sql.includes("FROM rel_tenant_module")) {
      return options.moduleActive === false ? [] : [{ id: "module-assignment" }];
    }
    if (sql.includes("FROM sys_user actor")) {
      return options.actorActive === false ? [] : permissions.map((code) => ({ code }));
    }
    if (sql.includes("FROM rel_user_park")) {
      return options.parkAssigned === false ? [] : [{ id: "park-assignment" }];
    }
    if (sql.includes("SELECT source_type")) {
      return [{ sourceType: "property-unit", sourceId: options.sourceId ?? sourceId }];
    }
    if (sql.includes("request.execution_status='infra_exhausted'")) {
      return options.executionStatus === "executing"
        ? []
        : [{ stageId, snapshot: policy, snapshotHash: hash(policy) }];
    }
    if (sql.includes("request.requester_id")) {
      return [{
        requestId,
        requesterId: "10000000-0000-4000-8000-000000000099",
        sourceType: "property-unit",
        sourceId,
        stageId,
        snapshot: policy,
        snapshotHash: hash(policy)
      }];
    }
    throw new Error(`unexpected query: ${sql}`);
  };
  const manager = { query };
  const adapter = new DatabasePropertyApprovalAuthorizationAdapter({
    manager
  } as never);
  return { adapter, manager, policy, queries };
}

test("database approval authorization accepts the exact positive chain", async () => {
  const { adapter, manager, policy, queries } = authFixture();
  const decision = await adapter.authorizeDecision({
    manager: manager as never,
    scope,
    actorId,
    requestId,
    actionId: "property.mode-transition.request",
    stageId,
    eligibilityPolicySnapshot: policy,
    eligibilityPolicyHash: hash(policy)
  });
  assert.deepEqual(decision.permissionSnapshot.grantedPermissions, [
    "property_approval:decide"
  ]);
  const predicate = await adapter.predicate({
    scope,
    actorId,
    permissions: ["*", "super:*"]
  });
  assert.equal(predicate.canReadAll, false);
  assert.deepEqual(predicate.eligibleApproverRequestIds, [requestId]);
  assert.deepEqual(predicate.allowedSources, [{ sourceType: "property-unit", sourceId }]);
  assert.deepEqual(
    await adapter.authorizeRetry({ manager: manager as never, scope, actorId, requestId }),
    { scopeAssignmentId: stageId }
  );
  const permissionSql = queries.find((sql) => sql.includes("FROM sys_user actor"))!;
  assert.match(permissionSql, /role\.status='enabled'/);
  assert.match(permissionSql, /permission\.status='enabled'/);
  assert.doesNotMatch(permissionSql, /\bpermission\.park_id/);
  assert.match(permissionSql, /actor\.tenant_id::text=\$1 AND actor\.park_id::text=\$2/);
  assert.match(permissionSql, /actor\.is_enabled=true AND actor\.status='enabled'/);
});

test("disabled, deleted or wrong-scope actors have no effective grants", async () => {
  for (const reason of ["disabled", "deleted", "wrong-scope"]) {
    const context = authFixture({ actorActive: false });
    await assert.rejects(context.adapter.predicate({
      scope, actorId, permissions: ["property_approval:read"]
    }), ForbiddenException, reason);
  }
});

test("identity never grants a request whose snapshot omits its exact source", async () => {
  const context = authFixture({
    policy: snapshot({ sourceScopes: [{
      sourceType: "property-unit",
      sourceId: "30000000-0000-4000-8000-000000000099"
    }] })
  });
  const predicate = await context.adapter.predicate({
    scope, actorId, permissions: ["property_approval:read"]
  });
  assert.deepEqual(predicate.requesterRequestIds, []);
  assert.deepEqual(predicate.eligibleApproverRequestIds, []);
  assert.deepEqual(predicate.auditorRequestIds, []);
  assert.deepEqual(predicate.allowedSources, []);
});

test("module missing, disabled and expired all fail closed", async () => {
  for (const reason of ["missing", "disabled", "expired"]) {
    const { adapter, manager, policy } = authFixture({ moduleActive: false });
    await assert.rejects(adapter.authorizeDecision({
      manager: manager as never,
      scope,
      actorId,
      requestId,
      actionId: "property.mode-transition.request",
      stageId,
      eligibilityPolicySnapshot: policy,
      eligibilityPolicyHash: hash(policy)
    }), ForbiddenException, reason);
  }
});

test("generic, super and wildcard grants cannot replace exact decision permission", async () => {
  for (const permissions of [
    ["property_approval:read"],
    ["super:*"],
    ["*"]
  ]) {
    const { adapter, manager, policy } = authFixture({ permissions });
    await assert.rejects(adapter.authorizeDecision({
      manager: manager as never,
      scope,
      actorId,
      requestId,
      actionId: "property.mode-transition.request",
      stageId,
      eligibilityPolicySnapshot: policy,
      eligibilityPolicyHash: hash(policy)
    }), ForbiddenException);
  }
});

test("page, incident read, retry action and assigned scope are independently mandatory", async () => {
  const exact = [
    "property:approval-incidents:page",
    "property_approval:read_incident",
    "property_approval:retry"
  ];
  for (const missing of [...exact, "assigned-scope", "current-park-assignment"]) {
    const policy = snapshot({
      incidentActorIds: missing === "assigned-scope" ? [] : [actorId]
    });
    const { adapter, manager } = authFixture({
      policy,
      permissions: exact.filter((permission) => permission !== missing),
      parkAssigned: missing !== "current-park-assignment"
    });
    await assert.rejects(
      adapter.authorizeRetry({ manager: manager as never, scope, actorId, requestId }),
      ForbiddenException
    );
  }
});

test("read and source scope fail independently and corrupt snapshots fail closed", async () => {
  const deniedRead = authFixture({ permissions: ["property_approval:decide"] });
  await assert.rejects(deniedRead.adapter.predicate({
    scope, actorId, permissions: ["*"]
  }), ForbiddenException);

  const { adapter } = authFixture();
  await assert.rejects(adapter.authorizeSource({
    scope,
    actorId,
    sourceType: "property-unit",
    sourceId: "30000000-0000-4000-8000-000000000099",
    predicate: {
      canReadAll: false,
      requesterId: actorId,
      requesterRequestIds: [requestId],
      allowedSources: [{ sourceType: "property-unit", sourceId }],
      eligibleApproverRequestIds: [requestId],
      auditorRequestIds: [],
      canAudit: false
    }
  }));
  const corrupt = authFixture({
    policy: snapshot({ requiredPermissions: ["property_approval:decide", "*"] })
  });
  await assert.rejects(corrupt.adapter.authorizeDecision({
    manager: corrupt.manager as never,
    scope,
    actorId,
    requestId,
    actionId: "property.mode-transition.request",
    stageId,
    eligibilityPolicySnapshot: corrupt.policy,
    eligibilityPolicyHash: "f".repeat(64)
  }), ForbiddenException);
});
