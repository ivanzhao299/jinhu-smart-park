import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export class LegacyRoutineParityContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyRoutineParityContractError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyRoutineParityContractError(code, detail); };
const HASH = /^[0-9a-f]{64}$/u;
const COMPLETE_STATUS = "verified";
const DIMENSION_NAMES = [
  "parameterMappings",
  "outputFieldMappings",
  "readMappings",
  "writeMappings",
  "nullSemantics",
  "roundingSemantics",
  "stateSideEffects",
];
const TEST_EVIDENCE_NAMES = ["positive", "negative", "permission", "conservation"];
const ENTRY_FIELDS = {
  parameterMappings: ["sourceParameter", "modernParameter", "sourceType", "modernType", "transform", "nullContract"],
  outputFieldMappings: ["sourceField", "modernField", "transform", "nullContract"],
  readMappings: ["sourceLocator", "modernLocator", "relationContract"],
  writeMappings: ["sourceLocator", "modernLocator", "relationContract"],
  nullSemantics: ["sourceExpression", "modernExpression", "equivalenceRule"],
  roundingSemantics: ["sourceExpression", "modernExpression", "precisionRule"],
  stateSideEffects: ["sourceEffect", "modernEffect", "conservationRule"],
};

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const sha256 = value => createHash("sha256").update(value).digest("hex");
const unique = values => [...new Set(values)].sort((a, b) => a.localeCompare(b, "en"));
const routineKey = row => `${row.sourceSurface}:${row.routineId}`;

export const computeRoutineLedgerSha256 = ledger => sha256(JSON.stringify(ledger));

function assertNonEmptyString(value, code, detail) {
  if (typeof value !== "string" || !value.trim()) fail(code, detail);
}

function validateEvidenceHash(value, code, detail) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code, detail);
}

function validateDimension(dimension, name, rowKey) {
  if (!isObject(dimension)) fail("ROUTINE_DIMENSION_MISSING", `${rowKey}:${name}`);
  if (!["required", "not_applicable"].includes(dimension.applicability)) fail("ROUTINE_DIMENSION_INVALID", `${rowKey}:${name}:applicability`);
  if (!["pending", COMPLETE_STATUS].includes(dimension.status)) fail("ROUTINE_DIMENSION_INVALID", `${rowKey}:${name}:status`);
  if (!Array.isArray(dimension.entries)) fail("ROUTINE_DIMENSION_INVALID", `${rowKey}:${name}:entries`);
  assertNonEmptyString(dimension.decisionReason, "ROUTINE_DIMENSION_INVALID", `${rowKey}:${name}:decisionReason`);
  if (dimension.evidenceSha256 !== null) validateEvidenceHash(dimension.evidenceSha256, "ROUTINE_EVIDENCE_HASH_INVALID", `${rowKey}:${name}`);

  if (dimension.applicability === "not_applicable") {
    if (dimension.status !== COMPLETE_STATUS || dimension.entries.length !== 0 || !HASH.test(dimension.evidenceSha256 ?? "")) {
      fail("ROUTINE_NOT_APPLICABLE_UNREVIEWED", `${rowKey}:${name}`);
    }
  }
  if (dimension.status === COMPLETE_STATUS && dimension.applicability === "required") {
    if (!dimension.entries.length || !HASH.test(dimension.evidenceSha256 ?? "")) fail("ROUTINE_DIMENSION_EVIDENCE_INCOMPLETE", `${rowKey}:${name}`);
  }
  for (const [index, entry] of dimension.entries.entries()) {
    if (!isObject(entry)) fail("ROUTINE_DIMENSION_ENTRY_INVALID", `${rowKey}:${name}:${index}`);
    for (const field of ENTRY_FIELDS[name]) assertNonEmptyString(entry[field], "ROUTINE_DIMENSION_ENTRY_INVALID", `${rowKey}:${name}:${index}:${field}`);
  }
  return dimension.status === COMPLETE_STATUS;
}

