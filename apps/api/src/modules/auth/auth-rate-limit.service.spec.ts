import assert from "node:assert/strict";
import test from "node:test";
import { HttpException, HttpStatus } from "@nestjs/common";
import { parseTrustProxySetting, resolveAuthClientIp } from "./auth-client-ip";
import { buildPasswordLoginRateLimitIdentifier } from "./auth.controller";
import { AuthRateLimitService } from "./auth-rate-limit.service";

function createService(now: () => number, config: Record<string, string> = {}) {
  const service = new AuthRateLimitService(
    {
      get: (key: string, fallback?: string) => config[key] ?? fallback
    } as never
  );
  service.setClockForTest(now);
  return service;
}

test("auth rate limiter allows requests within threshold", () => {
  let now = 1_000;
  const limiter = createService(() => now);

  assert.equal(
    limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin", limit: 2, windowMs: 1_000 }),
    undefined
  );
  assert.equal(
    limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin", limit: 2, windowMs: 1_000 }),
    undefined
  );
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

  assert.equal(
    limiter.assertAllowed({ endpoint: "refresh", ipAddress: "10.0.0.1", identifier: "admin", limit: 1, windowMs: 1_000 }),
    undefined
  );
  assert.equal(
    limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.2", identifier: "admin", limit: 1, windowMs: 1_000 }),
    undefined
  );
});

test("auth rate limiter blocks identifier rotation with an IP-only bucket", () => {
  const limiter = createService(() => 1_000, { AUTH_RATE_LIMIT_IP_BUCKETS_ENABLED: "true" });

  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin-a", ipLimit: 2, ipWindowMs: 1_000 });
  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin-b", ipLimit: 2, ipWindowMs: 1_000 });

  assert.throws(
    () => limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin-c", ipLimit: 2, ipWindowMs: 1_000 }),
    HttpException
  );
});

test("auth rate limiter leaves IP-only buckets disabled by default", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin-a", ipLimit: 2, ipWindowMs: 1_000 });
  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin-b", ipLimit: 2, ipWindowMs: 1_000 });

  assert.equal(
    limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin-c", ipLimit: 2, ipWindowMs: 1_000 }),
    undefined
  );
});

test("auth rate limiter leaves IP-only buckets disabled when configured false", () => {
  const limiter = createService(() => 1_000, { AUTH_RATE_LIMIT_IP_BUCKETS_ENABLED: "false" });

  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin-a", ipLimit: 1, ipWindowMs: 1_000 });

  assert.equal(
    limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin-b", ipLimit: 1, ipWindowMs: 1_000 }),
    undefined
  );
});

test("auth rate limiter keeps credential buckets effective under a higher IP bucket", () => {
  const limiter = createService(() => 1_000, { AUTH_RATE_LIMIT_IP_BUCKETS_ENABLED: "true" });

  limiter.assertAllowed({
    endpoint: "login",
    ipAddress: "10.0.0.1",
    identifier: "admin",
    limit: 1,
    windowMs: 1_000,
    ipLimit: 10,
    ipWindowMs: 1_000
  });

  assert.throws(
    () =>
      limiter.assertAllowed({
        endpoint: "login",
        ipAddress: "10.0.0.1",
        identifier: "admin",
        limit: 1,
        windowMs: 1_000,
        ipLimit: 10,
        ipWindowMs: 1_000
      }),
    HttpException
  );
});

test("auth rate limiter keeps credential identifiers case-sensitive", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({
    endpoint: "login",
    ipAddress: "10.0.0.1",
    identifier: "tenant-a:park-a:admin",
    limit: 1,
    windowMs: 1_000,
    ipLimit: 10,
    ipWindowMs: 1_000
  });

  assert.equal(
    limiter.assertAllowed({
      endpoint: "login",
      ipAddress: "10.0.0.1",
      identifier: "tenant-a:park-a:Admin",
      limit: 1,
      windowMs: 1_000,
      ipLimit: 10,
      ipWindowMs: 1_000
    }),
    undefined
  );
});

test("password login rate limit identifier trims username like auth login", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({
    endpoint: "login",
    ipAddress: "10.0.0.1",
    identifier: buildPasswordLoginRateLimitIdentifier({ username: "admin" }),
    limit: 1,
    windowMs: 1_000
  });

  assert.throws(
    () =>
      limiter.assertAllowed({
        endpoint: "login",
        ipAddress: "10.0.0.1",
        identifier: buildPasswordLoginRateLimitIdentifier({ username: " admin " }),
        limit: 1,
        windowMs: 1_000
      }),
    HttpException
  );
});

