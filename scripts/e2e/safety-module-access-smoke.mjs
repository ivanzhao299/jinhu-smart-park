import { randomUUID } from "node:crypto";

const allowedEnvironments = new Set(["local", "test", "staging", "ci"]);
const environment = process.env.SAFETY_SMOKE_ENVIRONMENT;
const apiBase = process.env.SAFETY_SMOKE_API_BASE_URL ?? process.env.E2E_API_BASE ?? "http://127.0.0.1:3001/api/v1";
const tenantId = process.env.SAFETY_SMOKE_TENANT_ID ?? process.env.E2E_TENANT_ID ?? "10000001";
const parkId = process.env.SAFETY_SMOKE_PARK_ID ?? process.env.E2E_PARK_ID ?? "20000001";
const allowPartialMatrix = process.env.SAFETY_SMOKE_ALLOW_PARTIAL_MATRIX === "true";
const allowEnterpriseScopeUnverified = process.env.SAFETY_SMOKE_ALLOW_ENTERPRISE_SCOPE_UNVERIFIED === "true";
const enterpriseScopeEndpoint = process.env.SAFETY_SMOKE_ENTERPRISE_SCOPED_ENDPOINT ?? "/safety/hazards?page=1&page_size=5";

const expectedEnterpriseScope = {
  tenantId: process.env.SAFETY_SMOKE_ENTERPRISE_EXPECTED_TENANT_ID ?? tenantId,
  parkId: process.env.SAFETY_SMOKE_ENTERPRISE_EXPECTED_PARK_ID ?? parkId,
  enterpriseId: process.env.SAFETY_SMOKE_ENTERPRISE_EXPECTED_ENTERPRISE_ID
};

const accountKinds = ["ADMIN", "NORMAL", "UNAUTHORIZED", "ENTERPRISE", "OVERDUE_HAZARD", "DUAL_STATISTICS", "SINGLE_STATISTICS"];
const accounts = Object.fromEntries(accountKinds.map((kind) => [kind, accountFromEnv(kind)]));

const adminMenuHrefs = [
  "/operations/terminal",
  "/safety/hazards/overdue",
  "/safety/emergency-dashboard",
  "/safety/dashboard",
  "/safety/inspect-tasks",
  "/safety/my-inspect-tasks",
  "/safety/hazards",
  "/safety/emergencies",
  "/safety/work-permits",
  "/admin/video-security/dashboard",
  "/admin/video-security/alerts"
];

const readApiChecks = [
  { name: "safety dashboard statistics", path: "/safety/statistics" },
  { name: "inspect tasks", path: "/safety/inspect-tasks?page=1&page_size=1" },
  { name: "my inspect tasks", path: "/safety/my-inspect-tasks?page=1&page_size=1" },
  { name: "hazards", path: "/safety/hazards?page=1&page_size=1" },
  { name: "overdue hazards", path: "/safety/hazards/overdue?page=1&page_size=1" },
  { name: "emergency work permit statistics", path: "/safety/emergency-work-permit-statistics" },
  { name: "emergencies", path: "/safety/emergencies?page=1&page_size=1" },
  { name: "work permits", path: "/safety/work-permits?page=1&page_size=1" },
  { name: "video dashboard overview", path: "/video-security/dashboard/overview" },
  { name: "video alerts", path: "/video-security/alerts?page=1&page_size=1" }
];