function validateTransaction(transaction, rowKey) {
  if (!isObject(transaction) || !["pending", COMPLETE_STATUS].includes(transaction.status)) fail("ROUTINE_TRANSACTION_INVALID", rowKey);
  for (const field of ["sourceBoundary", "modernBoundary", "rollbackBehavior"]) assertNonEmptyString(transaction[field], "ROUTINE_TRANSACTION_INVALID", `${rowKey}:${field}`);
  if (transaction.evidenceSha256 !== null) validateEvidenceHash(transaction.evidenceSha256, "ROUTINE_EVIDENCE_HASH_INVALID", `${rowKey}:transaction`);
  if (transaction.status === COMPLETE_STATUS && !HASH.test(transaction.evidenceSha256 ?? "")) fail("ROUTINE_TRANSACTION_EVIDENCE_INCOMPLETE", rowKey);
  return transaction.status === COMPLETE_STATUS;
}

function validateDynamicSql(dynamicSql, sourceRoutine, rowKey) {
  if (!isObject(dynamicSql) || !["none", "resolved", "unresolved"].includes(dynamicSql.status) || !Array.isArray(dynamicSql.resolvedWriteTargets)) {
    fail("ROUTINE_DYNAMIC_SQL_INVALID", rowKey);
  }
  if (dynamicSql.evidenceSha256 !== null) validateEvidenceHash(dynamicSql.evidenceSha256, "ROUTINE_EVIDENCE_HASH_INVALID", `${rowKey}:dynamicSql`);
  if (dynamicSql.resolvedWriteTargets.length !== new Set(dynamicSql.resolvedWriteTargets).size) fail("ROUTINE_DYNAMIC_SQL_INVALID", `${rowKey}:duplicate target`);
  for (const [index, target] of dynamicSql.resolvedWriteTargets.entries()) assertNonEmptyString(target, "ROUTINE_DYNAMIC_SQL_INVALID", `${rowKey}:target:${index}`);
  if (sourceRoutine.dynamicMutationStatus === "unknown_requires_review") {
    if (dynamicSql.status !== "unresolved") fail("DYNAMIC_SQL_SOURCE_LEDGER_UNRESOLVED", rowKey);
    return false;
  }
  if (sourceRoutine.dynamicMutationStatus === "detected") {
    if (dynamicSql.status === "none") fail("DYNAMIC_SQL_CLASSIFICATION_MISMATCH", rowKey);
    if (dynamicSql.status === "resolved" && (!dynamicSql.resolvedWriteTargets.length || !HASH.test(dynamicSql.evidenceSha256 ?? ""))) {
      fail("DYNAMIC_SQL_RESOLUTION_EVIDENCE_INCOMPLETE", rowKey);
    }
    return dynamicSql.status === "resolved";
  }
  if (dynamicSql.status !== "none" || dynamicSql.resolvedWriteTargets.length || !HASH.test(dynamicSql.evidenceSha256 ?? "")) {
    fail("DYNAMIC_SQL_CLASSIFICATION_MISMATCH", rowKey);
  }
  return true;
}

function validateDormantCase(value, label, rowKey, allowedNotApplicable) {
  if (!isObject(value) || !["covered", "pending", "not_applicable"].includes(value.status)) fail("ROUTINE_DORMANT_PATH_INVALID", `${rowKey}:${label}`);
  if (value.status === "not_applicable" && !allowedNotApplicable) fail("ROUTINE_DORMANT_PATH_INVALID", `${rowKey}:${label}:not_applicable`);
  if (value.evidenceSha256 !== null) validateEvidenceHash(value.evidenceSha256, "ROUTINE_EVIDENCE_HASH_INVALID", `${rowKey}:${label}`);
  if (["covered", "not_applicable"].includes(value.status) && !HASH.test(value.evidenceSha256 ?? "")) fail("ROUTINE_DORMANT_PATH_EVIDENCE_INCOMPLETE", `${rowKey}:${label}`);
  return ["covered", "not_applicable"].includes(value.status);
}

function validateDormantPaths(dormantPaths, sourceRoutine, rowKey) {
  if (!isObject(dormantPaths) || !["populated", "empty", "unknown"].includes(dormantPaths.sourceDataState)) fail("ROUTINE_DORMANT_PATH_INVALID", `${rowKey}:sourceDataState`);
  const emptyReady = validateDormantCase(dormantPaths.emptyInputCase, "emptyInputCase", rowKey, false);
  const branchReady = validateDormantCase(dormantPaths.untriggeredBranchCase, "untriggeredBranchCase", rowKey, false);
  const triggerReady = validateDormantCase(dormantPaths.triggerFiringCase, "triggerFiringCase", rowKey, sourceRoutine.kind !== "trigger");
  if (sourceRoutine.kind === "trigger" && dormantPaths.triggerFiringCase.status === "not_applicable") fail("TRIGGER_FIRING_EVIDENCE_REQUIRED", rowKey);
  return dormantPaths.sourceDataState !== "unknown" && emptyReady && branchReady && triggerReady;
}

