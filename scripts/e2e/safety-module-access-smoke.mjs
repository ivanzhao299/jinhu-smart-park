import { randomUUID } from "node:crypto";

const apiBase = process.env.SAFETY_SMOKE_API_BASE_URL ?? process.env.E2E_API_BASE ?? "http://127.0.0.1:3001/api/v1";
const tenantId = process.env.SAFETY_SMOKE_TENANT_ID ?? process.env.E2E_TENANT_ID ?? "10000001";
const parkId = process.env.SAFETY_SMOKE_PARK_ID ?? process.env.E2E_PARK_ID ?? "20000001";

const adminAccount = accountFromEnv("ADMIN", true);
const normalAccount = accountFromEnv("NORMAL", false);
const unauthorizedAccount = accountFromEnv("UNAUTHORIZED", false);
const enterpriseAccount = accountFromEnv("ENTERPRISE", false);

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
  "safety_inspect_task:manage_all",
  "safety_hazard:delete",
  "safety_hazard:close",
  "safety_emergency:delete",
  "safety_emergency:close",
  "safety_emergency:review",
  "safety_work_permit:delete",
  "safety_work_permit:void",
  "safety_work_permit:stop",
  "safety_work_permit:close",
  "video_alert:close"
];

let failures = 0;
let skips = 0;

