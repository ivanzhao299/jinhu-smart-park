import assert from "node:assert/strict";
import test from "node:test";
import { verifyYuzhouRealImportHttp, YuzhouRealImportHttpProbeError } from "../hr-cutover/yuzhou-real-import-http-probe.mjs";
import { cleanupYuzhouRealHttpLab, runYuzhouHttpFixtureTransaction, sanitizeYuzhouRealHttpLabFailure } from "../hr-cutover/yuzhou-real-http-lab-runtime.mjs";

const uuid = index => `00000000-0000-5000-8000-${String(index).padStart(12, "0")}`;
const config = { baseUrl: "http://127.0.0.1:3999/api/v1", scope: { tenantId: "fixture-tenant", parkId: "fixture-park" },
  authorizedCredentials: { username: "authorized", password: "fixture-password" }, deniedCredentials: { username: "denied", password: "fixture-denied" },
  expectedCounts: { employees: 45, contracts: 6, attendanceCalendars: 2, insurancePeriods: 1 } };
const domains = { "/hr/employees": "employees", "/hr/contracts": "contracts", "/hr/attendance/calendars": "attendanceCalendars", "/hr/insurance/periods": "insurancePeriods" };
function mock(defect) {
  const calls = [], responses = [];
  return { calls, responses, async fetch(url, init) {
    calls.push({ url, init });
    assert.equal(init.redirect, "error"); assert.equal(init.credentials, "omit"); assert(init.signal);
    if (defect === "network") throw new Error("PRIVATE credential body");
    const path = new URL(url).pathname.replace("/api/v1", ""), query = new URL(url).searchParams;
    const denied = init.headers.authorization === "Bearer denied-token", anonymous = !init.headers.authorization;
    let status = 200, data;
    if (path === "/auth/login") {
      assert.equal(init.method, "POST");
      const credentials = JSON.parse(init.body);
      assert.equal(credentials.tenantId, config.scope.tenantId); assert.equal(credentials.parkId, config.scope.parkId);
      data = { accessToken: `${credentials.username}-token`, tokenType: "Bearer" };
      if (defect === "context") data = { requiresContextSelection: true, loginTicket: "PRIVATE" };
    } else if (path === "/auth/me") {
      data = { id: uuid(denied ? 2 : 1), username: denied ? "denied" : "authorized", tenant_id: config.scope.tenantId, park_id: config.scope.parkId,
        permissions: denied ? ["system:user:me"] : ["system:user:me", "hr:employee:read", "hr:contract:read", "hr:attendance:read", "hr:insurance:read"], is_super: false };
      if (!denied && defect === "authorizedSuper") data.is_super = true;
      if (!denied && defect === "authorizedWildcard") data.permissions.push("*");
      if (!denied && defect === "authorizedMissingRead") data.permissions = data.permissions.filter(permission => permission !== "hr:insurance:read");
      if (!denied && defect === "authorizedWrite") data.permissions.push("hr:employee:manage");
      if (defect === "scope") data.park_id = "foreign";
      if (defect === "deniedPermissions" && denied) data.permissions.push("hr:employee:read");
      if (defect === "sameIdentity" && denied) data.id = uuid(1);
    } else if (anonymous || denied) {
      status = anonymous ? 401 : 403; data = null;
      if (defect === "deniedSuccess" && denied) { status = 200; data = { private: "PRIVATE" }; }
    } else if (domains[path]) {
      const total = config.expectedCounts[domains[path]], page = Number(query.get("page")), size = Number(query.get("page_size"));
      data = { total, page, page_size: size, items: Array.from({ length: Math.min(size, Math.max(0, total - (page - 1) * size)) }, (_, index) => ({ id: uuid((page - 1) * size + index + 1), private: "PRIVATE" })) };
      if (defect === "empty") data.items = [];
      if (defect === "overlap" && page === 2 && data.items.length) data.items[0].id = uuid(1);
      if (defect === "total") data.total += 1;
    } else data = { id: defect === "detailId" ? uuid(500) : path.split("/").at(-1), private: "PRIVATE" };
    const response = new Response(JSON.stringify({ code: status === 200 ? 0 : defect === "missingErrorCode" ? undefined : defect === "wrongErrorCode" ? 500 : status, data, message: status === 200 ? "success" : "denied" }),
      { status, headers: { "content-type": "application/json" } });
    responses.push(response); return response;
  } };
}

