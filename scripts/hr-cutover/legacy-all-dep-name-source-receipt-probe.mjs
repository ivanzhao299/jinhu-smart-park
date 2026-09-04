#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA256 = /^[a-f0-9]{64}$/u;
const LEDGER_PATH = "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json";
const EXPECTED_ROUTINE = {
  routineId: "RULE-2B08731BDD24B21F",
  schema: "dbo",
  sourceName: "AllDepName",
  kind: "function",
  sourceArtifactSha256: "b3350ff1b27d7713e272986878646809083a63517982078249a6fcbcff725c6d",
  structuralHash: "9e5d422e0e4a342fe2a728772c2c78ee94915497151c3f745aa42f5c0eb48a48",
  primaryDomain: "organization_position",
  businessCapability: "reference_label_or_search_helper",
  parameterCount: 2,
  readTables: ["departmentcode"],
  writeTables: [],
  dynamicMutationStatus: "none",
};

// This query returns catalog facts and hashes only. The module definition is
// hashed inside SQL Server and is never selected. The legacy function is not
// invoked, and EXECUTE authority must be absent.
export const LEGACY_ALL_DEP_NAME_CATALOG_SQL = `SET NOCOUNT ON;
DECLARE @routine_object_id int=OBJECT_ID(N'dbo.AllDepName');
DECLARE @dependency_object_id int=OBJECT_ID(N'dbo.departmentcode',N'U');
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
  CASE WHEN routine_module.definition IS NULL THEN '' WHEN CHARINDEX(N'exec(',LOWER(routine_module.definition))>0 OR CHARINDEX(N'exec (',LOWER(routine_module.definition))>0 OR CHARINDEX(N'sp_executesql',LOWER(routine_module.definition))>0 THEN '1' ELSE '0' END,
  CASE WHEN routine_module.definition IS NULL THEN '' WHEN CHARINDEX(N'insert ',LOWER(routine_module.definition))>0 OR CHARINDEX(N'update ',LOWER(routine_module.definition))>0 OR CHARINDEX(N'delete ',LOWER(routine_module.definition))>0 OR CHARINDEX(N'merge ',LOWER(routine_module.definition))>0 THEN '1' ELSE '0' END,
  CONVERT(varchar(1),CASE WHEN @dependency_object_id IS NULL THEN 0 ELSE 1 END),
  COALESCE(LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),COALESCE((SELECT CONCAT(column_id,':',name,':',TYPE_NAME(user_type_id),':',max_length,':',precision,':',scale,':',is_nullable,';') FROM sys.columns WHERE object_id=@dependency_object_id ORDER BY column_id FOR XML PATH(''),TYPE).value('.','nvarchar(max)'),''))),2)),'')
FROM sys.databases source_database
LEFT JOIN sys.objects routine_object ON routine_object.object_id=@routine_object_id
LEFT JOIN sys.sql_modules routine_module ON routine_module.object_id=@routine_object_id
WHERE source_database.name=DB_NAME();`;

// Issued only if the catalog query proves dbo.departmentcode exists. It emits
// one anonymous count and no row or column value.
export const LEGACY_ALL_DEP_NAME_DEPENDENCY_AGGREGATE_SQL = `SET NOCOUNT ON;
SELECT CONVERT(varchar(30),COUNT_BIG(*)) FROM dbo.departmentcode;`;

export class LegacyAllDepNameSourceReceiptError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyAllDepNameSourceReceiptError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyAllDepNameSourceReceiptError(code, detail); };
const digest = value => createHash("sha256").update(value).digest("hex");
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const exactKeys = (value, expected, code, label) => {
  if (!object(value) || !same(Object.keys(value).sort(), [...expected].sort())) fail(code, label);
};
const requireSha = (value, code, label) => {
  if (!SHA256.test(value ?? "")) fail(code, label);
};

