import { existsSync, lstatSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import process from "node:process";
import { resolve } from "node:path";
import { connect } from "node:net";
import { createRequire } from "node:module";
import { URL } from "node:url";
import {
  canonicalSha256,
  durableTableNames,
  exactKeys,
  makeDurableSnapshot,
  assertMutationPathHasNoSymlink,
  assertNoSensitiveData,
  redactSensitiveData,
  repoRoot,
  rollbackRoot,
  resolveInside,
  sha256
} from "./lib.mjs";
import { enumerateAuthorityProcesses, readBoundRuntimeLease, terminateAuthorityProcesses } from "./runtime-lease.mjs";

import { execFileBounded, TIMEOUTS, withHardTimeout } from "./timeout.mjs";
const require = createRequire(resolve(repoRoot, "apps/api/package.json"));
const { Client } = require("pg");
export const CLEANUP_FIELDS = ["containers", "networks", "volumes", "databases", "processGroups", "ports", "worktrees", "tempFiles", "secretFiles"];

function safeDatabaseName(value, label) {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(value ?? "")) throw new Error(`invalid ${label}`);
  return value;
}

export function databaseUrlForName(adminDatabaseUrl, database) {
  safeDatabaseName(database, "target database name");
  const url = new URL(adminDatabaseUrl);
  if (!/^postgres(?:ql):$/u.test(url.protocol) || !url.hostname) throw new Error("invalid PostgreSQL administration URL");
  url.pathname = `/${database}`;
  url.search = "";
  url.hash = "";
  if (decodeURIComponent(url.pathname.slice(1)) !== database) throw new Error("target database URL encoding mismatch");
  return url.toString();
}

export function resourceAuthority({ runId, finalSha, caseId, runRoot, executionNonce, commandSpecSha256 }) {
  if (!/^[0-9a-f]{64}$/u.test(executionNonce ?? "")) throw new Error("resource authority requires the run execution nonce");
  if (!/^[0-9a-f]{64}$/u.test(commandSpecSha256 ?? "")) throw new Error("resource authority requires the frozen command spec checksum");
  const suffix = sha256(`${runId}:${caseId}`).slice(0, 12);
  const portSeed = Number.parseInt(suffix.slice(0, 6), 16) % 5_000;
  return {
    labels: {
      "jinhu.rollback.run_id": runId,
      "jinhu.rollback.final_sha": finalSha,
      "jinhu.rollback.case_id": caseId
    },
    database: `jinhu_rollback_${suffix}`,
    // Keep service listeners below Linux's default ephemeral client-port range
    // (typically starting at 32768) and in separate authority-only bands.
    apiPort: 20_000 + portSeed,
    webPort: 25_000 + portSeed,
    worktree: resolve(runRoot, "worktrees", caseId),
    credentialFile: resolve(runRoot, "secrets", `${caseId}.database-url`),
    runtimeManifest: resolve(runRoot, "tmp", caseId, "service-runtime.json"),
    runtimeNonce: sha256(`${executionNonce}:${runId}:${finalSha}:${caseId}:runtime`),
    commandSpecSha256,
    expectedExecutable: realpathSync(process.execPath)
  };
}

export function assertUniqueAuthorityPorts(authorities) {
  const seen = new Map();
  for (const [caseId, authority] of Object.entries(authorities)) {
    for (const [role, port] of [["api", authority.apiPort], ["web", authority.webPort]]) {
      if (!Number.isInteger(port)) throw new Error(`invalid ${role} authority port for ${caseId}`);
      const previous = seen.get(port);
      if (previous) throw new Error(`rollback authority port collision: ${previous} and ${caseId}:${role}`);
      seen.set(port, `${caseId}:${role}`);
    }
  }
  return authorities;
}

