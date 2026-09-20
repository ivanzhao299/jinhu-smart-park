// Synthetic, loopback-only API for the real /hr/employees page. No database access.
import { createServer } from "node:http";
import process from "node:process";
import { URL } from "node:url";
import { log } from "node:console";

if (process.env.HR_FAMILY_VISUAL_UAT !== "yes") {
  throw new Error("HR_FAMILY_VISUAL_UAT=yes is required");
}
const employeeId = "00000000-0000-4000-8000-000000000101";
const userId = "00000000-0000-4000-8000-000000000102";
const employee = {
  id: employeeId, userId, employeeCode: "SYNTHETIC-001", fullName: "合成验收员工",
  employmentType: "full_time", employmentStatus: "active", workLocation: "合成验收环境",
};
const family = {
  id: "synthetic-family-1", relationship: "母亲", fullNameMasked: "合成**", identityMasked: null,
  contactMasked: "SYNTHETIC-****", isEmergencyContact: false, birthDate: "1960-02-29",
  workUnit: "合成验收单位（仅测试）", jobTitle: "合成岗位", politicalStatus: "合成类别",
};
const modes = new Set(["full", "masked", "denied", "empty", "nulls", "long"]);
const token = mode => `synthetic-family-visual-${mode}`;
function user(mode) {
  const self = mode === "masked";
  const permissions = ["hr", "hr:employees",
    self ? "hr:employee:self_read" : "hr:employee:read",
    self ? "hr:employee_record:self_read" : "hr:employee_record:read",
    ...(mode !== "denied" && !self ? ["hr:employee_family:read"] : [])];
  return {
    id: userId, username: `synthetic_${mode}`, real_name: "合成家庭档案验收员",
    tenant_id: "synthetic-tenant", park_id: "synthetic-park", org_id: null, org_name: null,
    roles: [{ role_code: "SYNTHETIC_HR", role_name: "合成验收角色" }], permissions,
    enabled_modules: [{ module_code: "hr", enabled: true }], data_scope: "park", is_super: false,
    menus: [{ id: "synthetic-hr-employees", parent_id: null, menu_name: "员工档案", menu_type: "C",
      path: "/hr/employees", permission: "hr:employees", sort: 1, visible: true, status: "enabled" }],
  };
}
function records(mode) {
  const full = { ...family, fullName: "合成家庭成员", contact: "SYNTHETIC-CONTACT" };
  const rows = mode === "empty" || mode === "denied" ? [] : mode === "masked" ? [family]
    : mode === "nulls" ? [{ ...full, fullName: null, contact: null, birthDate: null, workUnit: null,
      jobTitle: null, politicalStatus: null, fullNameMasked: "", contactMasked: null }]
    : mode === "long" ? [{ ...full, workUnit: "SYNTHETIC-LONG-".repeat(20), jobTitle: "合成岗位".repeat(25) }]
    : [full];
  return { employeeId, experiences: [], skills: [], credentials: [], family: rows,
    fieldAccess: { family: mode !== "denied", credential: false } };
}
const send = (response, data, status = 200) => response.writeHead(status, {
  "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
}).end(JSON.stringify({ code: status === 200 ? 0 : status, message: "synthetic fixture", data }));
const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? "/", "http://127.0.0.1:4207").pathname;
  if (request.method === "GET" && path === "/health") return send(response, { synthetic: true });
  if (request.method === "GET" && path === "/api/v1/tenants/public/branding") {
    return send(response, { systemName: "HR 家庭档案合成验收", shortName: "合成验收", logoUrl: null });
  }
  if (request.method === "POST" && path === "/api/v1/auth/login") {
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 4096) return send(response, null, 413);
    }
    let mode;
    try { mode = JSON.parse(raw).username; } catch { return send(response, null, 400); }
    if (!modes.has(mode)) return send(response, null, 401);
    return send(response, { accessToken: token(mode), user: { id: userId, username: `synthetic_${mode}` } });
  }
  if (request.method === "POST" && path === "/api/v1/auth/logout") return send(response, null);
  if (request.method !== "GET") return send(response, null, 405);
  const authorization = request.headers.authorization ?? "";
  const mode = [...modes].find(value => authorization === `Bearer ${token(value)}`);
  if (!mode) return send(response, null, 401);
  if (path === "/api/v1/users/me") return send(response, user(mode));
  if (path === "/api/v1/hr/employees") return send(response, { items: [employee], total: 1, page: 1, page_size: 100 });
  if (path === "/api/v1/hr/employees/me" || path === `/api/v1/hr/employees/${employeeId}`) return send(response, employee);
  if (path === `/api/v1/hr/employees/${employeeId}/records`) return send(response, records(mode));
  return send(response, null, 404);
});
server.listen(4207, "127.0.0.1", () => log("HR_FAMILY_SYNTHETIC_API_READY 127.0.0.1:4207"));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close());
