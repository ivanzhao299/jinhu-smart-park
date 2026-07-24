#!/usr/bin/env node
/*
 * Purpose:
 *   Optional WP3-C / C5-B smoke for refresh cookie, Origin / Referer hardening,
 *   body refresh-token compatibility, logout, and logout-cookie HTTP behavior.
 *
 * Required env:
 *   API_BASE_URL, WEB_ORIGIN, ADMIN_USERNAME, ADMIN_PASSWORD,
 *   DEFAULT_TENANT_ID, DEFAULT_PARK_ID
 *
 * Optional env:
 *   AUTH_REFRESH_COOKIE_NAME=sp_refresh_token
 *   AUTH_SMOKE_WRONG_PASSWORD, AUTH_SMOKE_SKIP_WRONG_PASSWORD,
 *   AUTH_SMOKE_EXPECT_BODY_REFRESH_TOKEN=false only for future no-compat mode
 *
 * Safety notes:
 *   This script performs real login / refresh / logout requests and may create
 *   login audit rows plus refresh-token rows. It never logs raw access tokens,
 *   refresh tokens, cookie values, passwords, or Authorization headers.
 *
 * Example command:
 *   API_BASE_URL=http://localhost:3001/api/v1 \
 *   WEB_ORIGIN=http://localhost:3000 \
 *   ADMIN_USERNAME=admin \
 *   ADMIN_PASSWORD='<password>' \
 *   DEFAULT_TENANT_ID=10000001 \
 *   DEFAULT_PARK_ID=20000001 \
 *   node scripts/e2e/auth-cookie-origin-smoke.mjs
 */

import { randomUUID } from "node:crypto";

const EXIT_ASSERTION_FAILURE = 1;
const EXIT_CONFIG_FAILURE = 2;
const DEFAULT_REFRESH_COOKIE_NAME = "sp_refresh_token";
const EVIL_ORIGIN = "https://evil.example";

class SmokeAssertionError extends Error {}
class SmokeConfigError extends Error {}

class CookieJar {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
  }

  applySetCookieHeaders(setCookieHeaders, responseUrl) {
    for (const header of setCookieHeaders) {
      const parsed = parseSetCookie(header, responseUrl);
      if (!parsed) {
        continue;
      }
      if (isClearingCookie(parsed)) {
        this.cookies.delete(cookieStorageKey(parsed));
        continue;
      }
      this.cookies.set(cookieStorageKey(parsed), parsed);
    }
  }

  header(requestUrl) {
    const segments = [];
    const now = Date.now();
    for (const [key, cookie] of this.cookies.entries()) {
      if (cookie.expiresAt && cookie.expiresAt <= now) {
        this.cookies.delete(key);
        continue;
      }
      if (!cookieMatchesRequest(cookie, requestUrl)) {
        continue;
      }
      segments.push(`${encodeURIComponent(cookie.name)}=${encodeURIComponent(cookie.value)}`);
    }
    return segments.join("; ");
  }

  has(name) {
    return Array.from(this.cookies.values()).some((cookie) => cookie.name === name);
  }

  valueForRequest(name, requestUrl) {
    return this.singleMatchingCookie(name, requestUrl)?.value;
  }

  scopeForRequest(name, requestUrl) {
    const cookie = this.singleMatchingCookie(name, requestUrl);
    return cookie ? cookieScope(cookie) : undefined;
  }

  willSend(name, requestUrl) {
    return this.matchingCookies(name, requestUrl).length > 0;
  }

  matchingCookies(name, requestUrl) {
    return Array.from(this.cookies.values()).filter((cookie) => cookie.name === name && cookieMatchesRequest(cookie, requestUrl));
  }

  singleMatchingCookie(name, requestUrl) {
    const matches = this.matchingCookies(name, requestUrl);
    if (matches.length > 1) {
      throw new SmokeAssertionError(`${name} has multiple matching cookie scopes for ${new URL(requestUrl).pathname}; scopes=${matches.map((cookie) => describeScope(cookieScope(cookie))).join(",")}`);
    }
    return matches[0];
  }

  describeCookieScope(name) {
    const cookies = Array.from(this.cookies.values()).filter((cookie) => cookie.name === name);
    if (cookies.length === 0) {
      return `${name}:missing`;
    }
    return cookies.map((cookie) => describeScope(cookieScope(cookie))).join(",");
  }
}

const state = {
  passed: 0,
  skipped: 0
};

function info(message) {
  console.log(`[INFO] ${message}`);
}

function pass(message) {
  state.passed += 1;
  console.log(`[PASS] ${message}`);
}

function skip(message) {
  state.skipped += 1;
  console.log(`[SKIP] ${message}`);
}

function warn(message) {
  console.log(`[WARN] ${message}`);
}

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new SmokeConfigError(`Missing required env ${name}`);
  }
  return value;
}

function readBooleanEnv(name, fallback) {
  const normalized = process.env[name]?.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized ?? "")) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized ?? "")) {
    return false;
  }
  return fallback;
}

