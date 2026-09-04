#!/usr/bin/env node
/* global process, structuredClone */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  sourceRestoreReceiptFileHash,
  validateSourceRestoreReceipt,
} from "./source-restore-receipt.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const DATABASE = /^YuzhouHR_Lab_[A-Za-z0-9_]{6,40}$/u;
const CONTAINER = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,127}$/u;
const LIVE_PROBE = Symbol("live-u-inputbasepay-source-probe");
const DEFAULT_CONTRACT = resolve(
  import.meta.dirname,
  "contracts/legacy-u-inputbasepay-source-receipt-v1.json",
);
const RECEIPT_BODY_KEYS = [
  "formatVersion",
  "artifactKind",
  "scope",
  "contractSha256",
  "sourceRestoreReceiptSha256",
  "sourceCatalogSha256",
  "databaseIdentitySha256",
  "queryIdentitySha256",
  "evidenceOrigin",
  "sourceState",
  "etlAuthority",
  "sourceObject",
  "routineIdentity",
  "routineCatalog",
  "modernCandidate",
  "catalogDisposition",
  "sourceIdentityStatus",
  "sourceIdentityReason",
  "dynamicSqlReviewStatus",
  "decision",
  "status",
  "gapCodes",
  "legacyRoutineExecuted",
  "legacyDynamicSqlExecuted",
  "containsPayrollValues",
  "containsPersonalData",
  "compatibilityCredit",
  "productionImport",
];
const NUMERIC_SQL_TYPES = [
  "bigint",
  "decimal",
  "float",
  "int",
  "money",
  "numeric",
  "real",
  "smallint",
  "smallmoney",
  "tinyint",
];
const ROUTINE_LEDGER_PATH = "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json";
const MAPPING_PATH = "scripts/hr-cutover/contracts/legacy-u-inputbasepay-modern-map-v1.json";
const FORMULA_DSL_PATH = "apps/api/src/modules/hr/hr-payroll-formula-dsl.ts";
const FORMULA_DSL_SYMBOLS = [
  "HR_PAYROLL_DSL_PARSER_VERSION",
  "HR_PAYROLL_DSL_ENGINE_VERSION",
  "parsePayrollFormula",
  "evaluatePayrollFormula",
  "projectLegacyPersonBasePayInput",
];

// This query returns catalog metadata, a module hash, boolean side-effect
// indicators, and the current least-privilege authority only. It never returns
// procedure text, a person key, or a payroll value, and it never invokes the
// legacy procedure or any SQL assembled by that procedure.
export const PAYROLL_U_INPUTBASEPAY_CATALOG_SQL = `SET NOCOUNT ON;
DECLARE @person_object_id int=OBJECT_ID(N'dbo.person',N'U');
DECLARE @routine_object_id int=OBJECT_ID(N'dbo.u_inputbasepay',N'P');
SELECT
  CONVERT(varchar(1),CASE WHEN @person_object_id IS NULL THEN 0 ELSE 1 END),
  CONVERT(varchar(1),CASE WHEN person_key.object_id IS NULL THEN 0 ELSE 1 END),
  COALESCE(TYPE_NAME(person_key.user_type_id),''),
  COALESCE(CONVERT(varchar(12),person_key.max_length),''),
  COALESCE(CONVERT(varchar(12),person_key.precision),''),
  COALESCE(CONVERT(varchar(12),person_key.scale),''),
  COALESCE(CONVERT(varchar(1),person_key.is_nullable),''),
  COALESCE(CONVERT(varchar(1),person_key.is_computed),''),
  CONVERT(varchar(1),CASE WHEN base_value.object_id IS NULL THEN 0 ELSE 1 END),
  COALESCE(TYPE_NAME(base_value.user_type_id),''),
  COALESCE(CONVERT(varchar(12),base_value.max_length),''),
  COALESCE(CONVERT(varchar(12),base_value.precision),''),
  COALESCE(CONVERT(varchar(12),base_value.scale),''),
  COALESCE(CONVERT(varchar(1),base_value.is_nullable),''),
  COALESCE(CONVERT(varchar(1),base_value.is_computed),''),
  CONVERT(varchar(1),CASE WHEN @routine_object_id IS NULL THEN 0 ELSE 1 END),
  COALESCE(LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),routine_module.definition)),2)),''),
  CASE WHEN routine_module.definition IS NULL THEN '' WHEN CHARINDEX(N'sp_executesql',LOWER(routine_module.definition))>0 OR CHARINDEX(N'exec(',LOWER(routine_module.definition))>0 OR CHARINDEX(N'exec (',LOWER(routine_module.definition))>0 THEN '1' ELSE '0' END,
  CASE WHEN routine_module.definition IS NULL THEN '' WHEN CHARINDEX(N'update ',LOWER(routine_module.definition))>0 OR CHARINDEX(N'insert ',LOWER(routine_module.definition))>0 OR CHARINDEX(N'delete ',LOWER(routine_module.definition))>0 OR CHARINDEX(N'merge ',LOWER(routine_module.definition))>0 THEN '1' ELSE '0' END,
  CASE WHEN routine_module.definition IS NULL THEN '' WHEN CHARINDEX(N'person',LOWER(routine_module.definition))>0 THEN '1' ELSE '0' END,
  CASE WHEN routine_module.definition IS NULL THEN '' WHEN CHARINDEX(N'_base',LOWER(routine_module.definition))>0 THEN '1' ELSE '0' END,
  CONVERT(varchar(1),source_database.is_read_only),
  DB_NAME(),
  CONVERT(varchar(1),COALESCE(IS_SRVROLEMEMBER('sysadmin'),0)),
  CONVERT(varchar(1),COALESCE(IS_ROLEMEMBER('db_datareader'),0)),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION')),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','INSERT')),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','UPDATE')),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','DELETE')),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','EXECUTE'))
FROM sys.databases source_database
LEFT JOIN sys.columns person_key ON person_key.object_id=@person_object_id AND person_key.name=N'person'
LEFT JOIN sys.columns base_value ON base_value.object_id=@person_object_id AND base_value.name=N'_base'
LEFT JOIN sys.sql_modules routine_module ON routine_module.object_id=@routine_object_id
WHERE source_database.name=DB_NAME();`;

