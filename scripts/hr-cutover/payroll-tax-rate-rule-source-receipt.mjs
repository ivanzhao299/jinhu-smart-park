/* global structuredClone */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA256 = /^[0-9a-f]{64}$/u;
const FIELDS = [
  ["id", "hr_payroll_tax_rule_version.legacy_tax_id", "integer_identity"],
  ["base", "hr_payroll_tax_rule_version.base_amount", "exact_decimal_text_parse_no_rounding"],
  ["limit1", "hr_payroll_tax_rule_version.lower_limit", "exact_decimal_text_parse_no_rounding"],
  ["limit2", "hr_payroll_tax_rule_version.upper_limit", "exact_decimal_text_parse_no_rounding"],
  ["taxpercent", "hr_payroll_tax_rule_version.tax_percent", "exact_decimal_text_parse_no_rounding"],
  ["offset", "hr_payroll_tax_rule_version.offset_amount", "exact_decimal_text_parse_no_rounding"],
];
const EVIDENCE_PATHS = Object.freeze({
  payrollRuleContract: "scripts/hr-cutover/contracts/legacy-payroll-rule-family-parity-v1.json",
  tableDomainMap: "scripts/hr-cutover/contracts/legacy-modern-table-domain-map-v1.json",
  routineLedger: "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json",
  extractor: "scripts/extract-yuzhou-t4-payroll-history.sh",
  transformer: "scripts/transform-yuzhou-t4-payroll-history.mjs",
  loader: "scripts/sql/load-yuzhou-t4-payroll-history.sql",
  targetSchema: "database/migrations/000248_hr_payroll_legacy_history.sql",
});
const BODY_KEYS = [
  "formatVersion", "artifactKind", "scope", "contractSha256", "sourceEvidenceSha256",
  "sourceRestoreReceiptSha256", "sourceCatalogSha256", "databaseIdentitySha256", "queryIdentitySha256",
  "evidenceOrigin", "sourceState", "etlAuthority", "sourceObject", "ruleRelation",
  "directRoutineLedgerReferences", "catalogDisposition", "sourceIdentityStatus", "routineReferenceStatus",
  "decision", "status", "gapCodes", "routineBodiesRead", "routineNamesReturned", "routineBodiesReturned",
  "legacyRoutineExecuted", "legacyDynamicSqlExecuted", "containsTaxAmounts", "containsPayrollValues",
  "containsPersonalData", "compatibilityCredit", "productionImport",
];

export const PAYROLL_TAX_RATE_SOURCE_STATE_SQL = `SET NOCOUNT ON;
SELECT
  CONVERT(varchar(1),CASE WHEN OBJECT_ID(N'dbo.tax',N'U') IS NULL THEN 0 ELSE 1 END),
  CONVERT(varchar(1),source_database.is_read_only),
  DB_NAME(),
  CONVERT(varchar(1),COALESCE(IS_SRVROLEMEMBER('sysadmin'),0)),
  CONVERT(varchar(1),COALESCE(IS_ROLEMEMBER('db_datareader'),0)),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION')),
  CONVERT(varchar(1),CASE WHEN COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','INSERT'),0)=1 OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.tax','OBJECT','INSERT'),0)=1 THEN 1 ELSE 0 END),
  CONVERT(varchar(1),CASE WHEN COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','UPDATE'),0)=1 OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.tax','OBJECT','UPDATE'),0)=1 THEN 1 ELSE 0 END),
  CONVERT(varchar(1),CASE WHEN COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','DELETE'),0)=1 OR COALESCE(HAS_PERMS_BY_NAME(N'dbo.tax','OBJECT','DELETE'),0)=1 THEN 1 ELSE 0 END),
  CONVERT(varchar(1),HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','EXECUTE'))
FROM sys.databases source_database
WHERE source_database.name=DB_NAME();`;

