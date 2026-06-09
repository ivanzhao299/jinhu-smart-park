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
  if (body === null || body === undefined) return "<empty>";
  if (typeof body === "string") return body.slice(0, 240);
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
      "x-request-id": `first-release-workorders-${randomUUID()}`
    },
    body: JSON.stringify({
      tenantId,
      parkId,
      username,
      password
    })
  });
}

function buildIdempotencyKey(action) {
  return `${idempotencyKeyPrefix}-${action}-${testRunId}`;
}

function buildWorkOrderPayload() {
  const suffix = testRunId.replace(/[^a-zA-Z0-9_-]/g, "");
  const woCode = `WO-${suffix}`.slice(0, 64);
  const title = `Regression work order ${suffix}`.slice(0, 200);
  return {
    wo_code: woCode,
    title,
    wo_type: "repair",
    priority: "medium",
    urgency: "normal",
    description: `First release work order regression ${suffix}`.slice(0, 500),
    source_type: "manual"
  };
}

function extractList(resultBody) {
  const data = unwrapData(resultBody);
  if (Array.isArray(data)) {
    return { items: data, total: data.length, page: 1, page_size: data.length || 20 };
  }
  if (data && typeof data === "object" && Array.isArray(data.items)) {
    return data;
  }
  return null;
}

function assertPaginatedLike(label, body) {
  const normalized = extractList(body);
  if (!normalized) {
    fail(`${label} body is not a paginated object or array; body=${summarizeBody(body)}`);
    return null;
  }
  if (!Array.isArray(normalized.items)) {
    fail(`${label} missing items array; body=${summarizeBody(body)}`);
    return null;
  }
  if (normalized.items.length > 0) {
    pass(`${label} parsed with ${normalized.items.length} item(s)`);
  } else {
    info(`${label} returned no items`);
  }
  return normalized;
}

function findWorkOrder(items, targetId, targetCode, targetTitle) {
  return items.find((item) => item?.id === targetId || item?.woCode === targetCode || item?.title === targetTitle || item?.wo_code === targetCode);
}

function extractAssigneeId(item) {
  return item?.assigneeId ?? item?.assignee_id ?? item?.assignee?.id ?? null;
}

function buildAssignPayload(currentUserId) {
  return {
    assignee_id: currentUserId,
    reason: `First release work order assignment ${testRunId}`
  };
}

async function fetchCurrentUser(authHeaders) {
  const current = await request("/auth/me", { headers: authHeaders });
  if (!expectStatus("GET /auth/me", current.response.status, 200, current.body)) {
    return null;
  }
  const currentUser = unwrapData(current.body);
  if (typeof currentUser?.id !== "string" || currentUser.id.length === 0) {
    fail(`GET /auth/me did not return user id; body=${summarizeBody(current.body)}`);
    return null;
  }
  pass(`GET /auth/me confirmed ${currentUser.username ?? currentUser.id}`);
  return currentUser;
}