// This fixed SELECT is issued only after the catalog query proves that
// dbo.person._base exists. It returns row/null counts, never a payroll value.
export const PAYROLL_U_INPUTBASEPAY_VALUE_AGGREGATE_SQL = `SET NOCOUNT ON;
SELECT
  CONVERT(varchar(30),COUNT_BIG(*)),
  CONVERT(varchar(30),COUNT_BIG([_base]))
FROM dbo.person;`;

export class PayrollUInputbasepaySourceReceiptError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "PayrollUInputbasepaySourceReceiptError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new PayrollUInputbasepaySourceReceiptError(code, detail);
};
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const exactKeys = (value, keys, code, label) => {
  if (!object(value) || !same(Object.keys(value).sort(), [...keys].sort())) fail(code, label);
};
const requireSha = (value, code, label) => {
  if (!SHA256.test(value ?? "")) fail(code, label);
};
const requireCount = (value, code, label) => {
  if (!Number.isSafeInteger(value) || value < 0) fail(code, label);
};

function privateFile(filePath, label) {
  if (typeof filePath !== "string" || !isAbsolute(filePath) || resolve(filePath) !== filePath) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_FILE_UNSAFE", label);
  }
  let link;
  let actual;
  let info;
  try {
    link = lstatSync(filePath);
    actual = realpathSync(filePath);
    info = statSync(actual);
  } catch {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_FILE_UNSAFE", `${label}:missing`);
  }
  if (link.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_FILE_UNSAFE", label);
  }
  return actual;
}

function parseJson(raw, code, label) {
  try {
    return JSON.parse(raw);
  } catch {
    fail(code, label);
  }
}

function readBoundFile(repositoryRoot, evidence, label) {
  if (!object(evidence) || typeof evidence.path !== "string" || !evidence.path || !SHA256.test(evidence.sha256 ?? "")) {
    fail("PAYROLL_U_INPUTBASEPAY_CONTRACT_INVALID", label);
  }
  const bytes = readFileSync(resolve(repositoryRoot, evidence.path));
  if (digest(bytes) !== evidence.sha256) fail("PAYROLL_U_INPUTBASEPAY_EVIDENCE_DRIFT", label);
  return bytes;
}

function validateContract(contract, repositoryRoot) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_payroll_u_inputbasepay_source_receipt"
    || contract.scope !== "u_inputbasepay_single_routine_source_identity"
    || contract.sourceCatalog?.schema !== "dbo"
    || contract.sourceCatalog?.table !== "person"
    || contract.sourceCatalog?.identityColumn !== "person"
    || contract.sourceCatalog?.valueColumn !== "_base"
    || !same(contract.sourceCatalog?.numericSqlTypes, NUMERIC_SQL_TYPES)
    || contract.sourceCatalog?.nullabilityPolicy !== "capture_exact_catalog_value_without_inference"
    || contract.sourceCatalog?.valuePolicy !== "count_rows_and_null_presence_only_no_payroll_values"
    || contract.sourceEvidence?.routineLedger?.path !== ROUTINE_LEDGER_PATH
    || contract.sourceEvidence?.mapping?.path !== MAPPING_PATH
    || contract.modernCandidate?.inputCode !== "hr:基本工资"
    || contract.modernCandidate?.mappingTarget !== "hr_payroll_reconciliation_input.hr:基本工资"
    || contract.modernCandidate?.formulaDsl?.path !== FORMULA_DSL_PATH
    || !same(contract.modernCandidate?.formulaDsl?.requiredSymbols, FORMULA_DSL_SYMBOLS)
    || contract.modernCandidate?.bindingStatus !== "verified_modern_capability_only"
    || contract.modernCandidate?.equivalenceStatus !== "pending"
    || contract.dynamicSqlPolicy?.catalogEvidence !== "module_hash_and_dynamic_or_update_flags_only"
    || contract.dynamicSqlPolicy?.legacyRoutineExecution !== "FORBIDDEN"
    || contract.dynamicSqlPolicy?.legacyDynamicSqlExecution !== "FORBIDDEN"
    || contract.dynamicSqlPolicy?.writeSideEffectDisposition !== "captured_unexecuted_and_pending_review"
    || contract.receiptPolicy !== "aggregate_catalog_types_nullability_counts_hashes_and_statuses_only"
    || contract.syntheticEvidenceDecision !== "KEEP_PENDING"
    || contract.requiredDecision !== "KEEP_PENDING"
    || contract.containsPayrollValues !== false
    || contract.containsPersonalData !== false
    || contract.compatibilityCredit !== 0
    || contract.productionImport !== "HOLD") {
    fail("PAYROLL_U_INPUTBASEPAY_CONTRACT_INVALID", "identity or safety boundary");
  }

  const routine = contract.sourceEvidence?.routine;
  if (routine?.routineId !== "RULE-0883F6C1E60DB772"
    || routine.sourceName !== "u_inputbasepay"
    || routine.sourceArtifactSha256 !== "7a34ce1db8d1dd772245e8a4f4f5433beee73acc82e09e0611582436e19765d8"
    || routine.reviewedReadTable !== "person"
    || routine.reviewedLogicalReadField !== "person._base"
    || routine.ledgerDynamicMutationStatus !== "unknown_requires_review") {
    fail("PAYROLL_U_INPUTBASEPAY_CONTRACT_INVALID", "routine identity");
  }

  const ledgerBytes = readBoundFile(repositoryRoot, contract.sourceEvidence?.routineLedger, "routine ledger");
  const mappingBytes = readBoundFile(repositoryRoot, contract.sourceEvidence?.mapping, "u_inputbasepay mapping");
  const dslBytes = readBoundFile(repositoryRoot, contract.modernCandidate?.formulaDsl, "modern formula DSL");
  const ledger = parseJson(ledgerBytes, "PAYROLL_U_INPUTBASEPAY_CONTRACT_INVALID", "routine ledger JSON");
  const mapping = parseJson(mappingBytes, "PAYROLL_U_INPUTBASEPAY_CONTRACT_INVALID", "mapping JSON");
  const sourceRoutine = ledger.routines?.find((row) => row.routineId === routine.routineId);
  if (!sourceRoutine
    || sourceRoutine.sourceName !== routine.sourceName
    || sourceRoutine.sourceArtifactSha256 !== routine.sourceArtifactSha256
    || !same(sourceRoutine.readTables, ["person"])
    || sourceRoutine.dynamicMutationStatus !== routine.ledgerDynamicMutationStatus) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_LEDGER_DRIFT", "single routine identity");
  }
  if (mapping.contractKind !== "yuzhou_hr_legacy_payroll_dynamic_routine_resolution"
    || mapping.canonicalFamily !== routine.sourceName
    || mapping.sourceBinding?.sourceArtifactSha256 !== routine.sourceArtifactSha256
    || mapping.sourceContract?.logicalReadField !== routine.reviewedLogicalReadField
    || !mapping.modernContract?.candidateTargets?.includes(contract.modernCandidate.mappingTarget)
    || mapping.modernContract?.dynamicSqlExecution !== "FORBIDDEN"
    || mapping.review?.status !== "pending"
    || mapping.productionImport !== "HOLD") {
    fail("PAYROLL_U_INPUTBASEPAY_MAPPING_DRIFT", "source or modern candidate identity");
  }
  const dslSource = dslBytes.toString("utf8");
  const symbols = contract.modernCandidate.formulaDsl.requiredSymbols;
  if (symbols.some((symbol) => !dslSource.includes(symbol))
    || !dslSource.includes(JSON.stringify(contract.modernCandidate.inputCode.slice(3)))) {
    fail("PAYROLL_U_INPUTBASEPAY_MODERN_CANDIDATE_DRIFT", "formula DSL identity");
  }
  return {
    contractSha256: digest(canonical(contract)),
    ledgerSha256: contract.sourceEvidence.routineLedger.sha256,
    mappingSha256: contract.sourceEvidence.mapping.sha256,
    dslSha256: contract.modernCandidate.formulaDsl.sha256,
    routineId: routine.routineId,
    sourceName: routine.sourceName,
    sourceArtifactSha256: routine.sourceArtifactSha256,
  };
}