const highRiskPermissions = [
  "safety_inspect_point:delete",
  "safety_inspect_template:delete",
  "safety_inspect_item:delete",
  "safety_inspect_plan:delete",
  "safety_inspect_task:manage_all",
  "safety_hazard:delete",
  "safety_hazard:reject_rectify",
  "safety_hazard:close",
  "safety_hazard:force_close",
  "safety_hazard:manage_all",
  "safety_emergency_contact:delete",
  "safety_emergency_plan:delete",
  "safety_emergency:delete",
  "safety_emergency:review",
  "safety_emergency:close",
  "safety_work_permit:delete",
  "safety_work_permit:override_conflict",
  "safety_work_permit:approve_property",
  "safety_work_permit:approve_safety",
  "safety_work_permit:approve_operation",
  "safety_work_permit:reject",
  "safety_work_permit:void",
  "safety_work_permit:stop",
  "safety_work_permit:close",
  "safety_work_permit:create_hazard",
  "video_alert:process",
  "video_alert:close",
  "video_alert:create_inspection",
  "video_alert:create_hazard",
  "video_camera:delete",
  "video_camera:capture_snapshot",
  "video_camera:create_inspection_issue",
  "video_platform_config:create",
  "video_platform_config:update",
  "video_platform_config:delete",
  "video_evidence:create",
  "video_evidence:delete"
];

let failures = 0;
const skippedAccounts = [];
const blockedReasons = [];