// Only anonymous catalog counts are returned. Module definitions and routine
// names are deliberately excluded, so dynamic references remain unproven.
export const PAYROLL_TAX_RATE_FIELD_CATALOG_SQL = `SET NOCOUNT ON;
WITH requested(field_name,field_order) AS (
  SELECT N'id',1 UNION ALL
  SELECT N'base',2 UNION ALL
  SELECT N'limit1',3 UNION ALL
  SELECT N'limit2',4 UNION ALL
  SELECT N'taxpercent',5 UNION ALL
  SELECT N'offset',6
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
  ON source_column.object_id=OBJECT_ID(N'dbo.tax',N'U')
 AND source_column.name=requested.field_name
LEFT JOIN sys.sql_expression_dependencies source_dependency
  ON source_dependency.referenced_id=source_column.object_id
 AND source_dependency.referenced_minor_id=source_column.column_id
LEFT JOIN sys.procedures source_routine
  ON source_routine.object_id=source_dependency.referencing_id
 AND source_routine.is_ms_shipped=0
GROUP BY requested.field_name,requested.field_order,source_column.object_id,source_column.user_type_id,source_column.max_length,source_column.precision,source_column.scale,source_column.is_nullable,source_column.is_computed
ORDER BY requested.field_order;`;

export const PAYROLL_TAX_RATE_TABLE_AGGREGATE_SQL = `SET NOCOUNT ON;
SELECT CONVERT(varchar(30),COUNT_BIG(*)) FROM dbo.tax;`;
export const PAYROLL_TAX_RATE_FIELD_AGGREGATE_SQL = Object.freeze(Object.fromEntries(
  FIELDS.map(([name]) => [name, `SET NOCOUNT ON;\nSELECT CONVERT(varchar(30),COUNT_BIG([${name}])) FROM dbo.tax;`]),
));

export class PayrollTaxRateRuleSourceReceiptError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "PayrollTaxRateRuleSourceReceiptError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new PayrollTaxRateRuleSourceReceiptError(code, detail); };
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

function readBoundFile(repositoryRoot, evidence, key) {
  const path = EVIDENCE_PATHS[key];
  if (!object(evidence) || evidence.path !== path || !SHA256.test(evidence.sha256 ?? "")) {
    fail("PAYROLL_TAX_RATE_SOURCE_CONTRACT_INVALID", `${key} binding`);
  }
  const bytes = readFileSync(resolve(repositoryRoot, path));
  if (digest(bytes) !== evidence.sha256) fail("PAYROLL_TAX_RATE_SOURCE_EVIDENCE_DRIFT", key);
  return bytes;
}

