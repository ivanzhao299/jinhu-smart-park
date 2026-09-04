/* global structuredClone */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA256 = /^[0-9a-f]{64}$/u;
const FIELDS = [
  ["id", ["hr_payroll_formula_version.legacy_formula_id"]],
  ["scheme", ["hr_payroll_formula_version.book_id"]],
  ["itemname", ["hr_payroll_formula_version.item_version_id"]],
  ["expression", ["hr_payroll_formula_version.raw_expression", "hr_payroll_formula_version.expression_hash", "hr_payroll_formula_version.dsl_ast"]],
  ["cit", ["hr_payroll_formula_version.raw_condition", "hr_payroll_formula_version.parse_status"]],
  ["myorder", ["hr_payroll_formula_version.calculation_order"]],
];
const PAYROLL_CONTRACT_PATH = "scripts/hr-cutover/contracts/legacy-payroll-rule-family-parity-v1.json";
const ROUTINE_LEDGER_PATH = "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json";
const BODY_KEYS = [
  "formatVersion",
  "artifactKind",
  "scope",
  "contractSha256",
  "payrollRuleContractSha256",
  "routineLedgerSha256",
  "sourceRestoreReceiptSha256",
  "sourceCatalogSha256",
  "databaseIdentitySha256",
  "queryIdentitySha256",
  "evidenceOrigin",
  "sourceState",
  "etlAuthority",
  "sourceObject",
  "ruleRelation",
  "directRoutineLedgerReferences",
  "catalogDisposition",
  "sourceIdentityStatus",
  "routineReferenceStatus",
  "decision",
  "status",
  "gapCodes",
  "routineBodiesRead",
  "routineNamesReturned",
  "routineBodiesReturned",
  "legacyRoutineExecuted",
  "legacyDynamicSqlExecuted",
  "containsRuleExpressionContent",
  "containsConditionContent",
  "containsPayrollValues",
  "containsPersonalData",
  "compatibilityCredit",
  "productionImport",
];

export const PAYROLL_SALARYEQUAL_SOURCE_STATE_SQL = `SET NOCOUNT ON;
SELECT
  CONVERT(varchar(1),CASE WHEN OBJECT_ID(N'dbo.salaryequal',N'U') IS NULL THEN 0 ELSE 1 END),
  CONVERT(varchar(1),source_database.is_read_only),
  DB_NAME(),
  CONVERT(varchar(1),COALESCE(IS_SRVROLEMEMBER('sysadmin'),0)),
  CONVERT(varchar(1),COALESCE(IS_ROLEMEMBER('db_datareader'),0)),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION')),
  CONVERT(varchar(1),CASE WHEN COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','INSERT'),0)=1 OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.salaryequal','OBJECT','INSERT'),0)=1 THEN 1 ELSE 0 END),
  CONVERT(varchar(1),CASE WHEN COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','UPDATE'),0)=1 OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.salaryequal','OBJECT','UPDATE'),0)=1 THEN 1 ELSE 0 END),
  CONVERT(varchar(1),CASE WHEN COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','DELETE'),0)=1 OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.salaryequal','OBJECT','DELETE'),0)=1 THEN 1 ELSE 0 END),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','EXECUTE'))
FROM sys.databases source_database
WHERE source_database.name=DB_NAME();`;