function accountFromEnv(kind) {
  return {
    kind,
    username: process.env[`SAFETY_SMOKE_${kind}_USERNAME`],
    password: process.env[`SAFETY_SMOKE_${kind}_PASSWORD`]
  };
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function fail(message) {
  failures += 1;
  console.error(`[FAIL] ${message}`);
}

function skip(message) {
  console.log(`[SKIP] ${message}`);
}

function summarizeBody(body) {
  if (body === null || body === undefined) return String(body);
  if (typeof body === "string") return body.slice(0, 500);
  return JSON.stringify(body).slice(0, 500);
}

function unwrapData(body) {
  if (body && typeof body === "object" && Object.hasOwn(body, "data")) return body.data;
  return body;
}

function flattenMenuHrefs(nodes = []) {
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((node) => [node?.href, ...flattenMenuHrefs(node?.children ?? [])]).filter(Boolean);
}

function getMenuTree(userContext) {
  return userContext?.menu_tree ?? userContext?.menus ?? [];
}

function menuHrefs(userContext) {
  return new Set(flattenMenuHrefs(getMenuTree(userContext)));
}

function permissionSet(userContext) {
  return new Set(Array.isArray(userContext?.permissions) ? userContext.permissions : []);
}

function isSuper(userContext) {
  return userContext?.is_super === true || userContext?.isSuper === true || permissionSet(userContext).has("*");
}

function hasPermission(userContext, permission) {
  return isSuper(userContext) || permissionSet(userContext).has(permission);
}

function hasAllPermissions(userContext, permissions) {
  return permissions.every((permission) => hasPermission(userContext, permission));
}

function highRiskMatches(userContext) {
  const permissions = permissionSet(userContext);
  if (isSuper(userContext)) return ["*"];
  return highRiskPermissions.filter((permission) => permissions.has(permission));
}

function assertNoHighRiskPermissions(label, userContext) {
  const matches = highRiskMatches(userContext);
  if (matches.length > 0) {
    fail(`${label} unexpectedly has high-risk safety/video permission(s): ${matches.join(", ")}`);
    return;
  }
  pass(`${label} has no checked high-risk safety/video permissions`);
}

function assertMenuContains(label, userContext, href) {
  if (!menuHrefs(userContext).has(href)) fail(`${label} menu missing ${href}`);
  else pass(`${label} menu contains ${href}`);
}

function assertMenuHidden(label, userContext, href) {
  if (menuHrefs(userContext).has(href)) fail(`${label} menu unexpectedly contains ${href}`);
  else pass(`${label} menu hides ${href}`);
}

function assertHasPermission(label, userContext, permission) {
  if (!hasPermission(userContext, permission)) fail(`${label} missing required permission ${permission}`);
  else pass(`${label} has ${permission}`);
}

function assertLacksPermission(label, userContext, permission) {
  if (hasPermission(userContext, permission)) fail(`${label} unexpectedly has ${permission}`);
  else pass(`${label} lacks ${permission}`);
}

function assertTargetGuard() {
  if (!environment || !allowedEnvironments.has(environment)) {
    fail(`SAFETY_SMOKE_ENVIRONMENT must be one of ${[...allowedEnvironments].join(", ")} before any network request`);
    return false;
  }

  let parsed;
  try {
    parsed = new URL(apiBase);
  } catch {
    fail(`SAFETY_SMOKE_API_BASE_URL is not a valid URL: ${apiBase}`);
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  const urlText = parsed.href.toLowerCase();
  const privateHost = isLocalOrPrivateHost(host);
  const namedNonProductionHost = /(local|localhost|dev|test|testing|stage|staging|ci|qa|uat)/.test(host);
  const productionMarker = /(^|[.-])(prod|production)([.-]|$)/.test(host) || urlText.includes("prod.");

  if (productionMarker) {
    fail(`API target appears to be production-like: ${parsed.origin}`);
    return false;
  }
  if (!privateHost && !namedNonProductionHost) {
    fail(`API target host is not clearly local/test/staging/ci: ${parsed.origin}`);
    return false;
  }
  pass(`API target guard accepted ${parsed.origin} for ${environment}`);
  return true;
}

function isLocalOrPrivateHost(host) {
  if (["localhost", "127.0.0.1", "::1"].includes(host)) return true;
  if (host.endsWith(".local")) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function validateAccountMatrix() {
  let ok = true;
  for (const kind of accountKinds) {
    const account = accounts[kind];
    if (account.username && account.password) continue;
    const message = `${kind.toLowerCase()} account is not configured`;
    if (kind === "ADMIN" || !allowPartialMatrix) {
      fail(`${message}; full phase 2b smoke requires ADMIN, NORMAL, UNAUTHORIZED, ENTERPRISE, OVERDUE_HAZARD, DUAL_STATISTICS, and SINGLE_STATISTICS accounts`);
      ok = false;
    } else {
      skippedAccounts.push(kind);
      skip(`${message}; SAFETY_SMOKE_ALLOW_PARTIAL_MATRIX=true, result is not a full phase 2b pass`);
    }
  }
  if (allowPartialMatrix && skippedAccounts.length > 0) {
    console.log(`[INFO] partial matrix skips: ${skippedAccounts.join(", ")}; do not use this run as complete phase 2b evidence`);
    blockedReasons.push(`partial account matrix: ${skippedAccounts.join(", ")}`);
  }
  if (!expectedEnterpriseScope.enterpriseId) {
    const message = "SAFETY_SMOKE_ENTERPRISE_EXPECTED_ENTERPRISE_ID is required for full phase 2b enterprise cross-subject scope verification";
    if (allowEnterpriseScopeUnverified) {
      skip(`${message}; SAFETY_SMOKE_ALLOW_ENTERPRISE_SCOPE_UNVERIFIED=true, result is debug-only`);
      blockedReasons.push("enterprise expected enterprise id missing");
    } else {
      fail(message);
      ok = false;
    }
  }
  if (allowEnterpriseScopeUnverified) {
    blockedReasons.push("enterprise scope unverified override enabled");
  }
  return ok;
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, options);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text();
  return { response, body };
}

async function login(account) {
  const result = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `safety-access-smoke-login-${randomUUID()}` },
    body: JSON.stringify({ tenantId, parkId, username: account.username, password: account.password })
  });

  if (result.response.status !== 200) {
    fail(`${account.kind.toLowerCase()} login expected HTTP 200, got ${result.response.status}; body=${summarizeBody(result.body)}`);
    return null;
  }

  const token = unwrapData(result.body)?.accessToken;
  if (!token) {
    fail(`${account.kind.toLowerCase()} login did not return accessToken; body=${summarizeBody(result.body)}`);
    return null;
  }

  pass(`${account.kind.toLowerCase()} login`);
  return token;
}

async function fetchCurrentUser(label, token) {
  const result = await request("/auth/me", { headers: { authorization: `Bearer ${token}` } });
  if (result.response.status !== 200) {
    fail(`${label} /auth/me expected HTTP 200, got ${result.response.status}; body=${summarizeBody(result.body)}`);
    return null;
  }
  const context = unwrapData(result.body);
  if (!context?.id) {
    fail(`${label} /auth/me did not return user id; body=${summarizeBody(result.body)}`);
    return null;
  }
  pass(`${label} /auth/me`);
  return context;
}

