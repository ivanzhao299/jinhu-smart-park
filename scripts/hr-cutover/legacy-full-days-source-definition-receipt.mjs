#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeLegacyRoutineSource } from "./legacy-routine-logic-ledger.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const ROUTINE_ID = "RULE-BD491199DA9913BE";
const RETURN_SIGNATURE_SHA256 = "1f8ddbb4f0b15431b870be501af314a4e6ba9c9d5405d0c169e5c184fc9e08a2";
const SOURCE_MANIFEST_PATH = ".trellis/tasks/08-19-yuzhou-hr-compatibility-migration-env/research/generated/legacy-manifest.json";
const ROUTINE_LEDGER_PATH = "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json";
const CONTRACT_PATH = "scripts/hr-cutover/contracts/legacy-full-days-source-definition-receipt-v1.json";
const RESOLVED_GAPS = [
  "FULL_DAYS_SOURCE_BODY_NOT_COMMITTED",
  "FULL_DAYS_RETURN_TYPE_UNIT_AND_PRECISION_UNAVAILABLE",
];
const RESIDUAL_GAPS = [
  "FULL_DAYS_RETURN_UNIT_UNPROVEN",
  "FULL_DAYS_NULL_AND_NO_DATA_SEMANTICS_UNPROVEN",
  "FULL_DAYS_PERSON_IDENTITY_AND_TABLE_RESOLUTION_UNPROVEN",
  "FULL_DAYS_TIMEKEEPTABLE_COLUMNS_PREDICATES_AND_AGGREGATION_UNAVAILABLE",
  "FULL_DAYS_CROSS_MONTH_BOUNDARY_SEMANTICS_UNPROVEN",
  "FULL_DAYS_MODERN_FIXED_WORK_WINDOW_NOT_SCHEDULE_DRIVEN",
  "FULL_DAYS_BOUNDED_SYNTHETIC_PARITY_ORACLE_UNAVAILABLE",
];

export class LegacyFullDaysSourceDefinitionReceiptError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyFullDaysSourceDefinitionReceiptError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyFullDaysSourceDefinitionReceiptError(code, detail); };
const digest = value => createHash("sha256").update(value).digest("hex");
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function readRepositoryEvidence(repositoryRoot, evidence, expectedPath, label) {
  if (!object(evidence) || evidence.path !== expectedPath || !SHA256.test(evidence.sha256 ?? "")) {
    fail("FULL_DAYS_SOURCE_DEFINITION_CONTRACT_INVALID", label);
  }
  const bytes = readFileSync(resolve(repositoryRoot, expectedPath));
  if (digest(bytes) !== evidence.sha256) fail("FULL_DAYS_SOURCE_DEFINITION_EVIDENCE_DRIFT", label);
  return JSON.parse(bytes.toString("utf8"));
}

function readControlledDefinition(sourceDefinitionPath) {
  if (!isAbsolute(sourceDefinitionPath ?? "")) {
    fail("FULL_DAYS_SOURCE_DEFINITION_PATH_INVALID", "absolute regular file required");
  }
  let realPath;
  try {
    realPath = realpathSync(sourceDefinitionPath);
  } catch {
    fail("FULL_DAYS_SOURCE_DEFINITION_MISSING", "controlled source definition");
  }
  if (lstatSync(sourceDefinitionPath).isSymbolicLink() || !statSync(realPath).isFile()) {
    fail("FULL_DAYS_SOURCE_DEFINITION_PATH_INVALID", "plain regular file required");
  }
  return readFileSync(realPath);
}

function classifyReturn(sourceType) {
  const normalized = sourceType.replace(/\s+/gu, " ").trim().toLowerCase();
  if (["int", "integer"].includes(normalized)) return "signed_32_bit_whole_number_scalar";
  fail("FULL_DAYS_SOURCE_DEFINITION_RETURN_UNSUPPORTED", "return semantic class");
}

