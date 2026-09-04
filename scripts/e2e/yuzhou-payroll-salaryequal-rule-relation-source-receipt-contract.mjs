import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildLivePayrollSalaryequalRuleRelationSourceReceipt,
  buildSyntheticPayrollSalaryequalRuleRelationSourceReceipt,
  PAYROLL_SALARYEQUAL_FIELD_AGGREGATE_SQL,
  PAYROLL_SALARYEQUAL_FIELD_CATALOG_SQL,
  PAYROLL_SALARYEQUAL_SOURCE_STATE_SQL,
  PAYROLL_SALARYEQUAL_TABLE_AGGREGATE_SQL,
  PayrollSalaryequalRuleRelationSourceReceiptError,
  validatePayrollSalaryequalRuleRelationSourceReceipt,
} from "../hr-cutover/payroll-salaryequal-rule-relation-source-receipt.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-payroll-salaryequal-rule-relation-source-receipt-v1.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8"));
const names = ["id", "scheme", "itemname", "expression", "cit", "myorder"];
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
  sqlType: name === "id" || name === "myorder" ? "int" : "varchar",
  maxLength: name === "id" || name === "myorder" ? 4 : 8000,
  precision: name === "id" || name === "myorder" ? 10 : 0,
  scale: 0,
  nullable: name !== "id",
  computed: false,
  nonNullRows: name === "cit" ? 3 : 5,
  routineReferenceCount: 0,
  ...overrides,
});
const evidence = (overrides = {}) => ({
  databaseReadOnly: true,
  authority: authority(),
  sourceObject: {
    schema: "dbo",
    table: "salaryequal",
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
  error => error instanceof PayrollSalaryequalRuleRelationSourceReceiptError && error.code === code,
);

test("contract binds the complete salaryequal rule relation to six reviewed payroll mappings", () => {
  assert.deepEqual(contract.sourceObject.fields.map(row => row.name), names);
  assert.equal(contract.ruleRelation.stableId, "SALARYEQUAL_RULE_RELATION_V1");
  assert.equal(contract.ruleRelation.mappingContractStatus, "verified_static_contract_only");
  for (const evidenceRow of Object.values(contract.sourceEvidence)) {
    const actual = createHash("sha256").update(readFileSync(resolve(root, evidenceRow.path))).digest("hex");
    assert.equal(actual, evidenceRow.sha256);
  }
  assert.equal(contract.compatibilityCredit, 0);
  assert.equal(contract.productionImport, "HOLD");
});

test("synthetic catalog evidence preserves types and null counts but remains pending with zero credit", () => {
  const receipt = buildSyntheticPayrollSalaryequalRuleRelationSourceReceipt(input());
  assert.equal(receipt.evidenceOrigin, "synthetic_contract_test");
  assert.equal(receipt.catalogDisposition, "source_catalog_and_non_null_presence_observed");
  assert.equal(receipt.sourceIdentityStatus, "pending");
  assert.equal(receipt.ruleRelation.mappingContractStatus, "verified_static_contract_only");
  assert.equal(receipt.ruleRelation.rowRelationParity, "pending");
  assert.equal(receipt.status, "SOURCE_IDENTITY_PENDING");
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionImport, "HOLD");
  assert.deepEqual(receipt.sourceObject.fields.map(row => row.nullRows), [0, 0, 0, 0, 2, 0]);
  assert.ok(receipt.gapCodes.includes("PAYROLL_SALARYEQUAL_SOURCE_CATALOG_PENDING"));
  assert.deepEqual(validatePayrollSalaryequalRuleRelationSourceReceipt(receipt, { contract, repositoryRoot: root }), receipt);
});

test("complete live catalog observation still cannot prove row relation parity or add credit", () => {
  const receipt = buildLivePayrollSalaryequalRuleRelationSourceReceipt(input());
  assert.equal(receipt.sourceIdentityStatus, "observed");
  assert.equal(receipt.ruleRelation.sourceIdentityStatus, "observed");
  assert.equal(receipt.ruleRelation.rowRelationParity, "pending");
  assert.equal(receipt.status, "SOURCE_CATALOG_OBSERVED_ROW_RELATION_PENDING");
  assert.equal(receipt.gapCodes.includes("PAYROLL_SALARYEQUAL_SOURCE_CATALOG_PENDING"), false);
  assert.ok(receipt.gapCodes.includes("PAYROLL_SALARYEQUAL_ROW_RELATION_PARITY_PENDING"));
  assert.ok(receipt.gapCodes.includes("PAYROLL_SALARYEQUAL_DYNAMIC_REFERENCES_NOT_OBSERVED"));
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionImport, "HOLD");
});