async function expectReadAllowed(label, token, path) {
  const result = await request(path, { headers: { authorization: `Bearer ${token}` } });
  if (result.response.status < 200 || result.response.status >= 300) {
    fail(`${label} ${path} expected HTTP 2xx, got ${result.response.status}; body=${summarizeBody(result.body)}`);
    return null;
  }
  pass(`${label} ${path} HTTP ${result.response.status}`);
  return unwrapData(result.body);
}

async function expectRejected(label, token, path) {
  const result = await request(path, { headers: { authorization: `Bearer ${token}` } });
  if (![401, 403].includes(result.response.status)) {
    fail(`${label} ${path} expected HTTP 401 or 403, got ${result.response.status}; body=${summarizeBody(result.body)}`);
    return;
  }
  pass(`${label} ${path} rejected with HTTP ${result.response.status}`);
}

async function loginAndFetchContext(account, label) {
  const token = await login(account);
  if (!token) return null;
  const userContext = await fetchCurrentUser(label, token);
  if (!userContext) return null;
  return { token, userContext };
}

async function verifyAdmin() {
  const context = await loginAndFetchContext(accounts.ADMIN, "admin");
  if (!context) return null;
  for (const href of adminMenuHrefs) assertMenuContains("admin", context.userContext, href);
  for (const check of readApiChecks) await expectReadAllowed(`admin ${check.name}`, context.token, check.path);
  return context;
}

async function verifyNormalUser() {
  if (shouldSkipAccount("NORMAL")) return null;
  const context = await loginAndFetchContext(accounts.NORMAL, "normal user");
  if (!context) return null;
  assertHasPermission("normal user", context.userContext, "safety_inspect_task:my");
  assertLacksPermission("normal user", context.userContext, "safety_inspect_task:manage_all");
  assertMenuContains("normal user", context.userContext, "/operations/terminal");
  assertMenuContains("normal user", context.userContext, "/safety/my-inspect-tasks");
  await expectReadAllowed("normal user my inspect tasks", context.token, "/safety/my-inspect-tasks?page=1&page_size=1");
  assertNoHighRiskPermissions("normal user", context.userContext);
  return context;
}

async function verifyUnauthorizedUser() {
  if (shouldSkipAccount("UNAUTHORIZED")) return null;
  const context = await loginAndFetchContext(accounts.UNAUTHORIZED, "unauthorized user");
  if (!context) return null;
  for (const href of ["/operations/terminal", "/safety/hazards/overdue", "/safety/emergency-dashboard"]) {
    assertMenuHidden("unauthorized user", context.userContext, href);
  }
  await expectRejected("unauthorized user direct API", context.token, "/safety/hazards/overdue?page=1&page_size=1");
  await expectRejected("unauthorized user direct API", context.token, "/safety/emergency-work-permit-statistics");
  assertNoHighRiskPermissions("unauthorized user", context.userContext);
  return context;
}

async function verifyOverdueHazardUser() {
  if (shouldSkipAccount("OVERDUE_HAZARD")) return null;
  const context = await loginAndFetchContext(accounts.OVERDUE_HAZARD, "overdue hazard user");
  if (!context) return null;
  assertHasPermission("overdue hazard user", context.userContext, "safety_hazard:overdue");
  assertMenuContains("overdue hazard user", context.userContext, "/safety/hazards/overdue");
  assertMenuHidden("overdue hazard user", context.userContext, "/safety/hazards");
  await expectReadAllowed("overdue hazard user overdue hazards", context.token, "/safety/hazards/overdue?page=1&page_size=1");
  await expectRejected("overdue hazard user normal hazards API", context.token, "/safety/hazards?page=1&page_size=1");
  assertLacksPermission("overdue hazard user", context.userContext, "safety_hazard:read");
  assertNoHighRiskPermissions("overdue hazard user", context.userContext);
  return context;
}