test("password login rate limit identifier keeps username case-sensitive after trim", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({
    endpoint: "login",
    ipAddress: "10.0.0.1",
    identifier: buildPasswordLoginRateLimitIdentifier({ username: "admin" }),
    limit: 1,
    windowMs: 1_000
  });

  assert.equal(
    limiter.assertAllowed({
      endpoint: "login",
      ipAddress: "10.0.0.1",
      identifier: buildPasswordLoginRateLimitIdentifier({ username: " Admin " }),
      limit: 1,
      windowMs: 1_000
    }),
    undefined
  );
});

test("password login rate limit identifier uses a stable sentinel for blank username", () => {
  assert.equal(buildPasswordLoginRateLimitIdentifier({ username: "   " }), "unscoped-tenant:all-parks:empty-username");
});

test("auth rate limiter still normalizes endpoint and IP key parts", () => {
  const limiter = createService(() => 1_000, { AUTH_RATE_LIMIT_IP_BUCKETS_ENABLED: "true" });

  limiter.assertAllowed({
    endpoint: "LOGIN",
    ipAddress: "LOCALHOST",
    identifier: "admin-a",
    ipLimit: 1,
    ipWindowMs: 1_000
  });

  assert.throws(
    () =>
      limiter.assertAllowed({
        endpoint: "login",
        ipAddress: "localhost",
        identifier: "admin-b",
        ipLimit: 1,
        ipWindowMs: 1_000
      }),
    HttpException
  );
});

test("auth rate limiter IP-only bucket isolates different IP addresses", () => {
  const limiter = createService(() => 1_000, { AUTH_RATE_LIMIT_IP_BUCKETS_ENABLED: "true" });

  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin-a", ipLimit: 1, ipWindowMs: 1_000 });

  assert.equal(
    limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.2", identifier: "admin-b", ipLimit: 1, ipWindowMs: 1_000 }),
    undefined
  );
});

test("auth rate limiter allows requests after window reset", () => {
  let now = 1_000;
  const limiter = createService(() => now);

  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin", limit: 1, windowMs: 1_000 });
  now = 2_001;

  assert.equal(
    limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin", limit: 1, windowMs: 1_000 }),
    undefined
  );
});

test("auth rate limiter can clear in-memory state for deterministic tests", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin", limit: 1, windowMs: 1_000 });
  limiter.clear();

  assert.equal(
    limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin", limit: 1, windowMs: 1_000 }),
    undefined
  );
});

test("auth rate limiter prunes expired buckets", () => {
  let now = 1_000;
  const limiter = createService(() => now, { AUTH_RATE_LIMIT_IP_BUCKETS_ENABLED: "true" });

  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "admin", windowMs: 1_000, ipWindowMs: 1_000 });
  assert.equal(limiter.getBucketCountForTest(), 2);

  now = 2_001;
  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.2", identifier: "next", windowMs: 1_000, ipWindowMs: 1_000 });

  assert.equal(limiter.getBucketCountForTest(), 2);
});

test("auth rate limiter fails closed for new keys when bucket map is full", () => {
  const limiter = createService(() => 1_000, { AUTH_RATE_LIMIT_MAX_BUCKETS: "2" });

  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "a", windowMs: 10_000 });
  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.2", identifier: "b", windowMs: 10_000 });

  assert.equal(limiter.getBucketCountForTest(), 2);
  assert.throws(() => limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.3", identifier: "c", windowMs: 10_000 }), HttpException);
  assert.equal(limiter.getBucketCountForTest(), 2);
});

test("auth rate limiter keeps active buckets after bucket map cap is reached", () => {
  const limiter = createService(() => 1_000, { AUTH_RATE_LIMIT_MAX_BUCKETS: "2" });

  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "a", limit: 1, windowMs: 10_000 });
  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.2", identifier: "b", limit: 1, windowMs: 10_000 });
  assert.throws(() => limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.3", identifier: "c", limit: 1, windowMs: 10_000 }), HttpException);

  assert.throws(() => limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "a", limit: 1, windowMs: 10_000 }), HttpException);
});

test("auth rate limiter frees bucket capacity after expired buckets are pruned", () => {
  let now = 1_000;
  const limiter = createService(() => now, { AUTH_RATE_LIMIT_MAX_BUCKETS: "2" });

  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "a", windowMs: 1_000 });
  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.2", identifier: "b", windowMs: 1_000 });
  now = 2_001;

  assert.equal(limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.3", identifier: "c", windowMs: 1_000 }), undefined);
  assert.equal(limiter.getBucketCountForTest(), 1);
});

