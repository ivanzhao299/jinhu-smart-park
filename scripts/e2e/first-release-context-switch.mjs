import { randomUUID } from "node:crypto";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001/api/v1";
const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "Jinhu@123456";
const tenantId = process.env.TENANT_ID ?? process.env.DEFAULT_TENANT_ID ?? "10000001";
const parkId = process.env.PARK_ID ?? process.env.DEFAULT_PARK_ID ?? "20000001";
const fixtureTenantSuffix = normalizeFixtureSuffix(tenantId);
const fixtureActorSuffix = normalizeFixtureSuffix(`${tenantId}-${adminUsername}`);
const testRunId =
  process.env.TEST_RUN_ID ??
  `${new Date().toISOString().replace(/[-:.]/g, "")}-${randomUUID().slice(0, 8)}`;
const fixtureRunSuffix = normalizeFixtureSuffix(testRunId).slice(-16);
const idempotencyKeyPrefix = process.env.IDEMPOTENCY_KEY_PREFIX ?? "first-release-regression";
const contextParkCode = process.env.CONTEXT_SWITCH_PARK_CODE ?? fixtureCode("CTXSWITCH", fixtureActorSuffix);
const contextBuildingCode = process.env.CONTEXT_SWITCH_BUILDING_CODE ?? fixtureCode("CTXSWITCH-B1", `${fixtureTenantSuffix}-${fixtureRunSuffix}`);
const contextFloorCode = process.env.CONTEXT_SWITCH_FLOOR_CODE ?? fixtureCode("CTXSWITCH-F1", `${fixtureTenantSuffix}-${fixtureRunSuffix}`);
const contextUnitCode = process.env.CONTEXT_SWITCH_UNIT_CODE ?? fixtureCode("CTXSWITCH-U1", `${fixtureTenantSuffix}-${fixtureRunSuffix}`);
const deniedParkId = process.env.CONTEXT_SWITCH_DENIED_PARK_ID ?? "";

function normalizeFixtureSuffix(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^a-z0-9_-]/gi, "")
    .slice(-24);
  return normalized || "default";
}

function fixtureCode(prefix, suffix) {
  return `${prefix}-${suffix}`.slice(0, 64);
}

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
  if (body && typeof body === "object" && "data" in body) return body.data;
  return body;
}

function buildIdempotencyKey(action) {
  return `${idempotencyKeyPrefix}-context-switch-${action}-${testRunId}`;
}

function appendCookies(headers, cookieJar) {
  const setCookieHeaders = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie")].filter(Boolean);
  for (const header of setCookieHeaders) {
    const pair = String(header).split(";")[0];
    const name = pair.split("=")[0];
    if (name) cookieJar.set(name, pair);
  }
}

function cookieHeader(cookieJar) {
  return Array.from(cookieJar.values()).join("; ");
}

async function request(path, options = {}) {
  const cookieJar = options.cookieJar;
  const headers = { ...(options.headers ?? {}) };
  if (cookieJar?.size) headers.cookie = cookieHeader(cookieJar);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers
  });
  if (cookieJar) appendCookies(response.headers, cookieJar);
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

function authHeaders(accessToken, action, contentType = true) {
  return {
    authorization: `Bearer ${accessToken}`,
    ...(contentType ? { "content-type": "application/json" } : {}),
    "x-idempotency-key": buildIdempotencyKey(action)
  };
}

async function login(cookieJar) {
  const result = await request("/auth/login", {
    method: "POST",
    cookieJar,
    headers: {
      "content-type": "application/json",
      "x-request-id": `first-release-context-switch-${randomUUID()}`
    },
    body: JSON.stringify({
      tenantId,
      parkId,
      username: adminUsername,
      password: adminPassword
    })
  });
  if (!expectStatus("POST /auth/login", result.response.status, 200, result.body)) return null;
  const data = unwrapData(result.body);
  if (typeof data?.accessToken !== "string") {
    fail(`POST /auth/login missing accessToken; body=${summarizeBody(result.body)}`);
    return null;
  }
  pass("POST /auth/login returned access token");
  return data;
}

async function getMe(accessToken, label) {
  const result = await request("/auth/me", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!expectStatus(`GET /auth/me ${label}`, result.response.status, 200, result.body)) return null;
  return unwrapData(result.body);
}

