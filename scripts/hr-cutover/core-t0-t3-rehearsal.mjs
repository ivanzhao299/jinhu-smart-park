/* global structuredClone */
import { createHash } from "node:crypto";
import { chmodSync, closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, statSync, writeFileSync, writeSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { verifyMaterializationPackage } from "./materialize-reviewed-job-state.mjs";

export const CORE_DOMAIN_ORDER = Object.freeze(["T0", "T1", "T2", "T3"]);
export const CORE_ROLLBACK_ORDER = Object.freeze(["T3", "T2", "T1", "T0"]);
export const CORE_EXECUTION_STATUS = "SPEC_FROZEN";
export const CORE_RESIDUAL_CLASSES = Object.freeze([
  "database", "container", "network", "volume", "role", "account", "file", "directory", "port", "process",
  "credential_artifact", "business_row", "control_row"
]);
export const CORE_RESOURCE_FIELDS = Object.freeze([
  "database", "composeProject", "container", "network", "volume", "role", "accountNamespace", "ports",
  "runtimeRoot", "stagingRoot", "evidenceRoot", "credentialRoot"
]);

const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const RUN_ID = /^yzcore-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}-r([AB])$/u;
const LAB_ID = /^jinhu_hr_migration_lab_core_[a-z0-9_]{6,40}$/u;
const FORBIDDEN = /(?:\bT[45]\b|production[_-]?import|payroll[_-]?history|legacy[_-]?history)/iu;
const PATH_FIELDS = ["runtimeRoot", "stagingRoot", "evidenceRoot", "credentialRoot"];
const STATES = new Set(["planned", "provisioned", "extracting", "review_hold", "loading", "verifying", "rollback_ready", "rolling_back", "rolled_back", "recovery", "cleaned"]);
const JOURNAL_GENESIS = "0".repeat(64);

export class CoreT0T3Error extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "CoreT0T3Error";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new CoreT0T3Error(code, detail); };
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys, code, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code, label);
};
const overlap = (left, right) => {
  const rel = relative(resolve(left), resolve(right));
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith(sep));
};
const requireSha = (value, code, label) => { if (!SHA256.test(value ?? "")) fail(code, label); };