async function exerciseAssignIdempotency(authHeaders, workOrderId, currentUserId) {
  const payload = buildAssignPayload(currentUserId);

  const missingKey = await request(`/work-orders/${workOrderId}/assign`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /work-orders/:id/assign missing idempotency key", missingKey.response.status, 400, missingKey.body)) {
    return false;
  }

  const idempotencyKey = buildIdempotencyKey("assign-work-order");
  const first = await request(`/work-orders/${workOrderId}/assign`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /work-orders/:id/assign first request", first.response.status, [200, 201], first.body)) {
    return false;
  }

  const firstData = unwrapData(first.body);
  if (firstData?.id !== workOrderId) {
    fail(`POST /work-orders/:id/assign first request did not return expected work order id; body=${summarizeBody(first.body)}`);
    return false;
  }
  if (extractAssigneeId(firstData) !== currentUserId) {
    fail(`POST /work-orders/:id/assign first request did not assign expected user; body=${summarizeBody(first.body)}`);
    return false;
  }
  pass(`POST /work-orders/:id/assign assigned ${currentUserId}`);

  const replay = await request(`/work-orders/${workOrderId}/assign`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /work-orders/:id/assign replay", replay.response.status, [200, 201], replay.body)) {
    return false;
  }
  const replayData = unwrapData(replay.body);
  if (replayData?.id !== firstData.id) {
    fail(`POST /work-orders/:id/assign replay expected same work order id, got ${replayData?.id} vs ${firstData.id}`);
    return false;
  }
  if (extractAssigneeId(replayData) !== currentUserId) {
    fail(`POST /work-orders/:id/assign replay did not preserve assignee; body=${summarizeBody(replay.body)}`);
    return false;
  }
  pass("POST /work-orders/:id/assign replay returned cached response");

  const detail = await request(`/work-orders/${workOrderId}`, {
    headers: authHeaders
  });
  if (!expectStatus("GET /work-orders/:id after assign", detail.response.status, 200, detail.body)) {
    return false;
  }
  const detailData = unwrapData(detail.body);
  if (detailData?.id !== workOrderId || extractAssigneeId(detailData) !== currentUserId) {
    fail(`GET /work-orders/:id after assign did not confirm expected assignee; body=${summarizeBody(detail.body)}`);
    return false;
  }
  pass("GET /work-orders/:id after assign confirmed assignee state");

  const conflict = await request(`/work-orders/${workOrderId}/assign`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": idempotencyKey
    },
    body: JSON.stringify({
      ...payload,
      reason: `${payload.reason} conflict`
    })
  });
  if (!expectStatus("POST /work-orders/:id/assign conflict", conflict.response.status, 409, conflict.body)) {
    return false;
  }

  return true;
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
  const currentUser = await fetchCurrentUser(authHeaders);
  if (!currentUser?.id) return;

  const beforeList = await request(`/work-orders?page=1&page_size=10&keyword=${encodeURIComponent(testRunId)}`, {
    headers: authHeaders
  });
  if (!expectStatus("GET /work-orders", beforeList.response.status, 200, beforeList.body)) return;
  const beforeListData = assertPaginatedLike("GET /work-orders response", beforeList.body);
  if (!beforeListData) return;

  const payload = buildWorkOrderPayload();
  info(`Creating work order ${payload.wo_code}`);
  const create = await request("/work-orders", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("create-work-order")
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /work-orders", create.response.status, [200, 201], create.body)) return;

  const created = unwrapData(create.body);
  const createdId = created?.id;
  const createdCode = created?.woCode ?? created?.wo_code ?? payload.wo_code;
  const createdTitle = created?.title ?? payload.title;
  if (typeof createdId !== "string" || createdId.length === 0) {
    fail("POST /work-orders did not return a work order id");
    return;
  }
  pass(`POST /work-orders created ${createdCode} (${createdId})`);

  const afterList = await request(`/work-orders?page=1&page_size=20&keyword=${encodeURIComponent(testRunId)}`, {
    headers: authHeaders
  });
  if (!expectStatus("GET /work-orders after create", afterList.response.status, 200, afterList.body)) return;
  const afterListData = assertPaginatedLike("GET /work-orders after create response", afterList.body);
  if (!afterListData) return;
  const matched = findWorkOrder(afterListData.items, createdId, createdCode, createdTitle);
  if (!matched) {
    fail(`Created work order not found in list; body=${summarizeBody(afterList.body)}`);
    return;
  }
  pass("Created work order appears in GET /work-orders");

  const detail = await request(`/work-orders/${createdId}`, {
    headers: authHeaders
  });
  if (!expectStatus("GET /work-orders/:id", detail.response.status, 200, detail.body)) return;
  const detailData = unwrapData(detail.body);
  if (!detailData || detailData.id !== createdId) {
    fail(`GET /work-orders/:id did not return expected id; body=${summarizeBody(detail.body)}`);
    return;
  }
  if ((detailData.title ?? detailData.wo_title) !== createdTitle) {
    fail(`GET /work-orders/:id title mismatch; body=${summarizeBody(detail.body)}`);
    return;
  }
  if ((detailData.woCode ?? detailData.wo_code) !== createdCode) {
    fail(`GET /work-orders/:id code mismatch; body=${summarizeBody(detail.body)}`);
    return;
  }
  if (typeof detailData.status === "undefined") {
    fail(`GET /work-orders/:id missing status; body=${summarizeBody(detail.body)}`);
    return;
  }
  pass(`GET /work-orders/:id confirmed ${createdCode}`);

  const assignOk = await exerciseAssignIdempotency(authHeaders, createdId, currentUser.id);
  if (!assignOk) return;

  console.log("[PASS] first release workorders regression completed");
}

run().catch((error) => {
  fail(`Unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
});