function validateAuthority(authority) {
  exactKeys(
    authority,
    ["loginSucceeded", "sysadmin", "dbDatareader", "viewDefinition", "insert", "update", "delete", "execute"],
    "PAYROLL_U_INPUTBASEPAY_SOURCE_AUTHORITY_INVALID",
    "authority shape",
  );
  if (authority.loginSucceeded !== true
    || authority.sysadmin !== false
    || authority.dbDatareader !== true
    || authority.viewDefinition !== true
    || authority.insert !== false
    || authority.update !== false
    || authority.delete !== false
    || authority.execute !== false) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_AUTHORITY_INVALID", "least-privilege read-only authority required");
  }
}

function validateColumn(column, label) {
  exactKeys(
    column,
    ["exists", "sqlType", "maxLength", "precision", "scale", "nullable", "computed"],
    "PAYROLL_U_INPUTBASEPAY_SOURCE_CATALOG_INVALID",
    `${label} shape`,
  );
  if (typeof column.exists !== "boolean") fail("PAYROLL_U_INPUTBASEPAY_SOURCE_CATALOG_INVALID", `${label} existence`);
  if (!column.exists) {
    if ([column.sqlType, column.maxLength, column.precision, column.scale, column.nullable, column.computed].some((value) => value !== null)) {
      fail("PAYROLL_U_INPUTBASEPAY_SOURCE_CATALOG_INVALID", `${label} absent metadata`);
    }
    return;
  }
  if (typeof column.sqlType !== "string" || !column.sqlType
    || !Number.isSafeInteger(column.maxLength)
    || !Number.isSafeInteger(column.precision)
    || !Number.isSafeInteger(column.scale)
    || typeof column.nullable !== "boolean"
    || typeof column.computed !== "boolean") {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_CATALOG_INVALID", `${label} metadata`);
  }
}

