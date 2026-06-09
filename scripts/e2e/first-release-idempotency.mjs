import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001/api/v1";
const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "Jinhu@123456";
const idempotencyKeyPrefix = process.env.IDEMPOTENCY_KEY_PREFIX ?? "first-release-regression";
const testRunId = process.env.TEST_RUN_ID ?? new Date().toISOString().replace(/[-:.]/g, "");

function info(message) {
  console.log(`[INFO] ${message}`);
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function summarizeBody(body) {
  if (body === null || body === undefined) return "<empty>";
  if (typeof body === "string") return body.slice(0, 240);
  try {
    return JSON.stringify(body).slice(0, 240);
  } catch {
    return String(body).slice(0, 240);
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  return { response, body };
}

function assertStatus(label, actual, expectedList, body) {
  const allowed = Array.isArray(expectedList) ? expectedList : [expectedList];
  if (!allowed.includes(actual)) {
    fail(`${label} expected ${allowed.join(" / ")}, got ${actual}; body=${summarizeBody(body)}`);
    return false;
  }
  pass(`${label} HTTP ${actual}`);
  return true;
}

async function login() {
  return request("/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": `first-release-idempotency-${randomUUID()}`
    },
    body: JSON.stringify({
      tenantId: process.env.DEFAULT_TENANT_ID ?? "10000001",
      parkId: process.env.DEFAULT_PARK_ID ?? "20000001",
      username: adminUsername,
      password: adminPassword
    })
  });
}

function extractToken(body) {
  const token = body?.data?.accessToken ?? body?.accessToken;
  return typeof token === "string" && token.length > 0 ? token : null;
}

function extractId(body) {
  const id = body?.data?.id ?? body?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function buildIdempotencyKey(name) {
  return `${idempotencyKeyPrefix}-${name}-${testRunId}`;
}

function buildMobile(username) {
  const suffix = String(Math.abs(hashCode(username)) % 100_000_000).padStart(8, "0");
  return `138${suffix}`;
}

async function createUniqueUser(token, suffix, idempotencyKey) {
  const username = `REGRESS_${testRunId}_${suffix}`.slice(0, 64);
  const password = `Regress@${testRunId.slice(0, 8)}!`;
  const body = {
    username,
    displayName: `Regress ${suffix} ${testRunId}`.slice(0, 100),
    password,
    mobile: buildMobile(username),
    email: `${username.toLowerCase()}@example.com`
  };

  const missingKey = await request("/users", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!assertStatus("POST /users missing idempotency key", missingKey.response.status, 400, missingKey.body)) {
    return null;
  }

  const first = await request("/users", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(body)
  });
  if (!assertStatus("POST /users first request", first.response.status, [200, 201], first.body)) return null;
  const userId = extractId(first.body);
  if (!userId) {
    fail("POST /users first request did not return id");
    return null;
  }

  const replay = await request("/users", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(body)
  });
  if (!assertStatus("POST /users replay", replay.response.status, [200, 201], replay.body)) return null;
  const replayUserId = extractId(replay.body);
  if (replayUserId !== userId) {
    fail(`POST /users replay expected same id, got ${replayUserId} vs ${userId}`);
    return null;
  }
  pass("POST /users replay returned cached response");

  const conflictBody = {
    ...body,
    displayName: `${body.displayName} conflict`.slice(0, 100)
  };
  const conflict = await request("/users", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(conflictBody)
  });
  if (!assertStatus("POST /users conflict", conflict.response.status, 409, conflict.body)) return null;

  return { userId, username };
}

async function createWorkOrder(token, idempotencyKey) {
  const title = `REGRESS work order ${testRunId}`.slice(0, 200);
  const body = {
    title,
    wo_type: "repair",
    priority: "high",
    source_type: "manual",
    description: `Regression work order ${testRunId}`.slice(0, 500)
  };

  const missingKey = await request("/work-orders", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!assertStatus("POST /work-orders missing idempotency key", missingKey.response.status, 400, missingKey.body)) {
    return null;
  }

  const first = await request("/work-orders", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(body)
  });
  if (!assertStatus("POST /work-orders first request", first.response.status, [200, 201], first.body)) return null;
  const orderId = extractId(first.body);
  if (!orderId) {
    fail("POST /work-orders first request did not return id");
    return null;
  }

  const replay = await request("/work-orders", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(body)
  });
  if (!assertStatus("POST /work-orders replay", replay.response.status, [200, 201], replay.body)) return null;
  const replayOrderId = extractId(replay.body);
  if (replayOrderId !== orderId) {
    fail(`POST /work-orders replay expected same id, got ${replayOrderId} vs ${orderId}`);
    return null;
  }
  pass("POST /work-orders replay returned cached response");

  const conflictBody = {
    ...body,
    title: `${title} conflict`.slice(0, 200)
  };
  const conflict = await request("/work-orders", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(conflictBody)
  });
  if (!assertStatus("POST /work-orders conflict", conflict.response.status, 409, conflict.body)) return null;

  return { orderId };
}

function hashCode(input) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

async function run() {
  info(`API base: ${apiBaseUrl}`);
  info(`Test run id: ${testRunId}`);
  info(`Script root: ${rootDir}`);

  const loginResult = await login();
  if (!assertStatus("POST /auth/login", loginResult.response.status, 200, loginResult.body)) return;
  const token = extractToken(loginResult.body);
  if (!token) {
    fail("POST /auth/login did not return accessToken");
    return;
  }
  pass("POST /auth/login returned token");

  const userResult = await createUniqueUser(token, "user", buildIdempotencyKey("users"));
  if (!userResult) return;

  const workOrderResult = await createWorkOrder(token, buildIdempotencyKey("work-orders"));
  if (!workOrderResult) return;

  console.log("[PASS] first release idempotency regression completed");
}

run().catch((error) => {
  fail(`Unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
});
