#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { hostname } from "node:os";
import { fileURLToPath } from "node:url";
import { computeMappingContractHash } from "./verify-full-domain-contract.mjs";
import { manifestHash, verifyManifestChain } from "./parent-manifest.mjs";
import { assertManifestFacts, verifyGlobalFacts } from "./verify-global-facts.mjs";
import { materializeFullDomainFacts } from "./materialize-full-domain-facts.mjs";
import { buildMaterializationSql, canonicalHash, verifyCurrentT0Binding, verifyMaterializationPackage } from "./materialize-reviewed-job-state.mjs";
import { buildCoreNonT0DictionaryPackage, materializeCoreNonT0Dictionaries } from "./materialize-core-non-t0-dictionaries.mjs";
import { MaterializationKeyContractError, readMaterializationKeyFile } from "./materialization-key-contract.mjs";
import { validateSourceRestoreReceipt } from "./source-restore-receipt.mjs";
import {
  canonicalYuzhouJobStateMachineJson,
  compileYuzhouJobStateMachineAttestation,
  computeYuzhouJobStateCheckpointArtifactHash,
  computeYuzhouJobStateCheckpointRoot,
  computeYuzhouJobStateMachineAttestationSha256,
  verifyYuzhouJobStateMachineAttestation
} from "./yuzhou-job-state-machine-attestation.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CONTRACT_PATH = resolve(ROOT, "scripts/hr-cutover/contracts/full-domain-contract-v1.json");
const T1_EVENT_TYPE_DECISION_PATH = resolve(ROOT, "scripts/hr-cutover/contracts/yuzhou-t1-employment-event-type-decision-v1.json");
const DOMAIN_ORDER = ["T0", "T1", "T2", "T3", "T4", "T5"];
const ROLLBACK_ORDER = [...DOMAIN_ORDER].reverse();
const STATES = ["planned", "provisioned", "extracting", "review_hold", "loading", "verifying", "uat_ready", "rollback_ready", "cleaned"];
const RESOURCE_TYPES = ["database", "container", "network", "volume", "role", "directory", "account", "file", "port", "process", "credential_artifact"];
const RUN_ID = /^yzfull-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}-r([AB])$/;
const LAB_ID = /^jinhu_hr_migration_lab_full_[a-z0-9_]{6,48}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const CODE_SHA = /^[0-9a-f]{40}$/;
const FORBIDDEN_TARGET = /prod(?:uction)?|jinhu_smart_park|shared|default/i;
const FORBIDDEN_KEY = /password|passwd|token|secret|connectionstring|privatekey|bankaccount|idcard|employeename|fullname|mobile|phone|salaryamount|grosspay|netpay/i;
const FORBIDDEN_VALUE = /postgres(?:ql)?:\/\/|sqlserver:\/\/|Bearer\s+|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}/i;
const LOAD_COMMON_ENV = ["YUZHOU_TARGET_TENANT_ID", "YUZHOU_TARGET_PARK_ID", "YUZHOU_BACKUP_SHA256"];
const EXTRACT_MANIFEST_BINDINGS = {
  T0: {
    departments: { file: "departments.jsonl", env: "YUZHOU_DEPARTMENTS_SHA256" },
    positions: { file: "positions.jsonl", env: "YUZHOU_POSITIONS_SHA256" },
    employees: { file: "employees.jsonl", env: "YUZHOU_EMPLOYEES_SHA256" },
    employeeJobStates: { file: "employee-job-states.raw.json" },
    jobStateCodeMetadata: { file: "job-state-code-metadata.raw.json" },
    jobStateCodes: { file: "job-state-codes.raw.json" }
  },
  T1: {
    employmentEvents: { file: "employment-events.jsonl", env: "YUZHOU_T1_EVENTS_SHA256" },
    employmentEventTypes: { file: "employment-event-types.json", env: "YUZHOU_T1_TYPES_SHA256" },
    employmentEventStates: { file: "employment-event-states.json" }
  },
  T2: {
    "dbo.compacttypecode": { file: "contract-types.jsonl", env: "YUZHOU_T2_TYPES_SHA256" },
    "dbo.compact": { file: "contracts.jsonl", env: "YUZHOU_T2_CONTRACTS_SHA256" },
    "dbo.compact_c": { file: "contract-changes.jsonl", env: "YUZHOU_T2_CHANGES_SHA256" },
    "dbo.compact.state": { file: "contract-states.raw.json" }
  },
  T3: {
    attendance: { file: "attendance.jsonl", env: "YUZHOU_T3_ATTENDANCE_SHA256" },
    policies: { file: "policies.jsonl", env: "YUZHOU_T3_POLICIES_SHA256" },
    insurance: { file: "insurance.jsonl", env: "YUZHOU_T3_INSURANCE_SHA256" }
  }
};
export const EXTRACT_MANIFEST_HEADERS = {
  T3: {
    artifactKind: "yuzhou_t3_attendance_insurance_stage",
    sourceReadOnly: true,
    productionImport: "HOLD"
  }
};
let ACTIVE_CHILD = null;
export const ADAPTER_ENV_ALLOWLIST = {
  T0: { extract: ["YUZHOU_SQLSERVER_CONTAINER"], load: [...LOAD_COMMON_ENV, "YUZHOU_DEPARTMENTS_SHA256", "YUZHOU_POSITIONS_SHA256", "YUZHOU_EMPLOYEES_SHA256", "YUZHOU_T0_JOB_STATE_DICTIONARY_SHA256"], rollback: [] },
  T1: { extract: ["YUZHOU_SQLSERVER_CONTAINER"], load: [...LOAD_COMMON_ENV, "YUZHOU_T1_EVENTS_SHA256", "YUZHOU_T1_TYPES_SHA256", "YUZHOU_T1_EVENT_TYPE_DICTIONARY_SHA256", "YUZHOU_T1_EVENT_STATE_DICTIONARY_SHA256"], rollback: [] },
  T2: { extract: ["YUZHOU_SQLSERVER_CONTAINER"], load: [...LOAD_COMMON_ENV, "YUZHOU_T2_TYPES_SHA256", "YUZHOU_T2_CONTRACTS_SHA256", "YUZHOU_T2_CHANGES_SHA256", "YUZHOU_T2_CONTRACT_TYPE_DICTIONARY_SHA256", "YUZHOU_T2_CONTRACT_STATE_DICTIONARY_SHA256"], rollback: [] },
  T3: { extract: ["YUZHOU_SQLSERVER_CONTAINER", "YUZHOU_BACKUP_SHA256"], load: [...LOAD_COMMON_ENV, "YUZHOU_T3_ATTENDANCE_SHA256", "YUZHOU_T3_POLICIES_SHA256", "YUZHOU_T3_INSURANCE_SHA256"], rollback: [] },
  T4: { extract: ["YUZHOU_SQLSERVER_CONTAINER", "YUZHOU_SOURCE_BACKUP_FILE"], load: ["YUZHOU_TARGET_TENANT_ID", "YUZHOU_TARGET_PARK_ID", "YUZHOU_T4_BUSINESS_SHA256", "YUZHOU_T4_LOAD_MODE"], rollback: [] },
  T5: { extract: ["YUZHOU_SQLSERVER_CONTAINER", "YUZHOU_PARTY_DATA_KEY_FILE"], load: [...LOAD_COMMON_ENV, "YUZHOU_T5_BUSINESS_SHA256", "YUZHOU_MATERIALIZATION_ACTOR_USER_ID"], rollback: [] }
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

export function validateConfig(config, { recoveryCleanup = false } = {}) {
  exactKeys(config, ["formatVersion", "runId", "rehearsal", "backend", "triple", "target", "source", "t4Evidence", "adapterEnv"], ["verification", "machineAttestation"], "config");
  scanSensitive(config);
  if (config.formatVersion !== 1) fail("CONFIG_INVALID", "formatVersion must be 1");
  const match = RUN_ID.exec(config.runId ?? "");
  if (!match || match[1] !== config.rehearsal) fail("RUN_ID_INVALID", "runId must bind rehearsal A or B");
  if (!['fixture', 'lab'].includes(config.backend)) fail("BACKEND_INVALID", "backend must be fixture or lab");
  validateTriple(config.triple);
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
  // Recovery cleanup only deletes identities already pinned in this run's
  // registry. Mapping changes must still block every write-capable phase, but
  // cannot strand an older isolated run after a corrective mapping commit.
  if (!recoveryCleanup && config.triple.mappingContractHash !== computeMappingContractHash(contract)) fail("TRIPLE_MISMATCH", "mappingContractHash does not match the executable mapping bundle");
  const currentCodeSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
  if (currentCodeSha.status !== 0 || currentCodeSha.stdout.trim() !== config.triple.codeSha) fail("TRIPLE_MISMATCH", "codeSha does not match the checked-out candidate");
  exactKeys(config.source, ["databaseAlias", "readOnly", "sourceBackupPath", "sourceRestoreReceiptPath", "sourceRestoreReceiptSha256", "sourceContainer", "etlEnvFile", "t4EvidenceFile"], [], "source");
  if (!/^YuzhouHR_Lab_[A-Za-z0-9_]{6,40}$/.test(config.source.databaseAlias ?? "") || config.source.readOnly !== true) fail("SOURCE_NOT_READ_ONLY", "source must be an explicit read-only Yuzhou lab database");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{1,127}$/.test(config.source.sourceContainer ?? "")) fail("SOURCE_NOT_READ_ONLY", "source container identity is invalid");
  if (!SHA256.test(config.source.sourceRestoreReceiptSha256 ?? "")) fail("SOURCE_RESTORE_RECEIPT_INVALID", "source restore receipt hash is invalid");
  for (const field of ["sourceBackupPath", "sourceRestoreReceiptPath", "etlEnvFile", "t4EvidenceFile"]) {
    if (typeof config.source[field] !== "string" || !isAbsolute(config.source[field]) || resolve(config.source[field]) !== config.source[field]) fail("CONFIG_INVALID", `${field} must be an absolute path`);
    if (!existsSync(config.source[field]) || lstatSync(config.source[field]).isSymbolicLink() || !statSync(config.source[field]).isFile() || mode(config.source[field]) !== "0600") fail("UNSAFE_FILE_PERMISSION", `${field} must be a non-symlink 0600 regular file`);
  }
  let sourceRestoreReceipt;
  try { sourceRestoreReceipt = validateSourceRestoreReceipt(JSON.parse(readFileSync(config.source.sourceRestoreReceiptPath, "utf8"))); }
  catch { fail("SOURCE_RESTORE_RECEIPT_INVALID", "source restore receipt must be a sealed receipt"); }
  if (createHash("sha256").update(readFileSync(config.source.sourceRestoreReceiptPath)).digest("hex") !== config.source.sourceRestoreReceiptSha256) fail("SOURCE_RESTORE_RECEIPT_INVALID", "source restore receipt bytes drifted");
  if (sourceRestoreReceipt.sourceSnapshotSha256 !== config.triple.sourceSnapshotHash) fail("SOURCE_RESTORE_RECEIPT_INVALID", "source restore receipt does not bind the C/S/M source snapshot");
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
    const candidate = t4Record.productionCandidate;
    const candidateExpected = {
      periodStart: "2024-01-01", periodEnd: "2026-12-31", fullSourceRows: 46092,
      candidateRows: 8342, candidateLoadedRows: 8342, candidateQuarantinedRows: 0,
      candidateSnapshotItems: 190880, candidateCloseRecords: 266,
      candidateSourceNet: "15723009.9100", candidateLoadedNet: "15723009.9100",
      coldArchiveRows: 37750, coldArchiveDisposition: "deferred"
    };
    if (!candidate || Object.entries(candidateExpected).some(([key, value]) => candidate[key] !== value)
      || candidate.sourceSystemRetired !== true || candidate.incrementalDeltaRequired !== false
      || candidate.candidateRows !== candidate.candidateLoadedRows + candidate.candidateQuarantinedRows
      || candidate.fullSourceRows !== candidate.candidateRows + candidate.coldArchiveRows) {
      fail("T4_EVIDENCE_INVALID", "T4 evidence does not prove the fixed 2024-2026 hot candidate and deferred cold archive ledger");
    }
    const authority = t4Record.pendingExtractionEvidence?.sourceProof;
    if (authority?.readOnly !== true || authority.etlSa !== false || authority.etlSysadmin !== false
      || authority.dbDataReader !== true || authority.viewDefinition !== true || authority.credentialFileMode !== "0600") {
      fail("T4_EVIDENCE_INVALID", "T4 evidence does not prove the minimum read-only source authority");
    }
    const worktree = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    const controlledTestRun = process.env.NODE_ENV === "test" && process.env.YUZHOU_TEST_RUN_ID === config.runId;
    if (worktree.status !== 0 || (worktree.stdout.trim() !== "" && !controlledTestRun && !recoveryCleanup)) fail("CODE_WORKTREE_DIRTY", "lab runs require the byte-exact clean commit pinned by codeSha");
  }
  const legacyApproval = config.backend === "lab" && Object.hasOwn(config.target ?? {}, "jobStateApprovalArtifact");
  const reviewedArtifacts = config.backend === "lab" ? ["jobStateDecisionArtifact", "jobStateSourcePayloadArtifact", legacyApproval ? "jobStateApprovalArtifact" : "jobStateMachineAttestationArtifact"] : [];
  exactKeys(config.target, ["database", "composeProject", "volume", "postgresContainer", "postgresPort", "apiPort", "webPort", "role", "accountNamespace", "root", "stagingRoot", "evidenceRoot", "fileRoot", "credentialArtifact", "materializationKeyArtifact", "auditBundle", ...reviewedArtifacts], [], "target");
  const target = config.target;
  if (!LAB_ID.test(target.database ?? "") || !LAB_ID.test(target.composeProject ?? "") || target.database !== target.composeProject || FORBIDDEN_TARGET.test(target.database)) fail("UNSAFE_TARGET_IDENTITY", "database and Compose project must be the same full-domain lab identity");
  if (target.volume !== `${target.composeProject}_postgres_data` || target.postgresContainer !== `${target.composeProject}-postgres-1`) fail("UNSAFE_TARGET_IDENTITY", "container and volume must be deterministically namespaced");
  if (target.role !== `${target.composeProject}_operator` || target.accountNamespace !== `yzfull_${config.rehearsal.toLowerCase()}_${target.composeProject.slice(-12)}`) fail("UNSAFE_TARGET_IDENTITY", "role/account namespace must be rehearsal-scoped");
  for (const identity of [target.role, `${target.accountNamespace}_hr`, `${target.accountNamespace}_manager`, `${target.accountNamespace}_employee`]) {
    if (!/^[a-z][a-z0-9_]{5,62}$/.test(identity)) fail("UNSAFE_TARGET_IDENTITY", `PostgreSQL role identity is invalid: ${identity}`);
  }
  const ports = [target.postgresPort, target.apiPort, target.webPort];
  if (ports.some((port) => !Number.isInteger(port) || port < 1024 || port > 65535) || new Set(ports).size !== ports.length) fail("UNSAFE_TARGET_IDENTITY", "PostgreSQL/API/Web ports must be distinct unprivileged ports");
  for (const field of ["root", "stagingRoot", "evidenceRoot", "fileRoot", "credentialArtifact", "materializationKeyArtifact", ...reviewedArtifacts, "auditBundle"]) assertControlledPath(target[field], target.composeProject, field);
  for (const field of ["stagingRoot", "evidenceRoot", "fileRoot"]) if (!inside(target.root, target[field])) fail("CLEANUP_PATH_ESCAPE", `${field} must be below target.root`);
  if (basename(target.credentialArtifact) !== "postgres.env") fail("CONFIG_INVALID", "credential artifact filename must be postgres.env");
  if (basename(target.materializationKeyArtifact) !== "materialization.key") fail("CONFIG_INVALID", "materialization key artifact filename must be materialization.key");
  const credentialRoot = dirname(target.credentialArtifact);
  if (config.source.etlEnvFile !== join(credentialRoot, "etl.env") || config.source.t4EvidenceFile !== join(credentialRoot, "t4-evidence.json")) {
    fail("CONFIG_INVALID", "prepared ETL and T4 evidence copies must stay in the controlled credential root");
  }
  if (config.backend === "lab") {
    if (basename(target.jobStateDecisionArtifact) !== "employee-job-state.reviewed.json" || basename(target.jobStateSourcePayloadArtifact) !== "employee-job-state.private.json") fail("CONFIG_INVALID", "job-state machine artifact filenames are invalid");
    if (legacyApproval) {
      if (basename(target.jobStateApprovalArtifact) !== "employee-job-state.approval.json") fail("CONFIG_INVALID", "legacy job-state approval artifact filename is invalid");
    } else if (basename(target.jobStateMachineAttestationArtifact) !== "employee-job-state.machine-attestation.json") fail("CONFIG_INVALID", "job-state machine attestation artifact filename is invalid");
  }
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
  if (config.machineAttestation !== undefined) {
    exactKeys(config.machineAttestation, ["checkpointVersion", "trustedRootSha256"], [], "machineAttestation");
    if (config.machineAttestation.checkpointVersion !== 2 || !SHA256.test(config.machineAttestation.trustedRootSha256 ?? "")) fail("MACHINE_ATTESTATION_REQUIRED", "checkpoint v2 and an externally fixed trusted root are required");
  }
  return config;
}