function validateEvidence(evidence) {
  exactKeys(
    evidence,
    ["databaseIdentity", "databaseReadOnly", "authority", "sourceObject", "routineCatalog", "valueAggregate"],
    "PAYROLL_U_INPUTBASEPAY_SOURCE_CATALOG_INVALID",
    "evidence shape",
  );
  if (typeof evidence.databaseIdentity !== "string" || !DATABASE.test(evidence.databaseIdentity) || evidence.databaseReadOnly !== true) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_CATALOG_INVALID", "database identity or read-only state");
  }
  validateAuthority(evidence.authority);
  exactKeys(
    evidence.sourceObject,
    ["schema", "table", "exists", "identityColumnName", "valueColumnName", "identityColumn", "valueColumn"],
    "PAYROLL_U_INPUTBASEPAY_SOURCE_CATALOG_INVALID",
    "source object shape",
  );
  if (evidence.sourceObject.schema !== "dbo"
    || evidence.sourceObject.table !== "person"
    || evidence.sourceObject.identityColumnName !== "person"
    || evidence.sourceObject.valueColumnName !== "_base"
    || typeof evidence.sourceObject.exists !== "boolean") {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_CATALOG_INVALID", "source object identity");
  }
  validateColumn(evidence.sourceObject.identityColumn, "identity column");
  validateColumn(evidence.sourceObject.valueColumn, "value column");
  if (!evidence.sourceObject.exists && (evidence.sourceObject.identityColumn.exists || evidence.sourceObject.valueColumn.exists)) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_CATALOG_INVALID", "columns cannot exist without table");
  }
  exactKeys(
    evidence.routineCatalog,
    ["exists", "definitionSha256", "dynamicExecutionObserved", "mutationVerbObserved", "personTokenObserved", "sourceFieldTokenObserved"],
    "PAYROLL_U_INPUTBASEPAY_SOURCE_CATALOG_INVALID",
    "routine catalog shape",
  );
  if (typeof evidence.routineCatalog.exists !== "boolean") {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_CATALOG_INVALID", "routine existence");
  }
  if (!evidence.routineCatalog.exists) {
    if ([
      evidence.routineCatalog.definitionSha256,
      evidence.routineCatalog.dynamicExecutionObserved,
      evidence.routineCatalog.mutationVerbObserved,
      evidence.routineCatalog.personTokenObserved,
      evidence.routineCatalog.sourceFieldTokenObserved,
    ].some((value) => value !== null)) {
      fail("PAYROLL_U_INPUTBASEPAY_SOURCE_CATALOG_INVALID", "absent routine metadata");
    }
  } else if (!SHA256.test(evidence.routineCatalog.definitionSha256 ?? "")
    || [
      evidence.routineCatalog.dynamicExecutionObserved,
      evidence.routineCatalog.mutationVerbObserved,
      evidence.routineCatalog.personTokenObserved,
      evidence.routineCatalog.sourceFieldTokenObserved,
    ].some((value) => typeof value !== "boolean")) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_CATALOG_INVALID", "routine metadata");
  }

  const valueColumnExists = evidence.sourceObject.exists && evidence.sourceObject.valueColumn.exists;
  if (!valueColumnExists) {
    if (evidence.valueAggregate !== null) fail("PAYROLL_U_INPUTBASEPAY_SOURCE_CATALOG_INVALID", "aggregate without source column");
  } else {
    exactKeys(
      evidence.valueAggregate,
      ["totalRows", "nonNullRows", "nullRows"],
      "PAYROLL_U_INPUTBASEPAY_SOURCE_AGGREGATE_INVALID",
      "value aggregate shape",
    );
    for (const key of ["totalRows", "nonNullRows", "nullRows"]) {
      requireCount(evidence.valueAggregate[key], "PAYROLL_U_INPUTBASEPAY_SOURCE_AGGREGATE_INVALID", key);
    }
    if (evidence.valueAggregate.totalRows !== evidence.valueAggregate.nonNullRows + evidence.valueAggregate.nullRows) {
      fail("PAYROLL_U_INPUTBASEPAY_SOURCE_AGGREGATE_INVALID", "null conservation");
    }
  }
  return structuredClone(evidence);
}

function catalogDisposition(evidence) {
  if (!evidence.routineCatalog.exists) return "source_routine_absent";
  if (!evidence.routineCatalog.personTokenObserved || !evidence.routineCatalog.sourceFieldTokenObserved) {
    return "source_routine_field_binding_unobserved";
  }
  if (!evidence.routineCatalog.dynamicExecutionObserved || !evidence.routineCatalog.mutationVerbObserved) {
    return "source_routine_dynamic_write_signature_unobserved";
  }
  if (!evidence.sourceObject.exists) return "source_table_absent";
  if (!evidence.sourceObject.identityColumn.exists) return "source_identity_column_absent";
  if (!evidence.sourceObject.valueColumn.exists) return "source_value_column_absent";
  if (!NUMERIC_SQL_TYPES.includes(evidence.sourceObject.valueColumn.sqlType.toLowerCase())) return "source_value_type_requires_review";
  if (evidence.valueAggregate.totalRows === 0) return "source_table_empty";
  if (evidence.valueAggregate.nonNullRows === 0) return "source_value_column_all_null";
  return "source_catalog_identity_observed";
}

function buildReceipt({
  contract,
  repositoryRoot,
  sourceRestoreReceiptSha256,
  sourceCatalogSha256,
  databaseIdentitySha256,
  evidence,
  evidenceOrigin,
}) {
  const contractEvidence = validateContract(contract, repositoryRoot);
  for (const [label, value] of Object.entries({ sourceRestoreReceiptSha256, sourceCatalogSha256, databaseIdentitySha256 })) {
    requireSha(value, "PAYROLL_U_INPUTBASEPAY_SOURCE_RECEIPT_INVALID", label);
  }
  if (![
    "live_bound_read_only_sqlserver",
    "synthetic_contract_test",
  ].includes(evidenceOrigin)) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_RECEIPT_INVALID", "evidence origin");
  }
  const safeEvidence = validateEvidence(evidence);
  const disposition = catalogDisposition(safeEvidence);
  const liveSourceIdentityVerified = evidenceOrigin === "live_bound_read_only_sqlserver"
    && disposition === "source_catalog_identity_observed";
  const sourceIdentityReason = evidenceOrigin === "synthetic_contract_test"
    ? "synthetic_evidence_not_authoritative"
    : disposition;
  const gapCodes = [
    ...(liveSourceIdentityVerified ? [] : ["PAYROLL_U_INPUTBASEPAY_SOURCE_FIELD_IDENTITY_UNPROVEN"]),
    "PAYROLL_U_INPUTBASEPAY_DYNAMIC_WRITE_SIDE_EFFECT_UNRESOLVED",
    "PAYROLL_U_INPUTBASEPAY_MODERN_TARGET_EQUIVALENCE_UNPROVEN",
  ];
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_payroll_u_inputbasepay_source_receipt",
    scope: contract.scope,
    contractSha256: contractEvidence.contractSha256,
    sourceRestoreReceiptSha256,
    sourceCatalogSha256,
    databaseIdentitySha256,
    queryIdentitySha256: digest(`${PAYROLL_U_INPUTBASEPAY_CATALOG_SQL}\n${PAYROLL_U_INPUTBASEPAY_VALUE_AGGREGATE_SQL}\n`),
    evidenceOrigin,
    sourceState: { readOnly: safeEvidence.databaseReadOnly },
    etlAuthority: safeEvidence.authority,
    sourceObject: safeEvidence.sourceObject.exists && safeEvidence.sourceObject.valueColumn.exists
      ? { ...safeEvidence.sourceObject, valueAggregate: safeEvidence.valueAggregate }
      : { ...safeEvidence.sourceObject, valueAggregate: null },
    routineIdentity: {
      routineId: contractEvidence.routineId,
      sourceName: contractEvidence.sourceName,
      sourceArtifactSha256: contractEvidence.sourceArtifactSha256,
      routineLedgerSha256: contractEvidence.ledgerSha256,
    },
    routineCatalog: safeEvidence.routineCatalog,
    modernCandidate: {
      inputCode: contract.modernCandidate.inputCode,
      mappingSha256: contractEvidence.mappingSha256,
      formulaDslSha256: contractEvidence.dslSha256,
      bindingStatus: "verified_modern_capability_only",
      equivalenceStatus: "pending",
    },
    catalogDisposition: disposition,
    sourceIdentityStatus: liveSourceIdentityVerified ? "verified" : "pending",
    sourceIdentityReason,
    dynamicSqlReviewStatus: "unexecuted_pending_review",
    decision: "KEEP_PENDING",
    status: liveSourceIdentityVerified
      ? "SOURCE_IDENTITY_VERIFIED_EQUIVALENCE_PENDING"
      : "SOURCE_IDENTITY_PENDING",
    gapCodes,
    legacyRoutineExecuted: false,
    legacyDynamicSqlExecuted: false,
    containsPayrollValues: false,
    containsPersonalData: false,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(canonical(body)) };
}

