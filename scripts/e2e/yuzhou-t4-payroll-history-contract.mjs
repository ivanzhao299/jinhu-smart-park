#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { exactDecimal, lexicalFormulaProfile } from "../transform-yuzhou-t4-payroll-history.mjs";

const root = resolve(import.meta.dirname, "../..");
const read = (name) => readFileSync(resolve(root, name), "utf8");
const extract = read("scripts/extract-yuzhou-t4-payroll-history.sh");
const transform = read("scripts/transform-yuzhou-t4-payroll-history.mjs");
const evidence = JSON.parse(read(".trellis/tasks/08-24-yuzhou-hr-t4-payroll-history/research/source-evidence-manifest.json"));

assert.equal(evidence.payrollProfile.salaryActualRowCount, 46092);
assert.equal(evidence.payrollProfile.salaryTableCount, 35);
assert.deepEqual(evidence.payrollProfile.period, { minimumYear: 2010, maximumYear: 2026 });
assert.deepEqual([evidence.payrollProfile.itemDefinitions, evidence.payrollProfile.formulaDefinitions, evidence.payrollProfile.closeRecords, evidence.payrollProfile.schemeMemberships, evidence.payrollProfile.taxRules], [711, 244, 1431, 647, 9]);
assert.equal(Object.keys(evidence.payrollProfile.salaryRowsByTable).length, 35);
assert.equal(Object.values(evidence.payrollProfile.salaryRowsByTable).reduce((sum, value) => sum + value, 0), 46092);
assert.deepEqual(
  [evidence.productionCandidate.periodStart, evidence.productionCandidate.periodEnd, evidence.productionCandidate.candidateRows, evidence.productionCandidate.candidateLoadedRows, evidence.productionCandidate.candidateQuarantinedRows, evidence.productionCandidate.coldArchiveRows],
  ["2024-01-01", "2026-12-31", 8342, 8320, 22, 37750],
);

assert.match(extract, /source must be read-only and ETL must be non-sysadmin/);
assert.match(extract, /grep -Eiq '\^sa\$'/);
assert.match(extract, /source backup SHA-256 mismatch/);
assert.match(extract, /read-only ETL credential file must be mode 0600/);
assert.match(extract, /IS_SRVROLEMEMBER\('sysadmin'\)/);
assert.match(extract, /IS_ROLEMEMBER\('db_datareader'\)/);
assert.match(extract, /VIEW DEFINITION/);
assert.match(extract, /salary01','salary02/);
assert.match(extract, /ORDER BY HASHBYTES\(''SHA2_256''/);
assert.match(extract, /CONVERT\(varchar\(100\)/);
assert.match(extract, /chmod 600/);
assert.doesNotMatch(extract, /WHERE[^;]*(?:year|closestate|temp|employ)/i);
assert.doesNotMatch(extract, /SELECT \* /);
assert.match(extract, /YUZHOU_T4_EXTRACT_OK run_id=%s business_hash=%s/);
assert.doesNotMatch(extract, /printf[^\n]*\$\{?(?:person|name|amount)\}?/i);

assert.doesNotMatch(transform, /\beval\s*\(/);
assert.doesNotMatch(transform, /new Function|node:vm|vm\./);
assert.doesNotMatch(transform, /duplicateOrdinal|ROW_NUMBER/i);
assert.match(transform, /sourceContentGroupSha256/);
assert.match(transform, /sourceMultiplicity/);
assert.match(transform, /businessContentSha256:[^\n]+catalogSha256: rawBusiness\.catalogSha256/);
assert.match(transform, /group\.multiplicity > 1n \? "duplicate_source"/);
assert.match(transform, /Saddsum: "gross_total"/);
assert.match(transform, /itemMap\.get\(`\$\{exactInteger\(scheme, "scheme"\)\.toString\(\)\}\\0\$\{column\.columnName\}`\)/);

assert.deepEqual(exactDecimal(null), { kind: "null" });
assert.deepEqual(exactDecimal(""), { kind: "empty", raw: "" });
assert.deepEqual(exactDecimal("0"), { kind: "zero", decimal: "0.0000" });
assert.deepEqual(exactDecimal("-12.3"), { kind: "decimal", decimal: "-12.3000" });
assert.deepEqual(exactDecimal(undefined, false), { kind: "missing_column" });
assert.equal(exactDecimal("1.23456").kind, "invalid");
assert.equal(exactDecimal("99999999999999999").kind, "invalid");

assert.equal(lexicalFormulaProfile("[U101]+12.30", null).lexicalStatus, "profiled");
assert.equal(lexicalFormulaProfile("[人事系统.基本工资]+1", null).lexicalStatus, "manual_review");
assert.equal(lexicalFormulaProfile("[U101]+1", "[U102]>0").lexicalStatus, "manual_review");
assert.equal(lexicalFormulaProfile("1; DROP TABLE salary01", null).lexicalStatus, "rejected");

const scratch = mkdtempSync(resolve(tmpdir(), "jinhu-t4-contract-"));
try {
  mkdirSync(resolve(scratch, "raw-payslips"));
  writeFileSync(resolve(scratch, "sensitive.fixture"), "fixture-only", { mode: 0o600 });
  assert.ok((readFileSync(resolve(scratch, "sensitive.fixture")).length > 0));
} finally { rmSync(scratch, { recursive: true, force: true }); }

console.log("Yuzhou T4 payroll history extract/transform contract passed.");
