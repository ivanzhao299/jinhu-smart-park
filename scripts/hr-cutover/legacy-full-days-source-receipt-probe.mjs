#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA256 = /^[a-f0-9]{64}$/u;
const LEDGER_PATH = "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json";
const EXPECTED_ROUTINE = Object.freeze({
  routineId: "RULE-BD491199DA9913BE",
  schema: "dbo",
  sourceName: "FullDays",
  kind: "function",
  sourceArtifactSha256: "44c06a473845d44f83f9f5321a90486759a0ab6eb4ec6cf2a8c77bbbd9c5a235",
  structuralHash: "26089ed60c6a7ad83b2c6cc5e1e848efc30b995a8eb2de3497029e4817665cce",
  primaryDomain: "attendance_leave",
  parityRisk: "medium",
  inputParameterCount: 3,
  inputParameterSetSha256: "ab12392999eceb14aa91a30c92c1daaaef46421c4234014200343727344c0222",
  readDependencyCount: 2,
  readDependencySetSha256: "b2f69a4d813a1daa00a987f7ae865a87e310a45e34e2255ce62cac4aa29e7fc0",
  calledRoutineCount: 0,
  calledRoutineSetSha256: "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570",
  writeDependencyCount: 0,
  dynamicWriteDependencyCount: 0,
  dynamicMutationStatus: "none",
});

