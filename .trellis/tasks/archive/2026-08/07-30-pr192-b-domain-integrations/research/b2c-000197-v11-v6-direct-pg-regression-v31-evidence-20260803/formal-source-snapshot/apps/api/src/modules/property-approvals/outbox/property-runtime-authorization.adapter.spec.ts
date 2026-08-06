import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import type { DataSource, EntityManager } from "typeorm";
import { DatabasePropertyRuntimeAuthorizationAdapter } from
  "./property-runtime-authorization.adapter";

const scope = { tenantId: "tenant-a", parkId: "park-a" };
const actorId = "10000000-0000-4000-8000-000000000001";
const resourceId = "20000000-0000-4000-8000-000000000001";
const actor = {
  sub: actorId,
  username: "operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: ["*"],
  isSuper: true
};

type FixtureOptions = {
  module?: boolean;
  permissions?: string[];
  parkAssignment?: boolean;
  eventResource?: boolean;
  approvalAssignment?: boolean;
  notificationRecipient?: boolean;
};

const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
};
const hash = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");

function fixture(options: FixtureOptions = {}) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const snapshot = {
    requiredPermissions: ["property_approval:retry"],
    eligibleActorIds: [],
    auditorActorIds: [],
    incidentActorIds: options.approvalAssignment === false ? [] : [actorId],
    sourceScopes: []
  };
  const manager = {
    query: async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (sql.includes("FROM rel_tenant_module")) {
        return options.module === false ? [] : [{ id: "module-assignment" }];
      }
      if (sql.includes("FROM sys_user actor")) {
        return (options.permissions ?? []).map((code) => ({ code }));
      }
      if (sql.includes("FROM rel_user_park")) {
        return options.parkAssignment === false ? [] : [{ id: "park-assignment" }];
      }
      if (sql.includes("FROM biz_property_event_dlq")) {
        return options.eventResource === false ? [] : [{ id: resourceId }];
      }
      if (sql.includes("FROM biz_property_approval_request request")) {
        return [{ requestId: resourceId, snapshot, snapshotHash: hash(snapshot) }];
      }
      if (sql.includes("FROM rel_property_notification_recipient")) {
        return options.notificationRecipient === false ? [] : [{ id: "recipient" }];
      }
      throw new Error(`unexpected query: ${sql}`);
    }
  } as unknown as EntityManager;
  const dataSource = {
    transaction: async (run: (value: EntityManager) => Promise<unknown>) => run(manager)
  } as unknown as DataSource;
  return {
    adapter: new DatabasePropertyRuntimeAuthorizationAdapter(dataSource),
    manager,
    statements
  };
}

