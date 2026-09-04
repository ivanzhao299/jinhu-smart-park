/* global structuredClone */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA256 = /^[0-9a-f]{64}$/u;
const EXPECTED_FIELDS = [
  ["expression", "PAYROLL_ITEM_RULE_SLOT_1_TARGET_MISSING"],
  ["cit", "PAYROLL_ITEM_CONDITION_SLOT_1_TARGET_MISSING"],
  ["defvalue", "PAYROLL_ITEM_DEFAULT_VALUE_TARGET_MISSING"],
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
  "catalogDisposition",
  "sourceIdentityStatus",
  "routineReferenceStatus",
  "semanticReviewStatus",
  "decision",
  "status",
  "gapCodes",
  "routineBodiesRead",
  "routineNamesReturned",
  "routineBodiesReturned",
  "legacyRoutineExecuted",
  "legacyDynamicSqlExecuted",
  "containsExpressionContent",
  "containsDefaultValues",
  "containsPayrollValues",
  "containsPersonalData",
  "compatibilityCredit",
  "productionImport",
];

// Emits one source-state row. The query validates the read-only database and
// least-privilege ETL authority without selecting any business row.
export const PAYROLL_SALARYITEMS_SOURCE_STATE_SQL = `SET NOCOUNT ON;
SELECT
  CONVERT(varchar(1),CASE WHEN OBJECT_ID(N'dbo.salaryitems',N'U') IS NULL THEN 0 ELSE 1 END),
  CONVERT(varchar(1),source_database.is_read_only),
  DB_NAME(),
  CONVERT(varchar(1),COALESCE(IS_SRVROLEMEMBER('sysadmin'),0)),
  CONVERT(varchar(1),COALESCE(IS_ROLEMEMBER('db_datareader'),0)),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION')),
  CONVERT(varchar(1),CASE WHEN COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','INSERT'),0)=1 OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.salaryitems','OBJECT','INSERT'),0)=1 THEN 1 ELSE 0 END),
  CONVERT(varchar(1),CASE WHEN COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','UPDATE'),0)=1 OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.salaryitems','OBJECT','UPDATE'),0)=1 THEN 1 ELSE 0 END),
  CONVERT(varchar(1),CASE WHEN COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','DELETE'),0)=1 OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.salaryitems','OBJECT','DELETE'),0)=1 THEN 1 ELSE 0 END),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','EXECUTE'))
FROM sys.databases source_database
WHERE source_database.name=DB_NAME();`;

// Emits exactly three catalog rows. Only resolved dependency catalog edges are
// counted; stored-procedure names and definitions are neither read nor returned.
export const PAYROLL_SALARYITEMS_FIELD_CATALOG_SQL = `SET NOCOUNT ON;
WITH requested(field_name,field_order) AS (
  SELECT N'expression',1 UNION ALL
  SELECT N'cit',2 UNION ALL
  SELECT N'defvalue',3
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
  ON source_column.object_id=OBJECT_ID(N'dbo.salaryitems',N'U')
 AND source_column.name=requested.field_name
LEFT JOIN sys.sql_expression_dependencies source_dependency
  ON source_dependency.referenced_id=source_column.object_id
 AND source_dependency.referenced_minor_id=source_column.column_id
LEFT JOIN sys.procedures source_routine
  ON source_routine.object_id=source_dependency.referencing_id
 AND source_routine.is_ms_shipped=0
GROUP BY requested.field_name,requested.field_order,source_column.object_id,source_column.user_type_id,source_column.max_length,source_column.precision,source_column.scale,source_column.is_nullable,source_column.is_computed
ORDER BY requested.field_order;`;