function validateStaticEvidence(contract, repositoryRoot) {
  const bytes = {};
  for (const key of Object.keys(EVIDENCE_PATHS)) bytes[key] = readBoundFile(repositoryRoot, contract.sourceEvidence?.[key], key);
  let payroll;
  let domainMap;
  let ledger;
  try {
    payroll = JSON.parse(bytes.payrollRuleContract);
    domainMap = JSON.parse(bytes.tableDomainMap);
    ledger = JSON.parse(bytes.routineLedger);
  } catch {
    fail("PAYROLL_TAX_RATE_SOURCE_CONTRACT_INVALID", "bound JSON evidence");
  }
  const payrollGroup = domainMap.groups?.find(row => row.domain === "payroll");
  const normalization = domainMap.implementedNormalizationRules?.find(row => row.id === "t4-payroll-tax");
  const readers = ledger.routines?.filter(row => row.readTables?.includes("tax")) ?? [];
  const writers = ledger.routines?.filter(row => row.writeTables?.includes("tax")) ?? [];
  const extractor = bytes.extractor.toString("utf8");
  const transformer = bytes.transformer.toString("utf8");
  const loader = bytes.loader.toString("utf8");
  const targetSchema = bytes.targetSchema.toString("utf8");
  const exactFieldList = "id,CONVERT(varchar(64),base) base,CONVERT(varchar(64),limit1) limit1,CONVERT(varchar(64),limit2) limit2,CONVERT(varchar(64),taxpercent) taxpercent,CONVERT(varchar(64),offset) offset FROM dbo.tax";
  const targetColumns = "legacy_tax_id,base_amount,lower_limit,upper_limit,tax_percent,offset_amount";
  if (payroll.contractKind !== "yuzhou_hr_legacy_payroll_rule_family_parity"
    || payroll.sourceBinding?.sourceObjects?.some(row => row.name === "tax")
    || payroll.fieldMappings?.some(row => row.sourceObject === "tax")
    || payroll.productionImport !== "HOLD"
    || !payrollGroup?.sourceTables?.includes("tax")
    || !payrollGroup?.targetTables?.includes("hr_payroll_tax_rule_version")
    || normalization?.sourceTable !== "tax"
    || !normalization?.targetLocators?.includes("hr_payroll_tax_rule_version")
    || ledger.routines?.length !== 212
    || ledger.productionImport !== "HOLD"
    || readers.length !== 1
    || readers[0]?.routineId !== contract.routineLedgerPolicy.expectedReaderStableId
    || readers[0]?.canonicalFamily !== contract.routineLedgerPolicy.expectedReaderFamily
    || readers[0]?.dynamicMutationStatus !== contract.routineLedgerPolicy.expectedDynamicMutationStatus
    || writers.length !== 0
    || !extractor.includes(exactFieldList)
    || !transformer.includes("source: { id: row.id, base: exactDecimal(row.base), limit1: exactDecimal(row.limit1), limit2: exactDecimal(row.limit2), taxpercent: exactDecimal(row.taxpercent), offset: exactDecimal(row.offset) }")
    || !loader.includes(`hr_payroll_tax_rule_version(tenant_id,park_id,${targetColumns},source_hash,remark)`)
    || !targetSchema.includes("CREATE TABLE IF NOT EXISTS hr_payroll_tax_rule_version")
    || !targetSchema.includes("base_amount numeric(20,4),lower_limit numeric(20,4),upper_limit numeric(20,4),tax_percent numeric(20,4),offset_amount numeric(20,4)")) {
    fail("PAYROLL_TAX_RATE_SOURCE_BOUND_CONTRACT_DRIFT", "static source, routine, transform, or target identity");
  }
  return {
    sourceEvidenceSha256: Object.fromEntries(Object.entries(contract.sourceEvidence).map(([key, value]) => [key, value.sha256])),
    directReaders: readers.length,
    directWriters: writers.length,
  };
}

function validateContract(contract, repositoryRoot) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_payroll_tax_rate_rule_source_receipt"
    || contract.scope !== "tax_rate_rule_source_identity"
    || contract.sourceObject?.schema !== "dbo"
    || contract.sourceObject?.table !== "tax"
    || contract.sourceObject?.staticObservedRows !== 9
    || contract.sourceObject?.staticObservedRowsStatus !== "non_authoritative_until_live_receipt"
    || !same(contract.sourceObject?.fields?.map(row => [row.name, row.targetField, row.transform]), FIELDS)
    || contract.ruleRelation?.stableId !== "TAX_RATE_RULE_SOURCE_RELATION_V1"
    || contract.ruleRelation?.mappingContractStatus !== "observed_static_etl_path_only"
    || !["sourceIdentityStatus", "rowRelationParity", "rateUnitSemantics", "boundaryInclusivitySemantics", "roundingSemantics", "effectivePeriodSemantics"].every(key => contract.ruleRelation?.[key] === "pending")
    || contract.routineLedgerPolicy?.expectedDirectReaders !== 1
    || contract.routineLedgerPolicy?.expectedDirectWriters !== 0
    || contract.routineLedgerPolicy?.expectedReaderFamily !== "bs_taxreport"
    || contract.routineLedgerPolicy?.expectedReaderStableId !== "RULE-869F0B849E2B83EA"
    || contract.routineLedgerPolicy?.expectedDynamicMutationStatus !== "unknown_requires_review"
    || contract.routineLedgerPolicy?.staticDependencyDoesNotProveRuntimeBehavior !== true
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
    || contract.evidencePolicy?.noDuplicateFieldCredit !== true
    || contract.evidencePolicy?.requiredDecision !== "KEEP_PENDING"
    || contract.containsTaxAmounts !== false
    || contract.containsPayrollValues !== false
    || contract.containsPersonalData !== false
    || contract.compatibilityCredit !== 0
    || contract.productionImport !== "HOLD") {
    fail("PAYROLL_TAX_RATE_SOURCE_CONTRACT_INVALID", "identity or safety boundary");
  }
  return { contractSha256: digest(canonical(contract)), ...validateStaticEvidence(contract, repositoryRoot) };
}

