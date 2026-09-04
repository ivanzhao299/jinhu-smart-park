#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildPayrollUInputFormulaDslSourceReceipt,
  PayrollUInputFormulaDslSourceReceiptError,
} from "../hr-cutover/payroll-u-input-formula-dsl-source-receipt.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-payroll-u-input-formula-dsl-source-gap-v1.json");
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const build = value => buildPayrollUInputFormulaDslSourceReceipt({ contract: value, repositoryRoot: root });
const rejects = (code, action) => assert.throws(action, error => error instanceof PayrollUInputFormulaDslSourceReceiptError && error.code === code);

test("u_inputbasepay and u_inputjobpay source identities are hash-bound to modern DSL evidence without compatibility promotion", () => {
  const receipt = build(contract());
  assert.equal(receipt.sourceRoutinesObserved, 2);
  assert.equal(receipt.familiesBoundToDslSnapshot, 2);
  assert.equal(receipt.dslReferencesAllowlisted, 1);
  assert.equal(receipt.dslReferencesMissing, 1);
  assert.equal(receipt.sourceIdentitiesVerified, 0);
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 0, denominator: 2 });
  assert.deepEqual(receipt.families.map(row => row.canonicalFamily), ["u_inputbasepay", "u_inputjobpay"]);
  assert.ok(receipt.families.every(row => row.sourceIdentityStatus === "pending" && row.compatibilityCredit === 0));
  assert.deepEqual(receipt.families.map(row => row.dslReferenceStatus), ["allowlisted_identity_pending", "not_allowlisted"]);
  assert.equal(receipt.status, "SOURCE_AND_DSL_EVIDENCE_BOUND_IDENTITY_GAPS_REMAIN");
  assert.equal(receipt.decision, "KEEP_PENDING");
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("receipt is aggregate-only and never contains payroll values personal data or executable legacy SQL", () => {
  const source = readFileSync(resolve(root, "scripts/hr-cutover/payroll-u-input-formula-dsl-source-receipt.mjs"), "utf8");
  const receipt = build(contract());
  assert.equal(receipt.containsPayrollValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.equal(receipt.legacyDynamicSqlExecuted, false);
  assert.doesNotMatch(JSON.stringify(receipt), /salaryfilename|person\._base2?|employee_id|username|password|credential|token/iu);
  assert.doesNotMatch(source, /\b(?:mssql|sqlcmd|sp_executesql)\b|\b(?:insert|update|delete|merge)\s+(?:into|dbo\.|hr_)/iu);
});

test("source ledger DSL mapping parity and adapter byte drift fail closed", () => {
  for (const mutate of [
    value => { value.sourceLedger.sha256 = "0".repeat(64); },
    value => { value.modernFormulaDsl.sha256 = "0".repeat(64); },
    value => { value.families[0].mappingSha256 = "0".repeat(64); },
    value => { value.families[0].paritySha256 = "0".repeat(64); },
    value => { value.families[1].adapterSha256 = "0".repeat(64); },
  ]) {
    const drifted = contract();
    mutate(drifted);
    rejects("PAYROLL_U_INPUT_EVIDENCE_DRIFT", () => build(drifted));
  }
});

test("contract-only promotion or family omission cannot create source identity credit", () => {
  const promoted = contract();
  promoted.families[0].sourceIdentityStatus = "verified";
  promoted.families[0].compatibilityCredit = 1;
  rejects("PAYROLL_U_INPUT_GAP_CONTRACT_INVALID", () => build(promoted));

  const incomplete = contract();
  incomplete.families.pop();
  rejects("PAYROLL_U_INPUT_FAMILY_COVERAGE_INVALID", () => build(incomplete));
});

test("required modern DSL symbols and HR reference codes are closed evidence sets", () => {
  const missingSymbol = contract();
  missingSymbol.modernFormulaDsl.requiredSymbols.pop();
  rejects("PAYROLL_U_INPUT_CONTRACT_INVALID", () => build(missingSymbol));

  const missingReference = contract();
  missingReference.modernFormulaDsl.requiredHrReferenceCodes[0] = "未审核岗位字段";
  rejects("PAYROLL_U_INPUT_CONTRACT_INVALID", () => build(missingReference));

  const swappedPath = contract();
  swappedPath.families[0].adapterPath = swappedPath.families[1].adapterPath;
  swappedPath.families[0].adapterSha256 = swappedPath.families[1].adapterSha256;
  rejects("PAYROLL_U_INPUT_GAP_CONTRACT_INVALID", () => build(swappedPath));
});
