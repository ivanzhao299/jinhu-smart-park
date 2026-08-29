#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  currentState,
  resolveVerifiedExtractBindings,
  validateConfig
} from "./full-domain-lifecycle.mjs";
import { canonicalHash } from "./materialize-reviewed-job-state.mjs";
import {
  canonicalEvidenceIndexHash,
  canonicalDecisionHash,
  verifyYuzhouJobStateDecisionArtifact
} from "./yuzhou-job-state-decision-artifact-lib.mjs";
import { computeMappingContractHash } from "./verify-full-domain-contract.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const FULL_DOMAIN_CONTRACT = resolve(ROOT, "scripts/hr-cutover/contracts/full-domain-contract-v1.json");
const SHA256 = /^[0-9a-f]{64}$/u;
const TARGET_STATUSES = new Set(["active", "probation", "suspended", "departed"]);
const QUARANTINE_REASONS = new Set([
  "AMBIGUOUS_SEMANTICS",
  "UNKNOWN_SOURCE_VALUE",
  "CONFLICTING_SOURCE_EVIDENCE",
  "UNSUPPORTED_SEMANTICS"
]);
const MAP_CLASSES = new Set(["source_exact", "target_exact", "derived_deterministic"]);
const QUARANTINE_CLASSES = new Set(["quarantined_ambiguous", "unsupported"]);
const PLAN_KEYS = ["formatVersion", "kind", "runId", "rehearsal", "decisions"];
const PLAN_DECISION_KEYS = ["sourceIdentitySha256", "decision", "targetEmploymentStatus", "semanticClassification", "reasonCode"];
const CURRENT_UID = typeof process.getuid === "function" ? process.getuid() : null;

export class YuzhouJobStateReviewPackageError extends Error {
  constructor(code) {
    super(code);
    this.name = "YuzhouJobStateReviewPackageError";
    this.code = code;
  }
}