function validateAuthority(authority) {
  exactKeys(authority, ["loginSucceeded", "sysadmin", "dbDatareader", "viewDefinition", "insert", "update", "delete", "execute"], "PAYROLL_TAX_RATE_SOURCE_AUTHORITY_INVALID", "authority shape");
  if (authority.loginSucceeded !== true || authority.sysadmin !== false || authority.dbDatareader !== true
    || authority.viewDefinition !== true || authority.insert !== false || authority.update !== false
    || authority.delete !== false || authority.execute !== false) {
    fail("PAYROLL_TAX_RATE_SOURCE_AUTHORITY_INVALID", "least-privilege read-only authority required");
  }
}

function validateField(field, tableExists, totalRows) {
  exactKeys(field, ["name", "exists", "sqlType", "maxLength", "precision", "scale", "nullable", "computed", "nonNullRows", "routineReferenceCount"], "PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", "field shape");
  if (!FIELDS.some(([name]) => name === field.name) || typeof field.exists !== "boolean") fail("PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", "field identity");
  requireCount(field.routineReferenceCount, "PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", `${field.name}:routineReferenceCount`);
  if (!field.exists) {
    if ([field.sqlType, field.maxLength, field.precision, field.scale, field.nullable, field.computed, field.nonNullRows].some(value => value !== null)) {
      fail("PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", `${field.name}:absent metadata`);
    }
    return;
  }
  if (!tableExists || typeof field.sqlType !== "string" || !field.sqlType
    || !Number.isSafeInteger(field.maxLength) || !Number.isSafeInteger(field.precision) || !Number.isSafeInteger(field.scale)
    || typeof field.nullable !== "boolean" || typeof field.computed !== "boolean") {
    fail("PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", `${field.name}:catalog metadata`);
  }
  requireCount(field.nonNullRows, "PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", `${field.name}:nonNullRows`);
  if (field.nonNullRows > totalRows) fail("PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", `${field.name}:count conservation`);
}

