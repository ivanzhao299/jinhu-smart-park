import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildLivePayrollTaxRateRuleSourceReceipt,
  buildSyntheticPayrollTaxRateRuleSourceReceipt,
  PAYROLL_TAX_RATE_FIELD_AGGREGATE_SQL,
  PAYROLL_TAX_RATE_FIELD_CATALOG_SQL,
  PAYROLL_TAX_RATE_SOURCE_STATE_SQL,
  PAYROLL_TAX_RATE_TABLE_AGGREGATE_SQL,
  PayrollTaxRateRuleSourceReceiptError,
  validatePayrollTaxRateRuleSourceReceipt,
} from "../hr-cutover/payroll-tax-rate-rule-source-receipt.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-payroll-tax-rate-rule-source-receipt-v1.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8"));
const names = ["id", "base", "limit1", "limit2", "taxpercent", "offset"];
const sha = character => character.repeat(64);
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
const field = (name, overrides = {}) => ({
  name,
  exists: true,
  sqlType: name === "id" ? "int" : "numeric",
  maxLength: name === "id" ? 4 : 9,
  precision: name === "id" ? 10 : 18,
  scale: name === "id" ? 0 : 4,
  nullable: name !== "id",
  computed: false,
  nonNullRows: name === "offset" ? 4 : 5,
  routineReferenceCount: 0,
  ...overrides,
});
const evidence = (overrides = {}) => ({
  databaseReadOnly: true,
  authority: authority(),
  sourceObject: {
    schema: "dbo",
    table: "tax",
    exists: true,
    totalRows: 5,
    fields: names.map(name => field(name)),
  },
  ...overrides,
});
const input = (sourceEvidence = evidence()) => ({
  contract,
  repositoryRoot: root,
  evidence: sourceEvidence,
  sourceRestoreReceiptSha256: sha("a"),
  sourceCatalogSha256: sha("b"),
  databaseIdentitySha256: sha("c"),
});
const rejects = (code, action) => assert.throws(
  action,
  error => error instanceof PayrollTaxRateRuleSourceReceiptError && error.code === code,
);

test("contract binds the low-volume tax catalog, static reader relation, ETL mapping and modern target without credit", () => {
  assert.deepEqual(contract.sourceObject.fields.map(row => row.name), names);
  assert.equal(contract.sourceObject.staticObservedRows, 9);
  assert.equal(contract.routineLedgerPolicy.expectedDirectReaders, 1);
  assert.equal(contract.routineLedgerPolicy.expectedDirectWriters, 0);
  assert.equal(contract.ruleRelation.mappingContractStatus, "observed_static_etl_path_only");
  assert.equal(contract.evidencePolicy.noDuplicateFieldCredit, true);
  for (const evidenceRow of Object.values(contract.sourceEvidence)) {
    const actual = createHash("sha256").update(readFileSync(resolve(root, evidenceRow.path))).digest("hex");
    assert.equal(actual, evidenceRow.sha256);
  }
  assert.equal(contract.compatibilityCredit, 0);
  assert.equal(contract.productionImport, "HOLD");
});

test("synthetic evidence remains pending and exposes only metadata and counts", () => {
  const receipt = buildSyntheticPayrollTaxRateRuleSourceReceipt(input());
  assert.equal(receipt.evidenceOrigin, "synthetic_contract_test");
  assert.equal(receipt.catalogDisposition, "source_catalog_and_non_null_presence_observed");
  assert.equal(receipt.sourceIdentityStatus, "pending");
  assert.equal(receipt.status, "SOURCE_IDENTITY_PENDING");
  assert.equal(receipt.ruleRelation.mappingContractStatus, "observed_static_etl_path_only");
  assert.deepEqual(receipt.sourceObject.fields.map(row => row.nullRows), [0, 0, 0, 0, 0, 1]);
  assert.ok(receipt.gapCodes.includes("PAYROLL_TAX_RATE_SOURCE_CATALOG_PENDING"));
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionImport, "HOLD");
  assert.deepEqual(validatePayrollTaxRateRuleSourceReceipt(receipt, { contract, repositoryRoot: root }), receipt);
});

test("complete live catalog observation cannot prove rate unit, boundary, rounding, period or row behavior", () => {
  const receipt = buildLivePayrollTaxRateRuleSourceReceipt(input());
  assert.equal(receipt.sourceIdentityStatus, "observed");
  assert.equal(receipt.status, "SOURCE_CATALOG_OBSERVED_TAX_SEMANTICS_PENDING");
  assert.equal(receipt.ruleRelation.rowRelationParity, "pending");
  assert.equal(receipt.ruleRelation.rateUnitSemantics, "pending");
  assert.equal(receipt.ruleRelation.boundaryInclusivitySemantics, "pending");
  assert.equal(receipt.ruleRelation.roundingSemantics, "pending");
  assert.equal(receipt.ruleRelation.effectivePeriodSemantics, "pending");
  for (const code of [
    "PAYROLL_TAX_RATE_ROW_RELATION_PARITY_PENDING",
    "PAYROLL_TAX_RATE_UNIT_SEMANTICS_PENDING",
    "PAYROLL_TAX_RATE_BOUNDARY_INCLUSIVITY_PENDING",
    "PAYROLL_TAX_RATE_ROUNDING_SEMANTICS_PENDING",
    "PAYROLL_TAX_RATE_EFFECTIVE_PERIOD_SEMANTICS_PENDING",
  ]) assert.ok(receipt.gapCodes.includes(code));
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionImport, "HOLD");
});