// The definition, parameter metadata, return metadata and dependency names are
// hashed inside SQL Server. The query returns no module body, parameter value,
// dependency name or business row. The legacy function is never invoked.
export const LEGACY_FULL_DAYS_CATALOG_SQL = `SET NOCOUNT ON;
DECLARE @routine_object_id int=OBJECT_ID(N'dbo.FullDays');
SELECT
  CONVERT(varchar(1),source_database.is_read_only),
  CONVERT(varchar(1),COALESCE(IS_SRVROLEMEMBER('sysadmin'),0)),
  CONVERT(varchar(1),COALESCE(IS_ROLEMEMBER('db_datareader'),0)),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION')),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','INSERT')),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','UPDATE')),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','DELETE')),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','EXECUTE')),
  CONVERT(varchar(1),CASE WHEN @routine_object_id IS NULL THEN 0 ELSE 1 END),
  COALESCE(routine_object.type,''),
  COALESCE(LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),routine_module.definition)),2)),''),
  COALESCE(CONVERT(varchar(12),(SELECT COUNT_BIG(*) FROM sys.parameters WHERE object_id=@routine_object_id AND parameter_id>0)),''),
  COALESCE(LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),COALESCE((SELECT CONCAT(parameter_id,':',TYPE_NAME(user_type_id),':',max_length,':',precision,':',scale,':',is_output,';') FROM sys.parameters WHERE object_id=@routine_object_id AND parameter_id>0 ORDER BY parameter_id FOR XML PATH(''),TYPE).value('.','nvarchar(max)'),''))),2)),''),
  CONVERT(varchar(1),CASE WHEN EXISTS(SELECT 1 FROM sys.parameters WHERE object_id=@routine_object_id AND parameter_id=0) THEN 1 ELSE 0 END),
  COALESCE(LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),COALESCE((SELECT CONCAT(TYPE_NAME(user_type_id),':',max_length,':',precision,':',scale) FROM sys.parameters WHERE object_id=@routine_object_id AND parameter_id=0),''))),2)),''),
  COALESCE(CONVERT(varchar(12),(SELECT COUNT_BIG(DISTINCT referenced_id) FROM sys.sql_expression_dependencies WHERE referencing_id=@routine_object_id AND referenced_id IS NOT NULL)),''),
  COALESCE(LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),COALESCE((SELECT CONCAT(COALESCE(referenced_schema_name,''),':',COALESCE(referenced_entity_name,''),':',COALESCE(referenced_class_desc,''),';') FROM sys.sql_expression_dependencies WHERE referencing_id=@routine_object_id ORDER BY referenced_schema_name,referenced_entity_name,referenced_class_desc FOR XML PATH(''),TYPE).value('.','nvarchar(max)'),''))),2)),''),
  COALESCE(CONVERT(varchar(12),(SELECT COUNT_BIG(DISTINCT dependency.referenced_id) FROM sys.sql_expression_dependencies dependency JOIN sys.tables dependency_table ON dependency_table.object_id=dependency.referenced_id WHERE dependency.referencing_id=@routine_object_id)),''),
  COALESCE(CONVERT(varchar(12),(SELECT COUNT_BIG(*) FROM (SELECT dependency.referenced_id FROM sys.sql_expression_dependencies dependency JOIN sys.tables dependency_table ON dependency_table.object_id=dependency.referenced_id LEFT JOIN (SELECT object_id,SUM(rows) AS row_count FROM sys.partitions WHERE index_id IN (0,1) GROUP BY object_id) row_rollup ON row_rollup.object_id=dependency.referenced_id WHERE dependency.referencing_id=@routine_object_id GROUP BY dependency.referenced_id HAVING COALESCE(MAX(row_rollup.row_count),0)=0) empty_dependencies)),''),
  COALESCE(CONVERT(varchar(30),(SELECT SUM(COALESCE(row_rollup.row_count,0)) FROM (SELECT DISTINCT referenced_id FROM sys.sql_expression_dependencies WHERE referencing_id=@routine_object_id AND referenced_id IS NOT NULL) dependency JOIN sys.tables dependency_table ON dependency_table.object_id=dependency.referenced_id LEFT JOIN (SELECT object_id,SUM(rows) AS row_count FROM sys.partitions WHERE index_id IN (0,1) GROUP BY object_id) row_rollup ON row_rollup.object_id=dependency.referenced_id)),''),
  COALESCE(CONVERT(varchar(12),(SELECT COUNT_BIG(DISTINCT dependency.referenced_id) FROM sys.sql_expression_dependencies dependency JOIN sys.objects called_object ON called_object.object_id=dependency.referenced_id WHERE dependency.referencing_id=@routine_object_id AND called_object.type IN ('P','PC','FN','FS','IF','TF','FT'))),''),
  COALESCE(LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),COALESCE((SELECT CONCAT(COALESCE(dependency.referenced_schema_name,''),':',COALESCE(dependency.referenced_entity_name,''),';') FROM sys.sql_expression_dependencies dependency JOIN sys.objects called_object ON called_object.object_id=dependency.referenced_id WHERE dependency.referencing_id=@routine_object_id AND called_object.type IN ('P','PC','FN','FS','IF','TF','FT') ORDER BY dependency.referenced_schema_name,dependency.referenced_entity_name FOR XML PATH(''),TYPE).value('.','nvarchar(max)'),''))),2)),''),
  CASE WHEN routine_module.definition IS NULL THEN '' WHEN CHARINDEX(N'is null',LOWER(routine_module.definition))>0 OR CHARINDEX(N'isnull(',LOWER(routine_module.definition))>0 OR CHARINDEX(N'coalesce(',LOWER(routine_module.definition))>0 THEN '1' ELSE '0' END,
  CASE WHEN routine_module.definition IS NULL THEN '' WHEN CHARINDEX(N'case ',LOWER(routine_module.definition))>0 OR CHARINDEX(N'if ',LOWER(routine_module.definition))>0 THEN '1' ELSE '0' END,
  CASE WHEN routine_module.definition IS NULL THEN '' WHEN CHARINDEX(N'exec(',LOWER(routine_module.definition))>0 OR CHARINDEX(N'exec (',LOWER(routine_module.definition))>0 OR CHARINDEX(N'sp_executesql',LOWER(routine_module.definition))>0 THEN '1' ELSE '0' END,
  CASE WHEN routine_module.definition IS NULL THEN '' WHEN CHARINDEX(N'insert ',LOWER(routine_module.definition))>0 OR CHARINDEX(N'update ',LOWER(routine_module.definition))>0 OR CHARINDEX(N'delete ',LOWER(routine_module.definition))>0 OR CHARINDEX(N'merge ',LOWER(routine_module.definition))>0 THEN '1' ELSE '0' END
FROM sys.databases source_database
LEFT JOIN sys.objects routine_object ON routine_object.object_id=@routine_object_id
LEFT JOIN sys.sql_modules routine_module ON routine_module.object_id=@routine_object_id
WHERE source_database.name=DB_NAME();`;

