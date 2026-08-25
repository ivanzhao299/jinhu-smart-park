#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { computeMappingContractHash } from "./verify-full-domain-contract.mjs";
import { manifestHash, verifyManifestChain } from "./parent-manifest.mjs";
import { assertManifestFacts, verifyGlobalFacts } from "./verify-global-facts.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CONTRACT_PATH = resolve(ROOT, "scripts/hr-cutover/contracts/full-domain-contract-v1.json");
const DOMAIN_ORDER = ["T0", "T1", "T2", "T3", "T4", "T5"];
const ROLLBACK_ORDER = [...DOMAIN_ORDER].reverse();
const STATES = ["planned", "provisioned", "extracting", "loading", "verifying", "uat_ready", "rollback_ready", "cleaned"];
const RESOURCE_TYPES = ["database", "container", "volume", "role", "directory", "account", "file", "port", "process", "credential_artifact"];
const RUN_ID = /^yzfull-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}-r([AB])$/;
const LAB_ID = /^jinhu_hr_migration_lab_full_[a-z0-9_]{6,48}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const CODE_SHA = /^[0-9a-f]{40}$/;
const FORBIDDEN_TARGET = /prod(?:uction)?|jinhu_smart_park|shared|default/i;
const FORBIDDEN_KEY = /password|passwd|token|secret|connectionstring|privatekey|bankaccount|idcard|employeename|fullname|mobile|phone|salaryamount|grosspay|netpay/i;
const FORBIDDEN_VALUE = /postgres(?:ql)?:\/\/|sqlserver:\/\/|Bearer\s+|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}/i;
const LOAD_COMMON_ENV = ["YUZHOU_TARGET_TENANT_ID", "YUZHOU_TARGET_PARK_ID", "YUZHOU_BACKUP_SHA256"];
let ACTIVE_CHILD = null;
export const ADAPTER_ENV_ALLOWLIST = {
  T0: { extract: ["YUZHOU_SQLSERVER_CONTAINER"], load: [...LOAD_COMMON_ENV, "YUZHOU_DEPARTMENTS_SHA256", "YUZHOU_POSITIONS_SHA256", "YUZHOU_EMPLOYEES_SHA256"], rollback: [] },
  T1: { extract: ["YUZHOU_SQLSERVER_CONTAINER"], load: [...LOAD_COMMON_ENV, "YUZHOU_T1_EVENTS_SHA256", "YUZHOU_T1_TYPES_SHA256"], rollback: [] },
  T2: { extract: ["YUZHOU_SQLSERVER_CONTAINER"], load: [...LOAD_COMMON_ENV, "YUZHOU_T2_TYPES_SHA256", "YUZHOU_T2_CONTRACTS_SHA256", "YUZHOU_T2_CHANGES_SHA256"], rollback: [] },
  T3: { extract: ["YUZHOU_SQLSERVER_CONTAINER"], load: [...LOAD_COMMON_ENV, "YUZHOU_T3_ATTENDANCE_SHA256", "YUZHOU_T3_POLICIES_SHA256", "YUZHOU_T3_INSURANCE_SHA256"], rollback: [] },
  T4: { extract: ["YUZHOU_SQLSERVER_CONTAINER"], load: ["YUZHOU_TARGET_TENANT_ID", "YUZHOU_TARGET_PARK_ID", "YUZHOU_T4_BUSINESS_SHA256"], rollback: [] },
  T5: { extract: ["YUZHOU_SQLSERVER_CONTAINER"], load: [...LOAD_COMMON_ENV, "YUZHOU_T5_BUSINESS_SHA256"], rollback: [] }
};

export class LifecycleError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LifecycleError";
    this.code = code;
  }
}

function fail(code, detail) {
  throw new LifecycleError(code, detail);
}