export function readDatabaseCredential(authority, runRoot) {
  const path = resolveInside(resolve(runRoot, "secrets"), authority.credentialFile, "database credential file");
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || (statSync(path).mode & 0o077) !== 0) {
    throw new Error("database credential file must be a regular mode-0600 file");
  }
  let credential;
  try { credential = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error("database credential file must contain strict JSON"); }
  exactKeys(credential, ["adminDatabaseUrl", "sourceDatabase", "sourceDatasetProfileId", "sourceDatasetSha256", "jwtSecret", "partyDataEncryptionKey", "adminUsername", "adminPassword", "tenantId", "parkId"], "database credential");
  if (typeof credential.adminDatabaseUrl !== "string" || typeof credential.sourceDatabase !== "string") throw new Error("invalid database credential fields");
  for (const [name, minimum] of [["jwtSecret", 32], ["partyDataEncryptionKey", 32], ["adminUsername", 1], ["adminPassword", 6], ["tenantId", 1], ["parkId", 1]]) if (typeof credential[name] !== "string" || credential[name].length < minimum) throw new Error(`invalid credential field ${name}`);
  if (credential.sourceDatasetProfileId !== "pr192-property-uat-v1" || !/^[0-9a-f]{64}$/u.test(credential.sourceDatasetSha256 ?? "")) throw new Error("invalid source dataset identity");
  const admin = new URL(credential.adminDatabaseUrl);
  if (!/^postgres(?:ql):$/u.test(admin.protocol) || !admin.hostname) throw new Error("invalid administration database URL");
  const adminDatabase = decodeURIComponent(admin.pathname.replace(/^\//u, ""));
  safeDatabaseName(credential.sourceDatabase, "source database name");
  if (!adminDatabase || adminDatabase === authority.database || credential.sourceDatabase === authority.database) throw new Error("administration/source database must differ from the case database");
  const targetDatabaseUrl = databaseUrlForName(credential.adminDatabaseUrl, authority.database);
  const target = new URL(targetDatabaseUrl);
  return { ...credential, targetDatabaseUrl, postgres: { POSTGRES_HOST: target.hostname, POSTGRES_PORT: target.port || "5432", POSTGRES_DB: decodeURIComponent(target.pathname.slice(1)), POSTGRES_USER: decodeURIComponent(target.username), POSTGRES_PASSWORD: decodeURIComponent(target.password) } };
}

async function connectBounded(connectionString, signal, label) {
  const client = new Client({ connectionString, connectionTimeoutMillis: TIMEOUTS.databaseConnect });
  await withHardTimeout(() => client.connect(), TIMEOUTS.databaseConnect, `${label} connect`, signal);
  await withHardTimeout(() => client.query("SET statement_timeout = '60s'; SET lock_timeout = '10s'"), TIMEOUTS.databaseQuery, `${label} timeout policy`, signal);
  return client;
}

async function queryBounded(client, query, values, label, signal) {
  return withHardTimeout(() => client.query(query, values), TIMEOUTS.databaseQuery, label, signal);
}

function datasetProjection(snapshot, profile) {
  const counts = Object.fromEntries(snapshot.tables.map(({ table, count }) => [table, count]));
  if (snapshot.tables.every(({ count }) => count === 0)) throw new Error("source dataset is empty");
  for (const table of profile.requiredDatasetSentinels) if (!Number.isSafeInteger(counts[table]) || counts[table] < 1) throw new Error(`source dataset sentinel is empty: ${table}`);
  return { profileId: profile.sourceDatasetProfileId, tablesSha256: canonicalSha256(snapshot.tables), counts };
}

export async function verifySourceDataset({ credential, profile, signal }) {
  const sourceUrl = databaseUrlForName(credential.adminDatabaseUrl, credential.sourceDatabase);
  const source = await captureDurableSnapshot({ databaseUrl: sourceUrl, expectedDatabase: credential.sourceDatabase, profile, signal });
  const identity = datasetProjection(source, profile);
  if (identity.profileId !== credential.sourceDatasetProfileId || identity.tablesSha256 !== credential.sourceDatasetSha256) throw new Error("source dataset checksum/profile mismatch");
  return { source, identity };
}

async function provisionCaseDatabaseBounded({ authority, credential, profile, sourceIdentity, signal }) {
  const client = await connectBounded(credential.adminDatabaseUrl, signal, "database provision");
  try {
    const privilege = await queryBounded(client, "SELECT (rolcreatedb OR rolsuper) AS allowed FROM pg_roles WHERE rolname=current_user", [], "CREATEDB privilege preflight", signal);
    if (privilege.rows[0]?.allowed !== true) throw new Error("administration role lacks CREATEDB privilege");
    const sourceSessions = await queryBounded(client, "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [credential.sourceDatabase], "template active-session preflight", signal);
    if (Number(sourceSessions.rows[0]?.count) !== 0) throw new Error("source template database has active connections");
    const existing = await queryBounded(client, "SELECT count(*)::int AS count FROM pg_database WHERE datname=$1", [authority.database], "target existence check", signal);
    if (Number(existing.rows[0]?.count) !== 0) throw new Error("case database already exists");
    await queryBounded(client, `CREATE DATABASE ${safeDatabaseName(authority.database, "target database")} TEMPLATE ${safeDatabaseName(credential.sourceDatabase, "source database")}`, [], "case database clone", signal);
  } finally { await withHardTimeout(() => client.end(), TIMEOUTS.databaseConnect, "provision client close").catch(() => {}); }
  const target = await connectBounded(credential.targetDatabaseUrl, signal, "target database verification");
  try {
    const result = await queryBounded(target, "SELECT current_database() AS database", [], "target database identity", signal);
    if (result.rows[0]?.database !== authority.database) throw new Error("provisioned connection is not the case database");
  } finally { await withHardTimeout(() => target.end(), TIMEOUTS.databaseConnect, "target client close").catch(() => {}); }
  const targetSnapshot = await captureDurableSnapshot({ databaseUrl: credential.targetDatabaseUrl, expectedDatabase: authority.database, profile, signal });
  const targetIdentity = datasetProjection(targetSnapshot, profile);
  if (targetIdentity.tablesSha256 !== sourceIdentity.tablesSha256) throw new Error("cloned case database differs from the bound source dataset");
  return { targetSnapshot, targetIdentity };
}

export function provisionCaseDatabase(args) {
  return withHardTimeout((signal) => provisionCaseDatabaseBounded({ ...args, signal }), TIMEOUTS.cleanup, "case database provision total deadline", args.signal);
}

export async function captureDurableSnapshot({ databaseUrl, expectedDatabase, profile, now = () => new Date(), signal }) {
  const client = await connectBounded(databaseUrl, signal, "durable snapshot");
  try {
    const identity = await queryBounded(client, "SELECT current_database() AS database", [], "snapshot database identity", signal);
    if (identity.rows[0]?.database !== expectedDatabase) throw new Error("durable snapshot attempted outside the case database");
    const extension = await queryBounded(client, "SELECT count(*)::int AS count FROM pg_extension WHERE extname='pgcrypto'", [], "pgcrypto availability", signal);
    if (Number(extension.rows[0]?.count) !== 1) throw new Error("pgcrypto must already exist; snapshot capture never installs extensions");
    const tables = [];
    for (const table of durableTableNames(profile)) {
      const result = await queryBounded(client, `SELECT count(*)::text AS count, encode(digest(COALESCE(string_agg(encode(digest(to_jsonb(t)::text, 'sha256'), 'hex'), '' ORDER BY encode(digest(to_jsonb(t)::text, 'sha256'), 'hex')), ''), 'sha256'), 'hex') AS digest FROM public.${table} AS t`, [], `snapshot ${table}`, signal);
      const count = Number(result.rows[0]?.count);
      const digest = result.rows[0]?.digest;
      if (!Number.isSafeInteger(count) || count < 0 || !/^[0-9a-f]{64}$/u.test(digest ?? "")) throw new Error(`invalid durable snapshot projection: ${table}`);
      tables.push({ table, count, contentSha256: digest });
    }
    return makeDurableSnapshot(tables, now().toISOString());
  } finally {
    await withHardTimeout(() => client.end(), TIMEOUTS.databaseConnect, "snapshot client close").catch(() => {});
  }
}

async function dockerIds(labels, kind) {
  const labelArgs = Object.entries(labels).flatMap(([key, value]) => ["--filter", `label=${key}=${value}`]);
  const args = kind === "containers" ? ["ps", "-aq", ...labelArgs]
    : kind === "networks" ? ["network", "ls", "-q", ...labelArgs]
      : ["volume", "ls", "-q", ...labelArgs];
  const { stdout } = await execFileBounded("/usr/bin/docker", args, { maxBuffer: 4 * 1024 * 1024 }, { timeout: TIMEOUTS.cleanup, label: `docker ${kind} list` });
  return stdout.trim().split("\n").filter(Boolean);
}

async function removeDocker(labels, kind) {
  const ids = await dockerIds(labels, kind);
  if (ids.length > 0) {
    const args = kind === "containers" ? ["rm", "-f", ...ids]
      : kind === "networks" ? ["network", "rm", ...ids]
        : ["volume", "rm", "-f", ...ids];
    await execFileBounded("/usr/bin/docker", args, { maxBuffer: 4 * 1024 * 1024 }, { timeout: TIMEOUTS.cleanup, label: `docker ${kind} cleanup` });
  }
  return (await dockerIds(labels, kind)).length;
}

async function removeDatabase(databaseUrl, database) {
  const client = await connectBounded(databaseUrl, undefined, "database cleanup");
  try {
    await queryBounded(client, "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [database], "terminate case sessions");
    await queryBounded(client, `DROP DATABASE IF EXISTS ${safeDatabaseName(database, "cleanup database")}`, [], "drop case database");
    const result = await queryBounded(client, "SELECT count(*)::int AS count FROM pg_database WHERE datname=$1", [database], "verify database removal");
    return Number(result.rows[0]?.count ?? 1);
  } finally {
    await withHardTimeout(() => client.end(), TIMEOUTS.databaseConnect, "cleanup client close").catch(() => {});
  }
}

export function validateCleanupResult(cleanup) {
  exactKeys(cleanup, ["schemaVersion", "status", "attempted", "authoritySha256", "residual", "errors", "manifestSha256"], "runner cleanup result");
  if (cleanup.schemaVersion !== "property-track-c-runner-cleanup-v1" || cleanup.attempted !== true || !["PASS", "FAIL"].includes(cleanup.status)) throw new Error("invalid runner cleanup result");
  exactKeys(cleanup.residual, CLEANUP_FIELDS, "runner cleanup residual");
  if (Object.values(cleanup.residual).some((count) => !Number.isSafeInteger(count) || count < 0)) throw new Error("cleanup residual values must be non-negative integers");
  if (!Array.isArray(cleanup.errors) || cleanup.errors.some((entry) => typeof entry !== "string")) throw new Error("cleanup errors must be strings");
  assertNoSensitiveData(cleanup, "runner cleanup evidence");
  const projection = { attempted: cleanup.attempted, authoritySha256: cleanup.authoritySha256, residual: cleanup.residual, errors: cleanup.errors };
  if (cleanup.manifestSha256 !== canonicalSha256(projection)) throw new Error("cleanup manifest checksum mismatch");
  const shouldPass = cleanup.errors.length === 0 && Object.values(cleanup.residual).every((count) => count === 0);
  if ((cleanup.status === "PASS") !== shouldPass) throw new Error("cleanup terminal status contradicts its result");
  return cleanup;
}

async function portInUse(port) {
  return new Promise((accept) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); accept(true); });
    socket.once("error", () => accept(false));
    socket.setTimeout(1000, () => { socket.destroy(); accept(false); });
  });
}