export function validateCoreT0T3Config(input) {
  const config = structuredClone(input);
  exactKeys(config, ["formatVersion", "profile", "runId", "rehearsal", "triple", "source", "machineAttestation", "target", "productionImport"], "CORE_CONFIG_INVALID", "config shape");
  if (config.formatVersion !== 1 || config.profile !== "core_t0_t3" || config.productionImport !== "HOLD") fail("CORE_CONFIG_INVALID", "identity or HOLD boundary");
  const match = RUN_ID.exec(config.runId ?? "");
  if (!match || match[1] !== config.rehearsal) fail("CORE_RUN_ID_INVALID", "run id must bind rehearsal A or B");
  exactKeys(config.triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], "CORE_TRIPLE_INVALID", "triple shape");
  if (!CODE_SHA.test(config.triple.codeSha ?? "")) fail("CORE_TRIPLE_INVALID", "code SHA");
  requireSha(config.triple.sourceSnapshotHash, "CORE_TRIPLE_INVALID", "source snapshot");
  requireSha(config.triple.mappingContractHash, "CORE_TRIPLE_INVALID", "mapping contract");
  exactKeys(config.source, ["readOnly", "sourceBackupSha256", "sourceBackupPath", "sourceRestoreReceiptPath", "sourceRestoreReceiptSha256", "databaseAlias", "etlEnvFile", "sourceContainer", "dictionaryPackages", "dictionaryCaptureReceipt"], "CORE_SOURCE_INVALID", "source shape");
  if (config.source.readOnly !== true || config.source.sourceBackupSha256 !== config.triple.sourceSnapshotHash) fail("CORE_SOURCE_INVALID", "read-only source backup binding");
  if (!/^YuzhouHR_Lab_[A-Za-z0-9_]{6,40}$/u.test(config.source.databaseAlias ?? "")) fail("CORE_SOURCE_INVALID", "lab database alias");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{1,127}$/u.test(config.source.sourceContainer ?? "")) fail("CORE_SOURCE_INVALID", "source container identity");
  const sourceBackupPath = config.source.sourceBackupPath;
  if (typeof sourceBackupPath !== "string" || !isAbsolute(sourceBackupPath) || resolve(sourceBackupPath) !== sourceBackupPath) fail("CORE_SOURCE_INVALID", "source backup path");
  let backupLink, backupInfo;
  try { backupLink = lstatSync(sourceBackupPath); backupInfo = statSync(realpathSync(sourceBackupPath)); }
  catch { fail("CORE_SOURCE_INVALID", "source backup file missing"); }
  if (backupLink.isSymbolicLink() || !backupInfo.isFile() || backupInfo.nlink !== 1 || (backupInfo.mode & 0o777) !== 0o600) fail("CORE_SOURCE_INVALID", "source backup must be a non-symlink 0600 file");
  const sourceRestoreReceiptPath = config.source.sourceRestoreReceiptPath;
  if (typeof sourceRestoreReceiptPath !== "string" || !isAbsolute(sourceRestoreReceiptPath) || resolve(sourceRestoreReceiptPath) !== sourceRestoreReceiptPath) fail("CORE_SOURCE_INVALID", "source restore receipt path");
  let receiptLink, receiptInfo;
  try { receiptLink = lstatSync(sourceRestoreReceiptPath); receiptInfo = statSync(realpathSync(sourceRestoreReceiptPath)); }
  catch { fail("CORE_SOURCE_INVALID", "source restore receipt missing"); }
  if (receiptLink.isSymbolicLink() || !receiptInfo.isFile() || receiptInfo.nlink !== 1 || (receiptInfo.mode & 0o777) !== 0o600) fail("CORE_SOURCE_INVALID", "source restore receipt must be a non-symlink 0600 file");
  requireSha(config.source.sourceRestoreReceiptSha256, "CORE_SOURCE_INVALID", "source restore receipt hash");
  if (sha256(readFileSync(sourceRestoreReceiptPath)) !== config.source.sourceRestoreReceiptSha256) fail("CORE_SOURCE_INVALID", "source restore receipt bytes drifted");
  const etlEnvFile = config.source.etlEnvFile;
  if (typeof etlEnvFile !== "string" || !isAbsolute(etlEnvFile) || resolve(etlEnvFile) !== etlEnvFile) fail("CORE_SOURCE_INVALID", "ETL env path");
  let etlLink, etlInfo;
  try { etlLink = lstatSync(etlEnvFile); etlInfo = statSync(realpathSync(etlEnvFile)); }
  catch { fail("CORE_SOURCE_INVALID", "ETL env file missing"); }
  if (etlLink.isSymbolicLink() || !etlInfo.isFile() || etlInfo.nlink !== 1 || (etlInfo.mode & 0o777) !== 0o600) fail("CORE_SOURCE_INVALID", "ETL env must be a non-symlink 0600 file");
  exactKeys(config.machineAttestation, ["checkpointVersion", "trustedRootSha256"], "CORE_MACHINE_GATE_INVALID", "machine gate shape");
  if (config.machineAttestation.checkpointVersion !== 2) fail("CORE_MACHINE_GATE_INVALID", "checkpoint v2 required");
  requireSha(config.machineAttestation.trustedRootSha256, "CORE_MACHINE_GATE_INVALID", "trusted root");
  exactKeys(config.target, CORE_RESOURCE_FIELDS, "CORE_TARGET_INVALID", "target shape");
  if (!LAB_ID.test(config.target.database ?? "") || config.target.composeProject !== config.target.database) fail("CORE_TARGET_INVALID", "isolated core lab identity");
  const deterministicTargets = {
    container: `${config.target.database}-postgres-1`, network: `${config.target.database}_default`,
    volume: `${config.target.database}_postgres_data`, role: `${config.target.database}_operator`,
    accountNamespace: `${config.target.database}_accounts`
  };
  for (const [field, expected] of Object.entries(deterministicTargets)) if (config.target[field] !== expected) fail("CORE_TARGET_INVALID", `${field} identity`);
  exactKeys(config.target.ports, ["postgres", "api", "web"], "CORE_TARGET_INVALID", "ports shape");
  const ports = Object.values(config.target.ports);
  if (ports.some(port => !Number.isInteger(port) || port < 1024 || port > 65535) || new Set(ports).size !== 3) fail("CORE_TARGET_INVALID", "distinct unprivileged ports");
  for (const field of PATH_FIELDS) {
    const value = config.target[field];
    if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value || !value.split(sep).includes(config.target.database)) fail("CORE_TARGET_INVALID", `${field} namespace`);
  }
  if (!overlap(config.target.runtimeRoot, config.target.stagingRoot) || !overlap(config.target.runtimeRoot, config.target.evidenceRoot)) fail("CORE_TARGET_INVALID", "runtime paths");
  if (config.target.runtimeRoot === config.target.stagingRoot || config.target.runtimeRoot === config.target.evidenceRoot
    || overlap(config.target.stagingRoot, config.target.evidenceRoot) || overlap(config.target.evidenceRoot, config.target.stagingRoot)
    || overlap(config.target.credentialRoot, config.target.runtimeRoot) || overlap(config.target.runtimeRoot, config.target.credentialRoot)) fail("CORE_TARGET_INVALID", "staging, evidence and credential paths must be distinct");
  const projectRoot = dirname(config.target.runtimeRoot);
  if (basename(projectRoot) !== config.target.database || config.target.runtimeRoot !== join(projectRoot, "runtime")
    || config.target.stagingRoot !== join(projectRoot, "runtime", "staging") || config.target.evidenceRoot !== join(projectRoot, "runtime", "evidence")
    || config.target.credentialRoot !== join(projectRoot, "credentials") || config.source.etlEnvFile !== join(projectRoot, "credentials", "etl.env")) fail("CORE_TARGET_INVALID", "exact project directory topology");
  // Dictionary packages are validated by the dedicated four-package preflight
  // before provisioning. Their mandatory `productionImport: "HOLD"` marker is
  // evidence of the boundary, not a production-import capability.
  const { dictionaryPackages: _dictionaryPackages, dictionaryCaptureReceipt: _dictionaryCaptureReceipt, ...sourceReachabilitySurface } = config.source;
  const reachabilitySurface = JSON.stringify({ profile: config.profile, runId: config.runId, source: sourceReachabilitySurface, target: config.target });
  if (FORBIDDEN.test(reachabilitySurface)) fail("CORE_FORBIDDEN_DOMAIN_REACHABLE", "T4, T5 and production historical import are unreachable");
  return config;
}

