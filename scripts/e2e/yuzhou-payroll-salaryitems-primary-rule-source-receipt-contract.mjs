import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildLivePayrollSalaryitemsPrimaryRuleSourceReceipt,
  buildSyntheticPayrollSalaryitemsPrimaryRuleSourceReceipt,
  PAYROLL_SALARYITEMS_FIELD_AGGREGATE_SQL,
  PAYROLL_SALARYITEMS_FIELD_CATALOG_SQL,
  PAYROLL_SALARYITEMS_SOURCE_STATE_SQL,
  PAYROLL_SALARYITEMS_TABLE_AGGREGATE_SQL,
  PayrollSalaryitemsPrimaryRuleSourceReceiptError,
  validatePayrollSalaryitemsPrimaryRuleSourceReceipt,
} from "../hr-cutover/payroll-salaryitems-primary-rule-source-receipt.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = "scripts/hr-cutover/contracts/legacy-payroll-salaryitems-primary-rule-source-receipt-v1.json";
const contract = JSON.parse(readFileSync(resolve(root, contractPath), "utf8"));
const sha = "a".repeat(64);

const authority = () => ({
  loginSucceeded: true,
  sysadmin: false,
  dbDatareader: true,
  viewDefinition: true,
  insert: false,
  update: false,
  delete: false,
  execute: false,
});

const sourceField = (name, overrides = {}) => ({
  name,
  exists: true,
  sqlType: "varchar",
  maxLength: 8000,
  precision: 0,
  scale: 0,
  nullable: true,
  computed: false,
  nonNullRows: 5,
  routineReferenceCount: 2,
  ...overrides,
});

const evidence = (overrides = {}) => ({
  databaseReadOnly: true,
  authority: authority(),
  sourceObject: {
    schema: "dbo",
    table: "salaryitems",
    exists: true,
    totalRows: 7,
    fields: [sourceField("expression"), sourceField("cit"), sourceField("defvalue")],
  },
  ...overrides,
});

const buildInput = (sourceEvidence = evidence()) => ({
  contract,
  repositoryRoot: root,
  evidence: sourceEvidence,
  sourceRestoreReceiptSha256: sha,
  sourceCatalogSha256: "b".repeat(64),
  databaseIdentitySha256: "c".repeat(64),
});

const rejects = (code, action) => assert.throws(
  action,
  error => error instanceof PayrollSalaryitemsPrimaryRuleSourceReceiptError && error.code === code,
);

test("contract binds all three pending salaryitems mappings to immutable payroll evidence", () => {
  const payrollPath = resolve(root, contract.sourceEvidence.payrollRuleContract.path);
  const ledgerPath = resolve(root, contract.sourceEvidence.routineLedger.path);
  assert.equal(createHash("sha256").update(readFileSync(payrollPath)).digest("hex"), contract.sourceEvidence.payrollRuleContract.sha256);
  assert.equal(createHash("sha256").update(readFileSync(ledgerPath)).digest("hex"), contract.sourceEvidence.routineLedger.sha256);
  assert.deepEqual(contract.sourceObject.fields.map(row => row.name), ["expression", "cit", "defvalue"]);
  assert.deepEqual(contract.sourceObject.fields.map(row => row.payrollGapCode), [
    "PAYROLL_ITEM_RULE_SLOT_1_TARGET_MISSING",
    "PAYROLL_ITEM_CONDITION_SLOT_1_TARGET_MISSING",
    "PAYROLL_ITEM_DEFAULT_VALUE_TARGET_MISSING",
  ]);
  assert.equal(contract.compatibilityCredit, 0);
  assert.equal(contract.productionImport, "HOLD");
});

test("synthetic catalog facts remain pending and preserve exact aggregate conservation", () => {
  const receipt = buildSyntheticPayrollSalaryitemsPrimaryRuleSourceReceipt(buildInput());
  assert.equal(receipt.evidenceOrigin, "synthetic_contract_test");
  assert.equal(receipt.catalogDisposition, "source_catalog_and_non_null_presence_observed");
  assert.equal(receipt.sourceIdentityStatus, "pending");
  assert.equal(receipt.status, "SOURCE_IDENTITY_PENDING");
  assert.equal(receipt.semanticReviewStatus, "pending");
  assert.equal(receipt.decision, "KEEP_PENDING");
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionImport, "HOLD");
  assert.deepEqual(receipt.sourceObject.fields.map(field => field.nullRows), [2, 2, 2]);
  assert.ok(receipt.gapCodes.includes("PAYROLL_SALARYITEMS_SOURCE_CATALOG_PENDING"));
  assert.deepEqual(validatePayrollSalaryitemsPrimaryRuleSourceReceipt(receipt, { contract, repositoryRoot: root }), receipt);
});