// The dependency catalog yields anonymous counts only. It neither reads nor
// returns module definitions or routine names, so dynamic references remain a gap.
export const PAYROLL_SALARYEQUAL_FIELD_CATALOG_SQL = `SET NOCOUNT ON;
WITH requested(field_name,field_order) AS (
  SELECT N'id',1 UNION ALL
  SELECT N'scheme',2 UNION ALL
  SELECT N'itemname',3 UNION ALL
  SELECT N'expression',4 UNION ALL
  SELECT N'cit',5 UNION ALL
  SELECT N'myorder',6
)
SELECT
  requested.field_name,
  CONVERT(varchar(1),CASE WHEN source_column.object_id IS NULL THEN 0 ELSE 1 END),
  COALESCE(TYPE_NAME(source_column.user_type_id),''),
  COALESCE(CONVERT(varchar(12),source_column.max_length),''),
  COALESCE(CONVERT(varchar(12),source_column.precision),''),
  COALESCE(CONVERT(varchar(12),source_column.scale),''),
  COALESCE(CONVERT(varchar(1),source_column.is_nullable),''),
  COALESCE(CONVERT(varchar(1),source_column.is_computed),''),
  CONVERT(varchar(30),COUNT_BIG(DISTINCT source_routine.object_id))
FROM requested
LEFT JOIN sys.columns source_column
  ON source_column.object_id=OBJECT_ID(N'dbo.salaryequal',N'U')
 AND source_column.name=requested.field_name
LEFT JOIN sys.sql_expression_dependencies source_dependency
  ON source_dependency.referenced_id=source_column.object_id
 AND source_dependency.referenced_minor_id=source_column.column_id
LEFT JOIN sys.procedures source_routine
  ON source_routine.object_id=source_dependency.referencing_id
 AND source_routine.is_ms_shipped=0
GROUP BY requested.field_name,requested.field_order,source_column.object_id,source_column.user_type_id,source_column.max_length,source_column.precision,source_column.scale,source_column.is_nullable,source_column.is_computed
ORDER BY requested.field_order;`;

export const PAYROLL_SALARYEQUAL_TABLE_AGGREGATE_SQL = `SET NOCOUNT ON;
SELECT CONVERT(varchar(30),COUNT_BIG(*)) FROM dbo.salaryequal;`;
export const PAYROLL_SALARYEQUAL_FIELD_AGGREGATE_SQL = Object.freeze({
  id: `SET NOCOUNT ON;
SELECT CONVERT(varchar(30),COUNT_BIG([id])) FROM dbo.salaryequal;`,
  scheme: `SET NOCOUNT ON;
SELECT CONVERT(varchar(30),COUNT_BIG([scheme])) FROM dbo.salaryequal;`,
  itemname: `SET NOCOUNT ON;
SELECT CONVERT(varchar(30),COUNT_BIG([itemname])) FROM dbo.salaryequal;`,
  expression: `SET NOCOUNT ON;
SELECT CONVERT(varchar(30),COUNT_BIG([expression])) FROM dbo.salaryequal;`,
  cit: `SET NOCOUNT ON;
SELECT CONVERT(varchar(30),COUNT_BIG([cit])) FROM dbo.salaryequal;`,
  myorder: `SET NOCOUNT ON;
SELECT CONVERT(varchar(30),COUNT_BIG([myorder])) FROM dbo.salaryequal;`,
});

export class PayrollSalaryequalRuleRelationSourceReceiptError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "PayrollSalaryequalRuleRelationSourceReceiptError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new PayrollSalaryequalRuleRelationSourceReceiptError(code, detail); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const digest = value => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys, code, detail) => {
  if (!object(value) || !same(Object.keys(value).sort(), [...keys].sort())) fail(code, detail);
};
const requireCount = (value, code, detail) => {
  if (!Number.isSafeInteger(value) || value < 0) fail(code, detail);
};

function readBoundFile(repositoryRoot, evidence, path, label) {
  if (!object(evidence) || evidence.path !== path || !SHA256.test(evidence.sha256 ?? "")) {
    fail("PAYROLL_SALARYEQUAL_SOURCE_CONTRACT_INVALID", label);
  }
  const bytes = readFileSync(resolve(repositoryRoot, path));
  if (digest(bytes) !== evidence.sha256) fail("PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_DRIFT", label);
  return bytes;
}

