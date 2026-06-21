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
 *   AUTH_SMOKE_WRONG_PASSWORD, AUTH_SMOKE_SKIP_WRONG_PASSWORD,
 *   AUTH_SMOKE_EXPECT_BODY_REFRESH_TOKEN
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

  applySetCookieHeaders(setCookieHeaders) {
    for (const header of setCookieHeaders) {
      const parsed = parseSetCookie(header);
      if (!parsed) {
        continue;
      }
      if (isClearingCookie(parsed)) {
        this.cookies.delete(parsed.name);
        continue;
      }
      this.cookies.set(parsed.name, parsed);
    }
  }

  header() {
    const segments = [];
    const now = Date.now();
    for (const [name, cookie] of this.cookies.entries()) {
      if (cookie.expiresAt && cookie.expiresAt <= now) {
        this.cookies.delete(name);
        continue;
      }
      segments.push(`${encodeURIComponent(name)}=${encodeURIComponent(cookie.value)}`);
    }
    return segments.join("; ");
  }

  has(name) {
    return this.cookies.has(name);
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
    expectBodyRefreshToken: readBooleanEnv("AUTH_SMOKE_EXPECT_BODY_REFRESH_TOKEN", false),
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
  const cookieHeader = options.jar?.header();
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
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
    options.jar.applySetCookieHeaders(setCookieHeaders);
  }
  return {
    path,
    method: options.method ?? "GET",
    status: response.status,
    body,
    setCookieHeaders
  };
}

function expectStatus(result, expected, label) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(result.status)) {
    throw new SmokeAssertionError(
      `${label} expected HTTP ${allowed.join(" / ")}, got ${result.status}; body=${sanitizeBody(result.body)}; refreshCookieMutation=${describeRefreshCookieMutation(result.setCookieHeaders)}`
    );
  }
  pass(`${label} HTTP ${result.status}`);
}

function expectSetRefreshCookie(result, cookieName, label) {
  const mutations = getRefreshCookieMutations(result.setCookieHeaders, cookieName);
  if (!mutations.some((mutation) => !mutation.clear)) {
    throw new SmokeAssertionError(`${label} expected refresh Set-Cookie; mutations=${describeMutations(mutations)}`);
  }
  pass(`${label} set refresh cookie`);
}

function expectClearRefreshCookie(result, cookieName, label) {
  const mutations = getRefreshCookieMutations(result.setCookieHeaders, cookieName);
  if (!mutations.some((mutation) => mutation.clear)) {
    throw new SmokeAssertionError(`${label} expected refresh Clear-Cookie; mutations=${describeMutations(mutations)}`);
  }
  pass(`${label} cleared refresh cookie`);
}

function expectNoRefreshCookieMutation(result, cookieName, label) {
  const mutations = getRefreshCookieMutations(result.setCookieHeaders, cookieName);
  if (mutations.length > 0) {
    throw new SmokeAssertionError(`${label} expected no refresh cookie mutation; mutations=${describeMutations(mutations)}`);
  }
  pass(`${label} did not mutate refresh cookie`);
}

function expectRefreshCookiePresent(jar, cookieName, label) {
  if (!jar.has(cookieName)) {
    throw new SmokeAssertionError(`${label} expected cookie jar to contain ${cookieName}`);
  }
  pass(`${label} cookie jar has refresh cookie`);
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

  const invalid = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    origin: EVIL_ORIGIN,
    body: { refreshToken: bodyLogin.refreshToken }
  });
  expectStatus(invalid, 403, "invalid Origin without cookie + body refresh");
  expectNoRefreshCookieMutation(invalid, config.refreshCookieName, "invalid Origin without cookie + body refresh");
}

