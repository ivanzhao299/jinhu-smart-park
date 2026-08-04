import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  statSync
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, URL } from "node:url";
import {
  decodeJsonFile,
  validateSchema
} from "../lib/strict-decoder.mjs";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
export const repoRoot = resolve(here, "../../../../");
export const rollbackRoot = resolve(
  repoRoot,
  "artifacts/property-remediation/rollback-runs"
);
export const profilePath = resolve(here, "profile.v1.json");
export const profileSchemaPath = resolve(here, "profile.schema.json");
export const FROZEN_PROFILE_SHA256 =
  "df5ba8de5f981b511009854ca76bc57132ddf38a0f230287056b5c3b5d0c4f0d";
export const RUN_ID_PATTERN =
  /^rollback-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u;
export const HASH_PATTERN = /^[0-9a-f]{64}$/u;
export const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const ABBREV_COMMIT_PATTERN = /^[0-9a-f]{7,40}$/u;
const PLACEHOLDER_COMMIT_PATTERN =
  /^(?:0{40}|f{40}|deadbeef[0-9a-f]{32}|0123456789abcdef0123456789abcdef01234567)$/u;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalReviewIdentity(value, label = "review identity") {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const display = value.normalize("NFKC").trim();
  if (display.length < 3) throw new Error(`${label} is too short`);
  return display.toLocaleLowerCase("und").replace(/ß/gu, "ss").replace(/ς/gu, "σ");
}