function validateModernTargets(targets, rowKey) {
  if (!isObject(targets)) fail("ROUTINE_MODERN_TARGETS_INVALID", rowKey);
  for (const name of ["serviceSymbols", "apiSymbols", "pages"]) {
    if (!Array.isArray(targets[name]) || !targets[name].length) fail("ROUTINE_MODERN_TARGETS_INVALID", `${rowKey}:${name}`);
    for (const [index, value] of targets[name].entries()) assertNonEmptyString(value, "ROUTINE_MODERN_TARGETS_INVALID", `${rowKey}:${name}:${index}`);
  }
  return true;
}

function validateTestEvidence(testEvidence, rowKey) {
  if (!isObject(testEvidence)) fail("ROUTINE_TEST_EVIDENCE_INVALID", rowKey);
  let ready = true;
  for (const name of TEST_EVIDENCE_NAMES) {
    const entries = testEvidence[name];
    if (!Array.isArray(entries)) fail("ROUTINE_TEST_EVIDENCE_INVALID", `${rowKey}:${name}`);
    if (!entries.length) ready = false;
    for (const [index, entry] of entries.entries()) {
      if (!isObject(entry)) fail("ROUTINE_TEST_EVIDENCE_INVALID", `${rowKey}:${name}:${index}`);
      assertNonEmptyString(entry.testId, "ROUTINE_TEST_EVIDENCE_INVALID", `${rowKey}:${name}:${index}:testId`);
      validateEvidenceHash(entry.evidenceSha256, "ROUTINE_EVIDENCE_HASH_INVALID", `${rowKey}:${name}:${index}`);
    }
  }
  return ready;
}

function validateReview(review, rowKey) {
  if (!isObject(review) || !["pending", "approved"].includes(review.status)) fail("ROUTINE_REVIEW_INVALID", rowKey);
  if (review.evidenceSha256 !== null) validateEvidenceHash(review.evidenceSha256, "ROUTINE_EVIDENCE_HASH_INVALID", `${rowKey}:review`);
  return review.status === "approved" && HASH.test(review.evidenceSha256 ?? "");
}

function validateParityRow(row, sourceRoutine) {
  const rowKey = routineKey(row);
  if (row.canonicalFamily !== sourceRoutine.canonicalFamily || row.sourceSurface !== sourceRoutine.sourceSurface || row.sourceKind !== sourceRoutine.kind) {
    fail("ROUTINE_SOURCE_IDENTITY_MISMATCH", rowKey);
  }
  if (!["pending", COMPLETE_STATUS].includes(row.parityStatus)) fail("ROUTINE_PARITY_STATUS_INVALID", rowKey);
  if (row.parityStatus === COMPLETE_STATUS && sourceRoutine.dynamicMutationStatus === "unknown_requires_review") {
    fail("DYNAMIC_SQL_SOURCE_LEDGER_UNRESOLVED", rowKey);
  }
  if (!isObject(row.semantics)) fail("ROUTINE_SEMANTICS_MISSING", rowKey);

  const checks = DIMENSION_NAMES.map(name => validateDimension(row.semantics[name], name, rowKey));
  checks.push(validateTransaction(row.semantics.transaction, rowKey));
  checks.push(validateDynamicSql(row.semantics.dynamicSql, sourceRoutine, rowKey));
  checks.push(validateDormantPaths(row.semantics.dormantPaths, sourceRoutine, rowKey));
  checks.push(validateModernTargets(row.modernTargets, rowKey));
  checks.push(validateTestEvidence(row.testEvidence, rowKey));
  checks.push(validateReview(row.review, rowKey));
  const evidenceComplete = checks.every(Boolean);
  if (row.parityStatus === COMPLETE_STATUS && !evidenceComplete) fail("VERIFIED_ROUTINE_EVIDENCE_INCOMPLETE", rowKey);
  return row.parityStatus === COMPLETE_STATUS && evidenceComplete;
}