export function buildSyntheticPayrollUInputbasepaySourceReceipt(input) {
  return buildReceipt({ ...input, evidenceOrigin: "synthetic_contract_test" });
}

export function validatePayrollUInputbasepaySourceReceipt(receipt, { contract, repositoryRoot }) {
  exactKeys(
    receipt,
    [...RECEIPT_BODY_KEYS, "receiptSha256"],
    "PAYROLL_U_INPUTBASEPAY_SOURCE_RECEIPT_INVALID",
    "sealed receipt shape",
  );
  const { receiptSha256, ...body } = receipt;
  const contractEvidence = validateContract(contract, repositoryRoot);
  if (receiptSha256 !== digest(canonical(body))) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_RECEIPT_HASH_MISMATCH", "canonical receipt hash");
  }
  exactKeys(body.sourceState, ["readOnly"], "PAYROLL_U_INPUTBASEPAY_SOURCE_RECEIPT_INVALID", "source state shape");
  exactKeys(
    body.sourceObject,
    ["schema", "table", "exists", "identityColumnName", "valueColumnName", "identityColumn", "valueColumn", "valueAggregate"],
    "PAYROLL_U_INPUTBASEPAY_SOURCE_RECEIPT_INVALID",
    "source object shape",
  );
  exactKeys(
    body.routineIdentity,
    ["routineId", "sourceName", "sourceArtifactSha256", "routineLedgerSha256"],
    "PAYROLL_U_INPUTBASEPAY_SOURCE_RECEIPT_INVALID",
    "routine identity shape",
  );
  exactKeys(
    body.modernCandidate,
    ["inputCode", "mappingSha256", "formulaDslSha256", "bindingStatus", "equivalenceStatus"],
    "PAYROLL_U_INPUTBASEPAY_SOURCE_RECEIPT_INVALID",
    "modern candidate shape",
  );
  if (body.formatVersion !== 1
    || body.artifactKind !== "yuzhou_hr_payroll_u_inputbasepay_source_receipt"
    || body.scope !== contract.scope
    || body.contractSha256 !== contractEvidence.contractSha256
    || body.queryIdentitySha256 !== digest(`${PAYROLL_U_INPUTBASEPAY_CATALOG_SQL}\n${PAYROLL_U_INPUTBASEPAY_VALUE_AGGREGATE_SQL}\n`)
    || body.modernCandidate?.inputCode !== "hr:基本工资"
    || body.modernCandidate?.mappingSha256 !== contractEvidence.mappingSha256
    || body.modernCandidate?.formulaDslSha256 !== contractEvidence.dslSha256
    || body.modernCandidate?.bindingStatus !== "verified_modern_capability_only"
    || body.modernCandidate?.equivalenceStatus !== "pending"
    || body.routineIdentity?.routineId !== contractEvidence.routineId
    || body.routineIdentity?.sourceName !== contractEvidence.sourceName
    || body.routineIdentity?.sourceArtifactSha256 !== contractEvidence.sourceArtifactSha256
    || body.routineIdentity?.routineLedgerSha256 !== contractEvidence.ledgerSha256
    || body.sourceState?.readOnly !== true
    || !["live_bound_read_only_sqlserver", "synthetic_contract_test"].includes(body.evidenceOrigin)
    || body.dynamicSqlReviewStatus !== "unexecuted_pending_review"
    || body.decision !== "KEEP_PENDING"
    || body.legacyRoutineExecuted !== false
    || body.legacyDynamicSqlExecuted !== false
    || body.containsPayrollValues !== false
    || body.containsPersonalData !== false
    || body.compatibilityCredit !== 0
    || body.productionImport !== "HOLD") {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_RECEIPT_INVALID", "identity or safety boundary");
  }
  const evidence = validateEvidence({
    databaseIdentity: "YuzhouHR_Lab_receipt_validation",
    databaseReadOnly: body.sourceState.readOnly,
    authority: body.etlAuthority,
    sourceObject: {
      schema: body.sourceObject.schema,
      table: body.sourceObject.table,
      exists: body.sourceObject.exists,
      identityColumnName: body.sourceObject.identityColumnName,
      valueColumnName: body.sourceObject.valueColumnName,
      identityColumn: body.sourceObject.identityColumn,
      valueColumn: body.sourceObject.valueColumn,
    },
    routineCatalog: body.routineCatalog,
    valueAggregate: body.sourceObject.valueAggregate,
  });
  const disposition = catalogDisposition(evidence);
  const verified = body.evidenceOrigin === "live_bound_read_only_sqlserver" && disposition === "source_catalog_identity_observed";
  const expectedGaps = [
    ...(verified ? [] : ["PAYROLL_U_INPUTBASEPAY_SOURCE_FIELD_IDENTITY_UNPROVEN"]),
    "PAYROLL_U_INPUTBASEPAY_DYNAMIC_WRITE_SIDE_EFFECT_UNRESOLVED",
    "PAYROLL_U_INPUTBASEPAY_MODERN_TARGET_EQUIVALENCE_UNPROVEN",
  ];
  if (!same(body.gapCodes, expectedGaps)
    || body.catalogDisposition !== disposition
    || body.sourceIdentityStatus !== (verified ? "verified" : "pending")
    || body.sourceIdentityReason !== (body.evidenceOrigin === "synthetic_contract_test" ? "synthetic_evidence_not_authoritative" : disposition)
    || body.status !== (verified ? "SOURCE_IDENTITY_VERIFIED_EQUIVALENCE_PENDING" : "SOURCE_IDENTITY_PENDING")) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_RECEIPT_INVALID", "status or gap derivation");
  }
  for (const key of [
    "contractSha256",
    "sourceRestoreReceiptSha256",
    "sourceCatalogSha256",
    "databaseIdentitySha256",
    "queryIdentitySha256",
  ]) requireSha(body[key], "PAYROLL_U_INPUTBASEPAY_SOURCE_RECEIPT_INVALID", key);
  return receipt;
}