function validateEvidence(evidence) {
  exactKeys(evidence, ["databaseReadOnly", "authority", "sourceObject"], "PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", "evidence shape");
  if (evidence.databaseReadOnly !== true) fail("PAYROLL_TAX_RATE_SOURCE_NOT_READ_ONLY", "source database");
  validateAuthority(evidence.authority);
  exactKeys(evidence.sourceObject, ["schema", "table", "exists", "totalRows", "fields"], "PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", "source object shape");
  if (evidence.sourceObject.schema !== "dbo" || evidence.sourceObject.table !== "tax"
    || typeof evidence.sourceObject.exists !== "boolean" || !Array.isArray(evidence.sourceObject.fields)
    || evidence.sourceObject.fields.length !== FIELDS.length
    || !same(evidence.sourceObject.fields.map(row => row.name), FIELDS.map(([name]) => name))) {
    fail("PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", "source object identity");
  }
  if (evidence.sourceObject.exists) requireCount(evidence.sourceObject.totalRows, "PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", "totalRows");
  else if (evidence.sourceObject.totalRows !== null) fail("PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", "absent table row count");
  for (const field of evidence.sourceObject.fields) {
    validateField(field, evidence.sourceObject.exists, evidence.sourceObject.totalRows);
    if (!evidence.sourceObject.exists && field.exists) fail("PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", `${field.name}:field without table`);
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
  return digest([PAYROLL_TAX_RATE_SOURCE_STATE_SQL, PAYROLL_TAX_RATE_FIELD_CATALOG_SQL,
    PAYROLL_TAX_RATE_TABLE_AGGREGATE_SQL, ...FIELDS.map(([name]) => PAYROLL_TAX_RATE_FIELD_AGGREGATE_SQL[name]), ""].join("\n"));
}

function buildReceipt({ contract, repositoryRoot, evidence, evidenceOrigin, sourceRestoreReceiptSha256, sourceCatalogSha256, databaseIdentitySha256 }) {
  const binding = validateContract(contract, repositoryRoot);
  for (const [label, value] of Object.entries({ sourceRestoreReceiptSha256, sourceCatalogSha256, databaseIdentitySha256 })) {
    if (!SHA256.test(value ?? "")) fail("PAYROLL_TAX_RATE_SOURCE_RECEIPT_INVALID", label);
  }
  if (!["synthetic_contract_test", "live_bound_read_only_sqlserver"].includes(evidenceOrigin)) fail("PAYROLL_TAX_RATE_SOURCE_RECEIPT_INVALID", "evidence origin");
  const safeEvidence = validateEvidence(evidence);
  const disposition = catalogDisposition(safeEvidence);
  const liveObserved = evidenceOrigin === "live_bound_read_only_sqlserver" && disposition === "source_catalog_and_non_null_presence_observed";
  const totalReferences = safeEvidence.sourceObject.fields.reduce((sum, row) => sum + row.routineReferenceCount, 0);
  const conditionalGaps = {
    source_table_absent: "PAYROLL_TAX_RATE_SOURCE_TABLE_ABSENT",
    source_table_empty: "PAYROLL_TAX_RATE_SOURCE_TABLE_EMPTY_SEMANTICS_PENDING",
  };
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_payroll_tax_rate_rule_source_receipt",
    scope: contract.scope,
    contractSha256: binding.contractSha256,
    sourceEvidenceSha256: binding.sourceEvidenceSha256,
    sourceRestoreReceiptSha256,
    sourceCatalogSha256,
    databaseIdentitySha256,
    queryIdentitySha256: queryIdentitySha256(),
    evidenceOrigin,
    sourceState: { readOnly: true },
    etlAuthority: safeEvidence.authority,
    sourceObject: {
      ...safeEvidence.sourceObject,
      fields: safeEvidence.sourceObject.fields.map(row => ({ ...row, nullRows: row.exists ? safeEvidence.sourceObject.totalRows - row.nonNullRows : null })),
    },
    ruleRelation: {
      stableId: contract.ruleRelation.stableId,
      mappingContractStatus: contract.ruleRelation.mappingContractStatus,
      sourceIdentityStatus: liveObserved ? "observed" : "pending",
      rowRelationParity: "pending",
      rateUnitSemantics: "pending",
      boundaryInclusivitySemantics: "pending",
      roundingSemantics: "pending",
      effectivePeriodSemantics: "pending",
    },
    directRoutineLedgerReferences: { readers: binding.directReaders, writers: binding.directWriters },
    catalogDisposition: disposition,
    sourceIdentityStatus: liveObserved ? "observed" : "pending",
    routineReferenceStatus: totalReferences > 0
      ? "anonymous_column_dependency_counts_observed_dynamic_and_behavior_pending"
      : "no_resolved_column_dependencies_observed_static_table_relation_only",
    decision: "KEEP_PENDING",
    status: liveObserved ? "SOURCE_CATALOG_OBSERVED_TAX_SEMANTICS_PENDING" : "SOURCE_IDENTITY_PENDING",
    gapCodes: [
      ...(liveObserved ? [] : ["PAYROLL_TAX_RATE_SOURCE_CATALOG_PENDING"]),
      ...(conditionalGaps[disposition] ? [conditionalGaps[disposition]] : []),
      ...(disposition.startsWith("source_fields_absent:") ? ["PAYROLL_TAX_RATE_SOURCE_FIELDS_ABSENT"] : []),
      ...(disposition.startsWith("source_fields_all_null:") ? ["PAYROLL_TAX_RATE_ALL_NULL_FIELD_SEMANTICS_PENDING"] : []),
      "PAYROLL_TAX_RATE_ROUTINE_REFERENCE_SEMANTICS_PENDING",
      "PAYROLL_TAX_RATE_DYNAMIC_REFERENCES_NOT_OBSERVED",
      "PAYROLL_TAX_RATE_ROW_RELATION_PARITY_PENDING",
      "PAYROLL_TAX_RATE_UNIT_SEMANTICS_PENDING",
      "PAYROLL_TAX_RATE_BOUNDARY_INCLUSIVITY_PENDING",
      "PAYROLL_TAX_RATE_ROUNDING_SEMANTICS_PENDING",
      "PAYROLL_TAX_RATE_EFFECTIVE_PERIOD_SEMANTICS_PENDING",
    ],
    routineBodiesRead: false,
    routineNamesReturned: false,
    routineBodiesReturned: false,
    legacyRoutineExecuted: false,
    legacyDynamicSqlExecuted: false,
    containsTaxAmounts: false,
    containsPayrollValues: false,
    containsPersonalData: false,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(canonical(body)) };
}

