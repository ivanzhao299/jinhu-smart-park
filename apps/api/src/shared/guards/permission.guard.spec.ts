import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import {
  ANY_PERMISSIONS_KEY,
  AUTHENTICATED_ONLY_KEY,
  PERMISSIONS_KEY
} from "../decorators/permissions.decorator";
import { PermissionGuard } from "./permission.guard";

function context(user?: Record<string, unknown>) {
  return {
    getHandler: () => "handler",
    getClass: () => "controller",
    switchToHttp: () => ({ getRequest: () => ({ user }) })
  };
}

describe("PermissionGuard authenticated-only endpoints", () => {
  it("allows an authenticated user without role permissions when explicitly declared", () => {
    const reflector = {
      getAllAndOverride: (key: string) => key === AUTHENTICATED_ONLY_KEY ? true : undefined
    };
    const guard = new PermissionGuard(reflector as never);
    assert.equal(guard.canActivate(context({ sub: "user-1", permissions: [], isSuper: false }) as never), true);
  });

  it("still rejects an authenticated-only endpoint when no user is present", () => {
    const reflector = {
      getAllAndOverride: (key: string) => key === AUTHENTICATED_ONLY_KEY ? true : undefined
    };
    const guard = new PermissionGuard(reflector as never);
    assert.equal(guard.canActivate(context() as never), false);
  });

  it("keeps fail-closed behavior when an endpoint declares no access contract", () => {
    const guard = new PermissionGuard({ getAllAndOverride: () => undefined } as never);
    assert.throws(() => guard.canActivate(context({ sub: "user-1", permissions: [], isSuper: false }) as never), ForbiddenException);
  });

  it("does not let the authenticated marker bypass an explicitly combined permission", () => {
    const reflector = {
      getAllAndOverride: (key: string) => key === AUTHENTICATED_ONLY_KEY ? true : key === PERMISSIONS_KEY ? ["system:admin"] : undefined
    };
    const guard = new PermissionGuard(reflector as never);
    assert.equal(guard.canActivate(context({ sub: "user-1", permissions: [], isSuper: false }) as never), false);
  });

  it("allows either any-permission while still enforcing combined required permissions", () => {
    const reflector = {
      getAllAndOverride: (key: string) => key === PERMISSIONS_KEY
        ? ["property:read"]
        : key === ANY_PERMISSIONS_KEY
          ? ["property:release", "property:force-release"]
          : undefined
    };
    const guard = new PermissionGuard(reflector as never);
    assert.equal(guard.canActivate(context({
      sub: "user-1", permissions: ["property:read", "property:release"], isSuper: false
    }) as never), true);
    assert.equal(guard.canActivate(context({
      sub: "user-1", permissions: ["property:read", "property:force-release"], isSuper: false
    }) as never), true);
    assert.equal(guard.canActivate(context({
      sub: "user-1", permissions: ["property:read"], isSuper: false
    }) as never), false);
    assert.equal(guard.canActivate(context({
      sub: "user-1", permissions: ["property:release"], isSuper: false
    }) as never), false);
  });
});