export function validateCorePairIsolation(configAInput, configBInput) {
  const a = validateCoreT0T3Config(configAInput), b = validateCoreT0T3Config(configBInput);
  if (a.rehearsal !== "A" || b.rehearsal !== "B") fail("CORE_PAIR_ORDER_INVALID", "pair must be A then B");
  if (JSON.stringify(a.triple) !== JSON.stringify(b.triple)) fail("CORE_PAIR_TRIPLE_MISMATCH", "C/S/M differs");
  if (a.machineAttestation.trustedRootSha256 === b.machineAttestation.trustedRootSha256) fail("CORE_PAIR_TRUST_ROOT_REUSE", "A/B trusted roots must be independently fixed");
  for (const field of CORE_RESOURCE_FIELDS.filter(field => field !== "ports")) {
    if (a.target[field] === b.target[field]) fail("CORE_PAIR_RESOURCE_REUSE", field);
  }
  if (new Set([...Object.values(a.target.ports), ...Object.values(b.target.ports)]).size !== 6) fail("CORE_PAIR_RESOURCE_REUSE", "ports");
  for (const left of PATH_FIELDS) for (const right of PATH_FIELDS) {
    if (overlap(a.target[left], b.target[right]) || overlap(b.target[right], a.target[left])) fail("CORE_PAIR_RESOURCE_OVERLAP", `${left}:${right}`);
  }
  return { status: "PASS", triple: a.triple, resourceClasses: CORE_RESOURCE_FIELDS.length, productionImport: "HOLD" };
}

// This retained receipt deliberately excludes ETL paths and all credential
// material.  It remains verifiable after cleanup removes the private runtime.
export function retainedCoreT0T3Binding(configInput) {
  const config = validateCoreT0T3Config(configInput);
  return {
    formatVersion: 1, profile: config.profile, runId: config.runId, rehearsal: config.rehearsal, triple: config.triple,
    source: { readOnly: true, sourceBackupSha256: config.source.sourceBackupSha256, sourceRestoreReceiptSha256: config.source.sourceRestoreReceiptSha256, databaseAlias: config.source.databaseAlias, sourceContainer: config.source.sourceContainer },
    machineAttestation: config.machineAttestation,
    target: { database: config.target.database, composeProject: config.target.composeProject, container: config.target.container, network: config.target.network, volume: config.target.volume, role: config.target.role, accountNamespace: config.target.accountNamespace, ports: config.target.ports },
    productionImport: "HOLD"
  };
}

function privateArtifact(path, label) {
  let requested, link, actual, info;
  try { requested = resolve(path); link = lstatSync(requested); actual = realpathSync(requested); info = statSync(actual); }
  catch { fail("CORE_MACHINE_ARTIFACT_UNSAFE", `${label}:missing`); }
  if (link.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600) fail("CORE_MACHINE_ARTIFACT_UNSAFE", label);
  let value;
  try { value = JSON.parse(readFileSync(actual, "utf8")); }
  catch { fail("CORE_MACHINE_ARTIFACT_INVALID", label); }
  return { path: actual, root: dirname(actual), identity: `${info.dev}:${info.ino}`, value };
}