export class LegacyFullDaysSourceReceiptError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyFullDaysSourceReceiptError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new LegacyFullDaysSourceReceiptError(code, detail);
};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, expected, code, label) => {
  if (!object(value) || !same(Object.keys(value).sort(), [...expected].sort())) fail(code, label);
};
const requireSha = (value, code, label) => {
  if (!SHA256.test(value ?? "")) fail(code, label);
};

function validateContract(contract, repositoryRoot) {
  if (
    !object(contract) ||
    contract.formatVersion !== 1 ||
    contract.contractKind !== "yuzhou_hr_legacy_full_days_source_receipt" ||
    contract.scope !== "attendance_leave_full_days_single_routine_source_catalog" ||
    contract.sourceEvidence?.routineLedger?.path !== LEDGER_PATH ||
    !same(contract.sourceEvidence?.routine, EXPECTED_ROUTINE) ||
    !same(contract.catalogProbe, {
      routineIdentityEvidence: "existence_object_type_definition_hash_only",
      inputEvidence: "anonymous_count_and_parameter_signature_hash_only",
      outputEvidence: "return_signature_hash_only",
      dependencyEvidence: "anonymous_counts_identity_hash_and_catalog_row_aggregates_only",
      emptyPathEvidence: "anonymous_zero_counts_and_boolean_tokens_only",
    }) ||
    !same(contract.authorityPolicy, {
      databaseReadOnly: true,
      sysadmin: false,
      dbDatareader: true,
      viewDefinition: true,
      insert: false,
      update: false,
      delete: false,
      execute: false,
    }) ||
    !same(contract.executionPolicy, {
      legacyRoutineExecution: "FORBIDDEN",
      legacyDynamicSqlExecution: "FORBIDDEN",
      moduleBodyExport: "FORBIDDEN",
      parameterValues: "FORBIDDEN",
      dependencyRowValues: "FORBIDDEN",
    }) ||
    contract.decision !== "KEEP_PENDING" ||
    contract.compatibilityCredit !== 0 ||
    contract.containsPersonalData !== false ||
    contract.productionImport !== "HOLD"
  ) {
    fail("FULL_DAYS_CONTRACT_INVALID", "identity or safety boundary");
  }
  requireSha(contract.sourceEvidence.routineLedger.sha256, "FULL_DAYS_CONTRACT_INVALID", "ledger hash");
  const ledgerBytes = readFileSync(resolve(repositoryRoot, LEDGER_PATH));
  if (digest(ledgerBytes) !== contract.sourceEvidence.routineLedger.sha256) {
    fail("FULL_DAYS_SOURCE_LEDGER_DRIFT", "routine ledger bytes");
  }
  const ledger = JSON.parse(ledgerBytes.toString("utf8"));
  const row = ledger.routines?.find((item) => item.routineId === EXPECTED_ROUTINE.routineId);
  const parameterSetSha256 = digest(canonical(row?.parameters));
  const dependencySetSha256 = digest(canonical([...(row?.readTables ?? [])].sort()));
  const calledSetSha256 = digest(canonical([...(row?.calledRoutines ?? [])].sort()));
  if (
    ledger.summary?.sourceRoutines !== 212 ||
    !row ||
    row.sourceName !== EXPECTED_ROUTINE.sourceName ||
    row.kind !== EXPECTED_ROUTINE.kind ||
    row.sourceArtifactSha256 !== EXPECTED_ROUTINE.sourceArtifactSha256 ||
    row.structuralHash !== EXPECTED_ROUTINE.structuralHash ||
    row.primaryDomain !== EXPECTED_ROUTINE.primaryDomain ||
    row.parityRisk !== EXPECTED_ROUTINE.parityRisk ||
    row.parameters?.length !== EXPECTED_ROUTINE.inputParameterCount ||
    parameterSetSha256 !== EXPECTED_ROUTINE.inputParameterSetSha256 ||
    row.readTables?.length !== EXPECTED_ROUTINE.readDependencyCount ||
    dependencySetSha256 !== EXPECTED_ROUTINE.readDependencySetSha256 ||
    row.calledRoutines?.length !== EXPECTED_ROUTINE.calledRoutineCount ||
    calledSetSha256 !== EXPECTED_ROUTINE.calledRoutineSetSha256 ||
    row.writeTables?.length !== 0 ||
    row.dynamicWriteTables?.length !== 0 ||
    row.dynamicMutationStatus !== "none" ||
    !same(row.statementProfile, { select: 1, insert: 0, update: 0, delete: 0, merge: 0, alter: 0 })
  ) {
    fail("FULL_DAYS_SOURCE_ROUTINE_DRIFT", "routine ledger identity");
  }
  return { ledgerSha256: digest(ledgerBytes), row };
}

