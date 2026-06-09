import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001/api/v1";
const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "Admin@123456";

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
  if (body === null || body === undefined) {
    return "<empty>";
  }
  if (typeof body === "string") {
    return body.slice(0, 240);
  }
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

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": `first-release-auth-health-${randomUUID()}`
    },
    body: JSON.stringify({
      tenantId: process.env.DEFAULT_TENANT_ID ?? "10000001",
      parkId: process.env.DEFAULT_PARK_ID ?? "20000001",
      username,
      password
    })
  });
}

async function run() {
  info(`API base: ${apiBaseUrl}`);
  info(`Script root: ${rootDir}`);

  const health = await request("/health");
  if (!assertStatus("GET /health", health.response.status, 200, health.body)) return;

  const ready = await request("/ready");
  if (!assertStatus("GET /ready", ready.response.status, 200, ready.body)) return;

  const loginOk = await login(adminUsername, adminPassword);
  if (!assertStatus("POST /auth/login success", loginOk.response.status, 200, loginOk.body)) return;
  const accessToken = loginOk.body?.data?.accessToken;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    fail("POST /auth/login success did not return accessToken");
    return;
  }
  pass("POST /auth/login returned token");

  const me = await request("/auth/me", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
  if (!assertStatus("GET /auth/me", me.response.status, 200, me.body)) return;

  const loginBad = await login(adminUsername, `${adminPassword}-wrong`);
  if (!assertStatus("POST /auth/login wrong password", loginBad.response.status, 401, loginBad.body)) return;

  await checkDisabledAuthPath({
    label: "POST /auth/mobile/send-code",
    path: "/auth/mobile/send-code",
    method: "POST",
    body: {
      tenantId: process.env.DEFAULT_TENANT_ID ?? "10000001",
      mobile: "13800001234",
      scene: "login"
    }
  });

  await checkDisabledAuthPath({
    label: "POST /auth/mobile/login",
    path: "/auth/mobile/login",
    method: "POST",
    body: {
      tenantId: process.env.DEFAULT_TENANT_ID ?? "10000001",
      parkId: process.env.DEFAULT_PARK_ID ?? "20000001",
      mobile: "13800001234",
      code: "123456"
    }
  });

  await checkDisabledAuthPath({
    label: "POST /auth/wechat/authorize",
    path: "/auth/wechat/authorize",
    method: "POST",
    body: {
      tenantId: process.env.DEFAULT_TENANT_ID ?? "10000001",
      parkId: process.env.DEFAULT_PARK_ID ?? "20000001",
      redirectUri: "http://localhost:3000/login"
    }
  });

  await checkDisabledAuthPath({
    label: "POST /auth/wechat/callback",
    path: "/auth/wechat/callback",
    method: "POST",
    body: {
      tenantId: process.env.DEFAULT_TENANT_ID ?? "10000001",
      code: "mock-code",
      state: "mock-state"
    }
  });

  console.log("[PASS] first release auth/health regression completed");
}

async function checkDisabledAuthPath({ label, path, method, body }) {
  const result = await request(path, {
    method,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if ([404, 405].includes(result.response.status)) {
    pass(`${label} not exposed in first release (HTTP ${result.response.status})`);
    return;
  }

  if (result.response.status >= 400) {
    pass(`${label} rejected as expected (HTTP ${result.response.status})`);
    return;
  }

  fail(`${label} unexpectedly succeeded (HTTP ${result.response.status}); body=${summarizeBody(result.body)}`);
}

run().catch((error) => {
  fail(`Unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
});