export function readCoreMachinePackage(paths, configInput) {
  const config = validateCoreT0T3Config(configInput);
  exactKeys(paths, ["decision", "privatePayload", "machineAttestation"], "CORE_MACHINE_ARTIFACT_INVALID", "machine package paths");
  const records = Object.entries(paths).map(([label, path]) => privateArtifact(path, label));
  if (new Set(records.map(row => row.identity)).size !== 3 || new Set(records.map(row => row.root)).size !== 1) fail("CORE_MACHINE_ARTIFACT_REUSE", config.rehearsal);
  const root = records[0].root;
  const rootInfo = statSync(root);
  if ((rootInfo.mode & 0o777) !== 0o700
    || overlap(config.target.runtimeRoot, root) || overlap(root, config.target.runtimeRoot)
    || overlap(config.target.credentialRoot, root) || overlap(root, config.target.credentialRoot)) fail("CORE_MACHINE_ROOT_UNSAFE", config.rehearsal);
  const [decision, privatePayload, machineAttestation] = records.map(row => row.value);
  const verified = verifyMaterializationPackage(decision, privatePayload, machineAttestation, config);
  return { decision, privatePayload, machineAttestation, verified, root, identities: records.map(row => row.identity) };
}

export function validateCoreMachinePairIsolation(packageA, packageB) {
  const identities = [...packageA.identities, ...packageB.identities];
  if (identities.length !== 6 || new Set(identities).size !== 6) fail("CORE_MACHINE_ARTIFACT_REUSE", "A/B six artifacts");
  if (overlap(packageA.root, packageB.root) || overlap(packageB.root, packageA.root)) fail("CORE_MACHINE_ROOT_OVERLAP", "A/B roots");
  if (!SHA256.test(packageA.verified?.machineEvidenceRootSha256 ?? "") || !SHA256.test(packageB.verified?.machineEvidenceRootSha256 ?? "")
    || packageA.verified.machineEvidenceRootSha256 === packageB.verified.machineEvidenceRootSha256) fail("CORE_PAIR_TRUST_ROOT_REUSE", "A/B machine evidence roots");
  return { status: "PASS", artifactCount: 6, trustedRoots: 2, productionImport: "HOLD" };
}

export function sealCoreT0T3Facts(input) {
  const body = structuredClone(input);
  exactKeys(body, ["formatVersion", "profile", "runId", "rehearsal", "triple", "domains", "sideEffectViolationCount", "productionImport"], "CORE_FACTS_INVALID", "facts shape");
  if (body.formatVersion !== 1 || body.profile !== "core_t0_t3" || body.productionImport !== "HOLD" || body.sideEffectViolationCount !== 0) fail("CORE_FACTS_INVALID", "facts identity");
  if (!Array.isArray(body.domains) || JSON.stringify(body.domains.map(row => row.domain)) !== JSON.stringify(CORE_DOMAIN_ORDER)) fail("CORE_FACTS_DOMAIN_ORDER_INVALID", "only T0-T3 accepted");
  for (const row of body.domains) {
    exactKeys(row, ["domain", "source", "loaded", "quarantined", "approvedIgnored", "canonicalSha256", "quarantineReasonSha256"], "CORE_FACTS_INVALID", row.domain);
    for (const field of ["source", "loaded", "quarantined", "approvedIgnored"]) if (!Number.isSafeInteger(row[field]) || row[field] < 0) fail("CORE_FACTS_INVALID", `${row.domain}.${field}`);
    if (row.source !== row.loaded + row.quarantined + row.approvedIgnored) fail("CORE_FACTS_CONSERVATION_FAILED", row.domain);
    requireSha(row.canonicalSha256, "CORE_FACTS_INVALID", `${row.domain}.canonical`);
    requireSha(row.quarantineReasonSha256, "CORE_FACTS_INVALID", `${row.domain}.quarantine`);
  }
  return {
    ...body,
    globalCanonicalSha256: sha256(canonical(body.domains.map(row => [row.domain, row.canonicalSha256]))),
    quarantineLedgerSha256: sha256(canonical(body.domains.map(row => [row.domain, row.quarantineReasonSha256]))),
    factsSha256: sha256(canonical(body))
  };
}

export function verifyCoreT0T3Facts(input, configInput) {
  const config = validateCoreT0T3Config(configInput);
  exactKeys(input, ["formatVersion", "profile", "runId", "rehearsal", "triple", "domains", "sideEffectViolationCount", "productionImport", "globalCanonicalSha256", "quarantineLedgerSha256", "factsSha256"], "CORE_FACTS_INVALID", "sealed facts shape");
  const { globalCanonicalSha256, quarantineLedgerSha256, factsSha256, ...body } = input;
  const sealed = sealCoreT0T3Facts(body);
  if (input.runId !== config.runId || input.rehearsal !== config.rehearsal || JSON.stringify(input.triple) !== JSON.stringify(config.triple)
    || globalCanonicalSha256 !== sealed.globalCanonicalSha256 || quarantineLedgerSha256 !== sealed.quarantineLedgerSha256 || factsSha256 !== sealed.factsSha256) fail("CORE_FACTS_BINDING_MISMATCH", config.rehearsal);
  return input;
}