test("auth rate limiter caps bucket map size when IP-only buckets are enabled", () => {
  const limiter = createService(() => 1_000, { AUTH_RATE_LIMIT_IP_BUCKETS_ENABLED: "true", AUTH_RATE_LIMIT_MAX_BUCKETS: "3" });

  limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.1", identifier: "a", windowMs: 10_000, ipWindowMs: 10_000 });
  assert.throws(() => limiter.assertAllowed({ endpoint: "login", ipAddress: "10.0.0.2", identifier: "b", windowMs: 10_000, ipWindowMs: 10_000 }), HttpException);

  assert.equal(limiter.getBucketCountForTest(), 3);
});

test("auth rate limiter separates tenant-scoped mobile code identifiers", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({
    endpoint: "mobile-send-code",
    ipAddress: "10.0.0.1",
    identifier: "tenant-a:park-a:13800000000",
    limit: 1,
    windowMs: 1_000,
    ipLimit: 10,
    ipWindowMs: 1_000
  });

  assert.equal(
    limiter.assertAllowed({
      endpoint: "mobile-send-code",
      ipAddress: "10.0.0.1",
      identifier: "tenant-b:park-a:13800000000",
      limit: 1,
      windowMs: 1_000,
      ipLimit: 10,
      ipWindowMs: 1_000
    }),
    undefined
  );
});

test("auth rate limiter separates tenant-scoped password login identifiers", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({
    endpoint: "login",
    ipAddress: "10.0.0.1",
    identifier: buildPasswordLoginRateLimitIdentifier({ tenantId: "tenant-a", parkId: "park-a", username: "admin" }),
    limit: 1,
    windowMs: 1_000,
    ipLimit: 10,
    ipWindowMs: 1_000
  });

  assert.equal(
    limiter.assertAllowed({
      endpoint: "login",
      ipAddress: "10.0.0.1",
      identifier: buildPasswordLoginRateLimitIdentifier({ tenantId: "tenant-b", parkId: "park-a", username: "admin" }),
      limit: 1,
      windowMs: 1_000,
      ipLimit: 10,
      ipWindowMs: 1_000
    }),
    undefined
  );
});

test("auth rate limiter separates different fully scoped password login identifiers", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({
    endpoint: "login",
    ipAddress: "10.0.0.1",
    identifier: buildPasswordLoginRateLimitIdentifier({ tenantId: "tenant-a", parkId: "park-a", username: "admin" }),
    limit: 1,
    windowMs: 1_000,
    ipLimit: 10,
    ipWindowMs: 1_000
  });

  assert.equal(
    limiter.assertAllowed({
      endpoint: "login",
      ipAddress: "10.0.0.1",
      identifier: buildPasswordLoginRateLimitIdentifier({ tenantId: "tenant-a", parkId: "park-b", username: "admin" }),
      limit: 1,
      windowMs: 1_000,
      ipLimit: 10,
      ipWindowMs: 1_000
    }),
    undefined
  );
});

test("auth rate limiter shares password login quota inside the same tenant park username scope", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({
    endpoint: "login",
    ipAddress: "10.0.0.1",
    identifier: buildPasswordLoginRateLimitIdentifier({ tenantId: "tenant-a", parkId: "park-a", username: "admin" }),
    limit: 1,
    windowMs: 1_000,
    ipLimit: 10,
    ipWindowMs: 1_000
  });

  assert.throws(
    () =>
      limiter.assertAllowed({
        endpoint: "login",
        ipAddress: "10.0.0.1",
        identifier: buildPasswordLoginRateLimitIdentifier({ tenantId: "tenant-a", parkId: "park-a", username: "admin" }),
        limit: 1,
        windowMs: 1_000,
        ipLimit: 10,
        ipWindowMs: 1_000
      }),
    HttpException
  );
});

test("auth rate limiter uses stable sentinels for unscoped password login identifiers", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({
    endpoint: "login",
    ipAddress: "10.0.0.1",
    identifier: buildPasswordLoginRateLimitIdentifier({ username: "admin" }),
    limit: 1,
    windowMs: 1_000,
    ipLimit: 10,
    ipWindowMs: 1_000
  });

  assert.throws(
    () =>
      limiter.assertAllowed({
        endpoint: "login",
        ipAddress: "10.0.0.1",
        identifier: buildPasswordLoginRateLimitIdentifier({ username: "admin" }),
        limit: 1,
        windowMs: 1_000,
        ipLimit: 10,
        ipWindowMs: 1_000
      }),
    HttpException
  );
});