function validateContract(contract, repositoryRoot) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_payroll_salaryequal_rule_relation_source_receipt"
    || contract.scope !== "salaryequal_rule_relation_source_identity"
    || contract.sourceObject?.schema !== "dbo"
    || contract.sourceObject?.table !== "salaryequal"
    || contract.sourceObject?.staticObservedRows !== 244
    || contract.sourceObject?.staticObservedRowsStatus !== "non_authoritative_until_live_receipt"
    || contract.ruleRelation?.stableId !== "SALARYEQUAL_RULE_RELATION_V1"
    || contract.ruleRelation?.mappingContractStatus !== "verified_static_contract_only"
    || contract.ruleRelation?.sourceIdentityStatus !== "pending"
    || contract.ruleRelation?.rowRelationParity !== "pending"
    || contract.routineLedgerPolicy?.expectedDirectReaders !== 0
    || contract.routineLedgerPolicy?.expectedDirectWriters !== 0
    || contract.routineLedgerPolicy?.absenceDoesNotProveNoRuntimeUsage !== true
    || contract.catalogPolicy?.metadata !== "capture_exact_sql_type_length_precision_scale_nullability_and_computed_state"
    || contract.catalogPolicy?.aggregate !== "table_row_count_and_per_field_non_null_count_only"
    || contract.catalogPolicy?.routineReferences !== "anonymous_distinct_procedure_counts_from_resolved_catalog_dependencies_by_field_only"
    || contract.catalogPolicy?.routineReferenceCoverage !== "static_catalog_dependencies_only_dynamic_references_and_write_effects_excluded"
    || contract.catalogPolicy?.routineBodiesRead !== false
    || contract.catalogPolicy?.routineNamesReturned !== false
    || contract.catalogPolicy?.routineBodiesReturned !== false
    || contract.executionPolicy?.operationMode !== "read_only_catalog_and_anonymous_aggregate"
    || contract.executionPolicy?.legacyRoutineExecution !== "FORBIDDEN"
    || contract.executionPolicy?.legacyDynamicSqlExecution !== "FORBIDDEN"
    || contract.executionPolicy?.sourceMutation !== "FORBIDDEN"
    || contract.evidencePolicy?.staticEvidenceCompatibilityCredit !== 0
    || contract.evidencePolicy?.syntheticEvidenceCompatibilityCredit !== 0
    || contract.evidencePolicy?.liveCatalogCompatibilityCredit !== 0
    || contract.evidencePolicy?.catalogDependenciesDoNotProveDynamicSqlOrWriteEffects !== true
    || contract.evidencePolicy?.requiredDecision !== "KEEP_PENDING"
    || contract.containsRuleExpressionContent !== false
    || contract.containsConditionContent !== false
    || contract.containsPayrollValues !== false
    || contract.containsPersonalData !== false
    || contract.compatibilityCredit !== 0
    || contract.productionImport !== "HOLD"
    || !same(contract.sourceObject?.fields?.map(row => [row?.name, row?.targetFields]), FIELDS)) {
    fail("PAYROLL_SALARYEQUAL_SOURCE_CONTRACT_INVALID", "identity or safety boundary");
  }
  const payrollBytes = readBoundFile(repositoryRoot, contract.sourceEvidence?.payrollRuleContract, PAYROLL_CONTRACT_PATH, "payroll contract");
  const ledgerBytes = readBoundFile(repositoryRoot, contract.sourceEvidence?.routineLedger, ROUTINE_LEDGER_PATH, "routine ledger");
  let payroll;
  let ledger;
  try {
    payroll = JSON.parse(payrollBytes);
    ledger = JSON.parse(ledgerBytes);
  } catch {
    fail("PAYROLL_SALARYEQUAL_SOURCE_CONTRACT_INVALID", "bound JSON evidence");
  }
  const sourceObject = payroll.sourceBinding?.sourceObjects?.find(row => row.name === "salaryequal");
  if (payroll.contractKind !== "yuzhou_hr_legacy_payroll_rule_family_parity"
    || payroll.sourceBinding?.routineLedgerSha256 !== contract.sourceEvidence.routineLedger.sha256
    || sourceObject?.observedRows !== contract.sourceObject.staticObservedRows
    || !same(sourceObject?.expectedFields, FIELDS.map(([name]) => name))
    || !Array.isArray(ledger.routines)
    || ledger.routines.length !== 212
    || payroll.productionImport !== "HOLD"
    || ledger.productionImport !== "HOLD") {
    fail("PAYROLL_SALARYEQUAL_SOURCE_BOUND_CONTRACT_DRIFT", "source or ledger identity");
  }
  for (const [fieldName, targetFields] of FIELDS) {
    const mapping = payroll.fieldMappings?.find(row => row.sourceObject === "salaryequal" && row.sourceField === fieldName);
    if (!mapping || mapping.status !== "verified" || !same(mapping.targetFields, targetFields) || !mapping.transform
      || !mapping.nullContract || !Array.isArray(mapping.evidence) || mapping.evidence.length === 0) {
      fail("PAYROLL_SALARYEQUAL_SOURCE_BOUND_CONTRACT_DRIFT", `verified mapping:${fieldName}`);
    }
  }
  const directReaders = ledger.routines.filter(row => row.readTables?.includes("salaryequal")).length;
  const directWriters = ledger.routines.filter(row => row.writeTables?.includes("salaryequal")).length;
  if (directReaders !== 0 || directWriters !== 0) {
    fail("PAYROLL_SALARYEQUAL_SOURCE_ROUTINE_LEDGER_DRIFT", "direct references require review");
  }
  return {
    contractSha256: digest(canonical(contract)),
    payrollRuleContractSha256: contract.sourceEvidence.payrollRuleContract.sha256,
    routineLedgerSha256: contract.sourceEvidence.routineLedger.sha256,
    directReaders,
    directWriters,
  };
}

