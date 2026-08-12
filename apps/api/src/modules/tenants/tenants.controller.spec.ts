import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { INTERCEPTORS_METADATA } from "@nestjs/common/constants";
import { firstValueFrom, from } from "rxjs";
import { getIdempotencyService, setIdempotencyService } from "../../shared/services/idempotency.service";
import { TenantsController } from "./tenants.controller";

test("tenant login settings updates provide idempotent replay semantics", () => {
  const interceptors = (
    Reflect.getMetadata(INTERCEPTORS_METADATA, TenantsController.prototype.updateLoginSettings) ?? []
  ) as Array<{ constructor?: { name?: string } }>;

  assert.equal(
    interceptors.some((interceptor) => interceptor.constructor?.name === "IdempotencyInterceptor"),
    true
  );
});

test("tenant login settings replays a completed write without executing the service transaction twice", async (context) => {
  let updateCalls = 0;
  const result = { tenant: { id: "tenant-db-id", planCode: "BASIC" }, enabledModuleCodes: ["system", "asset"] };
  const tenantsService = {
    async updateLoginSettings() {
      updateCalls += 1;
      return result;
    }
  };
  const controller = new TenantsController(tenantsService as never);
  const interceptor = (
    Reflect.getMetadata(INTERCEPTORS_METADATA, TenantsController.prototype.updateLoginSettings) as Array<{
      intercept: (context: unknown, next: unknown) => unknown;
    }>
  )[0]!;
  let cachedFingerprint: string | null = null;
  let cachedResponse: unknown;
  const idempotencyService = {
    buildFingerprint(input: unknown) {
      return JSON.stringify(input);
    },
    async tryBegin(input: { requestFingerprint: string }) {
      if (cachedFingerprint === null) {
        cachedFingerprint = input.requestFingerprint;
        return { outcome: "began", request: { id: "request-1" } };
      }
      if (cachedFingerprint !== input.requestFingerprint) {
        return { outcome: "conflict", request: { id: "request-1" }, reason: "fingerprint_mismatch" };
      }
      return {
        outcome: "cached",
        request: { id: "request-1" },
        cachedResponse: { responseStatus: 200, responseBody: cachedResponse }
      };
    },
    async markSucceeded(_id: string, _status: number, body: unknown) {
      cachedResponse = body;
    },
    async markFailed() {}
  };
  let previousIdempotencyService: ReturnType<typeof getIdempotencyService> | null = null;
  try {
    previousIdempotencyService = getIdempotencyService();
  } catch {
    previousIdempotencyService = null;
  }
  setIdempotencyService(idempotencyService as never);
  context.after(() => setIdempotencyService(previousIdempotencyService));

  const user = { sub: "super-1", tenantId: "10000001", parkId: "20000001", isSuper: true };
  const scope = { tenantId: user.tenantId, parkId: user.parkId };
  const createContext = (body: unknown) => {
    const response = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      }
    };
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method: "PATCH",
          path: "/tenants/tenant-db-id/login-settings",
          query: {},
          body,
          headers: { "x-idempotency-key": "tenant-login-settings-update-test" },
          user
        }),
        getResponse: () => response
      })
    };
  };
  const execute = (body: { planCode: string }) =>
    firstValueFrom(
      interceptor.intercept(createContext(body), {
        handle: () => from(controller.updateLoginSettings(scope, user as never, "tenant-db-id", body))
      }) as never
    );

  assert.deepEqual(await execute({ planCode: "BASIC" }), result);
  assert.deepEqual(await execute({ planCode: "BASIC" }), result);
  assert.equal(updateCalls, 1);
  await assert.rejects(() => execute({ planCode: "PROFESSIONAL" }), ConflictException);
  assert.equal(updateCalls, 1);
});