// These four fixed aggregate queries are the only business-table reads. They
// return counts only and are run conditionally after the catalog proves the
// table or respective field exists.
export const PAYROLL_SALARYITEMS_TABLE_AGGREGATE_SQL = `SET NOCOUNT ON;
SELECT CONVERT(varchar(30),COUNT_BIG(*)) FROM dbo.salaryitems;`;
export const PAYROLL_SALARYITEMS_FIELD_AGGREGATE_SQL = Object.freeze({
  expression: `SET NOCOUNT ON;
SELECT CONVERT(varchar(30),COUNT_BIG([expression])) FROM dbo.salaryitems;`,
  cit: `SET NOCOUNT ON;
SELECT CONVERT(varchar(30),COUNT_BIG([cit])) FROM dbo.salaryitems;`,
  defvalue: `SET NOCOUNT ON;
SELECT CONVERT(varchar(30),COUNT_BIG([defvalue])) FROM dbo.salaryitems;`,
});

export class PayrollSalaryitemsPrimaryRuleSourceReceiptError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "PayrollSalaryitemsPrimaryRuleSourceReceiptError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new PayrollSalaryitemsPrimaryRuleSourceReceiptError(code, detail);
};
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys, code, label) => {
  if (!object(value) || !same(Object.keys(value).sort(), [...keys].sort())) fail(code, label);
};
const requireSha = (value, code, label) => {
  if (!SHA256.test(value ?? "")) fail(code, label);
};
const requireCount = (value, code, label) => {
  if (!Number.isSafeInteger(value) || value < 0) fail(code, label);
};

function readBoundFile(repositoryRoot, evidence, expectedPath, label) {
  if (!object(evidence)
    || evidence.path !== expectedPath
    || !SHA256.test(evidence.sha256 ?? "")) {
    fail("PAYROLL_SALARYITEMS_SOURCE_CONTRACT_INVALID", label);
  }
  const bytes = readFileSync(resolve(repositoryRoot, evidence.path));
  if (digest(bytes) !== evidence.sha256) fail("PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_DRIFT", label);
  return bytes;
}

function validateContract(contract, repositoryRoot) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_payroll_salaryitems_primary_rule_source_receipt"
    || contract.scope !== "salaryitems_expression_cit_defvalue_source_identity"
    || contract.sourceObject?.schema !== "dbo"
    || contract.sourceObject?.table !== "salaryitems"
    || contract.sourceObject?.staticObservedRows !== 711
    || contract.sourceObject?.staticObservedRowsStatus !== "non_authoritative_until_live_receipt"
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
    || contract.evidencePolicy?.liveCatalogStillRequiresSemanticReview !== true
    || contract.evidencePolicy?.catalogDependenciesDoNotProveDynamicSqlOrWriteEffects !== true
    || contract.evidencePolicy?.requiredDecision !== "KEEP_PENDING"
    || contract.containsExpressionContent !== false
    || contract.containsDefaultValues !== false
    || contract.containsPayrollValues !== false
    || contract.containsPersonalData !== false
    || contract.compatibilityCredit !== 0
    || contract.productionImport !== "HOLD") {
    fail("PAYROLL_SALARYITEMS_SOURCE_CONTRACT_INVALID", "identity or safety boundary");
  }
  const contractFields = contract.sourceObject.fields?.map((row) => [row?.name, row?.payrollGapCode]);
  if (!same(contractFields, EXPECTED_FIELDS)) {
    fail("PAYROLL_SALARYITEMS_SOURCE_CONTRACT_INVALID", "three-field scope");
  }

  const payrollBytes = readBoundFile(
    repositoryRoot,
    contract.sourceEvidence?.payrollRuleContract,
    PAYROLL_CONTRACT_PATH,
    "payroll rule contract",
  );
  const ledgerBytes = readBoundFile(
    repositoryRoot,
    contract.sourceEvidence?.routineLedger,
    ROUTINE_LEDGER_PATH,
    "routine ledger",
  );
  let payroll;
  let ledger;
  try {
    payroll = JSON.parse(payrollBytes);
    ledger = JSON.parse(ledgerBytes);
  } catch {
    fail("PAYROLL_SALARYITEMS_SOURCE_CONTRACT_INVALID", "bound JSON evidence");
  }
  const salaryitems = payroll.sourceBinding?.sourceObjects?.find((row) => row.name === "salaryitems");
  if (payroll.contractKind !== "yuzhou_hr_legacy_payroll_rule_family_parity"
    || payroll.sourceBinding?.routineLedgerSha256 !== contract.sourceEvidence.routineLedger.sha256
    || salaryitems?.observedRows !== contract.sourceObject.staticObservedRows
    || !Array.isArray(ledger.routines)
    || payroll.productionImport !== "HOLD") {
    fail("PAYROLL_SALARYITEMS_SOURCE_BOUND_CONTRACT_DRIFT", "payroll or routine ledger identity");
  }
  for (const [fieldName, gapCode] of EXPECTED_FIELDS) {
    if (!salaryitems.expectedFields?.includes(fieldName)) {
      fail("PAYROLL_SALARYITEMS_SOURCE_BOUND_CONTRACT_DRIFT", `source field:${fieldName}`);
    }
    const mapping = payroll.fieldMappings?.find((row) => row.sourceObject === "salaryitems" && row.sourceField === fieldName);
    if (!mapping
      || mapping.status !== "pending"
      || mapping.gapCode !== gapCode
      || !same(mapping.targetFields, [])
      || !same(mapping.evidence, [])) {
      fail("PAYROLL_SALARYITEMS_SOURCE_BOUND_CONTRACT_DRIFT", `pending mapping:${fieldName}`);
    }
  }
  return {
    contractSha256: digest(canonical(contract)),
    payrollRuleContractSha256: contract.sourceEvidence.payrollRuleContract.sha256,
    routineLedgerSha256: contract.sourceEvidence.routineLedger.sha256,
  };
}

