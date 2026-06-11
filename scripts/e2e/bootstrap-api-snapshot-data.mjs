import { randomUUID } from "node:crypto";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001/api/v1";
const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "Jinhu@123456";
const tenantId = process.env.TENANT_ID ?? process.env.DEFAULT_TENANT_ID ?? "10000001";
const parkId = process.env.PARK_ID ?? process.env.DEFAULT_PARK_ID ?? "20000001";
const snapshotBuildingNo = process.env.SNAPSHOT_BUILDING_NO?.trim() || "SNAPSHOT-BLD-001";
const snapshotFloorNo = process.env.SNAPSHOT_FLOOR_NO?.trim() || "SNAPSHOT-FLR-001";
const snapshotUnitNo = process.env.SNAPSHOT_UNIT_NO?.trim() || "SNAPSHOT-UNIT-001";
const snapshotWorkorderNo = process.env.SNAPSHOT_WORKORDER_NO?.trim() || "SNAPSHOT-WO-001";
const dryRun = process.env.DRY_RUN === "true";
const allowSnapshotRepair = process.env.ALLOW_SNAPSHOT_REPAIR === "true";
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

function getBusinessKey(item, fields) {
  for (const field of fields) {
    const value = item?.[field];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function buildIdempotencyKey(action) {
  return `${idempotencyKeyPrefix}-${action}-${tenantId}-${parkId}`;
}

function idOf(item) {
  return typeof item?.id === "string" && item.id.length > 0 ? item.id : null;
}

function failAssociation(message) {
  fail(`${message}. Automatic repair is not implemented; ALLOW_SNAPSHOT_REPAIR=${allowSnapshotRepair ? "true" : "false"} is currently informational only.`);
}

function validateBuilding(building) {
  let ok = true;
  const actualCode = getBusinessKey(building, ["buildingCode", "building_code", "code"]);
  if (actualCode !== snapshotBuildingNo) {
    warn(`Snapshot building code mismatch; expected ${snapshotBuildingNo}, got ${actualCode ?? "<missing>"}`);
    ok = false;
  }
  if ((building?.buildingName ?? building?.building_name) !== "Snapshot Building") {
    warn(`Snapshot building name differs from expected Snapshot Building; got ${building?.buildingName ?? building?.building_name ?? "<missing>"}`);
    ok = false;
  }
  if (Number(building?.status ?? 1) !== 1) {
    warn(`Snapshot building status is not enabled-like 1; got ${building?.status}`);
    ok = false;
  }
  if (ok) {
    pass(`Snapshot building verified: ${snapshotBuildingNo}`);
  }
  return ok;
}

function validateFloor(floor, building) {
  let ok = true;
  const actualCode = getBusinessKey(floor, ["floorCode", "floor_code", "code"]);
  if (actualCode !== snapshotFloorNo) {
    warn(`Snapshot floor code mismatch; expected ${snapshotFloorNo}, got ${actualCode ?? "<missing>"}`);
    ok = false;
  }
  if ((floor?.floorName ?? floor?.floor_name) !== "Snapshot Floor") {
    warn(`Snapshot floor name differs from expected Snapshot Floor; got ${floor?.floorName ?? floor?.floor_name ?? "<missing>"}`);
    ok = false;
  }
  if (Number(floor?.status ?? 1) !== 1) {
    warn(`Snapshot floor status is not enabled-like 1; got ${floor?.status}`);
    ok = false;
  }
  const actualBuildingId = floor?.buildingId ?? floor?.building_id;
  if (actualBuildingId !== building?.id) {
    failAssociation(`${snapshotFloorNo} exists but is not associated with ${snapshotBuildingNo}`);
    ok = false;
  }
  if (ok) {
    pass(`Snapshot floor verified: ${snapshotFloorNo}`);
  }
  return ok;
}

function validateUnit(unit, relation) {
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
  if (relation) {
    const actualBuildingId = unit?.buildingId ?? unit?.building_id;
    const actualFloorId = unit?.floorId ?? unit?.floor_id;
    if (actualBuildingId !== relation.building?.id || actualFloorId !== relation.floor?.id) {
      failAssociation(`${snapshotUnitNo} exists but is not associated with ${snapshotBuildingNo} / ${snapshotFloorNo}`);
      ok = false;
    }
  }
  if (ok) {
    pass(`Snapshot unit verified: ${snapshotUnitNo}`);
  }
  return ok;
}

function validateWorkorder(workorder, unit) {
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
  if (unit) {
    const expectedUnitId = idOf(unit);
    const actualUnitId = workorder?.unitId ?? workorder?.unit_id;
    const actualUnitCode = workorder?.unit?.unitCode ?? workorder?.unit?.unit_code ?? workorder?.unit?.code;
    if (actualUnitId) {
      if (actualUnitId !== expectedUnitId) {
        failAssociation(`${snapshotWorkorderNo} exists but is not associated with ${snapshotUnitNo}`);
        ok = false;
      }
    } else if (actualUnitCode) {
      if (actualUnitCode !== snapshotUnitNo) {
        failAssociation(`${snapshotWorkorderNo} exists but is not associated with ${snapshotUnitNo}`);
        ok = false;
      }
    } else {
      warn(`${snapshotWorkorderNo} response does not expose unit association; cannot verify associated unit`);
    }
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

async function findSnapshotBuilding(authHeaders) {
  const items = await fetchList(
    "GET /buildings snapshot lookup",
    `/buildings?page=1&page_size=20&keyword=${encodeURIComponent(snapshotBuildingNo)}`,
    authHeaders
  );
  if (!items) return null;
  return findByBusinessKey(items, snapshotBuildingNo, ["buildingCode", "building_code", "code"]);
}

async function findSnapshotFloor(authHeaders, building) {
  const items = await fetchList(
    "GET /floors snapshot lookup",
    `/floors?page=1&page_size=20&building_id=${encodeURIComponent(building.id)}&keyword=${encodeURIComponent(snapshotFloorNo)}`,
    authHeaders
  );
  if (!items) return null;
  return findByBusinessKey(items, snapshotFloorNo, ["floorCode", "floor_code", "code"]);
}

async function findSnapshotFloorAnyBuilding(authHeaders) {
  const items = await fetchList("GET /floors snapshot lookup across buildings", `/floors?page=1&page_size=20&keyword=${encodeURIComponent(snapshotFloorNo)}`, authHeaders);
  if (!items) return null;
  return findByBusinessKey(items, snapshotFloorNo, ["floorCode", "floor_code", "code"]);
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

async function fetchDetail(label, path, authHeaders) {
  const result = await request(path, { headers: authHeaders });
  if (!expectStatus(label, result.response.status, 200, result.body)) return null;
  return unwrapData(result.body);
}

async function ensureSnapshotBuilding(authHeaders) {
  const existing = await findSnapshotBuilding(authHeaders);
  if (existing) {
    pass(`Snapshot building already exists: ${snapshotBuildingNo} (${existing.id})`);
    validateBuilding(existing);
    return existing;
  }

  if (dryRun) {
    warn(`DRY_RUN=true: would create snapshot building ${snapshotBuildingNo}`);
    return null;
  }

  const payload = {
    buildingCode: snapshotBuildingNo,
    buildingName: "Snapshot Building",
    floorCount: 1,
    buildArea: 1000,
    status: 1,
    sortNo: 1,
    remark: "api snapshot fixed building"
  };

  const created = await request("/buildings", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("create-building")
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /buildings snapshot building", created.response.status, [200, 201], created.body)) return null;

  const building = unwrapData(created.body);
  if (typeof building?.id !== "string" || building.id.length === 0) {
    fail(`POST /buildings snapshot building did not return id; body=${summarizeBody(created.body)}`);
    return null;
  }
  pass(`Created snapshot building ${snapshotBuildingNo} (${building.id})`);
  validateBuilding(building);
  return building;
}

async function ensureSnapshotFloor(authHeaders, building) {
  if (!building) return null;

  const existing = await findSnapshotFloor(authHeaders, building);
  if (existing) {
    pass(`Snapshot floor already exists: ${snapshotFloorNo} (${existing.id})`);
    validateFloor(existing, building);
    return existing;
  }

  const existingElsewhere = await findSnapshotFloorAnyBuilding(authHeaders);
  if (existingElsewhere) {
    failAssociation(`${snapshotFloorNo} exists but is not associated with ${snapshotBuildingNo}`);
    return null;
  }

  if (dryRun) {
    warn(`DRY_RUN=true: would create snapshot floor ${snapshotFloorNo}`);
    return null;
  }

  const payload = {
    buildingId: building.id,
    floorCode: snapshotFloorNo,
    floorNo: 1,
    floorName: "Snapshot Floor",
    floorArea: 1000,
    status: 1,
    sortNo: 1,
    remark: "api snapshot fixed floor"
  };

  const created = await request("/floors", {
    method: "POST",
    headers: {
      ...authHeaders,
      "content-type": "application/json",
      "x-idempotency-key": buildIdempotencyKey("create-floor")
    },
    body: JSON.stringify(payload)
  });
  if (!expectStatus("POST /floors snapshot floor", created.response.status, [200, 201], created.body)) return null;

  const floor = unwrapData(created.body);
  if (typeof floor?.id !== "string" || floor.id.length === 0) {
    fail(`POST /floors snapshot floor did not return id; body=${summarizeBody(created.body)}`);
    return null;
  }
  pass(`Created snapshot floor ${snapshotFloorNo} (${floor.id})`);
  validateFloor(floor, building);
  return floor;
}

async function ensureSnapshotUnit(authHeaders, relation) {
  const existing = await findSnapshotUnit(authHeaders);
  if (existing) {
    const existingId = idOf(existing);
    const detail = existingId ? await fetchDetail("GET /park-units snapshot unit detail", `/park-units/${existingId}`, authHeaders) : existing;
    const unit = detail ?? existing;
    pass(`Snapshot unit already exists: ${snapshotUnitNo} (${unit.id ?? existing.id})`);
    validateUnit(unit, relation);
    return unit;
  }

  if (dryRun) {
    warn(`DRY_RUN=true: would create snapshot unit ${snapshotUnitNo}`);
    return null;
  }

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
  validateUnit(unit, relation);
  return unit;
}

async function ensureSnapshotWorkorder(authHeaders, unit) {
  const existing = await findSnapshotWorkorder(authHeaders);
  if (existing) {
    const existingId = idOf(existing);
    const detail = existingId ? await fetchDetail("GET /work-orders snapshot work order detail", `/work-orders/${existingId}`, authHeaders) : existing;
    const workorder = detail ?? existing;
    pass(`Snapshot work order already exists: ${snapshotWorkorderNo} (${workorder.id ?? existing.id})`);
    validateWorkorder(workorder, unit);
    return workorder;
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
  validateWorkorder(workorder, unit);

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
  info(`Snapshot building key: ${snapshotBuildingNo}`);
  info(`Snapshot floor key: ${snapshotFloorNo}`);
  info(`Snapshot unit key: ${snapshotUnitNo}`);
  info(`Snapshot work order key: ${snapshotWorkorderNo}`);
  info(`Dry run: ${dryRun ? "true" : "false"}`);
  info(`Allow snapshot repair: ${allowSnapshotRepair ? "true" : "false"}`);

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

  const building = await ensureSnapshotBuilding(authHeaders);
  if (process.exitCode) return;

  const floor = await ensureSnapshotFloor(authHeaders, building);
  if (process.exitCode) return;

  const unit = await ensureSnapshotUnit(authHeaders, { building, floor });
  if (process.exitCode) return;

  await ensureSnapshotWorkorder(authHeaders, unit);
  if (process.exitCode) return;

  pass("API snapshot bootstrap completed");
}

run().catch((error) => {
  fail(`Unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
});