function loadConfig() {
  return {
    apiBaseUrl: normalizeBaseUrl(readRequiredEnv("API_BASE_URL")),
    webOrigin: normalizeOriginEnv("WEB_ORIGIN", readRequiredEnv("WEB_ORIGIN")),
    adminUsername: readRequiredEnv("ADMIN_USERNAME"),
    adminPassword: readRequiredEnv("ADMIN_PASSWORD"),
    tenantId: readRequiredEnv("DEFAULT_TENANT_ID"),
    parkId: readRequiredEnv("DEFAULT_PARK_ID"),
    wrongPassword: process.env.AUTH_SMOKE_WRONG_PASSWORD ?? `WrongPassword#${randomUUID().slice(0, 8)}`,
    skipWrongPassword: readBooleanEnv("AUTH_SMOKE_SKIP_WRONG_PASSWORD", true),
    expectBodyRefreshToken: readBooleanEnv("AUTH_SMOKE_EXPECT_BODY_REFRESH_TOKEN", true),
    refreshCookieName: process.env.AUTH_REFRESH_COOKIE_NAME?.trim() || DEFAULT_REFRESH_COOKIE_NAME
  };
}

function normalizeBaseUrl(value) {
  try {
    const url = new URL(value);
    return url.toString().replace(/\/+$/g, "");
  } catch {
    throw new SmokeConfigError("API_BASE_URL must be a valid absolute URL");
  }
}

function normalizeOriginEnv(name, value) {
  try {
    const url = new URL(value);
    if (url.origin !== value.replace(/\/+$/g, "")) {
      throw new Error("not an exact origin");
    }
    return url.origin;
  } catch {
    throw new SmokeConfigError(`${name} must be an exact origin such as http://localhost:3000`);
  }
}

async function requestJson(config, path, options = {}) {
  const requestUrl = `${config.apiBaseUrl}${path}`;
  const headers = new Headers(options.headers ?? {});
  headers.set("accept", "application/json");
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (options.origin) {
    headers.set("origin", options.origin);
  }
  if (options.referer) {
    headers.set("referer", options.referer);
  }
  if (options.accessToken) {
    headers.set("authorization", `Bearer ${options.accessToken}`);
  }
  if (options.idempotencyKey) {
    headers.set("x-idempotency-key", options.idempotencyKey);
  }
  const cookieHeader = options.jar?.header(requestUrl);
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const response = await fetch(requestUrl, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const setCookieHeaders = getSetCookieHeaders(response.headers);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  if (options.jar) {
    options.jar.applySetCookieHeaders(setCookieHeaders, response.url || requestUrl);
  }
  return {
    path,
    method: options.method ?? "GET",
    status: response.status,
    body,
    setCookieHeaders,
    responseUrl: response.url || requestUrl
  };
}

function expectStatus(result, expected, label) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(result.status)) {
    throw new SmokeAssertionError(
      `${label} expected HTTP ${allowed.join(" / ")}, got ${result.status}; body=${sanitizeBody(result.body)}; refreshCookieMutation=${describeRefreshCookieMutation(result.setCookieHeaders, result.responseUrl)}`
    );
  }
  pass(`${label} HTTP ${result.status}`);
}

function expectSetRefreshCookie(result, cookieName, label) {
  const mutations = getRefreshCookieMutations(result.setCookieHeaders, cookieName, result.responseUrl);
  const setMutations = mutations.filter((mutation) => !mutation.clear);
  if (setMutations.length === 0) {
    throw new SmokeAssertionError(`${label} expected refresh Set-Cookie; mutations=${describeMutations(mutations)}`);
  }
  if (!setMutations.some((mutation) => mutation.httpOnly)) {
    throw new SmokeAssertionError(`${label} expected refresh Set-Cookie to be HttpOnly; mutations=${describeMutations(mutations)}`);
  }
  pass(`${label} set refresh cookie`);
}

function expectClearRefreshCookie(result, cookieName, label, expectedScope) {
  const mutations = getRefreshCookieMutations(result.setCookieHeaders, cookieName, result.responseUrl);
  const clearMutations = mutations.filter((mutation) => mutation.clear);
  if (clearMutations.length === 0) {
    throw new SmokeAssertionError(`${label} expected refresh Clear-Cookie; mutations=${describeMutations(mutations)}`);
  }
  if (expectedScope && !clearMutations.some((mutation) => cookieScopesMatchForClear(expectedScope, mutation))) {
    throw new SmokeAssertionError(`${label} expected refresh Clear-Cookie matching stored scope; stored=${describeScope(expectedScope)}; mutations=${describeMutations(mutations)}`);
  }
  pass(`${label} cleared refresh cookie`);
}

function expectNoRefreshCookieMutation(result, cookieName, label) {
  const mutations = getRefreshCookieMutations(result.setCookieHeaders, cookieName, result.responseUrl);
  if (mutations.length > 0) {
    throw new SmokeAssertionError(`${label} expected no refresh cookie mutation; mutations=${describeMutations(mutations)}`);
  }
  pass(`${label} did not mutate refresh cookie`);
}

