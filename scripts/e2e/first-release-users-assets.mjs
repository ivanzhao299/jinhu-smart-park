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

function buildSecret(label) {
  const suffix = `${label}_${testRunId}`.replace(/[^a-zA-Z0-9_-]/g, "");
  return `Secret@${label}_${suffix.slice(-12)}`.slice(0, 64);
}

function buildIdempotencyKey(action) {
  return `${idempotencyKeyPrefix}-${action}-${testRunId}`;
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

async function fetchRoles(authHeaders) {
  return request("/roles?page=1&page_size=50", { headers: authHeaders });
}

function readRoleItems(body) {
  const data = unwrapData(body);
  if (!data || typeof data !== "object" || !Array.isArray(data.items)) {
    return [];
  }
  return data.items.filter((item) => typeof item?.id === "string" && item.id.length > 0 && typeof item?.code === "string" && item.code.length > 0);
}

async function assertLoginAndContext(username, password, expectedRoleCodes = []) {
  const loginResult = await login(username, password);
  if (!expectStatus(`POST /auth/login (${username})`, loginResult.response.status, 200, loginResult.body)) return null;
  const accessToken = loginResult.body?.data?.accessToken;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    fail(`POST /auth/login (${username}) did not return accessToken`);
    return null;
  }
  pass(`POST /auth/login (${username}) returned token`);

  const meResult = await request("/auth/me", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
  if (!expectStatus(`GET /auth/me (${username})`, meResult.response.status, 200, meResult.body)) return null;
  const meData = unwrapData(meResult.body);
  if (!meData || typeof meData !== "object") {
    fail(`GET /auth/me (${username}) body is not an object; body=${summarizeBody(meResult.body)}`);
    return null;
  }

  const roleEntries = Array.isArray(meData.roles) ? meData.roles : [];
  for (const roleCode of expectedRoleCodes) {
    if (!roleEntries.some((entry) => entry?.role_code === roleCode)) {
      fail(`GET /auth/me (${username}) missing expected role ${roleCode}; body=${summarizeBody(meResult.body)}`);
      return null;
    }
  }
  if (expectedRoleCodes.length > 0) {
    pass(`GET /auth/me (${username}) contains expected role(s): ${expectedRoleCodes.join(", ")}`);
  }
  return { accessToken, meData };
}

async function runResetPasswordRegression(adminHeaders, userId, username) {
  info("Running reset-password idempotency regression");
  const firstPassword = buildSecret("reset-password-v1");
  const secondPassword = buildSecret("reset-password-v2");
  const key = buildIdempotencyKey("reset-password");

  const missingKey = await request(`/users/${userId}/reset-password`, {
    method: "POST",
    headers: {
      ...adminHeaders,
      "content-type": "application/json"
    },
    body: JSON.stringify({ password: firstPassword })
  });
  if (!expectStatus("POST /users/:id/reset-password missing key", missingKey.response.status, 400, missingKey.body)) return false;

  const first = await request(`/users/${userId}/reset-password`, {
    method: "POST",
    headers: {
      ...adminHeaders,
      "content-type": "application/json",
      "x-idempotency-key": key
    },
    body: JSON.stringify({ password: firstPassword })
  });
  if (!expectStatus("POST /users/:id/reset-password first request", first.response.status, [200, 201], first.body)) return false;
  const firstData = unwrapData(first.body);
  if (firstData?.id !== userId) {
    fail(`POST /users/:id/reset-password returned unexpected id; body=${summarizeBody(first.body)}`);
    return false;
  }
  pass(`POST /users/:id/reset-password affected ${username} (${userId})`);

  const loginAfterReset = await assertLoginAndContext(username, firstPassword);
  if (!loginAfterReset) return false;

  const replay = await request(`/users/${userId}/reset-password`, {
    method: "POST",
    headers: {
      ...adminHeaders,
      "content-type": "application/json",
      "x-idempotency-key": key
    },
    body: JSON.stringify({ password: firstPassword })
  });
  if (!expectStatus("POST /users/:id/reset-password replay", replay.response.status, [200, 201], replay.body)) return false;
  const replayData = unwrapData(replay.body);
  if (replayData?.id !== userId) {
    fail(`POST /users/:id/reset-password replay returned unexpected id; body=${summarizeBody(replay.body)}`);
    return false;
  }
  pass("POST /users/:id/reset-password replay returned same user id");

  const conflict = await request(`/users/${userId}/reset-password`, {
    method: "POST",
    headers: {
      ...adminHeaders,
      "content-type": "application/json",
      "x-idempotency-key": key
    },
    body: JSON.stringify({ password: secondPassword })
  });
  if (!expectStatus("POST /users/:id/reset-password conflict", conflict.response.status, 409, conflict.body)) return false;

  const loginAfterConflict = await assertLoginAndContext(username, firstPassword);
  if (!loginAfterConflict) return false;

  return true;
}

async function runRolesRegression(adminHeaders, userId, username, loginPassword) {
  info("Running user roles idempotency regression");
  const rolesResult = await fetchRoles(adminHeaders);
  if (!expectStatus("GET /roles", rolesResult.response.status, 200, rolesResult.body)) return false;
  const rolesData = unwrapData(rolesResult.body);
  if (!assertPaginated("GET /roles response", rolesData, true)) return false;

  const roleItems = readRoleItems(rolesResult.body);
  if (roleItems.length === 0) {
    fail("GET /roles returned no usable roles for idempotency regression");
    return false;
  }

  const primaryRole = roleItems[0];
  const alternateRole = roleItems.find((role) => role.id !== primaryRole.id) ?? null;
  info(`Using primary role ${primaryRole.code} (${primaryRole.id})`);
  if (alternateRole) {
    info(`Using alternate role ${alternateRole.code} (${alternateRole.id}) for conflict case`);
  }

  const key = buildIdempotencyKey("user-roles");
  const firstPayload = { roleIds: [primaryRole.id] };
  const missingKey = await request(`/users/${userId}/roles`, {
    method: "POST",
    headers: {
      ...adminHeaders,
      "content-type": "application/json"
    },
    body: JSON.stringify(firstPayload)
  });
  if (!expectStatus("POST /users/:id/roles missing key", missingKey.response.status, 400, missingKey.body)) return false;

  const first = await request(`/users/${userId}/roles`, {
    method: "POST",
    headers: {
      ...adminHeaders,
      "content-type": "application/json",
      "x-idempotency-key": key
    },
    body: JSON.stringify(firstPayload)
  });
  if (!expectStatus("POST /users/:id/roles first request", first.response.status, [200, 201], first.body)) return false;
  const firstData = unwrapData(first.body);
  if (firstData?.id !== userId) {
    fail(`POST /users/:id/roles returned unexpected id; body=${summarizeBody(first.body)}`);
    return false;
  }
  pass(`POST /users/:id/roles affected ${username} (${userId})`);

  const loginAfterRoleAssign = await assertLoginAndContext(username, loginPassword, [primaryRole.code]);
  if (!loginAfterRoleAssign) return false;

  const replay = await request(`/users/${userId}/roles`, {
    method: "POST",
    headers: {
      ...adminHeaders,
      "content-type": "application/json",
      "x-idempotency-key": key
    },
    body: JSON.stringify(firstPayload)
  });
  if (!expectStatus("POST /users/:id/roles replay", replay.response.status, [200, 201], replay.body)) return false;
  const replayData = unwrapData(replay.body);
  if (replayData?.id !== userId) {
    fail(`POST /users/:id/roles replay returned unexpected id; body=${summarizeBody(replay.body)}`);
    return false;
  }
  pass("POST /users/:id/roles replay returned same user id");

  if (alternateRole) {
    const conflict = await request(`/users/${userId}/roles`, {
      method: "POST",
      headers: {
        ...adminHeaders,
        "content-type": "application/json",
        "x-idempotency-key": key
      },
      body: JSON.stringify({ roleIds: [alternateRole.id] })
    });
    if (!expectStatus("POST /users/:id/roles conflict", conflict.response.status, 409, conflict.body)) return false;

    const verifyAfterConflict = await assertLoginAndContext(username, loginPassword, [primaryRole.code]);
    if (!verifyAfterConflict) return false;
    if ((verifyAfterConflict.meData.roles ?? []).some((entry) => entry?.role_code === alternateRole.code)) {
      fail(`POST /users/:id/roles conflict appeared to expose alternate role ${alternateRole.code}; body=${summarizeBody(verifyAfterConflict.meData)}`);
      return false;
    }
  } else {
    info("user roles conflict skipped because no alternative role is available");
  }

  return true;
}

async function runAssetsReadRegression(authHeaders) {
  const assetChecks = [
    { label: "GET /assets/parks", path: "/assets/parks?page=1&page_size=5" },
    { label: "GET /assets/buildings", path: "/assets/buildings?page=1&page_size=5" },
    { label: "GET /assets/floors", path: "/assets/floors?page=1&page_size=5" },
    { label: "GET /assets/units", path: "/assets/units?page=1&page_size=5" }
  ];

  for (const check of assetChecks) {
    const result = await request(check.path, { headers: authHeaders });
    if (!expectStatus(check.label, result.response.status, 200, result.body)) return false;
    const data = unwrapData(result.body);
    if (!assertPaginated(check.label, data, true)) return false;
  }

  return true;
}

async function run() {
  info(`API base: ${apiBaseUrl}`);
  info(`Test run: ${testRunId}`);
  info(`Tenant/Park: ${tenantId}/${parkId}`);

  const adminLogin = await login(adminUsername, adminPassword);
  if (!expectStatus("POST /auth/login", adminLogin.response.status, 200, adminLogin.body)) return;
  const accessToken = adminLogin.body?.data?.accessToken;
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

  if (!(await runResetPasswordRegression(authHeaders, createdUserId, createdUsername))) return;
  if (!(await runRolesRegression(authHeaders, createdUserId, createdUsername, buildSecret("reset-password-v1")))) return;
  if (!(await runAssetsReadRegression(authHeaders))) return;

  console.log("[PASS] first release users/assets regression completed");
}

run().catch((error) => {
  fail(`Unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
});
