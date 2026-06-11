import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const snapshotPath = resolve(rootDir, "scripts/e2e/snapshots/first-release-api-snapshots.json");
const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001/api/v1";
const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "Jinhu@123456";
const tenantId = process.env.TENANT_ID ?? process.env.DEFAULT_TENANT_ID ?? "10000001";
const parkId = process.env.PARK_ID ?? process.env.DEFAULT_PARK_ID ?? "20000001";
const updateSnapshots = process.env.UPDATE_SNAPSHOTS === "true";
const snapshotMode = process.env.SNAPSHOT_MODE ?? "normalized";
const snapshotWorkorderNo = process.env.SNAPSHOT_WORKORDER_NO?.trim() ?? "";
const snapshotUnitNo = process.env.SNAPSHOT_UNIT_NO?.trim() ?? "";
const allowSnapshotFallback = process.env.ALLOW_SNAPSHOT_FALLBACK === "true";
const allowedSnapshotModes = new Set(["schema", "key-fields", "normalized"]);

const normalizedValue = "<normalized>";
const normalizedNumber = "<normalized-number>";
const dynamicFieldNames = new Set([
  "id",
  "uuid",
  "request_id",
  "trace_id",
  "token",
  "access_token",
  "refresh_token",
  "created_at",
  "updated_at",
  "create_time",
  "update_time",
  "createTime",
  "updateTime",
  "createBy",
  "updateBy",
  "statusUpdateBy",
  "createdAt",
  "updatedAt",
  "timestamp",
  "file_url"
]);

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
  if (body === null || body === undefined) {
    return "<empty>";
  }
  if (typeof body === "string") {
    return body.slice(0, 500);
  }
  try {
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return String(body).slice(0, 500);
  }
}

function summarizeSnapshot(value) {
  if (value === undefined) {
    return "<missing>";
  }
  return JSON.stringify(value, null, 2).slice(0, 1200);
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
      "x-request-id": `first-release-api-snapshots-${randomUUID()}`
    },
    body: JSON.stringify({
      tenantId,
      parkId,
      username,
      password
    })
  });
}

function extractList(body) {
  const data = unwrapData(body);
  if (Array.isArray(data)) {
    return { items: data, total: data.length, page: 1, page_size: data.length || 20 };
  }
  if (data && typeof data === "object" && Array.isArray(data.items)) {
    return data;
  }
  return null;
}

function assertNonEmptyPaginated(label, body) {
  const data = extractList(body);
  if (!data) {
    fail(`${label} body is not a paginated object or array; body=${summarizeBody(body)}`);
    return null;
  }
  if (!Array.isArray(data.items)) {
    fail(`${label} missing items array; body=${summarizeBody(body)}`);
    return null;
  }
  if (data.items.length === 0) {
    fail(`${label} returned no items; first-release snapshot regression requires at least one stable item`);
    return null;
  }
  pass(`${label} parsed with ${data.items.length} item(s)`);
  return data;
}

function getEntityId(label, item) {
  if (typeof item?.id === "string" && item.id.length > 0) {
    return item.id;
  }
  fail(`${label} snapshot sample did not include a usable id; item=${summarizeBody(item)}`);
  return null;
}