function validateAuthority(authority) {
  exactKeys(
    authority,
    ["sysadmin", "dbDatareader", "viewDefinition", "insert", "update", "delete", "execute"],
    "FULL_DAYS_AUTHORITY_INVALID",
    "authority shape",
  );
  if (
    !same(authority, {
      sysadmin: false,
      dbDatareader: true,
      viewDefinition: true,
      insert: false,
      update: false,
      delete: false,
      execute: false,
    })
  ) {
    fail("FULL_DAYS_AUTHORITY_INVALID", "least privilege read-only authority required");
  }
}

function validateEvidence(evidence) {
  exactKeys(
    evidence,
    [
      "databaseReadOnly",
      "authority",
      "routineCatalog",
      "inputCatalog",
      "outputCatalog",
      "dependencyCatalog",
      "emptyPathCatalog",
    ],
    "FULL_DAYS_EVIDENCE_INVALID",
    "evidence shape",
  );
  if (evidence.databaseReadOnly !== true) fail("FULL_DAYS_EVIDENCE_INVALID", "read-only database");
  validateAuthority(evidence.authority);
  exactKeys(
    evidence.routineCatalog,
    ["exists", "objectType", "definitionSha256", "dynamicExecutionTokenObserved", "mutationTokenObserved"],
    "FULL_DAYS_EVIDENCE_INVALID",
    "routine catalog",
  );
  if (
    evidence.routineCatalog.exists !== true ||
    !["FN", "FS"].includes(evidence.routineCatalog.objectType) ||
    !SHA256.test(evidence.routineCatalog.definitionSha256 ?? "") ||
    evidence.routineCatalog.dynamicExecutionTokenObserved !== false ||
    evidence.routineCatalog.mutationTokenObserved !== false
  ) {
    fail("FULL_DAYS_EVIDENCE_INVALID", "routine identity");
  }
  exactKeys(evidence.inputCatalog, ["count", "signatureSha256"], "FULL_DAYS_EVIDENCE_INVALID", "input catalog");
  if (!Number.isSafeInteger(evidence.inputCatalog.count) || evidence.inputCatalog.count < 0 || !SHA256.test(evidence.inputCatalog.signatureSha256 ?? "")) {
    fail("FULL_DAYS_EVIDENCE_INVALID", "input catalog");
  }
  exactKeys(evidence.outputCatalog, ["exists", "signatureSha256"], "FULL_DAYS_EVIDENCE_INVALID", "output catalog");
  if (typeof evidence.outputCatalog.exists !== "boolean" || (evidence.outputCatalog.exists !== SHA256.test(evidence.outputCatalog.signatureSha256 ?? ""))) {
    fail("FULL_DAYS_EVIDENCE_INVALID", "output catalog");
  }
  exactKeys(
    evidence.dependencyCatalog,
    ["count", "identitySetSha256", "tableCount", "emptyTableCount", "totalRows"],
    "FULL_DAYS_EVIDENCE_INVALID",
    "dependency catalog",
  );
  if (
    !Number.isSafeInteger(evidence.dependencyCatalog.count) ||
    evidence.dependencyCatalog.count < 0 ||
    !SHA256.test(evidence.dependencyCatalog.identitySetSha256 ?? "") ||
    !Number.isSafeInteger(evidence.dependencyCatalog.tableCount) ||
    evidence.dependencyCatalog.tableCount < 0 ||
    !Number.isSafeInteger(evidence.dependencyCatalog.emptyTableCount) ||
    evidence.dependencyCatalog.emptyTableCount < 0 ||
    evidence.dependencyCatalog.emptyTableCount > evidence.dependencyCatalog.tableCount ||
    !Number.isSafeInteger(evidence.dependencyCatalog.totalRows) ||
    evidence.dependencyCatalog.totalRows < 0
  ) {
    fail("FULL_DAYS_EVIDENCE_INVALID", "dependency aggregate");
  }
  exactKeys(
    evidence.emptyPathCatalog,
    ["calledRoutineCount", "calledRoutineSetSha256", "nullGuardTokenObserved", "conditionalBranchTokenObserved"],
    "FULL_DAYS_EVIDENCE_INVALID",
    "empty path catalog",
  );
  if (
    !Number.isSafeInteger(evidence.emptyPathCatalog.calledRoutineCount) ||
    evidence.emptyPathCatalog.calledRoutineCount < 0 ||
    !SHA256.test(evidence.emptyPathCatalog.calledRoutineSetSha256 ?? "") ||
    typeof evidence.emptyPathCatalog.nullGuardTokenObserved !== "boolean" ||
    typeof evidence.emptyPathCatalog.conditionalBranchTokenObserved !== "boolean"
  ) {
    fail("FULL_DAYS_EVIDENCE_INVALID", "empty path catalog");
  }
  return structuredClone(evidence);
}

