/* global URL: readonly, AbortController: readonly, setTimeout: readonly, clearTimeout: readonly, TextDecoder: readonly */
const DOMAINS = Object.freeze({ employees: "/hr/employees", contracts: "/hr/contracts",
  attendanceCalendars: "/hr/attendance/calendars", insurancePeriods: "/hr/insurance/periods" });
const READER_PERMISSIONS = Object.freeze(["hr:employee:read", "hr:contract:read", "hr:attendance:read", "hr:insurance:read"]);
const REQUEST_STEPS = new Set(["reader_login", "reader_me", "denied_login", "denied_me",
  ...Object.keys(DOMAINS).flatMap(domain => ["page1", "page2", "unauth", "denied"].map(action => `${domain}_${action}`)),
  ...["contracts", "insurancePeriods"].flatMap(domain => ["detail", "detail_unauth", "detail_denied"].map(action => `${domain}_${action}`))]);
export function sanitizeYuzhouHttpRequestStep(value) { return REQUEST_STEPS.has(value) ? value : undefined; }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
export class YuzhouRealImportHttpProbeError extends Error {
  constructor(code) { super(code); this.name = "YuzhouRealImportHttpProbeError"; this.code = code; }
}
function fail(code) { throw new YuzhouRealImportHttpProbeError(code); }

function pageIds(body, total, page, size) {
  if (!object(body) || body.total !== total || body.page !== page || body.page_size !== size || !Array.isArray(body.items) ||
      body.items.length !== Math.min(size, Math.max(0, total - (page - 1) * size))) fail("HR_HTTP_PROBE_PAGE_INVALID");
  const ids = body.items.map(row => row?.id);
  if (ids.some(id => typeof id !== "string" || !UUID.test(id)) || new Set(ids).size !== ids.length) fail("HR_HTTP_PROBE_IDS_INVALID");
  return ids;
}

/** Caller supplies an already isolated API and real laboratory user credentials.
 * Only login and bounded authenticated reads are issued. Required server-side
 * auth/audit effects remain active. Injected fetch results are contract evidence.
 */