async function verifyDualStatisticsUser() {
  if (shouldSkipAccount("DUAL_STATISTICS")) return null;
  const context = await loginAndFetchContext(accounts.DUAL_STATISTICS, "dual statistics user");
  if (!context) return null;
  assertHasPermission("dual statistics user", context.userContext, "safety_emergency_statistics:read");
  assertHasPermission("dual statistics user", context.userContext, "safety_work_permit_statistics:read");
  assertMenuContains("dual statistics user", context.userContext, "/safety/emergency-dashboard");
  await expectReadAllowed("dual statistics user emergency work permit statistics", context.token, "/safety/emergency-work-permit-statistics");
  assertNoHighRiskPermissions("dual statistics user", context.userContext);
  return context;
}

async function verifySingleStatisticsUser() {
  if (shouldSkipAccount("SINGLE_STATISTICS")) return null;
  const context = await loginAndFetchContext(accounts.SINGLE_STATISTICS, "single statistics user");
  if (!context) return null;
  const hasEmergencyStats = hasPermission(context.userContext, "safety_emergency_statistics:read");
  const hasPermitStats = hasPermission(context.userContext, "safety_work_permit_statistics:read");
  if (hasEmergencyStats === hasPermitStats) {
    fail("single statistics user must have exactly one of safety_emergency_statistics:read or safety_work_permit_statistics:read");
  } else {
    pass("single statistics user has exactly one emergency/work-permit statistics permission");
  }
  assertMenuHidden("single statistics user", context.userContext, "/safety/emergency-dashboard");
  await expectRejected("single statistics user direct API", context.token, "/safety/emergency-work-permit-statistics");
  assertNoHighRiskPermissions("single statistics user", context.userContext);
  return context;
}

async function verifyEnterpriseUser() {
  if (shouldSkipAccount("ENTERPRISE")) return null;
  const context = await loginAndFetchContext(accounts.ENTERPRISE, "enterprise user");
  if (!context) return null;
  if (isSuper(context.userContext)) fail("enterprise user unexpectedly has super access");
  else pass("enterprise user is not super");

  const dataScope = context.userContext.data_scope ?? context.userContext.dataScope ?? "";
  if (dataScope === "all") fail("enterprise user data scope is all");
  else pass(`enterprise user data scope is constrained (${dataScope || "unspecified"})`);

  const data = await expectReadAllowed("enterprise user scoped endpoint", context.token, enterpriseScopeEndpoint);
  verifyEnterpriseScopedData(data);
  assertNoHighRiskPermissions("enterprise user", context.userContext);
  return context;
}

function shouldSkipAccount(kind) {
  if (!skippedAccounts.includes(kind)) return false;
  skip(`${kind.toLowerCase()} matrix checks skipped; partial matrix result is not a full phase 2b pass`);
  return true;
}

function verifyEnterpriseScopedData(data) {
  const records = extractRecords(data);
  if (records.length === 0) {
    if (allowEnterpriseScopeUnverified) {
      markEnterpriseScopeBlocked("enterprise scoped endpoint returned no records");
      return;
    }
    fail("enterprise scoped endpoint returned no records, so data scope could not be verified");
    return;
  }

  let scopedFieldCount = 0;
  for (const [index, record] of records.entries()) {
    const scopes = extractScopeFields(record);
    const presentScopeFieldCount = countPrimaryScopeFields(scopes);
    if (presentScopeFieldCount === 0) {
      handleUnverifiableEnterpriseRecord(index, record, "missing recognizable tenant, park, and enterprise scope fields");
      continue;
    }
    scopedFieldCount += presentScopeFieldCount;
    verifyScopeValue("tenant", scopes.tenantId, expectedEnterpriseScope.tenantId, record, index);
    verifyScopeValue("park", scopes.parkId, expectedEnterpriseScope.parkId, record, index);
    verifyScopeValue("enterprise", scopes.enterpriseId, expectedEnterpriseScope.enterpriseId, record, index);
  }

  if (scopedFieldCount === 0) {
    if (allowEnterpriseScopeUnverified) {
      markEnterpriseScopeBlocked("enterprise scoped endpoint returned no recognizable scope fields");
      return;
    }
    fail("enterprise scoped endpoint returned records without recognizable tenant/park/enterprise scope fields");
    return;
  }
  pass(`enterprise scoped endpoint exposed ${scopedFieldCount} recognizable scope field(s)`);
}