function validateAuthority(authority) {
  exactKeys(authority, ["loginSucceeded", "sysadmin", "dbDatareader", "viewDefinition", "insert", "update", "delete", "execute"], "PAYROLL_SALARYEQUAL_SOURCE_AUTHORITY_INVALID", "authority shape");
  if (authority.loginSucceeded !== true || authority.sysadmin !== false || authority.dbDatareader !== true
    || authority.viewDefinition !== true || authority.insert !== false || authority.update !== false
    || authority.delete !== false || authority.execute !== false) {
    fail("PAYROLL_SALARYEQUAL_SOURCE_AUTHORITY_INVALID", "least-privilege read-only authority required");
  }
}

function validateField(field, tableExists, totalRows) {
  exactKeys(field, ["name", "exists", "sqlType", "maxLength", "precision", "scale", "nullable", "computed", "nonNullRows", "routineReferenceCount"], "PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", "field shape");
  if (!FIELDS.some(([name]) => name === field.name) || typeof field.exists !== "boolean") {
    fail("PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", "field identity");
  }
  requireCount(field.routineReferenceCount, "PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", `${field.name}:routineReferenceCount`);
  if (!field.exists) {
    if ([field.sqlType, field.maxLength, field.precision, field.scale, field.nullable, field.computed, field.nonNullRows].some(value => value !== null)) {
      fail("PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", `${field.name}:absent metadata`);
    }
    return;
  }
  if (!tableExists || typeof field.sqlType !== "string" || !field.sqlType
    || !Number.isSafeInteger(field.maxLength) || !Number.isSafeInteger(field.precision) || !Number.isSafeInteger(field.scale)
    || typeof field.nullable !== "boolean" || typeof field.computed !== "boolean") {
    fail("PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", `${field.name}:catalog metadata`);
  }
  requireCount(field.nonNullRows, "PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", `${field.name}:nonNullRows`);
  if (field.nonNullRows > totalRows) fail("PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", `${field.name}:count conservation`);
}