test("auth rate limiter treats tenant-only password login as unscoped", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({
    endpoint: "login",
    ipAddress: "10.0.0.1",
    identifier: buildPasswordLoginRateLimitIdentifier({ username: "admin" }),
    limit: 1,
    windowMs: 1_000,
    ipLimit: 10,
    ipWindowMs: 1_000
  });

  assert.throws(
    () =>
      limiter.assertAllowed({
        endpoint: "login",
        ipAddress: "10.0.0.1",
        identifier: buildPasswordLoginRateLimitIdentifier({ tenantId: "tenant-a", username: "admin" }),
        limit: 1,
        windowMs: 1_000,
        ipLimit: 10,
        ipWindowMs: 1_000
      }),
    HttpException
  );
});

test("auth rate limiter treats park-only password login as unscoped", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({
    endpoint: "login",
    ipAddress: "10.0.0.1",
    identifier: buildPasswordLoginRateLimitIdentifier({ username: "admin" }),
    limit: 1,
    windowMs: 1_000,
    ipLimit: 10,
    ipWindowMs: 1_000
  });

  assert.throws(
    () =>
      limiter.assertAllowed({
        endpoint: "login",
        ipAddress: "10.0.0.1",
        identifier: buildPasswordLoginRateLimitIdentifier({ parkId: "park-a", username: "admin" }),
        limit: 1,
        windowMs: 1_000,
        ipLimit: 10,
        ipWindowMs: 1_000
      }),
    HttpException
  );
});

test("auth rate limiter separates fully scoped password login from unscoped login", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({
    endpoint: "login",
    ipAddress: "10.0.0.1",
    identifier: buildPasswordLoginRateLimitIdentifier({ username: "admin" }),
    limit: 1,
    windowMs: 1_000,
    ipLimit: 10,
    ipWindowMs: 1_000
  });

  assert.equal(
    limiter.assertAllowed({
      endpoint: "login",
      ipAddress: "10.0.0.1",
      identifier: buildPasswordLoginRateLimitIdentifier({ tenantId: "tenant-a", parkId: "park-a", username: "admin" }),
      limit: 1,
      windowMs: 1_000,
      ipLimit: 10,
      ipWindowMs: 1_000
    }),
    undefined
  );
});

test("auth rate limiter separates tenant-scoped mobile login identifiers", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({
    endpoint: "mobile-login",
    ipAddress: "10.0.0.1",
    identifier: "tenant-a:park-a:13800000000",
    limit: 1,
    windowMs: 1_000,
    ipLimit: 10,
    ipWindowMs: 1_000
  });

  assert.equal(
    limiter.assertAllowed({
      endpoint: "mobile-login",
      ipAddress: "10.0.0.1",
      identifier: "tenant-b:park-a:13800000000",
      limit: 1,
      windowMs: 1_000,
      ipLimit: 10,
      ipWindowMs: 1_000
    }),
    undefined
  );
});

test("auth rate limiter shares mobile login quota inside the same tenant park mobile scope", () => {
  const limiter = createService(() => 1_000);

  limiter.assertAllowed({
    endpoint: "mobile-login",
    ipAddress: "10.0.0.1",
    identifier: "tenant-a:park-a:13800000000",
    limit: 1,
    windowMs: 1_000,
    ipLimit: 10,
    ipWindowMs: 1_000
  });

  assert.throws(
    () =>
      limiter.assertAllowed({
        endpoint: "mobile-login",
        ipAddress: "10.0.0.1",
        identifier: "tenant-a:park-a:13800000000",
        limit: 1,
        windowMs: 1_000,
        ipLimit: 10,
        ipWindowMs: 1_000
      }),
    HttpException
  );
});

test("auth client IP uses Express resolved request.ip and does not parse spoofed forwarded headers", () => {
  const request = {
    ip: "172.18.0.4",
    headers: {
      "x-forwarded-for": "203.0.113.10, 172.18.0.3"
    }
  };

  assert.equal(resolveAuthClientIp(request as never), "172.18.0.4");
});

test("auth trust proxy parser preserves numeric hop counts", () => {
  assert.equal(parseTrustProxySetting(undefined), undefined);
  assert.equal(parseTrustProxySetting(""), undefined);
  assert.equal(parseTrustProxySetting("0"), undefined);
  assert.equal(parseTrustProxySetting("false"), undefined);
  assert.equal(parseTrustProxySetting("no"), undefined);
  assert.equal(parseTrustProxySetting("off"), undefined);
  assert.equal(parseTrustProxySetting("1"), 1);
  assert.equal(parseTrustProxySetting("2"), 2);
  assert.equal(parseTrustProxySetting("true"), true);
  assert.equal(parseTrustProxySetting("yes"), true);
  assert.equal(parseTrustProxySetting("on"), true);
  assert.equal(parseTrustProxySetting("loopback,linklocal,uniquelocal"), "loopback,linklocal,uniquelocal");
});