function countPrimaryScopeFields(scopes) {
  return [scopes.tenantId, scopes.parkId, scopes.enterpriseId].filter((value) => value !== undefined).length;
}

function handleUnverifiableEnterpriseRecord(index, record, reason) {
  const message = `enterprise scoped record #${index + 1} ${reason}; record=${summarizeBody(record)}`;
  if (allowEnterpriseScopeUnverified) {
    markEnterpriseScopeBlocked(message);
    return;
  }
  fail(message);
}

function extractRecords(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.list)) return data.list;
  return [];
}

function extractScopeFields(record) {
  return {
    tenantId: firstDefined(record, ["tenantId", "tenant_id"]),
    parkId: firstDefined(record, ["parkId", "park_id"]),
    enterpriseId: firstDefined(record, ["enterpriseId", "enterprise_id", "companyId", "company_id", "parkTenantId", "park_tenant_id"]),
    ownerId: firstDefined(record, ["ownerId", "owner_id"]),
    handlerId: firstDefined(record, ["handlerId", "handler_id"])
  };
}

function firstDefined(record, keys) {
  for (const key of keys) {
    if (record && record[key] !== undefined && record[key] !== null && record[key] !== "") return String(record[key]);
  }
  return undefined;
}

function verifyScopeValue(name, actual, expected, record, index) {
  if (!actual) {
    const message = `enterprise scoped record #${index + 1} missing ${name} scope field; record=${summarizeBody(record)}`;
    if (allowEnterpriseScopeUnverified) {
      markEnterpriseScopeBlocked(message);
      return;
    }
    fail(message);
    return;
  }
  if (expected === undefined) {
    const message = `enterprise scoped record #${index + 1} cannot verify ${name} scope because expected value is not configured`;
    if (allowEnterpriseScopeUnverified) {
      markEnterpriseScopeBlocked(message);
      return;
    }
    fail(message);
    return;
  }
  if (actual !== expected) {
    fail(`enterprise scoped record #${index + 1} ${name} scope mismatch: expected ${expected}, got ${actual}; record=${summarizeBody(record)}`);
    return;
  }
  pass(`enterprise scoped record #${index + 1} ${name} scope matches ${expected}`);
}

function markEnterpriseScopeBlocked(message) {
  skip(`${message}; SAFETY_SMOKE_ALLOW_ENTERPRISE_SCOPE_UNVERIFIED=true, result is debug-only`);
  blockedReasons.push(message);
}

async function main() {
  console.log(`[INFO] safety module access smoke apiBase=${apiBase}`);
  if (!assertTargetGuard()) throw new Error("API target guard failed before login");
  if (!validateAccountMatrix()) throw new Error("required safety smoke account matrix is incomplete");

  await verifyAdmin();
  await verifyNormalUser();
  await verifyUnauthorizedUser();
  await verifyOverdueHazardUser();
  await verifyDualStatisticsUser();
  await verifySingleStatisticsUser();
  await verifyEnterpriseUser();

  if (failures > 0) {
    throw new Error(`safety module access smoke failed: ${failures} failure(s), ${skippedAccounts.length} skipped account type(s)`);
  }
  if (blockedReasons.length > 0) {
    for (const reason of blockedReasons) {
      console.error(`[BLOCKED] ${reason}`);
    }
    throw new Error("safety module access smoke result is partial/debug-only and cannot be used as full phase 2b evidence");
  }
  console.log("[PASS] full safety module access smoke completed");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