function expectNoRefreshCookieSetOrReplay(config, result, jar, path, label) {
  const mutations = getRefreshCookieMutations(result.setCookieHeaders, config.refreshCookieName, result.responseUrl);
  const setMutations = mutations.filter((mutation) => !mutation.clear);
  if (setMutations.length > 0) {
    throw new SmokeAssertionError(`${label} expected no refresh Set-Cookie in no-compat rejection; mutations=${describeMutations(mutations)}`);
  }
  expectRefreshCookieNotSent(config, jar, path, label);
  if (mutations.length > 0) {
    pass(`${label} only cleared refresh cookie in no-compat rejection`);
    return;
  }
  pass(`${label} did not set refresh cookie in no-compat rejection`);
}

function expectRefreshCookiePresent(jar, cookieName, label) {
  if (!jar.has(cookieName)) {
    throw new SmokeAssertionError(`${label} expected cookie jar to contain ${cookieName}`);
  }
  pass(`${label} cookie jar has refresh cookie`);
}

function expectRefreshCookieWillBeSent(config, jar, path, label) {
  const requestUrl = `${config.apiBaseUrl}${path}`;
  if (!jar.willSend(config.refreshCookieName, requestUrl)) {
    throw new SmokeAssertionError(`${label} refresh cookie Path/Domain did not allow replay to ${path}; scope=${jar.describeCookieScope(config.refreshCookieName)}`);
  }
  pass(`${label} refresh cookie Path/Domain allows browser-style replay`);
}

function expectRefreshCookieNotSent(config, jar, path, label) {
  const requestUrl = `${config.apiBaseUrl}${path}`;
  if (jar.willSend(config.refreshCookieName, requestUrl)) {
    throw new SmokeAssertionError(`${label} expected refresh cookie to be cleared for ${path}; scope=${jar.describeCookieScope(config.refreshCookieName)}`);
  }
  pass(`${label} refresh cookie no longer replays to ${path}`);
}

function snapshotCookieValue(config, jar, path) {
  return jar.valueForRequest(config.refreshCookieName, `${config.apiBaseUrl}${path}`);
}

function snapshotCookieScope(config, jar, path) {
  const scope = jar.scopeForRequest(config.refreshCookieName, `${config.apiBaseUrl}${path}`);
  if (!scope) {
    throw new SmokeAssertionError(`expected stored cookie scope for ${config.refreshCookieName} at ${path}`);
  }
  return scope;
}

function expectRefreshCookieClearedFor(config, jar, path, result, label, storedScope) {
  expectClearRefreshCookie(result, config.refreshCookieName, label, storedScope);
  expectRefreshCookieNotSent(config, jar, path, label);
}

function expectCookieValueChanged(before, after, label) {
  if (!before || !after) {
    throw new SmokeAssertionError(`${label} expected refresh cookie value before and after rotation`);
  }
  if (before === after) {
    throw new SmokeAssertionError(`${label} refresh cookie value did not rotate`);
  }
  pass(`${label} refresh cookie value rotated`);
}

async function expectRefreshStillUsable(config, jar, label) {
  expectRefreshCookieWillBeSent(config, jar, "/auth/token/refresh", label);
  const before = snapshotCookieValue(config, jar, "/auth/token/refresh");
  const result = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    origin: config.webOrigin,
    jar,
    body: {}
  });
  expectStatus(result, 200, `${label} valid Origin refresh after rejection`);
  expectSetRefreshCookie(result, config.refreshCookieName, `${label} valid Origin refresh after rejection`);
  expectCookieValueChanged(before, snapshotCookieValue(config, jar, "/auth/token/refresh"), `${label} valid Origin refresh after rejection`);
}

async function expectLogoutCookieStillUsable(config, jar, label) {
  expectRefreshCookieWillBeSent(config, jar, "/auth/logout-cookie", label);
  const storedScope = snapshotCookieScope(config, jar, "/auth/logout-cookie");
  const result = await requestJson(config, "/auth/logout-cookie", {
    method: "POST",
    origin: config.webOrigin,
    jar
  });
  expectStatus(result, 200, `${label} valid Origin logout-cookie after rejection`);
  expectRefreshCookieClearedFor(config, jar, "/auth/token/refresh", result, `${label} valid Origin logout-cookie after rejection`, storedScope);
}

async function expectBodyRefreshRejected(config, refreshToken, label) {
  const jar = new CookieJar(`${label}-rejected-body-refresh`);
  const result = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    jar,
    body: { refreshToken }
  });
  expectStatus(result, 401, label);
  if (config.expectBodyRefreshToken) {
    expectNoRefreshCookieMutation(result, config.refreshCookieName, label);
    return;
  }
  expectNoRefreshCookieSetOrReplay(config, result, jar, "/auth/token/refresh", label);
}

async function expectBodyRefreshStillUsable(config, refreshToken, label) {
  const jar = new CookieJar(`${label}-usable-body-refresh`);
  const result = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    jar,
    body: { refreshToken }
  });
  expectStatus(result, 200, label);
  expectSetRefreshCookie(result, config.refreshCookieName, label);
  await cleanupRefreshCookie(config, jar, label);
}

function extractData(body) {
  if (body && typeof body === "object" && "data" in body) {
    return body.data;
  }
  return body;
}