async function run() {
  const config = loadConfig();
  info(`API base: ${config.apiBaseUrl}`);
  info(`WEB_ORIGIN: ${config.webOrigin}`);
  info(`Tenant/Park: ${config.tenantId}/${config.parkId}`);
  info(`Wrong-password check: ${config.skipWrongPassword ? "skipped" : "enabled for one attempt"}`);

  const main = await login(config, "main");

  const me = await requestJson(config, "/auth/me", {
    accessToken: main.accessToken,
    jar: main.jar
  });
  expectStatus(me, 200, "GET /auth/me with access token");
  expectNoRefreshCookieMutation(me, config.refreshCookieName, "GET /auth/me");

  const refreshOne = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    origin: config.webOrigin,
    jar: main.jar,
    body: {}
  });
  expectStatus(refreshOne, 200, "cookie refresh with valid Origin");
  expectSetRefreshCookie(refreshOne, config.refreshCookieName, "cookie refresh with valid Origin");
  const accessAfterRefreshOne = extractAccessToken(refreshOne.body);
  if (!accessAfterRefreshOne) {
    throw new SmokeAssertionError("cookie refresh with valid Origin expected accessToken");
  }
  pass("cookie refresh with valid Origin returned access token");

  const refreshTwo = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    origin: config.webOrigin,
    jar: main.jar,
    body: {}
  });
  expectStatus(refreshTwo, 200, "refresh rotation with updated cookie jar");
  expectSetRefreshCookie(refreshTwo, config.refreshCookieName, "refresh rotation with updated cookie jar");
  const accessAfterRefreshTwo = extractAccessToken(refreshTwo.body);
  if (!accessAfterRefreshTwo) {
    throw new SmokeAssertionError("refresh rotation expected accessToken");
  }
  pass("refresh rotation returned access token");

  await runBodyCompatibilityChecks(config);

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
  const invalidCookieResult = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    origin: EVIL_ORIGIN,
    jar: invalidCookie.jar,
    body: {}
  });
  expectStatus(invalidCookieResult, 403, "invalid Origin with cookie refresh");
  expectNoRefreshCookieMutation(invalidCookieResult, config.refreshCookieName, "invalid Origin with cookie refresh");
  await cleanupRefreshCookie(config, invalidCookie.jar, "invalid Origin source");

  const refererSource = await login(config, "referer-source");
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
  const missingResult = await requestJson(config, "/auth/token/refresh", {
    method: "POST",
    jar: missingSource.jar,
    body: {}
  });
  expectStatus(missingResult, 403, "missing Origin/Referer with cookie refresh");
  expectNoRefreshCookieMutation(missingResult, config.refreshCookieName, "missing Origin/Referer with cookie refresh");
  await cleanupRefreshCookie(config, missingSource.jar, "missing Origin source");

  const logoutCookieValid = await login(config, "logout-cookie-valid-source");
  const logoutCookieResult = await requestJson(config, "/auth/logout-cookie", {
    method: "POST",
    origin: config.webOrigin,
    jar: logoutCookieValid.jar
  });
  expectStatus(logoutCookieResult, 200, "logout-cookie valid Origin");
  expectClearRefreshCookie(logoutCookieResult, config.refreshCookieName, "logout-cookie valid Origin");

  const logoutCookieInvalid = await login(config, "logout-cookie-invalid-source");
  const logoutCookieInvalidResult = await requestJson(config, "/auth/logout-cookie", {
    method: "POST",
    origin: EVIL_ORIGIN,
    jar: logoutCookieInvalid.jar
  });
  expectStatus(logoutCookieInvalidResult, 403, "logout-cookie invalid Origin");
  expectNoRefreshCookieMutation(logoutCookieInvalidResult, config.refreshCookieName, "logout-cookie invalid Origin");
  await cleanupRefreshCookie(config, logoutCookieInvalid.jar, "logout-cookie invalid source");

  const protectedLogout = await login(config, "protected-logout-source");
  const protectedLogoutResult = await requestJson(config, "/auth/logout", {
    method: "POST",
    origin: config.webOrigin,
    jar: protectedLogout.jar,
    accessToken: protectedLogout.accessToken,
    idempotencyKey: `auth-smoke-logout-${randomUUID()}`,
    body: {}
  });
  expectStatus(protectedLogoutResult, 200, "protected logout valid Origin");
  expectClearRefreshCookie(protectedLogoutResult, config.refreshCookieName, "protected logout valid Origin");

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

function parseSetCookie(header) {
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
  return {
    name,
    value,
    path: attributes.get("path") ?? "/",
    domain: attributes.get("domain"),
    maxAge: parseNumber(attributes.get("max-age")),
    expiresAt: parseExpires(attributes.get("expires")),
    httpOnly: attributes.has("httponly"),
    attributes
  };
}

function isClearingCookie(cookie) {
  if (typeof cookie.maxAge === "number" && cookie.maxAge <= 0) {
    return true;
  }
  return typeof cookie.expiresAt === "number" && cookie.expiresAt <= Date.now();
}

function getRefreshCookieMutations(setCookieHeaders, cookieName = DEFAULT_REFRESH_COOKIE_NAME) {
  return setCookieHeaders
    .map((header) => parseSetCookie(header))
    .filter((cookie) => cookie?.name === cookieName)
    .map((cookie) => ({
      name: cookie.name,
      clear: isClearingCookie(cookie),
      httpOnly: cookie.httpOnly,
      path: cookie.path
    }));
}

function describeRefreshCookieMutation(setCookieHeaders) {
  return describeMutations(getRefreshCookieMutations(setCookieHeaders));
}

function describeMutations(mutations) {
  if (mutations.length === 0) {
    return "none";
  }
  return mutations.map((mutation) => `${mutation.clear ? "clear" : "set"}:${mutation.name}:path=${mutation.path}`).join(",");
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