function validateEvidence(evidence) {
  exactKeys(evidence, ["databaseReadOnly", "authority", "sourceObject"], "PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", "evidence shape");
  if (evidence.databaseReadOnly !== true) fail("PAYROLL_SALARYEQUAL_SOURCE_NOT_READ_ONLY", "source database");
  validateAuthority(evidence.authority);
  exactKeys(evidence.sourceObject, ["schema", "table", "exists", "totalRows", "fields"], "PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", "source object shape");
  if (evidence.sourceObject.schema !== "dbo" || evidence.sourceObject.table !== "salaryequal"
    || typeof evidence.sourceObject.exists !== "boolean" || !Array.isArray(evidence.sourceObject.fields)
    || evidence.sourceObject.fields.length !== FIELDS.length
    || !same(evidence.sourceObject.fields.map(row => row.name), FIELDS.map(([name]) => name))) {
    fail("PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", "source object identity");
  }
  if (evidence.sourceObject.exists) requireCount(evidence.sourceObject.totalRows, "PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", "totalRows");
  else if (evidence.sourceObject.totalRows !== null) fail("PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", "absent table row count");
  for (const field of evidence.sourceObject.fields) {
    validateField(field, evidence.sourceObject.exists, evidence.sourceObject.totalRows);
    if (!evidence.sourceObject.exists && field.exists) fail("PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", `${field.name}:field without table`);
  }
  return structuredClone(evidence);
}

function catalogDisposition(evidence) {
  if (!evidence.sourceObject.exists) return "source_table_absent";
  const missing = evidence.sourceObject.fields.filter(row => !row.exists);
  if (missing.length) return `source_fields_absent:${missing.map(row => row.name).join(",")}`;
  if (evidence.sourceObject.totalRows === 0) return "source_table_empty";
  const allNull = evidence.sourceObject.fields.filter(row => row.nonNullRows === 0);
  if (allNull.length) return `source_fields_all_null:${allNull.map(row => row.name).join(",")}`;
  return "source_catalog_and_non_null_presence_observed";
}

function queryIdentitySha256() {
  return digest([
    PAYROLL_SALARYEQUAL_SOURCE_STATE_SQL,
    PAYROLL_SALARYEQUAL_FIELD_CATALOG_SQL,
    PAYROLL_SALARYEQUAL_TABLE_AGGREGATE_SQL,
    ...FIELDS.map(([name]) => PAYROLL_SALARYEQUAL_FIELD_AGGREGATE_SQL[name]),
    "",
  ].join("\n"));
}

function buildReceipt({ contract, repositoryRoot, evidence, evidenceOrigin, sourceRestoreReceiptSha256, sourceCatalogSha256, databaseIdentitySha256 }) {
  const binding = validateContract(contract, repositoryRoot);
  for (const [label, value] of Object.entries({ sourceRestoreReceiptSha256, sourceCatalogSha256, databaseIdentitySha256 })) {
    if (!SHA256.test(value ?? "")) fail("PAYROLL_SALARYEQUAL_SOURCE_RECEIPT_INVALID", label);
  }
  if (!["synthetic_contract_test", "live_bound_read_only_sqlserver"].includes(evidenceOrigin)) {
    fail("PAYROLL_SALARYEQUAL_SOURCE_RECEIPT_INVALID", "evidence origin");
  }
  const safeEvidence = validateEvidence(evidence);
  const disposition = catalogDisposition(safeEvidence);
  const liveObserved = evidenceOrigin === "live_bound_read_only_sqlserver" && disposition === "source_catalog_and_non_null_presence_observed";
  const totalReferences = safeEvidence.sourceObject.fields.reduce((sum, row) => sum + row.routineReferenceCount, 0);
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_payroll_salaryequal_rule_relation_source_receipt",
    scope: contract.scope,
    contractSha256: binding.contractSha256,
    payrollRuleContractSha256: binding.payrollRuleContractSha256,
    routineLedgerSha256: binding.routineLedgerSha256,
    sourceRestoreReceiptSha256,
    sourceCatalogSha256,
    databaseIdentitySha256,
    queryIdentitySha256: queryIdentitySha256(),
    evidenceOrigin,
    sourceState: { readOnly: true },
    etlAuthority: safeEvidence.authority,
    sourceObject: {
      ...safeEvidence.sourceObject,
      fields: safeEvidence.sourceObject.fields.map(row => ({
        ...row,
        nullRows: row.exists ? safeEvidence.sourceObject.totalRows - row.nonNullRows : null,
      })),
    },
    ruleRelation: {
      stableId: contract.ruleRelation.stableId,
      mappingContractStatus: contract.ruleRelation.mappingContractStatus,
      sourceIdentityStatus: liveObserved ? "observed" : "pending",
      rowRelationParity: "pending",
    },
    directRoutineLedgerReferences: { readers: binding.directReaders, writers: binding.directWriters },
    catalogDisposition: disposition,
    sourceIdentityStatus: liveObserved ? "observed" : "pending",
    routineReferenceStatus: totalReferences > 0
      ? "anonymous_catalog_dependency_counts_observed_dynamic_and_semantics_pending"
      : "no_resolved_catalog_dependencies_observed_dynamic_and_semantics_pending",
    decision: "KEEP_PENDING",
    status: liveObserved ? "SOURCE_CATALOG_OBSERVED_ROW_RELATION_PENDING" : "SOURCE_IDENTITY_PENDING",
    gapCodes: [
      ...(liveObserved ? [] : ["PAYROLL_SALARYEQUAL_SOURCE_CATALOG_PENDING"]),
      "PAYROLL_SALARYEQUAL_ROUTINE_REFERENCE_SEMANTICS_PENDING",
      "PAYROLL_SALARYEQUAL_DYNAMIC_REFERENCES_NOT_OBSERVED",
      "PAYROLL_SALARYEQUAL_ROW_RELATION_PARITY_PENDING",
    ],
    routineBodiesRead: false,
    routineNamesReturned: false,
    routineBodiesReturned: false,
    legacyRoutineExecuted: false,
    legacyDynamicSqlExecuted: false,
    containsRuleExpressionContent: false,
    containsConditionContent: false,
    containsPayrollValues: false,
    containsPersonalData: false,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(canonical(body)) };
}