export function compareCoreT0T3Facts(factsA, factsB) {
  for (const [label, facts] of [["A", factsA], ["B", factsB]]) {
    exactKeys(facts, ["formatVersion", "profile", "runId", "rehearsal", "triple", "domains", "sideEffectViolationCount", "productionImport", "globalCanonicalSha256", "quarantineLedgerSha256", "factsSha256"], "CORE_FACTS_INVALID", `${label} sealed facts shape`);
    const { globalCanonicalSha256, quarantineLedgerSha256, factsSha256, ...body } = facts;
    const sealed = sealCoreT0T3Facts(body);
    if (globalCanonicalSha256 !== sealed.globalCanonicalSha256 || quarantineLedgerSha256 !== sealed.quarantineLedgerSha256 || factsSha256 !== sealed.factsSha256) fail("CORE_FACTS_BINDING_MISMATCH", label);
    const match = RUN_ID.exec(facts.runId ?? "");
    if (facts.rehearsal !== label || !match || match[1] !== label) fail("CORE_PAIR_FACTS_MISMATCH", `${label} run identity`);
  }
  if (factsA.runId === factsB.runId) fail("CORE_PAIR_FACTS_MISMATCH", "A/B run ids must differ");
  const project = facts => ({ triple: facts.triple, domains: facts.domains, globalCanonicalSha256: facts.globalCanonicalSha256, quarantineLedgerSha256: facts.quarantineLedgerSha256, sideEffectViolationCount: facts.sideEffectViolationCount, productionImport: facts.productionImport });
  if (JSON.stringify(project(factsA)) !== JSON.stringify(project(factsB))) fail("CORE_PAIR_FACTS_MISMATCH", "A/B ledger or canonical facts differ");
  return { status: "PASS", globalCanonicalSha256: factsA.globalCanonicalSha256, quarantineLedgerSha256: factsA.quarantineLedgerSha256, productionImport: "HOLD" };
}

export class CoreT0T3FileJournal {
  constructor(path, configInput, { trustedRoot } = {}) {
    this.config = validateCoreT0T3Config(configInput);
    this.path = resolve(path);
    const root = resolve(trustedRoot ?? this.config.target.credentialRoot);
    const retainedAuditRoot = resolve(dirname(this.config.target.runtimeRoot), "audit");
    if (![resolve(this.config.target.credentialRoot), retainedAuditRoot].includes(root)
      || !overlap(root, this.path) || this.path === root) fail("CORE_JOURNAL_UNSAFE", "journal must be below credentialRoot or the deterministic retained audit root");
    const parent = dirname(this.path);
    if (!existsSync(parent) || lstatSync(parent).isSymbolicLink() || !statSync(parent).isDirectory() || (statSync(parent).mode & 0o777) !== 0o700) fail("CORE_JOURNAL_UNSAFE", "0700 parent required");
    if (!existsSync(this.path)) { writeFileSync(this.path, "", { flag: "wx", mode: 0o600 }); chmodSync(this.path, 0o600); }
    const info = lstatSync(this.path);
    if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600) fail("CORE_JOURNAL_UNSAFE", "0600 non-symlink journal required");
  }
  read() {
    let rows;
    try { rows = readFileSync(this.path, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)); }
    catch { fail("CORE_JOURNAL_TAMPERED", "invalid JSONL"); }
    let previousEventSha256 = JOURNAL_GENESIS;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row.sequence !== index || row.runId !== this.config.runId || JSON.stringify(row.triple) !== JSON.stringify(this.config.triple) || row.productionImport !== "HOLD") fail("CORE_JOURNAL_TAMPERED", String(index));
      if (row.domain && !CORE_DOMAIN_ORDER.includes(row.domain)) fail("CORE_FORBIDDEN_DOMAIN_REACHABLE", row.domain);
      const { eventSha256, ...eventBody } = row;
      if (row.previousEventSha256 !== previousEventSha256 || !SHA256.test(eventSha256 ?? "") || sha256(canonical(eventBody)) !== eventSha256) fail("CORE_JOURNAL_TAMPERED", `hash:${index}`);
      previousEventSha256 = eventSha256;
    }
    return rows;
  }
  append(row) {
    const current = this.read();
    const previousEventSha256 = current.at(-1)?.eventSha256 ?? JOURNAL_GENESIS;
    if (row.sequence !== current.length || row.previousEventSha256 !== previousEventSha256) fail("CORE_JOURNAL_CONCURRENT_WRITE", String(row.sequence));
    const descriptor = openSync(this.path, "a", 0o600);
    try { writeSync(descriptor, `${JSON.stringify(row)}\n`); fsyncSync(descriptor); } finally { closeSync(descriptor); }
    chmodSync(this.path, 0o600);
  }
}