test("static reader and anonymous catalog dependency counts never imply runtime behavior", () => {
  const receipt = buildSyntheticPayrollTaxRateRuleSourceReceipt(input());
  assert.deepEqual(receipt.directRoutineLedgerReferences, { readers: 1, writers: 0 });
  assert.equal(receipt.routineReferenceStatus, "no_resolved_column_dependencies_observed_static_table_relation_only");
  assert.ok(receipt.gapCodes.includes("PAYROLL_TAX_RATE_ROUTINE_REFERENCE_SEMANTICS_PENDING"));
  assert.ok(receipt.gapCodes.includes("PAYROLL_TAX_RATE_DYNAMIC_REFERENCES_NOT_OBSERVED"));

  const referenced = evidence();
  referenced.sourceObject.fields[4].routineReferenceCount = 1;
  assert.equal(
    buildLivePayrollTaxRateRuleSourceReceipt(input(referenced)).routineReferenceStatus,
    "anonymous_column_dependency_counts_observed_dynamic_and_behavior_pending",
  );
});

test("missing table, missing field, empty table and all-null field fail to observed identity with explicit gaps", () => {
  const absentField = name => field(name, {
    exists: false,
    sqlType: null,
    maxLength: null,
    precision: null,
    scale: null,
    nullable: null,
    computed: null,
    nonNullRows: null,
  });
  const absent = evidence({ sourceObject: { schema: "dbo", table: "tax", exists: false, totalRows: null, fields: names.map(absentField) } });
  const absentReceipt = buildLivePayrollTaxRateRuleSourceReceipt(input(absent));
  assert.equal(absentReceipt.catalogDisposition, "source_table_absent");
  assert.ok(absentReceipt.gapCodes.includes("PAYROLL_TAX_RATE_SOURCE_TABLE_ABSENT"));

  const missing = evidence();
  missing.sourceObject.fields[4] = absentField("taxpercent");
  const missingReceipt = buildLivePayrollTaxRateRuleSourceReceipt(input(missing));
  assert.equal(missingReceipt.catalogDisposition, "source_fields_absent:taxpercent");
  assert.ok(missingReceipt.gapCodes.includes("PAYROLL_TAX_RATE_SOURCE_FIELDS_ABSENT"));

  const empty = evidence();
  empty.sourceObject.totalRows = 0;
  empty.sourceObject.fields = empty.sourceObject.fields.map(row => ({ ...row, nonNullRows: 0 }));
  const emptyReceipt = buildLivePayrollTaxRateRuleSourceReceipt(input(empty));
  assert.equal(emptyReceipt.catalogDisposition, "source_table_empty");
  assert.ok(emptyReceipt.gapCodes.includes("PAYROLL_TAX_RATE_SOURCE_TABLE_EMPTY_SEMANTICS_PENDING"));

  const allNull = evidence();
  allNull.sourceObject.fields[4].nonNullRows = 0;
  const allNullReceipt = buildLivePayrollTaxRateRuleSourceReceipt(input(allNull));
  assert.equal(allNullReceipt.catalogDisposition, "source_fields_all_null:taxpercent");
  assert.ok(allNullReceipt.gapCodes.includes("PAYROLL_TAX_RATE_ALL_NULL_FIELD_SEMANTICS_PENDING"));
  for (const receipt of [absentReceipt, missingReceipt, emptyReceipt, allNullReceipt]) {
    assert.equal(receipt.sourceIdentityStatus, "pending");
    assert.equal(receipt.compatibilityCredit, 0);
    assert.equal(receipt.productionImport, "HOLD");
  }
});

test("writable source or elevated authority fails before receipt construction", () => {
  rejects("PAYROLL_TAX_RATE_SOURCE_NOT_READ_ONLY", () => buildSyntheticPayrollTaxRateRuleSourceReceipt(input(evidence({ databaseReadOnly: false }))));
  for (const [key, value] of [["sysadmin", true], ["dbDatareader", false], ["viewDefinition", false], ["insert", true], ["update", true], ["delete", true], ["execute", true]]) {
    const unsafe = evidence();
    unsafe.authority[key] = value;
    rejects("PAYROLL_TAX_RATE_SOURCE_AUTHORITY_INVALID", () => buildSyntheticPayrollTaxRateRuleSourceReceipt(input(unsafe)));
  }
});