export function buildSyntheticPayrollSalaryequalRuleRelationSourceReceipt(input) {
  return buildReceipt({ ...input, evidenceOrigin: "synthetic_contract_test" });
}

export function buildLivePayrollSalaryequalRuleRelationSourceReceipt(input) {
  return buildReceipt({ ...input, evidenceOrigin: "live_bound_read_only_sqlserver" });
}

export function validatePayrollSalaryequalRuleRelationSourceReceipt(receipt, { contract, repositoryRoot }) {
  exactKeys(receipt, [...BODY_KEYS, "receiptSha256"], "PAYROLL_SALARYEQUAL_SOURCE_RECEIPT_INVALID", "receipt shape");
  const { receiptSha256, ...body } = receipt;
  if (receiptSha256 !== digest(canonical(body))) fail("PAYROLL_SALARYEQUAL_SOURCE_RECEIPT_HASH_MISMATCH", "canonical hash");
  const evidence = {
    databaseReadOnly: body.sourceState?.readOnly,
    authority: body.etlAuthority,
    sourceObject: {
      schema: body.sourceObject?.schema,
      table: body.sourceObject?.table,
      exists: body.sourceObject?.exists,
      totalRows: body.sourceObject?.totalRows,
      fields: body.sourceObject?.fields?.map(({ nullRows, ...field }) => {
        if (field.exists && nullRows !== body.sourceObject.totalRows - field.nonNullRows) fail("PAYROLL_SALARYEQUAL_SOURCE_RECEIPT_INVALID", `${field.name}:null conservation`);
        if (!field.exists && nullRows !== null) fail("PAYROLL_SALARYEQUAL_SOURCE_RECEIPT_INVALID", `${field.name}:absent null count`);
        return field;
      }),
    },
  };
  const expected = buildReceipt({
    contract,
    repositoryRoot,
    evidence,
    evidenceOrigin: body.evidenceOrigin,
    sourceRestoreReceiptSha256: body.sourceRestoreReceiptSha256,
    sourceCatalogSha256: body.sourceCatalogSha256,
    databaseIdentitySha256: body.databaseIdentitySha256,
  });
  if (!same(receipt, expected)) fail("PAYROLL_SALARYEQUAL_SOURCE_RECEIPT_INVALID", "derived identity, status, gaps, or safety boundary");
  return receipt;
}