test("even complete live catalog evidence records observation only and never grants semantic credit", () => {
  const receipt = buildLivePayrollSalaryitemsPrimaryRuleSourceReceipt(buildInput());
  assert.equal(receipt.sourceIdentityStatus, "observed");
  assert.equal(receipt.status, "SOURCE_CATALOG_OBSERVED_SEMANTIC_REVIEW_PENDING");
  assert.equal(receipt.routineReferenceStatus, "anonymous_catalog_dependency_counts_observed_dynamic_and_semantics_pending");
  assert.equal(receipt.semanticReviewStatus, "pending");
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionImport, "HOLD");
  assert.equal(receipt.gapCodes.includes("PAYROLL_SALARYITEMS_SOURCE_CATALOG_PENDING"), false);
  assert.ok(receipt.gapCodes.includes("PAYROLL_SALARYITEMS_ROUTINE_REFERENCE_SEMANTICS_PENDING"));
  for (const row of contract.sourceObject.fields) assert.ok(receipt.gapCodes.includes(row.payrollGapCode));
});

test("absent table, absent field, empty table and all-null field stay explicitly pending", () => {
  const absentField = name => sourceField(name, {
    exists: false,
    sqlType: null,
    maxLength: null,
    precision: null,
    scale: null,
    nullable: null,
    computed: null,
    nonNullRows: null,
    routineReferenceCount: 0,
  });
  const absentTable = evidence({
    sourceObject: {
      schema: "dbo",
      table: "salaryitems",
      exists: false,
      totalRows: null,
      fields: [absentField("expression"), absentField("cit"), absentField("defvalue")],
    },
  });
  assert.equal(buildLivePayrollSalaryitemsPrimaryRuleSourceReceipt(buildInput(absentTable)).catalogDisposition, "source_table_absent");

  const missing = evidence();
  missing.sourceObject.fields[1] = absentField("cit");
  assert.equal(buildLivePayrollSalaryitemsPrimaryRuleSourceReceipt(buildInput(missing)).catalogDisposition, "source_fields_absent:cit");

  const empty = evidence();
  empty.sourceObject.totalRows = 0;
  empty.sourceObject.fields = empty.sourceObject.fields.map(field => ({ ...field, nonNullRows: 0 }));
  assert.equal(buildLivePayrollSalaryitemsPrimaryRuleSourceReceipt(buildInput(empty)).catalogDisposition, "source_table_empty");

  const allNull = evidence();
  allNull.sourceObject.fields[2].nonNullRows = 0;
  const receipt = buildLivePayrollSalaryitemsPrimaryRuleSourceReceipt(buildInput(allNull));
  assert.equal(receipt.catalogDisposition, "source_fields_all_null:defvalue");
  assert.equal(receipt.sourceIdentityStatus, "pending");
  assert.equal(receipt.compatibilityCredit, 0);
});

test("routine evidence remains anonymous and count-conserved", () => {
  const noReferences = evidence();
  noReferences.sourceObject.fields = noReferences.sourceObject.fields.map(field => ({
    ...field,
    routineReferenceCount: 0,
  }));
  assert.equal(
    buildLivePayrollSalaryitemsPrimaryRuleSourceReceipt(buildInput(noReferences)).routineReferenceStatus,
    "no_resolved_catalog_dependencies_observed_dynamic_and_semantics_pending",
  );

  const invalid = evidence();
  invalid.sourceObject.fields[0].routineReferenceCount = -1;
  rejects("PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID", () => buildSyntheticPayrollSalaryitemsPrimaryRuleSourceReceipt(buildInput(invalid)));
});

test("source evidence rejects writable databases and elevated or write-capable authority", () => {
  const writable = evidence({ databaseReadOnly: false });
  rejects("PAYROLL_SALARYITEMS_SOURCE_NOT_READ_ONLY", () => buildSyntheticPayrollSalaryitemsPrimaryRuleSourceReceipt(buildInput(writable)));

  for (const [key, value] of [["sysadmin", true], ["dbDatareader", false], ["viewDefinition", false], ["insert", true], ["update", true], ["delete", true], ["execute", true]]) {
    const unsafe = evidence();
    unsafe.authority[key] = value;
    rejects("PAYROLL_SALARYITEMS_SOURCE_AUTHORITY_INVALID", () => buildSyntheticPayrollSalaryitemsPrimaryRuleSourceReceipt(buildInput(unsafe)));
  }
});