const fail = code => { throw new YuzhouJobStateReviewPackageError(code); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const mode = info => (info.mode & 0o777).toString(8).padStart(4, "0");
const plainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const canonicalPretty = value => `${JSON.stringify(value, null, 2)}\n`;

function exactKeys(value, keys, code) {
  if (!plainObject(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code);
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function privateDirectorySnapshot(directoryPath, code) {
  const candidate = resolve(directoryPath);
  try {
    if (realpathSync(candidate) !== candidate) fail(code);
    const info = lstatSync(candidate);
    if (!info.isDirectory() || info.isSymbolicLink() || mode(info) !== "0700"
      || (CURRENT_UID !== null && info.uid !== CURRENT_UID)) fail(code);
    return { path: candidate, info };
  } catch (error) {
    if (error?.code === code) throw error;
    fail(code);
  }
}

function safeRegularBytes(inputPath, code) {
  const candidate = resolve(inputPath);
  let fd, beforeFile, beforeParent;
  try {
    beforeParent = privateDirectorySnapshot(dirname(candidate), code);
    if (realpathSync(candidate) !== candidate) fail(code);
    beforeFile = lstatSync(candidate);
    if (!beforeFile.isFile() || beforeFile.isSymbolicLink() || mode(beforeFile) !== "0600"
      || beforeFile.nlink !== 1 || (CURRENT_UID !== null && beforeFile.uid !== CURRENT_UID)) fail(code);
    fd = openSync(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = fstatSync(fd);
    if (!info.isFile() || mode(info) !== "0600" || info.nlink !== 1
      || (CURRENT_UID !== null && info.uid !== CURRENT_UID) || !sameIdentity(beforeFile, info)) fail(code);
    const bytes = readFileSync(fd);
    const afterFile = lstatSync(candidate), afterParent = privateDirectorySnapshot(dirname(candidate), code);
    if (!sameIdentity(info, afterFile) || !sameIdentity(beforeParent.info, afterParent.info)
      || realpathSync(candidate) !== candidate) fail(code);
    return bytes;
  } catch (error) {
    if (error?.code === code) throw error;
    fail(code);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function safeJson(inputPath, code) {
  try { return JSON.parse(safeRegularBytes(inputPath, code)); }
  catch (error) {
    if (error?.code === code) throw error;
    fail(code);
  }
}

function safeDirectory(directoryPath, code) {
  return privateDirectorySnapshot(directoryPath, code).path;
}

function exclusivePrivateWrite(outputPath, value, faultHook = () => {}) {
  const candidate = resolve(outputPath);
  const parent = privateDirectorySnapshot(dirname(candidate), "YUZHOU_JOB_STATE_DRAFT_OUTPUT_PARENT_UNSAFE");
  if (existsSync(candidate)) fail("YUZHOU_JOB_STATE_DRAFT_OUTPUT_EXISTS");
  const bytes = Buffer.from(canonicalPretty(value));
  let fd, parentFd, createdIdentity;
  try {
    parentFd = openSync(parent.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const openedParent = fstatSync(parentFd);
    if (!openedParent.isDirectory() || !sameIdentity(parent.info, openedParent)) {
      fail("YUZHOU_JOB_STATE_DRAFT_OUTPUT_PARENT_UNSAFE");
    }
    fd = openSync(candidate, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const info = fstatSync(fd);
    createdIdentity = info;
    if (!info.isFile() || info.nlink !== 1 || (CURRENT_UID !== null && info.uid !== CURRENT_UID)) {
      fail("YUZHOU_JOB_STATE_DRAFT_OUTPUT_UNSAFE");
    }
    writeFileSync(fd, bytes);
    fchmodSync(fd, 0o600);
    fsyncSync(fd);
    faultHook({ outputPath: candidate, createdIdentity: { dev: createdIdentity.dev, ino: createdIdentity.ino } });
    const finalFd = fstatSync(fd), finalPath = lstatSync(candidate);
    const afterParent = privateDirectorySnapshot(parent.path, "YUZHOU_JOB_STATE_DRAFT_OUTPUT_PARENT_UNSAFE");
    if (mode(finalFd) !== "0600" || !sameIdentity(createdIdentity, finalFd)
      || !sameIdentity(finalFd, finalPath) || !sameIdentity(parent.info, afterParent.info)
      || !sameIdentity(parent.info, fstatSync(parentFd))) {
      fail("YUZHOU_JOB_STATE_DRAFT_OUTPUT_UNSAFE");
    }
    fsyncSync(parentFd);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    fd = undefined;
    if (error?.code?.startsWith?.("YUZHOU_")) throw error;
    fail(error?.code === "EEXIST" ? "YUZHOU_JOB_STATE_DRAFT_OUTPUT_EXISTS" : "YUZHOU_JOB_STATE_DRAFT_OUTPUT_UNSAFE");
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (parentFd !== undefined) closeSync(parentFd);
  }
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

function configBindingSha256(config) {
  return sha256(canonicalPretty({ runId: config.runId, triple: config.triple, target: config.target }));
}

function validatePlan(plan, config) {
  exactKeys(plan, PLAN_KEYS, "YUZHOU_JOB_STATE_DECISION_PLAN_INVALID");
  if (plan.formatVersion !== 2 || plan.kind !== "yuzhou-job-state-machine-decision-plan"
    || plan.runId !== config.runId || plan.rehearsal !== config.rehearsal
    || !Array.isArray(plan.decisions) || plan.decisions.length !== 7) {
    fail("YUZHOU_JOB_STATE_DECISION_PLAN_INVALID");
  }
  const identities = new Set();
  for (const item of plan.decisions) {
    exactKeys(item, PLAN_DECISION_KEYS, "YUZHOU_JOB_STATE_DECISION_PLAN_INVALID");
    if (!SHA256.test(item.sourceIdentitySha256 ?? "") || identities.has(item.sourceIdentitySha256)) {
      fail("YUZHOU_JOB_STATE_DECISION_PLAN_INVALID");
    }
    identities.add(item.sourceIdentitySha256);
    if (item.decision === "map") {
      if (!TARGET_STATUSES.has(item.targetEmploymentStatus) || item.reasonCode !== "DETERMINISTIC_MAPPING"
        || !MAP_CLASSES.has(item.semanticClassification)) {
        fail("YUZHOU_JOB_STATE_DECISION_PLAN_INVALID");
      }
    } else if (item.decision === "quarantine") {
      if (item.targetEmploymentStatus !== null || !QUARANTINE_REASONS.has(item.reasonCode)
        || !QUARANTINE_CLASSES.has(item.semanticClassification)) {
        fail("YUZHOU_JOB_STATE_DECISION_PLAN_INVALID");
      }
    } else fail("YUZHOU_JOB_STATE_DECISION_PLAN_INVALID");
  }
  const ordered = [...identities].sort();
  if (JSON.stringify(plan.decisions.map(item => item.sourceIdentitySha256)) !== JSON.stringify(ordered)) {
    fail("YUZHOU_JOB_STATE_DECISION_PLAN_INVALID");
  }
  return new Map(plan.decisions.map(item => [item.sourceIdentitySha256, item]));
}

function validateCheckpoint(checkpoint, config, manifestSha256, bindingSha256, journalSha256) {
  exactKeys(checkpoint, ["formatVersion", "status", "triple", "runs", "productionImport"], "YUZHOU_JOB_STATE_CHECKPOINT_INVALID");
  if (checkpoint.formatVersion !== 1 || checkpoint.status !== "REVIEW_HOLD"
    || checkpoint.productionImport !== "HOLD"
    || JSON.stringify(checkpoint.triple) !== JSON.stringify(config.triple)
    || !Array.isArray(checkpoint.runs) || checkpoint.runs.length !== 2) {
    fail("YUZHOU_JOB_STATE_CHECKPOINT_INVALID");
  }
  const runKeys = ["rehearsal", "runId", "configSha256", "state", "t0ExtractManifestSha256", "t0ExtractBindingSha256", "journalSha256"];
  for (const row of checkpoint.runs) {
    exactKeys(row, runKeys, "YUZHOU_JOB_STATE_CHECKPOINT_INVALID");
    if (!new Set(["A", "B"]).has(row.rehearsal)
      || !new RegExp(`^yzfull-[0-9]{8}T[0-9]{6}Z-${checkpoint.triple.codeSha.slice(0, 8)}-r${row.rehearsal}$`, "u").test(row.runId ?? "")
      || row.state !== "review_hold" || [row.configSha256, row.t0ExtractManifestSha256, row.t0ExtractBindingSha256, row.journalSha256].some(value => !SHA256.test(value ?? ""))) {
      fail("YUZHOU_JOB_STATE_CHECKPOINT_INVALID");
    }
  }
  if (JSON.stringify(checkpoint.runs.map(row => row.rehearsal).sort()) !== JSON.stringify(["A", "B"])
    || new Set(checkpoint.runs.flatMap(row => [row.runId, row.configSha256, row.journalSha256])).size !== 6) {
    fail("YUZHOU_JOB_STATE_CHECKPOINT_INVALID");
  }
  const matches = checkpoint.runs.filter(row => row?.rehearsal === config.rehearsal && row.runId === config.runId);
  if (matches.length !== 1) fail("YUZHOU_JOB_STATE_CHECKPOINT_INVALID");
  const row = matches[0];
  if (row.state !== "review_hold" || row.configSha256 !== configBindingSha256(config)
    || row.t0ExtractManifestSha256 !== manifestSha256
    || row.t0ExtractBindingSha256 !== bindingSha256
    || row.journalSha256 !== journalSha256) fail("YUZHOU_JOB_STATE_CHECKPOINT_DRIFT");
}

function loadT0Context(config, checkpoint, checkpointSha256, dependencies) {
  if (config.backend !== "lab" || dependencies.currentStateFn(config) !== "review_hold") {
    fail("YUZHOU_JOB_STATE_REVIEW_HOLD_REQUIRED");
  }
  const verifiedEnv = dependencies.resolveBindingsFn(config, "T0");
  const extractBindingSha256 = sha256(`${JSON.stringify(verifiedEnv)}\n`);
  const staging = safeDirectory(join(config.target.stagingRoot, `staging-${config.runId}-t0`), "YUZHOU_JOB_STATE_T0_UNSAFE");
  const manifestPath = join(staging, "manifest.json");
  const statesPath = join(staging, "employee-job-states.raw.json");
  const metadataPath = join(staging, "job-state-code-metadata.raw.json");
  const codesPath = join(staging, "job-state-codes.raw.json");
  const manifestBytes = safeRegularBytes(manifestPath, "YUZHOU_JOB_STATE_T0_UNSAFE");
  const statesBytes = safeRegularBytes(statesPath, "YUZHOU_JOB_STATE_T0_UNSAFE");
  const metadataBytes = safeRegularBytes(metadataPath, "YUZHOU_JOB_STATE_T0_UNSAFE");
  const codesBytes = safeRegularBytes(codesPath, "YUZHOU_JOB_STATE_T0_UNSAFE");
  let manifest, states, metadata, codes;
  try { manifest = JSON.parse(manifestBytes); states = JSON.parse(statesBytes); metadata = JSON.parse(metadataBytes); codes = JSON.parse(codesBytes); }
  catch { fail("YUZHOU_JOB_STATE_T0_INVALID"); }
  const employeeSha = sha256(statesBytes), metadataSha = sha256(metadataBytes), codesSha = sha256(codesBytes), manifestSha = sha256(manifestBytes);
  if (manifest?.domains?.employeeJobStates?.file !== "employee-job-states.raw.json"
    || manifest.domains.employeeJobStates.fileSha256 !== employeeSha
    || manifest?.domains?.jobStateCodeMetadata?.file !== "job-state-code-metadata.raw.json"
    || manifest.domains.jobStateCodeMetadata.fileSha256 !== metadataSha
    || manifest?.domains?.jobStateCodes?.file !== "job-state-codes.raw.json"
    || manifest.domains.jobStateCodes.fileSha256 !== codesSha) fail("YUZHOU_JOB_STATE_T0_DRIFT");
  const journalBytes = safeRegularBytes(join(config.target.evidenceRoot, "lifecycle-journal.jsonl"), "YUZHOU_JOB_STATE_JOURNAL_UNSAFE");
  validateCheckpoint(checkpoint, config, manifestSha, extractBindingSha256, sha256(journalBytes));
  if (!Array.isArray(states) || states.length !== 7 || !Array.isArray(metadata)
    || !Array.isArray(codes) || codes.length !== 8
    || manifest.domains.employeeJobStates.rows !== states.length
    || manifest.domains.jobStateCodeMetadata.rows !== metadata.length
    || manifest.domains.jobStateCodes.rows !== codes.length) fail("YUZHOU_JOB_STATE_T0_INVALID");
  const dictionaryByCode = new Map();
  for (const row of codes) {
    exactKeys(row, ["sourceCode", "sourceName", "sortOrder", "isEnabled", "defaultCount"], "YUZHOU_JOB_STATE_T0_INVALID");
    const sourceCode = String(row.sourceCode ?? "").trim(), sourceName = String(row.sourceName ?? "").trim(), normalized = sourceCode.toLowerCase();
    if (!sourceCode || !sourceName || dictionaryByCode.has(normalized)
      || !Number.isSafeInteger(row.sortOrder) || !Number.isSafeInteger(row.isEnabled) || !Number.isSafeInteger(row.defaultCount)) {
      fail("YUZHOU_JOB_STATE_T0_INVALID");
    }
    dictionaryByCode.set(normalized, { ...row, sourceCode, sourceName });
  }
  const rows = [], identities = new Set(), normalizedCodes = new Set();
  let sourceRecordCount = 0;
  for (const row of states) {
    exactKeys(row, ["sourceCode", "usageCount"], "YUZHOU_JOB_STATE_T0_INVALID");
    const sourceCode = String(row.sourceCode ?? "").trim(), normalized = sourceCode.toLowerCase();
    const dictionaryRow = dictionaryByCode.get(normalized);
    if (!sourceCode || normalizedCodes.has(normalized) || !Number.isSafeInteger(row.usageCount) || row.usageCount < 1 || !dictionaryRow) {
      fail("YUZHOU_JOB_STATE_T0_INVALID");
    }
    normalizedCodes.add(normalized);
    const sourceIdentitySha256 = sha256(`dbo.person.jobstate\u0000${normalized}`);
    if (identities.has(sourceIdentitySha256)) fail("YUZHOU_JOB_STATE_T0_INVALID");
    identities.add(sourceIdentitySha256);
    rows.push({
      sourceIdentitySha256,
      sourceRowSha256: canonicalHash({ sourceCode, usageCount: row.usageCount, dictionaryRowSha256: canonicalHash(dictionaryRow) }),
      observedRecordCount: row.usageCount
    });
    sourceRecordCount += row.usageCount;
  }
  if (sourceRecordCount !== 2949) fail("YUZHOU_JOB_STATE_T0_COUNT_MISMATCH");
  rows.sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
  const sourceSnapshotSha256 = canonicalHash({
    employeeJobStatesSha256: employeeSha,
    jobStateCodeMetadataSha256: metadataSha,
    jobStateCodesSha256: codesSha,
    sourceDictionaryRowCount: codes.length,
    sourceDistinctStateCount: 7,
    sourceRecordCount
  });
  return {
    rows, sourceRecordCount, sourceSnapshotSha256,
    evidenceIndex: {
      checkpointSha256,
      manifestSha256: manifestSha,
      extractBindingSha256,
      journalSha256: sha256(journalBytes),
      employeeJobStatesSha256: employeeSha,
      jobStateCodeMetadataSha256: metadataSha,
      jobStateCodesSha256: codesSha
    }
  };
}

const defaultDependencies = {
  validateConfigFn: validateConfig,
  currentStateFn: currentState,
  resolveBindingsFn: resolveVerifiedExtractBindings,
  currentCodeShaFn: () => {
    const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    return result.status === 0 ? result.stdout.trim() : null;
  },
  currentMappingHashFn: () => computeMappingContractHash(JSON.parse(readFileSync(FULL_DOMAIN_CONTRACT, "utf8"))),
  worktreeCleanFn: () => {
    const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    return result.status === 0 && result.stdout === "";
  },
  outputFaultHook: () => {}
};

function loadGovernedContext({ configPath, checkpointPath }, dependencies) {
  const rawConfig = safeJson(configPath, "YUZHOU_JOB_STATE_CONFIG_UNSAFE");
  const config = dependencies.validateConfigFn(structuredClone(rawConfig));
  if (config.triple?.codeSha !== dependencies.currentCodeShaFn()
    || config.triple?.mappingContractHash !== dependencies.currentMappingHashFn()) {
    fail("YUZHOU_JOB_STATE_TRIPLE_CURRENT_DRIFT");
  }
  if (dependencies.worktreeCleanFn() !== true) fail("YUZHOU_JOB_STATE_WORKTREE_DIRTY");
  const checkpointBytes = safeRegularBytes(checkpointPath, "YUZHOU_JOB_STATE_CHECKPOINT_UNSAFE");
  let checkpoint;
  try { checkpoint = JSON.parse(checkpointBytes); } catch { fail("YUZHOU_JOB_STATE_CHECKPOINT_INVALID"); }
  const checkpointRootSha256 = sha256(checkpointBytes);
  const t0 = loadT0Context(config, checkpoint, checkpointRootSha256, dependencies);
  return { config, t0, checkpointRootSha256 };
}

function assertMachineCandidateMatchesContext(artifact, config, t0, checkpointRootSha256) {
  const result = verifyYuzhouJobStateDecisionArtifact(artifact);
  if (result.status !== "MACHINE_CANDIDATE" || result.productionImport !== "HOLD"
    || artifact.checkpointRootSha256 !== checkpointRootSha256
    || artifact.evidenceIndexSha256 !== canonicalEvidenceIndexHash(t0.evidenceIndex)
    || artifact.sourceContract.sourceSnapshotSha256 !== t0.sourceSnapshotSha256
    || artifact.sourceContract.sourceRecordCount !== 2949
    || artifact.scopeBinding.tenantIdentitySha256 !== sha256("tenant\u000010000001")
    || artifact.scopeBinding.parkIdentitySha256 !== sha256("park\u000020000001")) {
    fail("YUZHOU_JOB_STATE_MACHINE_PACKAGE_CONTEXT_DRIFT");
  }
  const expected = new Map(t0.rows.map(row => [row.sourceIdentitySha256, row]));
  for (const decision of artifact.decisions) {
    const row = expected.get(decision.sourceIdentitySha256);
    if (!row || row.sourceRowSha256 !== decision.sourceRowSha256
      || row.observedRecordCount !== decision.observedRecordCount) fail("YUZHOU_JOB_STATE_MACHINE_PACKAGE_CONTEXT_DRIFT");
    expected.delete(decision.sourceIdentitySha256);
  }
  if (expected.size !== 0 || config.backend !== "lab") fail("YUZHOU_JOB_STATE_MACHINE_PACKAGE_CONTEXT_DRIFT");
  return result;
}

export function buildMachineCandidate(options, injected = {}) {
  const dependencies = { ...defaultDependencies, ...injected };
  const { config, t0, checkpointRootSha256 } = loadGovernedContext(options, dependencies);
  if (!SHA256.test(options.expectedCheckpointRootSha256 ?? "")
    || options.expectedCheckpointRootSha256 !== checkpointRootSha256) fail("YUZHOU_JOB_STATE_TRUSTED_ROOT_MISMATCH");
  const plan = safeJson(options.decisionPlanPath, "YUZHOU_JOB_STATE_DECISION_PLAN_UNSAFE");
  const decisionsByIdentity = validatePlan(plan, config);
  const decisions = t0.rows.map(row => {
    const choice = decisionsByIdentity.get(row.sourceIdentitySha256);
    if (!choice) fail("YUZHOU_JOB_STATE_DECISION_PLAN_COVERAGE_MISMATCH");
    decisionsByIdentity.delete(row.sourceIdentitySha256);
    return { ...row, decision: choice.decision, targetEmploymentStatus: choice.targetEmploymentStatus, semanticClassification: choice.semanticClassification, reasonCode: choice.reasonCode };
  });
  if (decisionsByIdentity.size !== 0) fail("YUZHOU_JOB_STATE_DECISION_PLAN_COVERAGE_MISMATCH");
  const artifact = {
    formatVersion: 2,
    artifactKind: "yuzhou_employee_job_state_machine_decision",
    artifactVersion: "v2",
    artifactStatus: "MACHINE_CANDIDATE",
    triple: config.triple,
    expectedCheckpointRootSha256: options.expectedCheckpointRootSha256,
    checkpointRootSha256,
    evidenceIndex: t0.evidenceIndex,
    evidenceIndexSha256: canonicalEvidenceIndexHash(t0.evidenceIndex),
    scopeBinding: {
      tenantIdentitySha256: sha256("tenant\u000010000001"),
      parkIdentitySha256: sha256("park\u000020000001")
    },
    sourceContract: {
      sourceSystem: "yuzhou-v10",
      dictionaryCode: "employee_job_state",
      sourceSnapshotSha256: t0.sourceSnapshotSha256,
      sourceDistinctStateCount: 7,
      sourceRecordCount: t0.sourceRecordCount
    },
    decisions,
    semanticLedger: {
      sourceDistinctStateCount: 7,
      sourceRecordCount: t0.sourceRecordCount,
      mappedStateCount: decisions.filter(item => item.decision === "map").length,
      quarantinedStateCount: decisions.filter(item => item.decision === "quarantine").length,
      mappedRecordCount: decisions.filter(item => item.decision === "map").reduce((sum, item) => sum + item.observedRecordCount, 0),
      quarantinedRecordCount: decisions.filter(item => item.decision === "quarantine").reduce((sum, item) => sum + item.observedRecordCount, 0),
      conservationVerified: true
    },
    canonicalDecisionSha256: "",
    machineAssertion: {
      mode: "trusted_root_deterministic_machine_semantics",
      policyVersion: "yuzhou-job-state-machine-policy-v2",
      status: "PASS",
      reasonCodes: [],
      humanSignature: false,
      humanIdentityAsserted: false
    },
    productionImport: "HOLD"
  };
  artifact.canonicalDecisionSha256 = canonicalDecisionHash(artifact);
  const result = assertMachineCandidateMatchesContext(artifact, config, t0, checkpointRootSha256);
  const output = exclusivePrivateWrite(options.outputPath, artifact, dependencies.outputFaultHook);
  return {
    status: result.status,
    canonicalDecisionSha256: result.canonicalDecisionSha256,
    artifactSha256: output.sha256,
    machineAssertion: result.machineAssertion,
    productionImport: result.productionImport
  };
}

export function verifyMachineCandidate(options, injected = {}) {
  const dependencies = { ...defaultDependencies, ...injected };
  const { config, t0, checkpointRootSha256 } = loadGovernedContext(options, dependencies);
  const artifactBytes = safeRegularBytes(options.artifactPath, "YUZHOU_JOB_STATE_DRAFT_UNSAFE");
  let artifact;
  try { artifact = JSON.parse(artifactBytes); } catch { fail("YUZHOU_JOB_STATE_DRAFT_INVALID"); }
  if (options.expectedCheckpointRootSha256 !== checkpointRootSha256) fail("YUZHOU_JOB_STATE_TRUSTED_ROOT_MISMATCH");
  const result = assertMachineCandidateMatchesContext(artifact, config, t0, checkpointRootSha256);
  return {
    status: result.status,
    canonicalDecisionSha256: result.canonicalDecisionSha256,
    artifactSha256: sha256(artifactBytes),
    machineAssertion: result.machineAssertion,
    productionImport: result.productionImport
  };
}

function parseArgs(argv) {
  const command = argv[0], values = {};
  if (!new Set(["build-machine-package", "verify-machine-package"]).has(command)) fail("YUZHOU_JOB_STATE_BUILDER_ARGUMENT_INVALID");
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--") || Object.hasOwn(values, key)) {
      fail("YUZHOU_JOB_STATE_BUILDER_ARGUMENT_INVALID");
    }
    values[key] = value;
  }
  const common = { configPath: values["--config"], checkpointPath: values["--checkpoint"], expectedCheckpointRootSha256: values["--expected-checkpoint-root-sha256"] };
  if (!common.configPath || !common.checkpointPath) fail("YUZHOU_JOB_STATE_BUILDER_ARGUMENT_INVALID");
  if (!common.expectedCheckpointRootSha256) fail("YUZHOU_JOB_STATE_BUILDER_ARGUMENT_INVALID");
  if (command === "build-machine-package" && Object.keys(values).length === 5 && values["--decision-plan"] && values["--output"]) {
    return { command, options: { ...common, decisionPlanPath: values["--decision-plan"], outputPath: values["--output"] } };
  }
  if (command === "verify-machine-package" && Object.keys(values).length === 4 && values["--artifact"]) {
    return { command, options: { ...common, artifactPath: values["--artifact"] } };
  }
  fail("YUZHOU_JOB_STATE_BUILDER_ARGUMENT_INVALID");
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const result = command === "build-machine-package" ? buildMachineCandidate(options) : verifyMachineCandidate(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  try { main(); }
  catch (error) {
    process.stderr.write(`${error?.code?.startsWith?.("YUZHOU_") ? error.code : "YUZHOU_JOB_STATE_BUILDER_FAILED"}\n`);
    process.exitCode = 1;
  }
}