export function buildLegacyFullDaysSourceReceipt({
  contract,
  repositoryRoot,
  sourceRestoreReceiptSha256,
  databaseIdentitySha256,
  evidenceOrigin,
  evidence,
}) {
  const source = validateContract(contract, repositoryRoot);
  requireSha(sourceRestoreReceiptSha256, "FULL_DAYS_RECEIPT_INVALID", "source restore receipt hash");
  requireSha(databaseIdentitySha256, "FULL_DAYS_RECEIPT_INVALID", "database identity hash");
  if (!["synthetic_contract_test", "live_read_only_catalog_probe"].includes(evidenceOrigin)) {
    fail("FULL_DAYS_RECEIPT_INVALID", "evidence origin");
  }
  const safeEvidence = validateEvidence(evidence);
  const isLive = evidenceOrigin === "live_read_only_catalog_probe";
  const ledgerMatch = {
    inputParameterCount: safeEvidence.inputCatalog.count === EXPECTED_ROUTINE.inputParameterCount,
    readDependencyCount: safeEvidence.dependencyCatalog.count === EXPECTED_ROUTINE.readDependencyCount,
    calledRoutineCount: safeEvidence.emptyPathCatalog.calledRoutineCount === EXPECTED_ROUTINE.calledRoutineCount,
  };
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_full_days_source_receipt",
    scope: contract.scope,
    evidenceOrigin,
    sourceRestoreReceiptSha256,
    databaseIdentitySha256,
    routineLedgerSha256: source.ledgerSha256,
    queryIdentitySha256: digest(`${LEGACY_FULL_DAYS_CATALOG_SQL}\n`),
    sourceState: { readOnly: safeEvidence.databaseReadOnly },
    etlAuthority: safeEvidence.authority,
    routineIdentity: {
      routineId: source.row.routineId,
      schema: EXPECTED_ROUTINE.schema,
      sourceName: source.row.sourceName,
      sourceArtifactSha256: source.row.sourceArtifactSha256,
      structuralHash: source.row.structuralHash,
    },
    routineCatalog: safeEvidence.routineCatalog,
    inputCatalog: safeEvidence.inputCatalog,
    outputCatalog: safeEvidence.outputCatalog,
    dependencyCatalog: safeEvidence.dependencyCatalog,
    emptyPathCatalog: safeEvidence.emptyPathCatalog,
    ledgerMatch,
    sourceCatalogStatus: isLive ? "captured_read_only" : "pending_live_read_only_capture",
    semanticParityStatus: "pending",
    decision: "KEEP_PENDING",
    status: isLive
      ? "SOURCE_CATALOG_CAPTURED_SEMANTIC_PARITY_PENDING"
      : "SOURCE_RECEIPT_PENDING_LIVE_PROBE",
    gapCodes: isLive
      ? ["FULL_DAYS_SEMANTIC_PARITY_PENDING"]
      : ["FULL_DAYS_LIVE_SOURCE_RECEIPT_MISSING", "FULL_DAYS_SEMANTIC_PARITY_PENDING"],
    legacyRoutineExecuted: false,
    legacyDynamicSqlExecuted: false,
    moduleBodyIncluded: false,
    parameterValuesIncluded: false,
    dependencyRowValuesIncluded: false,
    containsPersonalData: false,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(canonical(body)) };
}