export async function verifyYuzhouRealImportHttp({ baseUrl, scope, authorizedCredentials, deniedCredentials, expectedCounts,
  fetchImpl = globalThis.fetch, timeoutMs = 15000, maxResponseBytes = 2 * 1024 * 1024 }) {
  let requestStep;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "http:" || !["127.0.0.1", "[::1]", "localhost"].includes(base.hostname) ||
        base.username || base.password || base.search || base.hash || !["/api/v1", "/api/v1/"].includes(base.pathname) ||
        typeof fetchImpl !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 ||
        !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1024 || maxResponseBytes > 8 * 1024 * 1024 ||
        !object(scope) || [scope.tenantId, scope.parkId].some(value => typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(value)) ||
        [authorizedCredentials, deniedCredentials].some(value => !object(value) || typeof value.username !== "string" || !value.username.trim() || typeof value.password !== "string" || value.password.length < 6) ||
        authorizedCredentials.username === deniedCredentials.username) fail("HR_HTTP_PROBE_INPUT_INVALID");
    if (!object(expectedCounts) || Object.keys(expectedCounts).length !== 4 || Object.keys(DOMAINS).some(key => !Number.isSafeInteger(expectedCounts[key]) || expectedCounts[key] <= 0)) fail("HR_HTTP_PROBE_COUNTS_INVALID");
    const root = base.href.replace(/\/$/u, "");
    let requests = 0;
    async function request(path, { token, credentials, status = 200, step } = {}) {
      requestStep = sanitizeYuzhouHttpRequestStep(step);
      if (!requestStep) fail("HR_HTTP_PROBE_INPUT_INVALID");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let reader;
      try {
        requests += 1;
        const response = await fetchImpl(`${root}${path}`, { method: credentials ? "POST" : "GET", redirect: "error",
          credentials: "omit", signal: controller.signal, headers: { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(credentials ? { "content-type": "application/json" } : {}) },
          ...(credentials ? { body: JSON.stringify({ tenantId: scope.tenantId, parkId: scope.parkId, username: credentials.username, password: credentials.password }) } : {}) });
        if (!response.body || !response.headers.get("content-type")?.includes("application/json")) {
          await response.body?.cancel(); fail("HR_HTTP_PROBE_RESPONSE_INVALID");
        }
        reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let text = "", size = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > maxResponseBytes) fail("HR_HTTP_PROBE_RESPONSE_TOO_LARGE");
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
        const body = JSON.parse(text);
        if (response.status !== status) fail("HR_HTTP_PROBE_STATUS_INVALID");
        if (!object(body) || (status === 200 ? body.code !== 0 || !object(body.data) : body.code !== status || body.data !== null)) fail("HR_HTTP_PROBE_RESPONSE_INVALID");
        return body.data;
      } catch (error) {
        if (controller.signal.aborted) fail("HR_HTTP_PROBE_TIMEOUT");
        if (error instanceof YuzhouRealImportHttpProbeError) throw error;
        fail("HR_HTTP_PROBE_REQUEST_FAILED");
      } finally {
        clearTimeout(timer);
        if (reader) { try { await reader.cancel(); } catch { /* Sanitized by the request result. */ } reader.releaseLock(); }
      }
    }
    async function login(credentials, denied) {
      const result = await request("/auth/login", { credentials, step: denied ? "denied_login" : "reader_login" });
      if (result.requiresContextSelection || typeof result.accessToken !== "string" || !result.accessToken || result.tokenType !== "Bearer") fail("HR_HTTP_PROBE_LOGIN_INVALID");
      const me = await request("/auth/me", { token: result.accessToken, step: denied ? "denied_me" : "reader_me" });
      if (typeof me.id !== "string" || !UUID.test(me.id) || me.username !== credentials.username || me.tenant_id !== scope.tenantId || me.park_id !== scope.parkId ||
          !Array.isArray(me.permissions) || me.permissions.some(permission => typeof permission !== "string")) fail("HR_HTTP_PROBE_IDENTITY_INVALID");
      // /auth/me itself requires this identity-only permission; the denied user
      // must have no HR permission or wildcard and cannot be a superuser.
      if (denied && (me.is_super !== false || me.permissions.some(permission => permission !== "system:user:me"))) fail("HR_HTTP_PROBE_DENIED_IDENTITY_INVALID");
      // A superuser or broader role would exercise bypass authority, not the
      // four-domain reader contract this probe is meant to prove.
      if (!denied && (me.is_super !== false || READER_PERMISSIONS.some(permission => !me.permissions.includes(permission)) ||
          me.permissions.some(permission => permission !== "system:user:me" && !READER_PERMISSIONS.includes(permission)))) fail("HR_HTTP_PROBE_AUTHORIZED_IDENTITY_INVALID");
      return { token: result.accessToken, id: me.id };
    }
    const authorized = await login(authorizedCredentials, false), denied = await login(deniedCredentials, true);
    if (authorized.id === denied.id || authorized.token === denied.token) fail("HR_HTTP_PROBE_IDENTITIES_NOT_DISTINCT");
    const observedCounts = {}, firstIds = {}, checks = ["authorized_login_and_scope", "denied_login_and_scope", "distinct_users"];
    for (const [domain, path] of Object.entries(DOMAINS)) {
      const total = expectedCounts[domain], size = Math.min(20, Math.ceil(total / 2));
      const first = await request(`${path}?page=1&page_size=${size}`, { token: authorized.token, step: `${domain}_page1` });
      const firstPage = pageIds(first, total, 1, size);
      const secondPage = pageIds(await request(`${path}?page=2&page_size=${size}`, { token: authorized.token, step: `${domain}_page2` }), total, 2, size);
      const firstSet = new Set(firstPage);
      if (secondPage.some(id => firstSet.has(id))) fail("HR_HTTP_PROBE_PAGE_OVERLAP");
      firstIds[domain] = firstPage[0]; observedCounts[domain] = first.total;
      await request(`${path}?page=1&page_size=1`, { status: 401, step: `${domain}_unauth` });
      await request(`${path}?page=1&page_size=1`, { token: denied.token, status: 403, step: `${domain}_denied` });
      checks.push(`${domain}:positive_pages`, `${domain}:disjoint_ids`, `${domain}:unauthenticated_401`, `${domain}:denied_403`);
    }
    for (const domain of ["contracts", "insurancePeriods"]) {
      const path = `${DOMAINS[domain]}/${firstIds[domain]}`;
      const detail = await request(path, { token: authorized.token, step: `${domain}_detail` });
      if (detail.id !== firstIds[domain]) fail("HR_HTTP_PROBE_DETAIL_INVALID");
      await request(path, { status: 401, step: `${domain}_detail_unauth` });
      await request(path, { token: denied.token, status: 403, step: `${domain}_detail_denied` });
      checks.push(`${domain}:detail`, `${domain}:detail_unauthenticated_401`, `${domain}:detail_denied_403`);
    }
    const live = fetchImpl === globalThis.fetch;
    return { status: live ? "PASS" : "CONTRACT_PASS", evidenceKind: live ? "loopback_http" : "injected_fetch_contract",
      httpVerified: live, authenticationVerified: live, importedSourceBindingVerified: false, uiVerified: false,
      auditPersistenceVerified: false, productionImport: "HOLD", observedCounts, requestCount: requests, checks };
  } catch (error) {
    const safe = error instanceof YuzhouRealImportHttpProbeError ? error : new YuzhouRealImportHttpProbeError("HR_HTTP_PROBE_FAILED");
    if (requestStep) safe.requestStep = requestStep;
    throw safe;
  }
}