export function evaluateLegacyRoutineParityContract({ contract, routineLedger }) {
  if (!isObject(contract) || contract.formatVersion !== 1 || contract.contractKind !== "yuzhou_hr_legacy_routine_semantic_parity") fail("ROUTINE_PARITY_CONTRACT_IDENTITY_INVALID", "root");
  assertNonEmptyString(contract.contractVersion, "ROUTINE_PARITY_CONTRACT_IDENTITY_INVALID", "contractVersion");
  if (contract.productionImport !== "HOLD") fail("ROUTINE_PARITY_PRODUCTION_BOUNDARY_INVALID", "productionImport");
  if (!isObject(routineLedger) || !Array.isArray(routineLedger.routines)) fail("ROUTINE_SOURCE_LEDGER_INVALID", "routines");
  if (!routineLedger.routines.length) fail("ROUTINE_SOURCE_LEDGER_INVALID", "empty ledger cannot satisfy parity");
  if (!isObject(contract.sourceBinding) || !Array.isArray(contract.sourceBinding.requiredSourceSurfaces)) fail("ROUTINE_SOURCE_BINDING_INVALID", "root");
  if (!Number.isSafeInteger(contract.sourceBinding.sourceRoutineCount) || contract.sourceBinding.sourceRoutineCount < 1) fail("ROUTINE_SOURCE_BINDING_INVALID", "sourceRoutineCount");
  if (!contract.sourceBinding.requiredSourceSurfaces.length || contract.sourceBinding.requiredSourceSurfaces.length !== new Set(contract.sourceBinding.requiredSourceSurfaces).size) fail("ROUTINE_SOURCE_BINDING_INVALID", "requiredSourceSurfaces");
  for (const surface of contract.sourceBinding.requiredSourceSurfaces) assertNonEmptyString(surface, "ROUTINE_SOURCE_BINDING_INVALID", "requiredSourceSurfaces");
  validateEvidenceHash(contract.sourceBinding.routineLedgerSha256, "ROUTINE_SOURCE_BINDING_INVALID", "routineLedgerSha256");
  if (contract.sourceBinding.routineLedgerSha256 !== computeRoutineLedgerSha256(routineLedger)) fail("ROUTINE_SOURCE_BINDING_HASH_MISMATCH", "routine ledger");
  if (contract.sourceBinding.sourceRoutineCount !== routineLedger.routines.length) fail("ROUTINE_SOURCE_BINDING_COUNT_MISMATCH", String(routineLedger.routines.length));

  const sourceByKey = new Map();
  for (const source of routineLedger.routines) {
    for (const field of ["routineId", "canonicalFamily", "sourceSurface", "kind"]) assertNonEmptyString(source[field], "ROUTINE_SOURCE_LEDGER_INVALID", field);
    if (!["none", "detected", "unknown_requires_review"].includes(source.dynamicMutationStatus)) fail("ROUTINE_SOURCE_LEDGER_INVALID", `${routineKey(source)}:dynamicMutationStatus`);
    const key = routineKey(source);
    if (sourceByKey.has(key)) fail("ROUTINE_SOURCE_LEDGER_DUPLICATE", key);
    sourceByKey.set(key, source);
  }
  const observedSurfaces = unique(routineLedger.routines.map(row => row.sourceSurface));
  if (JSON.stringify(unique(contract.sourceBinding.requiredSourceSurfaces)) !== JSON.stringify(observedSurfaces)) fail("ROUTINE_SOURCE_SURFACE_COVERAGE_INVALID", JSON.stringify(observedSurfaces));

  if (!Array.isArray(contract.routines)) fail("ROUTINE_PARITY_ROWS_INVALID", "routines");
  const parityByKey = new Map();
  for (const row of contract.routines) {
    if (!isObject(row)) fail("ROUTINE_PARITY_ROW_INVALID", "row");
    for (const field of ["routineId", "canonicalFamily", "sourceSurface", "sourceKind"]) assertNonEmptyString(row[field], "ROUTINE_PARITY_ROW_INVALID", field);
    const key = routineKey(row);
    if (parityByKey.has(key)) fail("ROUTINE_PARITY_ROW_DUPLICATE", key);
    if (!sourceByKey.has(key)) fail("ROUTINE_PARITY_SOURCE_UNKNOWN", key);
    parityByKey.set(key, row);
  }

  const bySurface = Object.fromEntries(observedSurfaces.map(surface => [surface, { sourceRoutines: 0, verifiedRoutines: 0, pendingRoutines: 0 }]));
  const pendingRoutineKeys = [];
  const missingRoutineKeys = [];
  let verifiedRoutines = 0;
  for (const [key, sourceRoutine] of sourceByKey) {
    bySurface[sourceRoutine.sourceSurface].sourceRoutines += 1;
    const row = parityByKey.get(key);
    if (!row) {
      missingRoutineKeys.push(key);
      bySurface[sourceRoutine.sourceSurface].pendingRoutines += 1;
      continue;
    }
    if (validateParityRow(row, sourceRoutine)) {
      verifiedRoutines += 1;
      bySurface[sourceRoutine.sourceSurface].verifiedRoutines += 1;
    } else {
      pendingRoutineKeys.push(key);
      bySurface[sourceRoutine.sourceSurface].pendingRoutines += 1;
    }
  }

  const reasonCodes = [];
  if (missingRoutineKeys.length) reasonCodes.push("ROUTINE_PARITY_ROWS_MISSING");
  if (pendingRoutineKeys.length) reasonCodes.push("ROUTINE_SEMANTIC_EVIDENCE_PENDING");
  if (routineLedger.routines.some(row => row.dynamicMutationStatus === "unknown_requires_review")) reasonCodes.push("DYNAMIC_SQL_MUTATION_REVIEW_PENDING");
  const status = verifiedRoutines === routineLedger.routines.length && reasonCodes.length === 0 ? "COMPLETE" : "IN_PROGRESS";
  return {
    ok: true,
    status,
    summary: {
      sourceRoutines: routineLedger.routines.length,
      contractRows: contract.routines.length,
      verifiedRoutines,
      pendingRoutines: routineLedger.routines.length - verifiedRoutines,
      verifiedSemanticParityPercent: routineLedger.routines.length ? Number(((verifiedRoutines / routineLedger.routines.length) * 100).toFixed(2)) : 0,
      bySourceSurface: bySurface,
    },
    missingRoutineKeys,
    pendingRoutineKeys,
    reasonCodes,
    completionRule: "COMPLETE requires exact routineId/canonicalFamily/sourceSurface coverage plus verified parameter, output, read/write, transaction, null, rounding, side-effect, dormant-path, modern service/API/page, positive, negative, permission, conservation and review evidence for every routine.",
    productionImport: "HOLD",
  };
}