function validateAuthority(authority) {
  exactKeys(
    authority,
    ["loginSucceeded", "sysadmin", "dbDatareader", "viewDefinition", "insert", "update", "delete", "execute"],
    "PAYROLL_SALARYITEMS_SOURCE_AUTHORITY_INVALID",
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
    fail("PAYROLL_SALARYITEMS_SOURCE_AUTHORITY_INVALID", "least-privilege read-only authority required");
  }
}

function validateField(field, tableExists, totalRows) {
  exactKeys(
    field,
    [
      "name",
      "exists",
      "sqlType",
      "maxLength",
      "precision",
      "scale",
      "nullable",
      "computed",
      "nonNullRows",
      "routineReferenceCount",
    ],
    "PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID",
    "field shape",
  );
  if (!EXPECTED_FIELDS.some(([name]) => name === field.name) || typeof field.exists !== "boolean") {
    fail("PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID", "field identity");
  }
  requireCount(field.routineReferenceCount, "PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID", `${field.name}:routineReferenceCount`);
  if (!field.exists) {
    if ([field.sqlType, field.maxLength, field.precision, field.scale, field.nullable, field.computed, field.nonNullRows]
      .some((value) => value !== null)) {
      fail("PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID", `${field.name}:absent metadata`);
    }
    return;
  }
  if (!tableExists
    || typeof field.sqlType !== "string"
    || !field.sqlType
    || !Number.isSafeInteger(field.maxLength)
    || !Number.isSafeInteger(field.precision)
    || !Number.isSafeInteger(field.scale)
    || typeof field.nullable !== "boolean"
    || typeof field.computed !== "boolean") {
    fail("PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID", `${field.name}:catalog metadata`);
  }
  requireCount(field.nonNullRows, "PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID", `${field.name}:non-null rows`);
  if (field.nonNullRows > totalRows) {
    fail("PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID", `${field.name}:non-null rows exceed table rows`);
  }
}