export function analyzeLegacyFullDaysSourceDefinition(sourceBytes, routineNames = []) {
  const source = Buffer.isBuffer(sourceBytes) ? sourceBytes : Buffer.from(sourceBytes);
  const text = source.toString("utf8").replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const identity = text.match(/\bcreate\s+function\s+(?:\[?dbo\]?\.)?\[?([\p{L}\p{N}_]+)\]?/iu);
  if (!identity || identity[1].toLowerCase() !== "fulldays") {
    fail("FULL_DAYS_SOURCE_DEFINITION_IDENTITY_INVALID", "routine identity");
  }
  const returnMatch = text.match(/\breturns\s+([a-z]+(?:\s*\([^)]*\))?)/iu);
  if (!returnMatch) fail("FULL_DAYS_SOURCE_DEFINITION_RETURN_MISSING", "return signature");
  const returnType = returnMatch[1].replace(/\s+/gu, " ").trim().toLowerCase();
  const returnShape = classifyReturn(returnType);
  const analysis = analyzeLegacyRoutineSource(text, routineNames);
  const inputParameterSetSha256 = digest(canonical(analysis.parameters));
  const directReadDependencySetSha256 = digest(canonical([...analysis.readTables].sort()));
  const directCalledRoutineSetSha256 = digest(canonical([...analysis.calledRoutines].sort()));
  const returnSignatureSha256 = digest(canonical([{ ordinal: 0, sourceType: returnType, semanticClass: returnShape }]));
  return {
    sourceArtifactSha256: digest(source),
    byteCount: source.byteLength,
    lineCount: text.length === 0 ? 0 : (text.match(/\n/gu) ?? []).length + 1,
    inputParameterCount: analysis.parameters.length,
    inputParameterSetSha256,
    returnSignatureSha256,
    directReadDependencyCount: analysis.readTables.length,
    directReadDependencySetSha256,
    directCalledRoutineCount: analysis.calledRoutines.length,
    directCalledRoutineSetSha256,
    directWriteDependencyCount: analysis.writeTables.length,
    dynamicWriteDependencyCount: analysis.dynamicWriteTables.length,
    dynamicMutationStatus: analysis.dynamicMutationStatus,
    statementProfile: structuredClone(analysis.statementProfile),
    routineShape: "read_only_scalar_function",
    returnShape,
  };
}

export function validateLegacyFullDaysSourceDefinitionContract(contract, repositoryRoot) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_full_days_source_definition_receipt"
    || contract.routineId !== ROUTINE_ID
    || contract.decision !== "SOURCE_DEFINITION_VERIFIED_SEMANTIC_PARITY_PENDING"
    || contract.compatibilityCredit !== 0
    || contract.sourceDefinitionIncluded !== false
    || contract.parameterNamesIncluded !== false
    || contract.dependencyNamesIncluded !== false
    || contract.containsPersonalData !== false
    || contract.productionImport !== "HOLD"
    || !same(contract.semanticClassification, {
      routineShape: "read_only_scalar_function",
      primaryDomain: "attendance_leave",
      capability: "derived_value_helper",
      returnShape: "signed_32_bit_whole_number_scalar",
      sourceControl: "controlled_archive_hash_verified_body_not_committed",
    })
    || !same(contract.resolution, { resolvedGapCodes: RESOLVED_GAPS, residualGapCodes: RESIDUAL_GAPS })) {
    fail("FULL_DAYS_SOURCE_DEFINITION_CONTRACT_INVALID", "identity or safety boundary");
  }
  const manifest = readRepositoryEvidence(repositoryRoot, contract.sourceEvidence?.sourceManifest, SOURCE_MANIFEST_PATH, "source manifest");
  const ledger = readRepositoryEvidence(repositoryRoot, contract.sourceEvidence?.routineLedger, ROUTINE_LEDGER_PATH, "routine ledger");
  const expected = contract.expectedDefinition;
  if (!object(expected)
    || !SHA256.test(expected.sourceArtifactSha256 ?? "")
    || !SHA256.test(expected.structuralHash ?? "")
    || !SHA256.test(expected.inputParameterSetSha256 ?? "")
    || !SHA256.test(expected.returnSignatureSha256 ?? "")
    || !SHA256.test(expected.directReadDependencySetSha256 ?? "")
    || !SHA256.test(expected.directCalledRoutineSetSha256 ?? "")
    || expected.returnSignatureSha256 !== RETURN_SIGNATURE_SHA256) {
    fail("FULL_DAYS_SOURCE_DEFINITION_CONTRACT_INVALID", "definition hashes");
  }
  const artifacts = manifest.files?.filter(item => item.sha256 === expected.sourceArtifactSha256 && item.kind === "function-source") ?? [];
  const routine = ledger.routines?.find(item => item.routineId === ROUTINE_ID);
  if (artifacts.length !== 1
    || artifacts[0].bytes !== expected.byteCount
    || artifacts[0].text?.lines !== expected.lineCount
    || ledger.summary?.sourceRoutines !== 212
    || !routine
    || routine.sourceArtifactSha256 !== expected.sourceArtifactSha256
    || routine.structuralHash !== expected.structuralHash
    || routine.parameters?.length !== expected.inputParameterCount
    || digest(canonical(routine.parameters)) !== expected.inputParameterSetSha256
    || routine.readTables?.length !== expected.directReadDependencyCount
    || digest(canonical([...routine.readTables].sort())) !== expected.directReadDependencySetSha256
    || routine.calledRoutines?.length !== expected.directCalledRoutineCount
    || digest(canonical([...routine.calledRoutines].sort())) !== expected.directCalledRoutineSetSha256
    || routine.writeTables?.length !== expected.directWriteDependencyCount
    || routine.dynamicWriteTables?.length !== expected.dynamicWriteDependencyCount
    || routine.dynamicMutationStatus !== "none"
    || !same(routine.statementProfile, { select: 1, insert: 0, update: 0, delete: 0, merge: 0, alter: 0 })
    || routine.primaryDomain !== contract.semanticClassification.primaryDomain
    || routine.businessCapability !== contract.semanticClassification.capability) {
    fail("FULL_DAYS_SOURCE_DEFINITION_EVIDENCE_DRIFT", "manifest or routine ledger");
  }
  return { expected: structuredClone(expected), routineNames: ledger.routines.map(item => item.sourceName) };
}