function assertPhaseResult(result, domain, phase) {
  if (result?.domain !== domain || result.phase !== phase || result.status !== "verified" || result.productionImport !== "HOLD") fail("CORE_PHASE_FAILED", `${domain}.${phase}`);
}

export class CoreT0T3Lifecycle {
  constructor(configInput, { provisionResources, executePhase, materializeMachinePackage, materializeFacts, cleanupResources, probeResiduals, journal }) {
    this.config = validateCoreT0T3Config(configInput);
    if (![provisionResources, executePhase, materializeMachinePackage, materializeFacts, cleanupResources, probeResiduals].every(value => typeof value === "function")) fail("CORE_EXECUTOR_INVALID", "all lifecycle adapters are required");
    this.adapters = { provisionResources, executePhase, materializeMachinePackage, materializeFacts, cleanupResources, probeResiduals };
    this.journal = journal ?? { read: () => [], append: () => {} };
    this.events = this.journal.read();
    this.state = "planned";
    this.completed = new Set();
    this.facts = null;
    this.cleanupEvidence = null;
    let priorState = "planned";
    const forward = { planned: "provisioned", provisioned: "extracting", extracting: "review_hold", review_hold: "loading", loading: "verifying", verifying: "rollback_ready", rollback_ready: "rolling_back", rolling_back: "rolled_back", rolled_back: "cleaned", recovery: "cleaned" };
    const completedExtracts = [], completedLoads = [], completedRollbacks = [];
    for (const event of this.events) {
      if (event.kind === "state") {
        if (!STATES.has(event.state)) fail("CORE_JOURNAL_TAMPERED", `state:${event.state}`);
        if (event.state !== "recovery" && forward[priorState] !== event.state) fail("CORE_JOURNAL_TAMPERED", `${priorState}->${event.state}`);
        if (event.state === "recovery" && ["cleaned", "recovery"].includes(priorState)) fail("CORE_JOURNAL_TAMPERED", `${priorState}->recovery`);
        if (event.state === "review_hold" && JSON.stringify(completedExtracts) !== JSON.stringify(CORE_DOMAIN_ORDER)) fail("CORE_JOURNAL_TAMPERED", "incomplete extracts");
        if (event.state === "verifying" && (!this.completed.has("machine:T0") || JSON.stringify(completedLoads) !== JSON.stringify(CORE_DOMAIN_ORDER))) fail("CORE_JOURNAL_TAMPERED", "incomplete loads");
        if (event.state === "rollback_ready" && !this.facts) fail("CORE_JOURNAL_TAMPERED", "facts missing");
        if (event.state === "rolled_back" && JSON.stringify(completedRollbacks) !== JSON.stringify(CORE_ROLLBACK_ORDER)) fail("CORE_JOURNAL_TAMPERED", "incomplete rollback");
        if (event.state === "cleaned" && !this.cleanupEvidence) fail("CORE_JOURNAL_TAMPERED", "cleanup evidence missing");
        priorState = event.state;
        this.state = event.state;
      } else if (event.kind === "child") {
        if (event.status !== "verified" || !["extract", "load", "rollback"].includes(event.phase)) fail("CORE_JOURNAL_TAMPERED", "child shape");
        const key = `${event.phase}:${event.domain}`;
        if (this.completed.has(key)) fail("CORE_JOURNAL_TAMPERED", `duplicate:${key}`);
        if (event.phase === "extract") {
          if (priorState !== "extracting" || event.domain !== CORE_DOMAIN_ORDER[completedExtracts.length]) fail("CORE_JOURNAL_TAMPERED", `extract:${event.domain}`);
          completedExtracts.push(event.domain);
        } else if (event.phase === "load") {
          if (priorState !== "loading" || !this.completed.has("machine:T0") || event.domain !== CORE_DOMAIN_ORDER[completedLoads.length]) fail("CORE_JOURNAL_TAMPERED", `load:${event.domain}`);
          completedLoads.push(event.domain);
        } else {
          const expected = priorState === "rolling_back"
            ? CORE_ROLLBACK_ORDER[completedRollbacks.length]
            : priorState === "recovery" ? CORE_ROLLBACK_ORDER.filter(domain => this.completed.has(`load:${domain}`) && !this.completed.has(`rollback:${domain}`))[0] : null;
          if (event.domain !== expected) fail("CORE_JOURNAL_TAMPERED", `rollback:${event.domain}`);
          completedRollbacks.push(event.domain);
        }
        this.completed.add(key);
      } else if (event.kind === "machine_materialization") {
        if (priorState !== "loading" || event.domain !== "T0" || event.status !== "verified" || this.completed.has("machine:T0") || !SHA256.test(event.machineAttestationSha256 ?? "")) fail("CORE_JOURNAL_TAMPERED", "machine materialization");
        this.completed.add("machine:T0");
      } else if (event.kind === "core_facts") {
        if (priorState !== "verifying" || event.status !== "verified" || this.facts) fail("CORE_JOURNAL_TAMPERED", "core facts");
        this.facts = verifyCoreT0T3Facts(event.facts, this.config);
        if (event.factsSha256 !== this.facts.factsSha256) fail("CORE_JOURNAL_TAMPERED", "facts hash");
      } else if (event.kind === "cleanup") {
        if (!["rolled_back", "recovery"].includes(priorState) || event.status !== "verified" || this.cleanupEvidence
          || !Array.isArray(event.residuals) || JSON.stringify(event.residuals.map(row => row.class)) !== JSON.stringify(CORE_RESIDUAL_CLASSES)
          || event.residuals.some(row => row.removed !== true || row.residualCount !== 0)) fail("CORE_JOURNAL_TAMPERED", "cleanup");
        this.cleanupEvidence = event.residuals;
      } else fail("CORE_JOURNAL_TAMPERED", `kind:${event.kind}`);
    }
  }