test("the 212-routine ledger contributes zero named direct salaryequal references without claiming runtime absence", () => {
  const receipt = buildSyntheticPayrollSalaryequalRuleRelationSourceReceipt(input());
  assert.deepEqual(receipt.directRoutineLedgerReferences, { readers: 0, writers: 0 });
  assert.equal(receipt.routineReferenceStatus, "no_resolved_catalog_dependencies_observed_dynamic_and_semantics_pending");
  assert.ok(receipt.gapCodes.includes("PAYROLL_SALARYEQUAL_ROUTINE_REFERENCE_SEMANTICS_PENDING"));
  assert.equal(contract.routineLedgerPolicy.absenceDoesNotProveNoRuntimeUsage, true);

  const referenced = evidence();
  referenced.sourceObject.fields[3].routineReferenceCount = 2;
  assert.equal(
    buildLivePayrollSalaryequalRuleRelationSourceReceipt(input(referenced)).routineReferenceStatus,
    "anonymous_catalog_dependency_counts_observed_dynamic_and_semantics_pending",
  );
});

test("missing table, missing field, empty table and all-null relationship field remain pending", () => {
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
  const absent = evidence({
    sourceObject: { schema: "dbo", table: "salaryequal", exists: false, totalRows: null, fields: names.map(absentField) },
  });
  assert.equal(buildLivePayrollSalaryequalRuleRelationSourceReceipt(input(absent)).catalogDisposition, "source_table_absent");

  const missing = evidence();
  missing.sourceObject.fields[2] = absentField("itemname");
  assert.equal(buildLivePayrollSalaryequalRuleRelationSourceReceipt(input(missing)).catalogDisposition, "source_fields_absent:itemname");

  const empty = evidence();
  empty.sourceObject.totalRows = 0;
  empty.sourceObject.fields = empty.sourceObject.fields.map(row => ({ ...row, nonNullRows: 0 }));
  assert.equal(buildLivePayrollSalaryequalRuleRelationSourceReceipt(input(empty)).catalogDisposition, "source_table_empty");

  const allNull = evidence();
  allNull.sourceObject.fields[1].nonNullRows = 0;
  const receipt = buildLivePayrollSalaryequalRuleRelationSourceReceipt(input(allNull));
  assert.equal(receipt.catalogDisposition, "source_fields_all_null:scheme");
  assert.equal(receipt.sourceIdentityStatus, "pending");
  assert.equal(receipt.compatibilityCredit, 0);
});

test("writable source or elevated authority fails before receipt construction", () => {
  rejects("PAYROLL_SALARYEQUAL_SOURCE_NOT_READ_ONLY", () => buildSyntheticPayrollSalaryequalRuleRelationSourceReceipt(input(evidence({ databaseReadOnly: false }))));
  for (const [key, value] of [["sysadmin", true], ["dbDatareader", false], ["viewDefinition", false], ["insert", true], ["update", true], ["delete", true], ["execute", true]]) {
    const unsafe = evidence();
    unsafe.authority[key] = value;
    rejects("PAYROLL_SALARYEQUAL_SOURCE_AUTHORITY_INVALID", () => buildSyntheticPayrollSalaryequalRuleRelationSourceReceipt(input(unsafe)));
  }
});

test("malformed field identity, metadata and count conservation fail closed", () => {
  const wrongOrder = evidence();
  wrongOrder.sourceObject.fields.reverse();
  rejects("PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", () => buildSyntheticPayrollSalaryequalRuleRelationSourceReceipt(input(wrongOrder)));

  const blankType = evidence();
  blankType.sourceObject.fields[0].sqlType = "";
  rejects("PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", () => buildSyntheticPayrollSalaryequalRuleRelationSourceReceipt(input(blankType)));

  const overflow = evidence();
  overflow.sourceObject.fields[4].nonNullRows = 6;
  rejects("PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", () => buildSyntheticPayrollSalaryequalRuleRelationSourceReceipt(input(overflow)));

  const negativeReference = evidence();
  negativeReference.sourceObject.fields[0].routineReferenceCount = -1;
  rejects("PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_INVALID", () => buildSyntheticPayrollSalaryequalRuleRelationSourceReceipt(input(negativeReference)));
});

