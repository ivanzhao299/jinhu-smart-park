#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  LegacyPerformanceQueryRoutineParityError,
  verifyLegacyPerformanceQueryRoutineParity,
} from "../hr-cutover/legacy-performance-query-routine-parity.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-performance-query-routine-parity-v1.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8"));
const verify = candidate => verifyLegacyPerformanceQueryRoutineParity({ contract: candidate, repositoryRoot: root });
const expectCode = (candidate, code) => assert.throws(
  () => verify(candidate),
  error => error instanceof LegacyPerformanceQueryRoutineParityError && error.code === code,
);

test("seven query routines remain pending and receive zero compatibility credit", () => {
  assert.deepEqual(verify(contract), {
    ok: true,
    status: "IN_PROGRESS",
    sourceRoutines: 7,
    verifiedRoutines: 0,
    pendingRoutines: 7,
    dynamicReadOnlyRoutines: 5,
    schemaDriftRoutines: 4,
    compatibilityCredit: 0,
    containsSourceRows: false,
    containsPersonalData: false,
    productionImport: "HOLD",
  });
  assert.equal(contract.routines.flatMap(row => row.parameters).length, 19);
  assert.equal(contract.routines.flatMap(row => row.outputColumns).length, 53);
});

test("legacy final-value formulas explicitly omit the displayed master adjustment", () => {
  for (const name of ["u_assessmentvalue", "u_assessmentvalueofperson"]) {
    const row = contract.routines.find(item => item.sourceName === name);
    const formula = row.calculationSemantics.find(item => item.code === "LEGACY_FINAL_EXCLUDES_MASTERVALUE");
    assert.equal(formula.expression, "itemvalue + timekeepvalue + bonusvalue");
    assert.doesNotMatch(formula.expression, /mastervalue/iu);
    assert.ok(row.outputColumns.some(column => column.sourceExpression === "assessmentmaster.mastervalue"));
    assert.ok(row.outputColumns.some(column => column.plannedModernField === "legacyLastValueWithoutMaster"));
  }
});

test("web_assquery freezes the ignored-period defect without making it the modern default", () => {
  const row = contract.routines.find(item => item.sourceName === "web_assquery");
  assert.match(row.parameters.find(parameter => parameter.name === "asssession").behavior, /ignored/iu);
  assert.deepEqual(row.legacyDynamicSql.discardedParameters, ["asssession"]);
  assert.deepEqual(row.missingSourceColumns, ["assessmentmaster.asssession"]);
  const difference = row.knownDifferences.find(item => item.code === "LEGACY_SESSION_PARAMETER_DISCARDED");
  assert.match(difference.modernDecision, /honor period/iu);
  assert.match(difference.modernDecision, /old input had no effect/iu);
});

test("dynamic SQL and current-schema drift are bounded to the reviewed routine identities", () => {
  const dynamic = contract.routines.filter(row => row.legacyDynamicSql.mode === "raw_input_concatenation");
  assert.deepEqual(dynamic.map(row => row.sourceName), [
    "u_assessmentquery",
    "u_assessmentvalue",
    "u_assessmentvalueofperson",
    "web_assessmentquery",
    "web_assquery",
  ]);
  dynamic.forEach(row => {
    assert.equal(row.legacyDynamicSql.mutation, "none");
    assert.match(row.legacyDynamicSql.risk, /injection/iu);
    assert.match(row.legacyDynamicSql.safeReplacement, /\bbind(?:s|ing|ed)?\b|\bbound\b/iu);
  });
  assert.deepEqual(
    contract.routines.filter(row => row.sourceSchemaStatus === "dormant_schema_drift").map(row => row.sourceName),
    ["u_assessmentvalue", "u_assessmentvalueofperson", "u_assessmentmaster", "web_assquery"],
  );
});

test("source-pay stays outside this query family and required scope/audit controls are explicit", () => {
  assert.equal(
    contract.routines.some(row => row.outputColumns.some(column => column.sourceExpression === "assessmentmaster.pay")),
    false,
  );
  assert.deepEqual(contract.sharedModernReplacementRequirements.map(row => row.code), [
    "TENANT_PARK_BOUND_PARAMETER",
    "SERVER_DERIVED_PERFORMANCE_SCOPE",
    "PARAMETERIZED_QUERY_ONLY",
    "GRADE_LIST_TYPED_ALLOWLIST",
    "REQUIRED_SENSITIVE_READ_AUDIT",
    "HISTORICAL_RESULT_PROJECTION",
    "SOURCE_PAY_NOT_IN_QUERY_FAMILY",
  ]);
});

test("verified status or compatibility credit cannot be asserted before implementation evidence", () => {
  const verified = structuredClone(contract);
  verified.routines[0].parityStatus = "verified";
  expectCode(verified, "PERFORMANCE_QUERY_ROUTINE_IDENTITY_INVALID");

  const credited = structuredClone(contract);
  credited.routines[0].compatibilityCredit = 1;
  expectCode(credited, "PERFORMANCE_QUERY_ROUTINE_IDENTITY_INVALID");
});

test("source binding, payroll projection, formula and ignored-period differences fail closed", () => {
  const wrongLedgerHash = structuredClone(contract);
  wrongLedgerHash.sourceBinding.routineLedgerFileSha256 = "f".repeat(64);
  expectCode(wrongLedgerHash, "PERFORMANCE_QUERY_SOURCE_LEDGER_DRIFT");

  const leakedPay = structuredClone(contract);
  leakedPay.routines[0].outputColumns[0].sourceExpression = "assessmentmaster.pay";
  expectCode(leakedPay, "PERFORMANCE_QUERY_PAY_FIELD_FORBIDDEN");

  const changedFilter = structuredClone(contract);
  changedFilter.routines[0].filters[0].sourceExpression = "assessmentmaster.asssessionid >= @asssession";
  expectCode(changedFilter, "PERFORMANCE_QUERY_SEMANTIC_CONTRACT_DRIFT");

  const changedFormula = structuredClone(contract);
  changedFormula.routines.find(row => row.sourceName === "u_assessmentvalue")
    .calculationSemantics[0].expression += " + mastervalue";
  expectCode(changedFormula, "PERFORMANCE_QUERY_SEMANTIC_CONTRACT_DRIFT");

  const restoredPeriod = structuredClone(contract);
  restoredPeriod.routines.find(row => row.sourceName === "web_assquery")
    .legacyDynamicSql.discardedParameters = [];
  expectCode(restoredPeriod, "PERFORMANCE_QUERY_SEMANTIC_CONTRACT_DRIFT");
});

test("contract contains structure and semantics only, not sensitive payload fields", () => {
  const walkKeys = value => {
    if (Array.isArray(value)) return value.flatMap(walkKeys);
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([key, child]) => [key, ...walkKeys(child)]);
  };
  assert.equal(
    walkKeys(contract).some(key => /password|credential|token|idcard|salary|payroll|photo|attachment|binary|base64/iu.test(key)),
    false,
  );
});

console.log("Yuzhou legacy performance query routine parity contract passed.");