function extractAccessToken(body) {
  const data = extractData(body);
  return typeof data?.accessToken === "string" && data.accessToken ? data.accessToken : "";
}

function extractRefreshToken(body) {
  const data = extractData(body);
  return typeof data?.refreshToken === "string" && data.refreshToken ? data.refreshToken : "";
}

async function login(config, label) {
  const jar = new CookieJar(label);
  const result = await requestJson(config, "/auth/login", {
    method: "POST",
    origin: config.webOrigin,
    jar,
    body: {
      tenantId: config.tenantId,
      parkId: config.parkId,
      username: config.adminUsername,
      password: config.adminPassword
    }
  });
  expectStatus(result, 200, `${label} login`);
  expectSetRefreshCookie(result, config.refreshCookieName, `${label} login`);
  expectRefreshCookiePresent(jar, config.refreshCookieName, `${label} login`);

  const accessToken = extractAccessToken(result.body);
  if (!accessToken) {
    throw new SmokeAssertionError(`${label} login expected accessToken in response`);
  }
  pass(`${label} login returned access token`);
  const refreshToken = extractRefreshToken(result.body);
  if (refreshToken) {
    pass(`${label} login returned body refresh token`);
  } else if (config.expectBodyRefreshToken) {
    throw new SmokeAssertionError(`${label} login expected body refreshToken because AUTH_SMOKE_EXPECT_BODY_REFRESH_TOKEN=true`);
  } else {
    skip(`${label} login body refresh token absent; body compatibility checks that need it will skip`);
  }
  return { jar, accessToken, refreshToken };
}

