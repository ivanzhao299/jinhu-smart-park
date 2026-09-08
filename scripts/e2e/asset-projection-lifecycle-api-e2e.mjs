import { requirePropertyApiE2eIsolation } from "./property-api-e2e-safety.mjs";

requirePropertyApiE2eIsolation();

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001/api/v1";
const tenantId = process.env.TENANT_ID ?? process.env.DEFAULT_TENANT_ID ?? "10000001";
const parkId = process.env.PARK_ID ?? process.env.DEFAULT_PARK_ID ?? "20000001";
const username = process.env.ADMIN_USERNAME ?? "admin";
const password = process.env.ADMIN_PASSWORD ?? "Jinhu@123456";
const runId = process.env.TEST_RUN_ID;
let sequence = 0;

const unwrap = (body) => body && typeof body === "object" && "data" in body ? body.data : body;
const key = (action) => `asset-lifecycle-${action}-${runId}-${++sequence}`;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`[PASS] ${message}`);
};

async function request(path, { token, expectedStatus, idempotent = false, ...options } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const headers = { ...(options.headers ?? {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  if (idempotent) headers["x-idempotency-key"] = key(options.method ?? "request");
  if (options.body) {
    headers["content-type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers, signal: controller.signal });
    const body = (response.headers.get("content-type") ?? "").includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");
    if (expectedStatus !== undefined) {
      assert(response.status === expectedStatus, `${options.method ?? "GET"} ${path} returns ${expectedStatus}`);
      return unwrap(body);
    }
    if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path} -> ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
    console.log(`[PASS] ${options.method ?? "GET"} ${path} (${response.status})`);
    return unwrap(body);
  } finally {
    clearTimeout(timeout);
  }
}

async function run() {
  console.log(`[INFO] Asset projection lifecycle API E2E ${runId} against ${apiBaseUrl}`);
  const login = await request("/auth/login", { method: "POST", body: { tenantId, parkId, username, password } });
  const token = login.accessToken;
  assert(typeof token === "string" && token.length > 0, "authenticated through the real login API");

  const parks = await request("/assets/parks?page=1&page_size=100", { token });
  const assetPark = parks.items.find((item) => item.parkId === parkId) ?? parks.items[0];
  assert(assetPark?.id, "resolved the scoped physical asset park");
  const suffix = String(runId).replaceAll(/[^a-zA-Z0-9]/g, "").slice(-18);

  const building = await request("/assets/buildings", {
    method: "POST", token,
    body: { assetParkId: assetPark.id, buildingCode: `M01B${suffix}`, buildingName: `M01楼栋-${suffix}`, floorCount: 1, status: "enabled" }
  });
  const floor = await request("/assets/floors", {
    method: "POST", token,
    body: { buildingId: building.id, floorCode: `M01F${suffix}`, floorName: `M01楼层-${suffix}`, floorNo: 1, status: "enabled" }
  });
  const assetUnit = await request("/assets/units", {
    method: "POST", token,
    body: { floorId: floor.id, unitCode: `M01U${suffix}`, unitName: `M01房源-${suffix}`, unitNo: `M01-${suffix}`, buildingArea: 50, rentableArea: 40, status: "enabled" }
  });
  await request(`/assets/buildings/${building.id}/operating-building`, {
    method: "POST", token, idempotent: true, body: { mode: "create", reason: `M-01 ${runId}` }
  });
  await request(`/assets/floors/${floor.id}/operating-floor`, {
    method: "POST", token, idempotent: true, body: { mode: "create", reason: `M-01 ${runId}` }
  });
  const operatingUnit = await request(`/assets/units/${assetUnit.id}/operating-unit`, {
    method: "POST", token, idempotent: true,
    body: { usageType: 10, rentalStatus: 10, fittingStatus: 10, reason: `M-01 ${runId}` }
  });

  await request(`/assets/units/${assetUnit.id}`, { method: "DELETE", token, expectedStatus: 409 });
  const operation = await request(`/property/units/${operatingUnit.id}/operation`, { token });
  await request(`/property/units/${operatingUnit.id}/operation`, {
    method: "PUT", token, idempotent: true,
    body: {
      version: operation.version,
      operating_status: "disabled",
      suspend_reason: "M-01 生命周期停用解绑",
      asset_unit_id: null,
      remark: `M-01 ${runId}`
    }
  });
  await request(`/assets/units/${assetUnit.id}`, { method: "DELETE", token });
  await request(`/assets/units/${assetUnit.id}`, { token, expectedStatus: 404 });
  const restored = await request(`/assets/units/${assetUnit.id}/restore`, { method: "POST", token, idempotent: true });
  assert(restored.id === assetUnit.id, "restore returns the same physical source identity");
  const restoredDetail = await request(`/assets/units/${assetUnit.id}`, { token });
  assert(restoredDetail.id === assetUnit.id, "restored source is visible without a duplicate projection");

  await request(`/assets/units/${assetUnit.id}`, { method: "DELETE", token });
  console.log(`[PASS] Asset projection lifecycle API E2E ${runId}`);
}

await run();