function validateEvidence(evidence) {
  exactKeys(
    evidence,
    ["databaseReadOnly", "authority", "sourceObject"],
    "PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID",
    "evidence shape",
  );
  if (evidence.databaseReadOnly !== true) {
    fail("PAYROLL_SALARYITEMS_SOURCE_NOT_READ_ONLY", "source database");
  }
  validateAuthority(evidence.authority);
  exactKeys(
    evidence.sourceObject,
    ["schema", "table", "exists", "totalRows", "fields"],
    "PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID",
    "source object shape",
  );
  if (evidence.sourceObject.schema !== "dbo"
    || evidence.sourceObject.table !== "salaryitems"
    || typeof evidence.sourceObject.exists !== "boolean"
    || !Array.isArray(evidence.sourceObject.fields)
    || evidence.sourceObject.fields.length !== EXPECTED_FIELDS.length
    || !same(evidence.sourceObject.fields.map((field) => field.name), EXPECTED_FIELDS.map(([name]) => name))) {
    fail("PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID", "source object identity");
  }
  if (evidence.sourceObject.exists) {
    requireCount(evidence.sourceObject.totalRows, "PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID", "table rows");
  } else if (evidence.sourceObject.totalRows !== null) {
    fail("PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID", "absent table row count");
  }
  for (const field of evidence.sourceObject.fields) {
    validateField(field, evidence.sourceObject.exists, evidence.sourceObject.totalRows);
    if (!evidence.sourceObject.exists && field.exists) {
      fail("PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID", `${field.name}:field without table`);
    }
  }
  return structuredClone(evidence);
}

function disposition(evidence) {
  if (!evidence.sourceObject.exists) return "source_table_absent";
  const missing = evidence.sourceObject.fields.filter((field) => !field.exists);
  if (missing.length) return `source_fields_absent:${missing.map((field) => field.name).join(",")}`;
  if (evidence.sourceObject.totalRows === 0) return "source_table_empty";
  const empty = evidence.sourceObject.fields.filter((field) => field.nonNullRows === 0);
  if (empty.length) return `source_fields_all_null:${empty.map((field) => field.name).join(",")}`;
  return "source_catalog_and_non_null_presence_observed";
}

function referenceStatus(evidence) {
  const totalReferences = evidence.sourceObject.fields.reduce((sum, field) => sum + field.routineReferenceCount, 0);
  return totalReferences > 0
    ? "anonymous_catalog_dependency_counts_observed_dynamic_and_semantics_pending"
    : "no_resolved_catalog_dependencies_observed_dynamic_and_semantics_pending";
}

function queryIdentitySha256() {
  return digest([
    PAYROLL_SALARYITEMS_SOURCE_STATE_SQL,
    PAYROLL_SALARYITEMS_FIELD_CATALOG_SQL,
    PAYROLL_SALARYITEMS_TABLE_AGGREGATE_SQL,
    ...EXPECTED_FIELDS.map(([name]) => PAYROLL_SALARYITEMS_FIELD_AGGREGATE_SQL[name]),
    "",
  ].join("\n"));
}

function buildReceipt({
  contract,
  repositoryRoot,
  evidence,
  evidenceOrigin,
  sourceRestoreReceiptSha256,
  sourceCatalogSha256,
  databaseIdentitySha256,
}) {
  const contractEvidence = validateContract(contract, repositoryRoot);
  for (const [label, value] of Object.entries({ sourceRestoreReceiptSha256, sourceCatalogSha256, databaseIdentitySha256 })) {
    requireSha(value, "PAYROLL_SALARYITEMS_SOURCE_RECEIPT_INVALID", label);
  }
  if (!["live_bound_read_only_sqlserver", "synthetic_contract_test"].includes(evidenceOrigin)) {
    fail("PAYROLL_SALARYITEMS_SOURCE_RECEIPT_INVALID", "evidence origin");
  }
  const safeEvidence = validateEvidence(evidence);
  const catalogDisposition = disposition(safeEvidence);
  const liveCatalogObserved = evidenceOrigin === "live_bound_read_only_sqlserver"
    && catalogDisposition === "source_catalog_and_non_null_presence_observed";
  const sourceObject = {
    ...safeEvidence.sourceObject,
    fields: safeEvidence.sourceObject.fields.map((field) => ({
      ...field,
      nullRows: field.exists ? safeEvidence.sourceObject.totalRows - field.nonNullRows : null,
    })),
  };
  const gaps = [
    ...(liveCatalogObserved ? [] : ["PAYROLL_SALARYITEMS_SOURCE_CATALOG_PENDING"]),
    "PAYROLL_SALARYITEMS_ROUTINE_REFERENCE_SEMANTICS_PENDING",
    "PAYROLL_SALARYITEMS_DYNAMIC_ROUTINE_REFERENCES_NOT_OBSERVED",
    "PAYROLL_SALARYITEMS_ROUTINE_WRITE_EFFECTS_NOT_OBSERVED",
    ...EXPECTED_FIELDS.map(([, gapCode]) => gapCode),
  ];
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_payroll_salaryitems_primary_rule_source_receipt",
    scope: contract.scope,
    contractSha256: contractEvidence.contractSha256,
    payrollRuleContractSha256: contractEvidence.payrollRuleContractSha256,
    routineLedgerSha256: contractEvidence.routineLedgerSha256,
    sourceRestoreReceiptSha256,
    sourceCatalogSha256,
    databaseIdentitySha256,
    queryIdentitySha256: queryIdentitySha256(),
    evidenceOrigin,
    sourceState: { readOnly: true },
    etlAuthority: safeEvidence.authority,
    sourceObject,
    catalogDisposition,
    sourceIdentityStatus: liveCatalogObserved ? "observed" : "pending",
    routineReferenceStatus: referenceStatus(safeEvidence),
    semanticReviewStatus: "pending",
    decision: "KEEP_PENDING",
    status: liveCatalogObserved
      ? "SOURCE_CATALOG_OBSERVED_SEMANTIC_REVIEW_PENDING"
      : "SOURCE_IDENTITY_PENDING",
    gapCodes: gaps,
    routineBodiesRead: false,
    routineNamesReturned: false,
    routineBodiesReturned: false,
    legacyRoutineExecuted: false,
    legacyDynamicSqlExecuted: false,
    containsExpressionContent: false,
    containsDefaultValues: false,
    containsPayrollValues: false,
    containsPersonalData: false,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(canonical(body)) };
}