function parseEnv(filePath) {
  const result = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) fail("PAYROLL_U_INPUTBASEPAY_ETL_LOGIN_INVALID", "ETL envelope is invalid");
    result[line.slice(0, separator)] = line.slice(separator + 1);
  }
  if (!result.YUZHOU_SQLSERVER_ETL_LOGIN
    || !result.YUZHOU_SQLSERVER_ETL_PASSWORD
    || !DATABASE.test(result.YUZHOU_SQLSERVER_DATABASE ?? "")
    || String(result.YUZHOU_SQLSERVER_ETL_LOGIN).toLowerCase() === "sa") {
    fail("PAYROLL_U_INPUTBASEPAY_ETL_LOGIN_INVALID", "minimum read-only ETL envelope required");
  }
  return result;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    input: options.input,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    fail(options.code ?? "PAYROLL_U_INPUTBASEPAY_SOURCE_PROBE_FAILED", options.detail ?? "aggregate source probe failed");
  }
  return String(result.stdout ?? "").replaceAll("\r", "").trim();
}

function requiredBoolean(value, label) {
  if (!/^[01]$/u.test(value ?? "")) fail("PAYROLL_U_INPUTBASEPAY_SOURCE_PROBE_INVALID", label);
  return value === "1";
}

function optionalBoolean(value, label) {
  if (value === "") return null;
  return requiredBoolean(value, label);
}

function optionalInteger(value, label) {
  if (value === "") return null;
  if (!/^-?[0-9]+$/u.test(value ?? "")) fail("PAYROLL_U_INPUTBASEPAY_SOURCE_PROBE_INVALID", label);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) fail("PAYROLL_U_INPUTBASEPAY_SOURCE_PROBE_INVALID", label);
  return number;
}

function parseColumn(fields, offset, label) {
  const exists = requiredBoolean(fields[offset], `${label} existence`);
  if (!exists) {
    if (fields.slice(offset + 1, offset + 7).some((value) => value !== "")) {
      fail("PAYROLL_U_INPUTBASEPAY_SOURCE_PROBE_INVALID", `${label} absent metadata`);
    }
    return { exists: false, sqlType: null, maxLength: null, precision: null, scale: null, nullable: null, computed: null };
  }
  const sqlType = fields[offset + 1];
  if (!sqlType) fail("PAYROLL_U_INPUTBASEPAY_SOURCE_PROBE_INVALID", `${label} SQL type`);
  return {
    exists: true,
    sqlType,
    maxLength: optionalInteger(fields[offset + 2], `${label} max length`),
    precision: optionalInteger(fields[offset + 3], `${label} precision`),
    scale: optionalInteger(fields[offset + 4], `${label} scale`),
    nullable: optionalBoolean(fields[offset + 5], `${label} nullable`),
    computed: optionalBoolean(fields[offset + 6], `${label} computed`),
  };
}

function parseCatalogOutput(output, expectedDatabase) {
  const lines = output.split("\n").filter(Boolean);
  if (lines.length !== 1) fail("PAYROLL_U_INPUTBASEPAY_SOURCE_PROBE_INVALID", "one catalog row required");
  const fields = lines[0].split("|").map((value) => value.trim());
  if (fields.length !== 30 || fields[22] !== expectedDatabase) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_PROBE_INVALID", "catalog row shape or database identity");
  }
  const tableExists = requiredBoolean(fields[0], "source table existence");
  const routineExists = requiredBoolean(fields[15], "source routine existence");
  const authority = {
    loginSucceeded: true,
    sysadmin: requiredBoolean(fields[23], "sysadmin"),
    dbDatareader: requiredBoolean(fields[24], "db_datareader"),
    viewDefinition: requiredBoolean(fields[25], "view definition"),
    insert: requiredBoolean(fields[26], "insert"),
    update: requiredBoolean(fields[27], "update"),
    delete: requiredBoolean(fields[28], "delete"),
    execute: requiredBoolean(fields[29], "execute"),
  };
  validateAuthority(authority);
  if (!routineExists && fields.slice(16, 21).some((value) => value !== "")) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_PROBE_INVALID", "absent routine metadata");
  }
  return {
    databaseIdentity: fields[22],
    databaseReadOnly: requiredBoolean(fields[21], "database read-only"),
    authority,
    sourceObject: {
      schema: "dbo",
      table: "person",
      exists: tableExists,
      identityColumnName: "person",
      valueColumnName: "_base",
      identityColumn: parseColumn(fields, 1, "identity column"),
      valueColumn: parseColumn(fields, 8, "value column"),
    },
    routineCatalog: routineExists ? {
      exists: true,
      definitionSha256: fields[16],
      dynamicExecutionObserved: optionalBoolean(fields[17], "dynamic execution"),
      mutationVerbObserved: optionalBoolean(fields[18], "mutation verb"),
      personTokenObserved: optionalBoolean(fields[19], "person token"),
      sourceFieldTokenObserved: optionalBoolean(fields[20], "source field token"),
    } : {
      exists: false,
      definitionSha256: null,
      dynamicExecutionObserved: null,
      mutationVerbObserved: null,
      personTokenObserved: null,
      sourceFieldTokenObserved: null,
    },
  };
}