test("read-only SQL returns only catalog metadata and anonymous counts", () => {
  assert.match(PAYROLL_SALARYEQUAL_SOURCE_STATE_SQL, /OBJECT_ID\(N'dbo\.salaryequal',N'U'\)/u);
  assert.match(PAYROLL_SALARYEQUAL_SOURCE_STATE_SQL, /HAS_PERMS_BY_NAME\(N'dbo\.salaryequal','OBJECT','UPDATE'\)/u);
  assert.match(PAYROLL_SALARYEQUAL_FIELD_CATALOG_SQL, /sys\.columns/u);
  assert.match(PAYROLL_SALARYEQUAL_FIELD_CATALOG_SQL, /sys\.sql_expression_dependencies/u);
  assert.match(PAYROLL_SALARYEQUAL_FIELD_CATALOG_SQL, /COUNT_BIG\(DISTINCT source_routine\.object_id\)/u);
  assert.doesNotMatch(PAYROLL_SALARYEQUAL_FIELD_CATALOG_SQL, /sys\.sql_modules|\.definition\b|SELECT\s+(?:source_routine\.)?name\b/iu);

  const aggregates = [PAYROLL_SALARYEQUAL_TABLE_AGGREGATE_SQL, ...Object.values(PAYROLL_SALARYEQUAL_FIELD_AGGREGATE_SQL)];
  assert.equal(aggregates.length, 7);
  for (const query of aggregates) {
    assert.match(query, /SELECT CONVERT\(varchar\(30\),COUNT_BIG\(/u);
    assert.doesNotMatch(query, /\bSUM\s*\(|\bMIN\s*\(|\bMAX\s*\(/iu);
  }
  const allSql = [PAYROLL_SALARYEQUAL_SOURCE_STATE_SQL, PAYROLL_SALARYEQUAL_FIELD_CATALOG_SQL, ...aggregates].join("\n");
  assert.doesNotMatch(allSql, /\bINSERT\s+INTO\b|\bUPDATE\s+dbo\.|\bDELETE\s+FROM\b|\bMERGE\s+INTO\b/iu);
  assert.doesNotMatch(allSql, /\bEXEC(?:UTE)?\s+(?:dbo\.|sp_executesql)/iu);
});

test("receipt contains no rule content, payroll values, personnel data, routine names or bodies", () => {
  const receipt = buildSyntheticPayrollSalaryequalRuleRelationSourceReceipt(input());
  assert.equal(receipt.routineBodiesRead, false);
  assert.equal(receipt.routineNamesReturned, false);
  assert.equal(receipt.routineBodiesReturned, false);
  assert.equal(receipt.legacyRoutineExecuted, false);
  assert.equal(receipt.legacyDynamicSqlExecuted, false);
  assert.equal(receipt.containsRuleExpressionContent, false);
  assert.equal(receipt.containsConditionContent, false);
  assert.equal(receipt.containsPayrollValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(JSON.stringify(receipt), /"(?:routineName|routineBody|expressionValue|conditionValue|payrollValue|personId)"\s*:/iu);
});

test("contract drift and receipt status tampering fail closed", () => {
  const drifted = structuredClone(contract);
  drifted.sourceEvidence.payrollRuleContract.sha256 = sha("0");
  rejects("PAYROLL_SALARYEQUAL_SOURCE_EVIDENCE_DRIFT", () => buildSyntheticPayrollSalaryequalRuleRelationSourceReceipt({ ...input(), contract: drifted }));

  const receipt = buildSyntheticPayrollSalaryequalRuleRelationSourceReceipt(input());
  receipt.compatibilityCredit = 1;
  rejects("PAYROLL_SALARYEQUAL_SOURCE_RECEIPT_HASH_MISMATCH", () => validatePayrollSalaryequalRuleRelationSourceReceipt(receipt, { contract, repositoryRoot: root }));
});