export function validateLegacyFullDaysSourceReceipt(receipt, { contract, repositoryRoot }) {
  const source = validateContract(contract, repositoryRoot);
  if (!object(receipt) || !SHA256.test(receipt.receiptSha256 ?? "")) {
    fail("FULL_DAYS_RECEIPT_INVALID", "receipt shape");
  }
  const { receiptSha256, ...body } = receipt;
  if (receiptSha256 !== digest(canonical(body))) fail("FULL_DAYS_RECEIPT_HASH_MISMATCH", "receipt hash");
  const isLive = body.evidenceOrigin === "live_read_only_catalog_probe";
  const expectedStatus = isLive
    ? "SOURCE_CATALOG_CAPTURED_SEMANTIC_PARITY_PENDING"
    : "SOURCE_RECEIPT_PENDING_LIVE_PROBE";
  const expectedGaps = isLive
    ? ["FULL_DAYS_SEMANTIC_PARITY_PENDING"]
    : ["FULL_DAYS_LIVE_SOURCE_RECEIPT_MISSING", "FULL_DAYS_SEMANTIC_PARITY_PENDING"];
  if (
    body.artifactKind !== "yuzhou_hr_legacy_full_days_source_receipt" ||
    body.scope !== contract.scope ||
    !["synthetic_contract_test", "live_read_only_catalog_probe"].includes(body.evidenceOrigin) ||
    body.routineLedgerSha256 !== source.ledgerSha256 ||
    body.sourceCatalogStatus !== (isLive ? "captured_read_only" : "pending_live_read_only_capture") ||
    body.semanticParityStatus !== "pending" ||
    body.decision !== "KEEP_PENDING" ||
    body.status !== expectedStatus ||
    !same(body.gapCodes, expectedGaps) ||
    body.legacyRoutineExecuted !== false ||
    body.legacyDynamicSqlExecuted !== false ||
    body.moduleBodyIncluded !== false ||
    body.parameterValuesIncluded !== false ||
    body.dependencyRowValuesIncluded !== false ||
    body.containsPersonalData !== false ||
    body.compatibilityCredit !== 0 ||
    body.productionImport !== "HOLD"
  ) {
    fail("FULL_DAYS_RECEIPT_INVALID", "receipt safety boundary");
  }
  const safeEvidence = validateEvidence({
    databaseReadOnly: body.sourceState?.readOnly,
    authority: body.etlAuthority,
    routineCatalog: body.routineCatalog,
    inputCatalog: body.inputCatalog,
    outputCatalog: body.outputCatalog,
    dependencyCatalog: body.dependencyCatalog,
    emptyPathCatalog: body.emptyPathCatalog,
  });
  const expectedLedgerMatch = {
    inputParameterCount: safeEvidence.inputCatalog.count === EXPECTED_ROUTINE.inputParameterCount,
    readDependencyCount: safeEvidence.dependencyCatalog.count === EXPECTED_ROUTINE.readDependencyCount,
    calledRoutineCount: safeEvidence.emptyPathCatalog.calledRoutineCount === EXPECTED_ROUTINE.calledRoutineCount,
  };
  if (!same(body.ledgerMatch, expectedLedgerMatch)) fail("FULL_DAYS_RECEIPT_INVALID", "ledger match flags");
  return structuredClone(receipt);
}