function parseValueAggregateOutput(output) {
  const lines = output.split("\n").filter(Boolean);
  if (lines.length !== 1) fail("PAYROLL_U_INPUTBASEPAY_SOURCE_PROBE_INVALID", "one aggregate row required");
  const fields = lines[0].split("|").map((value) => value.trim());
  if (fields.length !== 2 || fields.some((value) => !/^[0-9]+$/u.test(value))) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_PROBE_INVALID", "aggregate row shape");
  }
  const totalRows = Number(fields[0]);
  const nonNullRows = Number(fields[1]);
  requireCount(totalRows, "PAYROLL_U_INPUTBASEPAY_SOURCE_PROBE_INVALID", "total rows");
  requireCount(nonNullRows, "PAYROLL_U_INPUTBASEPAY_SOURCE_PROBE_INVALID", "non-null rows");
  if (nonNullRows > totalRows) fail("PAYROLL_U_INPUTBASEPAY_SOURCE_PROBE_INVALID", "non-null count exceeds total");
  return { totalRows, nonNullRows, nullRows: totalRows - nonNullRows };
}

export function createDefaultPayrollUInputbasepaySourceProbe({ etlEnvFile }) {
  const credentialPath = privateFile(etlEnvFile, "ETL envelope");
  const env = parseEnv(credentialPath);
  const query = (sourceContainer, databaseAlias, sql) => run(
    "docker",
    [
      "exec",
      "-i",
      sourceContainer,
      "bash",
      "-lc",
      'IFS= read -r SQLCMDPASSWORD; export SQLCMDPASSWORD; exec /opt/mssql-tools18/bin/sqlcmd -b -V 16 -C -S localhost -U "$1" -d "$2" -h -1 -W -s "|" -Q "$3"',
      "q",
      env.YUZHOU_SQLSERVER_ETL_LOGIN,
      databaseAlias,
      sql,
    ],
    {
      input: `${env.YUZHOU_SQLSERVER_ETL_PASSWORD}\n`,
      code: "PAYROLL_U_INPUTBASEPAY_SOURCE_PROBE_FAILED",
      detail: "minimum read-only aggregate probe failed",
    },
  );
  return {
    [LIVE_PROBE]: true,
    inspectEvidence({ sourceContainer, databaseAlias }) {
      if (!CONTAINER.test(sourceContainer ?? "")
        || !DATABASE.test(databaseAlias ?? "")
        || env.YUZHOU_SQLSERVER_DATABASE !== databaseAlias) {
        fail("PAYROLL_U_INPUTBASEPAY_SOURCE_IDENTITY_INVALID", "source container or database binding");
      }
      const catalog = parseCatalogOutput(
        query(sourceContainer, databaseAlias, PAYROLL_U_INPUTBASEPAY_CATALOG_SQL),
        databaseAlias,
      );
      const valueAggregate = catalog.sourceObject.exists && catalog.sourceObject.valueColumn.exists
        ? parseValueAggregateOutput(query(sourceContainer, databaseAlias, PAYROLL_U_INPUTBASEPAY_VALUE_AGGREGATE_SQL))
        : null;
      return { ...catalog, valueAggregate };
    },
  };
}

function loadContract(contractPath, repositoryRoot) {
  const raw = readFileSync(contractPath);
  const contract = parseJson(raw, "PAYROLL_U_INPUTBASEPAY_CONTRACT_INVALID", "contract JSON");
  validateContract(contract, repositoryRoot);
  return { contract, sha256: digest(canonical(contract)) };
}

function readRestoreReceipt(receiptPath, expectedSha256) {
  const safePath = privateFile(receiptPath, "source restore receipt");
  if (sourceRestoreReceiptFileHash(safePath) !== expectedSha256) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_RESTORE_RECEIPT_DRIFT", "source restore receipt bytes");
  }
  return validateSourceRestoreReceipt(parseJson(
    readFileSync(safePath, "utf8"),
    "PAYROLL_U_INPUTBASEPAY_SOURCE_RESTORE_RECEIPT_INVALID",
    "source restore receipt JSON",
  ));
}

export function capturePayrollUInputbasepaySourceReceipt(input, { probe }) {
  exactKeys(
    input,
    ["sourceRestoreReceiptPath", "sourceRestoreReceiptSha256", "contractPath", "repositoryRoot", "sourceContainer", "databaseAlias", "receiptPath"],
    "PAYROLL_U_INPUTBASEPAY_SOURCE_CAPTURE_INVALID",
    "capture input",
  );
  requireSha(input.sourceRestoreReceiptSha256, "PAYROLL_U_INPUTBASEPAY_SOURCE_CAPTURE_INVALID", "source restore receipt hash");
  if (!probe || typeof probe.inspectEvidence !== "function") {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_CAPTURE_INVALID", "source probe");
  }
  const restoreReceipt = readRestoreReceipt(input.sourceRestoreReceiptPath, input.sourceRestoreReceiptSha256);
  const { contract } = loadContract(input.contractPath, input.repositoryRoot);
  const evidence = validateEvidence(probe.inspectEvidence(input));
  if (evidence.databaseIdentity !== input.databaseAlias
    || digest(input.databaseAlias) !== restoreReceipt.identities.databaseSha256
    || evidence.databaseReadOnly !== true) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_IDENTITY_INVALID", "source receipt or live database binding");
  }
  const receipt = buildReceipt({
    contract,
    repositoryRoot: input.repositoryRoot,
    sourceRestoreReceiptSha256: input.sourceRestoreReceiptSha256,
    sourceCatalogSha256: restoreReceipt.identities.catalogSha256,
    databaseIdentitySha256: restoreReceipt.identities.databaseSha256,
    evidence,
    evidenceOrigin: probe[LIVE_PROBE] === true
      ? "live_bound_read_only_sqlserver"
      : "synthetic_contract_test",
  });
  writeFileSync(input.receiptPath, canonical(receipt), { flag: "wx", mode: 0o600 });
  chmodSync(input.receiptPath, 0o600);
  return { receipt, receiptSha256: digest(canonical(receipt)), productionImport: "HOLD" };
}

