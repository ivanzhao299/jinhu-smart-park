import { randomUUID } from "node:crypto";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001/api/v1";
const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "Jinhu@123456";
const testRunId =
  process.env.TEST_RUN_ID ??
  `${new Date().toISOString().replace(/[-:.]/g, "")}-${randomUUID().slice(0, 8)}`;
const tenantId = process.env.TENANT_ID ?? process.env.DEFAULT_TENANT_ID ?? "10000001";
const parkId = process.env.PARK_ID ?? process.env.DEFAULT_PARK_ID ?? "20000001";
const idempotencyKeyPrefix = process.env.IDEMPOTENCY_KEY_PREFIX ?? "first-release-regression";

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

function unwrapData(body) {
  if (body && typeof body === "object" && "data" in body) {
    return body.data;
  }
  return body;
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  return { response, body };
}

function expectStatus(label, actual, expectedList, body) {
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
      "x-request-id": `first-release-users-assets-${randomUUID()}`
    },
    body: JSON.stringify({
      tenantId,
      parkId,
      username,
      password
    })
  });
}

function buildUserPayload() {
  const suffix = testRunId.replace(/[^a-zA-Z0-9_-]/g, "");
  return {
    username: `reg_user_${suffix}`.slice(0, 64),
    displayName: `Regression User ${suffix}`.slice(0, 100),
    password: `Regress@${suffix.slice(-16)}`
  };
}

function buildIdempotencyKey(action) {
  return `${idempotencyKeyPrefix}-${action}-${testRunId}`;
}

async function run() {
  info(`API base: ${apiBaseUrl}`);
  info(`Test run: ${testRunId}`);
  info(`Tenant/Park: ${tenantId}/${parkId}`);

  const loginOk = await login(adminUsername, adminPassword);
  if (!expectStatus("POST /auth/login", loginOk.response.status, 200, loginOk.body)) return;
  const accessToken = loginOk.body?.data?.accessToken;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    fail("POST /auth/login did not return accessToken");
    return;
  }
  pass("POST /auth/login returned token");

  const authHeaders = {
    authorization: `Bearer ${accessToken}`
  };

  const usersListBefore = await request(`/users?page=1&page_size=5&keyword=${encodeURIComponent(testRunId)}`, {
    headers: authHeaders
  });
  if (!expectStatus("GET /users", usersListBefore.response.status, 200, usersListBefore.body)) return;
  const usersListBeforeData = unwrapData(usersListBefore.body);
  if (!assertPaginated("GET /users response", usersListBeforeData, false)) return;

  const userPayload = buildUserPayload();
  info(`Creating test user ${userPayload.username}`);
  const createUser = await request("/users", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("create-user")
    },
    body: JSON.stringify(userPayload)
  });
  if (!expectStatus("POST /users", createUser.response.status, [200, 201], createUser.body)) return;

  const createdUser = unwrapData(createUser.body);
  const createdUserId = createdUser?.id;
  const createdUsername = createdUser?.username ?? userPayload.username;
  if (typeof createdUserId !== "string" || createdUserId.length === 0) {
    fail("POST /users did not return a user id");
    return;
  }
  pass(`POST /users created ${createdUsername} (${createdUserId})`);

  const userDetail = await request(`/users/${createdUserId}`, {
    headers: authHeaders
  });
  if (!expectStatus("GET /users/:id", userDetail.response.status, 200, userDetail.body)) return;
  const userDetailData = unwrapData(userDetail.body);
  if (!userDetailData || userDetailData.id !== createdUserId || userDetailData.username !== createdUsername) {
    fail(`GET /users/:id mismatch; body=${summarizeBody(userDetail.body)}`);
    return;
  }
  pass(`GET /users/:id confirmed ${createdUsername}`);

  const usersListAfter = await request(`/users?page=1&page_size=20&keyword=${encodeURIComponent(createdUsername)}`, {
    headers: authHeaders
  });
  if (!expectStatus("GET /users after create", usersListAfter.response.status, 200, usersListAfter.body)) return;
  const usersListAfterData = unwrapData(usersListAfter.body);
  if (!assertPaginated("GET /users after create response", usersListAfterData, true)) return;
  const userItems = Array.isArray(usersListAfterData?.items) ? usersListAfterData.items : [];
  if (!userItems.some((item) => item?.id === createdUserId || item?.username === createdUsername)) {
    fail(`Created user not found in list; body=${summarizeBody(usersListAfter.body)}`);
    return;
  }
  pass("Created user appears in GET /users");

  const assetChecks = [
    { label: "GET /assets/parks", path: "/assets/parks?page=1&page_size=5" },
    { label: "GET /assets/buildings", path: "/assets/buildings?page=1&page_size=5" },
    { label: "GET /assets/floors", path: "/assets/floors?page=1&page_size=5" },
    { label: "GET /assets/units", path: "/assets/units?page=1&page_size=5" }
  ];

  for (const check of assetChecks) {
    const result = await request(check.path, { headers: authHeaders });
    if (!expectStatus(check.label, result.response.status, 200, result.body)) return;
    const data = unwrapData(result.body);
    if (!assertPaginated(check.label, data, true)) return;
  }

  console.log("[PASS] first release users/assets regression completed");
}

function assertPaginated(label, data, allowEmpty) {
  if (!data || typeof data !== "object") {
    fail(`${label} body is not an object; body=${summarizeBody(data)}`);
    return false;
  }
  if (!Array.isArray(data.items)) {
    fail(`${label} missing items array; body=${summarizeBody(data)}`);
    return false;
  }
  if (typeof data.total !== "number" || typeof data.page !== "number" || typeof data.page_size !== "number") {
    fail(`${label} missing pagination fields; body=${summarizeBody(data)}`);
    return false;
  }
  if (!allowEmpty && data.items.length === 0) {
    info(`${label} returned no items, but structure is valid`);
  } else if (data.items.length === 0) {
    info(`${label} returned no items`);
  } else {
    pass(`${label} parsed with ${data.items.length} item(s)`);
  }
  return true;
}

run().catch((error) => {
  fail(`Unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
});
