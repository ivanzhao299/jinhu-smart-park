import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { firstValueFrom, of, throwError } from "rxjs";
import { IdempotencyInterceptor } from "./idempotency.interceptor";
import { setIdempotencyService } from "../services/idempotency.service";

class FakeIdempotencyService {
  public readonly beginCalls: Array<unknown> = [];
  public readonly successCalls: Array<unknown> = [];
  public readonly failureCalls: Array<unknown> = [];
  public beginResult: unknown;
  public buildFingerprintResult = "fingerprint";

  buildFingerprint(): string {
    return this.buildFingerprintResult;
  }

  async tryBegin(input: unknown): Promise<unknown> {
    this.beginCalls.push(input);
    return this.beginResult;
  }

  async markSucceeded(id: string, status: number, body: unknown): Promise<void> {
    this.successCalls.push({ id, status, body });
  }

  async markFailed(id: string, errorCode: string): Promise<void> {
    this.failureCalls.push({ id, errorCode });
  }
}

function createContext(overrides: Partial<{ statusCode: number; user: unknown; headers: Record<string, string> }> = {}) {
  const request = {
    method: "POST",
    path: "/work-orders",
    query: { a: "1" },
    body: { title: "foo" },
    headers: { "x-idempotency-key": "idem-key-1", ...(overrides.headers ?? {}) },
    user: {
      sub: "user-1",
      tenantId: "10000001",
      parkId: "20000001"
    },
    ...(overrides.user ? { user: overrides.user } : {})
  };
  const response = {
    statusCode: overrides.statusCode ?? 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    }
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response
    })
  };
  return { request, response, context };
}

test("interceptor replays cached succeeded response", async () => {
  const service = new FakeIdempotencyService();
  setIdempotencyService(service as never);
  service.beginResult = {
    outcome: "cached",
    request: { id: "id-1" },
    cachedResponse: {
      responseStatus: 201,
      responseBody: { ok: true }
    }
  };
  const interceptor = new IdempotencyInterceptor();
  const { context, response } = createContext();

  const result = await firstValueFrom(
    interceptor.intercept(context as never, {
      handle: () => of({ shouldNotReach: true })
    })
  );

  assert.equal(response.statusCode, 201);
  assert.deepEqual(result, { ok: true });
});

test("interceptor returns conflict while request is processing", async () => {
  const service = new FakeIdempotencyService();
  setIdempotencyService(service as never);
  service.beginResult = {
    outcome: "processing",
    request: { id: "id-1" },
    reason: "processing"
  };
  const interceptor = new IdempotencyInterceptor();
  const { context } = createContext();

  await assert.rejects(
    () =>
      firstValueFrom(
        interceptor.intercept(context as never, {
          handle: () => of({ shouldNotReach: true })
        })
      ),
    ConflictException
  );
});

test("interceptor marks success and failure around handler execution", async () => {
  const service = new FakeIdempotencyService();
  setIdempotencyService(service as never);
  service.beginResult = {
    outcome: "began",
    request: { id: "id-1" }
  };
  const interceptor = new IdempotencyInterceptor();
  const { context, response } = createContext({ statusCode: 201 });

  const okResult = await firstValueFrom(
    interceptor.intercept(context as never, {
      handle: () => of({ created: true })
    })
  );

  assert.deepEqual(okResult, { created: true });
  assert.deepEqual(service.successCalls, [{ id: "id-1", status: 201, body: { created: true } }]);
  assert.equal(response.statusCode, 201);

  service.beginResult = {
    outcome: "began",
    request: { id: "id-2" }
  };

  await assert.rejects(
    () =>
      firstValueFrom(
        interceptor.intercept(context as never, {
          handle: () => throwError(() => new Error("boom"))
        })
      ),
    /boom/
  );

  assert.deepEqual(service.failureCalls, [{ id: "id-2", errorCode: "Error" }]);
});