function validateContract(contract, repositoryRoot) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_all_dep_name_source_receipt"
    || contract.scope !== "organization_position_all_dep_name_single_routine_source_catalog"
    || contract.sourceEvidence?.routineLedger?.path !== LEDGER_PATH
    || !same(contract.sourceEvidence?.routine, EXPECTED_ROUTINE)
    || contract.catalogProbe?.dependencySchema !== "dbo"
    || contract.catalogProbe?.dependencyTable !== "departmentcode"
    || contract.catalogProbe?.routineEvidence !== "existence_object_type_definition_hash_parameter_signature_hash_and_boolean_tokens_only"
    || contract.catalogProbe?.dependencyEvidence !== "existence_column_catalog_hash_and_anonymous_row_count_only"
    || !same(contract.authorityPolicy, {
      databaseReadOnly: true, sysadmin: false, dbDatareader: true, viewDefinition: true,
      insert: false, update: false, delete: false, execute: false,
    })
    || !same(contract.executionPolicy, {
      legacyRoutineExecution: "FORBIDDEN",
      legacyDynamicSqlExecution: "FORBIDDEN",
      moduleBodyExport: "FORBIDDEN",
      personalFieldValues: "FORBIDDEN",
    })
    || contract.decision !== "KEEP_PENDING"
    || contract.compatibilityCredit !== 0
    || contract.containsPersonalData !== false
    || contract.productionImport !== "HOLD") {
    fail("ALL_DEP_NAME_CONTRACT_INVALID", "identity or safety policy");
  }
  requireSha(contract.sourceEvidence.routineLedger.sha256, "ALL_DEP_NAME_CONTRACT_INVALID", "ledger hash");
  const ledgerBytes = readFileSync(resolve(repositoryRoot, LEDGER_PATH));
  if (digest(ledgerBytes) !== contract.sourceEvidence.routineLedger.sha256) {
    fail("ALL_DEP_NAME_SOURCE_LEDGER_DRIFT", "routine ledger bytes");
  }
  const ledger = JSON.parse(ledgerBytes.toString("utf8"));
  const row = ledger.routines?.find(item => item.routineId === EXPECTED_ROUTINE.routineId);
  if (!row
    || row.sourceName !== EXPECTED_ROUTINE.sourceName
    || row.kind !== EXPECTED_ROUTINE.kind
    || row.sourceArtifactSha256 !== EXPECTED_ROUTINE.sourceArtifactSha256
    || row.structuralHash !== EXPECTED_ROUTINE.structuralHash
    || row.primaryDomain !== EXPECTED_ROUTINE.primaryDomain
    || row.businessCapability !== EXPECTED_ROUTINE.businessCapability
    || row.parameters?.length !== EXPECTED_ROUTINE.parameterCount
    || !same(row.readTables, EXPECTED_ROUTINE.readTables)
    || !same(row.writeTables, EXPECTED_ROUTINE.writeTables)
    || row.dynamicMutationStatus !== EXPECTED_ROUTINE.dynamicMutationStatus) {
    fail("ALL_DEP_NAME_SOURCE_ROUTINE_DRIFT", "routine ledger identity");
  }
  return { ledgerSha256: digest(ledgerBytes), row };
}

function validateAuthority(authority) {
  exactKeys(authority, ["sysadmin", "dbDatareader", "viewDefinition", "insert", "update", "delete", "execute"], "ALL_DEP_NAME_AUTHORITY_INVALID", "authority shape");
  if (!same(authority, {
    sysadmin: false, dbDatareader: true, viewDefinition: true,
    insert: false, update: false, delete: false, execute: false,
  })) fail("ALL_DEP_NAME_AUTHORITY_INVALID", "least privilege read-only authority required");
}

function validateEvidence(evidence) {
  exactKeys(evidence, ["databaseReadOnly", "authority", "routineCatalog", "dependencyCatalog"], "ALL_DEP_NAME_EVIDENCE_INVALID", "evidence shape");
  if (evidence.databaseReadOnly !== true) fail("ALL_DEP_NAME_EVIDENCE_INVALID", "database must be read-only");
  validateAuthority(evidence.authority);
  exactKeys(evidence.routineCatalog, ["exists", "objectType", "definitionSha256", "parameterCount", "parameterSignatureSha256", "dynamicExecutionTokenObserved", "mutationTokenObserved"], "ALL_DEP_NAME_EVIDENCE_INVALID", "routine catalog shape");
  if (typeof evidence.routineCatalog.exists !== "boolean") fail("ALL_DEP_NAME_EVIDENCE_INVALID", "routine existence");
  if (!evidence.routineCatalog.exists) {
    if (Object.entries(evidence.routineCatalog).some(([key, value]) => key !== "exists" && value !== null)) fail("ALL_DEP_NAME_EVIDENCE_INVALID", "absent routine metadata");
  } else {
    if (!['FN', 'FS'].includes(evidence.routineCatalog.objectType)
      || !SHA256.test(evidence.routineCatalog.definitionSha256 ?? "")
      || evidence.routineCatalog.parameterCount !== 2
      || !SHA256.test(evidence.routineCatalog.parameterSignatureSha256 ?? "")
      || evidence.routineCatalog.dynamicExecutionTokenObserved !== false
      || evidence.routineCatalog.mutationTokenObserved !== false) {
      fail("ALL_DEP_NAME_EVIDENCE_INVALID", "routine catalog metadata");
    }
  }
  exactKeys(evidence.dependencyCatalog, ["exists", "columnCatalogSha256", "rowCount"], "ALL_DEP_NAME_EVIDENCE_INVALID", "dependency catalog shape");
  if (typeof evidence.dependencyCatalog.exists !== "boolean") fail("ALL_DEP_NAME_EVIDENCE_INVALID", "dependency existence");
  if (!evidence.dependencyCatalog.exists) {
    if (evidence.dependencyCatalog.columnCatalogSha256 !== null || evidence.dependencyCatalog.rowCount !== null) fail("ALL_DEP_NAME_EVIDENCE_INVALID", "absent dependency metadata");
  } else if (!SHA256.test(evidence.dependencyCatalog.columnCatalogSha256 ?? "")
    || !Number.isSafeInteger(evidence.dependencyCatalog.rowCount)
    || evidence.dependencyCatalog.rowCount < 0) {
    fail("ALL_DEP_NAME_EVIDENCE_INVALID", "dependency aggregate");
  }
  return structuredClone(evidence);
}

