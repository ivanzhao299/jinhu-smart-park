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

test("audit logging suppresses cached idempotent replays", async () => {
  const recorded: Array<Record<string, unknown>> = [];
  const request = {
    method: "PATCH",
    user: {
      sub: "super-1", username: "super", tenantId: "actor-tenant", parkId: "actor-park",
      roles: [], permissions: ["*"], isSuper: true
    },
    idempotencyReplay: true,
    body: {}, params: { id: "user-1" }, headers: { "x-idempotency-key": "replay-1" },
    route: { path: "/users/:id" }, path: "/users/user-1", originalUrl: "/api/v1/users/user-1", ip: "127.0.0.1"
  } as unknown as AuditScopeRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function update() {},
    getClass: () => class UsersController {}
  } as unknown as ExecutionContext;
  const interceptor = new AuditLogInterceptor(
    { recordOperation: async (entry: Record<string, unknown>) => { recorded.push(entry); } } as never,
    { getId: () => "request-replay" } as never,
    { getAllAndOverride: () => ({ module: "用户管理", resource: "system.user", action: "修改" }) } as never
  );

  await lastValueFrom(interceptor.intercept(context, { handle: () => new Observable((subscriber) => {
    subscriber.next({ ok: true });
    subscriber.complete();
  }) } as CallHandler));

  assert.deepEqual(recorded, []);
});

test("audit logging binds a create response id when the request has no business id", async () => {
  const recorded: Array<Record<string, unknown>> = [];
  const request = {
    method: "POST",
    user: {
      sub: "operator-1", username: "operator", tenantId: "tenant-1", parkId: "park-1",
      roles: [], permissions: ["*"], isSuper: true
    },
    body: {}, params: {}, headers: {}, route: { path: "/records" }, path: "/records", originalUrl: "/api/v1/records", ip: "127.0.0.1"
  } as unknown as AuditScopeRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function createRecord() {},
    getClass: () => class RecordsController {}
  } as unknown as ExecutionContext;
  const interceptor = new AuditLogInterceptor(
    { recordOperation: async (entry: Record<string, unknown>) => { recorded.push(entry); } } as never,
    { getId: () => "request-create" } as never,
    { getAllAndOverride: () => ({ module: "测试", resource: "record", action: "创建记录", bizType: "record" }) } as never
  );

  await lastValueFrom(interceptor.intercept(context, { handle: () => new Observable((subscriber) => {
    subscriber.next({ id: "created-record-id" });
    subscriber.complete();
  }) } as CallHandler));

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0]?.bizId, "created-record-id");
});

test("audit logging waits for a successful write before completing the response", async () => {
  let releaseAudit: (() => void) | undefined;
  const request = {
    method: "POST",
    user: {
      sub: "operator-1", username: "operator", tenantId: "tenant-1", parkId: "park-1",
      roles: [], permissions: ["*"], isSuper: true
    },
    body: {}, params: {}, headers: {}, route: { path: "/records" }, path: "/records", originalUrl: "/api/v1/records", ip: "127.0.0.1"
  } as unknown as AuditScopeRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function createRecord() {},
    getClass: () => class RecordsController {}
  } as unknown as ExecutionContext;
  const interceptor = new AuditLogInterceptor(
    { recordOperation: () => new Promise<void>((resolve) => { releaseAudit = resolve; }) } as never,
    { getId: () => "request-await-audit" } as never,
    { getAllAndOverride: () => ({ module: "测试", resource: "record", action: "创建记录", bizType: "record" }) } as never
  );
  let completed = false;
  const result = lastValueFrom(interceptor.intercept(context, { handle: () => new Observable((subscriber) => {
    subscriber.next({ id: "created-record-id" });
    subscriber.complete();
  }) } as CallHandler)).then(() => { completed = true; });

  await Promise.resolve();
  assert.equal(completed, false);
  releaseAudit?.();
  await result;
  assert.equal(completed, true);
});
