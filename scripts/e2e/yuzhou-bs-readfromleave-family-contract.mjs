#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { evaluateLegacyRoutineParityContract } from "../hr-cutover/legacy-routine-parity-contract.mjs";

const root=resolve(import.meta.dirname,"../..");
const read=path=>readFileSync(resolve(root,path),"utf8");
const json=path=>JSON.parse(read(path));
const sha=path=>createHash("sha256").update(readFileSync(resolve(root,path))).digest("hex");
const fixture=json("scripts/hr-cutover/contracts/legacy-bs-readfromleave-fixture-v1.json");
const mapping=json("scripts/hr-cutover/contracts/legacy-bs-readfromleave-modern-map-v1.json");
const contract=json("scripts/hr-cutover/contracts/legacy-bs-readfromleave-parity-v1.json");
const routineLedger=json(mapping.sourceBinding.routineLedgerPath);

test("bs_readfromLeave is the only family and historical variant in this contract",()=>{
 assert.equal(mapping.familyScope,"single_family_only");
 assert.equal(mapping.canonicalFamily,"bs_readfromLeave");
 assert.deepEqual(mapping.historicalVariants.map(row=>row.sourceName),["bs_readfromLeave"]);
 assert.deepEqual(mapping.historicalVariants[0].aliasesOrBackupsInLedger,[]);
 assert.deepEqual(mapping.sourceContract.readTables,["leave","timekeeprecord"]);
 assert.deepEqual(mapping.sourceContract.writeTables,["timekeeprecord"]);
 assert.deepEqual(mapping.sourceContract.calledRoutines,[]);
 assert.equal(mapping.productionImport,"HOLD");
 assert.deepEqual(mapping.modernContract.writeTables,["hr_attendance_calculation_version","hr_employee_attendance_daily_result"]);
 assert.equal(mapping.sourceBinding.routineLedgerSha256,sha(mapping.sourceBinding.routineLedgerPath));
 const sourceRoutine=routineLedger.routines.find(row=>row.routineId===mapping.historicalVariants[0].routineId);
 assert.equal(sourceRoutine.sourceName,"bs_readfromLeave");
 assert.deepEqual(sourceRoutine.readTables.filter(table=>!mapping.sourceContract.generatedObjects.includes(table)),["leave","timekeeprecord"]);
 assert.ok(sourceRoutine.externalOrGeneratedTables.includes("cur"));
 assert.deepEqual(sourceRoutine.writeTables,["timekeeprecord"]);
 assert.equal(sourceRoutine.dynamicMutationStatus,"none");
});

test("family parity contract is complete without claiming global routine parity",()=>{
 const report=evaluateLegacyRoutineParityContract({contract,routineLedger:fixture.sourceRoutineLedger});
 assert.equal(report.status,"COMPLETE");
 assert.equal(report.summary.sourceRoutines,1);
 assert.equal(report.summary.verifiedRoutines,1);
 assert.equal(report.summary.verifiedSemanticParityPercent,100);
 assert.deepEqual(report.reasonCodes,[]);
 assert.equal(report.productionImport,"HOLD");
});

test("evidence hashes bind the approved implementation and redacted synthetic fixtures",()=>{
 const row=contract.routines[0];
 assert.equal(row.semantics.outputFieldMappings.evidenceSha256,sha("apps/api/src/modules/hr/hr-leave-routine-equivalence.ts"));
 assert.equal(row.semantics.readMappings.evidenceSha256,sha("scripts/hr-cutover/contracts/legacy-bs-readfromleave-modern-map-v1.json"));
 assert.equal(row.semantics.nullSemantics.evidenceSha256,sha("scripts/hr-cutover/contracts/legacy-bs-readfromleave-fixture-v1.json"));
 assert.equal(row.testEvidence.positive[0].evidenceSha256,sha("apps/api/src/modules/hr/hr-leave-routine-equivalence.spec.ts"));
 assert.equal(row.testEvidence.permission[0].evidenceSha256,sha("apps/api/src/modules/hr/hr-leave-routine-family.spec.ts"));
 for(const id of ["positive-multi-day","negative-invalid-range","empty-null-input","permission-fail-closed","conservation-state-gate"])assert.ok(fixture.cases.some(item=>item.testId===id));
 assert.equal(fixture.sourceDataState,"empty");
 assert.equal(fixture.emptySourceStillRequiresExecutableFixture,true);
});

test("API, service and page expose approved leave impact without a new migration",()=>{
 const service=read("apps/api/src/modules/hr/hr.service.ts");
 const api=read("apps/web/lib/hr-api.ts");
 const page=read("apps/web/app/hr/attendance/HrAttendanceClient.tsx");
 assert.match(service,/projectLeaveRoutineImpact/);
 assert.match(service,/approvedLeaveMinutesForWorkDate/);
 assert.match(service,/approvedLeaveMinutes:leaveMinutes/);
 assert.match(api,/leavePlannedMinutes:number/);
 assert.match(api,/leaveEffectiveMinutes:number/);
 assert.match(api,/leaveMinutes:number/);
 assert.match(page,/批准后预计计入/);
 assert.match(page,/已批准请假/);
 assert.equal(mapping.modernContract.permissions.requestRead.length,3);
 assert.deepEqual(mapping.modernContract.permissions.recalculate,["hr:attendance:operate"]);
});