export function buildSyntheticLegacyAllDepNameSourceReceipt({
  contract,
  repositoryRoot,
  sourceRestoreReceiptSha256,
  databaseIdentitySha256,
  evidence,
}) {
  const source = validateContract(contract, repositoryRoot);
  requireSha(sourceRestoreReceiptSha256, "ALL_DEP_NAME_RECEIPT_INVALID", "source restore receipt hash");
  requireSha(databaseIdentitySha256, "ALL_DEP_NAME_RECEIPT_INVALID", "database identity hash");
  const safeEvidence = validateEvidence(evidence);
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_all_dep_name_source_receipt",
    scope: contract.scope,
    evidenceOrigin: "synthetic_contract_test",
    sourceRestoreReceiptSha256,
    databaseIdentitySha256,
    routineLedgerSha256: source.ledgerSha256,
    queryIdentitySha256: digest(`${LEGACY_ALL_DEP_NAME_CATALOG_SQL}\n${LEGACY_ALL_DEP_NAME_DEPENDENCY_AGGREGATE_SQL}\n`),
    sourceState: { readOnly: safeEvidence.databaseReadOnly },
    etlAuthority: safeEvidence.authority,
    routineIdentity: {
      routineId: source.row.routineId,
      schema: "dbo",
      sourceName: source.row.sourceName,
      sourceArtifactSha256: source.row.sourceArtifactSha256,
      structuralHash: source.row.structuralHash,
    },
    routineCatalog: safeEvidence.routineCatalog,
    dependencyIdentity: { schema: "dbo", table: "departmentcode" },
    dependencyCatalog: safeEvidence.dependencyCatalog,
    sourceCatalogStatus: "pending_live_read_only_capture",
    semanticParityStatus: "pending",
    decision: "KEEP_PENDING",
    status: "SOURCE_RECEIPT_PENDING_LIVE_PROBE",
    gapCodes: ["ALL_DEP_NAME_LIVE_SOURCE_RECEIPT_MISSING", "ALL_DEP_NAME_SEMANTIC_PARITY_PENDING"],
    legacyRoutineExecuted: false,
    legacyDynamicSqlExecuted: false,
    moduleBodyIncluded: false,
    containsPersonalData: false,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(canonical(body)) };
}

export function validateLegacyAllDepNameSourceReceipt(receipt, { contract, repositoryRoot }) {
  const source = validateContract(contract, repositoryRoot);
  if (!object(receipt) || !SHA256.test(receipt.receiptSha256 ?? "")) fail("ALL_DEP_NAME_RECEIPT_INVALID", "receipt shape");
  const { receiptSha256, ...body } = receipt;
  if (receiptSha256 !== digest(canonical(body))) fail("ALL_DEP_NAME_RECEIPT_HASH_MISMATCH", "canonical receipt hash");
  if (body.artifactKind !== "yuzhou_hr_legacy_all_dep_name_source_receipt"
    || body.scope !== contract.scope
    || body.evidenceOrigin !== "synthetic_contract_test"
    || body.routineLedgerSha256 !== source.ledgerSha256
    || body.sourceCatalogStatus !== "pending_live_read_only_capture"
    || body.semanticParityStatus !== "pending"
    || body.decision !== "KEEP_PENDING"
    || body.status !== "SOURCE_RECEIPT_PENDING_LIVE_PROBE"
    || !same(body.gapCodes, ["ALL_DEP_NAME_LIVE_SOURCE_RECEIPT_MISSING", "ALL_DEP_NAME_SEMANTIC_PARITY_PENDING"])
    || body.legacyRoutineExecuted !== false
    || body.legacyDynamicSqlExecuted !== false
    || body.moduleBodyIncluded !== false
    || body.containsPersonalData !== false
    || body.compatibilityCredit !== 0
    || body.productionImport !== "HOLD") {
    fail("ALL_DEP_NAME_RECEIPT_INVALID", "pending safety boundary");
  }
  validateEvidence({
    databaseReadOnly: body.sourceState?.readOnly,
    authority: body.etlAuthority,
    routineCatalog: body.routineCatalog,
    dependencyCatalog: body.dependencyCatalog,
  });
  return structuredClone(receipt);
}