async function resolveTargetPark(accessToken) {
  const existing = await request(`/parks?page=1&page_size=20&keyword=${encodeURIComponent(contextParkCode)}`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!expectStatus("GET /parks context-switch fixture lookup", existing.response.status, 200, existing.body)) return null;
  const existingPage = unwrapData(existing.body);
  const existingItems = Array.isArray(existingPage?.items) ? existingPage.items : [];
  const reusablePark = existingItems.find((item) => item?.parkCode === contextParkCode && item.status === 1);
  if (reusablePark?.parkId) {
    pass(`Reusing target park ${contextParkCode}`);
    return reusablePark;
  }

  const result = await request("/parks", {
    method: "POST",
    headers: authHeaders(accessToken, "create-park"),
    body: JSON.stringify({
      parkCode: contextParkCode,
      parkName: "Context Switch Regression Park",
      status: 1,
      remark: "Reusable first-release context switch regression fixture"
    })
  });
  if (!expectStatus("POST /parks", result.response.status, [200, 201], result.body)) return null;
  const park = unwrapData(result.body);
  if (typeof park?.parkId !== "string" || park.parkId.length === 0) {
    fail(`POST /parks returned no parkId; body=${summarizeBody(result.body)}`);
    return null;
  }
  pass(`Created target park ${park.parkCode ?? park.parkId}`);
  return park;
}

async function switchContext({ accessToken, refreshToken, targetParkId, cookieJar, label }) {
  const result = await request("/auth/switch-context", {
    method: "POST",
    cookieJar,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
      "x-idempotency-key": buildIdempotencyKey(`switch-${label}`)
    },
    body: JSON.stringify({
      parkId: targetParkId,
      ...(refreshToken ? { refreshToken } : {})
    })
  });
  if (!expectStatus(`POST /auth/switch-context ${label}`, result.response.status, 200, result.body)) return null;
  const data = unwrapData(result.body);
  if (typeof data?.accessToken !== "string") {
    fail(`POST /auth/switch-context ${label} missing rotated accessToken; body=${summarizeBody(result.body)}`);
    return null;
  }
  if (data.accessToken === accessToken || (refreshToken && data.refreshToken === refreshToken)) {
    fail(`POST /auth/switch-context ${label} did not rotate available tokens`);
    return null;
  }
  pass(`POST /auth/switch-context ${label} rotated access token`);
  return data;
}

async function resolveBuilding(accessToken, targetParkId) {
  const result = await request("/buildings", {
    method: "POST",
    headers: authHeaders(accessToken, "create-building"),
    body: JSON.stringify({
      buildingCode: contextBuildingCode,
      buildingName: "Context Switch Regression Building",
      floorCount: 1,
      buildArea: 100,
      status: 1,
      sortNo: 0,
      remark: "Reusable first-release context switch regression fixture"
    })
  });
  if (!expectStatus("POST /buildings after switch", result.response.status, [200, 201], result.body)) return null;
  const building = unwrapData(result.body);
  if (building?.parkId !== targetParkId) {
    fail(`POST /buildings used wrong park; expected ${targetParkId}, body=${summarizeBody(result.body)}`);
    return null;
  }
  pass("POST /buildings wrote into switched park");
  return building;
}

async function resolveFloor(accessToken, buildingId, targetParkId) {
  const result = await request("/floors", {
    method: "POST",
    headers: authHeaders(accessToken, "create-floor"),
    body: JSON.stringify({
      buildingId,
      floorCode: contextFloorCode,
      floorNo: 1,
      floorName: "Context Switch Regression Floor",
      floorArea: 100,
      status: 1,
      sortNo: 0,
      remark: "Reusable first-release context switch regression fixture"
    })
  });
  if (!expectStatus("POST /floors after switch", result.response.status, [200, 201], result.body)) return null;
  const floor = unwrapData(result.body);
  if (floor?.parkId !== targetParkId) {
    fail(`POST /floors used wrong park; expected ${targetParkId}, body=${summarizeBody(result.body)}`);
    return null;
  }
  pass("POST /floors wrote into switched park");
  return floor;
}

async function resolveUnit(accessToken, buildingId, floorId, targetParkId) {
  const result = await request("/park-units", {
    method: "POST",
    headers: authHeaders(accessToken, "create-unit"),
    body: JSON.stringify({
      unitCode: contextUnitCode,
      buildingId,
      floorId,
      unitName: "Context Switch Regression Unit",
      usageType: 10,
      unitArea: 100,
      useArea: 90,
      rentalStatus: 10,
      fittingStatus: 10,
      refPrice: 100,
      status: 1,
      remark: "Reusable first-release context switch regression fixture"
    })
  });
  if (!expectStatus("POST /park-units after switch", result.response.status, [200, 201], result.body)) return null;
  const unit = unwrapData(result.body);
  if (unit?.parkId !== targetParkId && unit?.park_id !== targetParkId) {
    fail(`POST /park-units used wrong park; expected ${targetParkId}, body=${summarizeBody(result.body)}`);
    return null;
  }
  pass("POST /park-units wrote into switched park");
  return unit;
}