function readPlainJson(path, label) {
  if (!isAbsolute(path)) fail("CLI_ARGUMENT_INVALID", `${label} must be absolute`);
  let real;
  try { real = realpathSync(path); } catch { fail("SOURCE_FILE_MISSING", label); }
  if (lstatSync(path).isSymbolicLink() || !statSync(real).isFile()) fail("SOURCE_PATH_INVALID", label);
  return JSON.parse(readFileSync(real, "utf8"));
}

function parseArgs(argv) {
  const args = { contract: null, routineLedger: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--contract" && argv[index + 1]) args.contract = argv[++index];
    else if (argv[index] === "--routine-ledger" && argv[index + 1]) args.routineLedger = argv[++index];
    else if (argv[index] === "--json") args.json = true;
    else fail("CLI_ARGUMENT_INVALID", String(argv[index]));
  }
  if (!args.contract || !args.routineLedger) fail("CLI_ARGUMENT_INVALID", "--contract and --routine-ledger are required");
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = evaluateLegacyRoutineParityContract({
      contract: readPlainJson(args.contract, "contract"),
      routineLedger: readPlainJson(args.routineLedger, "routine ledger"),
    });
    process.stdout.write(`${args.json ? JSON.stringify(report, null, 2) : JSON.stringify(report)}\n`);
    if (report.status !== "COMPLETE") process.exitCode = 2;
  } catch (error) {
    const code = error instanceof LegacyRoutineParityContractError ? error.code : "LEGACY_ROUTINE_PARITY_CONTRACT_FAILED";
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
