import assert from "node:assert/strict";
import test from "node:test";
import { HttpException, HttpStatus } from "@nestjs/common";
import { AuthRateLimitService } from "./auth-rate-limit.service";

function createService(now: () => number) {
  const service = new AuthRateLimitService(
    {
      get: (_key: string, fallback?: string) => fallback
    } as never
  );
  service.setClockForTest(now);
  return service;
}

test("auth rate limiter allows requests within threshold", () => {
  let now = 1_000;
  const limiter = createService(() => now);

  assert.equal(limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin", limit: 2, windowMs: 1_000 }), undefined);
  assert.equal(limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin", limit: 2, windowMs: 1_000 }), undefined);
  now += 1;
});

test("auth rate limiter rejects requests over threshold with HTTP 429", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin", limit: 1, windowMs: 1_000 });

  assert.throws(() => {
    try {
      limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin", limit: 1, windowMs: 1_000 });
    } catch (error) {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), HttpStatus.TOO_MANY_REQUESTS);
      throw error;
    }
  }, HttpException);
});

test("auth rate limiter isolates different endpoints and IP addresses", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin", limit: 1, windowMs: 1_000 });

  assert.equal(limiter.assertAllowed({ endpoint: "refresh", ipAddress: "10.0.0.1", identifier: "admin", limit: 1, windowMs: 1_000 }), undefined);
  assert.equal(limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.2", identifier: "admin", limit: 1, windowMs: 1_000 }), undefined);
});

test("auth rate limiter allows requests after window reset", () => {
  let now = 1_000;
  const limiter = createService(() => now);

  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin", limit: 1, windowMs: 1_000 });
  now = 2_001;

  assert.equal(limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin", limit: 1, windowMs: 1_000 }), undefined);
});

test("auth rate limiter can clear in-memory state for deterministic tests", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin", limit: 1, windowMs: 1_000 });
  limiter.clear();

  assert.equal(limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin", limit: 1, windowMs: 1_000 }), undefined);
});