async function verifyTargetAssetsVisible(accessToken, building, floor, unit, targetParkId) {
  const targetBuildings = await request(`/buildings?page=1&page_size=20&keyword=${encodeURIComponent(contextBuildingCode)}`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!expectStatus("GET /buildings in target context", targetBuildings.response.status, 200, targetBuildings.body)) return false;
  const buildingPage = unwrapData(targetBuildings.body);
  const buildingItems = Array.isArray(buildingPage?.items) ? buildingPage.items : [];
  if (!buildingItems.some((item) => item?.id === building.id && item?.parkId === targetParkId)) {
    fail(`Target context list does not show target building ${building.id}; body=${summarizeBody(targetBuildings.body)}`);
    return false;
  }
  pass("Target context list shows target park building");

  const targetFloors = await request(`/floors?page=1&page_size=20&keyword=${encodeURIComponent(contextFloorCode)}`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!expectStatus("GET /floors in target context", targetFloors.response.status, 200, targetFloors.body)) return false;
  const floorPage = unwrapData(targetFloors.body);
  const floorItems = Array.isArray(floorPage?.items) ? floorPage.items : [];
  if (!floorItems.some((item) => item?.id === floor.id && item?.parkId === targetParkId)) {
    fail(`Target context list does not show target floor ${floor.id}; body=${summarizeBody(targetFloors.body)}`);
    return false;
  }
  pass("Target context list shows target park floor");

  const targetUnits = await request(`/park-units?page=1&page_size=20&keyword=${encodeURIComponent(contextUnitCode)}`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!expectStatus("GET /park-units in target context", targetUnits.response.status, 200, targetUnits.body)) return false;
  const unitPage = unwrapData(targetUnits.body);
  const unitItems = Array.isArray(unitPage?.items) ? unitPage.items : [];
  if (!unitItems.some((item) => item?.id === unit.id && (item?.parkId === targetParkId || item?.park_id === targetParkId))) {
    fail(`Target context list does not show target unit ${unit.id}; body=${summarizeBody(targetUnits.body)}`);
    return false;
  }
  pass("Target context list shows target park unit");
  return true;
}

async function cleanupTargetAssets(accessToken, unit, floor, building) {
  if (unit?.id) {
    const unitDelete = await request(`/park-units/${unit.id}`, {
      method: "DELETE",
      headers: authHeaders(accessToken, "delete-unit", false)
    });
    if (!expectStatus("DELETE /park-units context-switch fixture", unitDelete.response.status, [200, 204], unitDelete.body)) return false;
    pass("Deleted per-run target unit fixture");
  }

  if (floor?.id) {
    const floorDelete = await request(`/floors/${floor.id}`, {
      method: "DELETE",
      headers: authHeaders(accessToken, "delete-floor", false)
    });
    if (!expectStatus("DELETE /floors context-switch fixture", floorDelete.response.status, [200, 204], floorDelete.body)) return false;
    pass("Deleted per-run target floor fixture");
  }

  if (building?.id) {
    const buildingDelete = await request(`/buildings/${building.id}`, {
      method: "DELETE",
      headers: authHeaders(accessToken, "delete-building", false)
    });
    if (!expectStatus("DELETE /buildings context-switch fixture", buildingDelete.response.status, [200, 204], buildingDelete.body)) return false;
    pass("Deleted per-run target building fixture");
  }
  return true;
}

async function cleanupCreatedTargetAssets({ session, currentParkId, targetParkId, cookieJar, unit, floor, building }) {
  if (!unit?.id && !floor?.id && !building?.id) return true;
  let cleanupSession = session;
  if (currentParkId !== targetParkId) {
    cleanupSession = await switchContext({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      targetParkId,
      cookieJar,
      label: "back to cleanup target park"
    });
    if (!cleanupSession) return false;
  }
  return cleanupTargetAssets(cleanupSession.accessToken, unit, floor, building);
}