export function buildLegacyFullDaysSourceDefinitionReceipt({ contract, repositoryRoot, sourceDefinitionPath }) {
  const { expected, routineNames } = validateLegacyFullDaysSourceDefinitionContract(contract, repositoryRoot);
  const observed = analyzeLegacyFullDaysSourceDefinition(readControlledDefinition(sourceDefinitionPath), routineNames);
  const comparable = {
    sourceArtifactSha256: observed.sourceArtifactSha256,
    byteCount: observed.byteCount,
    lineCount: observed.lineCount,
    inputParameterCount: observed.inputParameterCount,
    inputParameterSetSha256: observed.inputParameterSetSha256,
    returnSignatureSha256: observed.returnSignatureSha256,
    directReadDependencyCount: observed.directReadDependencyCount,
    directReadDependencySetSha256: observed.directReadDependencySetSha256,
    directCalledRoutineCount: observed.directCalledRoutineCount,
    directCalledRoutineSetSha256: observed.directCalledRoutineSetSha256,
    directWriteDependencyCount: observed.directWriteDependencyCount,
    dynamicWriteDependencyCount: observed.dynamicWriteDependencyCount,
  };
  const expectedComparable = { ...expected };
  delete expectedComparable.structuralHash;
  if (!same(comparable, expectedComparable)
    || observed.dynamicMutationStatus !== "none"
    || !same(observed.statementProfile, { select: 1, insert: 0, update: 0, delete: 0, merge: 0, alter: 0 })
    || observed.routineShape !== contract.semanticClassification.routineShape
    || observed.returnShape !== contract.semanticClassification.returnShape) {
    fail("FULL_DAYS_SOURCE_DEFINITION_MISMATCH", "controlled definition does not match receipt contract");
  }
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_full_days_source_definition_receipt",
    routineId: contract.routineId,
    sourceManifestSha256: contract.sourceEvidence.sourceManifest.sha256,
    routineLedgerSha256: contract.sourceEvidence.routineLedger.sha256,
    sourceArtifactSha256: observed.sourceArtifactSha256,
    structuralHash: expected.structuralHash,
    byteCount: observed.byteCount,
    lineCount: observed.lineCount,
    inputParameterCount: observed.inputParameterCount,
    inputParameterSetSha256: observed.inputParameterSetSha256,
    returnSignatureSha256: observed.returnSignatureSha256,
    directReadDependencyCount: observed.directReadDependencyCount,
    directReadDependencySetSha256: observed.directReadDependencySetSha256,
    directCalledRoutineCount: observed.directCalledRoutineCount,
    directCalledRoutineSetSha256: observed.directCalledRoutineSetSha256,
    directWriteDependencyCount: observed.directWriteDependencyCount,
    dynamicWriteDependencyCount: observed.dynamicWriteDependencyCount,
    semanticClassification: structuredClone(contract.semanticClassification),
    resolvedGapCodes: [...contract.resolution.resolvedGapCodes],
    residualGapCodes: [...contract.resolution.residualGapCodes],
    sourceDefinitionVerified: true,
    sourceDefinitionIncluded: false,
    parameterNamesIncluded: false,
    dependencyNamesIncluded: false,
    legacyRoutineExecuted: false,
    containsPersonalData: false,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(canonical(body)) };
}

function parseArgs(argv) {
  let sourceDefinitionPath = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--source-definition" && argv[index + 1]) sourceDefinitionPath = argv[++index];
    else fail("FULL_DAYS_SOURCE_DEFINITION_ARGUMENT_INVALID", "--source-definition is required");
  }
  if (!sourceDefinitionPath) fail("FULL_DAYS_SOURCE_DEFINITION_ARGUMENT_INVALID", "--source-definition is required");
  return { sourceDefinitionPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const repositoryRoot = resolve(import.meta.dirname, "../..");
    const contract = JSON.parse(readFileSync(resolve(repositoryRoot, CONTRACT_PATH), "utf8"));
    const args = parseArgs(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(buildLegacyFullDaysSourceDefinitionReceipt({ contract, repositoryRoot, ...args }), null, 2)}\n`);
  } catch (error) {
    const code = error instanceof LegacyFullDaysSourceDefinitionReceiptError ? error.code : "FULL_DAYS_SOURCE_DEFINITION_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
