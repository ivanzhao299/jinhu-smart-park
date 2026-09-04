#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { evaluateLegacyPayrollRuleFamilyParity } from "../hr-cutover/legacy-payroll-rule-family-parity.mjs";
import { evaluateLegacyRoutineParityContract } from "../hr-cutover/legacy-routine-parity-contract.mjs";

const root=resolve(import.meta.dirname,"../..");
const bytes=path=>readFileSync(resolve(root,path));
const read=path=>bytes(path).toString("utf8");
const json=path=>JSON.parse(read(path));
const sha=path=>createHash("sha256").update(bytes(path)).digest("hex");
const fixturePath="scripts/hr-cutover/contracts/legacy-u-inputbasepay-fixture-v1.json";
const mappingPath="scripts/hr-cutover/contracts/legacy-u-inputbasepay-modern-map-v1.json";
const parityPath="scripts/hr-cutover/contracts/legacy-u-inputbasepay-parity-v1.json";
const payrollPath="scripts/hr-cutover/contracts/legacy-payroll-rule-family-parity-v1.json";
const fixture=json(fixturePath);
const mapping=json(mappingPath);
const contract=json(parityPath);

test("u_inputbasepay isolates exactly one reviewed dynamic routine family and its source identity gap",()=>{
 const ledger=json(mapping.sourceBinding.routineLedgerPath);
 assert.equal(mapping.familyScope,"single_family_only");
 assert.equal(mapping.canonicalFamily,"u_inputbasepay");
 assert.equal(mapping.historicalVariants.length,1);
 const source=ledger.routines.find(row=>row.routineId===mapping.historicalVariants[0].routineId);
 assert.equal(source.sourceName,"u_inputbasepay");
 assert.equal(source.canonicalFamily,"u_inputbasepay");
 assert.equal(source.sourceArtifactSha256,mapping.sourceBinding.sourceArtifactSha256);
 assert.deepEqual(source.readTables,["person"]);
 assert.deepEqual(source.parameters.map(row=>row.name),["salaryfilename","salaryitem","year","month"]);
 assert.equal(source.dynamicMutationStatus,"unknown_requires_review");
 assert.equal(mapping.sourceBinding.routineLedgerSha256,sha(mapping.sourceBinding.routineLedgerPath));
 assert.deepEqual(mapping.modernContract.candidateTargets,[
  "hr_employee_compensation.base_salary",
  "hr_payroll_reconciliation_input.hr:基本工资",
 ]);
 assert.equal(mapping.modernContract.dynamicSqlExecution,"FORBIDDEN");
 assert.equal(mapping.review.status,"pending");
 assert.deepEqual(mapping.review.gapCodes,[
  "PAYROLL_U_INPUTBASEPAY_SOURCE_FIELD_IDENTITY_UNPROVEN",
  "PAYROLL_U_INPUTBASEPAY_MODERN_TARGET_EQUIVALENCE_UNPROVEN",
 ]);
});

test("single-family contract remains pending while executable fixtures cover known amount semantics",()=>{
 const report=evaluateLegacyRoutineParityContract({contract,routineLedger:fixture.sourceRoutineLedger});
 assert.equal(report.status,"IN_PROGRESS");
 assert.deepEqual(
  {source:report.summary.sourceRoutines,verified:report.summary.verifiedRoutines,pending:report.summary.pendingRoutines,percent:report.summary.verifiedSemanticParityPercent},
  {source:1,verified:0,pending:1,percent:0},
 );
 assert.deepEqual(report.reasonCodes,["ROUTINE_SEMANTIC_EVIDENCE_PENDING","DYNAMIC_SQL_MUTATION_REVIEW_PENDING"]);
 assert.equal(report.productionImport,"HOLD");
 for(const id of ["positive-exact-basic-pay","rounding-at-formula-consumer","null-person-or-value","invalid-money-fails-closed","out-of-period-no-side-effect"]){
  assert.ok(fixture.cases.some(row=>row.testId===id),id);
 }
 assert.equal(fixture.dynamicSqlBodyIncluded,false);
 assert.equal(fixture.dynamicSqlExecution,"FORBIDDEN");
});

test("the unresolved source field cannot be promoted to equivalent by editing the contract",()=>{
 const promoted=structuredClone(contract);
 promoted.routines[0].parityStatus="verified";
 promoted.routines[0].semantics.dynamicSql.status="resolved";
 promoted.routines[0].semantics.dynamicSql.resolvedWriteTargets=["hr_employee_compensation.base_salary"];
 promoted.routines[0].review.status="approved";
 assert.throws(
  ()=>evaluateLegacyRoutineParityContract({contract:promoted,routineLedger:fixture.sourceRoutineLedger}),
  /DYNAMIC_SQL_SOURCE_LEDGER_UNRESOLVED/u,
 );
});

test("review evidence hashes bind the adapter fixture service and permission tests",()=>{
 const row=contract.routines[0];
 assert.equal(row.semantics.parameterMappings.evidenceSha256,sha(mappingPath));
 assert.equal(row.semantics.outputFieldMappings.evidenceSha256,sha("apps/api/src/modules/hr/hr-payroll-formula-dsl.ts"));
 assert.equal(row.semantics.readMappings.evidenceSha256,sha("apps/api/src/modules/hr/hr-payroll-history.service.ts"));
 assert.equal(row.semantics.nullSemantics.evidenceSha256,sha(fixturePath));
 assert.equal(row.testEvidence.positive[0].evidenceSha256,sha("apps/api/src/modules/hr/hr-payroll-person-base-routine-family.spec.ts"));
 assert.equal(row.testEvidence.permission[0].evidenceSha256,sha("apps/api/src/modules/hr/hr-payroll-history.contract.spec.ts"));
 assert.equal(row.review.evidenceSha256,sha(mappingPath));
});

test("modern candidate adapter and reconciliation target exist without executing legacy dynamic SQL",()=>{
 const dsl=read("apps/api/src/modules/hr/hr-payroll-formula-dsl.ts");
 const service=read("apps/api/src/modules/hr/hr-payroll-history.service.ts");
 const serialized=read(fixturePath)+read(mappingPath)+read(parityPath);
 assert.match(dsl,/projectLegacyPersonBasePayInput/);
 assert.match(service,/"hr:基本工资": String\(comp\.base_salary\)/u);
 assert.doesNotMatch(serialized,/exec\s*\(|sp_executesql|update\s+\+|select\s+person\._base/iu);
 assert.equal(mapping.productionImport,"HOLD");
});

test("global payroll denominator gives no credit until the source field identity is proven",()=>{
 const payroll=json(payrollPath);
 const report=evaluateLegacyPayrollRuleFamilyParity({
  contract:payroll,
  routineLedgerBytes:bytes(mapping.sourceBinding.routineLedgerPath),
  repositoryRoot:root,
 });
 assert.deepEqual(
  {total:report.dynamicRoutines.total,verified:report.dynamicRoutines.verified,pending:report.dynamicRoutines.pending,verifiedPercent:report.dynamicRoutines.verifiedPercent},
  {total:6,verified:0,pending:6,verifiedPercent:0},
 );
 assert.equal(report.productionImport,"HOLD");
});