async function run() {
  info(`API base: ${apiBaseUrl}`);
  info(`Test run: ${testRunId}`);

  const cookieJar = new Map();
  let session = await login(cookieJar);
  if (!session) return;
  let targetParkId = "";
  let currentParkId = parkId;
  let building = null;
  let floor = null;
  let unit = null;

  try {
    const initialMe = await getMe(session.accessToken, "initial");
    if (!initialMe) return;
    if (initialMe.current_park?.park_id !== parkId && initialMe.park_id !== parkId) {
      fail(`Initial context is not expected park ${parkId}; body=${summarizeBody(initialMe)}`);
      return;
    }
    pass("Initial /auth/me reports the default park context");

    const targetPark = await resolveTargetPark(session.accessToken);
    if (!targetPark) return;
    targetParkId = targetPark.parkId;

    const refreshedMe = await getMe(session.accessToken, "after park provisioning");
    if (!refreshedMe) return;
    const accessibleParks = Array.isArray(refreshedMe.accessible_parks) ? refreshedMe.accessible_parks : [];
    if (!accessibleParks.some((park) => park?.park_id === targetParkId && park.status === "enabled")) {
      fail(`Provisioned park is not accessible to current user; body=${summarizeBody(refreshedMe)}`);
      return;
    }
    pass("Provisioned park appears in accessible_parks");

    const denied = await request("/auth/switch-context", {
      method: "POST",
      cookieJar,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
        origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
        "x-idempotency-key": buildIdempotencyKey("switch-denied")
      },
      body: JSON.stringify({
        parkId: deniedParkId || "context-switch-denied-park",
        ...(session.refreshToken ? { refreshToken: session.refreshToken } : {})
      })
    });
    const denialLabel = deniedParkId ? "existing denied park" : "missing park";
    if (!expectStatus(`POST /auth/switch-context rejects ${denialLabel}`, denied.response.status, [400, 401, 403, 404], denied.body)) return;

    const switched = await switchContext({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      targetParkId,
      cookieJar,
      label: "to target park"
    });
    if (!switched) return;
    session = switched;
    currentParkId = targetParkId;

    const switchedMe = await getMe(session.accessToken, "after switch");
    if (!switchedMe) return;
    if (switchedMe.current_park?.park_id !== targetParkId || switchedMe.park_id !== targetParkId) {
      fail(`Switched /auth/me does not report target park ${targetParkId}; body=${summarizeBody(switchedMe)}`);
      return;
    }
    pass("Switched /auth/me reports the target park context");

    building = await resolveBuilding(session.accessToken, targetParkId);
    if (!building) return;
    floor = await resolveFloor(session.accessToken, building.id, targetParkId);
    if (!floor) return;
    unit = await resolveUnit(session.accessToken, building.id, floor.id, targetParkId);
    if (!unit) return;
    if (!await verifyTargetAssetsVisible(session.accessToken, building, floor, unit, targetParkId)) return;

    const switchedBack = await switchContext({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      targetParkId: parkId,
      cookieJar,
      label: "back to default park"
    });
    if (!switchedBack) return;
    session = switchedBack;
    currentParkId = parkId;

    const defaultBuildings = await request(`/buildings?page=1&page_size=20&keyword=${encodeURIComponent(building.buildingName)}`, {
      headers: { authorization: `Bearer ${session.accessToken}` }
    });
    if (!expectStatus("GET /buildings after switching back", defaultBuildings.response.status, 200, defaultBuildings.body)) return;
    const buildingPage = unwrapData(defaultBuildings.body);
    const defaultItems = Array.isArray(buildingPage?.items) ? buildingPage.items : [];
    if (defaultItems.some((item) => item?.id === building.id || item?.parkId === targetParkId)) {
      fail(`Target park building leaked into default context; body=${summarizeBody(defaultBuildings.body)}`);
      return;
    }
    pass("Default context list does not show target park building");

    const defaultFloors = await request(`/floors?page=1&page_size=20&keyword=${encodeURIComponent(contextFloorCode)}`, {
      headers: { authorization: `Bearer ${session.accessToken}` }
    });
    if (!expectStatus("GET /floors after switching back", defaultFloors.response.status, 200, defaultFloors.body)) return;
    const floorPage = unwrapData(defaultFloors.body);
    const floorItems = Array.isArray(floorPage?.items) ? floorPage.items : [];
    if (floorItems.some((item) => item?.id === floor.id || item?.parkId === targetParkId)) {
      fail(`Target park floor leaked into default context; body=${summarizeBody(defaultFloors.body)}`);
      return;
    }
    pass("Default context list does not show target park floor");

    const defaultUnits = await request(`/park-units?page=1&page_size=20&keyword=${encodeURIComponent(contextUnitCode)}`, {
      headers: { authorization: `Bearer ${session.accessToken}` }
    });
    if (!expectStatus("GET /park-units after switching back", defaultUnits.response.status, 200, defaultUnits.body)) return;
    const unitPage = unwrapData(defaultUnits.body);
    const unitItems = Array.isArray(unitPage?.items) ? unitPage.items : [];
    if (unitItems.some((item) => item?.id === unit.id || item?.parkId === targetParkId || item?.park_id === targetParkId)) {
      fail(`Target park unit leaked into default context; body=${summarizeBody(defaultUnits.body)}`);
      return;
    }
    pass("Default context list does not show target park unit");

    if (!await cleanupCreatedTargetAssets({ session, currentParkId, targetParkId, cookieJar, unit, floor, building })) return;
    unit = null;
    floor = null;
    building = null;

    console.log("[PASS] first release context-switch regression completed");
  } finally {
    if (targetParkId && (unit?.id || floor?.id || building?.id)) {
      await cleanupCreatedTargetAssets({ session, currentParkId, targetParkId, cookieJar, unit, floor, building });
    }
  }
}

run().catch((error) => {
  fail(`Unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
});
