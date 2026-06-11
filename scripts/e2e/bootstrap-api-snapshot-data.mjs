import { randomUUID } from "node:crypto";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001/api/v1";
const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "Jinhu@123456";
const tenantId = process.env.TENANT_ID ?? process.env.DEFAULT_TENANT_ID ?? "10000001";
const parkId = process.env.PARK_ID ?? process.env.DEFAULT_PARK_ID ?? "20000001";
const snapshotUnitNo = process.env.SNAPSHOT_UNIT_NO?.trim() || "SNAPSHOT-UNIT-001";
const snapshotWorkorderNo = process.env.SNAPSHOT_WORKORDER_NO?.trim() || "SNAPSHOT-WO-001";
const dryRun = process.env.DRY_RUN === "true";
const idempotencyKeyPrefix = process.env.IDEMPOTENCY_KEY_PREFIX ?? "api-snapshot-bootstrap";

function info(message) {
  console.log(`[INFO] ${message}`);
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function warn(message) {
  console.warn(`[WARN] ${message}`);
}

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function summarizeBody(body) {
  if (body === null || body === undefined) return "<empty>";
  if (typeof body === "string") return body.slice(0, 500);
  try {
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return String(body).slice(0, 500);
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
      "x-request-id": `api-snapshot-bootstrap-${randomUUID()}`
    },
    body: JSON.stringify({
      tenantId,
      parkId,
      username,
      password
    })
  });
}

function extractList(bodyOrData) {
  const data = unwrapData(bodyOrData);
  if (Array.isArray(data)) {
    return { items: data, total: data.length, page: 1, page_size: data.length || 20 };
  }
  if (data && typeof data === "object" && Array.isArray(data.items)) {
    return data;
  }
  return null;
}

function findByBusinessKey(items, businessKey, fields) {
  return items.find((item) => fields.some((field) => item?.[field] === businessKey)) ?? null;
}

function firstUsableItem(items) {
  return items.find((item) => typeof item?.id === "string" && item.id.length > 0) ?? null;
}

function buildIdempotencyKey(action) {
  return `${idempotencyKeyPrefix}-${action}-${tenantId}-${parkId}`;
}

function validateUnit(unit) {
  let ok = true;
  const actualCode = unit?.unitCode ?? unit?.unit_code ?? unit?.code;
  if (actualCode !== snapshotUnitNo) {
    warn(`Snapshot unit code mismatch; expected ${snapshotUnitNo}, got ${actualCode ?? "<missing>"}`);
    ok = false;
  }
  if ((unit?.unitName ?? unit?.unit_name) !== "Snapshot Unit 001") {
    warn(`Snapshot unit name differs from expected Snapshot Unit 001; got ${unit?.unitName ?? unit?.unit_name ?? "<missing>"}`);
    ok = false;
  }
  if (Number(unit?.status ?? 1) !== 1) {
    warn(`Snapshot unit status is not enabled-like 1; got ${unit?.status}`);
    ok = false;
  }
  if (ok) {
    pass(`Snapshot unit verified: ${snapshotUnitNo}`);
  }
  return ok;
}

function validateWorkorder(workorder) {
  let ok = true;
  const actualCode = workorder?.woCode ?? workorder?.wo_code ?? workorder?.code;
  if (actualCode !== snapshotWorkorderNo) {
    warn(`Snapshot work order code mismatch; expected ${snapshotWorkorderNo}, got ${actualCode ?? "<missing>"}`);
    ok = false;
  }
  if ((workorder?.title ?? workorder?.wo_title) !== "Snapshot work order 001") {
    warn(`Snapshot work order title differs from expected Snapshot work order 001; got ${workorder?.title ?? workorder?.wo_title ?? "<missing>"}`);
    ok = false;
  }
  if ((workorder?.woType ?? workorder?.wo_type) !== "repair") {
    warn(`Snapshot work order type differs from expected repair; got ${workorder?.woType ?? workorder?.wo_type ?? "<missing>"}`);
    ok = false;
  }
  if ((workorder?.priority ?? "") !== "medium") {
    warn(`Snapshot work order priority differs from expected medium; got ${workorder?.priority ?? "<missing>"}`);
    ok = false;
  }
  if (ok) {
    pass(`Snapshot work order verified: ${snapshotWorkorderNo}`);
  }
  return ok;
}

async function fetchList(label, path, authHeaders) {
  const result = await request(path, { headers: authHeaders });
  if (!expectStatus(label, result.response.status, 200, result.body)) return null;
  const list = extractList(result.body);
  if (!list) {
    fail(`${label} body is not a paginated object or array; body=${summarizeBody(result.body)}`);
    return null;
  }
  pass(`${label} parsed with ${list.items.length} item(s)`);
  return list.items;
}

async function findSnapshotUnit(authHeaders) {
  const items = await fetchList("GET /park-units snapshot lookup", `/park-units?page=1&page_size=20&keyword=${encodeURIComponent(snapshotUnitNo)}`, authHeaders);
  if (!items) return null;
  return findByBusinessKey(items, snapshotUnitNo, ["unitCode", "unit_code", "code"]);
}