export function buildSyntheticPayrollSalaryitemsPrimaryRuleSourceReceipt(input) {
  return buildReceipt({ ...input, evidenceOrigin: "synthetic_contract_test" });
}

export function buildLivePayrollSalaryitemsPrimaryRuleSourceReceipt(input) {
  return buildReceipt({ ...input, evidenceOrigin: "live_bound_read_only_sqlserver" });
}

export function validatePayrollSalaryitemsPrimaryRuleSourceReceipt(receipt, { contract, repositoryRoot }) {
  exactKeys(
    receipt,
    [...BODY_KEYS, "receiptSha256"],
    "PAYROLL_SALARYITEMS_SOURCE_RECEIPT_INVALID",
    "receipt shape",
  );
  const { receiptSha256, ...body } = receipt;
  if (receiptSha256 !== digest(canonical(body))) {
    fail("PAYROLL_SALARYITEMS_SOURCE_RECEIPT_HASH_MISMATCH", "canonical receipt hash");
  }
  const rebuiltEvidence = {
    databaseReadOnly: body.sourceState?.readOnly,
    authority: body.etlAuthority,
    sourceObject: {
      schema: body.sourceObject?.schema,
      table: body.sourceObject?.table,
      exists: body.sourceObject?.exists,
      totalRows: body.sourceObject?.totalRows,
      fields: body.sourceObject?.fields?.map(({ nullRows, ...field }) => {
        if (field.exists && nullRows !== body.sourceObject.totalRows - field.nonNullRows) {
          fail("PAYROLL_SALARYITEMS_SOURCE_RECEIPT_INVALID", `${field.name}:null conservation`);
        }
        if (!field.exists && nullRows !== null) {
          fail("PAYROLL_SALARYITEMS_SOURCE_RECEIPT_INVALID", `${field.name}:absent null count`);
        }
        return field;
      }),
    },
  };
  const expected = buildReceipt({
    contract,
    repositoryRoot,
    evidence: rebuiltEvidence,
    evidenceOrigin: body.evidenceOrigin,
    sourceRestoreReceiptSha256: body.sourceRestoreReceiptSha256,
    sourceCatalogSha256: body.sourceCatalogSha256,
    databaseIdentitySha256: body.databaseIdentitySha256,
  });
  if (!same(receipt, expected)) {
    fail("PAYROLL_SALARYITEMS_SOURCE_RECEIPT_INVALID", "derived identity, status, gaps, or safety boundary");
  }
  return receipt;
}