test("malformed catalog counts and metadata fail closed", () => {
  const tooManyNonNull = evidence();
  tooManyNonNull.sourceObject.fields[0].nonNullRows = 8;
  rejects("PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID", () => buildSyntheticPayrollSalaryitemsPrimaryRuleSourceReceipt(buildInput(tooManyNonNull)));

  const missingType = evidence();
  missingType.sourceObject.fields[0].sqlType = "";
  rejects("PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID", () => buildSyntheticPayrollSalaryitemsPrimaryRuleSourceReceipt(buildInput(missingType)));

  const wrongOrder = evidence();
  wrongOrder.sourceObject.fields.reverse();
  rejects("PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_INVALID", () => buildSyntheticPayrollSalaryitemsPrimaryRuleSourceReceipt(buildInput(wrongOrder)));
});

test("receipt and bound-contract drift are rejected", () => {
  const receipt = buildSyntheticPayrollSalaryitemsPrimaryRuleSourceReceipt(buildInput());
  receipt.compatibilityCredit = 1;
  rejects("PAYROLL_SALARYITEMS_SOURCE_RECEIPT_HASH_MISMATCH", () => validatePayrollSalaryitemsPrimaryRuleSourceReceipt(receipt, { contract, repositoryRoot: root }));

  const driftedContract = structuredClone(contract);
  driftedContract.sourceEvidence.payrollRuleContract.sha256 = "0".repeat(64);
  rejects("PAYROLL_SALARYITEMS_SOURCE_EVIDENCE_DRIFT", () => buildSyntheticPayrollSalaryitemsPrimaryRuleSourceReceipt({
    ...buildInput(),
    contract: driftedContract,
  }));
});

test("read-only SQL emits catalog metadata and anonymous counts, never values, names, bodies or writes", () => {
  assert.match(PAYROLL_SALARYITEMS_SOURCE_STATE_SQL, /OBJECT_ID\(N'dbo\.salaryitems',N'U'\)/u);
  assert.match(PAYROLL_SALARYITEMS_SOURCE_STATE_SQL, /is_read_only/u);
  assert.match(PAYROLL_SALARYITEMS_SOURCE_STATE_SQL, /HAS_PERMS_BY_NAME\(N'dbo\.salaryitems','OBJECT','UPDATE'\)/u);
  assert.match(PAYROLL_SALARYITEMS_FIELD_CATALOG_SQL, /sys\.columns/u);
  assert.match(PAYROLL_SALARYITEMS_FIELD_CATALOG_SQL, /sys\.sql_expression_dependencies/u);
  assert.match(PAYROLL_SALARYITEMS_FIELD_CATALOG_SQL, /COUNT_BIG\(DISTINCT source_routine\.object_id\)/u);
  assert.doesNotMatch(PAYROLL_SALARYITEMS_FIELD_CATALOG_SQL, /sys\.sql_modules|\.definition\b/iu);
  assert.doesNotMatch(PAYROLL_SALARYITEMS_FIELD_CATALOG_SQL, /SELECT\s+(?:source_routine\.)?name\b/iu);
  assert.doesNotMatch(PAYROLL_SALARYITEMS_FIELD_CATALOG_SQL, /SELECT\s+(?:source_module\.)?definition\b/iu);

  const aggregateQueries = [PAYROLL_SALARYITEMS_TABLE_AGGREGATE_SQL, ...Object.values(PAYROLL_SALARYITEMS_FIELD_AGGREGATE_SQL)];
  for (const query of aggregateQueries) {
    assert.match(query, /SELECT CONVERT\(varchar\(30\),COUNT_BIG\(/u);
    assert.doesNotMatch(query, /\bSUM\s*\(|\bMIN\s*\(|\bMAX\s*\(/iu);
  }
  const allSql = [PAYROLL_SALARYITEMS_SOURCE_STATE_SQL, PAYROLL_SALARYITEMS_FIELD_CATALOG_SQL, ...aggregateQueries].join("\n");
  assert.doesNotMatch(allSql, /\bINSERT\s+INTO\b|\bUPDATE\s+dbo\.|\bDELETE\s+FROM\b|\bMERGE\s+INTO\b/iu);
  assert.doesNotMatch(allSql, /\bEXEC(?:UTE)?\s+(?:dbo\.|sp_executesql)/iu);
});

test("receipt carries only structural evidence and explicit non-disclosure flags", () => {
  const receipt = buildSyntheticPayrollSalaryitemsPrimaryRuleSourceReceipt(buildInput());
  assert.equal(receipt.routineNamesReturned, false);
  assert.equal(receipt.routineBodiesRead, false);
  assert.equal(receipt.routineBodiesReturned, false);
  assert.equal(receipt.legacyRoutineExecuted, false);
  assert.equal(receipt.legacyDynamicSqlExecuted, false);
  assert.equal(receipt.containsExpressionContent, false);
  assert.equal(receipt.containsDefaultValues, false);
  assert.equal(receipt.containsPayrollValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(JSON.stringify(receipt), /"routineName":/u);
  assert.match(receipt.queryIdentitySha256, /^[0-9a-f]{64}$/u);
});