function exactKeys(value, required, optional, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("CONFIG_INVALID", `${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail("CONFIG_INVALID", `${label}.${key} is not allowed`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail("CONFIG_INVALID", `${label}.${key} is required`);
}

function scanSensitive(value, at = "$") {
  if (Array.isArray(value)) return value.forEach((item, index) => scanSensitive(item, `${at}[${index}]`));
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) fail("SECRET_PATTERN_DETECTED", `forbidden key at ${at}.${key}`);
      scanSensitive(child, `${at}.${key}`);
    }
  } else if (typeof value === "string" && FORBIDDEN_VALUE.test(value)) {
    fail("SECRET_PATTERN_DETECTED", `forbidden value at ${at}`);
  }
}

function inside(parent, child) {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}

function assertControlledPath(value, project, field) {
  if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value || !value.split(sep).includes(project)) {
    fail("UNSAFE_TARGET_IDENTITY", `${field} must be a normalized absolute path namespaced by ${project}`);
  }
  if (FORBIDDEN_TARGET.test(value)) fail("UNSAFE_TARGET_IDENTITY", `${field} contains a forbidden target marker`);
}

function validateTriple(triple) {
  exactKeys(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], [], "triple");
  if (!CODE_SHA.test(triple.codeSha)) fail("TRIPLE_MISMATCH", "codeSha must be a full lowercase git SHA");
  for (const field of ["sourceSnapshotHash", "mappingContractHash"]) if (!SHA256.test(triple[field])) fail("TRIPLE_MISMATCH", `${field} must be a lowercase SHA-256`);
}

export function validateConfig(config) {
  exactKeys(config, ["formatVersion", "runId", "rehearsal", "backend", "triple", "target", "source", "t4Evidence", "adapterEnv"], ["verification"], "config");
  scanSensitive(config);
  if (config.formatVersion !== 1) fail("CONFIG_INVALID", "formatVersion must be 1");
  const match = RUN_ID.exec(config.runId ?? "");
  if (!match || match[1] !== config.rehearsal) fail("RUN_ID_INVALID", "runId must bind rehearsal A or B");
  if (!['fixture', 'lab'].includes(config.backend)) fail("BACKEND_INVALID", "backend must be fixture or lab");
  validateTriple(config.triple);
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
  if (config.triple.mappingContractHash !== computeMappingContractHash(contract)) fail("TRIPLE_MISMATCH", "mappingContractHash does not match the executable mapping bundle");
  const currentCodeSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
  if (currentCodeSha.status !== 0 || currentCodeSha.stdout.trim() !== config.triple.codeSha) fail("TRIPLE_MISMATCH", "codeSha does not match the checked-out candidate");
  exactKeys(config.source, ["databaseAlias", "readOnly", "etlEnvFile", "t4EvidenceFile"], [], "source");
  if (!/^YuzhouHR_Lab_[A-Za-z0-9_]{6,40}$/.test(config.source.databaseAlias ?? "") || config.source.readOnly !== true) fail("SOURCE_NOT_READ_ONLY", "source must be an explicit read-only Yuzhou lab database");
  for (const field of ["etlEnvFile", "t4EvidenceFile"]) {
    if (typeof config.source[field] !== "string" || !isAbsolute(config.source[field]) || resolve(config.source[field]) !== config.source[field]) fail("CONFIG_INVALID", `${field} must be an absolute path`);
    if (!existsSync(config.source[field]) || lstatSync(config.source[field]).isSymbolicLink() || !statSync(config.source[field]).isFile() || mode(config.source[field]) !== "0600") fail("UNSAFE_FILE_PERMISSION", `${field} must be a non-symlink 0600 regular file`);
  }
  exactKeys(config.t4Evidence, ["status", "sha256"], [], "t4Evidence");
  if (config.t4Evidence.status !== "COMPLETED" || !SHA256.test(config.t4Evidence.sha256 ?? "")) fail("T4_EXTRACTION_NOT_STARTED", "completed hash-pinned T4 evidence is required before any lifecycle write");
  const t4Bytes = readFileSync(config.source.t4EvidenceFile);
  if (createHash("sha256").update(t4Bytes).digest("hex") !== config.t4Evidence.sha256) fail("T4_EVIDENCE_HASH_MISMATCH", "pinned T4 evidence bytes changed");
  let t4Record;
  try { t4Record = JSON.parse(t4Bytes); } catch { fail("T4_EVIDENCE_INVALID", "T4 evidence must be JSON"); }
  const t4Status = t4Record.status ?? t4Record.pendingExtractionEvidence?.status;
  if (!["COMPLETED", "completed"].includes(t4Status)) fail("T4_EXTRACTION_NOT_STARTED", "T4 evidence record is not completed");
  if (config.backend === "lab") {
    const profile = t4Record.payrollProfile;
    const expected = {
      salaryTableCount: 35,
      salaryActualRowCount: 46092,
      itemDefinitions: 711,
      formulaDefinitions: 244,
      closeRecords: 1431,
      schemeMemberships: 647,
      taxRules: 9
    };
    if (t4Record.sourceReadOnly !== true || t4Record.sourceBackupSha256 !== config.triple.sourceSnapshotHash) {
      fail("T4_EVIDENCE_INVALID", "T4 evidence must bind the read-only source snapshot in the C/S/M triple");
    }
    if (!profile || Object.entries(expected).some(([key, value]) => profile[key] !== value)) {
      fail("T4_EVIDENCE_INVALID", "T4 evidence does not prove the fixed 35/46092/711/244/1431/647/9 source profile");
    }
    const worktree = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    if (worktree.status !== 0 || worktree.stdout.trim() !== "") fail("CODE_WORKTREE_DIRTY", "lab runs require the byte-exact clean commit pinned by codeSha");
  }
  exactKeys(config.target, ["database", "composeProject", "volume", "postgresContainer", "postgresPort", "apiPort", "webPort", "role", "accountNamespace", "root", "stagingRoot", "evidenceRoot", "fileRoot", "credentialArtifact", "auditBundle"], [], "target");
  const target = config.target;
  if (!LAB_ID.test(target.database ?? "") || !LAB_ID.test(target.composeProject ?? "") || target.database !== target.composeProject || FORBIDDEN_TARGET.test(target.database)) fail("UNSAFE_TARGET_IDENTITY", "database and Compose project must be the same full-domain lab identity");
  if (target.volume !== `${target.composeProject}_postgres_data` || target.postgresContainer !== `${target.composeProject}-postgres-1`) fail("UNSAFE_TARGET_IDENTITY", "container and volume must be deterministically namespaced");
  if (target.role !== `${target.composeProject}_operator` || target.accountNamespace !== `yzfull_${config.rehearsal.toLowerCase()}_${target.composeProject.slice(-12)}`) fail("UNSAFE_TARGET_IDENTITY", "role/account namespace must be rehearsal-scoped");
  for (const identity of [target.role, `${target.accountNamespace}_hr`, `${target.accountNamespace}_manager`, `${target.accountNamespace}_employee`]) {
    if (!/^[a-z][a-z0-9_]{5,62}$/.test(identity)) fail("UNSAFE_TARGET_IDENTITY", `PostgreSQL role identity is invalid: ${identity}`);
  }
  const ports = [target.postgresPort, target.apiPort, target.webPort];
  if (ports.some((port) => !Number.isInteger(port) || port < 1024 || port > 65535) || new Set(ports).size !== ports.length) fail("UNSAFE_TARGET_IDENTITY", "PostgreSQL/API/Web ports must be distinct unprivileged ports");
  for (const field of ["root", "stagingRoot", "evidenceRoot", "fileRoot", "credentialArtifact", "auditBundle"]) assertControlledPath(target[field], target.composeProject, field);
  for (const field of ["stagingRoot", "evidenceRoot", "fileRoot"]) if (!inside(target.root, target[field])) fail("CLEANUP_PATH_ESCAPE", `${field} must be below target.root`);
  if (basename(target.credentialArtifact) !== "postgres.env") fail("CONFIG_INVALID", "credential artifact filename must be postgres.env");
  if (inside(target.root, target.auditBundle) || !target.auditBundle.endsWith(".json")) fail("CLEANUP_PATH_ESCAPE", "auditBundle must be a controlled JSON artifact outside the runtime root");
  exactKeys(config.adapterEnv, DOMAIN_ORDER, [], "adapterEnv");
  for (const domain of DOMAIN_ORDER) {
    exactKeys(config.adapterEnv[domain], ["extract", "load", "rollback"], [], `adapterEnv.${domain}`);
    for (const phase of ["extract", "load", "rollback"]) {
      const env = config.adapterEnv[domain][phase];
      if (!env || typeof env !== "object" || Array.isArray(env)) fail("CONFIG_INVALID", `adapterEnv.${domain}.${phase} must be an object`);
      for (const [key, value] of Object.entries(env)) {
        if (!/^YUZHOU_[A-Z0-9_]+$/.test(key) || FORBIDDEN_KEY.test(key) || typeof value !== "string" || FORBIDDEN_VALUE.test(value)) fail("ADAPTER_ENV_DENIED", `${domain}.${phase}.${key}`);
        const fixtureControl = config.backend === "fixture" && ["YUZHOU_FIXTURE_DELAY_MS", "YUZHOU_FIXTURE_FAIL"].includes(key);
        if (!fixtureControl && !ADAPTER_ENV_ALLOWLIST[domain][phase].includes(key)) fail("ADAPTER_ENV_DENIED", `${domain}.${phase}.${key}`);
      }
    }
  }
  if (config.verification !== undefined) {
    exactKeys(config.verification, ["manifestChainFile", "factSchema"], [], "verification");
    if (typeof config.verification.manifestChainFile !== "string" || !isAbsolute(config.verification.manifestChainFile) || !inside(target.evidenceRoot, config.verification.manifestChainFile)) fail("CONFIG_INVALID", "verification manifest chain must be below evidenceRoot");
    if (!/^hr_cutover_facts_[a-z0-9_]{4,32}$/.test(config.verification.factSchema ?? "")) fail("CONFIG_INVALID", "verification factSchema is invalid");
  }
  return config;
}

export function compareIsolation(configAInput, configBInput) {
  const a = validateConfig(structuredClone(configAInput));
  const b = validateConfig(structuredClone(configBInput));
  if (a.rehearsal !== "A" || b.rehearsal !== "B") fail("REHEARSAL_PAIR_INVALID", "pair must be A then B");
  if (JSON.stringify(a.triple) !== JSON.stringify(b.triple)) fail("TRIPLE_MISMATCH", "A/B must use the byte-exact same C/S/M triple");
  const fields = ["database", "composeProject", "volume", "postgresContainer", "postgresPort", "apiPort", "webPort", "role", "accountNamespace", "root", "stagingRoot", "evidenceRoot", "fileRoot", "credentialArtifact", "auditBundle"];
  for (const field of fields) if (a.target[field] === b.target[field]) fail("REHEARSAL_RESOURCE_REUSE", field);
  return { ok: true, triple: a.triple };
}

function mode(path) {
  return (statSync(path).mode & 0o777).toString(8).padStart(4, "0");
}

function writePrivate(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value)}\n`, { mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
}

function replacePrivate(path, value) {
  writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function appendPrivate(path, value) {
  const fd = openSync(path, "a", 0o600);
  try { writeFileSync(fd, `${JSON.stringify(value)}\n`); } finally { closeSync(fd); }
  chmodSync(path, 0o600);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function paths(config) {
  return {
    plan: join(config.target.evidenceRoot, "lifecycle-plan.json"),
    journal: join(config.target.evidenceRoot, "lifecycle-journal.jsonl"),
    registry: join(config.target.evidenceRoot, "resource-registry.json"),
    cleanup: join(config.target.evidenceRoot, "cleanup-journal.jsonl"),
    lock: join(config.target.root, ".lifecycle.lock"),
    operationLock: join(config.target.root, ".operation.lock"),
    fixtureRoot: join(config.target.root, "fixture-resources")
  };
}

function transition(config, state, details = {}) {
  const p = paths(config);
  const current = currentState(config);
  const expectedIndex = current === null ? -1 : STATES.indexOf(current);
  const nextIndex = STATES.indexOf(state);
  if (nextIndex < 0 || nextIndex !== expectedIndex + 1) fail("STATE_TRANSITION_INVALID", `${current ?? "none"} -> ${state}`);
  appendPrivate(p.journal, { kind: "state", sequence: nextIndex, state, triple: config.triple, ...details });
}

function verifySlice3AtLifecycleState(config) {
  const journal = paths(config).journal;
  if (config.backend === "fixture") {
    appendPrivate(journal, { kind: "verification", state: "verifying", mode: "fixture_contract_only", qualifiesForUatReady: false, productionImport: "HOLD" });
    fail("FIXTURE_CANNOT_ENTER_UAT_READY", "fixture contracts are not lab facts");
  }
  if (!config.verification) fail("GLOBAL_FACTS_REQUIRED", "lab verifying requires manifest chain and PostgreSQL facts");
  const chainPath = resolve(config.verification.manifestChainFile);
  if (!existsSync(chainPath) || lstatSync(chainPath).isSymbolicLink() || mode(chainPath) !== "0600") fail("UNSAFE_FILE_PERMISSION", "manifest chain evidence must be a 0600 regular file");
  const chain = readJson(chainPath);
  const chainResult = verifyManifestChain(chain, { evidenceRoot: config.target.evidenceRoot });
  const head = chain.find((record) => record.sha256 === chainResult.headSha256)?.manifest;
  if (!head || head.state !== "verifying" || head.parentRunId !== config.runId || JSON.stringify(head.triple) !== JSON.stringify(config.triple)) fail("MANIFEST_LIFECYCLE_MISMATCH", "manifest head must bind the verifying lifecycle state and C/S/M triple");
  const facts = verifyGlobalFacts({ container: config.target.postgresContainer, database: config.target.database, fixtureSchema: config.verification.factSchema, runId: config.runId });
  assertManifestFacts(head, facts);
  appendPrivate(journal, { kind: "verification", state: "verifying", manifestSha256: manifestHash(head), globalHash: facts.globalHash, ledgerRows: facts.ledger.length, ownerFailureCount: 0, sideEffectFailureCount: 0, productionImport: "HOLD" });
}

export function currentState(config) {
  const journal = paths(config).journal;
  if (!existsSync(journal)) {
    if (existsSync(config.target.auditBundle)) return readJson(config.target.auditBundle).finalState ?? null;
    return null;
  }
  const rows = readFileSync(journal, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const states = rows.filter((row) => row.kind === "state");
  for (let index = 0; index < states.length; index += 1) {
    if (states[index].sequence !== index || states[index].state !== STATES[index] || JSON.stringify(states[index].triple) !== JSON.stringify(config.triple)) fail("JOURNAL_TAMPERED", `invalid state record ${index}`);
  }
  return states.at(-1)?.state ?? null;
}

function resourcePlan(config) {
  const t = config.target;
  const resources = [
    { type: "database", planned: t.database },
    { type: "container", planned: t.postgresContainer },
    { type: "volume", planned: t.volume },
    { type: "role", planned: t.role },
    { type: "directory", planned: t.root },
    { type: "directory", planned: t.stagingRoot },
    { type: "directory", planned: t.evidenceRoot },
    { type: "directory", planned: t.fileRoot },
    { type: "directory", planned: paths(config).fixtureRoot },
    { type: "account", planned: `${t.accountNamespace}_hr` },
    { type: "account", planned: `${t.accountNamespace}_manager` },
    { type: "account", planned: `${t.accountNamespace}_employee` },
    { type: "file", planned: paths(config).journal },
    { type: "file", planned: paths(config).plan },
    { type: "file", planned: paths(config).registry },
    { type: "file", planned: paths(config).cleanup },
    { type: "file", planned: paths(config).lock },
    { type: "file", planned: paths(config).operationLock },
    { type: "port", planned: `127.0.0.1:${t.postgresPort}` },
    { type: "port", planned: `127.0.0.1:${t.apiPort}` },
    { type: "port", planned: `127.0.0.1:${t.webPort}` },
    { type: "process", planned: `${config.runId}:managed_children` },
    { type: "credential_artifact", planned: t.credentialArtifact }
  ];
  if (config.verification) resources.push({ type: "file", planned: config.verification.manifestChainFile });
  return resources.map((item) => ({ ...item, observed: null, removed: false, residualCount: 0 }));
}

function assertRegistry(registry) {
  if (!Array.isArray(registry)) fail("RESOURCE_REGISTRY_INVALID", "registry must be an array");
  const present = new Set(registry.map((entry) => entry.type));
  for (const type of RESOURCE_TYPES) if (!present.has(type)) fail("RESOURCE_TYPE_MISSING", type);
  const identities = new Set();
  for (const entry of registry) {
    const id = `${entry.type}:${entry.planned}`;
    if (identities.has(id)) fail("RESOURCE_IDENTITY_DUPLICATE", id);
    identities.add(id);
  }
}

function command(binary, args, options = {}) {
  const result = spawnSync(binary, args, { encoding: "utf8", stdio: options.capture ? "pipe" : "inherit", env: options.env ?? process.env });
  if (result.error || result.status !== 0) fail(options.code ?? "COMMAND_FAILED", `${binary} ${args[0] ?? ""} failed`);
  return (result.stdout ?? "").trim();
}

function portBusy(port) {
  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8", stdio: "pipe" });
  return result.status === 0 && result.stdout.trim().length > 0;
}

function provisionFixture(config, registry) {
  const p = paths(config);
  mkdirSync(p.fixtureRoot, { recursive: true, mode: 0o700 });
  chmodSync(p.fixtureRoot, 0o700);
  for (const entry of registry) {
    const marker = join(p.fixtureRoot, createHash("sha256").update(`${entry.type}:${entry.planned}`).digest("hex"));
    writePrivate(marker, { type: entry.type, identitySha256: createHash("sha256").update(entry.planned).digest("hex") });
    entry.observed = entry.type === "process" ? [] : entry.planned;
  }
}

function provisionLab(config, registry) {
  const t = config.target;
  if (!existsSync(t.credentialArtifact) || mode(t.credentialArtifact) !== "0600" || lstatSync(t.credentialArtifact).isSymbolicLink()) fail("UNSAFE_FILE_PERMISSION", "credential artifact must be an existing 0600 regular file");
  const credentialLines = readFileSync(t.credentialArtifact, "utf8").split("\n").filter((line) => line && !line.startsWith("#"));
  const credentialValues = Object.fromEntries(credentialLines.map((line) => {
    const separator = line.indexOf("=");
    if (separator <= 0) fail("CREDENTIAL_ARTIFACT_INVALID", "credential artifact contains a malformed line");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
  if (credentialValues.POSTGRES_DB !== t.database || credentialValues.POSTGRES_USER !== "jinhu" || !credentialValues.POSTGRES_PASSWORD) fail("CREDENTIAL_ARTIFACT_INVALID", "credential artifact must bind the isolated database and jinhu owner");
  const dockerEndpoint = spawnSync("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { encoding: "utf8", stdio: "pipe" });
  if (dockerEndpoint.status !== 0 || !dockerEndpoint.stdout.trim().startsWith("unix://")) fail("UNSAFE_DOCKER_ENDPOINT", "lab Docker must use a local Unix socket");
  for (const port of [t.postgresPort, t.apiPort, t.webPort]) if (portBusy(port)) fail("PORT_IN_USE", `127.0.0.1:${port}`);
  if (spawnSync("docker", ["inspect", t.postgresContainer], { stdio: "ignore" }).status === 0) fail("RESOURCE_ALREADY_EXISTS", "target container already exists");
  if (spawnSync("docker", ["volume", "inspect", t.volume], { stdio: "ignore" }).status === 0) fail("RESOURCE_ALREADY_EXISTS", "target volume already exists");
  command("docker", ["volume", "create", "--label", `com.docker.compose.project=${t.composeProject}`, t.volume], { capture: true });
  command("docker", ["run", "-d", "--name", t.postgresContainer, "--label", `com.docker.compose.project=${t.composeProject}`, "--label", "com.docker.compose.service=postgres", "--env-file", t.credentialArtifact, "-p", `127.0.0.1:${t.postgresPort}:5432`, "-v", `${t.volume}:/var/lib/postgresql/data`, "postgres:16-alpine"], { capture: true });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (spawnSync("docker", ["exec", t.postgresContainer, "pg_isready", "-U", "jinhu", "-d", t.database], { stdio: "ignore" }).status === 0) { ready = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) fail("POSTGRES_NOT_READY", t.postgresContainer);
  const roles = [t.role, `${t.accountNamespace}_hr`, `${t.accountNamespace}_manager`, `${t.accountNamespace}_employee`];
  const roleSql = roles.map((role) => `CREATE ROLE "${role}" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;`).join(" ");
  command("docker", ["exec", t.postgresContainer, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", t.database, "-c", roleSql], { capture: true });
  for (const entry of registry) {
    if (["database", "container", "volume", "role", "directory", "account", "file", "port", "credential_artifact"].includes(entry.type)) entry.observed = entry.planned;
    else if (entry.type === "process") entry.observed = [];
  }
}

export function provision(configInput) {
  const config = validateConfig(structuredClone(configInput));
  const p = paths(config);
  if (existsSync(config.target.root) || existsSync(p.lock) || existsSync(config.target.auditBundle)) fail("RUN_ALREADY_EXISTS", config.runId);
  mkdirSync(config.target.root, { recursive: false, mode: 0o700 });
  chmodSync(config.target.root, 0o700);
  const lockFd = openSync(p.lock, "wx", 0o600);
  writeFileSync(lockFd, `${config.runId}\n`);
  closeSync(lockFd);
  try {
    for (const dir of [config.target.stagingRoot, config.target.evidenceRoot, config.target.fileRoot]) {
      mkdirSync(dir, { recursive: false, mode: 0o700 });
      chmodSync(dir, 0o700);
    }
    writePrivate(p.plan, { formatVersion: 1, runId: config.runId, rehearsal: config.rehearsal, backend: config.backend, triple: config.triple, target: config.target, productionImport: "HOLD" });
    writePrivate(p.journal, "");
    writePrivate(p.cleanup, "");
    transition(config, "planned", { productionImport: "HOLD" });
    const registry = resourcePlan(config);
    assertRegistry(registry);
    writePrivate(p.registry, registry);
    if (config.backend === "fixture") provisionFixture(config, registry); else provisionLab(config, registry);
    replacePrivate(p.registry, registry);
    transition(config, "provisioned", { resourcesObserved: registry.length });
    return { state: "provisioned", resourcesObserved: registry.length, productionImport: "HOLD" };
  } catch (error) {
    appendPrivate(p.journal, { kind: "failure", code: error.code ?? "UNEXPECTED_FAILURE", state: currentState(config) });
    throw error;
  }
}

function runAdapter(config, domain, phase) {
  const args = [resolve(ROOT, "scripts/hr-cutover/domain-adapter.mjs"), "--config", config.__configPath, "--domain", domain, "--phase", phase];
  command(process.execPath, args, { code: "CHILD_FAILED" });
  appendPrivate(paths(config).journal, { kind: "child", domain, phase, childRunId: `${config.runId}-t${domain.slice(1)}`, status: "verified", triple: config.triple });
}

async function runAdapterAsync(config, domain, phase) {
  const args = [resolve(ROOT, "scripts/hr-cutover/domain-adapter.mjs"), "--config", config.__configPath, "--domain", domain, "--phase", phase];
  await new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    ACTIVE_CHILD = child;
    child.once("error", () => rejectChild(new LifecycleError("CHILD_FAILED", `${domain}.${phase}`)));
    child.once("close", (code, signal) => {
      ACTIVE_CHILD = null;
      if (code === 0 && !signal) resolveChild();
      else rejectChild(new LifecycleError("CHILD_FAILED", `${domain}.${phase}`));
    });
  });
  appendPrivate(paths(config).journal, { kind: "child", domain, phase, childRunId: `${config.runId}-t${domain.slice(1)}`, status: "verified", triple: config.triple });
}

function validateChildJournal(config, requiredPhase) {
  const rows = readFileSync(paths(config).journal, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const childRows = rows.filter((row) => row.kind === "child" && row.phase === requiredPhase);
  const expected = requiredPhase === "rollback" ? ROLLBACK_ORDER : DOMAIN_ORDER;
  if (JSON.stringify(childRows.map((row) => row.domain)) !== JSON.stringify(expected)) fail("PARTIAL_RUN", `${requiredPhase} must contain continuous ${expected.join("->")}`);
  for (const row of childRows) if (row.status !== "verified" || JSON.stringify(row.triple) !== JSON.stringify(config.triple)) fail("TRIPLE_MISMATCH", `${row.domain}.${requiredPhase}`);
}

export function runForward(configInput, configPath) {
  const config = validateConfig(structuredClone(configInput));
  config.__configPath = resolve(configPath);
  if (currentState(config) !== "provisioned") fail("STATE_TRANSITION_INVALID", "run requires provisioned state");
  transition(config, "extracting");
  for (const domain of DOMAIN_ORDER) runAdapter(config, domain, "extract");
  validateChildJournal(config, "extract");
  transition(config, "loading");
  for (const domain of DOMAIN_ORDER) runAdapter(config, domain, "load");
  validateChildJournal(config, "load");
  transition(config, "verifying");
  validateChildJournal(config, "load");
  verifySlice3AtLifecycleState(config);
  transition(config, "uat_ready", { technicalUat: "pending_external_runner" });
  return { state: "uat_ready", productionImport: "HOLD" };
}

async function runForwardAsync(configInput, configPath) {
  const config = validateConfig(structuredClone(configInput));
  config.__configPath = resolve(configPath);
  if (currentState(config) !== "provisioned") fail("STATE_TRANSITION_INVALID", "run requires provisioned state");
  transition(config, "extracting");
  for (const domain of DOMAIN_ORDER) await runAdapterAsync(config, domain, "extract");
  validateChildJournal(config, "extract");
  transition(config, "loading");
  for (const domain of DOMAIN_ORDER) await runAdapterAsync(config, domain, "load");
  validateChildJournal(config, "load");
  transition(config, "verifying");
  validateChildJournal(config, "load");
  verifySlice3AtLifecycleState(config);
  transition(config, "uat_ready", { technicalUat: "pending_external_runner" });
  return { state: "uat_ready", productionImport: "HOLD" };
}

export function runRollback(configInput, configPath) {
  const config = validateConfig(structuredClone(configInput));
  config.__configPath = resolve(configPath);
  if (currentState(config) !== "uat_ready") fail("STATE_TRANSITION_INVALID", "rollback requires uat_ready state");
  for (const domain of ROLLBACK_ORDER) runAdapter(config, domain, "rollback");
  validateChildJournal(config, "rollback");
  transition(config, "rollback_ready");
  return { state: "rollback_ready", productionImport: "HOLD" };
}

async function runRollbackAsync(configInput, configPath) {
  const config = validateConfig(structuredClone(configInput));
  config.__configPath = resolve(configPath);
  if (currentState(config) !== "uat_ready") fail("STATE_TRANSITION_INVALID", "rollback requires uat_ready state");
  for (const domain of ROLLBACK_ORDER) await runAdapterAsync(config, domain, "rollback");
  validateChildJournal(config, "rollback");
  transition(config, "rollback_ready");
  return { state: "rollback_ready", productionImport: "HOLD" };
}

function actualResidual(config, entry) {
  const p = paths(config);
  if (config.backend === "fixture") {
    const marker = join(p.fixtureRoot, createHash("sha256").update(`${entry.type}:${entry.planned}`).digest("hex"));
    return existsSync(marker) ? 1 : 0;
  }
  if (entry.type === "container") return spawnSync("docker", ["inspect", entry.planned], { stdio: "ignore" }).status === 0 ? 1 : 0;
  if (entry.type === "volume") return spawnSync("docker", ["volume", "inspect", entry.planned], { stdio: "ignore" }).status === 0 ? 1 : 0;
  if (entry.type === "port") return portBusy(Number(entry.planned.split(":").at(-1))) ? 1 : 0;
  if (["directory", "file", "credential_artifact"].includes(entry.type)) return existsSync(entry.planned) ? 1 : 0;
  if (["database", "role", "account"].includes(entry.type)) {
    if (spawnSync("docker", ["inspect", config.target.postgresContainer], { stdio: "ignore" }).status !== 0) return 0;
    const query = entry.type === "database" ? `SELECT count(*) FROM pg_database WHERE datname='${entry.planned}'` : `SELECT count(*) FROM pg_roles WHERE rolname='${entry.planned}'`;
    const result = spawnSync("docker", ["exec", config.target.postgresContainer, "psql", "-X", "-A", "-t", "-U", "jinhu", "-d", config.target.database, "-c", query], { encoding: "utf8", stdio: "pipe" });
    return result.status === 0 ? Number(result.stdout.trim() || "0") : 1;
  }
  if (entry.type === "process") {
    if (!Array.isArray(entry.observed)) return 1;
    return entry.observed.filter((pid) => Number.isInteger(pid) && pid > 1).filter((pid) => {
      try { process.kill(pid, 0); return true; } catch { return false; }
    }).length;
  }
  return 0;
}

function removeFixture(config, entry) {
  const marker = join(paths(config).fixtureRoot, createHash("sha256").update(`${entry.type}:${entry.planned}`).digest("hex"));
  if (existsSync(marker)) unlinkSync(marker);
}

function removeLab(config, entry) {
  if (entry.type === "container") spawnSync("docker", ["rm", "-f", entry.planned], { stdio: "ignore" });
  else if (entry.type === "volume") spawnSync("docker", ["volume", "rm", entry.planned], { stdio: "ignore" });
  else if (["role", "account"].includes(entry.type)) spawnSync("docker", ["exec", config.target.postgresContainer, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", config.target.database, "-c", `DROP ROLE IF EXISTS "${entry.planned}";`], { stdio: "ignore" });
  else if (["file", "credential_artifact"].includes(entry.type) && existsSync(entry.planned)) unlinkSync(entry.planned);
}

function assertFilesystemInventory(config, registry) {
  const p = paths(config);
  const allowed = new Set(registry.filter((entry) => ["directory", "file"].includes(entry.type)).map((entry) => resolve(entry.planned)));
  if (config.backend === "fixture" && existsSync(p.fixtureRoot)) {
    for (const entry of registry) {
      allowed.add(join(p.fixtureRoot, createHash("sha256").update(`${entry.type}:${entry.planned}`).digest("hex")));
    }
  }
  const visit = (path) => {
    const normalized = resolve(path);
    if (!allowed.has(normalized)) fail("UNREGISTERED_RESOURCE", "runtime root contains an unregistered path");
    const info = lstatSync(normalized);
    if (info.isSymbolicLink()) fail("CLEANUP_PATH_ESCAPE", "runtime root contains a symbolic link");
    if (info.isDirectory()) for (const name of readdirSync(normalized)) visit(join(normalized, name));
    else if (!info.isFile()) fail("UNREGISTERED_RESOURCE", "runtime root contains an unsupported filesystem object");
  };
  if (existsSync(config.target.root)) visit(config.target.root);
}

function removeRegisteredFilesystem(config, registry) {
  const files = registry.filter((entry) => ["file", "credential_artifact"].includes(entry.type));
  for (const entry of files) if (existsSync(entry.planned)) unlinkSync(entry.planned);
  const directories = registry.filter((entry) => entry.type === "directory").sort((a, b) => b.planned.length - a.planned.length);
  for (const entry of directories) if (existsSync(entry.planned)) rmdirSync(entry.planned);
}

export function cleanup(configInput, options = {}) {
  const config = validateConfig(structuredClone(configInput));
  const p = paths(config);
  const state = currentState(config);
  if (!options.recovery && state !== "rollback_ready") fail("STATE_TRANSITION_INVALID", "normal cleanup requires rollback_ready state");
  if (!existsSync(p.registry)) fail("RESOURCE_REGISTRY_INVALID", "resource registry is missing");
  const registry = readJson(p.registry);
  assertRegistry(registry);
  const cleanupJournal = p.cleanup;
  if (!existsSync(cleanupJournal)) writePrivate(cleanupJournal, "");
  const filesystemTypes = new Set(["directory", "file", "credential_artifact"]);
  const cleanupPriority = { account: 10, role: 20, process: 30, container: 40, volume: 50, database: 60, port: 70, file: 80, credential_artifact: 90, directory: 100 };
  for (const entry of [...registry].sort((a, b) => cleanupPriority[a.type] - cleanupPriority[b.type])) {
    appendPrivate(cleanupJournal, { type: entry.type, planned: entry.planned, observed: entry.observed, action: "remove_planned" });
    if (config.backend === "fixture") removeFixture(config, entry);
    else if (!filesystemTypes.has(entry.type)) removeLab(config, entry);
  }
  if (config.backend === "fixture" && existsSync(p.fixtureRoot) && readdirSync(p.fixtureRoot).length > 0) {
    const unexpected = readdirSync(p.fixtureRoot).length;
    appendPrivate(cleanupJournal, { type: "unregistered_fixture_resource", residualCount: unexpected });
    fail("RESOURCE_RESIDUAL_NONZERO", String(unexpected));
  }
  assertFilesystemInventory(config, registry);
  for (const entry of registry) {
    entry.residualCount = filesystemTypes.has(entry.type) ? actualResidual(config, entry) : actualResidual(config, entry);
    entry.removed = entry.residualCount === 0;
    if (!filesystemTypes.has(entry.type)) appendPrivate(cleanupJournal, { type: entry.type, planned: entry.planned, observed: entry.observed, removed: entry.removed, residualCount: entry.residualCount });
  }
  let residualCount = registry.filter((entry) => !filesystemTypes.has(entry.type)).reduce((sum, entry) => sum + entry.residualCount, 0);
  if (residualCount !== 0) fail("RESOURCE_RESIDUAL_NONZERO", String(residualCount));
  const finalState = options.recovery ? state : "cleaned";
  if (!options.recovery) transition(config, "cleaned", { residualCount: 0, rollbackOrder: ROLLBACK_ORDER });
  const journalText = readFileSync(p.journal, "utf8");
  const cleanupText = readFileSync(cleanupJournal, "utf8");
  for (const line of `${journalText}${cleanupText}`.trim().split("\n").filter(Boolean)) scanSensitive(JSON.parse(line), "auditBundle");
  removeRegisteredFilesystem(config, registry);
  for (const entry of registry) if (filesystemTypes.has(entry.type)) entry.residualCount = actualResidual(config, entry);
  residualCount = registry.reduce((sum, entry) => sum + entry.residualCount, 0);
  if (residualCount !== 0) fail("RESOURCE_RESIDUAL_NONZERO", String(residualCount));
  const filesystemCleanupRows = [];
  for (const entry of registry) {
    entry.removed = entry.residualCount === 0;
    if (filesystemTypes.has(entry.type)) filesystemCleanupRows.push({ type: entry.type, planned: entry.planned, observed: entry.observed, removed: entry.removed, residualCount: entry.residualCount });
  }
  const auditBundle = { formatVersion: 1, runId: config.runId, finalState, triple: config.triple, rollbackOrder: ROLLBACK_ORDER, resourceLedger: registry, journal: journalText.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)), cleanupJournal: [...cleanupText.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)), ...filesystemCleanupRows], journalSha256: createHash("sha256").update(journalText).digest("hex"), cleanupJournalSha256: createHash("sha256").update(`${cleanupText}${filesystemCleanupRows.map((row) => `${JSON.stringify(row)}\n`).join("")}`).digest("hex"), productionImport: "HOLD" };
  scanSensitive(auditBundle);
  writePrivate(config.target.auditBundle, auditBundle);
  return { state: finalState, residualCount, resourceLedger: registry, auditBundleSha256: createHash("sha256").update(readFileSync(config.target.auditBundle)).digest("hex"), productionImport: "HOLD" };
}

function installSignalCleanup(config) {
  let handling = false;
  const handler = (signal) => {
    if (handling) return;
    handling = true;
    try {
      const p = paths(config);
      if (ACTIVE_CHILD && !ACTIVE_CHILD.killed) ACTIVE_CHILD.kill(signal);
      if (existsSync(p.journal)) appendPrivate(p.journal, { kind: "signal", signal, state: currentState(config) });
      if (existsSync(p.registry)) cleanup(config, { recovery: true });
    } catch (error) {
      process.stderr.write(`SIGNAL_CLEANUP_FAILED: ${error.code ?? "UNEXPECTED_FAILURE"}\n`);
    }
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.once("SIGINT", () => handler("SIGINT"));
  process.once("SIGTERM", () => handler("SIGTERM"));
  process.once("SIGHUP", () => handler("SIGHUP"));
}

function parseArgs(argv) {
  const args = { command: argv[0] };
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === "--config") args.config = argv[++index];
    else if (argv[index] === "--recover") args.recovery = true;
    else fail("CLI_ARGUMENT_INVALID", argv[index]);
  }
  if (!["provision", "run", "rollback", "cleanup", "status"].includes(args.command) || !args.config) fail("CLI_ARGUMENT_INVALID", "usage: full-domain-lifecycle.mjs <provision|run|rollback|cleanup|status> --config <file> [--recover]");
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = realpathSync(resolve(args.config));
  const config = readJson(configPath);
  validateConfig(config);
  const p = paths(config);
  let ownsRecovery = args.command === "provision";
  if (["run", "rollback"].includes(args.command)) {
    if (!existsSync(config.target.root)) fail("STATE_TRANSITION_INVALID", `${args.command} requires a provisioned run`);
    let fd;
    try { fd = openSync(p.operationLock, "wx", 0o600); } catch { fail("RUN_CONCURRENT", `${config.runId} already has an active operation`); }
    writeFileSync(fd, `${process.pid}\n`);
    closeSync(fd);
    ownsRecovery = true;
  }
  if (ownsRecovery) installSignalCleanup(config);
  let result;
  try {
    if (args.command === "provision") result = provision(config);
    else if (args.command === "run") result = await runForwardAsync(config, configPath);
    else if (args.command === "rollback") result = await runRollbackAsync(config, configPath);
    else if (args.command === "cleanup") result = cleanup(config, { recovery: args.recovery });
    else result = { state: currentState(validateConfig(config)), productionImport: "HOLD" };
  } catch (error) {
    if (ownsRecovery && existsSync(p.registry)) {
      if (existsSync(p.journal)) appendPrivate(p.journal, { kind: "failure", code: error.code ?? "UNEXPECTED_FAILURE", state: currentState(config) });
      try { cleanup(config, { recovery: true }); } catch (cleanupError) {
        process.stderr.write(`FAILURE_CLEANUP_FAILED: ${cleanupError.code ?? "UNEXPECTED_FAILURE"}\n`);
      }
    }
    throw error;
  }
  if (["run", "rollback"].includes(args.command) && existsSync(p.operationLock)) unlinkSync(p.operationLock);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) {
    const code = error instanceof LifecycleError ? error.code : "UNEXPECTED_FAILURE";
    process.stderr.write(`${code}: ${error.message.replace(/^.*?: /, "")}\n`);
    process.exitCode = 1;
  }
}

export { DOMAIN_ORDER, RESOURCE_TYPES, ROLLBACK_ORDER, STATES };
