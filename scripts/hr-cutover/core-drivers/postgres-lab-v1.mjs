/* global Buffer, process, URL */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, rmSync, statSync, writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CORE_DOMAIN_ORDER, CORE_RESIDUAL_CLASSES, CoreT0T3Error, CoreT0T3FileJournal,
  coreProfile, sealCoreT0T3Facts, validateCoreT0T3Config
} from "../core-t0-t3-rehearsal.mjs";
import { buildCoreT0T3MaterializationSql, verifyCurrentT0Binding } from "../materialize-reviewed-job-state.mjs";
import { buildCoreNonT0DictionaryPackage, materializeCoreNonT0Dictionaries } from "../materialize-core-non-t0-dictionaries.mjs";
import { createDefaultSourceRestoreProbe, validateSourceRestoreReceipt, verifySourceRestoreReceiptFile } from "../source-restore-receipt.mjs";
import { verifyCoreDictionaryCaptureBinding } from "../verify-yuzhou-core-dictionary-preflight.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const FULL_CONTRACT = JSON.parse(readFileSync(resolve(ROOT, "scripts/hr-cutover/contracts/full-domain-contract-v1.json"), "utf8"));
const DRIVER_CONTRACT_PATHS = Object.freeze([
  "scripts/hr-cutover/contracts/core-t0-t2-rehearsal-v1.json",
  "scripts/hr-cutover/contracts/core-t0-t3-rehearsal-v1.json",
  "scripts/hr-cutover/core-t0-t3-rehearsal.mjs",
  "scripts/hr-cutover/verify-core-t0-t2-rehearsal-contract.mjs",
  "scripts/hr-cutover/prepare-core-t0-t3-rehearsal.mjs",
  "scripts/hr-cutover/core-drivers/postgres-lab-v1.mjs",
  "scripts/hr-cutover/source-restore-receipt.mjs",
  "scripts/hr-cutover/contracts/source-restore-receipt.schema.json",
  "scripts/hr-cutover/materialize-reviewed-job-state.mjs",
  "scripts/hr-cutover/materialize-core-non-t0-dictionaries.mjs",
  "scripts/hr-cutover/build-core-t0-machine-package.mjs",
  "scripts/extract-yuzhou-t0.sh", "scripts/transform-yuzhou-t0.mjs", "scripts/load-yuzhou-t0.sh", "scripts/rollback-yuzhou-t0.sh",
  "scripts/extract-yuzhou-t1-employment-events.sh", "scripts/transform-yuzhou-t1-employment-events.mjs", "scripts/load-yuzhou-t1-employment-events.sh", "scripts/rollback-yuzhou-t1-employment-events.sh",
  "scripts/extract-yuzhou-t2-contracts.sh", "scripts/transform-yuzhou-t2-contracts.mjs", "scripts/load-yuzhou-t2-contracts.sh", "scripts/rollback-yuzhou-t2-contracts.sh",
  "scripts/extract-yuzhou-t3-attendance-insurance.sh", "scripts/transform-yuzhou-t3-attendance-insurance.mjs", "scripts/load-yuzhou-t3-attendance-insurance.sh", "scripts/rollback-yuzhou-t3-attendance-insurance.sh"
]);
const DEFAULT_TENANT = "10000001", DEFAULT_PARK = "20000001";
const SHA256 = /^[0-9a-f]{64}$/u;
const PHASE_SCRIPT = Object.freeze(Object.fromEntries(CORE_DOMAIN_ORDER.map(domain => [domain, {
  extract: FULL_CONTRACT.domains[domain].extract,
  load: FULL_CONTRACT.domains[domain].load,
  rollback: FULL_CONTRACT.domains[domain].rollback
}])));
const MANIFEST_FILES = Object.freeze({
  T0: { departments: ["departments.jsonl", "YUZHOU_DEPARTMENTS_SHA256"], positions: ["positions.jsonl", "YUZHOU_POSITIONS_SHA256"], employees: ["employees.jsonl", "YUZHOU_EMPLOYEES_SHA256"] },
  T1: { employmentEvents: ["employment-events.jsonl", "YUZHOU_T1_EVENTS_SHA256"], employmentEventTypes: ["employment-event-types.json", "YUZHOU_T1_TYPES_SHA256"] },
  T2: { "dbo.compacttypecode": ["contract-types.jsonl", "YUZHOU_T2_TYPES_SHA256"], "dbo.compact": ["contracts.jsonl", "YUZHOU_T2_CONTRACTS_SHA256"], "dbo.compact_c": ["contract-changes.jsonl", "YUZHOU_T2_CHANGES_SHA256"] },
  T3: { attendance: ["attendance.jsonl", "YUZHOU_T3_ATTENDANCE_SHA256"], policies: ["policies.jsonl", "YUZHOU_T3_POLICIES_SHA256"], insurance: ["insurance.jsonl", "YUZHOU_T3_INSURANCE_SHA256"] }
});