export function compareIsolation(configAInput, configBInput) {
  const a = validateConfig(structuredClone(configAInput));
  const b = validateConfig(structuredClone(configBInput));
  if (a.rehearsal !== "A" || b.rehearsal !== "B") fail("REHEARSAL_PAIR_INVALID", "pair must be A then B");
  if (JSON.stringify(a.triple) !== JSON.stringify(b.triple)) fail("TRIPLE_MISMATCH", "A/B must use the byte-exact same C/S/M triple");
  const fields = ["database", "composeProject", "volume", "postgresContainer", "postgresPort", "apiPort", "webPort", "role", "accountNamespace", "root", "stagingRoot", "evidenceRoot", "fileRoot", "credentialArtifact", "materializationKeyArtifact", "auditBundle", ...(a.backend === "lab" ? ["jobStateDecisionArtifact", "jobStateSourcePayloadArtifact", Object.hasOwn(a.target, "jobStateMachineAttestationArtifact") ? "jobStateMachineAttestationArtifact" : "jobStateApprovalArtifact"] : [])];
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

function stagingDir(config, domain) {
  const childIndex = DOMAIN_ORDER.indexOf(domain);
  return domain === "T4"
    ? resolve(config.target.stagingRoot, `staging-t4-${config.runId}-t4`)
    : resolve(config.target.stagingRoot, `staging-${config.runId}-t${childIndex}`);
}

export function extractManifestFacts(config, domain) {
  const definition = EXTRACT_MANIFEST_BINDINGS[domain];
  if (!definition) fail("EXTRACT_MANIFEST_DOMAIN_INVALID", domain);
  const directory = stagingDir(config, domain);
  if (!existsSync(directory) || lstatSync(directory).isSymbolicLink() || !statSync(directory).isDirectory() || mode(directory) !== "0700") {
    fail("EXTRACT_MANIFEST_UNVERIFIED", `${domain} staging directory must be a non-symlink 0700 directory for this run`);
  }
  const manifestPath = join(directory, "manifest.json");
  if (!existsSync(manifestPath) || lstatSync(manifestPath).isSymbolicLink() || !statSync(manifestPath).isFile() || mode(manifestPath) !== "0600") {
    fail("EXTRACT_MANIFEST_UNVERIFIED", `${domain} manifest must be a non-symlink 0600 file`);
  }
  const manifestBytes = readFileSync(manifestPath);
  let manifest;
  try { manifest = JSON.parse(manifestBytes); } catch { fail("EXTRACT_MANIFEST_UNVERIFIED", `${domain} manifest is not valid JSON`); }
  const header = EXTRACT_MANIFEST_HEADERS[domain] ?? {};
  exactKeys(manifest, ["formatVersion", "generatedAt", "domains"], [...Object.keys(header), ...(domain === "T3" ? ["sourceSnapshotSha256"] : [])], `${domain}.manifest`);
  if (manifest.formatVersion !== 1 || typeof manifest.generatedAt !== "string") fail("EXTRACT_MANIFEST_UNVERIFIED", `${domain} manifest header is invalid`);
  for (const [field, expected] of Object.entries(header)) if (manifest[field] !== expected) fail("EXTRACT_MANIFEST_UNVERIFIED", `${domain}.${field} manifest header is invalid`);
  if (domain === "T3" && manifest.sourceSnapshotSha256 !== config.triple.sourceSnapshotHash) fail("EXTRACT_MANIFEST_UNVERIFIED", "T3 source snapshot does not bind the C/S/M triple");
  exactKeys(manifest.domains, Object.keys(definition), [], `${domain}.manifest.domains`);
  const env = {};
  for (const [key, expected] of Object.entries(definition)) {
    const entry = manifest.domains[key];
    exactKeys(entry, ["rows", "file", "fileSha256"], [], `${domain}.manifest.domains.${key}`);
    if (!Number.isInteger(entry.rows) || entry.rows < 0 || entry.file !== expected.file || !SHA256.test(entry.fileSha256 ?? "")) {
      fail("EXTRACT_MANIFEST_UNVERIFIED", `${domain}.${key} manifest entry is invalid`);
    }
    const filePath = join(directory, expected.file);
    if (!existsSync(filePath) || lstatSync(filePath).isSymbolicLink() || !statSync(filePath).isFile() || mode(filePath) !== "0600") {
      fail("EXTRACT_MANIFEST_UNVERIFIED", `${domain}.${key} staging file must be a non-symlink 0600 file`);
    }
    const actualSha256 = createHash("sha256").update(readFileSync(filePath)).digest("hex");
    if (actualSha256 !== entry.fileSha256) fail("EXTRACT_MANIFEST_HASH_DRIFT", `${domain}.${key} staging bytes differ from the manifest`);
    if (expected.env) env[expected.env] = entry.fileSha256;
  }
  return {
    manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
    bindingSha256: createHash("sha256").update(`${JSON.stringify(env)}\n`).digest("hex"),
    env
  };
}

export function resolveVerifiedExtractBindings(config, domain) {
  const facts = extractManifestFacts(config, domain);
  const journalPath = paths(config).journal;
  if (!existsSync(journalPath) || lstatSync(journalPath).isSymbolicLink() || !statSync(journalPath).isFile() || mode(journalPath) !== "0600") {
    fail("EXTRACT_MANIFEST_UNVERIFIED", `${domain} lifecycle journal is unavailable`);
  }
  let rows;
  try { rows = readFileSync(journalPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
  catch { fail("EXTRACT_MANIFEST_UNVERIFIED", `${domain} lifecycle journal is invalid`); }
  const records = rows.filter((row) => row.kind === "child" && row.domain === domain && row.phase === "extract");
  if (records.length !== 1) fail("EXTRACT_MANIFEST_UNVERIFIED", `${domain} requires exactly one verified extract record`);
  const record = records[0];
  const expectedChildRunId = `${config.runId}-t${DOMAIN_ORDER.indexOf(domain)}`;
  if (record.status !== "verified" || record.childRunId !== expectedChildRunId
    || JSON.stringify(record.triple) !== JSON.stringify(config.triple)
    || record.extractManifestSha256 !== facts.manifestSha256
    || record.extractBindingSha256 !== facts.bindingSha256) {
    fail("EXTRACT_MANIFEST_BINDING_MISMATCH", `${domain} extract record does not bind this run and C/S/M triple`);
  }
  return facts.env;
}

function paths(config) {
  return {
    compose: join(config.target.root, "compose.yml"),
    plan: join(config.target.evidenceRoot, "lifecycle-plan.json"),
    journal: join(config.target.evidenceRoot, "lifecycle-journal.jsonl"),
    registry: join(config.target.evidenceRoot, "resource-registry.json"),
    cleanup: join(config.target.evidenceRoot, "cleanup-journal.jsonl"),
    lock: join(config.target.root, ".lifecycle.lock"),
    operationLock: join(config.target.root, ".operation.lock"),
    operationLockTakeover: join(config.target.root, ".operation.lock.takeover"),
    operationLockTakeoverClaim: join(config.target.root, ".operation.lock.takeover.claim"),
    operationLockTakeoverStale: join(config.target.root, ".operation.lock.takeover.stale"),
    operationLockNext: join(config.target.root, ".operation.lock.next"),
    reviewTemps: [join(config.target.root, ".job-state-decision.installing"), join(config.target.root, ".job-state-payload.installing"), join(config.target.root, ".job-state-machine-attestation.installing")],
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
    { type: "network", planned: `${t.composeProject}_default` },
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
    { type: "file", planned: paths(config).operationLockTakeover },
    { type: "file", planned: paths(config).operationLockTakeoverClaim },
    { type: "file", planned: paths(config).operationLockTakeoverStale },
    { type: "file", planned: paths(config).operationLockNext },
    ...paths(config).reviewTemps.map(planned => ({ type: "file", planned })),
    { type: "file", planned: paths(config).compose },
    { type: "port", planned: `127.0.0.1:${t.postgresPort}` },
    { type: "port", planned: `127.0.0.1:${t.apiPort}` },
    { type: "port", planned: `127.0.0.1:${t.webPort}` },
    { type: "process", planned: `${config.runId}:managed_children`, observed: [] },
    { type: "credential_artifact", planned: config.source.etlEnvFile },
    { type: "credential_artifact", planned: config.source.t4EvidenceFile },
    { type: "credential_artifact", planned: t.credentialArtifact },
    { type: "credential_artifact", planned: t.materializationKeyArtifact }
  ];
  if (config.backend === "lab") resources.push(
    { type: "credential_artifact", planned: t.jobStateDecisionArtifact },
    { type: "credential_artifact", planned: t.jobStateSourcePayloadArtifact },
    { type: "credential_artifact", planned: t.jobStateMachineAttestationArtifact ?? t.jobStateApprovalArtifact }
  );
  if (config.verification) resources.push({ type: "file", planned: config.verification.manifestChainFile });
  return resources.map((item) => ({ ...item, observed: item.observed ?? null, removed: false, residualCount: 0 }));
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
  const result = spawnSync(binary, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: options.env ?? process.env
  });
  if (result.error || result.status !== 0) fail(options.code ?? "COMMAND_FAILED", `${binary} ${args[0] ?? ""} failed`);
  return (result.stdout ?? "").trim();
}

function verifyLabInitializationBaseline(env) {
  const result = spawnSync("sh", [resolve(ROOT, "scripts/check-init-baseline.sh")], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...env, STRICT: "false" }
  });
  if (result.status === 0 && !result.error) return "passed";
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const failures = output.split("\n").filter((line) => line.startsWith("[FAIL]"));
  if (!result.error && result.status === 2 && failures.length === 1 && failures[0] === "[FAIL] no bootstrap admin found") {
    return "passed_with_expected_missing_lab_uat_admin";
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  fail("LAB_INITIALIZATION_BASELINE_FAILED", failures.join("; ") || "baseline command failed");
}

function portBusy(port) {
  const probe = [
    "const net = require('node:net');",
    "const socket = net.createConnection({ host: '127.0.0.1', port: Number(process.argv[1]) });",
    "socket.setTimeout(1000);",
    "socket.once('connect', () => { socket.destroy(); process.exit(0); });",
    "socket.once('error', () => process.exit(1));",
    "socket.once('timeout', () => { socket.destroy(); process.exit(1); });"
  ].join("");
  const result = spawnSync(process.execPath, ["-e", probe, String(port)], {
    encoding: "utf8",
    stdio: "pipe",
    timeout: 2000
  });
  return result.status === 0;
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

function provisionT5MaterializationActor(config) {
  const actor = config.adapterEnv.T5?.load?.YUZHOU_MATERIALIZATION_ACTOR_USER_ID;
  const tenant = config.adapterEnv.T5?.load?.YUZHOU_TARGET_TENANT_ID;
  const park = config.adapterEnv.T5?.load?.YUZHOU_TARGET_PARK_ID;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actor ?? "")) fail("T5_MATERIALIZATION_ACTOR_REQUIRED", "T5 requires a deterministic isolated actor UUID");
  if (![tenant, park].every(value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value))) fail("T5_MATERIALIZATION_ACTOR_INVALID", "T5 tenant and park identities are invalid");
  const actorUsername = `yuzhou-t5-${config.runId}`;
  const result = spawnSync("docker", [
    "exec", "-i", config.target.postgresContainer, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", config.target.database,
    "-v", `actor=${actor}`, "-v", `username=${actorUsername}`, "-v", `tenant=${tenant}`, "-v", `park=${park}`, "-v", `db=${config.target.database}`
  ], {
    input: `BEGIN;\nSELECT set_config('yuzhou.t5_actor_id', :'actor', true), set_config('yuzhou.t5_actor_username', :'username', true), set_config('yuzhou.t5_actor_tenant', :'tenant', true), set_config('yuzhou.t5_actor_park', :'park', true), set_config('yuzhou.t5_actor_db', :'db', true);\nDO $$BEGIN\n IF current_database()<>current_setting('yuzhou.t5_actor_db') OR current_database()!~'^jinhu_hr_migration_lab_full_[A-Za-z0-9_]{6,64}$' THEN RAISE EXCEPTION 'unsafe target'; END IF;\n IF EXISTS(SELECT 1 FROM sys_user WHERE id=current_setting('yuzhou.t5_actor_id')::uuid) OR EXISTS(SELECT 1 FROM sys_user WHERE tenant_id=current_setting('yuzhou.t5_actor_tenant') AND park_id=current_setting('yuzhou.t5_actor_park') AND username=current_setting('yuzhou.t5_actor_username')) THEN RAISE EXCEPTION 'isolated materialization actor already exists'; END IF;\n INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,is_enabled,status,remark) VALUES(current_setting('yuzhou.t5_actor_id')::uuid,current_setting('yuzhou.t5_actor_tenant'),current_setting('yuzhou.t5_actor_park'),current_setting('yuzhou.t5_actor_username'),'Yuzhou T5 isolated materialization actor','not-a-login-hash',true,'enabled','isolated full-domain migration actor');\nEND$$;\nCOMMIT;\n`,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
  if (result.status !== 0) fail("T5_MATERIALIZATION_ACTOR_PROVISION_FAILED", "isolated T5 actor provisioning failed");
}

function provisionLab(config, registry) {
  const t = config.target;
  const p = paths(config);
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
  if (spawnSync("docker", ["network", "inspect", `${t.composeProject}_default`], { stdio: "ignore" }).status === 0) fail("RESOURCE_ALREADY_EXISTS", "target network already exists");
  if (spawnSync("docker", ["volume", "inspect", t.volume], { stdio: "ignore" }).status === 0) fail("RESOURCE_ALREADY_EXISTS", "target volume already exists");
  const compose = [
    "services:",
    "  postgres:",
    "    image: postgres:16-alpine",
    `    container_name: ${JSON.stringify(t.postgresContainer)}`,
    "    env_file:",
    `      - ${JSON.stringify(t.credentialArtifact)}`,
    "    ports:",
    `      - ${JSON.stringify(`127.0.0.1:${t.postgresPort}:5432`)}`,
    "    volumes:",
    `      - ${JSON.stringify("postgres_data:/var/lib/postgresql/data")}`,
    "volumes:",
    "  postgres_data:",
    "    external: true",
    `    name: ${JSON.stringify(t.volume)}`,
    ""
  ].join("\n");
  writePrivate(p.compose, compose);
  command("docker", ["volume", "create", "--label", `com.docker.compose.project=${t.composeProject}`, t.volume], { capture: true });
  command("docker", ["compose", "-p", t.composeProject, "-f", p.compose, "up", "-d", "postgres"], { capture: true });
  let ready = false;
  let consecutiveReady = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const logs = spawnSync("docker", ["logs", t.postgresContainer], { encoding: "utf8", stdio: "pipe" });
    const initComplete = `${logs.stdout ?? ""}\n${logs.stderr ?? ""}`.includes("PostgreSQL init process complete; ready for start up.");
    const acceptsConnections = spawnSync("docker", ["exec", t.postgresContainer, "pg_isready", "-U", "jinhu", "-d", t.database], { stdio: "ignore" }).status === 0;
    consecutiveReady = initComplete && acceptsConnections ? consecutiveReady + 1 : 0;
    if (consecutiveReady >= 3) { ready = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) fail("POSTGRES_NOT_READY", t.postgresContainer);
  const releaseEnv = {
    ...process.env,
    COMPOSE_FILE: p.compose,
    COMPOSE_PROJECT_NAME: t.composeProject,
    POSTGRES_USER: "jinhu",
    POSTGRES_DB: t.database,
    MIGRATION_BASELINE_ON_NONEMPTY_DB: "no"
  };
  command("sh", [resolve(ROOT, "scripts/db-migrate.sh")], { env: releaseEnv });
  command("sh", [resolve(ROOT, "scripts/db-seed-prod.sh")], {
    env: { ...releaseEnv, ALLOW_PRODUCTION_SEED: "yes" }
  });
  provisionT5MaterializationActor(config);
  const initializationBaseline = verifyLabInitializationBaseline(releaseEnv);
  appendPrivate(p.journal, {
    kind: "lab_bootstrap",
    migration: "succeeded",
    productionSeed: "succeeded",
    initializationBaseline,
    t5MaterializationActor: "provisioned",
    productionImport: "HOLD"
  });
  const roles = [t.role, `${t.accountNamespace}_hr`, `${t.accountNamespace}_manager`, `${t.accountNamespace}_employee`];
  const roleSql = roles.map((role) => `CREATE ROLE "${role}" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;`).join(" ");
  command("docker", ["exec", t.postgresContainer, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", t.database, "-c", roleSql], { capture: true });
  for (const entry of registry) {
    if (["database", "container", "network", "volume", "role", "directory", "account", "file", "port", "credential_artifact"].includes(entry.type)) entry.observed = entry.planned;
    else if (entry.type === "process") entry.observed = [];
  }
}

export function provision(configInput) {
  const config = validateConfig(structuredClone(configInput));
  const p = paths(config);
  try { readMaterializationKeyFile(config.target.materializationKeyArtifact); }
  catch (error) {
    if (error instanceof MaterializationKeyContractError) fail("UNSAFE_FILE_PERMISSION", error.message);
    throw error;
  }
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

const T5_LOAD_STAGE = /T5_LOAD_STAGE=(preflight(?:_[a-z_]+)?|database_transaction)\b/g;
const SAFE_CHILD_FAILURE_CODE = /(?:^|\n)([A-Z][A-Z0-9_]{2,80}):/g;

function childFailureEvidence(output) {
  const stages = [...String(output ?? "").matchAll(T5_LOAD_STAGE)].map((match) => `T5_LOAD_STAGE=${match[1]}`);
  const codes = [...String(output ?? "").matchAll(SAFE_CHILD_FAILURE_CODE)].map((match) => match[1]);
  const failureCode = codes.filter((code) => !["CHILD_FAILED", "ERROR"].includes(code)).at(-1)
    ?? (codes.includes("ERROR") ? "SCRIPT_ERROR" : null);
  return { stage: stages.at(-1) ?? null, failureCode };
}

function recordChildFailure(config, domain, phase, evidence = {}) {
  appendPrivate(paths(config).journal, {
    kind: "child_failure", domain, phase, status: "failed", code: "CHILD_FAILED", triple: config.triple,
    ...(evidence.stage ? { stage: evidence.stage } : {}),
    ...(evidence.failureCode ? { failureCode: evidence.failureCode } : {})
  });
}

function runAdapter(config, domain, phase) {
  const args = [resolve(ROOT, "scripts/hr-cutover/domain-adapter.mjs"), "--config", config.__configPath, "--domain", domain, "--phase", phase];
  try {
    const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (result.error || result.status !== 0) {
      const evidence = childFailureEvidence(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
      recordChildFailure(config, domain, phase, evidence);
      fail("CHILD_FAILED", `${domain}.${phase}${evidence.stage ? `:${evidence.stage}` : ""}`);
    }
  } finally { registerControlledFilesystem(config); }
  const manifest = phase === "extract" && config.backend === "lab" && Object.hasOwn(EXTRACT_MANIFEST_BINDINGS, domain)
    ? extractManifestFacts(config, domain) : null;
  appendPrivate(paths(config).journal, {
    kind: "child", domain, phase, childRunId: `${config.runId}-t${domain.slice(1)}`, status: "verified", triple: config.triple,
    ...(manifest ? { extractManifestSha256: manifest.manifestSha256, extractBindingSha256: manifest.bindingSha256 } : {})
  });
}

async function runAdapterAsync(config, domain, phase) {
  const args = [resolve(ROOT, "scripts/hr-cutover/domain-adapter.mjs"), "--config", config.__configPath, "--domain", domain, "--phase", phase];
  try { await new Promise((resolveChild, rejectChild) => {
    let tail = "", evidence = {}, settled = false;
    const observe = (chunk) => {
      tail = `${tail}${chunk}`.slice(-256);
      const next = childFailureEvidence(tail);
      evidence = { stage: next.stage ?? evidence.stage, failureCode: next.failureCode ?? evidence.failureCode };
    };
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    ACTIVE_CHILD = child;
    child.stdout.on("data", observe);
    child.stderr.on("data", observe);
    child.once("error", () => {
      if (settled) return;
      settled = true;
      recordChildFailure(config, domain, phase, evidence);
      rejectChild(new LifecycleError("CHILD_FAILED", `${domain}.${phase}${evidence.stage ? `:${evidence.stage}` : ""}`));
    });
    child.once("close", (code, signal) => {
      ACTIVE_CHILD = null;
      if (settled) return;
      settled = true;
      if (code === 0 && !signal) resolveChild();
      else {
        recordChildFailure(config, domain, phase, evidence);
        rejectChild(new LifecycleError("CHILD_FAILED", `${domain}.${phase}${evidence.stage ? `:${evidence.stage}` : ""}`));
      }
    });
  }); } finally { registerControlledFilesystem(config); }
  const manifest = phase === "extract" && config.backend === "lab" && Object.hasOwn(EXTRACT_MANIFEST_BINDINGS, domain)
    ? extractManifestFacts(config, domain) : null;
  appendPrivate(paths(config).journal, {
    kind: "child", domain, phase, childRunId: `${config.runId}-t${domain.slice(1)}`, status: "verified", triple: config.triple,
    ...(manifest ? { extractManifestSha256: manifest.manifestSha256, extractBindingSha256: manifest.bindingSha256 } : {})
  });
}

function registerControlledFilesystem(config) {
  const registryPath = paths(config).registry;
  if (!existsSync(registryPath) || !existsSync(config.target.root)) return;
  const registry = readJson(registryPath);
  const identities = new Set(registry.map((entry) => `${entry.type}:${resolve(entry.planned)}`));
  const additions = [];
  const visit = (parent) => {
    for (const name of readdirSync(parent).sort()) {
      const child = resolve(parent, name);
      const info = lstatSync(child);
      if (info.isSymbolicLink()) fail("CLEANUP_PATH_ESCAPE", "runtime output contains a symbolic link");
      const type = info.isDirectory() ? "directory" : info.isFile() ? "file" : null;
      if (!type) fail("UNREGISTERED_RESOURCE", "runtime output contains an unsupported filesystem object");
      const identity = `${type}:${child}`;
      if (!identities.has(identity)) {
        additions.push({ type, planned: child, observed: child, removed: false, residualCount: 0 });
        identities.add(identity);
      }
      if (type === "directory") visit(child);
    }
  };
  visit(config.target.root);
  if (additions.length) replacePrivate(registryPath, [...registry, ...additions]);
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
  if (config.backend === "lab" && (config.machineAttestation?.checkpointVersion !== 2 || !SHA256.test(config.machineAttestation?.trustedRootSha256 ?? "") || !Object.hasOwn(config.target, "jobStateMachineAttestationArtifact"))) fail("MACHINE_ATTESTATION_REQUIRED", "lab run requires checkpoint v2 and a trusted-root machine attestation target");
  transition(config, "extracting");
  for (const domain of DOMAIN_ORDER) runAdapter(config, domain, "extract");
  validateChildJournal(config, "extract");
  transition(config, "review_hold", { gate: "MACHINE_ATTESTATION_REQUIRED", checkpointVersion: 2, trustedRootSha256: config.machineAttestation?.trustedRootSha256 ?? null, productionImport: "HOLD" });
  if (config.backend === "lab") return { state: "review_hold", gate: "MACHINE_ATTESTATION_REQUIRED", checkpointVersion: 2, trustedRootSha256: config.machineAttestation.trustedRootSha256, productionImport: "HOLD" };
  transition(config, "loading");
  for (const domain of DOMAIN_ORDER) runAdapter(config, domain, "load");
  validateChildJournal(config, "load");
  transition(config, "verifying");
  if (config.backend === "lab") materializeFullDomainFacts(config, "after");
  validateChildJournal(config, "load");
  verifySlice3AtLifecycleState(config);
  transition(config, "uat_ready", { technicalUat: "pending_external_runner" });
  return { state: "uat_ready", productionImport: "HOLD" };
}

async function runForwardAsync(configInput, configPath) {
  const config = validateConfig(structuredClone(configInput));
  config.__configPath = resolve(configPath);
  if (currentState(config) !== "provisioned") fail("STATE_TRANSITION_INVALID", "run requires provisioned state");
  if (config.backend === "lab" && (config.machineAttestation?.checkpointVersion !== 2 || !SHA256.test(config.machineAttestation?.trustedRootSha256 ?? "") || !Object.hasOwn(config.target, "jobStateMachineAttestationArtifact"))) fail("MACHINE_ATTESTATION_REQUIRED", "lab run requires checkpoint v2 and a trusted-root machine attestation target");
  transition(config, "extracting");
  for (const domain of DOMAIN_ORDER) await runAdapterAsync(config, domain, "extract");
  validateChildJournal(config, "extract");
  transition(config, "review_hold", { gate: "MACHINE_ATTESTATION_REQUIRED", checkpointVersion: 2, trustedRootSha256: config.machineAttestation?.trustedRootSha256 ?? null, productionImport: "HOLD" });
  if (config.backend === "lab") return { state: "review_hold", gate: "MACHINE_ATTESTATION_REQUIRED", checkpointVersion: 2, trustedRootSha256: config.machineAttestation.trustedRootSha256, productionImport: "HOLD" };
  transition(config, "loading");
  for (const domain of DOMAIN_ORDER) await runAdapterAsync(config, domain, "load");
  validateChildJournal(config, "load");
  transition(config, "verifying");
  if (config.backend === "lab") materializeFullDomainFacts(config, "after");
  validateChildJournal(config, "load");
  verifySlice3AtLifecycleState(config);
  transition(config, "uat_ready", { technicalUat: "pending_external_runner" });
  return { state: "uat_ready", productionImport: "HOLD" };
}

function installMachineArtifacts(config, artifacts) {
  if (config.machineAttestation?.checkpointVersion !== 2 || !SHA256.test(config.machineAttestation?.trustedRootSha256 ?? "") || !Object.hasOwn(config.target, "jobStateMachineAttestationArtifact")) fail("MACHINE_ATTESTATION_REQUIRED", "legacy v1 review checkpoints cannot resume; use rollback or cleanup");
  const pairs = [[artifacts.decision, config.target.jobStateDecisionArtifact], [artifacts.payload, config.target.jobStateSourcePayloadArtifact], [artifacts.machineAttestation, config.target.jobStateMachineAttestationArtifact]];
  const sourceBytes = pairs.map(([source]) => { const candidate = resolve(source); let fd; try { fd = openSync(candidate, constants.O_RDONLY | constants.O_NOFOLLOW); const info = fstatSync(fd); if (!info.isFile() || (info.mode & 0o777) !== 0o600) fail("REVIEW_ARTIFACT_UNSAFE", "review artifacts must be non-symlink 0600 regular files"); return readFileSync(fd); } catch (error) { if (error.code === "REVIEW_ARTIFACT_UNSAFE") throw error; fail("REVIEW_ARTIFACT_UNSAFE", "review artifact cannot be opened safely"); } finally { if (fd !== undefined) closeSync(fd); } });
  let decision, payload, machineAttestation;
  try {
    [decision, payload, machineAttestation] = sourceBytes.map(bytes => JSON.parse(bytes));
    const verified = verifyMachineArtifactPackage(config, decision, payload, machineAttestation);
    if (verified.checkpointRootSha256 !== config.machineAttestation.trustedRootSha256) fail("MACHINE_ATTESTATION_TRUST_ROOT_MISMATCH", "machine artifacts are not anchored to the checkpoint v2 trusted root");
  }
  catch (error) { if (error instanceof LifecycleError) throw error; fail("MACHINE_ATTESTATION_INVALID", error.message); }
  const sourceHashes = sourceBytes.map(bytes => createHash("sha256").update(bytes).digest("hex"));
  const existing = pairs.map(([, destination], index) => existsSync(destination) && !lstatSync(destination).isSymbolicLink() && mode(destination) === "0600" && createHash("sha256").update(readFileSync(destination)).digest("hex") === sourceHashes[index]);
  if (existing.every(Boolean)) return;
  if (pairs.some(([, destination], index) => existsSync(destination) && !existing[index])) fail("MACHINE_ATTESTATION_DRIFT", "installed machine artifacts differ");
  for (const [, destination] of pairs) if (existsSync(destination)) unlinkSync(destination);
  const temps = paths(config).reviewTemps;
  try {
    for (let index = 0; index < pairs.length; index += 1) { writeFileSync(temps[index], sourceBytes[index], { flag: "wx", mode: 0o600 }); chmodSync(temps[index], 0o600); }
    registerControlledFilesystem(config);
    for (let index = 0; index < pairs.length; index += 1) renameSync(temps[index], pairs[index][1]);
    for (let index = 0; index < pairs.length; index += 1) if (createHash("sha256").update(readFileSync(pairs[index][1])).digest("hex") !== sourceHashes[index]) fail("REVIEW_ARTIFACT_INSTALL_DRIFT", "installed artifact bytes differ");
    verifyCurrentT0Binding(config, payload);
  } catch (error) {
    for (const path of [...temps, ...pairs.map(([, destination]) => destination)]) if (existsSync(path)) unlinkSync(path);
    fail("MACHINE_ATTESTATION_INSTALL_FAILED", error.message);
  }
}

function buildMachineCheckpoint(config, decision, payload) {
  const t0Evidence = {
    ...payload.t0Binding,
    dictionaryEvidenceSha256: payload.dictionaryEvidenceSha256,
    sourceDistinctStateCount: 7,
    sourceRecordCount: 2949
  };
  const checkpoint = {
    formatVersion: 2,
    kind: "yuzhou-job-state-preload-package",
    trustedCheckpointRootSha256: config.machineAttestation.trustedRootSha256,
    triple: config.triple,
    decisionArtifact: decision,
    privatePayload: payload,
    t0Evidence,
    bindings: {
      decisionArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("decision_artifact", decision),
      privatePayloadArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("private_payload", payload),
      t0EvidenceArtifactSha256: computeYuzhouJobStateCheckpointArtifactHash("t0_evidence", t0Evidence)
    },
    packageRootSha256: ""
  };
  checkpoint.packageRootSha256 = computeYuzhouJobStateCheckpointRoot(checkpoint);
  return checkpoint;
}

function verifyMachineArtifactPackage(config, decision, payload, machineAttestation) {
  const checkpoint = buildMachineCheckpoint(config, decision, payload);
  const compiled = compileYuzhouJobStateMachineAttestation(checkpoint, { expectedCheckpointRootSha256: config.machineAttestation.trustedRootSha256 });
  verifyYuzhouJobStateMachineAttestation(machineAttestation, { expectedCheckpointRootSha256: config.machineAttestation.trustedRootSha256 });
  if (canonicalYuzhouJobStateMachineJson(compiled) !== canonicalYuzhouJobStateMachineJson(machineAttestation)) fail("MACHINE_ATTESTATION_INVALID", "machine attestation differs from deterministic compilation");
  return { checkpointRootSha256: config.machineAttestation.trustedRootSha256, packageRootSha256: checkpoint.packageRootSha256, machineAttestationSha256: computeYuzhouJobStateMachineAttestationSha256(machineAttestation) };
}

function materializeMachineAttestedJobState(config) {
  const decision = readJson(config.target.jobStateDecisionArtifact), payload = readJson(config.target.jobStateSourcePayloadArtifact), machineAttestation = readJson(config.target.jobStateMachineAttestationArtifact);
  verifyMachineArtifactPackage(config, decision, payload, machineAttestation);
  verifyCurrentT0Binding(config, payload);
  const packageVerification = verifyMaterializationPackage(decision, payload, machineAttestation, config);
  const result = spawnSync("docker", ["exec", "-i", config.target.postgresContainer, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", config.target.database], { input: buildMaterializationSql(decision, payload, machineAttestation), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  if (result.error || result.status !== 0) fail("DICTIONARY_MATERIALIZATION_FAILED", "machine-attested dictionary write failed");
  return { canonicalDecisionSha256: decision.canonicalDecisionSha256, privatePayloadSha256: payload.payloadSha256, verificationMode: "machine_attested", machineAttestationSha256: packageVerification.machineAttestationSha256, t0BindingSha256: canonicalHash(payload.t0Binding), t0ManifestSha256: payload.t0Binding.manifestSha256, dictionarySnapshotSha256: payload.dictionaryEvidenceSha256, databaseItemsSha256: payload.expectedDatabaseItemsSha256, productionImport: "HOLD" };
}

function materializeMachineAttestedNonT0Dictionaries(config) {
  const dictionaryConfig = structuredClone(config);
  dictionaryConfig.source = { ...dictionaryConfig.source, dictionaryPackages: { employment_event_type: readJson(T1_EVENT_TYPE_DECISION_PATH) } };
  const dictionaryPackage = buildCoreNonT0DictionaryPackage(dictionaryConfig, {
    t1Types: join(stagingDir(config, "T1"), "employment-event-types.json"),
    t1States: join(stagingDir(config, "T1"), "employment-event-states.json"),
    t2Types: join(stagingDir(config, "T2"), "contract-types.jsonl"),
    t2States: join(stagingDir(config, "T2"), "contract-states.raw.json")
  });
  const snapshots = materializeCoreNonT0Dictionaries(dictionaryConfig, dictionaryPackage);
  appendPrivate(paths(config).journal, { kind: "dictionary_materialization", domain: "T1_T2", status: "verified", snapshots, triple: config.triple, productionImport: "HOLD" });
  return snapshots;
}

async function resumeAfterMachineAttestationAsync(configInput, configPath, artifacts) {
  const config = validateConfig(structuredClone(configInput)); config.__configPath = resolve(configPath);
  if (config.backend !== "lab" || currentState(config) !== "review_hold") fail("STATE_TRANSITION_INVALID", "resume requires a lab run at review_hold");
  installMachineArtifacts(config, artifacts);
  registerControlledFilesystem(config);
  refreshOwnedResumeLock(config, config.__configPath, artifacts);
  const installedDecision = readJson(config.target.jobStateDecisionArtifact), installedPayload = readJson(config.target.jobStateSourcePayloadArtifact), installedMachineAttestation = readJson(config.target.jobStateMachineAttestationArtifact), machineAttestationSha256 = computeYuzhouJobStateMachineAttestationSha256(installedMachineAttestation);
  const machineCheckpointBindingSha256 = createHash("sha256").update(`yuzhou-job-state-lifecycle-checkpoint-v2\0${canonicalYuzhouJobStateMachineJson({ triple: config.triple, trustedRootSha256: config.machineAttestation.trustedRootSha256, machineAttestationSha256 })}`).digest("hex");
  const expectedMaterialization = { kind: "dictionary_materialization", domain: "T0", status: "verified", verificationMode: "machine_attested", canonicalDecisionSha256: installedDecision.canonicalDecisionSha256, privatePayloadSha256: installedPayload.payloadSha256, machineAttestationSha256, machineTrustedRootSha256: installedMachineAttestation.trustedCheckpointRootSha256, machineCheckpointBindingSha256, t0BindingSha256: createHash("sha256").update(`${JSON.stringify(Object.fromEntries(Object.entries(installedPayload.t0Binding).sort(([left], [right]) => left.localeCompare(right))))}\n`).digest("hex"), t0ManifestSha256: installedPayload.t0Binding.manifestSha256, dictionarySnapshotSha256: installedPayload.dictionaryEvidenceSha256, databaseItemsSha256: installedPayload.expectedDatabaseItemsSha256, triple: config.triple, productionImport: "HOLD" };
  const prewriteMaterializations = readFileSync(paths(config).journal, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)).filter(row => row.kind === "dictionary_materialization" && row.domain === "T0");
  const journalMatches = row => Object.entries(expectedMaterialization).every(([key, value]) => typeof value === "object" ? JSON.stringify(row[key]) === JSON.stringify(value) : row[key] === value);
  if (prewriteMaterializations.length > 1 || (prewriteMaterializations.length === 1 && !journalMatches(prewriteMaterializations[0]))) fail("DICTIONARY_MATERIALIZATION_JOURNAL_DRIFT", "materialization journal differs");
  let materialized;
  try { materialized = materializeMachineAttestedJobState(config); }
  catch (error) { for (const path of [config.target.jobStateDecisionArtifact, config.target.jobStateSourcePayloadArtifact, config.target.jobStateMachineAttestationArtifact]) if (existsSync(path)) unlinkSync(path); throw error; }
  if (process.env.NODE_ENV === "test" && process.env.YUZHOU_TEST_FAULT_RUN_ID === config.runId && process.env.YUZHOU_TEST_FAULT_POINT === "post-db-commit-pre-journal") process.exit(86);
  const existingMaterializations = prewriteMaterializations;
  if (existingMaterializations.length > 1 || (existingMaterializations.length === 1 && (!journalMatches(existingMaterializations[0]) || ["canonicalDecisionSha256", "privatePayloadSha256", "verificationMode", "t0BindingSha256", "t0ManifestSha256", "dictionarySnapshotSha256", "databaseItemsSha256"].some(key => existingMaterializations[0][key] !== materialized[key])))) fail("DICTIONARY_MATERIALIZATION_JOURNAL_DRIFT", "materialization journal differs");
  if (existingMaterializations.length === 0) appendPrivate(paths(config).journal, { kind: "dictionary_materialization", domain: "T0", status: "verified", ...materialized, triple: config.triple, productionImport: "HOLD" });
  if (process.env.NODE_ENV === "test" && process.env.YUZHOU_TEST_FAULT_RUN_ID === config.runId && process.env.YUZHOU_TEST_FAULT_POINT === "post-materialization-journal") return { state: "review_hold", testBreakpoint: "post-materialization-journal", productionImport: "HOLD" };
  materializeMachineAttestedNonT0Dictionaries(config);
  transition(config, "loading");
  materializeFullDomainFacts(config, "before");
  for (const domain of DOMAIN_ORDER) await runAdapterAsync(config, domain, "load");
  validateChildJournal(config, "load"); transition(config, "verifying"); materializeFullDomainFacts(config, "after"); verifySlice3AtLifecycleState(config);
  transition(config, "uat_ready", { technicalUat: "pending_external_runner" });
  return { state: "uat_ready", productionImport: "HOLD" };
}

function preflightStaleResumeTakeover(config, artifacts) {
  installMachineArtifacts(config, artifacts);
  materializeMachineAttestedJobState(config);
}

function assertLabRollbackEvidence(config) {
  if (config.backend !== "lab") return;
  const chainPath = config.verification?.manifestChainFile;
  if (!chainPath || !existsSync(chainPath)) fail("RESTORE_EVIDENCE_REQUIRED", "lab rollback requires the verified manifest chain");
  const chain = readJson(chainPath);
  const result = verifyManifestChain(chain, { evidenceRoot: config.target.evidenceRoot });
  const head = chain.find((entry) => entry.sha256 === result.headSha256)?.manifest;
  if (!head || head.state !== "uat_ready" || head.parentRunId !== config.runId || JSON.stringify(head.triple) !== JSON.stringify(config.triple)) fail("RESTORE_EVIDENCE_REQUIRED", "rollback manifest is not bound to this uat_ready C/S/M run");
  if (head.hardGates?.technicalUat?.status !== "PASS" || head.hardGates?.restore?.status !== "PASS") fail("RESTORE_EVIDENCE_REQUIRED", "technical UAT and restore proof must pass before rollback");
}

export function runRollback(configInput, configPath) {
  const config = validateConfig(structuredClone(configInput));
  config.__configPath = resolve(configPath);
  if (currentState(config) !== "uat_ready") fail("STATE_TRANSITION_INVALID", "rollback requires uat_ready state");
  assertLabRollbackEvidence(config);
  for (const domain of ROLLBACK_ORDER) runAdapter(config, domain, "rollback");
  validateChildJournal(config, "rollback");
  transition(config, "rollback_ready");
  return { state: "rollback_ready", productionImport: "HOLD" };
}

async function runRollbackAsync(configInput, configPath) {
  const config = validateConfig(structuredClone(configInput));
  config.__configPath = resolve(configPath);
  if (currentState(config) !== "uat_ready") fail("STATE_TRANSITION_INVALID", "rollback requires uat_ready state");
  assertLabRollbackEvidence(config);
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
  if (entry.type === "network") return spawnSync("docker", ["network", "inspect", entry.planned], { stdio: "ignore" }).status === 0 ? 1 : 0;
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
  else if (entry.type === "network") spawnSync("docker", ["network", "rm", entry.planned], { stdio: "ignore" });
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
  const config = validateConfig(structuredClone(configInput), { recoveryCleanup: options.recovery === true });
  const p = paths(config);
  const state = currentState(config);
  if (!options.recovery && state !== "rollback_ready") fail("STATE_TRANSITION_INVALID", "normal cleanup requires rollback_ready state");
  if (!existsSync(p.registry)) fail("RESOURCE_REGISTRY_INVALID", "resource registry is missing");
  const registry = readJson(p.registry);
  assertRegistry(registry);
  const cleanupJournal = p.cleanup;
  if (!existsSync(cleanupJournal)) writePrivate(cleanupJournal, "");
  const filesystemTypes = new Set(["directory", "file", "credential_artifact"]);
  const cleanupPriority = { account: 10, role: 20, process: 30, container: 40, network: 45, volume: 50, database: 60, port: 70, file: 80, credential_artifact: 90, directory: 100 };
  for (const entry of [...registry].sort((a, b) => cleanupPriority[a.type] - cleanupPriority[b.type])) {
    appendPrivate(cleanupJournal, { type: entry.type, planned: entry.planned, observed: entry.observed, action: "remove_planned" });
    if (config.backend === "fixture") removeFixture(config, entry);
    else if (!filesystemTypes.has(entry.type)) removeLab(config, entry);
  }
  if (config.backend === "lab") {
    const ports = registry.filter((entry) => entry.type === "port").map((entry) => Number(entry.planned.split(":").at(-1)));
    for (let attempt = 0; attempt < 40 && ports.some(portBusy); attempt += 1) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
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
    else if (argv[index] === "--job-state-decision") args.decision = argv[++index];
    else if (argv[index] === "--job-state-source-payload") args.payload = argv[++index];
    else if (argv[index] === "--job-state-machine-attestation") args.machineAttestation = argv[++index];
    else if (argv[index] === "--recover") args.recovery = true;
    else fail("CLI_ARGUMENT_INVALID", argv[index]);
  }
  if (!["provision", "run", "resume", "rollback", "cleanup", "status"].includes(args.command) || !args.config || (args.command === "resume" && ![args.decision,args.payload,args.machineAttestation].every(Boolean))) fail("CLI_ARGUMENT_INVALID", "usage: full-domain-lifecycle.mjs <provision|run|resume|rollback|cleanup|status> --config <file>");
  return args;
}

const operationSha = value => createHash("sha256").update(value).digest("hex");
function reviewPackageSha256(artifacts) {
  if (!artifacts || ![artifacts.decision, artifacts.payload, artifacts.machineAttestation].every(value => typeof value === "string")) fail("OPERATION_LOCK_BINDING_INVALID", "resume machine artifacts are required");
  const hashes = [artifacts.decision, artifacts.payload, artifacts.machineAttestation].map(path => { let fd; try { fd = openSync(resolve(path), constants.O_RDONLY | constants.O_NOFOLLOW); const info = fstatSync(fd); if (!info.isFile() || (info.mode & 0o777) !== 0o600) fail("OPERATION_LOCK_BINDING_INVALID", "resume machine artifacts are unsafe"); return operationSha(readFileSync(fd)); } catch (error) { if (error instanceof LifecycleError) throw error; fail("OPERATION_LOCK_BINDING_INVALID", "resume machine artifacts are unavailable"); } finally { if (fd !== undefined) closeSync(fd); } });
  return operationSha(JSON.stringify(hashes));
}
function operationBinding(config, configPath, command, artifacts) {
  const p = paths(config);
  if (![configPath, p.registry, p.journal].every(path => existsSync(path) && !lstatSync(path).isSymbolicLink() && statSync(path).isFile() && mode(path) === "0600")) fail("OPERATION_LOCK_BINDING_INVALID", "operation binding files are unavailable");
  return {
    runId: config.runId,
    state: currentState(config),
    configSha256: operationSha(readFileSync(configPath)),
    registrySha256: operationSha(readFileSync(p.registry)),
    journalSha256: operationSha(readFileSync(p.journal)),
    reviewPackageSha256: command === "resume" ? reviewPackageSha256(artifacts) : null
  };
}

function pidIsAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code !== "ESRCH"; }
}

function readOperationFile(path, code) {
  let fd;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); const info = fstatSync(fd); if (!info.isFile() || (info.mode & 0o777) !== 0o600) fail(code, "operation lock is unsafe"); const bytes = readFileSync(fd); return { bytes, value: JSON.parse(bytes.toString("utf8")) }; }
  catch (error) { if (error instanceof LifecycleError) throw error; fail(code, "operation lock is invalid"); }
  finally { if (fd !== undefined) closeSync(fd); }
}

function makeOperationLock(config, configPath, command, artifacts, pid = process.pid) {
  const binding = operationBinding(config, configPath, command, artifacts);
  const lock = { formatVersion: 1, lockNonce: randomBytes(16).toString("hex"), pid, hostSha256: operationSha(hostname()), command, ...binding, bindingSha256: operationSha(JSON.stringify(binding)), createdAt: new Date().toISOString() };
  return lock;
}

function validateStaleOperationLock(lock, config, configPath, artifacts, isAlive = pidIsAlive) {
  const keys = ["formatVersion", "lockNonce", "pid", "hostSha256", "command", "runId", "state", "configSha256", "registrySha256", "journalSha256", "reviewPackageSha256", "bindingSha256", "createdAt"];
  if (config.backend !== "lab" || !lock || typeof lock !== "object" || Array.isArray(lock) || JSON.stringify(Object.keys(lock).sort()) !== JSON.stringify(keys.sort()) || lock.formatVersion !== 1 || !/^[0-9a-f]{32}$/u.test(lock.lockNonce) || !Number.isSafeInteger(lock.pid) || lock.pid < 1 || lock.hostSha256 !== operationSha(hostname()) || lock.command !== "resume" || lock.runId !== config.runId || lock.state !== "review_hold" || !SHA256.test(lock.reviewPackageSha256) || !SHA256.test(lock.bindingSha256) || typeof lock.createdAt !== "string" || Number.isNaN(Date.parse(lock.createdAt)) || new Date(lock.createdAt).toISOString() !== lock.createdAt) fail("STALE_OPERATION_LOCK_UNSAFE", "stale operation lock is not locally recoverable");
  if (isAlive(lock.pid)) fail("RUN_CONCURRENT", `${config.runId} already has an active operation`);
  const binding = operationBinding(config, configPath, "resume", artifacts);
  if (binding.state !== "review_hold" || lock.bindingSha256 !== operationSha(JSON.stringify(binding)) || ["runId", "state", "configSha256", "registrySha256", "journalSha256", "reviewPackageSha256"].some(key => lock[key] !== binding[key])) fail("STALE_OPERATION_LOCK_DRIFT", "stale operation lock binding differs");
  return binding;
}

function refreshOwnedResumeLock(config, configPath, artifacts) {
  const p = paths(config), observed = readOperationFile(p.operationLock, "RUN_CONCURRENT"), lock = observed.value;
  if (lock.command !== "resume" || lock.runId !== config.runId || lock.pid !== process.pid || lock.hostSha256 !== operationSha(hostname())) fail("RUN_CONCURRENT", `${config.runId} resume lock ownership changed`);
  const binding = operationBinding(config, configPath, "resume", artifacts), refreshed = { ...lock, ...binding, bindingSha256: operationSha(JSON.stringify(binding)) }, nextBytes = Buffer.from(`${JSON.stringify(refreshed)}\n`);
  if (existsSync(p.operationLockNext)) fail("RUN_CONCURRENT", `${config.runId} next lock is already occupied`);
  writePrivate(p.operationLockNext, refreshed);
  const confirmed = readOperationFile(p.operationLock, "RUN_CONCURRENT");
  if (!confirmed.bytes.equals(observed.bytes)) { unlinkOwnedOperationFile(p.operationLockNext, nextBytes); fail("RUN_CONCURRENT", `${config.runId} resume lock changed during refresh`); }
  renameSync(p.operationLockNext, p.operationLock);
}

function unlinkOwnedOperationFile(path, expectedBytes, code = "RUN_CONCURRENT") {
  if (!existsSync(path)) return;
  const observed = readOperationFile(path, code);
  if (!observed.bytes.equals(expectedBytes)) fail(code, "operation ownership changed");
  unlinkSync(path);
}

function recoverDeadTakeoverGuard(config, operationLockBytes, isAlive) {
  const p = paths(config), observed = readOperationFile(p.operationLockTakeover, "RUN_CONCURRENT"), guard = observed.value;
  const keys = ["formatVersion", "nonce", "pid", "hostSha256", "runId", "operationLockSha256", "nextLockSha256"];
  if (!guard || JSON.stringify(Object.keys(guard).sort()) !== JSON.stringify(keys.sort()) || guard.formatVersion !== 1 || !/^[0-9a-f]{32}$/u.test(guard.nonce) || guard.hostSha256 !== operationSha(hostname()) || guard.runId !== config.runId || guard.operationLockSha256 !== operationSha(operationLockBytes) || !SHA256.test(guard.nextLockSha256) || !Number.isSafeInteger(guard.pid) || guard.pid < 1 || isAlive(guard.pid)) fail("RUN_CONCURRENT", `${config.runId} takeover is already active`);
  const claim = { formatVersion: 1, nonce: randomBytes(16).toString("hex"), pid: process.pid, hostSha256: operationSha(hostname()), runId: config.runId, guardSha256: operationSha(observed.bytes) }, claimBytes = Buffer.from(`${JSON.stringify(claim)}\n`);
  let fd, ownsClaim = false;
  try {
    try { fd = openSync(p.operationLockTakeoverClaim, "wx", 0o600); ownsClaim = true; } catch (error) { if (error?.code === "EEXIST") fail("RUN_CONCURRENT", `${config.runId} takeover recovery is already active`); throw error; }
    writeFileSync(fd, claimBytes); closeSync(fd); fd = undefined; chmodSync(p.operationLockTakeoverClaim, 0o600);
    const confirmedGuard = readOperationFile(p.operationLockTakeover, "RUN_CONCURRENT"), confirmedLock = readOperationFile(p.operationLock, "RUN_CONCURRENT");
    if (!confirmedGuard.bytes.equals(observed.bytes) || operationSha(confirmedLock.bytes) !== guard.operationLockSha256) fail("RUN_CONCURRENT", `${config.runId} takeover ownership changed`);
    try { linkSync(p.operationLockTakeover, p.operationLockTakeoverStale); } catch (error) { if (error?.code === "EEXIST") fail("RUN_CONCURRENT", `${config.runId} stale takeover quarantine is occupied`); throw error; }
    unlinkOwnedOperationFile(p.operationLockTakeover, observed.bytes);
    unlinkOwnedOperationFile(p.operationLockTakeoverStale, observed.bytes);
    if (existsSync(p.operationLockNext)) { const next = readOperationFile(p.operationLockNext, "RUN_CONCURRENT"); if (operationSha(next.bytes) !== guard.nextLockSha256) fail("RUN_CONCURRENT", `${config.runId} next lock ownership changed`); unlinkOwnedOperationFile(p.operationLockNext, next.bytes); }
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch {}
    if (ownsClaim) unlinkOwnedOperationFile(p.operationLockTakeoverClaim, claimBytes);
  }
}

export function acquireOperationLock(configInput, configPathInput, command, { isAlive = pidIsAlive, artifacts, staleResumePreflight, validate = validateConfig, beforeTakeoverGuard } = {}) {
  if (process.env.NODE_ENV !== "test" && (validate !== validateConfig || isAlive !== pidIsAlive || beforeTakeoverGuard !== undefined || (command === "resume" && staleResumePreflight !== preflightStaleResumeTakeover))) fail("TEST_HOOK_DENIED", "operation lock override is test-only");
  const config = validate(structuredClone(configInput)), configPath = realpathSync(resolve(configPathInput)), p = paths(config), lock = makeOperationLock(config, configPath, command, artifacts);
  let fd;
  try { fd = openSync(p.operationLock, "wx", 0o600); writeFileSync(fd, `${JSON.stringify(lock)}\n`); closeSync(fd); chmodSync(p.operationLock, 0o600); return { status: "ACQUIRED", takeover: false, bindingSha256: lock.bindingSha256 }; }
  catch (error) { if (fd !== undefined) try { closeSync(fd); } catch {} if (error?.code !== "EEXIST") throw error; }
  if (command !== "resume") fail("RUN_CONCURRENT", `${config.runId} already has an active operation`);
  const observed = readOperationFile(p.operationLock, "STALE_OPERATION_LOCK_UNSAFE");
  validateStaleOperationLock(observed.value, config, configPath, artifacts, isAlive);
  if (existsSync(p.operationLockTakeover)) recoverDeadTakeoverGuard(config, observed.bytes, isAlive);
  let guardFd, ownsTakeoverGuard = false;
  const nextBytes = Buffer.from(`${JSON.stringify(lock)}\n`), guard = { formatVersion: 1, nonce: randomBytes(16).toString("hex"), pid: process.pid, hostSha256: operationSha(hostname()), runId: config.runId, operationLockSha256: operationSha(observed.bytes), nextLockSha256: operationSha(nextBytes) }, guardBytes = Buffer.from(`${JSON.stringify(guard)}\n`);
  try {
    if (beforeTakeoverGuard !== undefined) beforeTakeoverGuard(p.operationLockTakeover);
    try { guardFd = openSync(p.operationLockTakeover, "wx", 0o600); ownsTakeoverGuard = true; }
    catch (error) { if (error?.code === "EEXIST") fail("RUN_CONCURRENT", `${config.runId} takeover is already active`); throw error; }
    writeFileSync(guardFd, guardBytes); closeSync(guardFd); guardFd = undefined; chmodSync(p.operationLockTakeover, 0o600);
    const confirmed = readOperationFile(p.operationLock, "STALE_OPERATION_LOCK_UNSAFE");
    if (!confirmed.bytes.equals(observed.bytes)) fail("RUN_CONCURRENT", `${config.runId} operation lock changed during takeover`);
    validateStaleOperationLock(confirmed.value, config, configPath, artifacts, isAlive);
    if (typeof staleResumePreflight !== "function") fail("STALE_OPERATION_LOCK_UNSAFE", "stale resume preflight is required");
    staleResumePreflight(config, artifacts);
    if (existsSync(p.operationLockNext)) fail("RUN_CONCURRENT", `${config.runId} next lock is already occupied`);
    writePrivate(p.operationLockNext, lock);
    renameSync(p.operationLockNext, p.operationLock);
    return { status: "ACQUIRED", takeover: true, bindingSha256: lock.bindingSha256 };
  } finally {
    if (guardFd !== undefined) try { closeSync(guardFd); } catch {}
    if (ownsTakeoverGuard) unlinkOwnedOperationFile(p.operationLockTakeover, guardBytes);
    if (ownsTakeoverGuard && existsSync(p.operationLockNext)) unlinkOwnedOperationFile(p.operationLockNext, nextBytes);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = realpathSync(resolve(args.config));
  const config = readJson(configPath);
  validateConfig(config, { recoveryCleanup: args.command === "cleanup" && args.recovery });
  const p = paths(config);
  let ownsRecovery = args.command === "provision";
  if (["run", "resume", "rollback"].includes(args.command)) {
    if (!existsSync(config.target.root)) fail("STATE_TRANSITION_INVALID", `${args.command} requires a provisioned run`);
    if (args.command === "resume") installSignalCleanup(config);
    const machineArtifacts = args.command === "resume" ? { decision: args.decision, payload: args.payload, machineAttestation: args.machineAttestation } : undefined;
    acquireOperationLock(config, configPath, args.command, { artifacts: machineArtifacts, staleResumePreflight: args.command === "resume" ? preflightStaleResumeTakeover : undefined });
    ownsRecovery = args.command !== "resume";
  }
  if (ownsRecovery) installSignalCleanup(config);
  let result;
  try {
    if (args.command === "provision") result = provision(config);
    else if (args.command === "run") result = await runForwardAsync(config, configPath);
    else if (args.command === "resume") result = await resumeAfterMachineAttestationAsync(config, configPath, { decision: args.decision, payload: args.payload, machineAttestation: args.machineAttestation });
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
    if (args.command === "resume" && existsSync(p.registry) && currentState(config) !== "review_hold") {
      if (existsSync(p.journal)) appendPrivate(p.journal, { kind: "failure", code: error.code ?? "UNEXPECTED_FAILURE", state: currentState(config) });
      try { cleanup(config, { recovery: true }); } catch { process.stderr.write("FAILURE_CLEANUP_FAILED: RECOVERY_REQUIRED\n"); }
    }
    if (args.command === "resume" && existsSync(p.operationLock)) unlinkSync(p.operationLock);
    throw error;
  }
  if (["run", "resume", "rollback"].includes(args.command) && existsSync(p.operationLock)) unlinkSync(p.operationLock);
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
