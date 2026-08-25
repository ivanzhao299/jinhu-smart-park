#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DEFAULT_CONTRACT = resolve(ROOT, "scripts/hr-cutover/contracts/full-domain-contract-v1.json");
const SHA256 = /^[0-9a-f]{64}$/;
const CODE_SHA = /^[0-9a-f]{40}$/;
const RUN_ID = /^yzfull-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}-r([AB])$/;
const TARGET = /^jinhu_hr_migration_lab_full_[a-z0-9_]{6,48}$/;
const FORBIDDEN_KEYS = /password|passwd|token|secret|connectionstring|credential|privatekey|bankaccount|idcard|insureaccount|employeename|fullname|mobile|phone|salaryamount|grosspay|netpay/i;
const FORBIDDEN_VALUES = /postgres(?:ql)?:\/\/|sqlserver:\/\/|Bearer\s+|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}/i;
const SAFE_CONTRACT_KEYS = new Set(["containsSecrets", "redactionContractVersion"]);

export class ContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ContractError";
    this.code = code;
  }
}

function fail(code, detail) {
  throw new ContractError(code, detail);
}

function requireObject(value, code, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code, `${label} must be an object`);
}

function assertExactKeys(value, required, optional, label) {
  requireObject(value, "MANIFEST_SCHEMA_INVALID", label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("MANIFEST_SCHEMA_INVALID", `${label}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail("MANIFEST_SCHEMA_INVALID", `${label}.${key} is required`);
  }
}

function assertSha(value, label) {
  if (!SHA256.test(value ?? "")) fail("MANIFEST_SCHEMA_INVALID", `${label} must be a lowercase SHA-256`);
}

export function computeMappingContractHash(contract) {
  if (contract.triple?.mappingContractHashAlgorithm !== "sha256_path_nul_bytes_nul_sorted" || !Array.isArray(contract.triple.mappingContractComponents) || contract.triple.mappingContractComponents.length === 0) fail("MAPPING_CONTRACT_INVALID", "mapping contract components/algorithm missing");
  const hash = createHash("sha256");
  for (const relativePath of [...contract.triple.mappingContractComponents].sort()) {
    if (typeof relativePath !== "string" || isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) fail("MAPPING_CONTRACT_INVALID", String(relativePath));
    const absolutePath = resolve(ROOT, relativePath);
    if (!absolutePath.startsWith(`${ROOT}${sep}`)) fail("MAPPING_CONTRACT_INVALID", relativePath);
    hash.update(relativePath).update("\0").update(readFileSync(absolutePath)).update("\0");
  }
  return hash.digest("hex");
}

function scanSensitive(value, path = "$") {
  if (Array.isArray(value)) return value.forEach((item, index) => scanSensitive(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && FORBIDDEN_VALUES.test(value)) fail("SECRET_PATTERN_DETECTED", `forbidden value at ${path}`);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.test(key) && !SAFE_CONTRACT_KEYS.has(key)) fail("SECRET_PATTERN_DETECTED", `forbidden key at ${path}.${key}`);
    scanSensitive(child, `${path}.${key}`);
  }
}

function validateTriple(triple, expectedTriple, contract) {
  assertExactKeys(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], [], "triple");
  if (!CODE_SHA.test(triple.codeSha ?? "")) fail("MANIFEST_SCHEMA_INVALID", "triple.codeSha must be a full lowercase git SHA");
  assertSha(triple.sourceSnapshotHash, "triple.sourceSnapshotHash");
  assertSha(triple.mappingContractHash, "triple.mappingContractHash");
  if (expectedTriple) {
    for (const field of ["codeSha", "sourceSnapshotHash", "mappingContractHash"]) {
      if (triple[field] !== expectedTriple[field]) fail("TRIPLE_MISMATCH", `${field} differs from the frozen rehearsal triple`);
    }
  }
  if (triple.mappingContractHash !== computeMappingContractHash(contract)) fail("MAPPING_CONTRACT_HASH_MISMATCH", "triple.mappingContractHash does not match the frozen component bundle");
}

function validateChildren(manifest, contract) {
  if (!Array.isArray(manifest.children) || manifest.children.length !== 6) fail("PARTIAL_RUN", "exactly six child manifests are required");
  const domains = manifest.children.map((child) => child.domain);
  if (JSON.stringify(domains) !== JSON.stringify(contract.domainOrder)) fail("PARTIAL_RUN", "children must be ordered T0 through T5 exactly once");
  for (let index = 0; index < manifest.children.length; index += 1) {
    const child = manifest.children[index];
    assertExactKeys(child, ["domain", "runId", "status", "manifestSha256"], [], `children[${index}]`);
    const expected = `${manifest.parentRunId}-t${index}`;
    if (child.runId !== expected) fail("CHILD_IDENTITY_MISMATCH", `${child.domain} runId must be ${expected}`);
    if (!["not_started", "running", "verified", "rolled_back", "failed"].includes(child.status)) fail("MANIFEST_SCHEMA_INVALID", `${child.domain}.status invalid`);
    assertSha(child.manifestSha256, `${child.domain}.manifestSha256`);
  }
  const statuses = manifest.children.map((child) => child.status);
  if (["verified", "uat_passed"].includes(manifest.state) && statuses.some((status) => status !== "verified")) fail("PARTIAL_RUN", `${manifest.state} requires all children verified`);
  if (["rollback_verified", "cleaned"].includes(manifest.state) && statuses.some((status) => status !== "rolled_back")) fail("PARTIAL_RUN", `${manifest.state} requires all children rolled back`);
  if (!["failed", "cleanup_pending", "cleaned_failed"].includes(manifest.state) && statuses.includes("failed")) fail("PARTIAL_RUN", `state ${manifest.state} cannot contain a failed child`);
}

function validateLedger(rows, catalog) {
  if (!Array.isArray(rows) || rows.length === 0) fail("LEDGER_MISSING", "globalLedger must contain source-object rows");
  const identities = new Set();
  for (const row of rows) {
    assertExactKeys(row, ["domain", "sourceObject", "source", "loaded", "quarantined", "approvedIgnored"], ["approvedIgnoredReasonCode", "approvalAttestationSha256"], "globalLedger[]");
    const identity = `${row.domain}:${row.sourceObject}`;
    if (!Object.hasOwn({ T0: 1, T1: 1, T2: 1, T3: 1, T4: 1, T5: 1 }, row.domain) || typeof row.sourceObject !== "string" || row.sourceObject.length === 0) fail("MANIFEST_SCHEMA_INVALID", `${identity} identity invalid`);
    if (identities.has(identity)) fail("LEDGER_DUPLICATE_SOURCE_OBJECT", identity);
    identities.add(identity);
    for (const field of ["source", "loaded", "quarantined", "approvedIgnored"]) {
      if (!Number.isSafeInteger(row[field]) || row[field] < 0) fail("MANIFEST_SCHEMA_INVALID", `${identity}.${field} must be a nonnegative safe integer`);
    }
    if (row.source !== row.loaded + row.quarantined + row.approvedIgnored) fail("LEDGER_IMBALANCE", identity);
    if (row.approvedIgnored > 0) {
      if (!catalog.includes(row.approvedIgnoredReasonCode)) fail("APPROVED_IGNORED_REASON_INVALID", identity);
      assertSha(row.approvalAttestationSha256, `${identity}.approvalAttestationSha256`);
    } else if (row.approvedIgnoredReasonCode || row.approvalAttestationSha256) {
      fail("APPROVED_IGNORED_REASON_INVALID", `${identity} has approval metadata with zero approvedIgnored`);
    }
  }
}

function validateResources(resources, state, requiredTypes) {
  if (!Array.isArray(resources)) fail("MANIFEST_SCHEMA_INVALID", "resourceRegistry must be an array");
  const seen = new Set();
  const seenTypes = new Set();
  for (const resource of resources) {
    assertExactKeys(resource, ["type", "planned", "observed", "removed", "residualCount"], [], "resourceRegistry[]");
    if (!requiredTypes.includes(resource.type)) fail("RESOURCE_TYPE_INVALID", String(resource.type));
    const identity = `${resource.type}:${resource.planned}`;
    if (typeof resource.planned !== "string" || resource.planned.length === 0 || (resource.observed !== null && typeof resource.observed !== "string") || typeof resource.removed !== "boolean") fail("MANIFEST_SCHEMA_INVALID", `${identity} shape invalid`);
    if (seen.has(identity)) fail("RESOURCE_IDENTITY_DUPLICATE", identity);
    seen.add(identity);
    seenTypes.add(resource.type);
    if (!Number.isSafeInteger(resource.residualCount) || resource.residualCount < 0) fail("MANIFEST_SCHEMA_INVALID", `${identity}.residualCount invalid`);
    if (["cleaned", "cleaned_failed"].includes(state) && (!resource.removed || resource.residualCount !== 0)) fail("RESOURCE_RESIDUAL_NONZERO", identity);
  }
  for (const type of requiredTypes) if (!seenTypes.has(type)) fail("RESOURCE_TYPE_MISSING", type);
}

function validateTarget(target) {
  assertExactKeys(target, ["database", "composeProject", "volume", "postgresContainer", "apiPort", "webPort", "fileRoot", "stagingRoot", "evidenceRoot", "accountNamespace"], [], "target");
  if (!TARGET.test(target.database ?? "") || !TARGET.test(target.composeProject ?? "")) fail("UNSAFE_TARGET_IDENTITY", "database and Compose project must use full-domain lab-only identities");
  if (target.database !== target.composeProject) fail("UNSAFE_TARGET_IDENTITY", "database and Compose project must share the parent isolation identity");
  if (typeof target.volume !== "string" || !target.volume.startsWith(`${target.composeProject}_`) || typeof target.postgresContainer !== "string" || !target.postgresContainer.startsWith(`${target.composeProject}-`)) {
    fail("UNSAFE_TARGET_IDENTITY", "volume and container must be namespaced by the isolated Compose project");
  }
  if (!/^yzfull_[ab]_[a-z0-9_]{6,32}$/.test(target.accountNamespace ?? "")) fail("UNSAFE_TARGET_IDENTITY", "account namespace must be rehearsal-scoped");
  const ports = [target.apiPort, target.webPort];
  if (ports.some((port) => !Number.isInteger(port) || port < 1024 || port > 65535) || ports[0] === ports[1]) fail("UNSAFE_TARGET_IDENTITY", "API/Web ports must be distinct unprivileged ports");
  for (const field of ["fileRoot", "stagingRoot", "evidenceRoot"]) {
    const value = target[field];
    if (typeof value !== "string" || !isAbsolute(value) || resolve(value) !== value || !value.includes(`${sep}${target.composeProject}${sep}`)) fail("UNSAFE_TARGET_IDENTITY", `${field} must be a normalized absolute child of the isolated project root`);
  }
}

function validateEvidence(entries, evidenceRoot) {
  if (!Array.isArray(entries)) fail("MANIFEST_SCHEMA_INVALID", "evidence must be an array");
  if (evidenceRoot) {
    const root = realpathSync(resolve(evidenceRoot));
    const rootMode = (statSync(root).mode & 0o777).toString(8).padStart(4, "0");
    if (rootMode !== "0700") fail("UNSAFE_FILE_PERMISSION", `evidence root is ${rootMode}`);
  }
  for (const entry of entries) {
    assertExactKeys(entry, ["kind", "relativePath", "sha256", "bytes", "mode", "redacted"], [], "evidence[]");
    if (typeof entry.kind !== "string" || entry.kind.length === 0 || typeof entry.relativePath !== "string" || entry.relativePath.length === 0 || isAbsolute(entry.relativePath) || entry.relativePath.split(/[\\/]/).includes("..") || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) fail("MANIFEST_SCHEMA_INVALID", "evidence entry shape/path invalid");
    assertSha(entry.sha256, `evidence ${entry.relativePath} sha256`);
    if (entry.mode !== "0600" || entry.redacted !== true) fail("UNSAFE_FILE_PERMISSION", `${entry.relativePath} contract must be 0600 and redacted`);
    if (!evidenceRoot) continue;
    const root = realpathSync(resolve(evidenceRoot));
    const file = realpathSync(resolve(root, entry.relativePath));
    if (!file.startsWith(`${root}${sep}`)) fail("EVIDENCE_PATH_ESCAPE", entry.relativePath);
    const stat = statSync(file);
    const actualMode = (stat.mode & 0o777).toString(8).padStart(4, "0");
    if (actualMode !== "0600") fail("UNSAFE_FILE_PERMISSION", `${entry.relativePath} is ${actualMode}`);
    const bytes = readFileSync(file);
    if (bytes.length !== entry.bytes) fail("EVIDENCE_HASH_MISMATCH", `${entry.relativePath} byte count differs`);
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) fail("EVIDENCE_HASH_MISMATCH", entry.relativePath);
    if (FORBIDDEN_VALUES.test(bytes.toString("utf8"))) fail("SECRET_PATTERN_DETECTED", entry.relativePath);
    if (/\.jsonl?$/.test(entry.relativePath)) {
      const text = bytes.toString("utf8").trim();
      const rows = entry.relativePath.endsWith(".jsonl") ? text.split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [JSON.parse(text)];
      rows.forEach((row, index) => scanSensitive(row, `evidence:${entry.relativePath}[${index}]`));
    }
  }
}

function validateCanonical(canonical, contract) {
  assertExactKeys(canonical, ["normalizationVersion", "globalHash", "domainHashes", "quarantineReasonLedgerHash"], [], "canonical");
  if (canonical.normalizationVersion !== contract.canonicalNormalization.version) fail("CANONICAL_CONTRACT_MISMATCH", "normalizationVersion differs");
  assertSha(canonical.globalHash, "canonical.globalHash");
  assertSha(canonical.quarantineReasonLedgerHash, "canonical.quarantineReasonLedgerHash");
  requireObject(canonical.domainHashes, "MANIFEST_SCHEMA_INVALID", "canonical.domainHashes");
  for (const domain of contract.domainOrder) assertSha(canonical.domainHashes[domain], `canonical.domainHashes.${domain}`);
  if (Object.keys(canonical.domainHashes).sort().join(",") !== [...contract.domainOrder].sort().join(",")) fail("CANONICAL_CONTRACT_MISMATCH", "domain hash set must be exactly T0-T5");
}

function validateHardGates(hardGates, contract) {
  const required = ["t4Extraction", "technicalUat", "humanUat", "restore", "cleanup", "productionImport"];
  assertExactKeys(hardGates, required, [], "hardGates");
  for (const name of required) {
    const gate = hardGates[name];
    assertExactKeys(gate, ["status", "reasonCodes"], [], `hardGates.${name}`);
    if (!["PASS", "FAIL", "HOLD", "NOT_STARTED"].includes(gate.status) || !Array.isArray(gate.reasonCodes)) fail("MANIFEST_SCHEMA_INVALID", `hardGates.${name} invalid`);
    if (new Set(gate.reasonCodes).size !== gate.reasonCodes.length) fail("MANIFEST_SCHEMA_INVALID", `hardGates.${name}.reasonCodes must be unique`);
    for (const code of gate.reasonCodes) if (!contract.hardGateReasons.includes(code)) fail("HARD_GATE_REASON_UNKNOWN", `${name}:${code}`);
  }
  if (hardGates.productionImport.status !== "HOLD") fail("PRODUCTION_IMPORT_NOT_HOLD", "Slice 1 manifest cannot authorize production import");
}

function validateT4(t4Evidence, manifest) {
  const gateNotStarted = manifest.hardGates?.t4Extraction?.status === "NOT_STARTED";
  const evidenceNotCompleted = t4Evidence && t4Evidence.pendingExtractionEvidence?.status !== "completed";
  if (gateNotStarted || evidenceNotCompleted) {
    if (manifest.hardGates?.t4Extraction?.status !== "NOT_STARTED" || !manifest.hardGates.t4Extraction.reasonCodes?.includes("T4_EXTRACTION_NOT_STARTED")) {
      fail("T4_EXTRACTION_NOT_STARTED", "T4 source evidence is not completed and must block full rehearsal");
    }
    if (!["planned", "source_locked", "failed", "cleanup_pending", "cleaned_failed"].includes(manifest.state)) {
      fail("T4_EXTRACTION_NOT_STARTED", `state ${manifest.state} is impossible while T4 extraction is not started`);
    }
  }
}

export function verifyManifest(manifest, options = {}) {
  const contract = options.contract ?? JSON.parse(readFileSync(DEFAULT_CONTRACT, "utf8"));
  if (manifest?.manifestKind !== "yuzhou_hr_full_domain_rehearsal") {
    if (manifest?.formatVersion || manifest?.sourceSystem || manifest?.pendingExtractionEvidence) fail("LEGACY_FRAGMENT_NOT_FULL_REHEARSAL", "a domain/source fragment cannot satisfy the parent contract");
    fail("FULL_REHEARSAL_MANIFEST_MISSING", "manifestKind is missing");
  }
  scanSensitive(manifest);
  if (manifest.formatVersion !== 1) fail("MANIFEST_SCHEMA_INVALID", "formatVersion must be 1");
  assertExactKeys(manifest, ["formatVersion", "manifestKind", "parentRunId", "rehearsal", "state", "triple", "source", "target", "children", "resourceRegistry", "globalLedger", "canonical", "hardGates", "evidence", "security"], ["supersedesManifestSha256"], "$ ");
  const runMatch = RUN_ID.exec(manifest.parentRunId ?? "");
  if (!runMatch || runMatch[1] !== manifest.rehearsal) fail("MANIFEST_SCHEMA_INVALID", "parentRunId and rehearsal label do not match");
  if (!Object.hasOwn(contract.stateMachine, manifest.state)) fail("STATE_INVALID", String(manifest.state));
  if (manifest.supersedesManifestSha256 !== undefined) assertSha(manifest.supersedesManifestSha256, "supersedesManifestSha256");
  validateTriple(manifest.triple, options.expectedTriple, contract);
  assertExactKeys(manifest.source, ["system", "databaseAlias", "readOnly", "backupSha256", "catalogSha256", "tableLedgerSha256"], [], "source");
  if (manifest.source.system !== "yuzhou-v10" || !/^YuzhouHR_Lab_[A-Za-z0-9_]{6,40}$/.test(manifest.source.databaseAlias ?? "")) fail("SOURCE_IDENTITY_INVALID", "source system/database alias is outside the lab contract");
  if (manifest.source.readOnly !== true) fail("SOURCE_NOT_READ_ONLY", "source.readOnly must be true");
  for (const field of ["backupSha256", "catalogSha256", "tableLedgerSha256"]) assertSha(manifest.source[field], `source.${field}`);
  validateTarget(manifest.target);
  validateChildren(manifest, contract);
  validateLedger(manifest.globalLedger, contract.approvedIgnoredReasons.catalog);
  validateResources(manifest.resourceRegistry, manifest.state, contract.resources);
  validateCanonical(manifest.canonical, contract);
  validateHardGates(manifest.hardGates, contract);
  assertExactKeys(manifest.security, ["directoryMode", "fileMode", "containsSecrets", "redactionContractVersion"], [], "security");
  if (manifest.security.directoryMode !== "0700" || manifest.security.fileMode !== "0600" || manifest.security.containsSecrets !== false || manifest.security.redactionContractVersion !== contract.redaction.version) fail("UNSAFE_FILE_PERMISSION", "directory/file modes must be 0700/0600, manifests secret-free and redaction version pinned");
  validateEvidence(manifest.evidence, options.evidenceRoot);
  validateT4(options.t4Evidence, manifest);
  return { ok: true, parentRunId: manifest.parentRunId, state: manifest.state, productionImport: manifest.hardGates?.productionImport?.status ?? "HOLD" };
}

export function compareRehearsals(a, b) {
  verifyManifest(a);
  verifyManifest(b, { expectedTriple: a.triple });
  if (a.rehearsal !== "A" || b.rehearsal !== "B") fail("REHEARSAL_PAIR_INVALID", "pair must be ordered A then B");
  for (const field of ["database", "composeProject", "volume", "postgresContainer", "apiPort", "webPort", "fileRoot", "stagingRoot", "evidenceRoot", "accountNamespace"]) {
    if (a.target[field] === b.target[field]) fail("REHEARSAL_RESOURCE_REUSE", `${field} must be independent`);
  }
  const resourcesA = new Set(a.resourceRegistry.map((resource) => `${resource.type}:${resource.planned}`));
  for (const resource of b.resourceRegistry) {
    if (resourcesA.has(`${resource.type}:${resource.planned}`)) fail("REHEARSAL_RESOURCE_REUSE", `${resource.type}:${resource.planned} must be independent`);
  }
  for (const field of ["backupSha256", "catalogSha256", "tableLedgerSha256"]) {
    if (a.source[field] !== b.source[field]) fail("TRIPLE_MISMATCH", `source.${field} differs between rehearsals`);
  }
  if (JSON.stringify(a.globalLedger) !== JSON.stringify(b.globalLedger)) fail("REHEARSAL_LEDGER_MISMATCH", "global ledgers differ");
  if (JSON.stringify(a.canonical) !== JSON.stringify(b.canonical)) fail("REHEARSAL_CANONICAL_MISMATCH", "canonical and quarantine hashes differ");
  return { ok: true, triple: a.triple };
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function parseArgs(argv) {
  const args = { manifest: undefined, pair: undefined, t4Evidence: undefined, evidenceRoot: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--pair") args.pair = argv[++index];
    else if (token === "--t4-evidence") args.t4Evidence = argv[++index];
    else if (token === "--evidence-root") args.evidenceRoot = argv[++index];
    else if (!args.manifest) args.manifest = token;
    else fail("CLI_ARGUMENT_INVALID", token);
  }
  if (!args.manifest) fail("CLI_ARGUMENT_INVALID", "usage: verify-full-domain-contract.mjs <manifest.json> [--pair manifest-b.json] [--t4-evidence source-evidence.json] [--evidence-root directory]");
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const manifest = readJson(args.manifest);
    const options = { evidenceRoot: args.evidenceRoot, t4Evidence: args.t4Evidence ? readJson(args.t4Evidence) : undefined };
    const result = args.pair ? compareRehearsals(manifest, readJson(args.pair)) : verifyManifest(manifest, options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof ContractError ? error.code : "CONTRACT_VERIFIER_ERROR";
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