function accountFromEnv(kind, required) {
  const username = process.env[`SAFETY_SMOKE_${kind}_USERNAME`];
  const password = process.env[`SAFETY_SMOKE_${kind}_PASSWORD`];
  return { kind, username, password, required };
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function fail(message) {
  failures += 1;
  console.error(`[FAIL] ${message}`);
}

function skip(message) {
  skips += 1;
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

function permissionSet(userContext) {
  return new Set(Array.isArray(userContext?.permissions) ? userContext.permissions : []);
}

function hasPermission(userContext, permission) {
  const permissions = permissionSet(userContext);
  return userContext?.is_super === true || userContext?.isSuper === true || permissions.has("*") || permissions.has(permission);
}

function hasAllPermissions(userContext, permissions) {
  return permissions.every((permission) => hasPermission(userContext, permission));
}

function hasAnyHighRiskPermission(userContext) {
  return highRiskPermissions.some((permission) => hasPermission(userContext, permission));
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, options);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text();
  return { response, body };
}

async function login(account) {
  if (!account.username || !account.password) {
    const message = `${account.kind.toLowerCase()} account is not configured`;
    if (account.required) fail(message);
    else skip(message);
    return null;
  }

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
  if ([401, 403].includes(result.response.status)) {
    fail(`${label} ${path} unexpectedly rejected with HTTP ${result.response.status}; body=${summarizeBody(result.body)}`);
    return;
  }
  if (result.response.status >= 500) {
    fail(`${label} ${path} returned server error HTTP ${result.response.status}; body=${summarizeBody(result.body)}`);
    return;
  }
  pass(`${label} ${path} HTTP ${result.response.status}`);
}

async function expectRejected(label, token, path) {
  const result = await request(path, { headers: { authorization: `Bearer ${token}` } });
  if (![401, 403].includes(result.response.status)) {
    fail(`${label} ${path} expected HTTP 401 or 403, got ${result.response.status}; body=${summarizeBody(result.body)}`);
    return;
  }
  pass(`${label} ${path} rejected with HTTP ${result.response.status}`);
}

function expectMenus(label, userContext, expectedHrefs) {
  const hrefs = new Set(flattenMenuHrefs(getMenuTree(userContext)));
  for (const href of expectedHrefs) {
    if (!hrefs.has(href)) fail(`${label} menu missing ${href}`);
    else pass(`${label} menu contains ${href}`);
  }
}

function expectMenuHidden(label, userContext, href) {
  const hrefs = new Set(flattenMenuHrefs(getMenuTree(userContext)));
  if (hrefs.has(href)) fail(`${label} menu unexpectedly contains ${href}`);
  else pass(`${label} menu hides ${href}`);
}

function verifyOperationsTerminal(label, userContext) {
  if (hasPermission(userContext, "safety_inspect_task:my")) {
    expectMenus(label, userContext, ["/operations/terminal", "/safety/my-inspect-tasks"]);
    if (hasPermission(userContext, "safety_inspect_task:manage_all")) {
      fail(`${label} has safety_inspect_task:manage_all; this smoke expects my-task access without manage_all`);
    } else {
      pass(`${label} does not require safety_inspect_task:manage_all for operations terminal`);
    }
  } else {
    expectMenuHidden(label, userContext, "/operations/terminal");
  }
}

async function verifyOverdueHazards(label, token, userContext) {
  if (hasPermission(userContext, "safety_hazard:overdue")) {
    expectMenus(label, userContext, ["/safety/hazards/overdue"]);
    await expectReadAllowed(label, token, "/safety/hazards/overdue?page=1&page_size=1");
    return;
  }

  if (hasPermission(userContext, "safety_hazard:read")) {
    expectMenuHidden(label, userContext, "/safety/hazards/overdue");
    await expectRejected(label, token, "/safety/hazards/overdue?page=1&page_size=1");
  } else {
    expectMenuHidden(label, userContext, "/safety/hazards/overdue");
  }
}

async function verifyEmergencyDashboard(label, token, userContext) {
  const required = ["safety_emergency_statistics:read", "safety_work_permit_statistics:read"];
  if (hasAllPermissions(userContext, required)) {
    expectMenus(label, userContext, ["/safety/emergency-dashboard"]);
    await expectReadAllowed(label, token, "/safety/emergency-work-permit-statistics");
    return;
  }

  if (required.some((permission) => hasPermission(userContext, permission))) {
    expectMenuHidden(label, userContext, "/safety/emergency-dashboard");
    await expectRejected(label, token, "/safety/emergency-work-permit-statistics");
  } else {
    expectMenuHidden(label, userContext, "/safety/emergency-dashboard");
  }
}

function verifyEnterpriseScope(userContext) {
  if (!userContext) return;
  const dataScope = userContext.data_scope ?? userContext.dataScope ?? "";
  if (userContext.is_super === true || userContext.isSuper === true || permissionSet(userContext).has("*")) {
    fail("enterprise user unexpectedly has super access");
  } else {
    pass("enterprise user is not super");
  }
  if (dataScope === "all") {
    fail("enterprise user data scope is all");
  } else {
    pass(`enterprise user data scope is constrained (${dataScope || "unspecified"})`);
  }
  if (hasAnyHighRiskPermission(userContext)) {
    fail("enterprise user unexpectedly has high-risk safety/video permission");
  } else {
    pass("enterprise user has no checked high-risk safety/video permissions");
  }
}

async function verifyUserAccount(account, label) {
  const token = await login(account);
  if (!token) return null;
  const userContext = await fetchCurrentUser(label, token);
  if (!userContext) return null;
  verifyOperationsTerminal(label, userContext);
  await verifyOverdueHazards(label, token, userContext);
  await verifyEmergencyDashboard(label, token, userContext);
  return { token, userContext };
}

async function main() {
  console.log(`[INFO] safety module access smoke apiBase=${apiBase}`);

  const adminToken = await login(adminAccount);
  if (!adminToken) {
    throw new Error("admin account is required for safety module access smoke");
  }
  const adminContext = await fetchCurrentUser("admin", adminToken);
  if (!adminContext) {
    throw new Error("admin /auth/me is required for safety module access smoke");
  }

  expectMenus("admin", adminContext, adminMenuHrefs);
  for (const check of readApiChecks) {
    await expectReadAllowed(`admin ${check.name}`, adminToken, check.path);
  }

  await verifyUserAccount(normalAccount, "normal user");
  const unauthorized = await verifyUserAccount(unauthorizedAccount, "unauthorized user");
  if (unauthorized) {
    for (const path of ["/safety/hazards/overdue?page=1&page_size=1", "/safety/emergency-work-permit-statistics"]) {
      await expectRejected("unauthorized user direct API", unauthorized.token, path);
    }
  }

  const enterprise = await verifyUserAccount(enterpriseAccount, "enterprise user");
  if (enterprise) {
    verifyEnterpriseScope(enterprise.userContext);
  }

  if (failures > 0) {
    throw new Error(`safety module access smoke failed: ${failures} failure(s), ${skips} skip(s)`);
  }
  console.log(`[PASS] safety module access smoke completed with ${skips} skip(s)`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