  #event(kind, details = {}) {
    const eventBody = { sequence: this.events.length, kind, runId: this.config.runId, triple: this.config.triple, ...details, productionImport: "HOLD", previousEventSha256: this.events.at(-1)?.eventSha256 ?? JOURNAL_GENESIS };
    const event = { ...eventBody, eventSha256: sha256(canonical(eventBody)) };
    this.journal.append(event);
    this.events.push(event);
  }
  #transition(expected, next) {
    if (this.state !== expected) fail("CORE_STATE_TRANSITION_INVALID", `${this.state}->${next}`);
    this.state = next;
    this.#event("state", { state: next });
  }
  #phase(domain, phase) {
    if (!CORE_DOMAIN_ORDER.includes(domain) || FORBIDDEN.test(domain)) fail("CORE_FORBIDDEN_DOMAIN_REACHABLE", domain);
    const key = `${phase}:${domain}`;
    if (this.completed.has(key)) return;
    const result = this.adapters.executePhase({ config: this.config, domain, phase });
    assertPhaseResult(result, domain, phase);
    this.completed.add(key);
    this.#event("child", { domain, phase, status: "verified" });
  }

  provision() {
    const result = this.adapters.provisionResources({ config: this.config });
    if (result?.status !== "verified" || result.productionImport !== "HOLD") fail("CORE_PROVISION_FAILED", this.config.rehearsal);
    this.#transition("planned", "provisioned");
    return { state: this.state, productionImport: "HOLD" };
  }
  extract() {
    if (this.state === "provisioned") this.#transition("provisioned", "extracting");
    else if (this.state !== "extracting") fail("CORE_STATE_TRANSITION_INVALID", `${this.state}->extracting`);
    for (const domain of CORE_DOMAIN_ORDER) this.#phase(domain, "extract");
    this.#transition("extracting", "review_hold");
    return { state: this.state, gate: "MACHINE_ATTESTATION_REQUIRED", checkpointVersion: 2, trustedRootSha256: this.config.machineAttestation.trustedRootSha256, productionImport: "HOLD" };
  }
  resume(machinePackage) {
    if (!["review_hold", "loading"].includes(this.state)) fail("CORE_STATE_TRANSITION_INVALID", `${this.state}->loading`);
    const verified = verifyMaterializationPackage(machinePackage.decision, machinePackage.privatePayload, machinePackage.machineAttestation, this.config);
    if (this.state === "review_hold") this.#transition("review_hold", "loading");
    if (!this.completed.has("machine:T0")) {
      const result = this.adapters.materializeMachinePackage({ config: this.config, machinePackage, verified });
      if (result?.status !== "verified" || result.productionImport !== "HOLD") fail("CORE_MACHINE_MATERIALIZATION_FAILED", this.config.rehearsal);
      this.completed.add("machine:T0");
      this.#event("machine_materialization", { domain: "T0", status: "verified", machineAttestationSha256: verified.machineAttestationSha256 });
    }
    for (const domain of CORE_DOMAIN_ORDER) this.#phase(domain, "load");
    this.#transition("loading", "verifying");
    this.facts = verifyCoreT0T3Facts(this.adapters.materializeFacts({ config: this.config }), this.config);
    this.#event("core_facts", { factsSha256: this.facts.factsSha256, facts: this.facts, status: "verified" });
    this.#transition("verifying", "rollback_ready");
    return { state: this.state, facts: this.facts, productionImport: "HOLD" };
  }
  rollback() {
    if (!["rollback_ready", "rolling_back"].includes(this.state)) fail("CORE_STATE_TRANSITION_INVALID", `${this.state}->rolling_back`);
    if (this.state === "rollback_ready") this.#transition("rollback_ready", "rolling_back");
    for (const domain of CORE_ROLLBACK_ORDER) this.#phase(domain, "rollback");
    this.#transition("rolling_back", "rolled_back");
    return { state: this.state, productionImport: "HOLD" };
  }
  cleanup() {
    if (!['rolled_back', 'recovery'].includes(this.state)) fail("CORE_STATE_TRANSITION_INVALID", `${this.state}->cleaned`);
    const cleanup = this.adapters.cleanupResources({ config: this.config, recovery: this.state === "recovery" });
    if (cleanup?.status !== "verified" || cleanup.productionImport !== "HOLD") fail("CORE_CLEANUP_FAILED", this.config.rehearsal);
    const rows = this.adapters.probeResiduals({ config: this.config, recovery: this.state === "recovery" });
    if (!Array.isArray(rows) || JSON.stringify(rows.map(row => row.class)) !== JSON.stringify(CORE_RESIDUAL_CLASSES)
      || rows.some(row => {
        try { exactKeys(row, ["class", "removed", "residualCount"], "CORE_RESIDUAL_NONZERO", row?.class ?? "unknown"); } catch { return true; }
        return row.residualCount !== 0 || row.removed !== true;
      })) fail("CORE_RESIDUAL_NONZERO", this.config.rehearsal);
    this.#event("cleanup", { status: "verified", residuals: rows });
    this.cleanupEvidence = rows;
    this.#transition(this.state, "cleaned");
    return { state: "cleaned", residualCount: 0, residualClasses: rows.length, productionImport: "HOLD" };
  }
  recover() {
    if (this.state === "cleaned") return { state: "cleaned", residualCount: 0, residualClasses: CORE_RESIDUAL_CLASSES.length, productionImport: "HOLD" };
    this.state = "recovery";
    this.#event("state", { state: "recovery" });
    for (const domain of CORE_ROLLBACK_ORDER) if (this.completed.has(`load:${domain}`)) this.#phase(domain, "rollback");
    return this.cleanup();
  }
}