export function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(",")}}`;
}

export function canonicalSha256(value) {
  return sha256(canonicalize(value));
}

const SENSITIVE_URL_PATTERN = /\b(?!https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|\b))[a-z][a-z0-9+.-]*:\/\/[^\s"']+/iu;
const SENSITIVE_ASSIGNMENT_PATTERN = /["']?(?:password|passwd|token|secret|database[_-]?url|encryption[_-]?key|authorization)["']?\s*(?::|\*\*=|>>>=|<<=|>>=|&&=|\|\|=|\?\?=|[+*/%&^|-]=|=(?!=|>))\s*(?:(["'`])([^"'`\r\n]{4,})\1|([^,;}\r\n]+))/giu;
const SAFE_DYNAMIC_ASSIGNMENT_PATTERN = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\(\)(?:\s*\?\?\s*undefined)?$/u;
const CREDENTIAL_ARG_PATTERN = /--(?:password|passwd|token|secret|database-url|connection-string)(?:=|$)/iu;
const BEARER_PATTERN = /\bbearer\s+[a-z0-9._~+/-]{8,}={0,2}\b/iu;
const JWT_PATTERN = /\beyJ[a-z0-9_-]{5,}\.[a-z0-9_-]{5,}\.[a-z0-9_-]{5,}\b/iu;
const RAW_TOKEN_PATTERN = /\b(?:gh[opsu]_[a-z0-9]{20,}|sk-[a-z0-9_-]{16,})\b/iu;

export function assertNoSensitiveData(value, label = "value") {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const sourcePayload = text.split(/\r?\n/u).map((line) => (/^[+-](?![+-]{2})/u.test(line) ? line.slice(1) : line)).join("\n");
  const assignmentText = sourcePayload.replace(/\n\s*(?=(?:\|\||\?\?|&&|\*\*|>>>|<<|>>|[+*/%?:.&|^(-]|\[|`))/gu, " ");
  const sensitiveAssignment = [...assignmentText.matchAll(SENSITIVE_ASSIGNMENT_PATTERN)].some((match) => {
    if (match[2] !== undefined) return true;
    const unquoted = match[3].trim();
    return !["null", "true", "false", "undefined"].includes(unquoted) && !SAFE_DYNAMIC_ASSIGNMENT_PATTERN.test(unquoted);
  });
  if (SENSITIVE_URL_PATTERN.test(text) || sensitiveAssignment
    || CREDENTIAL_ARG_PATTERN.test(text) || BEARER_PATTERN.test(text)
    || JWT_PATTERN.test(text) || RAW_TOKEN_PATTERN.test(text)) {
    throw new Error(`${label} contains a URL, credential, or secret-bearing argument`);
  }
  return value;
}

export function redactSensitiveData(value) {
  return String(value)
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"']+/giu, "<redacted-url>")
    .replace(/((?:password|passwd|token|secret|database[_-]?url|encryption[_-]?key|authorization)\s*[:=]\s*)[^\s,"'}]+/giu, "$1<redacted>")
    .replace(/\bbearer\s+[a-z0-9._~+/-]{8,}={0,2}\b/giu, "Bearer <redacted>")
    .replace(/\beyJ[a-z0-9_-]{5,}\.[a-z0-9_-]{5,}\.[a-z0-9_-]{5,}\b/giu, "<redacted-jwt>")
    .replace(/\b(?:gh[opsu]_[a-z0-9]{20,}|sk-[a-z0-9_-]{16,})\b/giu, "<redacted-token>");
}

export function assertHash(value, label = "SHA-256") {
  if (!HASH_PATTERN.test(value ?? "")) throw new Error(`invalid ${label}`);
  return value;
}

export function assertFinalSha(value) {
  if (!COMMIT_PATTERN.test(value ?? "") || PLACEHOLDER_COMMIT_PATTERN.test(value)) {
    throw new Error("final SHA must be a non-placeholder full 40-hex commit");
  }
  return value;
}

export function assertCommitRef(value, label = "commit") {
  if (!ABBREV_COMMIT_PATTERN.test(value ?? "")) throw new Error(`invalid ${label}`);
  return value;
}

export function assertRunId(value) {
  if (!RUN_ID_PATTERN.test(value ?? "")) throw new Error("invalid rollback run id");
  return value;
}

export function isPathInside(parent, child) {
  const delta = relative(resolve(parent), resolve(child));
  return delta === "" || (!delta.startsWith(`..${sep}`) && delta !== ".." && !isAbsolute(delta));
}

export function resolveInside(parent, candidate, label = "path") {
  const absolute = resolve(parent, candidate);
  if (!isPathInside(parent, absolute)) throw new Error(`${label} escapes its allowed root`);
  return absolute;
}

export function assertNoSymlinks(root) {
  const absolute = resolve(root);
  const visit = (path) => {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new Error(`symlink is forbidden in rollback evidence: ${path}`);
    if (info.isDirectory()) {
      for (const name of readdirSync(path)) visit(resolve(path, name));
    }
  };
  visit(absolute);
  return absolute;
}

export function assertPathChainHasNoSymlink(anchor, target) {
  const absoluteAnchor = resolve(anchor);
  const absoluteTarget = resolve(target);
  if (!isPathInside(absoluteAnchor, absoluteTarget)) throw new Error("path chain escapes its anchor");
  const delta = relative(absoluteAnchor, absoluteTarget);
  const paths = [absoluteAnchor];
  let current = absoluteAnchor;
  for (const part of delta.split(sep).filter(Boolean)) {
    current = resolve(current, part);
    paths.push(current);
  }
  for (const path of paths) {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw new Error(`symlink is forbidden in rollback path chain: ${path}`);
  }
  return absoluteTarget;
}

export function assertMutationPathHasNoSymlink(anchor, target) {
  const absoluteAnchor = resolve(anchor); const absoluteTarget = resolve(target);
  if (!isPathInside(absoluteAnchor, absoluteTarget)) throw new Error("mutation path escapes its anchor");
  let current = absoluteAnchor;
  for (const part of relative(absoluteAnchor, absoluteTarget).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    try {
      const info = lstatSync(current);
      if (info.isSymbolicLink()) throw new Error(`symlink is forbidden in mutation path: ${current}`);
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }
  return absoluteTarget;
}

export function hashFile(path) {
  const bytes = readFileSync(path);
  return { sha256: sha256(bytes), size: statSync(path).size };
}

export function loadProfile() {
  const bytes = readFileSync(profilePath);
  const actualSha = sha256(bytes);
  if (actualSha !== FROZEN_PROFILE_SHA256) {
    throw new Error("rollback profile checksum differs from frozen v1 profile");
  }
  const profile = JSON.parse(bytes);
  validateSchema(profile, decodeJsonFile(profileSchemaPath), profilePath);
  const ids = profile.cases.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error("rollback case ids must be unique");
  const backend = profile.cases.filter(({ kind }) => kind === "backend-closure");
  const frontend = profile.cases.filter(({ kind }) => kind === "frontend-group");
  if (backend.length !== 17 || frontend.length !== 2) {
    throw new Error("rollback profile must freeze 17 backend closures and 2 frontend groups");
  }
  return { profile: Object.freeze(profile), profileSha256: actualSha };
}

export function durableTableNames(profile) {
  return Object.keys(profile.durableTableSources).sort();
}

export function validateDurableTableSources(profile) {
  for (const [table, source] of Object.entries(profile.durableTableSources)) {
    if (!/^[a-z][a-z0-9_]+$/u.test(table)) throw new Error(`invalid durable table name: ${table}`);
    const path = resolveInside(repoRoot, source, "durable-table migration source");
    const sql = readFileSync(path, "utf8");
    const escaped = table.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    if (!new RegExp(`CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+(?:public\\.)?${escaped}\\s*\\(`, "iu").test(sql)) {
      throw new Error(`durable table is not created by its frozen migration source: ${table}`);
    }
  }
  return durableTableNames(profile);
}

export function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
  return value;
}

export function validateTimestamp(value, label, { notBefore, notAfter } = {}) {
  const milliseconds = Date.parse(value ?? "");
  if (!Number.isFinite(milliseconds)) throw new Error(`invalid ${label}`);
  if (notBefore !== undefined && milliseconds < notBefore) {
    throw new Error(`${label} predates the bound run`);
  }
  if (notAfter !== undefined && milliseconds > notAfter) {
    throw new Error(`${label} is after the allowed time window`);
  }
  return milliseconds;
}

export function validateDurableSnapshot(snapshot, profile = loadProfile().profile) {
  exactKeys(snapshot, ["schemaVersion", "capturedAt", "tables", "snapshotSha256"], "durable snapshot");
  if (snapshot.schemaVersion !== "property-track-c-durable-snapshot-v1") {
    throw new Error("invalid durable snapshot schema version");
  }
  validateTimestamp(snapshot.capturedAt, "durable snapshot timestamp");
  const durableTables = durableTableNames(profile);
  if (!Array.isArray(snapshot.tables) || snapshot.tables.length !== durableTables.length) {
    throw new Error("durable snapshot table set is incomplete");
  }
  const seen = new Set();
  for (const entry of snapshot.tables) {
    exactKeys(entry, ["table", "count", "contentSha256"], "durable table summary");
    if (!durableTables.includes(entry.table) || seen.has(entry.table)) {
      throw new Error("durable snapshot has an unknown or duplicate table");
    }
    seen.add(entry.table);
    if (!Number.isSafeInteger(entry.count) || entry.count < 0) {
      throw new Error("durable snapshot count must be a non-negative safe integer");
    }
    assertHash(entry.contentSha256, "durable content hash");
  }
  const projection = { capturedAt: snapshot.capturedAt, tables: snapshot.tables };
  if (canonicalSha256(projection) !== snapshot.snapshotSha256) {
    throw new Error("durable snapshot checksum mismatch");
  }
  const serialized = JSON.stringify(snapshot).toLowerCase();
  for (const forbidden of profile.forbiddenSnapshotFields) {
    if (serialized.includes(`"${forbidden.toLowerCase()}"`)) {
      throw new Error(`durable snapshot contains forbidden PII/detail field ${forbidden}`);
    }
  }
  return snapshot;
}

export function makeDurableSnapshot(tables, capturedAt = new Date().toISOString()) {
  const normalized = tables.map(({ table, count, contentSha256 }) => ({ table, count, contentSha256 }));
  const projection = { capturedAt, tables: normalized };
  return {
    schemaVersion: "property-track-c-durable-snapshot-v1",
    ...projection,
    snapshotSha256: canonicalSha256(projection)
  };
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