function summarizeSample(item, fields) {
  if (!isPlainObject(item)) return "<invalid>";
  const parts = [];
  for (const field of fields) {
    const value = item[field];
    if (typeof value === "string" && value.length > 0) {
      parts.push(`${field}=${value}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "<no diagnostic fields>";
}

function findByBusinessKey(items, businessKey, fields) {
  return items.find((item) => fields.some((field) => item?.[field] === businessKey)) ?? null;
}

function selectWorkorderSnapshotSample(items) {
  if (!snapshotWorkorderNo) {
    return items[0];
  }

  info(`Using workorder snapshot key: ${snapshotWorkorderNo}`);
  const matched = findByBusinessKey(items, snapshotWorkorderNo, ["woCode", "code"]);
  if (matched) {
    const matchedField = matched.woCode === snapshotWorkorderNo ? "woCode" : "code";
    info(`Matched workorder snapshot sample by ${matchedField}: ${summarizeSample(matched, ["woCode", "code", "title"])}`);
    return matched;
  }

  if (allowSnapshotFallback) {
    warn(
      `SNAPSHOT_WORKORDER_NO=${snapshotWorkorderNo} was not found; falling back to first item because ALLOW_SNAPSHOT_FALLBACK=true; fallback=${summarizeSample(
        items[0],
        ["woCode", "code", "title"]
      )}`
    );
    return items[0];
  }

  fail(
    `SNAPSHOT_WORKORDER_NO=${snapshotWorkorderNo} was not found and fallback is disabled; checked fields=woCode/code; first available=${summarizeSample(
      items[0],
      ["woCode", "code", "title"]
    )}`
  );
  return null;
}

function selectUnitSnapshotSample(items) {
  if (!snapshotUnitNo) {
    return items[0];
  }

  info(`Using unit snapshot key: ${snapshotUnitNo}`);
  const matched = findByBusinessKey(items, snapshotUnitNo, ["unitCode", "code"]);
  if (matched) {
    const matchedField = matched.unitCode === snapshotUnitNo ? "unitCode" : "code";
    info(`Matched unit snapshot sample by ${matchedField}: ${summarizeSample(matched, ["unitCode", "code", "unitName"])}`);
    return matched;
  }

  if (allowSnapshotFallback) {
    warn(
      `SNAPSHOT_UNIT_NO=${snapshotUnitNo} was not found; falling back to first item because ALLOW_SNAPSHOT_FALLBACK=true; fallback=${summarizeSample(
        items[0],
        ["unitCode", "code", "unitName"]
      )}`
    );
    return items[0];
  }

  fail(
    `SNAPSHOT_UNIT_NO=${snapshotUnitNo} was not found and fallback is disabled; checked fields=unitCode/code; first available=${summarizeSample(
      items[0],
      ["unitCode", "code", "unitName"]
    )}`
  );
  return null;
}

function itemCountCategory(items) {
  if (!Array.isArray(items) || items.length === 0) return "empty";
  if (items.length === 1) return "one";
  return "many";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sortedKeys(value) {
  if (!isPlainObject(value)) return [];
  return Object.keys(value).sort();
}

function isDynamicField(key) {
  if (dynamicFieldNames.has(key)) return true;
  if (key.endsWith("_id")) return true;
  if (key.endsWith("Id")) return true;
  return false;
}

function isFileLikeUrl(key, value) {
  if (typeof value !== "string") return false;
  if (key.endsWith("Url")) return true;
  if (key.endsWith("_url")) return true;
  if (key !== "url") return false;
  const lowerValue = value.toLowerCase();
  return (
    lowerValue.startsWith("http://") ||
    lowerValue.startsWith("https://") ||
    lowerValue.includes("/files/") ||
    lowerValue.includes("signature=") ||
    lowerValue.includes("x-amz-") ||
    lowerValue.includes("expires=")
  );
}

function normalizeValue(value, options = {}) {
  if (Array.isArray(value)) {
    if (options.preserveArrays) {
      return value.map((item) => normalizeValue(item, options)).sort(compareJson);
    }
    const firstItem = value.length > 0 ? normalizeValue(value[0], options) : null;
    return {
      type: "array",
      item_count_category: itemCountCategory(value),
      item_fields: value.length > 0 && isPlainObject(value[0]) ? sortedKeys(value[0]) : [],
      first_item: firstItem
    };
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const normalized = {};
  for (const key of sortedKeys(value)) {
    const fieldValue = value[key];
    if (isDynamicField(key) || isFileLikeUrl(key, fieldValue)) {
      normalized[key] = typeof fieldValue === "number" ? normalizedNumber : normalizedValue;
      continue;
    }
    if ((key.endsWith("Time") || key.endsWith("_time") || key.endsWith("Date") || key.endsWith("_date")) && typeof fieldValue === "string") {
      normalized[key] = normalizedValue;
      continue;
    }
    if (key === "total" || key === "total_pages") {
      normalized[key] = normalizedNumber;
      continue;
    }
    normalized[key] = normalizeValue(fieldValue, options);
  }
  return normalized;
}

function compareJson(left, right) {
  const leftJson = JSON.stringify(left);
  const rightJson = JSON.stringify(right);
  if (leftJson < rightJson) return -1;
  if (leftJson > rightJson) return 1;
  return 0;
}

function schemaOf(value) {
  if (Array.isArray(value)) {
    return {
      type: "array",
      item_count_category: itemCountCategory(value),
      item_schema: value.length > 0 ? schemaOf(value[0]) : null
    };
  }
  if (!isPlainObject(value)) {
    return typeof value;
  }
  const schema = {};
  for (const key of sortedKeys(value)) {
    schema[key] = schemaOf(value[key]);
  }
  return schema;
}

function pickKeys(source, candidates) {
  const result = {};
  if (!isPlainObject(source)) return result;
  for (const key of candidates) {
    if (key in source) {
      result[key] = normalizeValue(source[key], { preserveArrays: true });
    }
  }
  return result;
}

function keyFieldsSnapshot(name, data) {
  if (name === "workorders.list") {
    return listSnapshot(data, ["woCode", "wo_code", "title", "status", "woType", "wo_type", "priority"]);
  }
  if (name === "workorders.detail") {
    return pickKeys(data, ["woCode", "wo_code", "title", "status", "woType", "wo_type", "priority", "urgency", "sourceType", "source_type"]);
  }
  if (name === "workorders.logs") {
    return listSnapshot(data, ["action", "actionType", "action_type", "content", "operatorName", "operator_name"]);
  }
  if (name === "workorders.stats") {
    return normalizeValue(data, { preserveArrays: true });
  }
  if (name === "workorders.overdue") {
    return listSnapshot(data, ["woCode", "wo_code", "title", "status", "woType", "wo_type", "priority", "overdueFlag", "overdue_flag", "overdueReason", "overdue_reason"]);
  }
  if (name === "workorders.slaRules") {
    return listSnapshot(data, ["woType", "wo_type", "urgency", "priority", "dispatchSlaMin", "dispatch_sla_min", "finishSlaMin", "finish_sla_min", "status"]);
  }
  if (name === "units.list") {
    return listSnapshot(data, ["unitCode", "unit_code", "unitName", "unit_name", "unitNo", "unit_no", "rentalStatus", "rental_status", "usageType", "usage_type"]);
  }
  if (name === "units.detail") {
    return pickKeys(data, ["unitCode", "unit_code", "unitName", "unit_name", "unitNo", "unit_no", "rentalStatus", "rental_status", "usageType", "usage_type", "status"]);
  }
  if (name === "units.statistics") {
    return normalizeValue(data, { preserveArrays: true });
  }
  return normalizeValue(data);
}

function listSnapshot(data, keyFields = []) {
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  const firstItem = items.length > 0 ? items[0] : null;
  return {
    pagination: paginationSnapshot(data),
    item_count_category: itemCountCategory(items),
    item_fields: firstItem && isPlainObject(firstItem) ? sortedKeys(firstItem) : [],
    first_item: keyFields.length > 0 ? pickKeys(firstItem, keyFields) : normalizeValue(firstItem)
  };
}

function paginationSnapshot(data) {
  if (!isPlainObject(data)) return null;
  return {
    page: "page" in data ? data.page : null,
    page_size: "page_size" in data ? data.page_size : null,
    total: "total" in data ? normalizedNumber : null,
    total_pages: "total_pages" in data ? normalizedNumber : null
  };
}

function buildSnapshot(name, data, options = {}) {
  if (snapshotMode === "schema") {
    return schemaOf(data);
  }
  if (snapshotMode === "key-fields") {
    return keyFieldsSnapshot(name, data);
  }
  if (options.list) {
    return listSnapshot(data);
  }
  return normalizeValue(data, { preserveArrays: Boolean(options.preserveArrays) });
}

async function fetchJson(label, path, authHeaders) {
  const result = await request(path, { headers: authHeaders });
  if (!expectStatus(label, result.response.status, 200, result.body)) {
    return null;
  }
  return unwrapData(result.body);
}

async function collectSnapshots(authHeaders) {
  const snapshots = {};

  const workordersListResult = await request("/work-orders?page=1&page_size=10", { headers: authHeaders });
  if (!expectStatus("GET /work-orders", workordersListResult.response.status, 200, workordersListResult.body)) return null;
  const workordersList = assertNonEmptyPaginated("GET /work-orders response", workordersListResult.body);
  if (!workordersList) return null;
  const workorderSample = selectWorkorderSnapshotSample(workordersList.items);
  if (!workorderSample) return null;
  const workOrderId = getEntityId("GET /work-orders", workorderSample);
  if (!workOrderId) return null;
  snapshots["workorders.list"] = buildSnapshot("workorders.list", workordersList, { list: true });

  const workorderDetail = await fetchJson("GET /work-orders/:id", `/work-orders/${workOrderId}`, authHeaders);
  if (!workorderDetail) return null;
  snapshots["workorders.detail"] = buildSnapshot("workorders.detail", workorderDetail);

  const workorderLogsResult = await request(`/work-orders/${workOrderId}/logs?page=1&page_size=10`, { headers: authHeaders });
  if (!expectStatus("GET /work-orders/:id/logs", workorderLogsResult.response.status, 200, workorderLogsResult.body)) return null;
  const workorderLogs = extractList(workorderLogsResult.body);
  if (!workorderLogs) {
    fail(`GET /work-orders/:id/logs body is not a paginated object or array; body=${summarizeBody(workorderLogsResult.body)}`);
    return null;
  }
  snapshots["workorders.logs"] = buildSnapshot("workorders.logs", workorderLogs, { list: true });

  const workorderStats = await fetchJson("GET /work-orders/stats", "/work-orders/stats", authHeaders);
  if (!workorderStats) return null;
  snapshots["workorders.stats"] = buildSnapshot("workorders.stats", workorderStats, { preserveArrays: true });

  const workordersOverdueResult = await request("/work-orders/overdue?page=1&page_size=10", { headers: authHeaders });
  if (!expectStatus("GET /work-orders/overdue", workordersOverdueResult.response.status, 200, workordersOverdueResult.body)) return null;
  const workordersOverdue = extractList(workordersOverdueResult.body);
  if (!workordersOverdue) {
    fail(`GET /work-orders/overdue body is not a paginated object or array; body=${summarizeBody(workordersOverdueResult.body)}`);
    return null;
  }
  snapshots["workorders.overdue"] = buildSnapshot("workorders.overdue", workordersOverdue, { list: true });

  const workorderSlaRulesResult = await request("/work-orders/sla-rules?page=1&page_size=10", { headers: authHeaders });
  if (!expectStatus("GET /work-orders/sla-rules", workorderSlaRulesResult.response.status, 200, workorderSlaRulesResult.body)) return null;
  const workorderSlaRules = extractList(workorderSlaRulesResult.body);
  if (!workorderSlaRules) {
    fail(`GET /work-orders/sla-rules body is not a paginated object or array; body=${summarizeBody(workorderSlaRulesResult.body)}`);
    return null;
  }
  snapshots["workorders.slaRules"] = buildSnapshot("workorders.slaRules", workorderSlaRules, { list: true });

  const unitsListResult = await request("/park-units?page=1&page_size=10", { headers: authHeaders });
  if (!expectStatus("GET /park-units", unitsListResult.response.status, 200, unitsListResult.body)) return null;
  const unitsList = assertNonEmptyPaginated("GET /park-units response", unitsListResult.body);
  if (!unitsList) return null;
  const unitSample = selectUnitSnapshotSample(unitsList.items);
  if (!unitSample) return null;
  const unitId = getEntityId("GET /park-units", unitSample);
  if (!unitId) return null;
  snapshots["units.list"] = buildSnapshot("units.list", unitsList, { list: true });

  const unitDetail = await fetchJson("GET /park-units/:id", `/park-units/${unitId}`, authHeaders);
  if (!unitDetail) return null;
  snapshots["units.detail"] = buildSnapshot("units.detail", unitDetail);

  const unitsStatistics = await fetchJson("GET /park-units/statistics", "/park-units/statistics", authHeaders);
  if (!unitsStatistics) return null;
  snapshots["units.statistics"] = buildSnapshot("units.statistics", unitsStatistics, { preserveArrays: true });

  return {
    version: 1,
    name: "first-release-api-snapshots",
    mode: snapshotMode,
    snapshots
  };
}

async function readBaseline() {
  try {
    const content = await readFile(snapshotPath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function compareSnapshots(actual, expected) {
  const actualSnapshots = actual?.snapshots ?? {};
  const expectedSnapshots = expected?.snapshots ?? {};
  const names = Array.from(new Set([...Object.keys(actualSnapshots), ...Object.keys(expectedSnapshots)])).sort();
  const failures = [];
  for (const name of names) {
    const actualJson = JSON.stringify(actualSnapshots[name], null, 2);
    const expectedJson = JSON.stringify(expectedSnapshots[name], null, 2);
    if (actualJson !== expectedJson) {
      failures.push({ name, actual: actualSnapshots[name], expected: expectedSnapshots[name] });
    }
  }
  return failures;
}

async function writeBaseline(snapshot) {
  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

async function run() {
  if (!allowedSnapshotModes.has(snapshotMode)) {
    fail(`Unsupported SNAPSHOT_MODE=${snapshotMode}; expected schema, key-fields, or normalized`);
    return;
  }

  info(`API base: ${apiBaseUrl}`);
  info(`Tenant/Park: ${tenantId}/${parkId}`);
  info(`Snapshot mode: ${snapshotMode}`);
  info(`Update snapshots: ${updateSnapshots ? "true" : "false"}`);

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

  const actual = await collectSnapshots(authHeaders);
  if (!actual) return;

  if (updateSnapshots) {
    await writeBaseline(actual);
    pass(`Updated API snapshots baseline: ${snapshotPath}`);
    return;
  }

  const expected = await readBaseline();
  if (!expected) {
    fail(`Snapshot baseline not found at ${snapshotPath}. Run UPDATE_SNAPSHOTS=true node scripts/e2e/first-release-api-snapshots.mjs`);
    return;
  }

  if (expected.version !== actual.version || expected.name !== actual.name || expected.mode !== actual.mode) {
    fail(
      `Snapshot metadata mismatch; expected ${summarizeSnapshot({
        version: expected.version,
        name: expected.name,
        mode: expected.mode
      })}; actual ${summarizeSnapshot({ version: actual.version, name: actual.name, mode: actual.mode })}`
    );
    return;
  }

  const failures = compareSnapshots(actual, expected);
  if (failures.length > 0) {
    for (const mismatch of failures.slice(0, 5)) {
      fail(
        `Snapshot mismatch: ${mismatch.name}\nexpected=${summarizeSnapshot(mismatch.expected)}\nactual=${summarizeSnapshot(
          mismatch.actual
        )}\nRun UPDATE_SNAPSHOTS=true node scripts/e2e/first-release-api-snapshots.mjs to update the baseline if this change is expected.`
      );
    }
    if (failures.length > 5) {
      fail(`Snapshot mismatch output truncated; ${failures.length - 5} additional snapshot(s) differed`);
    }
    return;
  }

  pass("First-release API snapshots match baseline");
}

run().catch((error) => {
  fail(`Unexpected error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
});