export function runCoreT0T3Pair({ lifecycleA, lifecycleB, machinePackageA, machinePackageB }) {
  validateCorePairIsolation(lifecycleA.config, lifecycleB.config);
  if (!Array.isArray(machinePackageA?.identities) || !Array.isArray(machinePackageB?.identities) || !machinePackageA.root || !machinePackageB.root) fail("CORE_MACHINE_ARTIFACT_ISOLATION_REQUIRED", "pair requires six external artifacts");
  validateCoreMachinePairIsolation(machinePackageA, machinePackageB);
  try {
    for (const lifecycle of [lifecycleA, lifecycleB]) { lifecycle.provision(); lifecycle.extract(); }
    const resultA = lifecycleA.resume(machinePackageA), resultB = lifecycleB.resume(machinePackageB);
    const comparison = compareCoreT0T3Facts(resultA.facts, resultB.facts);
    const cleanups = [];
    for (const lifecycle of [lifecycleB, lifecycleA]) { lifecycle.rollback(); cleanups.push(lifecycle.cleanup()); }
    return { formatVersion: 1, profile: "core_t0_t3", executionStatus: CORE_EXECUTION_STATUS, status: "CONTRACT_PASS", triple: lifecycleA.config.triple, comparison, cleanups, productionImport: "HOLD" };
  } catch (error) {
    const recoveryFailures = [];
    for (const lifecycle of [lifecycleA, lifecycleB]) if (lifecycle.state !== "cleaned") {
      try { lifecycle.recover(); } catch (recoveryError) { recoveryFailures.push(`${lifecycle.config.rehearsal}:${recoveryError.code ?? "FAILED"}`); }
    }
    if (recoveryFailures.length) fail("CORE_RECOVERY_FAILED", `${error.code ?? "STAGE_FAILED"};${recoveryFailures.join(",")}`);
    throw error;
  }
}