test("real login and identity routes, two separate users, four positive domains and guarded details; mock evidence explicit", async () => {
  const stub = mock();
  const result = await verifyYuzhouRealImportHttp({ ...config, fetchImpl: stub.fetch });
  assert.equal(result.status, "CONTRACT_PASS"); assert.equal(result.evidenceKind, "injected_fetch_contract");
  assert.equal(result.httpVerified, false); assert.equal(result.authenticationVerified, false);
  assert.equal(result.productionImport, "HOLD"); assert.deepEqual(result.observedCounts, config.expectedCounts);
  assert.equal(result.requestCount, 26); assert.equal(result.checks.length, 25);
  assert.equal(stub.calls.filter(call => call.init.method === "POST").length, 2);
  assert(stub.responses.every(response => response.bodyUsed));
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|token|password|fixture-tenant|authorized-token/);
});
for (const defect of ["authorizedSuper", "authorizedWildcard", "authorizedMissingRead", "authorizedWrite"]) {
  test(`${defect} fails least-privilege identity validation before business reads`, async () => {
    const stub = mock(defect);
    await assert.rejects(verifyYuzhouRealImportHttp({ ...config, fetchImpl: stub.fetch }), error =>
      error instanceof YuzhouRealImportHttpProbeError && error.code === "HR_HTTP_PROBE_AUTHORIZED_IDENTITY_INVALID" && error.message === error.code);
    assert.equal(stub.calls.length, 2);
    assert(stub.calls.every(call => new URL(call.url).pathname.startsWith("/api/v1/auth/")));
  });
}
for (const defect of ["network", "context", "scope", "deniedPermissions", "sameIdentity", "deniedSuccess", "empty", "overlap", "total", "detailId", "missingErrorCode", "wrongErrorCode"]) {
  test(`${defect} cannot produce a pass or expose response/credential details`, async () => {
    const stub = mock(defect);
    await assert.rejects(verifyYuzhouRealImportHttp({ ...config, fetchImpl: stub.fetch }), error =>
      error instanceof YuzhouRealImportHttpProbeError && /^HR_HTTP_PROBE_[A-Z_]+$/u.test(error.message) && !/PRIVATE|credential|password|token/.test(error.message));
    assert(stub.responses.every(response => response.bodyUsed));
  });
}
test("nonloopback, credentials in URL, wrong API path, zero counts rejected before fetch", async () => {
  const stub = mock();
  for (const change of [{ baseUrl: "https://example.com/api/v1" }, { baseUrl: "http://name:secret@127.0.0.1/api/v1" },
    { baseUrl: "http://127.0.0.1/auth" }, { expectedCounts: { ...config.expectedCounts, employees: 0 } }]) {
    await assert.rejects(verifyYuzhouRealImportHttp({ ...config, ...change, fetchImpl: stub.fetch }), YuzhouRealImportHttpProbeError);
  }
  assert.equal(stub.calls.length, 0);
});
test("request timeout aborts and errors remain fixed", async () => {
  await assert.rejects(verifyYuzhouRealImportHttp({ ...config, timeoutMs: 5, fetchImpl: (_url, { signal }) =>
    new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("PRIVATE")), { once: true })) }),
  error => error.code === "HR_HTTP_PROBE_TIMEOUT");
});
test("oversized response stream is cancelled", async () => {
  let cancelled = false;
  const fetchImpl = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(2048))); }, cancel() { cancelled = true; } }), { headers: { "content-type": "application/json" } });
  await assert.rejects(verifyYuzhouRealImportHttp({ ...config, fetchImpl, maxResponseBytes: 1024 }), error => error.code === "HR_HTTP_PROBE_RESPONSE_TOO_LARGE");
  assert.equal(cancelled, true);
});

