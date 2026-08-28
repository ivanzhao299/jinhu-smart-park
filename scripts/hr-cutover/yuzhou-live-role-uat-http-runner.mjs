/* global URL, fetch */
import { createHash, randomUUID } from "node:crypto";
import { validateYuzhouLiveRoleUatApiMatrix } from "./yuzhou-live-role-uat-api-matrix-lib.mjs";

export class YuzhouLiveRoleUatHttpRunnerError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "YuzhouLiveRoleUatHttpRunnerError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new YuzhouLiveRoleUatHttpRunnerError(code, detail);
};
const sha256 = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const successStatuses = new Set([200, 201, 204]);
const expectedStatuses = Object.freeze({
  success: successStatuses,
  forbidden: new Set([403]),
  not_found_or_forbidden: new Set([403, 404]),
  conflict: new Set([409])
});

function responseShape(value) {
  if (Array.isArray(value)) return value.length === 0 ? [] : [responseShape(value[0])];
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, responseShape(value[key])]));
  }
  if (value === null) return "null";
  return typeof value;
}

function validateLoopbackApiBase(apiBase) {
  let url;
  try {
    url = new URL(apiBase);
  } catch {
    fail("YUZHOU_UAT_HTTP_BASE_INVALID", "URL");
  }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname) || url.username || url.password || url.pathname !== "/api/v1") {
    fail("YUZHOU_UAT_HTTP_BASE_UNSAFE", "isolated loopback /api/v1 required");
  }
  return url.toString().replace(/\/$/u, "");
}

function routeFor(template, substitutions) {
  const route = template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/gu, (_match, key) => {
    const value = substitutions?.[key];
    if (typeof value !== "string" || !/^[0-9a-f-]{36}$/iu.test(value)) fail("YUZHOU_UAT_HTTP_SUBSTITUTION_INVALID", key);
    return value;
  });
  if (route.includes("{") || !/^\/hr(?:\/|$)/u.test(route) || route.includes("..") || route.includes("?")) {
    fail("YUZHOU_UAT_HTTP_ROUTE_INVALID", template);
  }
  return route;
}

function normalizedAssertions(expected, observed) {
  if (!observed || typeof observed !== "object" || Array.isArray(observed)) fail("YUZHOU_UAT_HTTP_ASSERTION_INVALID", "object required");
  const keys = Object.keys(observed);
  if (JSON.stringify(keys) !== JSON.stringify(expected) || keys.some(key => observed[key] !== true)) {
    fail("YUZHOU_UAT_HTTP_ASSERTION_FAILED", expected.find(key => observed[key] !== true || !keys.includes(key)) ?? "shape");
  }
  return Object.fromEntries(expected.map(key => [key, true]));
}

export class YuzhouLiveRoleUatHttpRunner {
  #apiBase;
  #tokens;
  #matrix;
  #matrixByKey;
  #request;
  #idempotencyPrefix;

  constructor({ apiBase, tokens, apiMatrix, taskCard, idempotencyPrefix, request = fetch }) {
    validateYuzhouLiveRoleUatApiMatrix(apiMatrix, taskCard);
    this.#apiBase = validateLoopbackApiBase(apiBase);
    this.#matrix = apiMatrix;
    this.#matrixByKey = new Map(apiMatrix.checks.map(check => [`${check.legacyId}:${check.kind}:${check.checkId}`, check]));
    this.#tokens = { ...tokens };
    if (Object.keys(this.#tokens).sort().join(",") !== "employee,hr_maker,hr_reviewer,manager"
      || Object.values(this.#tokens).some(token => typeof token !== "string" || token.length < 16)) {
      fail("YUZHOU_UAT_HTTP_ACTORS_INVALID", "four separated tokens required");
    }
    if (!/^[a-z0-9][a-z0-9._-]{5,80}$/u.test(idempotencyPrefix ?? "")) fail("YUZHOU_UAT_HTTP_IDEMPOTENCY_INVALID", "prefix");
    if (typeof request !== "function") fail("YUZHOU_UAT_HTTP_REQUEST_INVALID", "function");
    this.#request = request;
    this.#idempotencyPrefix = idempotencyPrefix;
  }

  async execute({ legacyId, kind, checkId, substitutions = {}, bodies = [], assert }) {
    const key = `${legacyId}:${kind}:${checkId}`;
    const check = this.#matrixByKey.get(key);
    if (!check) fail("YUZHOU_UAT_HTTP_CHECK_UNKNOWN", key);
    if (typeof assert !== "function") fail("YUZHOU_UAT_HTTP_ASSERTION_INVALID", key);
    if (!Array.isArray(bodies) || bodies.length !== check.operations.length) fail("YUZHOU_UAT_HTTP_BODY_COUNT_INVALID", key);
    const placeholders = new Set(check.operations.flatMap(operation => [...operation.route.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/gu)].map(match => match[1])));
    if (Object.keys(substitutions).some(name => !placeholders.has(name)) || [...placeholders].some(name => !(name in substitutions))) {
      fail("YUZHOU_UAT_HTTP_SUBSTITUTION_INVALID", key);
    }
    const token = this.#tokens[check.actor];
    const responses = [];
    const operations = [];
    for (const [index, operation] of check.operations.entries()) {
      const route = routeFor(operation.route, substitutions);
      const body = bodies[index];
      if (operation.method === "GET" && body !== undefined) fail("YUZHOU_UAT_HTTP_BODY_INVALID", `${key}.${index}`);
      const headers = { authorization: `Bearer ${token}`, "x-request-id": randomUUID() };
      if (body !== undefined) headers["content-type"] = "application/json";
      if (operation.method !== "GET") headers["x-idempotency-key"] = `${this.#idempotencyPrefix}-${sha256(`${key}:${index}`).slice(0, 24)}`;
      const response = await this.#request(`${this.#apiBase}${route}`, {
        method: operation.method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!expectedStatuses[operation.outcome].has(response.status)) {
        fail("YUZHOU_UAT_HTTP_STATUS_MISMATCH", `${key}.${index}:${response.status}`);
      }
      responses.push({ status: response.status, body: payload });
      operations.push({
        method: operation.method,
        routeTemplate: operation.route,
        outcome: operation.outcome,
        statusCode: response.status,
        requestBodySha256: sha256(body === undefined ? null : body),
        responseShapeSha256: sha256(responseShape(payload))
      });
    }
    const assertions = normalizedAssertions(check.assertions, await assert(responses));
    return {
      actor: check.actor,
      checkKeySha256: sha256(key),
      operations,
      assertions,
      observationSha256: sha256({ actor: check.actor, operations, assertions })
    };
  }

  get matrixSha256() {
    return sha256(`${JSON.stringify(this.#matrix, null, 2)}\n`);
  }
}
