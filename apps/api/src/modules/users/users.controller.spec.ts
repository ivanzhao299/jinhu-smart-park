import assert from "node:assert/strict";
import test from "node:test";
import { INTERCEPTORS_METADATA } from "@nestjs/common/constants";
import type { AuditScopeRequest } from "../../shared/interceptors/audit-log.interceptor";
import { UsersController } from "./users.controller";

const scope = { tenantId: "actor-tenant", parkId: "actor-park" };
const actor = {
  sub: "super-1",
  username: "super",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: ["*"],
  isSuper: true
};

test("assignment-bearing user updates propagate the resolved target audit scope", async () => {
  const request = {} as AuditScopeRequest;
  const service = {
    update: async (
      _scope: unknown,
      _actor: unknown,
      _id: string,
      _dto: unknown,
      onTargetScope: (targetScope: { tenantId: string; parkId: string }) => void
    ) => {
      onTargetScope({ tenantId: "target-tenant", parkId: "target-park" });
      return { id: "user-1" };
    }
  };
  const controller = new UsersController(service as never);

  await controller.update(scope, actor, "user-1", { assignments: [] }, request);

  assert.deepEqual(request.auditScopeOverride, { tenantId: "target-tenant", parkId: "target-park" });
});

test("user updates provide idempotent replay semantics", () => {
  const interceptors = (Reflect.getMetadata(INTERCEPTORS_METADATA, UsersController.prototype.update) ?? []) as Array<{
    constructor?: { name?: string };
  }>;

  assert.equal(interceptors.some((interceptor) => interceptor.constructor?.name === "IdempotencyInterceptor"), true);
});