for (const defect of ["none", "close", "delete", "residual"]) test(`fixture cleanup ${defect} preserves exact scope and handles failures`, async () => {
  const calls = [], userIds = [uuid(900), uuid(901)], roleId = uuid(902);
  const result = await cleanupYuzhouRealHttpLab({
    app: { async close() { if (defect === "close") throw new Error("PRIVATE"); } },
    pool: { async query(sql, params) {
      calls.push({ sql, params });
      if (defect === "delete" && sql.startsWith("DELETE FROM sys_role")) throw new Error("PRIVATE");
      return { rows: [{ n: defect === "residual" ? 1 : 0 }] };
    } }, fixturesCommitted: true, userIds, roleId, tenantId: "fixture-tenant", parkId: "fixture-park",
  });
  assert.equal(result.shutdownFailed, defect === "close");
  assert.equal(result.cleanupFailed, ["delete", "residual"].includes(defect));
  assert(calls.some(call => call.sql.startsWith("DELETE FROM sys_auth_refresh_token")));
  for (const call of calls.filter(call => call.sql.startsWith("DELETE"))) {
    assert.match(call.sql, /tenant_id=\$2 AND park_id=\$3/u);
    assert.deepEqual(call.params.slice(1), ["fixture-tenant", "fixture-park"]);
    assert.deepEqual(call.params[0], call.sql.includes("sys_role ") || call.sql.includes("rel_role_perm ") ? roleId : userIds);
  }
  if (result.cleanupFailed) assert.equal(calls.at(-1).sql, "ROLLBACK");
  else assert(calls.some(call => call.sql === "COMMIT"));
  assert(!calls.some(call => /DELETE FROM sys_login_log/u.test(call.sql)));
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|fixture-/u);
});
test("fixtures never attempted do not trigger cleanup deletes", async () => {
  const result = await cleanupYuzhouRealHttpLab({ pool: { query() { assert.fail("unexpected SQL"); } }, fixturesCommitted: false });
  assert.deepEqual(result, { shutdownFailed: false, cleanupFailed: false });
});
for (const rollbackFails of [false, true]) test(`ambiguous fixture COMMIT still cleans registered IDs when rollback fails=${rollbackFails}`, async () => {
  const calls=[],userIds=[uuid(900),uuid(901)],roleId=uuid(902);
  let required=false,commits=0,cleanup;
  const pool={async query(sql){calls.push(sql);if(sql==="COMMIT"&&++commits===1)throw new Error("PRIVATE commit");if(sql==="ROLLBACK"&&rollbackFails)throw new Error("PRIVATE rollback");return {rows:[{n:0}]};}};
  try {
    await assert.rejects(runYuzhouHttpFixtureTransaction({pool,requireCleanup(){required=true;},async write(){assert.equal(required,true);calls.push("fixture-write");}}),/PRIVATE commit/);
  } finally {
    cleanup=await cleanupYuzhouRealHttpLab({pool,fixturesCommitted:required,userIds,roleId,tenantId:"fixture-tenant",parkId:"fixture-park"});
  }
  assert.equal(cleanup.cleanupFailed,false);
  assert.ok(calls.some(sql=>sql.startsWith("DELETE FROM sys_user")));
  assert.ok(!calls.some(sql=>sql.startsWith("DELETE FROM sys_login_log")));
});
test("cleanup COMMIT acknowledgement loss cannot claim successful cleanup",async()=>{
 const result=await cleanupYuzhouRealHttpLab({fixturesCommitted:true,userIds:[uuid(900)],roleId:uuid(902),tenantId:"fixture",parkId:"fixture",
  pool:{async query(sql){if(sql==="COMMIT"||sql==="ROLLBACK")throw new Error("PRIVATE");return {rows:[]};}}});
 assert.equal(result.cleanupFailed,true);
});
test("runtime failure summaries use bounded stable types and never constructor payloads",()=>{
 for(const error of [{constructor:{name:"PRIVATE".repeat(1000)},code:"HR_HTTP_"+"A".repeat(1000)},null,{get constructor(){throw new Error("PRIVATE");}}]){
  const result=sanitizeYuzhouRealHttpLabFailure(error,"fixtures");
  assert.deepEqual(result,{step:"fixtures",errorType:"Error",code:null,sqlState:null});
 }
 assert.equal(sanitizeYuzhouRealHttpLabFailure(new TypeError("PRIVATE"),"fixtures").errorType,"TypeError");
 assert.equal(sanitizeYuzhouRealHttpLabFailure({code:"23505"},"fixtures").sqlState,"23505");
});