describe("DatabasePropertyRuntimeAuthorizationAdapter", () => {
  it("accepts the exact event replay chain and uses the caller manager", async () => {
    const exact = [
      "property:event-delivery-incidents:page",
      "property_event:read_incident",
      "property_event:replay"
    ];
    const { adapter, manager, statements } = fixture({ permissions: exact });
    assert.deepEqual(await adapter.authorize({
      manager,
      scope,
      actor,
      surface: "event-delivery",
      operation: "replay",
      resourceId
    }), { allowedActions: ["property.event.replay"] });
    assert.ok(statements.every(({ params }) =>
      !params.length || params[0] === scope.tenantId));
    const permissionSql = statements.find(({ sql }) =>
      sql.includes("FROM sys_user actor"))?.sql ?? "";
    assert.doesNotMatch(permissionSql, /\n\s+AND permission\.park_id=/);
    assert.match(permissionSql, /permission\.tenant_id=role_permission\.tenant_id/);
    assert.match(permissionSql, /actor\.status='enabled'/);
    assert.match(permissionSql, /role\.status='enabled'/);
    assert.match(permissionSql, /permission\.status='enabled'/);
  });

  it("fails each module, permission and assigned-scope dimension independently", async () => {
    const exact = [
      "property:event-delivery-incidents:page",
      "property_event:read_incident",
      "property_event:replay"
    ];
    const cases: FixtureOptions[] = [
      { module: false, permissions: exact },
      { permissions: exact.filter((code) => code !== exact[0]) },
      { permissions: exact.filter((code) => code !== exact[1]) },
      { permissions: exact.filter((code) => code !== exact[2]) },
      { permissions: exact, parkAssignment: false },
      { permissions: exact, eventResource: false }
    ];
    for (const options of cases) {
      const { adapter, manager } = fixture(options);
      await assert.rejects(adapter.authorize({
        manager,
        scope,
        actor,
        surface: "event-delivery",
        operation: "replay",
        resourceId
      }), ForbiddenException);
    }
  });

  it("rejects missing, disabled and expired module assignments with the full predicate", async () => {
    const permissions = [
      "property:event-delivery-incidents:page",
      "property_event:read_incident"
    ];
    for (const reason of ["missing", "disabled", "expired"]) {
      const { adapter, statements } = fixture({ module: false, permissions });
      await assert.rejects(adapter.authorize({
        scope,
        actor,
        surface: "event-delivery",
        operation: "read"
      }), ForbiddenException, reason);
      const sql = statements[0]?.sql ?? "";
      assert.match(sql, /module\.status=1 AND module\.is_deleted=false/);
      assert.match(sql, /assignment\.enabled=true AND assignment\.status='enabled'/);
      assert.match(sql, /assignment\.start_time IS NULL OR assignment\.start_time<=clock_timestamp\(\)/);
      assert.match(sql, /assignment\.expire_time IS NULL OR assignment\.expire_time>clock_timestamp\(\)/);
    }
  });

  it("does not let generic, super or wildcard grants replace exact grants", async () => {
    for (const permissions of [
      ["property_event:read"],
      ["event:manage"],
      ["super:*"],
      ["*"]
    ]) {
      const { adapter, manager } = fixture({ permissions });
      await assert.rejects(adapter.authorize({
        manager,
        scope,
        actor: { ...actor, permissions, isSuper: true },
        surface: "event-delivery",
        operation: "replay",
        resourceId
      }), ForbiddenException);
    }
  });

  it("requires infra-exhausted approval assignment snapshot and exact grants", async () => {
    const permissions = [
      "property:approval-incidents:page",
      "property_approval:read_incident",
      "property_approval:retry"
    ];
    const accepted = fixture({ permissions });
    assert.deepEqual(await accepted.adapter.authorize({
      manager: accepted.manager,
      scope,
      actor,
      surface: "approval",
      operation: "retry",
      resourceId
    }), {
      allowedActions: ["property.approval.incident-retry"],
      assignedResourceIds: [resourceId]
    });
    const denied = fixture({ permissions, approvalAssignment: false });
    await assert.rejects(denied.adapter.authorize({
      manager: denied.manager,
      scope,
      actor,
      surface: "approval",
      operation: "retry",
      resourceId
    }), ForbiddenException);
  });

  it("requires exact notification recipient scope and mutation manager", async () => {
    const permissions = [
      "property:notifications:page",
      "property_notification:mark_read"
    ];
    const accepted = fixture({ permissions });
    assert.deepEqual(await accepted.adapter.authorize({
      manager: accepted.manager,
      scope,
      actor,
      operation: "mark-read",
      notificationId: resourceId
    }), { canMarkRead: true });
    const denied = fixture({ permissions, notificationRecipient: false });
    await assert.rejects(denied.adapter.authorize({
      manager: denied.manager,
      scope,
      actor,
      operation: "mark-read",
      notificationId: resourceId
    }), ForbiddenException);
    await assert.rejects(accepted.adapter.authorize({
      scope,
      actor,
      operation: "mark-read",
      notificationId: resourceId
    }), ForbiddenException);
    for (const generic of [["property_notification:read"], ["super:*"], ["*"]]) {
      const broad = fixture({ permissions: generic });
      await assert.rejects(broad.adapter.authorize({
        manager: broad.manager,
        scope,
        actor: { ...actor, permissions: generic, isSuper: true },
        operation: "mark-read",
        notificationId: resourceId
      }), ForbiddenException);
    }
  });

  it("rejects cross-tenant and cross-park actor claims before database access", async () => {
    const { adapter, statements } = fixture({
      permissions: ["property:notifications:page", "property_notification:read"]
    });
    await assert.rejects(adapter.authorize({
      scope,
      actor: { ...actor, tenantId: "tenant-b" },
      operation: "read"
    }), ForbiddenException);
    await assert.rejects(adapter.authorize({
      scope,
      actor: { ...actor, parkId: "park-b" },
      operation: "read"
    }), ForbiddenException);
    assert.equal(statements.length, 0);
  });
});