async function findSnapshotWorkorder(authHeaders) {
  const items = await fetchList(
    "GET /work-orders snapshot lookup",
    `/work-orders?page=1&page_size=20&keyword=${encodeURIComponent(snapshotWorkorderNo)}`,
    authHeaders
  );
  if (!items) return null;
  return findByBusinessKey(items, snapshotWorkorderNo, ["woCode", "wo_code", "code"]);
}

async function findBuildingAndFloor(authHeaders) {
  const buildings = await fetchList("GET /buildings", "/buildings?page=1&page_size=20", authHeaders);
  if (!buildings) return null;
  const building = firstUsableItem(buildings);
  if (!building) {
    fail("No usable building found; run dev seed or prepare a building before bootstrapping snapshot unit");
    return null;
  }

  const floors = await fetchList("GET /floors", `/floors?page=1&page_size=20&building_id=${encodeURIComponent(building.id)}`, authHeaders);
  if (!floors) return null;
  const floor = floors.find((item) => item?.buildingId === building.id || item?.building_id === building.id) ?? firstUsableItem(floors);
  if (!floor) {
    fail(`No usable floor found for building ${building.buildingCode ?? building.building_code ?? building.id}; prepare a floor before bootstrapping snapshot unit`);
    return null;
  }

  return { building, floor };
}

async function ensureSnapshotUnit(authHeaders) {
  const existing = await findSnapshotUnit(authHeaders);
  if (existing) {
    pass(`Snapshot unit already exists: ${snapshotUnitNo} (${existing.id})`);
    validateUnit(existing);
    return existing;
  }

  if (dryRun) {
    warn(`DRY_RUN=true: would create snapshot unit ${snapshotUnitNo}`);
    return null;
  }

  const relation = await findBuildingAndFloor(authHeaders);
  if (!relation) return null;

  const payload = {
    unitCode: snapshotUnitNo,
    buildingId: relation.building.id,
    floorId: relation.floor.id,
    unitName: "Snapshot Unit 001",
    usageType: 10,
    unitArea: 100,
    useArea: 90,
    rentalStatus: 10,
    fittingStatus: 10,
    refPrice: 1000,
    status: 1,
    remark: "api snapshot fixed unit"
  };

  const created = await request("/park-units", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("create-unit")
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /park-units snapshot unit", created.response.status, [200, 201], created.body)) return null;

  const unit = unwrapData(created.body);
  if (typeof unit?.id !== "string" || unit.id.length === 0) {
    fail(`POST /park-units snapshot unit did not return id; body=${summarizeBody(created.body)}`);
    return null;
  }
  pass(`Created snapshot unit ${snapshotUnitNo} (${unit.id})`);
  validateUnit(unit);
  return unit;
}

async function ensureSnapshotWorkorder(authHeaders, unit) {
  const existing = await findSnapshotWorkorder(authHeaders);
  if (existing) {
    pass(`Snapshot work order already exists: ${snapshotWorkorderNo} (${existing.id})`);
    validateWorkorder(existing);
    return existing;
  }

  if (dryRun) {
    warn(`DRY_RUN=true: would create snapshot work order ${snapshotWorkorderNo}`);
    return null;
  }

  const payload = {
    wo_code: snapshotWorkorderNo,
    title: "Snapshot work order 001",
    wo_type: "repair",
    priority: "medium",
    urgency: "normal",
    description: "Fixed work order for API snapshot regression.",
    source_type: "manual",
    ...(typeof unit?.id === "string" && unit.id.length > 0 ? { unit_id: unit.id } : {})
  };

  const created = await request("/work-orders", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("create-workorder")
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /work-orders snapshot work order", created.response.status, [200, 201], created.body)) return null;

  const workorder = unwrapData(created.body);
  if (typeof workorder?.id !== "string" || workorder.id.length === 0) {
    fail(`POST /work-orders snapshot work order did not return id; body=${summarizeBody(created.body)}`);
    return null;
  }
  pass(`Created snapshot work order ${snapshotWorkorderNo} (${workorder.id})`);
  validateWorkorder(workorder);

  const logs = await fetchList("GET /work-orders/:id/logs snapshot verification", `/work-orders/${workorder.id}/logs?page=1&page_size=10`, authHeaders);
  if (logs && logs.length > 0) {
    pass(`Snapshot work order has ${logs.length} log item(s); create action generated log data`);
  } else if (logs) {
    warn("Snapshot work order has no logs after create; workorders.logs snapshot may stay empty for this sample");
  }

  return workorder;
}

async function run() {
  info(`API base: ${apiBaseUrl}`);
  info(`Tenant/Park: ${tenantId}/${parkId}`);
  info(`Snapshot unit key: ${snapshotUnitNo}`);
  info(`Snapshot work order key: ${snapshotWorkorderNo}`);
  info(`Dry run: ${dryRun ? "true" : "false"}`);

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

  const unit = await ensureSnapshotUnit(authHeaders);
  if (process.exitCode) return;

  await ensureSnapshotWorkorder(authHeaders, unit);
  if (process.exitCode) return;

  pass("API snapshot bootstrap completed");
}

run().catch((error) => {
  fail(`Unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
});