export function verifyPayrollUInputbasepaySourceReceiptFile(input, { probe, recheckLive = true } = {}) {
  exactKeys(
    input,
    ["receiptPath", "receiptSha256", "sourceRestoreReceiptPath", "sourceRestoreReceiptSha256", "contractPath", "repositoryRoot", "sourceContainer", "databaseAlias"],
    "PAYROLL_U_INPUTBASEPAY_SOURCE_VERIFY_INVALID",
    "verify input",
  );
  for (const key of ["receiptSha256", "sourceRestoreReceiptSha256"]) {
    requireSha(input[key], "PAYROLL_U_INPUTBASEPAY_SOURCE_VERIFY_INVALID", key);
  }
  const receiptPath = privateFile(input.receiptPath, "u_inputbasepay source receipt");
  const raw = readFileSync(receiptPath);
  if (digest(raw) !== input.receiptSha256) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_RECEIPT_HASH_MISMATCH", "receipt file bytes");
  }
  const { contract } = loadContract(input.contractPath, input.repositoryRoot);
  const receipt = validatePayrollUInputbasepaySourceReceipt(
    parseJson(raw, "PAYROLL_U_INPUTBASEPAY_SOURCE_RECEIPT_INVALID", "receipt JSON"),
    { contract, repositoryRoot: input.repositoryRoot },
  );
  const restoreReceipt = readRestoreReceipt(input.sourceRestoreReceiptPath, input.sourceRestoreReceiptSha256);
  if (receipt.sourceRestoreReceiptSha256 !== input.sourceRestoreReceiptSha256
    || receipt.sourceCatalogSha256 !== restoreReceipt.identities.catalogSha256
    || receipt.databaseIdentitySha256 !== restoreReceipt.identities.databaseSha256
    || digest(input.databaseAlias) !== receipt.databaseIdentitySha256) {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_BINDING_MISMATCH", "restore, catalog, or database identity");
  }
  if (recheckLive) {
    if (!probe || probe[LIVE_PROBE] !== true || typeof probe.inspectEvidence !== "function") {
      fail("PAYROLL_U_INPUTBASEPAY_SOURCE_LIVE_RECHECK_REQUIRED", "default live read-only probe required");
    }
    const currentEvidence = validateEvidence(probe.inspectEvidence(input));
    const receiptEvidence = {
      databaseIdentity: input.databaseAlias,
      databaseReadOnly: receipt.sourceState.readOnly,
      authority: receipt.etlAuthority,
      sourceObject: {
        schema: receipt.sourceObject.schema,
        table: receipt.sourceObject.table,
        exists: receipt.sourceObject.exists,
        identityColumnName: receipt.sourceObject.identityColumnName,
        valueColumnName: receipt.sourceObject.valueColumnName,
        identityColumn: receipt.sourceObject.identityColumn,
        valueColumn: receipt.sourceObject.valueColumn,
      },
      routineCatalog: receipt.routineCatalog,
      valueAggregate: receipt.sourceObject.valueAggregate,
    };
    if (!same(currentEvidence, receiptEvidence)) {
      fail("PAYROLL_U_INPUTBASEPAY_SOURCE_CATALOG_DRIFT", "live catalog or aggregate differs from receipt");
    }
  } else if (receipt.sourceIdentityStatus === "verified") {
    fail("PAYROLL_U_INPUTBASEPAY_SOURCE_LIVE_RECHECK_REQUIRED", "verified source identity cannot be accepted offline");
  }
  return {
    receipt,
    receiptSha256: input.receiptSha256,
    liveRechecked: recheckLive,
    productionImport: "HOLD",
  };
}

function args(argv) {
  const result = {};
  const allowed = new Set([
    "--source-receipt",
    "--source-receipt-sha",
    "--contract",
    "--source-container",
    "--database",
    "--etl-env",
    "--receipt",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!allowed.has(key) || index + 1 >= argv.length || Object.hasOwn(result, key)) {
      fail("PAYROLL_U_INPUTBASEPAY_SOURCE_ARGUMENT_INVALID", key);
    }
    result[key] = argv[++index];
  }
  for (const key of allowed) {
    if (key === "--contract") continue;
    if (!result[key]) fail("PAYROLL_U_INPUTBASEPAY_SOURCE_ARGUMENT_MISSING", key);
  }
  return result;
}

async function main() {
  const input = args(process.argv.slice(2));
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const probe = createDefaultPayrollUInputbasepaySourceProbe({ etlEnvFile: resolve(input["--etl-env"]) });
  const result = capturePayrollUInputbasepaySourceReceipt({
    sourceRestoreReceiptPath: resolve(input["--source-receipt"]),
    sourceRestoreReceiptSha256: input["--source-receipt-sha"],
    contractPath: resolve(input["--contract"] ?? DEFAULT_CONTRACT),
    repositoryRoot,
    sourceContainer: input["--source-container"],
    databaseAlias: input["--database"],
    receiptPath: resolve(input["--receipt"]),
  }, { probe });
  process.stdout.write(`${JSON.stringify({
    status: result.receipt.status,
    sourceIdentityStatus: result.receipt.sourceIdentityStatus,
    receiptSha256: result.receiptSha256,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  })}\n`);
}

if (process.argv[1]
  && existsSync(process.argv[1])
  && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.code ?? "PAYROLL_U_INPUTBASEPAY_SOURCE_FAILED"}: ${String(error.message).replace(/^.*?: /u, "")}\n`);
    process.exitCode = 1;
  });
}