test("malformed identity, metadata, counts and order fail closed", () => {
  const wrongOrder = evidence();
  wrongOrder.sourceObject.fields.reverse();
  rejects("PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", () => buildSyntheticPayrollTaxRateRuleSourceReceipt(input(wrongOrder)));

  const blankType = evidence();
  blankType.sourceObject.fields[0].sqlType = "";
  rejects("PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", () => buildSyntheticPayrollTaxRateRuleSourceReceipt(input(blankType)));

  const overflow = evidence();
  overflow.sourceObject.fields[4].nonNullRows = 6;
  rejects("PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", () => buildSyntheticPayrollTaxRateRuleSourceReceipt(input(overflow)));

  const negativeReference = evidence();
  negativeReference.sourceObject.fields[0].routineReferenceCount = -1;
  rejects("PAYROLL_TAX_RATE_SOURCE_EVIDENCE_INVALID", () => buildSyntheticPayrollTaxRateRuleSourceReceipt(input(negativeReference)));
});

test("SQL surface is catalog-only and anonymous-count-only", () => {
  assert.match(PAYROLL_TAX_RATE_SOURCE_STATE_SQL, /OBJECT_ID\(N'dbo\.tax',N'U'\)/u);
  assert.match(PAYROLL_TAX_RATE_SOURCE_STATE_SQL, /HAS_PERMS_BY_NAME\(N'dbo\.tax','OBJECT','UPDATE'\)/u);
  assert.match(PAYROLL_TAX_RATE_FIELD_CATALOG_SQL, /sys\.columns/u);
  assert.match(PAYROLL_TAX_RATE_FIELD_CATALOG_SQL, /sys\.sql_expression_dependencies/u);
  assert.match(PAYROLL_TAX_RATE_FIELD_CATALOG_SQL, /COUNT_BIG\(DISTINCT source_routine\.object_id\)/u);
  assert.doesNotMatch(PAYROLL_TAX_RATE_FIELD_CATALOG_SQL, /sys\.sql_modules|\.definition\b|SELECT\s+(?:source_routine\.)?name\b/iu);

  const aggregates = [PAYROLL_TAX_RATE_TABLE_AGGREGATE_SQL, ...Object.values(PAYROLL_TAX_RATE_FIELD_AGGREGATE_SQL)];
  assert.equal(aggregates.length, 7);
  for (const query of aggregates) {
    assert.match(query, /SELECT CONVERT\(varchar\(30\),COUNT_BIG\(/u);
    assert.doesNotMatch(query, /\bSUM\s*\(|\bMIN\s*\(|\bMAX\s*\(|\bAVG\s*\(/iu);
  }
  const allSql = [PAYROLL_TAX_RATE_SOURCE_STATE_SQL, PAYROLL_TAX_RATE_FIELD_CATALOG_SQL, ...aggregates].join("\n");
  assert.doesNotMatch(allSql, /\bINSERT\s+INTO\b|\bUPDATE\s+dbo\.|\bDELETE\s+FROM\b|\bMERGE\s+INTO\b/iu);
  assert.doesNotMatch(allSql, /\bEXEC(?:UTE)?\s+(?:dbo\.|sp_executesql)/iu);
});

test("receipt contains no tax amount, payroll value, person identity, routine name or body", () => {
  const receipt = buildSyntheticPayrollTaxRateRuleSourceReceipt(input());
  assert.equal(receipt.routineBodiesRead, false);
  assert.equal(receipt.routineNamesReturned, false);
  assert.equal(receipt.routineBodiesReturned, false);
  assert.equal(receipt.legacyRoutineExecuted, false);
  assert.equal(receipt.legacyDynamicSqlExecuted, false);
  assert.equal(receipt.containsTaxAmounts, false);
  assert.equal(receipt.containsPayrollValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(JSON.stringify(receipt), /"(?:routineName|routineBody|taxAmount|payrollValue|personId|employeeId)"\s*:/iu);
});

test("contract drift and receipt tampering fail closed", () => {
  const drifted = structuredClone(contract);
  drifted.sourceEvidence.tableDomainMap.sha256 = sha("0");
  rejects("PAYROLL_TAX_RATE_SOURCE_EVIDENCE_DRIFT", () => buildSyntheticPayrollTaxRateRuleSourceReceipt({ ...input(), contract: drifted }));

  const receipt = buildSyntheticPayrollTaxRateRuleSourceReceipt(input());
  receipt.compatibilityCredit = 1;
  rejects("PAYROLL_TAX_RATE_SOURCE_RECEIPT_HASH_MISMATCH", () => validatePayrollTaxRateRuleSourceReceipt(receipt, { contract, repositoryRoot: root }));
});