export async function cleanupCaseResources({ authority, runRoot, repoRoot }) {
  for (const path of [rollbackRoot, runRoot, resolve(runRoot, "worktrees"), resolve(runRoot, "tmp"), resolve(runRoot, "secrets"), authority.worktree, resolve(authority.runtimeManifest, ".."), resolve(authority.credentialFile, "..")]) assertMutationPathHasNoSymlink(resolve(rollbackRoot, "../../.."), path);
  assertMutationPathHasNoSymlink(runRoot, authority.runtimeManifest); assertMutationPathHasNoSymlink(runRoot, authority.credentialFile);
  const residual = Object.fromEntries(CLEANUP_FIELDS.map((name) => [name, 0]));
  const errors = [];
  try { readBoundRuntimeLease(authority); } catch (error) { errors.push(redactSensitiveData(`runtimeLease:${error.message}`)); }
  try { residual.processGroups = await terminateAuthorityProcesses(authority, enumerateAuthorityProcesses(authority)); } catch (error) { errors.push(redactSensitiveData(`processGroups:${error.message}`)); residual.processGroups = 1; }
  residual.ports = Number(await portInUse(authority.apiPort)) + Number(await portInUse(authority.webPort));
  if (residual.processGroups || residual.ports) errors.push("runtime:authority process groups or ports remain");
  let credential = null;
  try { credential = readDatabaseCredential(authority, runRoot); } catch (error) { errors.push(redactSensitiveData(`credential:${error.message}`)); residual.databases = 1; }
  for (const kind of ["containers", "networks", "volumes"]) {
    try { residual[kind] = await removeDocker(authority.labels, kind); } catch (error) { errors.push(redactSensitiveData(`${kind}:${error.message}`)); residual[kind] = 1; }
  }
  if (credential) {
    try { residual.databases = await removeDatabase(credential.adminDatabaseUrl, authority.database); } catch (error) { errors.push(redactSensitiveData(`databases:${error.message}`)); residual.databases = 1; }
  }
  if (existsSync(authority.worktree)) {
    try { if (lstatSync(authority.worktree).isSymbolicLink()) throw new Error("worktree root is a symlink"); await execFileBounded("/usr/bin/git", ["worktree", "remove", "--force", authority.worktree], { cwd: repoRoot, env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", TZ: "UTC" } }, { timeout: TIMEOUTS.cleanup, label: "git worktree cleanup" }); } catch (error) { errors.push(redactSensitiveData(`worktrees:${error.message}`)); }
  }
  residual.worktrees = existsSync(authority.worktree) ? 1 : 0;
  if (residual.worktrees) errors.push("worktrees:exact worktree remains");
  const tempDir = resolve(runRoot, "tmp", authority.labels["jinhu.rollback.case_id"]);
  if (existsSync(tempDir) && lstatSync(tempDir).isSymbolicLink()) { errors.push("tempFiles:root is a symlink"); residual.tempFiles = 1; } else rmSync(tempDir, { recursive: true, force: true });
  residual.tempFiles = existsSync(tempDir) ? 1 : 0;
  if (existsSync(authority.credentialFile) && lstatSync(authority.credentialFile).isSymbolicLink()) { errors.push("secretFiles:credential is a symlink"); residual.secretFiles = 1; } else rmSync(authority.credentialFile, { force: true });
  residual.secretFiles = existsSync(authority.credentialFile) ? 1 : 0;
  const authoritySha256 = canonicalSha256(authority);
  const projection = { attempted: true, authoritySha256, residual, errors };
  return validateCleanupResult({
    schemaVersion: "property-track-c-runner-cleanup-v1",
    status: errors.length === 0 && Object.values(residual).every((count) => count === 0) ? "PASS" : "FAIL",
    ...projection,
    manifestSha256: canonicalSha256(projection)
  });
}