async function cleanupRefreshCookie(config, jar, label) {
  if (!jar.has(config.refreshCookieName)) {
    return;
  }
  try {
    const result = await requestJson(config, "/auth/logout-cookie", {
      method: "POST",
      origin: config.webOrigin,
      jar
    });
    if (result.status === 200) {
      pass(`${label} cleanup logout-cookie HTTP 200`);
      return;
    }
    warn(`${label} cleanup logout-cookie returned HTTP ${result.status}; body=${sanitizeBody(result.body)}`);
  } catch (error) {
    warn(`${label} cleanup logout-cookie failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function runWrongPasswordCheck(config) {
  if (config.skipWrongPassword) {
    skip("wrong password check skipped by default; set AUTH_SMOKE_SKIP_WRONG_PASSWORD=false to enable one attempt");
    return;
  }
  const jar = new CookieJar("wrong-password");
  const result = await requestJson(config, "/auth/login", {
    method: "POST",
    origin: config.webOrigin,
    jar,
    body: {
      tenantId: config.tenantId,
      parkId: config.parkId,
      username: config.adminUsername,
      password: config.wrongPassword
    }
  });
  expectStatus(result, 401, "wrong password login");
  expectNoRefreshCookieMutation(result, config.refreshCookieName, "wrong password login");
}

async function runBodyCompatibilityChecks(config) {
  const bodyLogin = await login(config, "body-fallback-source");
  if (!bodyLogin.refreshToken) {
    if (config.expectBodyRefreshToken) {
      throw new SmokeAssertionError("body compatibility source login did not return refreshToken");
    }
    skip("body fallback refresh skipped because response body refreshToken is absent");
    skip("invalid Origin without cookie + body skipped because response body refreshToken is absent");
    await cleanupRefreshCookie(config, bodyLogin.jar, "body fallback source");
    return;
  }

  const fallbackJar = new CookieJar("body-fallback-result");
  const fallback = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    jar: fallbackJar,
    body: { refreshToken: bodyLogin.refreshToken }
  });
  expectStatus(fallback, 200, "body fallback refresh without cookie and without Origin");
  expectSetRefreshCookie(fallback, config.refreshCookieName, "body fallback refresh");
  await cleanupRefreshCookie(config, fallbackJar, "body fallback refresh");

  const invalidBodySource = await login(config, "invalid-origin-body-source");
  if (!invalidBodySource.refreshToken) {
    if (config.expectBodyRefreshToken) {
      throw new SmokeAssertionError("invalid Origin body source login did not return refreshToken");
    }
    skip("invalid Origin without cookie + body skipped because response body refreshToken is absent");
    await cleanupRefreshCookie(config, invalidBodySource.jar, "invalid Origin body source");
    await cleanupRefreshCookie(config, bodyLogin.jar, "body fallback source");
    return;
  }

  const invalid = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    origin: EVIL_ORIGIN,
    body: { refreshToken: invalidBodySource.refreshToken }
  });
  expectStatus(invalid, 403, "invalid Origin without cookie + body refresh");
  expectNoRefreshCookieMutation(invalid, config.refreshCookieName, "invalid Origin without cookie + body refresh");
  await expectBodyRefreshStillUsable(config, invalidBodySource.refreshToken, "invalid Origin without cookie + body refresh token survival");
  await cleanupRefreshCookie(config, invalidBodySource.jar, "invalid Origin body source");
  await cleanupRefreshCookie(config, bodyLogin.jar, "body fallback source");
}

async function runLegacyBodyLogoutChecks(config) {
  const noCookie = await login(config, "legacy-body-logout-no-cookie-source");
  if (!noCookie.refreshToken) {
    if (config.expectBodyRefreshToken) {
      throw new SmokeAssertionError("legacy body logout no-cookie source did not return refreshToken");
    }
    skip("legacy body logout checks skipped because response body refreshToken is absent");
    await cleanupRefreshCookie(config, noCookie.jar, "legacy body no-cookie source");
    return;
  }

  const noCookieJar = new CookieJar("legacy-body-logout-no-cookie-result");
  const noCookieResult = await requestJson(config, "/auth/logout", {
    method: "POST",
    origin: config.webOrigin,
    jar: noCookieJar,
    accessToken: noCookie.accessToken,
    idempotencyKey: `auth-smoke-legacy-body-logout-${randomUUID()}`,
    body: { refreshToken: noCookie.refreshToken }
  });
  expectStatus(noCookieResult, 200, "legacy body protected logout without cookie");
  expectClearRefreshCookie(noCookieResult, config.refreshCookieName, "legacy body protected logout without cookie");
  expectRefreshCookieNotSent(config, noCookieJar, "/auth/token/refresh", "legacy body protected logout without cookie");
  await expectBodyRefreshRejected(config, noCookie.refreshToken, "legacy body protected logout revoked body token");
  await cleanupRefreshCookie(config, noCookie.jar, "legacy body no-cookie source");

  const cookieAndBody = await login(config, "legacy-body-logout-cookie-source");
  const distinctBody = await login(config, "legacy-body-logout-distinct-body-source");
  if (!distinctBody.refreshToken) {
    if (config.expectBodyRefreshToken) {
      throw new SmokeAssertionError("legacy body logout distinct body source did not return refreshToken");
    }
    skip("legacy body logout cookie + distinct body check skipped because response body refreshToken is absent");
    await cleanupRefreshCookie(config, cookieAndBody.jar, "legacy body cookie source");
    await cleanupRefreshCookie(config, distinctBody.jar, "legacy body distinct body source");
    return;
  }

  expectRefreshCookieWillBeSent(config, cookieAndBody.jar, "/auth/logout", "legacy body protected logout with cookie");
  const cookieAndBodyScope = snapshotCookieScope(config, cookieAndBody.jar, "/auth/logout");
  const cookieAndBodyResult = await requestJson(config, "/auth/logout", {
    method: "POST",
    origin: config.webOrigin,
    jar: cookieAndBody.jar,
    accessToken: cookieAndBody.accessToken,
    idempotencyKey: `auth-smoke-legacy-cookie-body-logout-${randomUUID()}`,
    body: { refreshToken: distinctBody.refreshToken }
  });
  expectStatus(cookieAndBodyResult, 200, "legacy body protected logout with cookie + distinct body");
  expectRefreshCookieClearedFor(config, cookieAndBody.jar, "/auth/token/refresh", cookieAndBodyResult, "legacy body protected logout with cookie + distinct body", cookieAndBodyScope);
  await expectBodyRefreshRejected(config, distinctBody.refreshToken, "legacy body protected logout revoked distinct body token");
  await cleanupRefreshCookie(config, distinctBody.jar, "legacy body distinct body source");
}

async function run() {
  const config = loadConfig();
  info(`API base: ${config.apiBaseUrl}`);
  info(`WEB_ORIGIN: ${config.webOrigin}`);
  info(`Tenant/Park: ${config.tenantId}/${config.parkId}`);
  info(`Wrong-password check: ${config.skipWrongPassword ? "skipped" : "enabled for one attempt"}`);
  info(`Body refreshToken compatibility: ${config.expectBodyRefreshToken ? "required" : "optional"}`);

  const main = await login(config, "main");

  const me = await requestJson(config, "/auth/me", {
    accessToken: main.accessToken,
    jar: main.jar
  });
  expectStatus(me, 200, "GET /auth/me with access token");
  expectNoRefreshCookieMutation(me, config.refreshCookieName, "GET /auth/me");

  expectRefreshCookieWillBeSent(config, main.jar, "/auth/token/refresh", "cookie refresh with valid Origin");
  const cookieBeforeRefreshOne = snapshotCookieValue(config, main.jar, "/auth/token/refresh");
  const refreshOne = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    origin: config.webOrigin,
    jar: main.jar,
    body: {}
  });
  expectStatus(refreshOne, 200, "cookie refresh with valid Origin");
  expectSetRefreshCookie(refreshOne, config.refreshCookieName, "cookie refresh with valid Origin");
  expectCookieValueChanged(cookieBeforeRefreshOne, snapshotCookieValue(config, main.jar, "/auth/token/refresh"), "cookie refresh with valid Origin");
  await expectBodyRefreshRejected(config, cookieBeforeRefreshOne, "old refresh token after first rotation");
  const accessAfterRefreshOne = extractAccessToken(refreshOne.body);
  if (!accessAfterRefreshOne) {
    throw new SmokeAssertionError("cookie refresh with valid Origin expected accessToken");
  }
  pass("cookie refresh with valid Origin returned access token");

  expectRefreshCookieWillBeSent(config, main.jar, "/auth/token/refresh", "refresh rotation with updated cookie jar");
  const cookieBeforeRefreshTwo = snapshotCookieValue(config, main.jar, "/auth/token/refresh");
  const refreshTwo = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    origin: config.webOrigin,
    jar: main.jar,
    body: {}
  });
  expectStatus(refreshTwo, 200, "refresh rotation with updated cookie jar");
  expectSetRefreshCookie(refreshTwo, config.refreshCookieName, "refresh rotation with updated cookie jar");
  expectCookieValueChanged(cookieBeforeRefreshTwo, snapshotCookieValue(config, main.jar, "/auth/token/refresh"), "refresh rotation with updated cookie jar");
  await expectBodyRefreshRejected(config, cookieBeforeRefreshTwo, "old refresh token after second rotation");
  const accessAfterRefreshTwo = extractAccessToken(refreshTwo.body);
  if (!accessAfterRefreshTwo) {
    throw new SmokeAssertionError("refresh rotation expected accessToken");
  }
  pass("refresh rotation returned access token");

  await runBodyCompatibilityChecks(config);

  expectRefreshCookieWillBeSent(config, main.jar, "/auth/token/refresh", "cookie + same body refresh");
  const cookieBeforeSameBody = snapshotCookieValue(config, main.jar, "/auth/token/refresh");
  const cookieBodySame = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    origin: config.webOrigin,
    jar: main.jar,
    body: { refreshToken: cookieBeforeSameBody }
  });
  expectStatus(cookieBodySame, 200, "cookie + same body refresh uses cookie");
  expectSetRefreshCookie(cookieBodySame, config.refreshCookieName, "cookie + same body refresh");
  expectCookieValueChanged(cookieBeforeSameBody, snapshotCookieValue(config, main.jar, "/auth/token/refresh"), "cookie + same body refresh");
  await expectBodyRefreshRejected(config, cookieBeforeSameBody, "old refresh token after cookie + same body rotation");

  expectRefreshCookieWillBeSent(config, main.jar, "/auth/token/refresh", "cookie + different body refresh");
  const cookieBodyDifferent = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    origin: config.webOrigin,
    jar: main.jar,
    body: { refreshToken: `stale-${"x".repeat(40)}` }
  });
  expectStatus(cookieBodyDifferent, 200, "cookie + different body refresh uses cookie");
  expectSetRefreshCookie(cookieBodyDifferent, config.refreshCookieName, "cookie + different body refresh");
  await cleanupRefreshCookie(config, main.jar, "main session");

  const invalidCookie = await login(config, "invalid-origin-cookie-source");
  expectRefreshCookieWillBeSent(config, invalidCookie.jar, "/auth/token/refresh", "invalid Origin with cookie refresh");
  const invalidCookieResult = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    origin: EVIL_ORIGIN,
    jar: invalidCookie.jar,
    body: {}
  });
  expectStatus(invalidCookieResult, 403, "invalid Origin with cookie refresh");
  expectNoRefreshCookieMutation(invalidCookieResult, config.refreshCookieName, "invalid Origin with cookie refresh");
  await expectRefreshStillUsable(config, invalidCookie.jar, "invalid Origin with cookie refresh");
  await cleanupRefreshCookie(config, invalidCookie.jar, "invalid Origin source");

  const invalidRefererSource = await login(config, "invalid-referer-source");
  expectRefreshCookieWillBeSent(config, invalidRefererSource.jar, "/auth/token/refresh", "invalid Referer refresh");
  const invalidRefererResult = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    referer: `${EVIL_ORIGIN}/path`,
    jar: invalidRefererSource.jar,
    body: {}
  });
  expectStatus(invalidRefererResult, 403, "invalid Referer without Origin refresh");
  expectNoRefreshCookieMutation(invalidRefererResult, config.refreshCookieName, "invalid Referer without Origin refresh");
  await expectRefreshStillUsable(config, invalidRefererSource.jar, "invalid Referer without Origin refresh");
  await cleanupRefreshCookie(config, invalidRefererSource.jar, "invalid Referer source");

  const refererSource = await login(config, "referer-source");
  expectRefreshCookieWillBeSent(config, refererSource.jar, "/auth/token/refresh", "valid Referer fallback refresh");
  const refererResult = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    referer: `${config.webOrigin}/dashboard`,
    jar: refererSource.jar,
    body: {}
  });
  expectStatus(refererResult, 200, "valid Referer fallback refresh");
  expectSetRefreshCookie(refererResult, config.refreshCookieName, "valid Referer fallback refresh");
  await cleanupRefreshCookie(config, refererSource.jar, "valid Referer source");

  const missingSource = await login(config, "missing-origin-source");
  expectRefreshCookieWillBeSent(config, missingSource.jar, "/auth/token/refresh", "missing Origin/Referer with cookie refresh");
  const missingResult = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    jar: missingSource.jar,
    body: {}
  });
  expectStatus(missingResult, 403, "missing Origin/Referer with cookie refresh");
  expectNoRefreshCookieMutation(missingResult, config.refreshCookieName, "missing Origin/Referer with cookie refresh");
  await expectRefreshStillUsable(config, missingSource.jar, "missing Origin/Referer with cookie refresh");
  await cleanupRefreshCookie(config, missingSource.jar, "missing Origin source");

  const logoutCookieValid = await login(config, "logout-cookie-valid-source");
  expectRefreshCookieWillBeSent(config, logoutCookieValid.jar, "/auth/logout-cookie", "logout-cookie valid Origin");
  const logoutCookieValidScope = snapshotCookieScope(config, logoutCookieValid.jar, "/auth/logout-cookie");
  const logoutCookieResult = await requestJson(config, "/auth/logout-cookie", {
    method: "POST",
    origin: config.webOrigin,
    jar: logoutCookieValid.jar
  });
  expectStatus(logoutCookieResult, 200, "logout-cookie valid Origin");
  expectRefreshCookieClearedFor(config, logoutCookieValid.jar, "/auth/token/refresh", logoutCookieResult, "logout-cookie valid Origin", logoutCookieValidScope);

  const logoutCookieInvalid = await login(config, "logout-cookie-invalid-source");
  expectRefreshCookieWillBeSent(config, logoutCookieInvalid.jar, "/auth/logout-cookie", "logout-cookie invalid Origin");
  const logoutCookieInvalidResult = await requestJson(config, "/auth/logout-cookie", {
    method: "POST",
    origin: EVIL_ORIGIN,
    jar: logoutCookieInvalid.jar
  });
  expectStatus(logoutCookieInvalidResult, 403, "logout-cookie invalid Origin");
  expectNoRefreshCookieMutation(logoutCookieInvalidResult, config.refreshCookieName, "logout-cookie invalid Origin");
  await expectLogoutCookieStillUsable(config, logoutCookieInvalid.jar, "logout-cookie invalid Origin");

  const protectedLogout = await login(config, "protected-logout-source");
  expectRefreshCookieWillBeSent(config, protectedLogout.jar, "/auth/logout", "protected logout valid Origin");
  const protectedLogoutScope = snapshotCookieScope(config, protectedLogout.jar, "/auth/logout");
  const protectedLogoutResult = await requestJson(config, "/auth/logout", {
    method: "POST",
    origin: config.webOrigin,
    jar: protectedLogout.jar,
    accessToken: protectedLogout.accessToken,
    idempotencyKey: `auth-smoke-logout-${randomUUID()}`,
    body: {}
  });
  expectStatus(protectedLogoutResult, 200, "protected logout valid Origin");
  expectRefreshCookieClearedFor(config, protectedLogout.jar, "/auth/token/refresh", protectedLogoutResult, "protected logout valid Origin", protectedLogoutScope);

  const protectedLogoutInvalid = await login(config, "protected-logout-invalid-origin-source");
  expectRefreshCookieWillBeSent(config, protectedLogoutInvalid.jar, "/auth/logout", "protected logout invalid Origin");
  const protectedLogoutInvalidResult = await requestJson(config, "/auth/logout", {
    method: "POST",
    origin: EVIL_ORIGIN,
    jar: protectedLogoutInvalid.jar,
    accessToken: protectedLogoutInvalid.accessToken,
    idempotencyKey: `auth-smoke-logout-invalid-${randomUUID()}`,
    body: {}
  });
  expectStatus(protectedLogoutInvalidResult, 403, "protected logout invalid Origin");
  expectNoRefreshCookieMutation(protectedLogoutInvalidResult, config.refreshCookieName, "protected logout invalid Origin");
  await expectRefreshStillUsable(config, protectedLogoutInvalid.jar, "protected logout invalid Origin");
  await cleanupRefreshCookie(config, protectedLogoutInvalid.jar, "protected logout invalid Origin source");

  await runLegacyBodyLogoutChecks(config);

  await runWrongPasswordCheck(config);

  console.log(`[PASS] auth cookie/origin smoke completed; passed=${state.passed}; skipped=${state.skipped}`);
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const combined = headers.get("set-cookie");
  return combined ? splitCombinedSetCookie(combined) : [];
}

function splitCombinedSetCookie(value) {
  return value.split(/,(?=\s*[^;,=\s]+=[^;]*)/g).map((header) => header.trim()).filter(Boolean);
}

function parseSetCookie(header, responseUrl) {
  const segments = header.split(";").map((segment) => segment.trim()).filter(Boolean);
  const [nameValue, ...attributeSegments] = segments;
  if (!nameValue) {
    return null;
  }
  const separatorIndex = nameValue.indexOf("=");
  if (separatorIndex < 0) {
    return null;
  }
  const name = safeDecode(nameValue.slice(0, separatorIndex).trim());
  const value = safeDecode(nameValue.slice(separatorIndex + 1).trim());
  const attributes = new Map();
  for (const segment of attributeSegments) {
    const index = segment.indexOf("=");
    const key = (index >= 0 ? segment.slice(0, index) : segment).trim().toLowerCase();
    const attrValue = index >= 0 ? segment.slice(index + 1).trim() : "true";
    attributes.set(key, attrValue);
  }
  const sourceUrl = parseUrl(responseUrl);
  const rawDomain = attributes.get("domain");
  const normalizedDomain = rawDomain?.replace(/^\./, "").toLowerCase();
  const sourceHost = sourceUrl?.hostname.toLowerCase();
  return {
    name,
    value,
    path: attributes.get("path") ?? defaultCookiePath(sourceUrl?.pathname ?? "/"),
    domain: normalizedDomain,
    hostOnly: !normalizedDomain,
    sourceHost,
    maxAge: parseNumber(attributes.get("max-age")),
    expiresAt: parseExpires(attributes.get("expires")),
    httpOnly: attributes.has("httponly"),
    attributes
  };
}

function cookieMatchesRequest(cookie, requestUrl) {
  const url = parseUrl(requestUrl);
  if (!url) {
    return false;
  }
  const requestHost = url.hostname.toLowerCase();
  if (cookie.hostOnly) {
    if (!cookie.sourceHost || requestHost !== cookie.sourceHost) {
      return false;
    }
  } else if (!domainMatches(requestHost, cookie.domain)) {
    return false;
  }
  return pathMatches(url.pathname || "/", cookie.path || "/");
}

function cookieScope(cookie) {
  return {
    name: cookie.name,
    path: cookie.path || "/",
    domain: cookie.domain,
    hostOnly: Boolean(cookie.hostOnly),
    sourceHost: cookie.sourceHost
  };
}

function cookieStorageKey(cookie) {
  const scope = cookieScope(cookie);
  const owner = scope.hostOnly ? `host:${scope.sourceHost}` : `domain:${scope.domain}`;
  return `${scope.name}|${scope.path}|${owner}`;
}

function cookieScopesMatchForClear(storedCookie, clearingCookie) {
  return cookieStorageKey(storedCookie) === cookieStorageKey(clearingCookie);
}

function domainMatches(requestHost, cookieDomain) {
  if (!cookieDomain) {
    return false;
  }
  return requestHost === cookieDomain || requestHost.endsWith(`.${cookieDomain}`);
}

function pathMatches(requestPath, cookiePath) {
  if (!cookiePath || cookiePath === "/") {
    return true;
  }
  if (requestPath === cookiePath) {
    return true;
  }
  if (!requestPath.startsWith(cookiePath)) {
    return false;
  }
  return cookiePath.endsWith("/") || requestPath.charAt(cookiePath.length) === "/";
}

function defaultCookiePath(responsePath) {
  if (!responsePath || !responsePath.startsWith("/")) {
    return "/";
  }
  if (responsePath === "/") {
    return "/";
  }
  const lastSlash = responsePath.lastIndexOf("/");
  return lastSlash <= 0 ? "/" : responsePath.slice(0, lastSlash);
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isClearingCookie(cookie) {
  if (typeof cookie.maxAge === "number" && cookie.maxAge <= 0) {
    return true;
  }
  return typeof cookie.expiresAt === "number" && cookie.expiresAt <= Date.now();
}

function getRefreshCookieMutations(setCookieHeaders, cookieName = DEFAULT_REFRESH_COOKIE_NAME, responseUrl) {
  return setCookieHeaders
    .map((header) => parseSetCookie(header, responseUrl))
    .filter((cookie) => cookie?.name === cookieName)
    .map((cookie) => ({
      name: cookie.name,
      clear: isClearingCookie(cookie),
      httpOnly: cookie.httpOnly,
      path: cookie.path,
      domain: cookie.domain,
      hostOnly: cookie.hostOnly,
      sourceHost: cookie.sourceHost
    }));
}

function describeRefreshCookieMutation(setCookieHeaders, responseUrl) {
  return describeMutations(getRefreshCookieMutations(setCookieHeaders, DEFAULT_REFRESH_COOKIE_NAME, responseUrl));
}

function describeMutations(mutations) {
  if (mutations.length === 0) {
    return "none";
  }
  return mutations.map((mutation) => `${mutation.clear ? "clear" : "set"}:${describeScope(mutation)}`).join(",");
}

function describeScope(scope) {
  return `${scope.name}:path=${scope.path};domain=${scope.hostOnly ? `host-only:${scope.sourceHost}` : scope.domain}`;
}

function sanitizeBody(body) {
  const redacted = redactValue(body);
  if (typeof redacted === "string") {
    return redacted.slice(0, 240);
  }
  try {
    return JSON.stringify(redacted).slice(0, 300);
  } catch {
    return "<unserializable>";
  }
}

function redactValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const redacted = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|cookie|password|authorization/i.test(key)) {
      redacted[key] = "<redacted>";
    } else {
      redacted[key] = redactValue(item);
    }
  }
  return redacted;
}

function parseNumber(value) {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseExpires(value) {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

run().catch((error) => {
  if (error instanceof SmokeConfigError) {
    console.error(`[CONFIG] ${error.message}`);
    process.exit(EXIT_CONFIG_FAILURE);
  }
  if (error instanceof SmokeAssertionError) {
    console.error(`[FAIL] ${error.message}`);
    process.exit(EXIT_ASSERTION_FAILURE);
  }
  console.error(`[FAIL] Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(EXIT_ASSERTION_FAILURE);
});