export function buildSyntheticPayrollTaxRateRuleSourceReceipt(input) {
  return buildReceipt({ ...input, evidenceOrigin: "synthetic_contract_test" });
}

export function buildLivePayrollTaxRateRuleSourceReceipt(input) {
  return buildReceipt({ ...input, evidenceOrigin: "live_bound_read_only_sqlserver" });
}

export function validatePayrollTaxRateRuleSourceReceipt(receipt, { contract, repositoryRoot }) {
  exactKeys(receipt, [...BODY_KEYS, "receiptSha256"], "PAYROLL_TAX_RATE_SOURCE_RECEIPT_INVALID", "receipt shape");
  const { receiptSha256, ...body } = receipt;
  if (receiptSha256 !== digest(canonical(body))) fail("PAYROLL_TAX_RATE_SOURCE_RECEIPT_HASH_MISMATCH", "canonical hash");
  const evidence = {
    databaseReadOnly: body.sourceState?.readOnly,
    authority: body.etlAuthority,
    sourceObject: {
      schema: body.sourceObject?.schema,
      table: body.sourceObject?.table,
      exists: body.sourceObject?.exists,
      totalRows: body.sourceObject?.totalRows,
      fields: body.sourceObject?.fields?.map(({ nullRows, ...field }) => {
        if (field.exists && nullRows !== body.sourceObject.totalRows - field.nonNullRows) fail("PAYROLL_TAX_RATE_SOURCE_RECEIPT_INVALID", `${field.name}:null conservation`);
        if (!field.exists && nullRows !== null) fail("PAYROLL_TAX_RATE_SOURCE_RECEIPT_INVALID", `${field.name}:absent null count`);
        return field;
      }),
    },
  };
  const expected = buildReceipt({ contract, repositoryRoot, evidence, evidenceOrigin: body.evidenceOrigin,
    sourceRestoreReceiptSha256: body.sourceRestoreReceiptSha256, sourceCatalogSha256: body.sourceCatalogSha256,
    databaseIdentitySha256: body.databaseIdentitySha256 });
  if (!same(receipt, expected)) fail("PAYROLL_TAX_RATE_SOURCE_RECEIPT_INVALID", "derived identity, status, gaps, or safety boundary");
  return receipt;
}
