import assert from "node:assert/strict";
import test from "node:test";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { lastValueFrom, Observable } from "rxjs";
import { AuditLogInterceptor, type AuditScopeRequest } from "./audit-log.interceptor";

test("audit logging uses a target scope supplied by the request handler", async () => {
  const recorded: Array<Record<string, unknown>> = [];
  const request = {
    method: "POST",
    user: {
      sub: "super-1",
      username: "super",
      tenantId: "actor-tenant",
      parkId: "actor-park",
      roles: [],
      permissions: ["*"],
      isSuper: true
    },
    body: {},
    params: { id: "user-1" },
    headers: {},
    route: { path: "/users/:id/orgs" },
    path: "/users/user-1/orgs",
    originalUrl: "/api/v1/users/user-1/orgs",
    ip: "127.0.0.1"
  } as unknown as AuditScopeRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function replaceOrgs() {},
    getClass: () => class UsersController {}
  } as unknown as ExecutionContext;
  const interceptor = new AuditLogInterceptor(
    { recordOperation: async (entry: Record<string, unknown>) => { recorded.push(entry); } } as never,
    { getId: () => "request-1" } as never,
    { getAllAndOverride: () => ({ module: "用户管理", resource: "system.user_org", action: "组织岗位变更" }) } as never
  );
  const next = {
    handle: () => new Observable((subscriber) => {
      request.auditScopeOverride = { tenantId: "target-tenant", parkId: "target-park" };
      subscriber.next({ ok: true });
      subscriber.complete();
    })
  } as CallHandler;

  await lastValueFrom(interceptor.intercept(context, next));

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0]?.tenantId, "target-tenant");
  assert.equal(recorded[0]?.parkId, "target-park");
  assert.equal(recorded[0]?.userId, "super-1");
  assert.equal(recorded[0]?.success, true);
});