const fail = (code, detail) => { throw new CoreT0T3Error(code, detail); };
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const sha256File = path => {
  const hash = createHash("sha256"), descriptor = openSync(path, "r"), buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (let count = readSync(descriptor, buffer, 0, buffer.length, null); count > 0; count = readSync(descriptor, buffer, 0, buffer.length, null)) hash.update(buffer.subarray(0, count));
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
};
const mode = path => (statSync(path).mode & 0o777).toString(8).padStart(4, "0");
const paths = config => {
  const projectRoot = dirname(config.target.runtimeRoot), auditRoot = join(projectRoot, "audit");
  return {
    projectRoot, auditRoot, journal: join(auditRoot, "core-lifecycle.jsonl"), registry: join(auditRoot, "resource-registry.json"),
    preCleanup: join(auditRoot, "pre-cleanup-residuals.json"), facts: join(auditRoot, "core-facts.json"), protectedSnapshot: join(auditRoot, "protected-state-before-load.json"),
    compose: join(config.target.runtimeRoot, "compose.yml"), postgresEnv: join(config.target.credentialRoot, "postgres.env"),
    decision: join(config.target.credentialRoot, "employee-job-state.reviewed.json"),
    payload: join(config.target.credentialRoot, "employee-job-state.private.json"),
    attestation: join(config.target.credentialRoot, "employee-job-state.machine-attestation.json"),
    nonT0DictionaryPackage: join(auditRoot, "non-t0-dictionaries.machine-package.json")
  };
};

function privateWrite(path, value, { replace = false } = {}) {
  writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, { flag: replace ? "w" : "wx", mode: 0o600 });
  chmodSync(path, 0o600);
}

function privateInstall(path, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  if (existsSync(path)) {
    assertPrivateFile(path, basenameForError(path));
    if (!readFileSync(path).equals(bytes)) fail("CORE_MACHINE_ARTIFACT_REPLAY_DRIFT", basenameForError(path));
    return;
  }
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 }); chmodSync(path, 0o600);
}

const basenameForError = path => String(path).split("/").at(-1);

function assertPrivateFile(path, label) {
  let link, actual, info;
  try { link = lstatSync(path); actual = realpathSync(path); info = statSync(actual); } catch { fail("CORE_DRIVER_PRIVATE_FILE_INVALID", `${label}:missing`); }
  if (link.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || mode(actual) !== "0600") fail("CORE_DRIVER_PRIVATE_FILE_INVALID", label);
  return actual;
}

export function classifyCorePhaseFailure(output, requestedCode = "CORE_PHASE_FAILED") {
  if (requestedCode !== "CORE_PHASE_FAILED") return requestedCode ?? "CORE_DRIVER_COMMAND_FAILED";
  const t0Input = String(output).match(/\b(T0_(?:DEPARTMENT|POSITION)_(?:SMALLINT|INTEGER)_INPUT_INVALID|T0_EMPLOYEE_DATE_INPUT_INVALID)\b/u);
  if (t0Input) return `CORE_PHASE_${t0Input[1]}`;
  // PostgreSQL includes the rejected value in this message.  Keep receipts and
  // reports value-free, but retain a small allowlist of type classes so a
  // controlled retry can repair the right coercion without widening access to
  // staging or source rows.
  const invalidType = String(output).match(/invalid input syntax for type\s+(integer|smallint|date|boolean|uuid)\b/iu)?.[1]?.toUpperCase();
  if (invalidType) return `CORE_PHASE_POSTGRES_INVALID_${invalidType}`;
  if (/invalid input syntax/iu.test(output)) return "CORE_PHASE_POSTGRES_INVALID_INPUT";
  if (/duplicate key|unique constraint/iu.test(output)) return "CORE_PHASE_POSTGRES_UNIQUE_CONSTRAINT";
  if (/foreign key constraint/iu.test(output)) return "CORE_PHASE_POSTGRES_FOREIGN_KEY";
  if (/not-null constraint|null value/iu.test(output)) return "CORE_PHASE_POSTGRES_NOT_NULL";
  if (/permission denied|unsafe target|wrong postgres project/iu.test(output)) return "CORE_PHASE_TARGET_BOUNDARY";
  if (/T3 verification failed|count drift|staging manifest binding mismatch/iu.test(output)) return "CORE_PHASE_T3_VERIFICATION";
  return "CORE_PHASE_EXECUTION_FAILED";
}

function defaultRun(command, args, options = {}) {
  const retryableMigrationConnection = output => /connection to server|could not connect|server closed the connection|database system is starting up/iu.test(output);
  const phaseFailureCode = output => classifyCorePhaseFailure(output, options.code);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = spawnSync(command, args, {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: options.input === undefined ? "pipe" : ["pipe", "pipe", "pipe"],
      ...options
    });
    if (!result.error && result.status === 0) return String(result.stdout ?? "").trim();
    const transient = options.code === "CORE_MIGRATION_FAILED" && retryableMigrationConnection(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
    if (!transient || attempt === 11) fail(phaseFailureCode(`${result.stdout ?? ""}\n${result.stderr ?? ""}`), `${command}:${args[0] ?? ""}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  }
  fail(options.code ?? "CORE_DRIVER_COMMAND_FAILED", `${command}:${args[0] ?? ""}`);
}

export function computeCoreT0T3MappingContractHash() {
  const hash = createHash("sha256");
  for (const relative of [...DRIVER_CONTRACT_PATHS].sort()) hash.update(relative).update("\0").update(readFileSync(resolve(ROOT, relative))).update("\0");
  return hash.digest("hex");
}

function assertRuntimeBoundary(config, run) {
  const label = run("docker", ["inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}', config.target.container], { code: "CORE_TARGET_CONTAINER_INVALID" });
  if (label !== config.target.composeProject) fail("CORE_TARGET_CONTAINER_INVALID", "Compose label drift");
}

function assertSourceRestoreBinding(config, probe) {
  const actual = sha256File(config.source.sourceBackupPath);
  if (actual !== config.source.sourceBackupSha256 || actual !== config.triple.sourceSnapshotHash) fail("CORE_SOURCE_BACKUP_DRIFT", "fixed source backup hash mismatch");
  verifySourceRestoreReceiptFile({
    receiptPath: config.source.sourceRestoreReceiptPath, receiptSha256: config.source.sourceRestoreReceiptSha256,
    sourceSnapshotSha256: config.triple.sourceSnapshotHash, sourceBackupPath: config.source.sourceBackupPath,
    sourceContainer: config.source.sourceContainer, databaseAlias: config.source.databaseAlias
  }, { probe, recheckLive: true });
  return { status: "verified", productionImport: "HOLD" };
}

function assertCoreDictionaryPreflight(config) {
  if (!config.source.dictionaryPackages || !config.source.dictionaryCaptureReceipt) fail("CORE_DICTIONARY_PREFLIGHT_REQUIRED", "four approved dictionary packages and their capture receipt are required before resource creation");
  let result;
  try { result = verifyCoreDictionaryCaptureBinding(config.source.dictionaryPackages, config.source.dictionaryCaptureReceipt); }
  catch { fail("CORE_DICTIONARY_PREFLIGHT_DRIFT", "dictionary packages do not bind the capture receipt"); }
  if (result.sourceSnapshotSha256 !== config.triple.sourceSnapshotHash || result.productionImport !== "HOLD") fail("CORE_DICTIONARY_PREFLIGHT_DRIFT", "dictionary packages differ from the fixed source snapshot");
  return result;
}

function stagingDirectory(config, domain) {
  return join(config.target.stagingRoot, `staging-${config.runId}-t${coreProfile(config.profile).domainOrder.indexOf(domain)}`);
}

function verifiedManifestBindings(config, domain) {
  const directory = stagingDirectory(config, domain), manifestPath = join(directory, "manifest.json");
  assertPrivateFile(manifestPath, `${domain}.manifest`);
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { fail("CORE_EXTRACT_MANIFEST_INVALID", domain); }
  const expected = MANIFEST_FILES[domain], env = {};
  if (!expected || !manifest?.domains || typeof manifest.domains !== "object") fail("CORE_EXTRACT_MANIFEST_INVALID", domain);
  for (const [key, [file, envKey]] of Object.entries(expected)) {
    const entry = manifest.domains[key], candidate = join(directory, file);
    assertPrivateFile(candidate, `${domain}.${key}`);
    const actual = sha256(readFileSync(candidate));
    if (entry?.file !== file || entry.fileSha256 !== actual) fail("CORE_EXTRACT_MANIFEST_DRIFT", `${domain}.${key}`);
    env[envKey] = actual;
  }
  if (domain === "T3") {
    let receipt;
    try { receipt = validateSourceRestoreReceipt(JSON.parse(readFileSync(config.source.sourceRestoreReceiptPath, "utf8"))); }
    catch { fail("CORE_SOURCE_RECEIPT_INVALID", "T3 source restore receipt"); }
    const t3Bindings = {
      sourceSnapshotSha256: config.triple.sourceSnapshotHash,
      sourceRestoreReceiptSha256: config.source.sourceRestoreReceiptSha256,
      sourceCatalogSha256: receipt.identities.catalogSha256,
      mappingContractSha256: config.triple.mappingContractHash
    };
    if (!SHA256.test(manifest.sourceBusinessSha256 ?? "") || Object.entries(t3Bindings).some(([key, value]) => manifest[key] !== value)) fail("CORE_EXTRACT_MANIFEST_DRIFT", "T3.current-source-binding");
    Object.assign(env, {
      YUZHOU_SOURCE_RESTORE_RECEIPT_SHA256: t3Bindings.sourceRestoreReceiptSha256,
      YUZHOU_SOURCE_CATALOG_SHA256: t3Bindings.sourceCatalogSha256,
      YUZHOU_SOURCE_BUSINESS_SHA256: manifest.sourceBusinessSha256,
      YUZHOU_MAPPING_CONTRACT_SHA256: t3Bindings.mappingContractSha256
    });
  }
  return env;
}

function phaseEnvironment(config, domain, phase, state) {
  const childRunId = `${config.runId}-t${coreProfile(config.profile).domainOrder.indexOf(domain)}`;
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "DOCKER_HOST", "COLIMA_HOME"].flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]]]));
  Object.assign(env, {
    ALLOW_YUZHOU_MIGRATION: "yes", YUZHOU_MIGRATION_RUN_ID: childRunId,
    YUZHOU_SQLSERVER_DATABASE: config.source.databaseAlias, YUZHOU_SQLSERVER_CONTAINER: config.source.sourceContainer,
    YUZHOU_ETL_CREDENTIAL_FILE: config.source.etlEnvFile, YUZHOU_SOURCE_BACKUP_FILE: config.source.sourceBackupPath,
    YUZHOU_STAGING_ROOT: config.target.stagingRoot,
    YUZHOU_STAGING_DIR: stagingDirectory(config, domain), YUZHOU_TARGET_DATABASE: config.target.database,
    YUZHOU_POSTGRES_CONTAINER: config.target.container, YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT: config.target.composeProject,
    YUZHOU_TARGET_TENANT_ID: DEFAULT_TENANT, YUZHOU_TARGET_PARK_ID: DEFAULT_PARK,
    YUZHOU_BACKUP_SHA256: config.triple.sourceSnapshotHash,
    YUZHOU_SOURCE_RESTORE_RECEIPT_PATH: config.source.sourceRestoreReceiptPath,
    YUZHOU_MAPPING_CONTRACT_SHA256: config.triple.mappingContractHash
  });
  if (phase === "rollback") env.ALLOW_YUZHOU_ROLLBACK = "yes";
  if (phase === "load") Object.assign(env, verifiedManifestBindings(config, domain));
  if (domain === "T0" && phase === "load") {
    if (!/^[0-9a-f]{64}$/u.test(state.t0DictionarySha256 ?? "")) fail("CORE_T0_MACHINE_MATERIALIZATION_REQUIRED", "T0 dictionary binding");
    env.YUZHOU_T0_JOB_STATE_DICTIONARY_SHA256 = state.t0DictionarySha256;
  }
  if (domain === "T1" && phase === "load") {
    const dictionaries = state.nonT0DictionarySha256;
    if (!dictionaries) fail("CORE_NON_T0_DICTIONARY_MATERIALIZATION_REQUIRED", "T1 dictionary bindings");
    env.YUZHOU_T1_EVENT_TYPE_DICTIONARY_SHA256 = dictionaries.employment_event_type;
    env.YUZHOU_T1_EVENT_STATE_DICTIONARY_SHA256 = dictionaries.employment_event_state;
  }
  if (domain === "T2" && phase === "load") {
    const dictionaries = state.nonT0DictionarySha256;
    if (!dictionaries) fail("CORE_NON_T0_DICTIONARY_MATERIALIZATION_REQUIRED", "T2 dictionary bindings");
    env.YUZHOU_T2_CONTRACT_TYPE_DICTIONARY_SHA256 = dictionaries.contract_type;
    env.YUZHOU_T2_CONTRACT_STATE_DICTIONARY_SHA256 = dictionaries.contract_state;
  }
  return env;
}

function queryJson(config, run, sql, code = "CORE_POSTGRES_QUERY_FAILED") {
  assertRuntimeBoundary(config, run);
  const output = run("docker", ["exec", "-i", config.target.container, "psql", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", config.target.database], { input: sql, code });
  try { return JSON.parse(output.split("\n").filter(Boolean).at(-1)); } catch { fail(code, "invalid JSON result"); }
}

function protectedStateSnapshot(config, run) {
  return queryJson(config, run, `SELECT json_build_object(
    'sysUser', (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,E'\\n' ORDER BY x.id::text),''),'sha256'),'hex') FROM sys_user x),
    'sysRole', (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,E'\\n' ORDER BY x.id::text),''),'sha256'),'hex') FROM sys_role x),
    'preexistingEmployee', (SELECT encode(digest(COALESCE(string_agg(jsonb_build_object('id',x.id,'status',x.employment_status,'org',x.primary_org_id,'position',x.position_id,'departure',x.departure_date)::text,E'\\n' ORDER BY x.id::text),''),'sha256'),'hex') FROM hr_employee x WHERE COALESCE(x.remark,'') NOT LIKE 'Migrated from Yuzhou V10;%' )
  )::text;`, "CORE_PROTECTED_STATE_SNAPSHOT_FAILED");
}

function provision(config, run, p, sourceReceiptProbe) {
  assertCoreDictionaryPreflight(config);
  assertSourceRestoreBinding(config, sourceReceiptProbe);
  const resumingProvision = existsSync(config.target.runtimeRoot);
  if (resumingProvision && existsSync(p.registry)) fail("CORE_RUN_ALREADY_EXISTS", config.runId);
  assertPrivateFile(p.postgresEnv, "postgres.env");
  if (resumingProvision) {
    assertPrivateFile(p.compose, "compose.yml");
    assertRuntimeBoundary(config, run);
  } else {
    mkdirSync(config.target.runtimeRoot, { mode: 0o700 });
    for (const directory of [config.target.stagingRoot, config.target.evidenceRoot, join(config.target.runtimeRoot, "files")]) mkdirSync(directory, { mode: 0o700 });
    const compose = `services:\n  postgres:\n    image: postgres:16-alpine\n    container_name: ${config.target.container}\n    env_file:\n      - ${p.postgresEnv}\n    ports:\n      - "127.0.0.1:${config.target.ports.postgres}:5432"\n    volumes:\n      - postgres_data:/var/lib/postgresql/data\n    networks:\n      - migration\nvolumes:\n  postgres_data:\n    external: true\n    name: ${config.target.volume}\nnetworks:\n  migration:\n    name: ${config.target.network}\n`;
    privateWrite(p.compose, compose);
    run("docker", ["volume", "create", "--label", `com.docker.compose.project=${config.target.composeProject}`, config.target.volume], { code: "CORE_PROVISION_FAILED" });
    run("docker", ["compose", "-p", config.target.composeProject, "-f", p.compose, "up", "-d", "postgres"], { code: "CORE_PROVISION_FAILED" });
  }
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync("docker", ["exec", config.target.container, "pg_isready", "-U", "jinhu", "-d", config.target.database], { stdio: "ignore" });
    if (probe.status === 0) { ready = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) fail("CORE_POSTGRES_NOT_READY", config.target.container);
  const releaseEnv = { ...process.env, COMPOSE_FILE: p.compose, COMPOSE_PROJECT_NAME: config.target.composeProject, POSTGRES_USER: "jinhu", POSTGRES_DB: config.target.database, MIGRATION_BASELINE_ON_NONEMPTY_DB: "no" };
  run("sh", [resolve(ROOT, "scripts/db-migrate.sh")], { env: releaseEnv, code: "CORE_MIGRATION_FAILED" });
  run("sh", [resolve(ROOT, "scripts/db-seed-prod.sh")], { env: { ...releaseEnv, ALLOW_PRODUCTION_SEED: "yes" }, code: "CORE_PRODUCTION_SEED_FAILED" });
  const baseline = queryJson(config, run, "SELECT json_build_object('tenant',EXISTS(SELECT 1 FROM sys_tenant WHERE tenant_id='10000001' AND is_deleted=false),'park',EXISTS(SELECT 1 FROM biz_park WHERE tenant_id='10000001' AND park_id='20000001' AND is_deleted=false),'org',EXISTS(SELECT 1 FROM sys_org WHERE tenant_id='10000001' AND park_id='20000001' AND is_deleted=false))::text;");
  if (!baseline.tenant || !baseline.park || !baseline.org) fail("CORE_INITIALIZATION_BASELINE_INVALID", "production seed baseline");
  const roles = [config.target.role, `${config.target.accountNamespace}_hr`, `${config.target.accountNamespace}_manager`, `${config.target.accountNamespace}_employee`];
  const roleSql = roles.map(role => `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE "${role}" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; END IF; END $$;`).join(" ");
  run("docker", ["exec", config.target.container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", config.target.database, "-c", roleSql], { code: "CORE_ROLE_PROVISION_FAILED" });
  privateWrite(p.protectedSnapshot, protectedStateSnapshot(config, run));
  privateWrite(p.registry, { formatVersion: 1, runId: config.runId, database: config.target.database, container: config.target.container, network: config.target.network, volume: config.target.volume, role: config.target.role, accounts: roles.slice(1), ports: Object.values(config.target.ports), productionImport: "HOLD" });
  return { status: "verified", productionImport: "HOLD" };
}

function materializeT0(config, machinePackage, run, p, state) {
  privateInstall(p.decision, machinePackage.decision);
  privateInstall(p.payload, machinePackage.privatePayload);
  privateInstall(p.attestation, machinePackage.machineAttestation);
  const bridge = { ...config, target: { ...config.target, postgresContainer: config.target.container, jobStateDecisionArtifact: p.decision } };
  verifyCurrentT0Binding(bridge, machinePackage.privatePayload);
  assertRuntimeBoundary(config, run);
  run("docker", ["exec", "-i", config.target.container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", config.target.database], {
    input: buildCoreT0T3MaterializationSql(machinePackage.decision, machinePackage.privatePayload, machinePackage.machineAttestation), code: "CORE_T0_MACHINE_MATERIALIZATION_FAILED"
  });
  state.t0DictionarySha256 = machinePackage.privatePayload.dictionaryEvidenceSha256;
  const nonT0Package = buildCoreNonT0DictionaryPackage(config, {
    t1Types: join(stagingDirectory(config, "T1"), "employment-event-types.json"),
    t1States: join(stagingDirectory(config, "T1"), "employment-event-states.json"),
    t2Types: join(stagingDirectory(config, "T2"), "contract-types.jsonl"),
    t2States: join(stagingDirectory(config, "T2"), "contract-states.raw.json")
  });
  privateInstall(p.nonT0DictionaryPackage, nonT0Package);
  state.nonT0DictionarySha256 = materializeCoreNonT0Dictionaries(config, nonT0Package);
  return { status: "verified", productionImport: "HOLD" };
}

function resolveT0DictionarySha(config, run) {
  const result = queryJson(config, run, `SELECT json_build_object('count',count(*),'sha',min(source_snapshot_sha256))::text FROM hr_legacy_dictionary_version WHERE tenant_id='${DEFAULT_TENANT}' AND park_id='${DEFAULT_PARK}' AND source_system='yuzhou-v10' AND dictionary_code='employee_job_state' AND status='approved' AND is_deleted=false AND verification_mode='machine_attested' AND machine_evidence_root_sha256='${config.machineAttestation.trustedRootSha256}';`, "CORE_T0_MACHINE_MATERIALIZATION_REQUIRED");
  if (Number(result.count) !== 1 || !/^[0-9a-f]{64}$/u.test(result.sha ?? "")) fail("CORE_T0_MACHINE_MATERIALIZATION_REQUIRED", "approved dictionary replay binding");
  return result.sha;
}

function resolveNonT0DictionaryShas(config, run) {
  const required = ["employment_event_type", "employment_event_state", "contract_type", "contract_state"];
  const result = queryJson(config, run, `SELECT json_build_object('count',count(*),'snapshots',COALESCE(json_object_agg(dictionary_code,source_snapshot_sha256),'{}'::json))::text FROM hr_legacy_dictionary_version WHERE tenant_id='${DEFAULT_TENANT}' AND park_id='${DEFAULT_PARK}' AND source_system='yuzhou-v10' AND dictionary_code IN ('employment_event_type','employment_event_state','contract_type','contract_state') AND status='approved' AND is_deleted=false AND verification_mode='machine_attested' AND machine_evidence_root_sha256='${config.machineAttestation.trustedRootSha256}';`, "CORE_NON_T0_DICTIONARY_MATERIALIZATION_REQUIRED");
  if (Number(result.count) !== required.length || !result.snapshots || required.some(code => !/^[0-9a-f]{64}$/u.test(result.snapshots[code] ?? ""))) fail("CORE_NON_T0_DICTIONARY_MATERIALIZATION_REQUIRED", "approved dictionary replay binding");
  return result.snapshots;
}

function coreDomainFacts(config, run, domain, tables) {
  const childRun = `${config.runId}-t${coreProfile(config.profile).domainOrder.indexOf(domain)}`;
  // Target UUID relationships and audit fields are independently generated in
  // A/B.  Source-row hashes retain the legacy relation semantics; the target
  // projection verifies all stable business scalars without run-local IDs.
  const stableProjection = "COALESCE((SELECT jsonb_object_agg(key,value ORDER BY key) FROM jsonb_each(to_jsonb(x)) WHERE key NOT IN ('id','create_time','update_time','create_by','update_by','remark') AND key !~ '(^id$|_id$)'),'{}'::jsonb)::text";
  const rows = tables.map(({ table, key }) => `SELECT '${table}' AS target_table,${stableProjection} AS row_json,m.source_identity_sha256,m.source_row_sha256 FROM ${table} x JOIN legacy_record_map m ON m.target_table='${table}' AND m.target_id=x.${key} JOIN migration_batch b ON b.id=m.batch_id WHERE b.run_id='${childRun}'`).join(" UNION ALL ");
  return queryJson(config, run, `WITH item AS (SELECT COALESCE(sum(extracted_count),0)::int AS source,COALESCE(sum(loaded_count),0)::int AS loaded,COALESCE(sum(rejected_count),0)::int AS quarantined FROM migration_batch_item i JOIN migration_batch b ON b.id=i.batch_id WHERE b.run_id='${childRun}'), canonical_rows AS (${rows}), reason AS (SELECT encode(digest(COALESCE(string_agg(error_code||':'||source_identity_sha256,E'\\n' ORDER BY error_code,source_identity_sha256),''),'sha256'),'hex') AS h FROM migration_error e JOIN migration_batch b ON b.id=e.batch_id WHERE b.run_id='${childRun}') SELECT json_build_object('source',(SELECT source FROM item),'loaded',(SELECT loaded FROM item),'quarantined',(SELECT quarantined FROM item),'approvedIgnored',(SELECT source-loaded-quarantined FROM item),'canonicalSha256',(SELECT encode(digest(COALESCE(string_agg(target_table||':'||source_identity_sha256||':'||source_row_sha256||':'||row_json,E'\\n' ORDER BY target_table,source_identity_sha256,source_row_sha256,row_json),''),'sha256'),'hex') FROM canonical_rows),'quarantineReasonSha256',(SELECT h FROM reason))::text;`, "CORE_BUSINESS_FACTS_QUERY_FAILED");
}

function materializeFacts(config, run, p) {
  assertPrivateFile(p.protectedSnapshot, "protected-state-before-load.json");
  const expectedProtected = JSON.parse(readFileSync(p.protectedSnapshot, "utf8"));
  const actualProtected = protectedStateSnapshot(config, run);
  if (JSON.stringify(expectedProtected) !== JSON.stringify(actualProtected)) fail("CORE_PROTECTED_STATE_DRIFT", config.rehearsal);
  const tableSets = {
    T0: [{ table: "sys_org", key: "id" }, { table: "hr_position", key: "id" }, { table: "hr_employee", key: "id" }],
    T1: [{ table: "hr_employment_event", key: "id" }],
    T2: [{ table: "hr_contract_type", key: "id" }, { table: "hr_contract", key: "id" }, { table: "hr_contract_change", key: "id" }],
    T3: [{ table: "hr_attendance_calendar_source", key: "id" }, { table: "hr_insurance_policy", key: "id" }, { table: "hr_employee_insurance_period", key: "id" }]
  };
  const domains = coreProfile(config.profile).domainOrder.map(domain => ({ domain, ...coreDomainFacts(config, run, domain, tableSets[domain]) }));
  const facts = sealCoreT0T3Facts({ formatVersion: 1, profile: config.profile, runId: config.runId, rehearsal: config.rehearsal, triple: config.triple, domains, sideEffectViolationCount: 0, productionImport: "HOLD" });
  privateWrite(p.facts, facts);
  return facts;
}

function removeDockerResource(run, kind, identity, args) {
  if (spawnSync("docker", [kind, "inspect", identity], { stdio: "ignore" }).status !== 0) return;
  run("docker", [kind, "rm", ...args, identity], { code: "CORE_CLEANUP_FAILED" });
}

function removeExactDirectory(config, target, expectedName) {
  const expected = join(dirname(config.target.runtimeRoot), expectedName);
  if (target !== expected) fail("CORE_CLEANUP_ESCAPE", expectedName);
  if (!existsSync(target)) return;
  const info = lstatSync(target);
  if (info.isSymbolicLink() || !info.isDirectory()) fail("CORE_CLEANUP_ESCAPE", expectedName);
  rmSync(target, { recursive: true });
}

function cleanupResources(config, run, p, { recovery = false } = {}) {
  let activeRows = 0;
  if (spawnSync("docker", ["inspect", config.target.container], { stdio: "ignore" }).status === 0) {
    const schema = queryJson(config, run, "SELECT json_build_object('controlReady',to_regclass('public.migration_batch') IS NOT NULL AND to_regclass('public.legacy_record_map') IS NOT NULL)::text;", "CORE_PRECLEANUP_PROBE_FAILED");
    let result;
    if (!schema.controlReady) {
      if (!recovery) fail("CORE_PRECLEANUP_PROBE_FAILED", "migration control schema is missing");
      result = { activeBusinessRows: 0, activeControlRows: 0, recoveryBeforeSchemaReady: true };
    } else {
      const domainOrder = coreProfile(config.profile).domainOrder;
      const childRuns = domainOrder.map((domain, index) => `'${config.runId}-t${index}'`).join(",");
      const residualChecks = [
        "SELECT count(*) n FROM sys_org x JOIN maps m ON m.target_table='sys_org' AND m.target_id=x.id",
        "SELECT count(*) FROM hr_position x JOIN maps m ON m.target_table='hr_position' AND m.target_id=x.id",
        "SELECT count(*) FROM hr_employee x JOIN maps m ON m.target_table='hr_employee' AND m.target_id=x.id",
        "SELECT count(*) FROM hr_employment_event x JOIN maps m ON m.target_table='hr_employment_event' AND m.target_id=x.id",
        "SELECT count(*) FROM hr_contract_type x JOIN maps m ON m.target_table='hr_contract_type' AND m.target_id=x.id",
        "SELECT count(*) FROM hr_contract x JOIN maps m ON m.target_table='hr_contract' AND m.target_id=x.id",
        "SELECT count(*) FROM hr_contract_change x JOIN maps m ON m.target_table='hr_contract_change' AND m.target_id=x.id",
        ...(domainOrder.includes("T3") ? ["SELECT count(*) FROM hr_attendance_calendar_source x JOIN maps m ON m.target_table='hr_attendance_calendar_source' AND m.target_id=x.id", "SELECT count(*) FROM hr_insurance_policy x JOIN maps m ON m.target_table='hr_insurance_policy' AND m.target_id=x.id", "SELECT count(*) FROM hr_employee_insurance_period x JOIN maps m ON m.target_table='hr_employee_insurance_period' AND m.target_id=x.id", `SELECT count(*) FROM hr_attendance_import_batch WHERE batch_code='${config.runId}-t3'`, "SELECT count(*) FROM hr_attendance_symbol_rule WHERE remark='Yuzhou T3 rule'"] : [])
      ].join(" UNION ALL ");
      result = queryJson(config, run, `WITH batches AS (SELECT id FROM migration_batch WHERE run_id IN (${childRuns})), maps AS (SELECT m.* FROM legacy_record_map m JOIN batches b ON b.id=m.batch_id), residual AS (${residualChecks}) SELECT json_build_object('activeBusinessRows',(SELECT COALESCE(sum(n),0) FROM residual),'activeControlRows',(SELECT count(*) FROM migration_batch WHERE run_id IN (${childRuns}) AND status NOT IN ('rolled_back','failed')))::text;`, "CORE_PRECLEANUP_PROBE_FAILED");
    }
    activeRows = Number(result.activeBusinessRows) + Number(result.activeControlRows);
    privateWrite(p.preCleanup, result, { replace: existsSync(p.preCleanup) });
  }
  if (activeRows !== 0) fail("CORE_RESIDUAL_NONZERO", `pre-cleanup:${activeRows}`);
  removeDockerResource(run, "container", config.target.container, ["-f"]);
  removeDockerResource(run, "network", config.target.network, []);
  removeDockerResource(run, "volume", config.target.volume, []);
  removeExactDirectory(config, config.target.runtimeRoot, "runtime");
  removeExactDirectory(config, config.target.credentialRoot, "credentials");
  return { status: "verified", productionImport: "HOLD" };
}

function residualRows(config, p) {
  let pre = { activeBusinessRows: 0, activeControlRows: 0 };
  if (existsSync(p.preCleanup)) pre = JSON.parse(readFileSync(p.preCleanup, "utf8"));
  const dockerResidual = (kind, identity) => spawnSync("docker", [kind, "inspect", identity], { stdio: "ignore" }).status === 0 ? 1 : 0;
  const portResidual = port => spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { stdio: "ignore" }).status === 0 ? 1 : 0;
  const values = {
    database: dockerResidual("container", config.target.container), container: dockerResidual("container", config.target.container),
    network: dockerResidual("network", config.target.network), volume: dockerResidual("volume", config.target.volume),
    role: dockerResidual("container", config.target.container), account: dockerResidual("container", config.target.container),
    file: existsSync(config.target.runtimeRoot) ? 1 : 0, directory: [config.target.runtimeRoot, config.target.credentialRoot].filter(existsSync).length,
    port: Object.values(config.target.ports).reduce((sum, port) => sum + portResidual(port), 0), process: 0,
    credential_artifact: existsSync(config.target.credentialRoot) ? 1 : 0,
    business_row: Number(pre.activeBusinessRows), control_row: Number(pre.activeControlRows)
  };
  return CORE_RESIDUAL_CLASSES.map(kind => ({ class: kind, removed: values[kind] === 0, residualCount: values[kind] }));
}

export async function createCoreT0T3Adapters(configInput, { commandRunner = defaultRun, enforceContractHash = true, sourceReceiptProbe } = {}) {
  const config = validateCoreT0T3Config(configInput), p = paths(config), state = {};
  if (!existsSync(p.auditRoot) || lstatSync(p.auditRoot).isSymbolicLink() || !statSync(p.auditRoot).isDirectory() || mode(p.auditRoot) !== "0700") fail("CORE_AUDIT_ROOT_UNSAFE", "prepared 0700 audit root required");
  if (enforceContractHash && computeCoreT0T3MappingContractHash() !== config.triple.mappingContractHash) fail("CORE_MAPPING_CONTRACT_DRIFT", config.rehearsal);
  const receiptProbe = sourceReceiptProbe ?? createDefaultSourceRestoreProbe({ etlEnvFile: config.source.etlEnvFile });
  const journal = new CoreT0T3FileJournal(p.journal, config, { trustedRoot: p.auditRoot });
  return {
    journal,
    provisionResources: () => provision(config, commandRunner, p, receiptProbe),
    executePhase: ({ domain, phase }) => {
      if (!coreProfile(config.profile).domainOrder.includes(domain) || !["extract", "load", "rollback"].includes(phase)) fail("CORE_FORBIDDEN_DOMAIN_REACHABLE", `${domain}.${phase}`);
      if (phase === "extract") assertSourceRestoreBinding(config, receiptProbe);
      if (["load", "rollback"].includes(phase)) assertRuntimeBoundary(config, commandRunner);
      if (domain === "T0" && phase === "load" && !state.t0DictionarySha256) state.t0DictionarySha256 = resolveT0DictionarySha(config, commandRunner);
      if (phase === "load" && ["T1", "T2"].includes(domain) && !state.nonT0DictionarySha256) state.nonT0DictionarySha256 = resolveNonT0DictionaryShas(config, commandRunner);
      commandRunner("sh", [resolve(ROOT, PHASE_SCRIPT[domain][phase])], { env: phaseEnvironment(config, domain, phase, state), code: "CORE_PHASE_FAILED" });
      return { domain, phase, status: "verified", productionImport: "HOLD" };
    },
    materializeMachinePackage: ({ machinePackage }) => materializeT0(config, machinePackage, commandRunner, p, state),
    materializeFacts: () => materializeFacts(config, commandRunner, p),
    cleanupResources: ({ recovery }) => cleanupResources(config, commandRunner, p, { recovery }),
    probeResiduals: () => residualRows(config, p)
  };
}
